import type {
  RoomCalendar,
  RoomCalendarBar,
  RoomCalendarReservationBar,
  RoomCalendarStayBar,
  RoomCalendarUnit,
} from "../../server/viewer";
import { unitLabel } from "../front-office/unit-label";
import {
  barKey,
  shiftDay,
  spanOf,
  type PlacedEntry,
  type Span,
} from "./layout";

/**
 * Moving a bar on the room calendar, without React: what a drag proposes, and
 * what the calendar already knows against it (RC-S3-*).
 *
 * Nothing here writes. A drag only proposes; the dialogs Change booking, Move
 * Guest and Change departure preview the proposal with the database and save it
 * through the commands of ADR 0039. What this adds is the part the calendar
 * read already holds, so the desk is told at once and a drop on a lost cause
 * is never left to a round trip. The database still decides on save.
 *
 * Every date is a `YYYY-MM-DD` string, compared as one. Nights are
 * `[startsOn, endsOn)`, so a departure day is free for an arrival (RC-S3-03).
 */

/** What dragging a bar does: carry it somewhere else, or pull its end. */
export type DragMode = "move" | "resize";

/** Nights a booking would hold: its Unit and `[startsOn, endsOn)`; null is open-ended. */
export interface BookingTarget {
  unitId: string;
  startsOn: string;
  endsOn: string | null;
}

export type MoveConflict =
  /** A booking's arrival must be today or later. */
  | { kind: "past" }
  /** A room let by the bed: its beds are what a booking is placed on. */
  | { kind: "notSellable"; unit: string }
  | {
      kind: "outOfUse";
      unit: string;
      status: "blocked" | "out_of_service";
    }
  /** A confirmed booking holds some of those nights. */
  | { kind: "booked"; guest: string | null }
  /** Somebody in house holds some of those nights. */
  | { kind: "occupied"; guest: string | null }
  /** Leaving today is a check-out, which reviews the bill. */
  | { kind: "leavesToday" }
  /** The bar is not something a command can change. */
  | { kind: "cannotMove"; why: "ended" | "noBooking" };

/** A bar and where it is, narrowed to the kind of bar a command changes. */
export type BookingEntry = PlacedEntry & { bar: RoomCalendarReservationBar };
export type GuestEntry = PlacedEntry & {
  bar: RoomCalendarStayBar & { reservationId: string };
};

/** What a drop asks for, by the command that would answer it. */
export type MoveRequest =
  | { kind: "booking"; entry: BookingEntry; target: BookingTarget }
  | { kind: "guest"; entry: GuestEntry; unitId: string }
  | { kind: "departure"; entry: GuestEntry; endsOn: string | null }
  | {
      kind: "refused";
      entry: PlacedEntry;
      target: BookingTarget;
      conflicts: MoveConflict[];
    };

function isBooking(bar: RoomCalendarBar): bar is RoomCalendarReservationBar {
  return bar.kind === "reservation";
}

/** The Guest in house in the room now, whose Stay a command can change. */
export function isMovableGuest(
  bar: RoomCalendarBar,
): bar is RoomCalendarStayBar & { reservationId: string } {
  return (
    bar.kind === "stay" &&
    bar.status === "in_house" &&
    bar.current &&
    bar.reservationId !== null
  );
}

/** Whether a command exists that changes this bar at all. */
export function isMovable(bar: RoomCalendarBar): boolean {
  return isBooking(bar) || isMovableGuest(bar);
}

/**
 * Whether the bar has an end that can be pulled: one that is on the grid, not
 * running past it or open-ended, where there is no edge to take hold of.
 */
export function hasEndHandle(bar: RoomCalendarBar, lastDay: string): boolean {
  return isMovable(bar) && bar.heldUntil !== null && bar.heldUntil <= lastDay;
}

function unitById(
  units: readonly RoomCalendarUnit[],
  unitId: string,
): RoomCalendarUnit | null {
  for (const unit of units) {
    if (unit.unitId === unitId) return unit;
    const bed = unitById(unit.beds, unitId);
    if (bed) return bed;
  }
  return null;
}

