import type {
  RoomCalendar,
  RoomCalendarBar,
  RoomCalendarUnit,
} from "../../server/viewer";
import type { RoomCalendarView } from "./view";

/**
 * Where things go on the room calendar's grid, kept apart from React so each
 * rule is testable on its own.
 *
 * The grid is two columns a day. A bar starts in the middle of its arrival day
 * and ends in the middle of its departure day, so on a changeover day the
 * Guest leaving and the Guest arriving share one cell and neither hides the
 * other (RC-S1-66). Positions are half-day indices from 0 to `2 × days`, and a
 * grid column is that plus the one the room names sit in.
 *
 * Every date is a `YYYY-MM-DD` string and every difference between two is
 * taken in UTC: a calendar date is not an instant.
 */

export interface PlacedBar {
  bar: RoomCalendarBar;
  /** First half-day the bar covers. */
  start: number;
  /** The half-day after the last one it covers. */
  end: number;
  lane: number;
  /** Began before the window, or runs on after it — drawn with a square end. */
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/** A calendar date moved by `count` days, never through local time. */
export function shiftDay(day: string, count: number): string {
  const moved = new Date(`${day}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + count);
  return moved.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

/** The key a bar keeps while its status changes — what the drawer follows. */
export function barKey(bar: RoomCalendarBar): string {
  return bar.kind === "stay"
    ? `stay:${bar.stayId}`
    : `reservation:${bar.reservationId}`;
}

/**
 * Bars placed and stacked. Overlapping bars take lanes of their own, so the
 * named gap is two bars one above the other rather than one hiding the other
 * (RC-S1-25); a lane is reused as soon as it is free (RC-S1-30).
 */
export function placeBars(
  bars: readonly RoomCalendarBar[],
  from: string,
  days: number,
): { placed: PlacedBar[]; lanes: number } {
  const halves = days * 2;
  const positioned = bars
    .map((bar) => {
      const arrival = daysBetween(from, bar.startsOn);
      const departure =
        bar.heldUntil === null ? null : daysBetween(from, bar.heldUntil);
      const continuesBefore = arrival < 0;
      const continuesAfter = departure === null || departure >= days;
      return {
        bar,
        start: continuesBefore ? 0 : arrival * 2 + 1,
        end: continuesAfter ? halves : (departure ?? 0) * 2 + 1,
        continuesBefore,
        continuesAfter,
      };
    })
    .filter((item) => item.start < item.end)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const laneEnds: number[] = [];
  const placed = positioned.map((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = item.end;
    return { ...item, lane };
  });
  return { placed, lanes: Math.max(1, laneEnds.length) };
}

/** Whether a bar holds a given night: `[startsOn, heldUntil)`. */
export function holdsNight(bar: RoomCalendarBar, day: string): boolean {
  return (
    bar.holds &&
    bar.startsOn <= day &&
    (bar.heldUntil === null || day < bar.heldUntil)
  );
}

/** A row of the grid, in the order it is drawn. */
export type CalendarRow =
  /** Null names the Units with no building, when others have one. */
  | { kind: "building"; key: string; building: string | null }
  | { kind: "floor"; key: string; floor: number | null }
  | {
      kind: "unit";
      key: string;
      unit: RoomCalendarUnit;
      /** A bed under its room is drawn indented. */
      nested: boolean;
      /** Set on a room with beds: whether they are folded into this row. */
      collapsed: boolean;
    };

function visibleBars(
  unit: RoomCalendarUnit,
  view: RoomCalendarView,
): RoomCalendarBar[] {
  return unit.bars.filter(
    (bar) =>
      (view.showRequested || bar.status !== "requested") &&
      (view.showDeparted || bar.status !== "departed"),
  );
}

function withVisibleBars(
  unit: RoomCalendarUnit,
  view: RoomCalendarView,
): RoomCalendarUnit {
  return {
    ...unit,
    bars: visibleBars(unit, view),
    beds: unit.beds.map((bed) => withVisibleBars(bed, view)),
  };
}

function hasOverlap(unit: RoomCalendarUnit): boolean {
  return (
    unit.bars.some((bar) => bar.overlaps || bar.bookedWhileBlocked) ||
    unit.beds.some(hasOverlap)
  );
}

function matchesSearch(unit: RoomCalendarUnit, search: string): boolean {
  const needle = search.trim().toLocaleLowerCase();
  if (!needle) return true;
  return (
    unit.name.toLocaleLowerCase().includes(needle) ||
    unit.bars.some((bar) =>
      (bar.guestName ?? "").toLocaleLowerCase().includes(needle),
    ) ||
    unit.beds.some((bed) => matchesSearch(bed, needle))
  );
}

function floorMatches(unit: RoomCalendarUnit, floor: string | null): boolean {
  if (floor === null) return true;
  if (floor === "none") return unit.floor === null;
  return unit.floor === Number(floor);
}

/**
 * The rooms the view shows, grouped under building and floor headings in the
 * order the read returned them. The filters decide what is drawn and nothing
 * else: the counts above the grid are the read's, over every Unit, so a filter
 * never hides an overlap (RC-S1-31).
 */
export function calendarRows(
  calendar: RoomCalendar,
  view: RoomCalendarView,
): CalendarRow[] {
  const rows: CalendarRow[] = [];
  let building: string | null | undefined;
  let floor: number | null | undefined;
  const hasFloors = calendar.units.some((unit) => unit.floor !== null);
  const hasBuildings = calendar.units.some((unit) => unit.building !== null);

  for (const unit of calendar.units) {
    if (!floorMatches(unit, view.floor)) continue;
    if (view.overlapsOnly && !hasOverlap(unit)) continue;
    if (!matchesSearch(unit, view.search)) continue;

    if (unit.building !== building) {
      building = unit.building;
      floor = undefined;
      // Without a heading of their own, Units with no building would read
      // as belonging to whichever building was drawn above them.
      if (hasBuildings) {
        rows.push({
          kind: "building",
          key: `building:${unit.building ?? ""}`,
          building: unit.building,
        });
      }
    }
    if (hasFloors && unit.floor !== floor) {
      floor = unit.floor;
      rows.push({
        kind: "floor",
        key: `floor:${unit.building ?? ""}:${unit.floor ?? "none"}`,
        floor: unit.floor,
      });
    }

    const shown = withVisibleBars(unit, view);
    const collapsed =
      shown.beds.length > 0 && view.collapsed.includes(unit.unitId);
    rows.push({
      kind: "unit",
      key: unit.unitId,
      unit: shown,
      nested: false,
      collapsed,
    });
    if (!collapsed) {
      for (const bed of shown.beds) {
        rows.push({
          kind: "unit",
          key: bed.unitId,
          unit: bed,
          nested: true,
          collapsed: false,
        });
      }
    }
  }
  return rows;
}

/** For a folded room: how many of its beds are taken on each night (RC-S1-40). */
export function bedsTaken(
  room: RoomCalendarUnit,
  nights: readonly string[],
): number[] {
  return nights.map(
    (day) =>
      room.beds.filter((bed) => bed.bars.some((bar) => holdsNight(bar, day)))
        .length,
  );
}

/** Whether a Unit is out of use on a night — a block has no dates, so only from today on. */
export function outOfUseOn(
  unit: RoomCalendarUnit,
  day: string,
  today: string,
): boolean {
  return (
    (unit.status === "blocked" || unit.status === "out_of_service") &&
    day >= today
  );
}

/** A bar, the Unit it is on, and that Unit's room when it is a bed. */
export interface PlacedEntry {
  bar: RoomCalendarBar;
  unit: RoomCalendarUnit;
  room: RoomCalendarUnit | null;
}

/**
 * Every bar on the calendar, beds included, by its key — what the drawer looks
 * its bar up in on each refresh. A Stay is also found under its Reservation's
 * key, so a drawer opened on an arriving Guest follows them through check-in
 * and shows them in house rather than gone (RC-S1-65).
 */
export function barsByKey(calendar: RoomCalendar): Map<string, PlacedEntry> {
  const found = new Map<string, PlacedEntry>();
  const bookedAs = new Map<string, PlacedEntry>();
  const add = (
    bar: RoomCalendarBar,
    unit: RoomCalendarUnit,
    room: RoomCalendarUnit | null,
  ) => {
    const entry = { bar, unit, room };
    found.set(barKey(bar), entry);
    if (bar.kind === "stay" && bar.reservationId) {
      bookedAs.set(`reservation:${bar.reservationId}`, entry);
    }
  };
  for (const room of calendar.units) {
    for (const bar of room.bars) add(bar, room, null);
    for (const bed of room.beds) {
      for (const bar of bed.bars) add(bar, bed, room);
    }
  }
  for (const [key, entry] of bookedAs) {
    if (!found.has(key)) found.set(key, entry);
  }
  return found;
}
