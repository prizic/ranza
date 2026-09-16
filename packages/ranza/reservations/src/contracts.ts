import type { AccommodationUnitType } from "@ranza/accommodation";
import type { CapabilityRef } from "@ranza/core";

/**
 * The public vocabulary of Reservations and Front Office.
 *
 * A Reservation is a planned allocation of an Accommodation Unit for a period,
 * which may become a Stay through check-in (blueprint 2 and 5.3). This module
 * covers exactly that pair. Group reservations, quotations, deposits,
 * extensions, room moves and no-show handling are also section 5.3 and are
 * deliberately absent — the status below has room for a no-show because the
 * database needs the value to exist, not because anything here sets it.
 */

/** Entitlement key for Reservations and Front Office (blueprint 5.3). */
export const FRONT_OFFICE_MODULE = "front_office";

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
 * `checked_in` is terminal here: the Reservation has become a Stay and the
 * correction for a mistaken check-in is a reversal workflow that does not exist
 * yet, not an edit back to `confirmed` (blueprint 7.4).
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
  canCheckIn: boolean;
}

/** What a completed check-in produced. */
export interface CheckedIn {
  reservationId: string;
  stayId: string;
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
  overdue: boolean;
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

/** The Unit is held by another current Stay over these nights. */
export class UnitUnavailableError extends CheckInError {
  constructor(message: string) {
    super(message);
    this.name = "UnitUnavailableError";
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