/** A Unit as the desk names it: a bed by its room and its own name. */
export function placeOfUnit(
  calendar: RoomCalendar,
  unitId: string,
): string | null {
  for (const room of calendar.units) {
    if (room.unitId === unitId) return room.name;
    const bed = room.beds.find((candidate) => candidate.unitId === unitId);
    if (bed) return unitLabel(room.name, bed.name);
  }
  return null;
}

/** Somebody booked or staying: what confirming a booking is refused against. */
function occupies(bar: RoomCalendarBar): boolean {
  return bar.holds && !(bar.kind === "stay" && bar.status === "departed");
}

/**
 * Whether `[startsOn, until)` and the bar's own nights share one. A changeover
 * shares none, and `null` runs on without end.
 */
function sharesANight(
  bar: RoomCalendarBar,
  startsOn: string,
  until: string | null,
): boolean {
  return (
    (until === null || bar.startsOn < until) &&
    (bar.heldUntil === null || startsOn < bar.heldUntil)
  );
}

function aBarInTheWay(
  unit: RoomCalendarUnit,
  mover: RoomCalendarBar,
  startsOn: string,
  until: string | null,
): MoveConflict | null {
  const way = unit.bars.find(
    (bar) =>
      barKey(bar) !== barKey(mover) &&
      occupies(bar) &&
      sharesANight(bar, startsOn, until),
  );
  if (!way) return null;
  return way.kind === "stay"
    ? { kind: "occupied", guest: way.guestName }
    : { kind: "booked", guest: way.guestName };
}

/** The Unit is out of use on a night from today on, inside `[startsOn, until)`. */
function outOfUseConflict(
  unit: RoomCalendarUnit,
  today: string,
  startsOn: string,
  until: string | null,
): MoveConflict | null {
  if (unit.status !== "blocked" && unit.status !== "out_of_service") {
    return null;
  }
  // A block has no dates, so only the nights from today on are its.
  const first = startsOn > today ? startsOn : today;
  if (until !== null && until <= first) return null;
  return { kind: "outOfUse", unit: unit.name, status: unit.status };
}

/** What stands in the way of putting a booking on these nights of this Unit. */
export function bookingConflicts(
  calendar: RoomCalendar,
  bar: RoomCalendarReservationBar,
  target: BookingTarget,
): MoveConflict[] {
  const unit = unitById(calendar.units, target.unitId);
  const conflicts: MoveConflict[] = [];
  if (target.startsOn < calendar.today) conflicts.push({ kind: "past" });
  if (!unit) return conflicts;
  if (!unit.sellable) {
    conflicts.push({ kind: "notSellable", unit: unit.name });
    return conflicts;
  }
  const blocked = outOfUseConflict(
    unit,
    calendar.today,
    target.startsOn,
    target.endsOn,
  );
  if (blocked) conflicts.push(blocked);
  const way = aBarInTheWay(unit, bar, target.startsOn, target.endsOn);
  if (way) conflicts.push(way);
  return conflicts;
}

/**
 * What stands in the way of moving a Guest in house to this Unit for the rest
 * of their stay, from tonight. Whether the room is ready is housekeeping's to
 * say and the preview's to show.
 */
export function guestConflicts(
  calendar: RoomCalendar,
  bar: RoomCalendarStayBar,
  unitId: string,
): MoveConflict[] {
  const unit = unitById(calendar.units, unitId);
  if (!unit) return [];
  if (!unit.sellable) return [{ kind: "notSellable", unit: unit.name }];
  const from = bar.startsOn > calendar.today ? bar.startsOn : calendar.today;
  const conflicts: MoveConflict[] = [];
  const blocked = outOfUseConflict(unit, calendar.today, from, bar.heldUntil);
  if (blocked) conflicts.push(blocked);
  const way = aBarInTheWay(unit, bar, from, bar.heldUntil);
  if (way) conflicts.push(way);
  return conflicts;
}

/**
 * What stands in the way of a Guest in house leaving on another day. Only the
 * nights added can collide: shortening frees nights and takes none.
 */
export function departureConflicts(
  calendar: RoomCalendar,
  unit: RoomCalendarUnit,
  bar: RoomCalendarStayBar,
  endsOn: string | null,
): MoveConflict[] {
  if (endsOn !== null && endsOn <= calendar.today) {
    return [{ kind: "leavesToday" }];
  }
  if (bar.heldUntil === null) return [];
  if (endsOn !== null && endsOn <= bar.heldUntil) return [];
  const way = aBarInTheWay(unit, bar, bar.heldUntil, endsOn);
  return way ? [way] : [];
}

