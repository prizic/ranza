import type { AccommodationUnitType } from "@ranza/accommodation";
import type { CapabilityRef } from "@ranza/core";

/**
 * The public vocabulary of Reservations and Front Office.
 *
 * A Reservation is a planned allocation of an Accommodation Unit for a period,
 * which may become a Stay through check-in (blueprint 2 and 5.3). This module
 * covers exactly that pair, and now the act of making one. Group reservations,
 * quotations, deposits, extensions, room moves and no-show handling are also
 * section 5.3 and are deliberately absent — the status below has room for a
 * no-show because the database needs the value to exist, not because anything
 * here sets it.
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
export interface Arrival {
  reservationId: string;
  guestName: string;
  stayType: ReservationStayType;
  status: ReservationStatus;
  /** Calendar date as `YYYY-MM-DD`; no instant, so no timezone to get wrong. */
  startsOn: string;
  /** Null means open-ended, which is normal for long-term residence. */
  endsOn: string | null;
  unitId: string;
  unitName: string;
  unitType: AccommodationUnitType;
  unitStatus: string;
  canCheckIn: boolean;
  /**
   * The Stay this Reservation's check-in produced, while it is still in house.
   *
   * Null on a Reservation nobody has checked in, and null again once a check-in
   * has been withdrawn or the Guest has left. Withdrawing a check-in takes the
   * Stay rather than the Reservation (`reverseCheckIn`), so without this the
   * row knows the thing that happened and not the thing to undo.
   *
   * Presentation, on the same footing as `canCheckIn`: it says whether there is
   * a check-in to offer taking back. Whether it may be taken back is decided by
   * the policies and by the trigger that refuses a Stay carrying charges.
   */
  stayId: string | null;
  eta: string | null;
  daysLate: number;
  balanceMinor: number;
  currency: string;
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
 * Somebody is in the Unit, or is promised it, over nights this would take.
 *
 * Distinct from `UnitUnavailableError`, which is two bookings wanting the same
 * nights. This one is a person: a Guest in house, perhaps past their planned
 * departure, or a confirmed booking a check-in would sleep through. A front
 * desk answers the two differently — the first by moving a booking, this one
 * by checking somebody out or finding them another room (ADR 0029). Like its
 * neighbour it reveals nothing the caller did not already name.
 */
export class UnitHasOccupantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnitHasOccupantError";
  }
}

/**
 * The Unit is blocked or out of service, so nobody may be put in it.
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
  unitType: AccommodationUnitType;
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
  unitType: AccommodationUnitType;
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
}

/** What a completed booking produced. */
export interface CreatedReservation {
  reservationId: string;
  guestId: string;
  /** False when the details named somebody the Organization already had. */
  guestCreated: boolean;
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
