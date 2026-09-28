import type {
  AccommodationUnitStatus,
  AccommodationUnitType,
} from "@ranza/accommodation";
import type { CapabilityRef } from "@ranza/core";

/**
 * The public vocabulary of Reservations and Front Office.
 *
 * A Reservation is a planned allocation of an Accommodation Unit for a period,
 * which may become a Stay through check-in (blueprint 2 and 5.3). This module
 * covers exactly that pair, the act of making one, and the two ways one ends
 * without a Stay — cancelled, or a no-show. Group reservations, quotations,
 * deposits, extensions and room moves are also section 5.3 and are
 * deliberately absent.
 */

/** Entitlement key for Reservations and Front Office (blueprint 5.3). */
export const FRONT_OFFICE_MODULE = "front_office";

/**
 * What `reverseCheckIn` will accept as a reason.
 *
 * The audit column's own bounds, published because a screen has to say why it
 * refused and has to stop somebody typing past the limit. Restating 3 and 2000
 * in the application is how a form and the rule it describes drift apart —
 * the copy and the `maxLength` both read this.
 */
export const REVERSAL_REASON = { min: 3, max: 2000 } as const;

/**
 * Working the front desk: seeing today's arrivals and checking them in.
 *
 * Gate 3 of blueprint 3.5 for every statement in this module, including the
 * writes — which is not the usual arrangement. A read carries the commercial
 * gates in the query around it; a write has no such query, so this key is named
 * inside the row-level policies themselves (ADR 0012). Changing it here without
 * changing them stops writes working, which is the safe direction.
 */
export const FRONT_DESK_CAPABILITY: CapabilityRef = {
  moduleKey: FRONT_OFFICE_MODULE,
  capabilityKey: "front_desk",
};

/** Short-term is a Guest, long-term is a Resident. Both become Stays. */
export type ReservationStayType = "guest" | "resident";

/**
 * The lifecycle this slice implements.
 *
 * `checked_in` is not terminal, and the way back is the only way back:
 * `reverseCheckIn` moves it to `confirmed` and cancels the Stay it produced. It
 * is never edited back and the Stay is never deleted, so the count of Stays
 * against a Reservation is the count of times somebody checked it in
 * ([ADR 0022](../../../../docs/adr/0022-a-mistaken-check-in-is-reversed-not-deleted.md)).
 */
export type ReservationStatus =
  | "requested"
  | "confirmed"
  | "cancelled"
  | "no_show"
  | "checked_in"
  | "checked_out";

/**
 * A Reservation arriving today, as the front desk sees it.
 *
 * Flat, and only what the arrivals list shows. `canCheckIn` is presentation
 * rather than authorization — it says whether the button is worth offering, and
 * the database decides whether pressing it does anything.
 */
/**
 * Why a Reservation on the arrivals list cannot be checked in right now, when
 * the front desk can do something about it.
 *
 * - `not_confirmed` — a request nobody has confirmed yet.
 * - `unit_blocked`, `unit_out_of_service` — unblock the Unit or move the Guest.
 * - `unit_occupied` — somebody is still in the room: check them out first.
 */
export type CheckInBlocker =
  "not_confirmed" | "unit_blocked" | "unit_out_of_service" | "unit_occupied";

