/**
 * The public vocabulary of closing a business day (blueprint 6.4, ADR 0034).
 *
 * A business day is the day a Property is working, which rolls at its cutoff
 * by the clock (ADR 0021). Closing one finalizes a day the clock has already
 * ended: it never moves `app.property_today()`. It charges the day's room
 * nights as it closes (ADR 0038): one charge per Guest in house that night
 * whose booking has a price, and a list of the nights it could not charge.
 */

/**
 * What a close with items left open accepts as a reason.
 *
 * The audit column's own bounds, and the table's: a reason accepted here is one
 * the audit record of the same close accepts, and a screen reads this to stop
 * somebody typing past it.
 */
export const CLOSE_REASON = { min: 3, max: 2000 } as const;

/** The job the worker closes a day as, named on the close (ADR 0018). */
export const CLOSE_JOB = "business_day.close";

/**
 * A booking whose first night has come and nobody arrived: requested or
 * confirmed, with its first night on the day being closed or before.
 */
export interface OpenArrival {
  reservationId: string;
  reference: string;
  guestName: string;
  status: "requested" | "confirmed";
  startsOn: string;
  endsOn: string | null;
  unitName: string;
  roomName: string | null;
  /**
   * Still dated for today, so the arrivals screen lists it and can check it in
   * or say what stands in the way. A link rather than a button here: that
   * screen already decides, and a second copy of its rule would drift.
   */
  arrivable: boolean;
  /** Confirmed, and the viewer holds `front_desk.cancel`. */
  mayMarkNoShow: boolean;
  /** The viewer holds `front_desk.cancel`. */
  mayCancel: boolean;
}

/** A Guest in house whose departure was the day being closed or before. */
export interface OpenDeparture {
  stayId: string;
  reference: string | null;
  guestName: string | null;
  /** The day they arrived, for extending the Stay from the checklist. */
  startsOn: string;
  endsOn: string;
  unitName: string;
  roomName: string | null;
  /**
   * Whether the viewer may extend them from here (AB-S2-05): a Stay on a
   * booking, and `front_desk.amend`.
   */
  mayAmend: boolean;
}

/** A departed Guest whose Folio is still open. Reported, never blocking. */
export interface FolioLeftOpen {
  stayId: string;
  folioId: string;
  guestName: string | null;
  departedOn: string;
  unitName: string;
  roomName: string | null;
  balanceMinor: number;
  currency: string;
}

/** Why a Guest night is not charged: `app.room_nights_due()`'s reasons. */
export type NightNotChargedReason =
  "unpriced" | "no_folio" | "folio_closed" | "currency" | "billing_unavailable";

/** A Guest in house the night being closed whose night will not be charged. */
export interface NightNotCharged {
  stayId: string;
  guestName: string | null;
  unitName: string;
  roomName: string | null;
  reason: NightNotChargedReason;
}

/** What closing the waiting day will charge, before it is closed. */
export interface NightsToCharge {
  nights: number;
  /** Null for a viewer who may not see money (finance.manage_folio). */
  amountMinor: number | null;
  currency: string;
}

/** A day that has been closed, as the screen lists it. */
export interface ClosedDay {
  closeId: string;
  businessDate: string;
  closedAt: Date;
  /** The Staff Member's email, or null when the worker closed it. */
  closedBy: string | null;
  automatic: boolean;
  arrived: number;
  departed: number;
  nightsOccupied: number;
  foliosLeftOpen: number;
  leftOpen: number;
  /** Every room night dated this day, whoever charged it (ADR 0038). */
  roomNightsCharged: number;
  /** What they came to; null for a viewer who may not see money. */
  roomRevenueMinor: number | null;
  roomRevenueCurrency: string | null;
  /** Guest nights of this day that could not be charged. */
  roomNightsNotCharged: number;
  reason: string | null;
}

/**
 * Everything the Close the day screen shows for one Property.
 *
 * `dayToClose` is the oldest day waiting — the one a close would be accepted
 * for — or null when yesterday is already closed. The checklist is for that
 * day, or for today while nothing is waiting, so the night shift can clear
 * today's items before the cutoff.
 */
export interface CloseTheDay {
  propertyId: string;
  today: string;
  /** `HH:MM`, the Property's local time the day ends at. */
  cutoff: string;
  dayToClose: string | null;
  /** How many days are waiting, the oldest being `dayToClose`. */
  waiting: number;
  checklistDay: string;
  notArrived: OpenArrival[];
  notDeparted: OpenDeparture[];
  foliosLeftOpen: FolioLeftOpen[];
  /**
   * For the day waiting to close, and null while nothing waits — today's
   * nights are not charged until today has ended: what the close will charge,
   * and the Guests whose nights it will not, with why. Never blocking.
   */
  nightsToCharge: NightsToCharge | null;
  nightsNotCharged: NightNotCharged[];
  /** The viewer holds `front_desk.close_day`. The policy still decides. */
  mayClose: boolean;
  recent: ClosedDay[];
}

export interface BusinessDayClosed {
  closeId: string;
  businessDate: string;
  /** Room nights dated the day, and the Guest nights that could not be charged. */
  roomNightsCharged: number;
  roomNightsNotCharged: number;
}

/**
 * A close that did not happen: out of reach, not the viewer's to close, not
 * ended yet, or waiting for an earlier day. One message for all of them,
 * because telling "not yours" from "not yet" would confirm a Property the
 * caller cannot reach exists — and the screen only ever offers the day that
 * can be closed, so reaching the others means the screen was stale.
 */
export class BusinessDayCloseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessDayCloseError";
  }
}

/** Somebody — another desk, or the worker — closed it first. */
export class DayAlreadyClosedError extends BusinessDayCloseError {
  constructor(message: string) {
    super(message);
    this.name = "DayAlreadyClosedError";
  }
}

/** Items are open and no reason was given for closing anyway. */
export class CloseReasonRequiredError extends BusinessDayCloseError {
  constructor(message: string) {
    super(message);
    this.name = "CloseReasonRequiredError";
  }
}

/** A reason outside `CLOSE_REASON`, or a day that is not a calendar day. */
export class CloseInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloseInputError";
  }
}

/**
 * What `app.close_business_day_automatically()` did with one due day.
 *
 * `open_items` is the ordinary answer, not a failure: the day waits for its
 * desk, and the next pass asks again.
 */
export type AutomaticCloseOutcome =
  "closed" | "open_items" | "already_closed" | "not_due" | "unavailable";

/**
 * One pass of the worker: what was due, what closed, what waits on its desk,
 * and each Property whose close failed, with the error, so the caller reports
 * every one rather than a count.
 */
export interface DayCloserReport {
  due: number;
  closed: number;
  open: number;
  failures: { propertyId: string; error: unknown }[];
}
