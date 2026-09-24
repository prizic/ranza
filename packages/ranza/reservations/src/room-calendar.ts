import type {
  AccommodationUnitStatus,
  AccommodationUnitType,
} from "@ranza/accommodation";
import {
  ROOM_CALENDAR_DEFAULT_LENGTH,
  ROOM_CALENDAR_LEAD_DAYS,
  ROOM_CALENDAR_LENGTHS,
  type ReservationStayType,
  type RoomCalendar,
  type RoomCalendarBar,
  type RoomCalendarLength,
  type RoomCalendarNight,
  type RoomCalendarUnit,
} from "./contracts";

/**
 * The room calendar's arithmetic, kept apart from its SQL so every rule the
 * edge-case table names can be tested without a database.
 *
 * Every date is a `YYYY-MM-DD` string. They compare correctly as strings, and
 * never becoming a `Date` in local time is what stops a night moving by one for
 * a reader west of the meridian.
 */

/** One bar exactly as the statement's `json_agg` returns it. */
export interface RawCalendarBar {
  kind: "reservation" | "stay";
  reservationId: string | null;
  stayId: string | null;
  status: string;
  stayType: ReservationStayType;
  guestName: string | null;
  startsOn: string;
  endsOn: string | null;
  heldUntil: string | null;
  overdue: boolean;
  bookedStartsOn: string | null;
  bookedEndsOn: string | null;
  balanceMinor: number | null;
  currency: string | null;
  folioClosed: boolean | null;
}

/** One Unit exactly as the statement returns it. */
export interface CalendarUnitRow {
  unitId: string;
  parentId: string | null;
  name: string;
  unitType: AccommodationUnitType;
  building: string | null;
  floor: number | null;
  status: AccommodationUnitStatus;
  statusReason: string | null;
  hasChildren: boolean;
  today: string;
  firstDay: string;
  bars: RawCalendarBar[];
}