export interface Arrival {
  reservationId: string;
  /** What the desk reads out to the Guest. */
  reference: string;
  guestName: string;
  stayType: ReservationStayType;
  status: ReservationStatus;
  /** Calendar date as `YYYY-MM-DD`; no instant, so no timezone to get wrong. */
  startsOn: string;
  /** Null means open-ended, which is normal for long-term residence. */
  endsOn: string | null;
  unitId: string;
  unitName: string;
  /** The room a bed is in, so "A" reads as "401 · A"; null for a room. */
  roomName: string | null;
  unitType: AccommodationUnitType;
  unitStatus: string;
  /**
   * Whether housekeeping says the room is ready (ADR 0029): not dirty, as
   * `app.unit_is_ready()` reads it. True where the Property has no
   * housekeeping, because a room nobody records is a room nobody warns about.
   * Presentation, like `canCheckIn`: check-in reads it again for itself.
   */
  unitIsReady: boolean;
  /**
   * Whether check-in would succeed, from the same conditions `checkIn` and the
   * triggers apply — asserted against the command in the integration suite.
   * The two drifted apart once already, and a button that raises when pressed
   * is worse than one that is not offered. A room housekeeping has not made
   * ready is still offered: that is asked about, not refused (`unitIsReady`).
   */
  canCheckIn: boolean;
  /** Why not, when it is something the desk can act on; null otherwise. */
  checkInBlocker: CheckInBlocker | null;
  /**
   * When `unit_occupied`, when the Guest in the room is due to leave: past it,
   * today, a later day, or never said. Null when the room is not occupied.
   */
  occupantLeaves: "overdue" | "today" | "later" | "open" | null;
  /**
   * The Stay this Reservation's check-in produced, while it is still in house.
   *
   * Null on a Reservation nobody has checked in, and null again once a check-in
   * has been withdrawn or the Guest has left. Withdrawing a check-in takes the
   * Stay rather than the Reservation (`reverseCheckIn`), so without this the
   * row knows the thing that happened and not the thing to undo.
   */
  stayId: string | null;
  /** That Stay's open Folio; null before check-in or without billing. */
  folioId: string | null;
  daysLate: number;
  balanceMinor: number;
  currency: string;
  /**
   * What the viewer's role lets them do. Presentation, like `canCheckIn`: a
   * control nobody here may use is not offered, and the policies still decide
   * whether pressing one does anything.
   */
  mayCheckIn: boolean;
  mayCancel: boolean;
  /** Whether it may be moved to other nights or another Unit (AB-S1-27). */
  mayAmend: boolean;
}

/** What a completed check-in produced. */
export interface CheckedIn {
  reservationId: string;
  stayId: string;
  /**
   * The Folio opened for the Stay, or null when the Property does not do
   * billing. Not an error: Front Office is gated on `front_desk` and Folios on
   * `finance`, so an Organization with one Entitlement and not the other
   * checks people in and keeps no account for them.
   */
  folioId: string | null;
}

/**
 * A Stay due to depart, as the front desk sees it.
 *
 * `overdue` is the reason this list exists at all: a departures list showing
 * only today hides the Guest who should have left on Tuesday, which is the row
 * most worth seeing.
 */
/** Which Stays the departures screen lists. */
export type DepartureView = "due" | "in_house";

export interface Departure {
  stayId: string;
  /** Null for a Stay that began without a Reservation. */
  reservationId: string | null;
  /** The Reservation's reference, read aloud to a Guest; null without one. */
  reference: string | null;
  /**
   * From the Reservation, and empty when the Stay began without one. A walk-in
   * has no name recorded anywhere yet, so this says nothing rather than
   * inventing something.
   */
  guestName: string;
  stayType: ReservationStayType;
  /** The day they arrived, as `YYYY-MM-DD`. */
  startsOn: string;
  /** Their planned departure as `YYYY-MM-DD`, or null for an open-ended Stay. */
  endsOn: string | null;
  unitId: string;
  unitName: string;
  /** The room a bed is in, so "A" reads as "401 · A"; null for a room. */
  roomName: string | null;
  unitType: AccommodationUnitType;
  unitStatus: string;
  /** Past their planned departure and still here. */
  overdue: boolean;
  /** Leaving before their planned departure if they leave today. */
  early: boolean;
  /** The open Folio, or null when the Property does no billing. */
  folioId: string | null;
  /**
   * The Folio's line count, which the check-out confirms against; null with no
   * Folio. See `CheckOutConfirmation.folioVersion`.
   */
  folioVersion: number | null;
  balanceMinor: number;
  currency: string;
  /**
   * Nights already slept that no close has charged yet, and what they come to
   * (ADR 0038): the check-out charges them, so the bill the desk reviews is
   * `balanceMinor + pendingMinor`. Zero for an unpriced booking, whose nights
   * are not charged, and for a Stay with no Folio.
   */
  pendingNights: number;
  pendingMinor: number;
  /** The booking's own price per night; null when it was taken unpriced. */
  nightlyRateMinor: number | null;
  /**
   * Whether the viewer holds front_desk.check_out. Presentation: the policy
   * decides whether pressing the button does anything.
   */
  mayCheckOut: boolean;
}

