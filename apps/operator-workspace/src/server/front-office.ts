"use server";

import { revalidatePath } from "next/cache";
import { isSupportedLocale } from "@ranza/i18n";
import { GuestDetailsError } from "@ranza/guests";
import {
  BALANCE_REASON,
  BalanceReasonError,
  CheckInError,
  CheckOutError,
  EarlyDepartureError,
  FolioChangedError,
  ReservationPeriodError,
  REVERSAL_REASON,
  UnitNotInServiceError,
  UnitHasOccupantError,
  UnitUnavailableError,
  type ReservationStayType,
} from "@ranza/reservations";
import { getComposition } from "./composition";
import { undoOutcomeFor, type ReverseCheckInOutcome } from "./undo-outcome";
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
 * `refused` covers every reason the check-in did not happen except the three
 * a front desk can act on — the nights are taken, somebody is still in the
 * room, the room is blocked: out of reach, cancelled, already arrived, gone.
 * They are one outcome on purpose, because telling them apart would confirm
 * that a Reservation the viewer cannot see exists.
 */
export type CheckInOutcome =
  "idle" | "done" | "unavailable" | "occupied" | "notInService" | "refused";

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
  revalidatePath(`/${locale}/reservations`);
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
    if (error instanceof UnitUnavailableError) return "unavailable";
    if (error instanceof UnitHasOccupantError) return "occupied";
    if (error instanceof UnitNotInServiceError) return "notInService";
    // A refusal this module raised is the answer, not an incident. Anything
    // else — a lost connection, a schema that moved — is shown the same way and
    // recorded, like the other commands on this screen.
    if (!(error instanceof CheckInError)) {
      console.error(
        "checkInReservation failed unexpectedly",
        { reservationId },
        error,
      );
    }
    return "refused";
  }

  revalidateFrontDesk(locale);
  return "done";
}

/**
 * What the check-out dialog shows afterwards.
 *
 * `refused` covers every reason the Stay could not be ended — out of reach,
 * already departed, gone — as one outcome, because telling them apart would
 * confirm that a Stay the viewer cannot see exists. The rest are about the
 * review the desk is looking at, which the viewer already holds: the bill
 * changed, the early departure was not acknowledged, or the balance needs a
 * reason, or one of the right length.
 */
export type CheckOutOutcome =
  | "idle"
  | "done"
  | "folioChanged"
  | "earlyNotAcknowledged"
  | "balanceReasonRequired"
  | "reasonTooShort"
  | "reasonTooLong"
  | "refused";

/**
 * The line count the review showed, as the form carried it. Empty is "there
 * was no Folio"; anything that is not a whole number is not a review this
 * screen produced.
 */
function folioVersion(
  value: FormDataEntryValue | null,
): number | null | undefined {
  const text = String(value ?? "");
  if (text === "") return null;
  return /^\d+$/.test(text) ? Number(text) : undefined;
}

/**
 * Checking a Guest out, from the review of their bill (CO-S1-12).
 *
 * The same funnel and the same absence of an application check as every other
 * write here. The reason's bounds are measured here as well as in the module,
 * for the reason `reverseCheckIn` gives: so the screen can say which way it
 * missed rather than blaming the Stay.
 */
export async function checkOutStay(
  _previous: CheckOutOutcome,
  form: FormData,
): Promise<CheckOutOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return "refused";

  const stayId = String(form.get("stay") ?? "");
  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return "refused";

  const version = folioVersion(form.get("folioVersion"));
  if (version === undefined) return "refused";

  const reason = String(form.get("balanceReason") ?? "").trim();
  if (reason.length > 0 && reason.length < BALANCE_REASON.min) {
    return "reasonTooShort";
  }
  if (reason.length > BALANCE_REASON.max) return "reasonTooLong";

  try {
    await getComposition().reservations.checkOut(viewer.userId, stayId, {
      folioVersion: version,
      earlyDeparture: form.get("earlyDeparture") === "yes",
      balanceReason: reason.length > 0 ? reason : null,
    });
  } catch (error) {
    if (error instanceof FolioChangedError) return "folioChanged";
    if (error instanceof EarlyDepartureError) return "earlyNotAcknowledged";
    if (error instanceof BalanceReasonError) return "balanceReasonRequired";
    // A refusal this module raised is the answer, not an incident. Anything
    // else is shown the same way and recorded.
    if (!(error instanceof CheckOutError)) {
      console.error("checkOutStay failed unexpectedly", { stayId }, error);
    }
    return "refused";
  }

  revalidateFrontDesk(locale);
  return "done";
}