/** `day` moved by `count` days, as a calendar date and never as an instant. */
export function addDays(day: string, count: number): string {
  const moved = new Date(`${day}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + count);
  return moved.toISOString().slice(0, 10);
}

/** A length the calendar offers, or the default for anything else (RC-S1-06). */
export function calendarLength(days: number | null): RoomCalendarLength {
  return (
    ROOM_CALENDAR_LENGTHS.find((length) => length === days) ??
    ROOM_CALENDAR_DEFAULT_LENGTH
  );
}

/** The first day of a window that asked for none: three days before today. */
export function defaultFirstDay(today: string): string {
  return addDays(today, -ROOM_CALENDAR_LEAD_DAYS);
}

/** Null is an open end, which is later than every day. */
function earlier(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a < b ? a : b;
}

/**
 * Whether two sets of nights, `[startsOn, until)`, share one inside
 * `[from, to)`. A changeover — one ending the day the next begins — shares
 * none (RC-S1-27).
 */
function shareANight(
  a: { startsOn: string; heldUntil: string | null },
  b: { startsOn: string; heldUntil: string | null },
  from: string,
  to: string,
): boolean {
  const start = [a.startsOn, b.startsOn, from].reduce((x, y) =>
    x > y ? x : y,
  );
  const end = earlier(earlier(a.heldUntil, b.heldUntil), to);
  return end === null || start < end;
}

function holdsNight(bar: RoomCalendarBar, day: string): boolean {
  return (
    bar.holds &&
    bar.startsOn <= day &&
    (bar.heldUntil === null || day < bar.heldUntil)
  );
}

function isOutOfUse(status: AccommodationUnitStatus): boolean {
  return status === "blocked" || status === "out_of_service";
}

function barOf(raw: RawCalendarBar): RoomCalendarBar {
  const shared = {
    stayType: raw.stayType,
    guestName: raw.guestName,
    startsOn: raw.startsOn,
    endsOn: raw.endsOn,
    heldUntil: raw.heldUntil,
    overdue: raw.overdue,
    overlaps: false,
    clashesWith: null,
    bookedWhileBlocked: false,
  };
  if (raw.kind === "stay") {
    return {
      ...shared,
      kind: "stay",
      stayId: raw.stayId ?? "",
      reservationId: raw.reservationId,
      status: raw.status === "departed" ? "departed" : "in_house",
      holds: true,
      bookedStartsOn: raw.bookedStartsOn,
      bookedEndsOn: raw.bookedEndsOn,
      balance:
        raw.balanceMinor === null || raw.currency === null
          ? null
          : {
              balanceMinor: raw.balanceMinor,
              currency: raw.currency,
              closed: raw.folioClosed === true,
            },
    };
  }
  const status = raw.status === "requested" ? "requested" : "confirmed";
  return {
    ...shared,
    kind: "reservation",
    reservationId: raw.reservationId ?? "",
    status,
    holds: status === "confirmed",
  };
}

interface Tally {
  overlaps: number;
  bookedWhileBlocked: number;
}

/**
 * Marks what one Unit's bars mean together, and counts it.
 *
 * An overlap is a pair of holding bars sharing a night in the window, counted
 * once per pair however many nights they share, so the number reads as "this
 * many collisions". A requested bar holds nothing and so is never one side of
 * a pair (RC-S1-30).
 */
function markBars(
  bars: RoomCalendarBar[],
  status: AccommodationUnitStatus,
  window: { today: string; from: string; to: string },
  tally: Tally,
): void {
  const holding = bars.filter((bar) => bar.holds);
  holding.forEach((a, index) => {
    for (const b of holding.slice(index + 1)) {
      if (shareANight(a, b, window.from, window.to)) {
        a.overlaps = true;
        b.overlaps = true;
        tally.overlaps += 1;
      }
    }
  });
  for (const bar of bars) {
    if (!bar.holds) {
      const clashing = holding.filter((held) =>
        shareANight(bar, held, window.from, window.to),
      );
      // A confirmed booking first: that is the clash confirming would be
      // refused on, so it is the one worth naming.
      bar.clashesWith = clashing.some((held) => held.kind === "reservation")
        ? "booking"
        : clashing.length > 0
          ? "stay"
          : null;
    }
  }
  if (isOutOfUse(status)) {
    // A block has no start date, so only the nights from today on are its.
    const firstBlocked =
      window.from > window.today ? window.from : window.today;
    for (const bar of holding) {
      if (
        firstBlocked < window.to &&
        shareANight(
          bar,
          { startsOn: firstBlocked, heldUntil: null },
          window.from,
          window.to,
        )
      ) {
        bar.bookedWhileBlocked = true;
        tally.bookedWhileBlocked += 1;
      }
    }
  }
}

const byNumber = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

/** Null last, so Units with no building or no floor come after the rest (RC-S1-39). */
function compareNullable<T>(
  a: T | null,
  b: T | null,
  compare: (x: T, y: T) => number,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compare(a, b);
}

/** Building, then floor, then the name read as a number where it is one (RC-S1-38). */
function compareUnits(a: CalendarUnitRow, b: CalendarUnitRow): number {
  return (
    compareNullable(a.building, b.building, byNumber.compare) ||
    compareNullable(a.floor, b.floor, (x, y) => x - y) ||
    byNumber.compare(a.name, b.name)
  );
}

/**
 * The calendar from the statement's rows.
 *
 * No rows is either a Property with no Units or one the caller cannot reach,
 * and the two are deliberately the same answer. The window still needs a
 * today; with no row to read the Property's from, it is the server's, which is
 * the one case a Property's own day is not on offer (as in `listUnits`).
 */
export function buildRoomCalendar(
  rows: readonly CalendarUnitRow[],
  requested: { from: string | null; days: number | null },
): RoomCalendar {
  const days = calendarLength(requested.days);
  const today = rows[0]?.today ?? new Date().toISOString().slice(0, 10);
  const from = rows[0]?.firstDay ?? requested.from ?? defaultFirstDay(today);
  const to = addDays(from, days);
  const window = { today, from, to };

  const tally: Tally = { overlaps: 0, bookedWhileBlocked: 0 };
  const sorted = [...rows].sort(compareUnits);
  const placed = sorted.map((row) => {
    const bars = row.bars.map(barOf);
    markBars(bars, row.status, window, tally);
    const entry: RoomCalendarUnit = {
      unitId: row.unitId,
      name: row.name,
      unitType: row.unitType,
      building: row.building,
      floor: row.floor,
      status: row.status,
      statusReason: row.statusReason,
      sellable: !row.hasChildren,
      bars,
      beds: [],
    };
    return { parentId: row.parentId, entry };
  });
  const entries = new Map(placed.map(({ entry }) => [entry.unitId, entry]));

  const units: RoomCalendarUnit[] = [];
  for (const { parentId, entry } of placed) {
    const parent = parentId === null ? undefined : entries.get(parentId);
    // A bed whose room is not in the result is shown on its own rather than lost.
    if (parent) parent.beds.push(entry);
    else units.push(entry);
  }

  const sellable = [...entries.values()].filter((unit) => unit.sellable);
  const nights: RoomCalendarNight[] = Array.from({ length: days }, (_, i) => {
    const day = addDays(from, i);
    const free = sellable.filter(
      (unit) =>
        !(isOutOfUse(unit.status) && day >= today) &&
        !unit.bars.some((bar) => holdsNight(bar, day)),
    ).length;
    return { day, free };
  });

  return {
    today,
    from,
    days,
    sellable: sellable.length,
    nights,
    overlaps: tally.overlaps,
    bookedWhileBlocked: tally.bookedWhileBlocked,
    units,
  };
}