/**
 * What the front desk saw when it decided to check somebody out.
 *
 * A check-out is confirmed against a review of the bill, and the review is
 * what these three carry back. The module compares them with what is true
 * under the Stay's lock, so a charge posted between the review and the button
 * is not settled by a desk that never saw it (CO-S1-12).
 */
export interface CheckOutConfirmation {
  /**
   * How many lines the Folio had when the desk reviewed it, or null when the
   * review showed no Folio. Lines are only ever added, so the count changes on
   * every posting — a charge and its correction included, which leave the
   * balance where it was (CO-S1-16).
   */
  folioVersion: number | null;
  /**
   * The nights still to charge, and their amount, as the review showed them
   * (ADR 0030 as amended by ADR 0038). What the check-out then charges must be
   * exactly this, or the bill changed and the desk looks again: a close may
   * have charged a night in between, or the business date rolled over.
   */
  pendingNights: number;
  pendingMinor: number;
  /** The desk acknowledged the Guest is leaving before their planned last night. */
  earlyDeparture: boolean;
  /**
   * Why a Folio with money on it is being left open. Required when the balance
   * is not zero, because nothing can take a payment yet (PRE-01) and the Guest
   * is leaving anyway; recorded as the audit record's reason.
   */
  balanceReason: string | null;
}

/**
 * The bounds on a reason for leaving a Folio open: the audit column's own, like
 * `REVERSAL_REASON`, so a reason that passes here cannot fail after the Stay
 * has already ended.
 */
export const BALANCE_REASON = { min: 3, max: 2000 } as const;

/** What a completed check-out produced. */
export interface CheckedOut {
  stayId: string;
  /** The Folio was settled and is now closed; false when there was none or it was left open. */
  folioClosed: boolean;
}

/**
 * A check-in that did not happen.
 *
 * One type for every reason on purpose. "That Reservation is in another
 * Organization", "it was cancelled" and "somebody checked it in a moment ago"
 * are the same answer to a front desk and must not be told apart from outside:
 * the first of them would otherwise confirm that a Reservation exists.
 */
export class CheckInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckInError";
  }
}

/**
 * The Unit is already held over these nights.
 *
 * Not a subclass of `CheckInError` any more, because it is now the answer to
 * two different questions: a check-in refused by `stays_no_double_booking`, and
 * a booking refused by `reservations_no_double_booking`. Availability is one
 * question about a Unit and a period, so it is one type — and unlike every
 * refusal beside it, this one reveals nothing. The caller already named the
 * Unit and the nights.
 */
export class UnitUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnitUnavailableError";
  }
}

/**
 * The price list changed while the booking was being taken or changed: the
 * database would stamp a price the desk did not quote. Nothing was written, and
 * the dialog is read again with the price that stands now (RT-S2-12, AB-S1-03).
 */
export class PriceChangedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PriceChangedError";
  }
}

/**
 * Somebody is in the Unit, or is promised it, over nights this would take.
 *
 * Distinct from `UnitUnavailableError`, which is two bookings wanting the same
 * nights. This one is a person: a Guest in house, perhaps past their planned
 * departure, or a confirmed booking a check-in would sleep through. A front
 * desk answers the two differently — the first by moving a booking, this one
 * by checking somebody out or finding them another room (ADR 0033). Like its
 * neighbour it reveals nothing the caller did not already name.
 */
export class UnitHasOccupantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnitHasOccupantError";
  }
}

/**
 * The Unit is blocked or out of service, or is a bed under a room that is
 * (ADR 0032), so nobody may be put in it.
 *
 * Raised by `stays_unit_is_in_service` for every role. The desk can act on it —
 * unblock the Unit, or put the Guest elsewhere — which is why it is not the
 * generic refusal.
 */
export class UnitNotInServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnitNotInServiceError";
  }
}

/**
 * The room is not ready and the desk has not said to go ahead (HK-S2-14).
 *
 * Not a refusal: nothing is wrong with the Reservation, and checking in anyway
 * is allowed once acknowledged. Its own type so the desk is asked rather than
 * told no, and so the check-in rolls back whole — no Stay, no Folio, no event —
 * until they answer.
 */
export class UnitNotReadyError extends Error {
  constructor() {
    super("that Accommodation Unit is not ready");
    this.name = "UnitNotReadyError";
  }
}

/** What withdrawing a check-in produced. */
export interface CheckInReversed {
  reservationId: string;
  stayId: string;
}

