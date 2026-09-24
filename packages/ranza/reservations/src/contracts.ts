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
  "requested" | "confirmed" | "cancelled" | "no_show" | "checked_in";

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
export interface Departure {
  stayId: string;
  /**
   * From the Reservation, and empty when the Stay began without one. A walk-in
   * has no name recorded anywhere yet — Guest profiles are blueprint 5.3 and
   * are not built, so this says nothing rather than inventing something.
   */
  guestName: string;
  stayType: ReservationStayType;
  /** Calendar date as `YYYY-MM-DD`. Never null: an open-ended Stay is not due. */
  endsOn: string;
  unitId: string;
  unitName: string;
  unitType: AccommodationUnitType;
  unitStatus: string;
  overdue: boolean;
  balanceMinor: number;
  currency: string;
}

/** What a completed check-out produced. */
export interface CheckedOut {
  stayId: string;
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
  /** Two holding bars on one night of this Unit — the named gap made visible (RC-S1-25). */
  overlaps: boolean;
  /**
   * For a requested booking over a holding bar: what it clashes with. Labelled,
   * never counted (RC-S1-29). A confirmed booking is the case confirming would
   * be refused by `reservations_no_double_booking`; a Stay is the named gap,
   * where nothing refuses it. Null when it clashes with nothing, and always
   * null on a bar that holds its nights.
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
