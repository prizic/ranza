"use server";

import { revalidatePath } from "next/cache";
import { isSupportedLocale } from "@ranza/i18n";
import { GuestDetailsError } from "@ranza/guests";
import {
  BALANCE_REASON,
  BalanceReasonError,
  BookingChangedError,
  BookingChangeError,
  CANCELLATION_REASON,
  ChangeNoteError,
  MOVE_REASONS,
  type MoveReason,
  CheckInError,
  CheckInTooEarlyError,
  CheckOutError,
  EarlyDepartureError,
  FolioChangedError,
  ReservationEndError,
  ReservationPeriodError,
  ReservationReasonError,
  REVERSAL_REASON,
  PriceChangedError,
  ReservationRefusedError,
  UnitHasOccupantError,
  UnitNotInServiceError,
  UnitNotReadyError,
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
 *
 * `notReady` is not a refusal: housekeeping says the room is dirty, nothing was
 * written, and the desk is asked whether to check in anyway (HK-S2-14).
 *
 * `notInService` is: the room is blocked or out of order, and the desk returns
 * it to service or moves the booking first (MT-S2-29).
 *
 * `tooEarly` is a booking the viewer could check in whose first night has not
 * come: before the cutoff the business date is still yesterday's (CI-S1-07).
 */
export type CheckInOutcome =
  | "idle"
  | "done"
  | "unavailable"
  | "occupied"
  | "notInService"
  | "notReady"
  | "tooEarly"
  | "refused";

function isNotReady(error: unknown): error is UnitNotReadyError {
  return (
    error instanceof UnitNotReadyError ||
    (error instanceof Error && error.name === "UnitNotReadyError")
  );
}

/**
 * Every front-desk screen, after any of these actions.
 *
 * A check-in moves a Reservation and creates a Stay that may be due to leave
 * today; a check-out ends a Stay and frees a Unit the arrivals list depends on;
 * any of them, and a no-show or a cancellation, resolves an item Close the day
 * lists as open. Working out which screen is stale is more effort than
 * revalidating them all, and gets it wrong the first time somebody adds a
 * column.
 */
function revalidateFrontDesk(locale: string): void {
  revalidatePath(`/${locale}/arrivals`);
  revalidatePath(`/${locale}/departures`);
  revalidatePath(`/${locale}/reservations`);
  revalidatePath(`/${locale}/housekeeping`);
  revalidatePath(`/${locale}/close-day`);
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

  // The second press, after the warning: the submit button that says
  // "check in anyway" carries this, and nothing else does.
  const readinessAcknowledged = form.get("acknowledge") === "true";

  try {
    await getComposition().reservations.checkIn(viewer.userId, reservationId, {
      readinessAcknowledged,
    });
  } catch (error) {
    if (isNotReady(error)) return "notReady";
    if (error instanceof UnitUnavailableError) return "unavailable";
    if (error instanceof UnitHasOccupantError) return "occupied";
    if (error instanceof UnitNotInServiceError) return "notInService";
    if (error instanceof CheckInTooEarlyError) return "tooEarly";
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
 * A count or an amount of minor units the review carried, as a whole number;
 * undefined when the form is not one this screen sent — a stale dialog from
 * before nights were charged at check-out sends neither, and is refused.
 */
function wholeNumber(value: FormDataEntryValue | null): number | undefined {
  const text = String(value ?? "");
  return /^\d{1,15}$/.test(text) ? Number(text) : undefined;
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
  // The nights the review said check-out would charge (ADR 0038).
  const pendingNights = wholeNumber(form.get("pendingNights"));
  const pendingMinor = wholeNumber(form.get("pendingMinor"));
  if (pendingNights === undefined || pendingMinor === undefined) {
    return "refused";
  }

  const reason = String(form.get("balanceReason") ?? "").trim();
  if (reason.length > 0 && reason.length < BALANCE_REASON.min) {
    return "reasonTooShort";
  }
  if (reason.length > BALANCE_REASON.max) return "reasonTooLong";

  try {
    await getComposition().reservations.checkOut(viewer.userId, stayId, {
      folioVersion: version,
      pendingNights,
      pendingMinor,
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
  | "priceChanged"
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

  // What the dialog quoted, both empty for "no price" (ADR 0038). A form this
  // screen did not send — no quote at all, or a malformed one — is refused.
  const quotedRate = String(form.get("quotedRateMinor") ?? "");
  const quotedCurrency = String(form.get("quotedCurrency") ?? "");
  if (!form.has("quotedRateMinor") || !form.has("quotedCurrency")) {
    return "refused";
  }
  if (
    !(quotedRate === "" && quotedCurrency === "") &&
    !(/^\d{1,15}$/.test(quotedRate) && /^[A-Z]{3}$/.test(quotedCurrency))
  ) {
    return "refused";
  }

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
      quotedRateMinor: quotedRate === "" ? null : Number(quotedRate),
      quotedCurrency: quotedCurrency === "" ? null : quotedCurrency,
    });
  } catch (error) {
    if (error instanceof UnitUnavailableError) return "unavailable";
    if (error instanceof UnitHasOccupantError) return "occupied";
    if (error instanceof ReservationPeriodError) return "invalidPeriod";
    if (error instanceof GuestDetailsError) return "invalidGuest";
    // The dialog is read again with the price that stands now.
    if (error instanceof PriceChangedError) {
      revalidateFrontDesk(locale);
      return "priceChanged";
    }
    // Out of reach, unentitled, out of service: the module's own answer, not
    // an incident (RG-S3-09).
    if (error instanceof ReservationRefusedError) return "refused";

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

/**
 * What cancelling a booking, or marking a no-show, shows afterwards.
 *
 * `refused` is every reason the booking could not be ended — already arrived,
 * already ended, out of reach — as one outcome, for the reason every other
 * refusal here is one. The reason's length is the viewer's own to correct.
 */
export type EndBookingOutcome =
  "idle" | "done" | "reasonTooShort" | "reasonTooLong" | "refused";

async function endBooking(
  form: FormData,
  run: (userId: string, reservationId: string) => Promise<unknown>,
): Promise<EndBookingOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return "refused";

  const reservationId = String(form.get("reservation") ?? "");
  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return "refused";

  try {
    await run(viewer.userId, reservationId);
  } catch (error) {
    // Out of the module's bounds either way. cancelBooking has already
    // measured both, so reaching this means the two copies of the bounds
    // disagree — and "too short" is the likelier of the two.
    if (error instanceof ReservationReasonError) return "reasonTooShort";
    if (!(error instanceof ReservationEndError)) {
      console.error(
        "ending a booking failed unexpectedly",
        { reservationId },
        error,
      );
    }
    return "refused";
  }

  revalidateFrontDesk(locale);
  return "done";
}

/** Cancelling a booking, with a reason (blueprint 4.4). */
export async function cancelBooking(
  _previous: EndBookingOutcome,
  form: FormData,
): Promise<EndBookingOutcome> {
  // Trimmed, because that is what the module stores and therefore measures.
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < CANCELLATION_REASON.min) return "reasonTooShort";
  if (reason.length > CANCELLATION_REASON.max) return "reasonTooLong";
  return endBooking(form, (userId, reservationId) =>
    getComposition().reservations.cancelReservation(
      userId,
      reservationId,
      reason,
    ),
  );
}

/**
 * What saving a changed booking shows afterwards (amend-booking slice 1).
 *
 * `unavailable`, `occupied` and `notInService` are the Unit's answers the desk
 * can act on by choosing another; `changed` and `priceChanged` re-read the
 * dialog; `refused` is every reason the booking is not the viewer's to change.
 */
export type ChangeBookingOutcome =
  | "idle"
  | "done"
  | "unavailable"
  | "occupied"
  | "notInService"
  | "invalidPeriod"
  | "invalidNote"
  | "priceChanged"
  | "changed"
  | "refused";

/**
 * Changing a booking that has not arrived: its nights, its Unit, or both.
 *
 * The same funnel as every write here, and the same absence of a check: the
 * command asks for the gates and `front_desk.amend` itself (ADR 0039). What
 * this does is read the form, including the version and quote the dialog was
 * shown, which travel back so that a booking somebody else just changed, or a
 * price that moved, refuses the save rather than being overwritten.
 */
export async function changeBooking(
  _previous: ChangeBookingOutcome,
  form: FormData,
): Promise<ChangeBookingOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return "refused";

  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return "refused";

  const reservationId = String(form.get("reservation") ?? "");
  const accommodationUnitId = String(form.get("unit") ?? "");
  const version = Number(form.get("version"));
  const quotedRate = String(form.get("quotedRateMinor") ?? "");
  const quotedCurrency = String(form.get("quotedCurrency") ?? "");
  if (
    !reservationId ||
    !accommodationUnitId ||
    !Number.isInteger(version) ||
    version < 0 ||
    !form.has("quotedRateMinor") ||
    !form.has("quotedCurrency")
  ) {
    return "refused";
  }
  if (
    !(quotedRate === "" && quotedCurrency === "") &&
    !(/^\d{1,15}$/.test(quotedRate) && /^[A-Z]{3}$/.test(quotedCurrency))
  ) {
    return "refused";
  }
  const note = String(form.get("note") ?? "").trim();
  // Characters, not UTF-16 units, as the module and the audit record count.
  const noteLength = [...note].length;
  if (noteLength > 0 && (noteLength < 3 || noteLength > 500)) {
    return "invalidNote";
  }

  try {
    await getComposition().reservations.amendBooking(viewer.userId, {
      reservationId,
      startsOn: String(form.get("startsOn") ?? ""),
      endsOn: optional(form, "endsOn"),
      accommodationUnitId,
      version,
      quotedRateMinor: quotedRate === "" ? null : Number(quotedRate),
      quotedCurrency: quotedCurrency === "" ? null : quotedCurrency,
      note: note.length === 0 ? null : note,
    });
  } catch (error) {
    if (error instanceof UnitUnavailableError) return "unavailable";
    if (error instanceof UnitHasOccupantError) return "occupied";
    if (error instanceof UnitNotInServiceError) return "notInService";
    if (error instanceof ReservationPeriodError) return "invalidPeriod";
    if (error instanceof PriceChangedError) return "priceChanged";
    if (error instanceof ChangeNoteError) return "invalidNote";
    if (error instanceof BookingChangedError) {
      revalidateFrontDesk(locale);
      return "changed";
    }
    if (error instanceof BookingChangeError) return "refused";
    console.error(
      "changeBooking failed unexpectedly",
      { reservationId },
      error,
    );
    return "refused";
  }

  revalidateFrontDesk(locale);
  return "done";
}

/**
 * What saving a changed departure shows afterwards (amend-booking slice 2).
 * `occupied` is a booking holding a night the extension would add; the rest
 * mean what they mean for a changed booking.
 */
export type ChangeDepartureOutcome =
  | "idle"
  | "done"
  | "occupied"
  | "invalidPeriod"
  | "invalidNote"
  | "changed"
  | "refused";

/**
 * Extending or shortening an in-house Guest's Stay, or giving an open-ended
 * one an end. The command checks the caller and the dates (ADR 0039); this
 * reads the form, with the version the dialog was shown.
 */
export async function changeDeparture(
  _previous: ChangeDepartureOutcome,
  form: FormData,
): Promise<ChangeDepartureOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return "refused";

  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return "refused";

  const stayId = String(form.get("stay") ?? "");
  const version = Number(form.get("version"));
  if (
    !stayId ||
    !form.has("version") ||
    !Number.isInteger(version) ||
    version < 0
  ) {
    return "refused";
  }
  const note = String(form.get("note") ?? "").trim();
  const noteLength = [...note].length;
  if (noteLength > 0 && (noteLength < 3 || noteLength > 500)) {
    return "invalidNote";
  }

  try {
    await getComposition().reservations.changeDeparture(viewer.userId, {
      stayId,
      endsOn: optional(form, "endsOn"),
      version,
      note: note.length === 0 ? null : note,
    });
  } catch (error) {
    if (error instanceof UnitHasOccupantError) return "occupied";
    if (error instanceof ReservationPeriodError) return "invalidPeriod";
    if (error instanceof ChangeNoteError) return "invalidNote";
    if (error instanceof BookingChangedError) {
      revalidateFrontDesk(locale);
      return "changed";
    }
    if (error instanceof BookingChangeError) return "refused";
    console.error("changeDeparture failed unexpectedly", { stayId }, error);
    return "refused";
  }

  revalidateFrontDesk(locale);
  return "done";
}

/**
 * What saving a move shows afterwards (amend-booking slice 3). `notReady`,
 * `occupied`, `unavailable` and `notInService` are the room's answers, which
 * the desk acts on by choosing another; `changed` reads the dialog again.
 */
export type MoveGuestOutcome =
  | "idle"
  | "done"
  | "notReady"
  | "occupied"
  | "unavailable"
  | "notInService"
  | "invalidNote"
  | "changed"
  | "refused";

function moveReason(value: FormDataEntryValue | null): MoveReason | null {
  return (MOVE_REASONS as readonly string[]).includes(String(value))
    ? (String(value) as MoveReason)
    : null;
}

/**
 * Moving an in-house Guest to another Unit. The command checks the caller, the
 * room and readiness (ADR 0039); this reads the form, with the version the
 * dialog was shown.
 */
export async function moveGuest(
  _previous: MoveGuestOutcome,
  form: FormData,
): Promise<MoveGuestOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return "refused";

  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return "refused";

  const stayId = String(form.get("stay") ?? "");
  const accommodationUnitId = String(form.get("unit") ?? "");
  const reason = moveReason(form.get("reason"));
  const version = Number(form.get("version"));
  if (
    !stayId ||
    !accommodationUnitId ||
    !reason ||
    !form.has("version") ||
    !Number.isInteger(version) ||
    version < 0
  ) {
    return "refused";
  }
  const note = String(form.get("note") ?? "").trim();
  const noteLength = [...note].length;
  if (
    (reason === "other" && noteLength === 0) ||
    (noteLength > 0 && (noteLength < 3 || noteLength > 500))
  ) {
    return "invalidNote";
  }

  try {
    await getComposition().reservations.moveGuest(viewer.userId, {
      stayId,
      accommodationUnitId,
      reason,
      note: noteLength === 0 ? null : note,
      version,
    });
  } catch (error) {
    if (isNotReady(error)) return "notReady";
    if (error instanceof UnitHasOccupantError) return "occupied";
    if (error instanceof UnitUnavailableError) return "unavailable";
    if (error instanceof UnitNotInServiceError) return "notInService";
    if (error instanceof ChangeNoteError) return "invalidNote";
    if (error instanceof BookingChangedError) {
      revalidateFrontDesk(locale);
      return "changed";
    }
    if (error instanceof BookingChangeError) return "refused";
    console.error("moveGuest failed unexpectedly", { stayId }, error);
    return "refused";
  }

  revalidateFrontDesk(locale);
  return "done";
}

/** Recording that somebody booked for tonight or earlier never came. */
export async function markNoShow(
  _previous: EndBookingOutcome,
  form: FormData,
): Promise<EndBookingOutcome> {
  return endBooking(form, (userId, reservationId) =>
    getComposition().reservations.markNoShow(userId, reservationId),
  );
}
