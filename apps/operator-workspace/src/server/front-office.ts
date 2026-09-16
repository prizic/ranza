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

  // The arrivals list is now stale in two ways — a status moved, and the Unit
  // stopped being free. Revalidating the route is cheaper than reasoning about
  // which of them a given screen is showing.
  revalidatePath(`/${locale}/front-office`);
  return "done";
}
