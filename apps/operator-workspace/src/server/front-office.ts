"use server";

import { revalidatePath } from "next/cache";
import { isSupportedLocale } from "@ranza/i18n";
import { UnitUnavailableError } from "@ranza/reservations";
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