export type { ReverseCheckInOutcome };

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
    const outcome = undoOutcomeFor(error);
    if (outcome) return outcome;

    // Not a refusal this module raised: a lost connection, a schema that moved,
    // a defect here. Reported as one — there is nothing else to show a front
    // desk, and retrying is the right instinct for most of them — but never
    // quietly. `console.error` is the whole of the workspace's observability
    // today; when there is a real one, this is one of the lines that moves.
    console.error("reverseCheckIn failed unexpectedly", { stayId }, error);
    return "refused";
  }

  revalidateFrontDesk(locale);
  return "done";
}

/**
 * What the booking form shows afterwards.
 *
 * Three of these name a field the person filling it in can fix — the dates, the
 * Guest's details, the Unit being taken — and `refused` is everything else. That
 * split is the same one the module makes and for the same reason: a refusal that
 * hides whether a row exists must not be told apart from one that does not,
 * while a length somebody typed is theirs to correct.
 */
export type CreateReservationOutcome =
  | "idle"
  | "done"
  | "unavailable"
  | "occupied"
  | "invalidPeriod"
  | "invalidGuest"
  | "refused";

/** Only the two the database will accept; anything else is not a stay type. */
function stayType(value: unknown): ReservationStayType | null {
  return value === "guest" || value === "resident" ? value : null;
}

/** An empty optional field is absent, not an empty string. */
function optional(form: FormData, field: string): string | null {
  const value = String(form.get(field) ?? "").trim();
  return value.length > 0 ? value : null;
}

/**
 * Taking a booking, from the Reservations screen.
 *
 * The same funnel as every other write here (ADR 0007), and the same absence of
 * an application check: whether this viewer may book this Unit is decided by
 * `app.can_use_capability` inside the module's statements and by the insert
 * policies, and whether those nights are free is decided by
 * `reservations_no_double_booking`. Nothing on this path asks either question.
 *
 * What it does do is read the form, which is the one job that belongs here.
 */
export async function createReservation(
  _previous: CreateReservationOutcome,
  form: FormData,
): Promise<CreateReservationOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return "refused";

  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return "refused";

  const propertyId = String(form.get("property") ?? "");
  const accommodationUnitId = String(form.get("unit") ?? "");
  const type = stayType(form.get("stayType"));
  const guestName = String(form.get("guestName") ?? "").trim();
  const startsOn = String(form.get("startsOn") ?? "");

  // A select with no valid option chosen, or a field the browser let through.
  // `refused` rather than a named field: these are not states a person reaches
  // by typing, so naming one would explain the form to somebody bypassing it.
  if (!propertyId || !accommodationUnitId || !type) return "refused";
  if (guestName.length === 0) return "invalidGuest";

  try {
    await getComposition().reservations.createReservation(viewer.userId, {
      propertyId,
      accommodationUnitId,
      guestName,
      guestEmail: optional(form, "guestEmail"),
      guestPhone: optional(form, "guestPhone"),
      stayType: type,
      startsOn,
      endsOn: optional(form, "endsOn"),
    });
  } catch (error) {
    if (error instanceof UnitUnavailableError) return "unavailable";
    if (error instanceof UnitHasOccupantError) return "occupied";
    if (error instanceof ReservationPeriodError) return "invalidPeriod";
    if (error instanceof GuestDetailsError) return "invalidGuest";

    // Every refusal this slice raises is named above, so anything left is a
    // lost connection, a schema that moved, or a defect here. Reported as
    // "refused" because there is nothing else to show a front desk, but never
    // quietly — the same line as `reverseCheckIn` above it.
    console.error("createReservation failed unexpectedly", error);
    return "refused";
  }

  revalidateFrontDesk(locale);
  return "done";
}
