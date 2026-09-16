"use server";

import { revalidatePath } from "next/cache";
import { isSupportedLocale } from "@ranza/i18n";
import {
  REVERSAL_REASON,
  StayHasChargesError,
  UnitUnavailableError,
} from "@ranza/reservations";
import { getComposition } from "./composition";
import { currentViewer } from "./viewer";

/**
 * Checking a Guest in, from the Front Office screen.
 *
 * The product's first write from a browser, and it goes through the same funnel
 * as every read (ADR 0007): the session is resolved here, and the module runs
 * the work inside a request context. Nothing on this path asks whether the
 * viewer is allowed to do it — the row-level policies answer that, and an
 * application check in front of them would be the weaker of the two.
 */

/**
 * What the form shows afterwards.
 *
 * `refused` covers every reason the check-in did not happen except the Unit
 * being taken: out of reach, cancelled, already arrived, gone. They are one
 * outcome on purpose, because telling them apart would confirm that a
 * Reservation the viewer cannot see exists.
 */
export type CheckInOutcome = "idle" | "done" | "unavailable" | "refused";

/**
 * Both screens, after either action.
 *
 * A check-in moves a Reservation and creates a Stay that may be due to leave
 * today; a check-out ends a Stay and frees a Unit the arrivals list depends on.
 * Working out which of the two is stale is more effort than revalidating both,
 * and gets it wrong the first time somebody adds a column.
 */
function revalidateFrontDesk(locale: string): void {
  revalidatePath(`/${locale}/arrivals`);
  revalidatePath(`/${locale}/departures`);
}

export async function checkInReservation(
  _previous: CheckInOutcome,
  form: FormData,
): Promise<CheckInOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return "refused";

  const reservationId = String(form.get("reservation") ?? "");
  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return "refused";

  try {
    await getComposition().reservations.checkIn(viewer.userId, reservationId);
  } catch (error) {
    return error instanceof UnitUnavailableError ? "unavailable" : "refused";
  }

  revalidateFrontDesk(locale);
  return "done";
}

/**
 * Checking a Guest out.
 *
 * `refused` covers every reason it did not happen — out of reach, already
 * departed, gone. One outcome, because telling them apart would confirm that a
 * Stay the viewer cannot see exists.
 */
export async function checkOutStay(
  _previous: CheckInOutcome,
  form: FormData,
): Promise<CheckInOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return "refused";

  const stayId = String(form.get("stay") ?? "");
  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return "refused";

  try {
    await getComposition().reservations.checkOut(viewer.userId, stayId);
  } catch {
    return "refused";
  }

  revalidateFrontDesk(locale);
  return "done";
}

/**
 * What withdrawing a check-in can come back as.
 *
 * `charges` is the one refusal a front desk can act on, and it is separate for
 * that reason alone: everything else a withdrawal can fail on — out of reach,
 * already departed, already withdrawn, never happened, no session — is
 * `refused`, because telling them apart would confirm that a Stay the viewer
 * cannot see is there (ADR 0022).
 *
 * The two reason outcomes are about the field rather than the Stay, and saying
 * "that cannot be withdrawn" to somebody who typed two characters would send
 * them looking for a problem with the Guest.
 */
export type ReverseCheckInOutcome =
  "idle" | "done" | "charges" | "reasonTooShort" | "reasonTooLong" | "refused";

/**
 * Withdrawing a check-in that should not have happened (ADR 0022).
 *
 * Same funnel as everything else here, and the same absence of an application
 * check: whether this viewer may withdraw this Stay is decided by the policy on
 * `stays`, and whether it may be withdrawn at all is decided by the trigger
 * that refuses one carrying charges — a claim about money, made in the database
 * where an application defect cannot skip it.
 *
 * The reason is measured here as well as in the module. Not a second rule: the
 * bounds are the module's own, published so this can tell somebody which way
 * they missed. Without it both lengths arrive as the module's generic refusal
 * and the screen says the Stay is the problem.
 */
export async function reverseCheckIn(
  _previous: ReverseCheckInOutcome,
  form: FormData,
): Promise<ReverseCheckInOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return "refused";

  const stayId = String(form.get("stay") ?? "");
  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return "refused";

  // Trimmed, because that is what the module stores and therefore what it
  // measures. A field of spaces is a field nobody filled in.
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < REVERSAL_REASON.min) return "reasonTooShort";
  if (reason.length > REVERSAL_REASON.max) return "reasonTooLong";

  try {
    await getComposition().reservations.reverseCheckIn(
      viewer.userId,
      stayId,
      reason,
    );
  } catch (error) {
    return error instanceof StayHasChargesError ? "charges" : "refused";
  }

  revalidateFrontDesk(locale);
  return "done";
}
