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
import { currentViewer } from "./viewer";

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
 * not. Everything else is `refused`, one answer for "not yours", "not ended"
 * and "not next", because the screen only ever offers the day that can close.
 */
export type CloseDayOutcome =
  | "idle"
  | "done"
  | "alreadyClosed"
  | "reasonRequired"
  | "reasonTooShort"
  | "reasonTooLong"
  | "refused";

export async function closeBusinessDay(
  _previous: CloseDayOutcome,
  form: FormData,
): Promise<CloseDayOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return "refused";

  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return "refused";
  const propertyId = String(form.get("property") ?? "");
  const businessDate = String(form.get("day") ?? "");

  // Trimmed, because that is what the module stores and measures. An empty
  // field is no reason, which a day with nothing open does not need.
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length > 0 && reason.length < CLOSE_REASON.min) {
    return "reasonTooShort";
  }
  if (reason.length > CLOSE_REASON.max) return "reasonTooLong";

  try {
    await getComposition().businessDay.closeDay(
      viewer.userId,
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
    if (error instanceof DayAlreadyClosedError) return "alreadyClosed";
    if (error instanceof CloseReasonRequiredError) {
      revalidatePath(`/${locale}/close-day`);
      return "reasonRequired";
    }
    if (
      !(error instanceof BusinessDayCloseError) &&
      !(error instanceof CloseInputError)
    ) {
      // Not a refusal the module raised: a lost connection, a schema that
      // moved, a defect. Shown as one — there is nothing else to show — but
      // never quietly. `console.error` is the whole of the workspace's
      // observability today, as it is for every other command here.
      console.error(
        "closing a business day failed unexpectedly",
        { propertyId, businessDate },
        error,
      );
    }
    return "refused";
  }

  revalidatePath(`/${locale}/close-day`);
  return "done";
}