/**
 * A check-in that could not be withdrawn.
 *
 * One type for every reason, on the same principle as `CheckInError`: out of
 * reach, already departed, already withdrawn, never happened.
 */
export class CheckInReversalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckInReversalError";
  }
}

/**
 * Something has been posted to the Stay's Folio, so this is no longer a slip.
 *
 * Its own type because it is the one refusal a front desk can act on — the
 * others are all "you cannot". It reveals only that a charge exists, never what
 * it was, and it is answered truthfully even to a Staff Member who holds
 * `front_desk` and not `finance` (ADR 0022).
 */
export class StayHasChargesError extends CheckInReversalError {
  constructor(message: string) {
    super(message);
    this.name = "StayHasChargesError";
  }
}

/**
 * A check-in that cannot be withdrawn because the business day it began on is
 * closed (ADR 0034): withdrawing it would put an unarrived booking back into a
 * day that has been finalized.
 *
 * Its own type for the reason `StayHasChargesError` has one — the desk can act
 * on it, by correcting the Stay rather than undoing it — and it reveals nothing
 * the desk cannot already see: that day's close is on the Close the day screen.
 */
export class CheckInDayClosedError extends CheckInReversalError {
  constructor(message: string) {
    super(message);
    this.name = "CheckInDayClosedError";
  }
}

/**
 * A check-out that did not happen.
 *
 * One type for every reason, on the same principle as CheckInError: out of
 * reach, already departed, never existed. Told apart, the first would confirm
 * that a Stay the caller cannot see is there.
 */
export class CheckOutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckOutError";
  }
}

/**
 * The bill changed after the desk reviewed it. Review it again (CO-S1-12).
 *
 * Reveals nothing: the caller already holds the Stay's review.
 */
export class FolioChangedError extends CheckOutError {
  constructor(message: string) {
    super(message);
    this.name = "FolioChangedError";
  }
}

/** The Guest leaves before their planned last night and nobody said so (CO-S1-04). */
export class EarlyDepartureError extends CheckOutError {
  constructor(message: string) {
    super(message);
    this.name = "EarlyDepartureError";
  }
}

/** Money is on the Folio and no reason was given, or one outside the bounds. */
export class BalanceReasonError extends CheckOutError {
  constructor(message: string) {
    super(message);
    this.name = "BalanceReasonError";
  }
}

/**
 * A Unit a booking can be placed on.
 *
 * Every Unit in the Property that is in service, not only the free ones. Whether
 * these nights are free is `reservations_no_double_booking`'s answer, and asking
 * it here would be a second, weaker copy that goes stale between the page
 * rendering and somebody pressing the button.
 */
export interface BookableUnit {
  unitId: string;
  unitName: string;
  /** The room a bed is in; null for a room. */
  roomName: string | null;
  unitType: AccommodationUnitType;
  /**
   * What a night here costs on the price list now, for the dialog to quote:
   * minor units of `rateCurrency`, or null when this kind is unpriced or its
   * price is stale (ADR 0038). A quote, not the price — the database stamps
   * the booking when it is taken, and that is the one the Guest is charged.
   */
  nightlyRateMinor: number | null;
  rateCurrency: string | null;
}

/**
 * A Reservation on the Property's list.
 *
 * `guestEmail` is here because it is the only visible evidence that a returning
 * Guest was recognized rather than duplicated — two bookings showing one address
 * are one person, and without the column that fact is invisible in the product
 * and untestable from outside it.
 */
export interface ReservationRow {
  reservationId: string;
  reference: string;
  guestId: string;
  guestName: string;
  guestEmail: string | null;
  stayType: ReservationStayType;
  status: ReservationStatus;
  /** Calendar date as `YYYY-MM-DD`; no instant, so no timezone to get wrong. */
  startsOn: string;
  /** Null means open-ended, which is normal for long-term residence. */
  endsOn: string | null;
  unitId: string;
  unitName: string;
  /** The room a bed is in; null for a room. */
  roomName: string | null;
  unitType: AccommodationUnitType;
  /**
   * What a night of this booking costs, as stamped when it was taken, in minor
   * units of `rateCurrency`; null when it was taken unpriced (ADR 0038).
   */
  nightlyRateMinor: number | null;
  rateCurrency: string | null;
  /** Whether the viewer may cancel it, and whether it is still cancellable. */
  mayCancel: boolean;
  /** Whether the viewer may mark it a no-show: confirmed, and its first night has come. */
  mayMarkNoShow: boolean;
  /**
   * Whether the viewer may change its dates or Unit: it has not arrived, and
   * they hold `front_desk.amend` (AB-S1-14, AB-S1-22).
   */
  mayAmend: boolean;
}

