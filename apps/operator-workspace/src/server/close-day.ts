"use server";

import { revalidatePath } from "next/cache";
import { isSupportedLocale } from "@ranza/i18n";
import {
  BusinessDayCloseError,
  CLOSE_REASON,
  CloseInputError,
  CloseReasonRequiredError,
  DayAlreadyClosedError,
} from "@ranza/business-day";
import { getComposition } from "./composition";
import { requireViewer } from "./viewer";

/**
 * Closing a business day, from the Close the day screen (ADR 0034).
 *
 * The same funnel as every other write here (ADR 0007): the session is resolved
 * here and the module asks for the close. Whether this viewer may close this
 * day, whether the day has ended and whether it is next in line are the
 * database's answers; nothing on this path asks first.
 */

/**
 * What the dialog shows afterwards.
 *
 * `alreadyClosed` is its own because it is the common race — another desk, or
 * the worker a minute after the cutoff — and it is not a failure: the day is
 * closed, which is what the desk wanted. `reasonRequired` means items were open
 * and the form sent no reason, which the dialog prevents and a stale page does
 * not. `partial` is a run of closes that stopped part way: the days before it
 * are closed. `failed` is a fault, recorded, with nothing changed. Everything
 * else is `refused`, one answer for "not yours", "not ended" and "not next",
 * because the screen only ever offers the day that can close.
 */
export type CloseDayOutcome =
  | "idle"
  | "done"
  | "alreadyClosed"
  | "reasonRequired"
  | "reasonTooShort"
  | "reasonTooLong"
  | "partial"
  | "failed"
  | "refused";

/**
 * Matched by class and by name: a class imported through a second copy of the
 * module in the server bundle is a different constructor, and a close made
 * behind the desk's back would then read as an unexpected failure instead of
 * as the day being closed.
 */
function is<T extends Error>(
  error: unknown,
  type: new (...args: never[]) => T,
): error is T {
  return (
    error instanceof type ||
    (error instanceof Error && error.name === type.name)
  );
}

/** The reason as the module stores and measures it, or the outcome that refuses it. */
function measuredReason(
  form: FormData,
): { reason: string } | { refusal: CloseDayOutcome } {
  // Trimmed, because that is what the module stores and measures. An empty
  // field is no reason, which a day with nothing open does not need.
  const reason = String(form.get("reason") ?? "").trim();
  // Characters, as the module and the table count them.
  const length = [...reason].length;
  if (length > 0 && length < CLOSE_REASON.min) {
    return { refusal: "reasonTooShort" };
  }
  if (length > CLOSE_REASON.max) return { refusal: "reasonTooLong" };
  return { reason };
}

/** One close, and the outcome the dialog shows for it. */
async function closeOne(
  userId: string,
  locale: string,
  propertyId: string,
  businessDate: string,
  reason: string,
): Promise<CloseDayOutcome> {
  try {
    await getComposition().businessDay.closeDay(
      userId,
      propertyId,
      businessDate,
      reason.length > 0 ? reason : null,
    );
  } catch (error) {
    // A refusal means the screen is stale — another desk or the worker closed
    // the day, an item reappeared, the cutoff moved the day on — and it is
    // refreshed either way, at one of two moments. An item that reappeared is
    // refreshed now: the dialog stays, because the day is the same, and gains
    // the reason field it needs. The other two change which day is waiting, so
    // refreshing now would take the dialog, and the message saying why, away
    // with it; the dialog refreshes the screen when it is dismissed instead.
    if (is(error, DayAlreadyClosedError)) return "alreadyClosed";
    if (is(error, CloseReasonRequiredError)) {
      revalidatePath(`/${locale}/close-day`);
      return "reasonRequired";
    }
    if (!is(error, BusinessDayCloseError) && !is(error, CloseInputError)) {
      // Not a refusal the module raised: a lost connection, a schema that
      // moved, a defect. Said as a fault — nothing was changed — and never
      // quietly. `console.error` is the whole of the workspace's
      // observability today, as it is for every other command here.
      console.error(
        "closing a business day failed unexpectedly",
        { propertyId, businessDate },
        error,
      );
      return "failed";
    }
    return "refused";
  }
  return "done";
}

export async function closeBusinessDay(
  _previous: CloseDayOutcome,
  form: FormData,
): Promise<CloseDayOutcome> {
  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return "failed";
  // A session that ended while the dialog stood open goes to sign-in. Answered
  // as `refused` it read as the day being unclosable, which it is not.
  const viewer = await requireViewer(locale);
  const measured = measuredReason(form);
  if ("refusal" in measured) return measured.refusal;

  const outcome = await closeOne(
    viewer.userId,
    locale,
    String(form.get("property") ?? ""),
    String(form.get("day") ?? ""),
    measured.reason,
  );
  if (outcome === "done") revalidatePath(`/${locale}/close-day`);
  return outcome;
}

/**
 * Closing every waiting day with one reason, for a backlog the same items hold
 * open on every day (CLOSE-01).
 *
 * Still one close per day, each its own transaction with its own record and its
 * own charge of the night, in order, oldest first (ADR 0034): this only carries
 * a reason across so that nobody types the same sentence once per day. It is
 * offered, and accepted, only while every waiting day is held by the same items
 * — a day held by something the others are not needs its own reason — and the
 * screen it was offered on is read again here, because the days may have moved
 * since. A close that fails stops the run; the days before it stay closed, and
 * the answer says so.
 */
export async function closeWaitingDays(
  _previous: CloseDayOutcome,
  form: FormData,
): Promise<CloseDayOutcome> {
  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return "failed";
  const viewer = await requireViewer(locale);
  const measured = measuredReason(form);
  if ("refusal" in measured) return measured.refusal;

  const propertyId = String(form.get("property") ?? "");
  const oldest = String(form.get("day") ?? "");
  const screen = await getComposition().businessDay.getCloseTheDay(
    viewer.userId,
    propertyId,
  );
  const first = screen?.waitingDays[0];
  const last = screen?.waitingDays.at(-1);
  if (!screen || !first || !last || first.date !== oldest) return "refused";
  // Items only accumulate, so the same count on the first and the last day is
  // the same items on every day between.
  if (first.openItems !== last.openItems) return "refused";
  if (first.openItems > 0 && measured.reason.length === 0) {
    return "reasonRequired";
  }

  for (const [index, day] of screen.waitingDays.entries()) {
    const outcome = await closeOne(
      viewer.userId,
      locale,
      propertyId,
      day.date,
      measured.reason,
    );
    if (outcome !== "done") {
      revalidatePath(`/${locale}/close-day`);
      return index === 0 ? outcome : "partial";
    }
  }

  revalidatePath(`/${locale}/close-day`);
  return "done";
}