/** Why a bar cannot be moved, when no command can change it. */
export function cannotMoveBecause(bar: RoomCalendarBar): MoveConflict {
  return {
    kind: "cannotMove",
    why:
      bar.kind === "stay" && bar.status === "in_house" ? "noBooking" : "ended",
  };
}

/**
 * What a drag proposes, or null when it proposes nothing: a bar put back where
 * it was. `dayShift` is how many days the pointer travelled, which a drag to
 * another row carries with it.
 *
 * A Guest in house keeps the day they arrived, so a drag across to another day
 * changes nothing of theirs; only another room, or the end of the stay, can.
 */
export function proposeMove(
  entry: PlacedEntry,
  mode: DragMode,
  dayShift: number,
  targetUnitId: string,
): MoveRequest | null {
  const { bar, unit } = entry;
  if (!isBooking(bar) && !isMovableGuest(bar)) {
    return {
      kind: "refused",
      entry,
      target: {
        unitId: targetUnitId,
        startsOn: shiftDay(bar.startsOn, mode === "move" ? dayShift : 0),
        endsOn: bar.endsOn === null ? null : shiftDay(bar.endsOn, dayShift),
      },
      conflicts: [cannotMoveBecause(bar)],
    };
  }

  if (isBooking(bar)) {
    const booking: BookingEntry = { ...entry, bar };
    if (mode === "resize") {
      if (dayShift === 0 || bar.heldUntil === null) return null;
      const endsOn = shiftDay(bar.heldUntil, dayShift);
      return {
        kind: "booking",
        entry: booking,
        target: {
          unitId: unit.unitId,
          startsOn: bar.startsOn,
          // A booking covers at least one night.
          endsOn: endsOn > bar.startsOn ? endsOn : shiftDay(bar.startsOn, 1),
        },
      };
    }
    if (dayShift === 0 && targetUnitId === unit.unitId) return null;
    return {
      kind: "booking",
      entry: booking,
      target: {
        unitId: targetUnitId,
        startsOn: shiftDay(bar.startsOn, dayShift),
        endsOn: bar.endsOn === null ? null : shiftDay(bar.endsOn, dayShift),
      },
    };
  }

  const guest: GuestEntry = { ...entry, bar };
  if (mode === "resize") {
    if (dayShift === 0 || bar.heldUntil === null) return null;
    return {
      kind: "departure",
      entry: guest,
      endsOn: shiftDay(bar.heldUntil, dayShift),
    };
  }
  return targetUnitId === unit.unitId
    ? null
    : { kind: "guest", entry: guest, unitId: targetUnitId };
}

/** What the calendar already knows against a proposal. */
export function conflictsOf(
  calendar: RoomCalendar,
  request: MoveRequest,
): MoveConflict[] {
  switch (request.kind) {
    case "booking":
      return bookingConflicts(calendar, request.entry.bar, request.target);
    case "guest":
      return guestConflicts(calendar, request.entry.bar, request.unitId);
    case "departure":
      return departureConflicts(
        calendar,
        request.entry.unit,
        request.entry.bar,
        request.endsOn,
      );
    case "refused":
      return request.conflicts;
  }
}

/** Where a drag would put the bar, and whether the calendar already knows it cannot go. */
export interface Ghost {
  unitId: string;
  span: Span;
  blocked: boolean;
}

export function ghostOf(calendar: RoomCalendar, request: MoveRequest): Ghost {
  const { bar, unit } = request.entry;
  const [unitId, startsOn, until] = (() => {
    switch (request.kind) {
      case "booking":
      case "refused":
        return [
          request.target.unitId,
          request.target.startsOn,
          request.target.endsOn,
        ] as const;
      case "guest":
        return [request.unitId, bar.startsOn, bar.heldUntil] as const;
      case "departure":
        return [unit.unitId, bar.startsOn, request.endsOn] as const;
    }
  })();
  return {
    unitId,
    span: spanOf(startsOn, until, calendar.from, calendar.days),
    blocked: conflictsOf(calendar, request).length > 0,
  };
}