/**
 * What a front desk supplies to take a booking.
 *
 * The Guest is described rather than chosen. Picking one from the Organization's
 * existing people is the Guest 360 workspace (blueprint 18.7) and there is no
 * screen for it; until then `createReservation` matches on an exact email and
 * creates a Guest when nobody matches, which is the narrowest rule that is never
 * the automatic merge 18.7 forbids.
 *
 * `organizationId` is deliberately absent. It is read from the Unit the booking
 * names, so a caller cannot supply one (ADR 0012).
 */
export interface NewReservation {
  propertyId: string;
  accommodationUnitId: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  stayType: ReservationStayType;
  /** Calendar date as `YYYY-MM-DD`. */
  startsOn: string;
  /** Null for an open-ended Reservation, which is normal for a Resident. */
  endsOn: string | null;
  /**
   * The price the desk quoted: what the dialog showed for a night, in minor
   * units of `quotedCurrency`, or both null when it said the booking would be
   * unpriced (ADR 0038). The database stamps the booking from the price list,
   * and a stamp that is not this quote refuses the booking (`PriceChangedError`)
   * rather than charging a Guest a price nobody told them.
   */
  quotedRateMinor: number | null;
  quotedCurrency: string | null;
}

/** What a completed booking produced. */
export interface CreatedReservation {
  reservationId: string;
  guestId: string;
  /** False when the details named somebody the Organization already had. */
  guestCreated: boolean;
  /** The price the database stamped it with; null when it was taken unpriced. */
  nightlyRateMinor: number | null;
  rateCurrency: string | null;
}

/**
 * A booking that was not taken.
 *
 * One type for every reason the actor is not allowed to make it, on the same
 * principle as `CheckInError`: "that Unit is in another Organization", "your
 * Subscription has lapsed" and "this Property has no front desk" are the same
 * answer to a front desk, and telling them apart would confirm that a Unit the
 * caller cannot see is there.
 */
export class ReservationRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReservationRefusedError";
  }
}

/**
 * The dates are not a period a Reservation can have.
 *
 * Its own type because, like `GuestDetailsError`, it hides nothing: the person
 * typing can see the dates and fix them. A booking that ends before it starts,
 * one that covers no nights, and one that starts before the Property's own today
 * are all this.
 */
export class ReservationPeriodError extends ReservationRefusedError {
  constructor(message: string) {
    super(message);
    this.name = "ReservationPeriodError";
  }
}

/**
 * The bounds on a reason for cancelling a booking: the audit column's own, like
 * `REVERSAL_REASON`, and measured before the transaction for the same reason.
 */
export const CANCELLATION_REASON = { min: 3, max: 2000 } as const;

/**
 * A booking that could not be cancelled or marked a no-show.
 *
 * One type for every reason, like `CheckInError`: already arrived, already
 * cancelled, another Organization's, never existed — telling them apart would
 * confirm a Reservation the caller cannot see. The reason's length is the one
 * exception, and it is `ReservationReasonError`.
 */
export class ReservationEndError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReservationEndError";
  }
}

/** A cancellation reason outside `CANCELLATION_REASON`. */
export class ReservationReasonError extends ReservationEndError {
  constructor(message: string) {
    super(message);
    this.name = "ReservationReasonError";
  }
}

/** What cancelling a booking or marking a no-show produced. */
export interface ReservationEnded {
  reservationId: string;
  status: "cancelled" | "no_show";
}

/**
 * The bounds on a change's note: at most `reservation_changes`' own 500, and at
 * least the audit record's reason, which is where the note is also kept.
 */
export const CHANGE_NOTE = { min: 3, max: 500 } as const;

/**
 * What a front desk supplies to change a booking that has not arrived
 * (ADR 0039). The dates and Unit are the whole of what may change; the Guest,
 * the stay type and the Organization are the booking's and not the caller's.
 */
