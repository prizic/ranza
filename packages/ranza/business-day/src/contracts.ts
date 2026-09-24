/**
 * The public vocabulary of closing a business day (blueprint 6.4, ADR 0034).
 *
 * A business day is the day a Property is working, which rolls at its cutoff
 * by the clock (ADR 0021). Closing one finalizes a day the clock has already
 * ended: it never moves `app.property_today()`, and it never posts anything —
 * room nights wait on a rate (docs/features/close-the-day, PRE-01).
 */

/**
 * What a close with items left open accepts as a reason.
 *
 * The audit column's own bounds, and the table's: a reason accepted here is one
 * the audit record of the same close accepts, and a screen reads this to stop
 * somebody typing past it.
 */
export const CLOSE_REASON = { min: 3, max: 2000 } as const;

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
  endsOn: string;
  unitName: string;
  roomName: string | null;
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
  /** The viewer holds `front_desk.close_day`. The policy still decides. */
  mayClose: boolean;
  recent: ClosedDay[];
}

export interface BusinessDayClosed {
  closeId: string;
  businessDate: string;
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