export interface BookingChange {
  reservationId: string;
  /** Calendar date as `YYYY-MM-DD`, today or later. */
  startsOn: string;
  /** Null only for a Resident, whose booking may be open-ended. */
  endsOn: string | null;
  accommodationUnitId: string;
  /**
   * How many changes the booking had when the dialog read it. A change saved
   * against a number that no longer stands is refused as `BookingChangedError`
   * rather than overwriting what somebody else just did (AB-S1-19).
   */
  version: number;
  /**
   * What the dialog said a night would cost after the change, in minor units of
   * `quotedCurrency`, or both null for unpriced. Only another kind of Unit
   * changes the price; a stamp that is not this quote refuses the change
   * (`PriceChangedError`, AB-S1-03).
   */
  quotedRateMinor: number | null;
  quotedCurrency: string | null;
  note: string | null;
}

/** Why a Unit cannot take the booking over the nights asked for. */
export type ChangeBlocker =
  /** Another confirmed booking holds some of those nights; see `conflictReference`. */
  | "booked"
  /** Somebody in house is staying over some of those nights (ADR 0033). */
  | "occupied";

/** One Unit the booking could move to, as read for the nights asked for. */
export interface ChangeOption {
  unitId: string;
  unitName: string;
  /** The room a bed is in; null for a room. */
  roomName: string | null;
  unitType: AccommodationUnitType;
  /** Of the booking's own kind, so its price would not change. */
  sameKind: boolean;
  /** The Unit the booking holds now. */
  current: boolean;
  /**
   * In service and let whole, so a booking may be moved onto it. Only the
   * current Unit is ever listed without it: a booking whose room went out of
   * order, or was split into beds, can still change its dates there.
   */
  takesBookings: boolean;
  /** Null when the Unit is free for those nights. */
  blocker: ChangeBlocker | null;
  /** The booking in the way, when `blocker` is `booked`. */
  conflictReference: string | null;
  /**
   * What a night would cost on this Unit: the booking's own price for its own
   * kind, today's price for another kind, null when unpriced.
   */
  nightlyRateMinor: number | null;
  rateCurrency: string | null;
}

/**
 * What changing a booking would do, read before saving (blueprint 18.6). A
 * preview, never a promise: the constraints still decide on save (AB-S1-07).
 * Out-of-service Units and rooms let by the bed are not offered (AB-S1-08),
 * except the booking's own, which is listed so its dates can still change.
 */
export interface ChangePreview {
  reservationId: string;
  reference: string;
  stayType: ReservationStayType;
  startsOn: string;
  endsOn: string | null;
  unitId: string;
  nightlyRateMinor: number | null;
  rateCurrency: string | null;
  /** The Property's today, the earliest a booking may arrive. */
  today: string;
  /** To be sent back with the change. */
  version: number;
  /** Free Units of the booking's kind first, then the others, then the taken. */
  options: ChangeOption[];
}

/** What a saved change produced. */
export interface AmendedBooking {
  reservationId: string;
  changeId: string;
  nightlyRateMinor: number | null;
  rateCurrency: string | null;
}

/**
 * A booking that cannot be changed by this caller: another Organization's, out
 * of reach, without `front_desk.amend`, already arrived or finished, or never
 * existed. One type, like `ReservationEndError`, so none of those is confirmed
 * to a caller who could not see it.
 */
export class BookingChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingChangeError";
  }
}

/** A change's note outside `CHANGE_NOTE`, which the person typing can fix. */
export class ChangeNoteError extends BookingChangeError {
  constructor(message: string) {
    super(message);
    this.name = "ChangeNoteError";
  }
}

/**
 * The booking changed after the dialog read it (AB-S1-19). Nothing was written;
 * the desk is shown the booking as it now stands.
 */
export class BookingChangedError extends BookingChangeError {
  constructor() {
    super("that booking changed since it was read");
    this.name = "BookingChangedError";
  }
}

/**
 * How many days the room calendar may show. An allow-list rather than a bound,
 * so the read is never asked for a range nobody designed a screen for
 * (RC-S1-06); a longer view is one more entry here (RC-DEF-08).
 */
export const ROOM_CALENDAR_LENGTHS = [7, 14, 30] as const;
export type RoomCalendarLength = (typeof ROOM_CALENDAR_LENGTHS)[number];
export const ROOM_CALENDAR_DEFAULT_LENGTH: RoomCalendarLength = 14;

/** A default window opens this many days before today, so recent departures stay in view. */
export const ROOM_CALENDAR_LEAD_DAYS = 3;

/** Which window to read. Anything not valid falls back to the default rather than being refused. */
export interface RoomCalendarWindow {
  /** `YYYY-MM-DD`, or null for three days before the Property's today. */
  from: string | null;
  days: number | null;
}

/** A Stay's Folio as the calendar's drawer shows it — the same sum Departures shows. */
export interface RoomCalendarBalance {
  balanceMinor: number;
  currency: string;
  closed: boolean;
}

interface RoomCalendarBarBase {
  stayType: ReservationStayType;
  /** Null for a Stay with no Reservation: nobody's name was recorded. */
  guestName: string | null;
  /** First night, `YYYY-MM-DD`. */
  startsOn: string;
  /** The planned end — the departure day — or null for no end date. */
  endsOn: string | null;
  /**
   * The day the bar is drawn to. The planned end, except for an overdue Stay,
   * which is drawn through tonight because the Guest is still in the Unit
   * (RC-S1-15). Null for no end date.
   */
  heldUntil: string | null;
  overdue: boolean;
  /** Whether it holds its nights. A requested booking holds nothing yet (RC-S1-11). */
  holds: boolean;
  /**
   * Two bars on one night of this Unit, each somebody booked or staying
   * (RC-S1-25, RC-S1-26). A departed Stay is never one of them: its nights are
   * history, so checking an overdue Guest out clears it (RC-S1-28).
   */
  overlaps: boolean;
  /**
   * For a requested booking over a holding bar: what it clashes with — a
   * confirmed booking, or a Guest in house. Labelled, never counted
   * (RC-S1-29); confirming it as it stands would be refused either way, by
   * `reservations_no_double_booking` or by `unit_holds_one_occupancy`. A
   * departed Stay is history and clashes with nothing. Null when it clashes
   * with nothing, and always null on a bar that holds its nights.
   */
  clashesWith: "booking" | "stay" | null;
  /** Holding a night, from today on, of a Unit that is blocked or out of service (RC-S1-34). */
  bookedWhileBlocked: boolean;
}

/** A booking not yet checked in. */
export interface RoomCalendarReservationBar extends RoomCalendarBarBase {
  kind: "reservation";
  reservationId: string;
  status: "requested" | "confirmed";
}

/**
 * A Stay. A checked-in Reservation is drawn only as this, so one Guest is one
 * bar (RC-S1-12), carrying the dates that were booked beside the ones stayed.
 */
export interface RoomCalendarStayBar extends RoomCalendarBarBase {
  kind: "stay";
  stayId: string;
  reservationId: string | null;
  status: "in_house" | "departed";
  bookedStartsOn: string | null;
  bookedEndsOn: string | null;
  /** Null when the Stay has no Folio — shown as nothing, never as zero (RC-S1-49). */
  balance: RoomCalendarBalance | null;
}

export type RoomCalendarBar = RoomCalendarReservationBar | RoomCalendarStayBar;

/** A row of the calendar: a room, a bed, or a room with its beds beneath it. */
export interface RoomCalendarUnit {
  unitId: string;
  name: string;
  unitType: AccommodationUnitType;
  building: string | null;
  floor: number | null;
  status: AccommodationUnitStatus;
  statusReason: string | null;
  /** A Unit with no children is what is let. A room with beds is not; its beds are. */
  sellable: boolean;
  bars: RoomCalendarBar[];
  beds: RoomCalendarUnit[];
}

/** One night of the window: how many sellable Units nothing holds (RC-S1-24). */
export interface RoomCalendarNight {
  day: string;
  free: number;
}

/**
 * The room calendar for one Property over one window.
 *
 * The counts cover every Unit whatever a screen filters, so hiding a floor
 * never hides an overlap (RC-S1-31).
 */
export interface RoomCalendar {
  /** The Property's own today (RC-S1-04). */
  today: string;
  /** The window's first day. */
  from: string;
  days: RoomCalendarLength;
  sellable: number;
  nights: RoomCalendarNight[];
  overlaps: number;
  bookedWhileBlocked: number;
  units: RoomCalendarUnit[];
}
