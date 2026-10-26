/**
 * Moving a bar on the room calendar, without React: what a drag proposes, and
 * what the calendar already knows against it. Rows are named
 * docs/features/room-calendar/edge-cases.csv, RC-S3-*.
 *
 * Nights are `[startsOn, endsOn)`, so a departure day is free for an arrival;
 * the edges of that rule are what most of these pin.
 */
import { describe, expect, it } from "vitest";
import type {
  RoomCalendar,
  RoomCalendarBar,
  RoomCalendarReservationBar,
  RoomCalendarStayBar,
  RoomCalendarUnit,
} from "../../packages/ranza/reservations/src";
import {
  calendarRows,
  spanOf,
  type PlacedEntry,
} from "../../apps/operator-workspace/src/features/room-calendar/layout";
import {
  bookingConflicts,
  bookingGhost,
  confirmsInPlace,
  departureConflicts,
  ghostOf,
  guestConflicts,
  hasEndHandle,
  nightsDragged,
  placeOfUnit,
  proposeMove,
  type MoveRequest,
} from "../../apps/operator-workspace/src/features/room-calendar/move";
import {
  parseView,
  viewSearch,
} from "../../apps/operator-workspace/src/features/room-calendar/view";

const TODAY = "2026-09-24";
const FROM = "2026-09-21";
const DAYS = 14;
const day = (offset: number) => {
  const moved = new Date(`${TODAY}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + offset);
  return moved.toISOString().slice(0, 10);
};

function booking(
  overrides: Partial<RoomCalendarReservationBar> &
    Pick<RoomCalendarReservationBar, "startsOn" | "endsOn">,
): RoomCalendarReservationBar {
  return {
    kind: "reservation",
    reservationId: crypto.randomUUID(),
    reference: "RES-0001",
    expectedArrival: null,
    status: "confirmed",
    stayType: "guest",
    guestName: "Booked Guest",
    heldUntil: overrides.endsOn,
    overdue: false,
    holds: overrides.status !== "requested",
    overlaps: false,
    clashesWith: null,
    bookedWhileBlocked: false,
    ...overrides,
  };
}

function inHouse(
  overrides: Partial<RoomCalendarStayBar> &
    Pick<RoomCalendarStayBar, "startsOn" | "endsOn">,
): RoomCalendarStayBar {
  return {
    kind: "stay",
    stayId: crypto.randomUUID(),
    reservationId: crypto.randomUUID(),
    stayType: "guest",
    guestName: "House Guest",
    heldUntil: overrides.endsOn,
    overdue: false,
    holds: true,
    overlaps: false,
    clashesWith: null,
    bookedWhileBlocked: false,
    current: true,
    arrivedOn: overrides.startsOn,
    status: "in_house",
    bookedStartsOn: overrides.startsOn,
    bookedEndsOn: overrides.endsOn,
    balance: null,
    ...overrides,
  };
}

function unit(
  name: string,
  overrides: Partial<RoomCalendarUnit> = {},
): RoomCalendarUnit {
  return {
    unitId: `unit-${name}`,
    name,
    unitType: "room",
    building: null,
    floor: null,
    status: "available",
    statusReason: null,
    sellable: true,
    bars: [],
    beds: [],
    ...overrides,
  };
}

function calendarOf(...units: RoomCalendarUnit[]): RoomCalendar {
  return {
    today: TODAY,
    from: FROM,
    days: DAYS,
    sellable: units.length,
    nights: [],
    overlaps: 0,
    bookedWhileBlocked: 0,
    units,
    mayAmend: true,
  };
}

function entryOf(
  bar: RoomCalendarBar,
  where: RoomCalendarUnit,
  room: RoomCalendarUnit | null = null,
): PlacedEntry {
  return { bar, unit: where, room };
}

describe("RC-S3-03: nights are half-open, so a departure day is free for an arrival", () => {
  const mover = booking({ startsOn: day(1), endsOn: day(3) });

  it("nothing in the way: an empty Unit takes the booking", () => {
    const target = unit("102");
    expect(
      bookingConflicts(calendarOf(target), mover, {
        unitId: target.unitId,
        startsOn: day(1),
        endsOn: day(3),
      }),
    ).toEqual([]);
  });

  it("one booking on a night they share is named, with its Guest", () => {
    const target = unit("102", {
      bars: [booking({ startsOn: day(2), endsOn: day(5), guestName: "Ada" })],
    });
    expect(
      bookingConflicts(calendarOf(target), mover, {
        unitId: target.unitId,
        startsOn: day(1),
        endsOn: day(3),
      }),
    ).toEqual([{ kind: "booked", guest: "Ada", from: day(2), to: day(5) }]);
  });

  it("arriving the day another booking leaves is free", () => {
    const target = unit("102", {
      bars: [booking({ startsOn: day(-1), endsOn: day(1) })],
    });
    expect(
      bookingConflicts(calendarOf(target), mover, {
        unitId: target.unitId,
        startsOn: day(1),
        endsOn: day(3),
      }),
    ).toEqual([]);
  });

  it("leaving the day another booking arrives is free", () => {
    const target = unit("102", {
      bars: [booking({ startsOn: day(3), endsOn: day(6) })],
    });
    expect(
      bookingConflicts(calendarOf(target), mover, {
        unitId: target.unitId,
        startsOn: day(1),
        endsOn: day(3),
      }),
    ).toEqual([]);
  });

  it("one shared night, at either edge, is a conflict", () => {
    const target = unit("102", {
      bars: [booking({ startsOn: day(2), endsOn: day(4) })],
    });
    expect(
      bookingConflicts(calendarOf(target), mover, {
        unitId: target.unitId,
        startsOn: day(1),
        endsOn: day(3),
      }),
    ).toHaveLength(1);
    expect(
      bookingConflicts(calendarOf(target), mover, {
        unitId: target.unitId,
        startsOn: day(3),
        endsOn: day(5),
      }),
    ).toHaveLength(1);
  });

  it("many bookings: only the ones sharing a night matter, and the first is named", () => {
    const target = unit("102", {
      bars: [
        booking({ startsOn: day(-5), endsOn: day(0), guestName: "Before" }),
        booking({ startsOn: day(2), endsOn: day(3), guestName: "Middle" }),
        booking({ startsOn: day(2), endsOn: day(4), guestName: "Also" }),
        booking({ startsOn: day(8), endsOn: day(9), guestName: "After" }),
      ],
    });
    expect(
      bookingConflicts(calendarOf(target), mover, {
        unitId: target.unitId,
        startsOn: day(1),
        endsOn: day(3),
      }),
    ).toEqual([{ kind: "booked", guest: "Middle", from: day(2), to: day(3) }]);
  });

  it("a Guest in house is somebody staying, not a booking", () => {
    const target = unit("102", {
      bars: [inHouse({ startsOn: day(-1), endsOn: day(2), guestName: "Eve" })],
    });
    expect(
      bookingConflicts(calendarOf(target), mover, {
        unitId: target.unitId,
        startsOn: day(1),
        endsOn: day(3),
      }),
    ).toEqual([{ kind: "occupied", guest: "Eve", from: day(-1), to: day(2) }]);
  });

  it("a requested booking holds nothing, and a departed Stay is history", () => {
    const target = unit("102", {
      bars: [
        booking({ startsOn: day(1), endsOn: day(3), status: "requested" }),
        inHouse({ startsOn: day(0), endsOn: day(3), status: "departed" }),
      ],
    });
    expect(
      bookingConflicts(calendarOf(target), mover, {
        unitId: target.unitId,
        startsOn: day(1),
        endsOn: day(3),
      }),
    ).toEqual([]);
  });

  it("the booking never conflicts with itself, so its own Unit can take new dates", () => {
    const own = unit("101", { bars: [mover] });
    expect(
      bookingConflicts(calendarOf(own), mover, {
        unitId: own.unitId,
        startsOn: day(2),
        endsOn: day(4),
      }),
    ).toEqual([]);
  });

  it("an open-ended booking runs into any later one", () => {
    const resident = booking({
      startsOn: day(1),
      endsOn: null,
      stayType: "resident",
    });
    const target = unit("102", {
      bars: [
        booking({ startsOn: day(40), endsOn: day(42), heldUntil: day(42) }),
      ],
    });
    expect(
      bookingConflicts(calendarOf(target), resident, {
        unitId: target.unitId,
        startsOn: day(1),
        endsOn: null,
      }),
    ).toHaveLength(1);
  });

  it("an open-ended bar in the way holds every night after it begins", () => {
    const target = unit("102", {
      bars: [
        inHouse({
          startsOn: day(-3),
          endsOn: null,
          heldUntil: null,
          stayType: "resident",
        }),
      ],
    });
    expect(
      bookingConflicts(calendarOf(target), mover, {
        unitId: target.unitId,
        startsOn: day(20),
        endsOn: day(22),
      }),
    ).toEqual([
      { kind: "occupied", guest: "House Guest", from: day(-3), to: null },
    ]);
  });
});

describe("RC-S3-05 and RC-S3-06: a Unit that cannot take a booking, and the past", () => {
  const mover = booking({ startsOn: day(1), endsOn: day(3) });

  it("a blocked Unit is out of use from today on", () => {
    const target = unit("102", { status: "blocked" });
    expect(
      bookingConflicts(calendarOf(target), mover, {
        unitId: target.unitId,
        startsOn: day(1),
        endsOn: day(3),
      }),
    ).toEqual([{ kind: "outOfUse", unit: "102", status: "blocked" }]);
  });

  it("an out-of-service Unit is named as such", () => {
    const target = unit("102", { status: "out_of_service" });
    expect(
      bookingConflicts(calendarOf(target), mover, {
        unitId: target.unitId,
        startsOn: day(0),
        endsOn: day(1),
      }),
    ).toEqual([{ kind: "outOfUse", unit: "102", status: "out_of_service" }]);
  });

  it("a block has no dates, so nights wholly before today are not its", () => {
    const target = unit("102", { status: "blocked" });
    expect(
      bookingConflicts(calendarOf(target), mover, {
        unitId: target.unitId,
        startsOn: day(-3),
        endsOn: day(0),
      }),
    ).toEqual([{ kind: "past" }]);
  });

  it("a room let by the bed is not a Unit a booking is placed on", () => {
    const room = unit("201", {
      sellable: false,
      beds: [unit("A")],
      status: "blocked",
    });
    expect(
      bookingConflicts(calendarOf(room), mover, {
        unitId: room.unitId,
        startsOn: day(1),
        endsOn: day(3),
      }),
    ).toEqual([{ kind: "notSellable", unit: "201" }]);
  });

  it("one of its beds takes the booking", () => {
    const bed = unit("A", { unitType: "bed" });
    const room = unit("201", { sellable: false, beds: [bed] });
    expect(
      bookingConflicts(calendarOf(room), mover, {
        unitId: bed.unitId,
        startsOn: day(1),
        endsOn: day(3),
      }),
    ).toEqual([]);
  });

  it("an arrival before today is refused, today itself is not", () => {
    const target = unit("102");
    const calendar = calendarOf(target);
    expect(
      bookingConflicts(calendar, mover, {
        unitId: target.unitId,
        startsOn: day(-1),
        endsOn: day(2),
      }),
    ).toEqual([{ kind: "past" }]);
    expect(
      bookingConflicts(calendar, mover, {
        unitId: target.unitId,
        startsOn: day(0),
        endsOn: day(2),
      }),
    ).toEqual([]);
  });

  it("a blocked Unit and a booking in the way are both told", () => {
    const target = unit("102", {
      status: "blocked",
      bars: [booking({ startsOn: day(1), endsOn: day(2), guestName: "Ada" })],
    });
    expect(
      bookingConflicts(calendarOf(target), mover, {
        unitId: target.unitId,
        startsOn: day(1),
        endsOn: day(3),
      }).map((conflict) => conflict.kind),
    ).toEqual(["outOfUse", "booked"]);
  });
});

describe("RC-S3-07: moving a Guest in house is judged for the nights from tonight", () => {
  it("a free Unit takes them", () => {
    const stay = inHouse({ startsOn: day(-2), endsOn: day(3) });
    const target = unit("102");
    expect(guestConflicts(calendarOf(target), stay, target.unitId)).toEqual([]);
  });

  it("a booking that begins on their last night is in the way; one that begins on the day they leave is not", () => {
    const stay = inHouse({ startsOn: day(-2), endsOn: day(3) });
    const taken = unit("102", {
      bars: [booking({ startsOn: day(2), endsOn: day(5), guestName: "Ada" })],
    });
    const changeover = unit("103", {
      bars: [booking({ startsOn: day(3), endsOn: day(5) })],
    });
    const calendar = calendarOf(taken, changeover);
    expect(guestConflicts(calendar, stay, taken.unitId)).toEqual([
      { kind: "booked", guest: "Ada", from: day(2), to: day(5) },
    ]);
    expect(guestConflicts(calendar, stay, changeover.unitId)).toEqual([]);
  });

  it("nights already slept do not count against the Unit they are moving to", () => {
    const stay = inHouse({ startsOn: day(-2), endsOn: day(3) });
    const target = unit("102", {
      bars: [booking({ startsOn: day(-5), endsOn: day(0) })],
    });
    expect(guestConflicts(calendarOf(target), stay, target.unitId)).toEqual([]);
  });

  it("an overdue Guest still holds tonight", () => {
    const overdue = inHouse({
      startsOn: day(-4),
      endsOn: day(-1),
      heldUntil: day(1),
      overdue: true,
    });
    const target = unit("102", {
      bars: [booking({ startsOn: day(0), endsOn: day(2) })],
    });
    expect(
      guestConflicts(calendarOf(target), overdue, target.unitId),
    ).toHaveLength(1);
  });

  it("an out-of-service Unit and a room let by the bed are told", () => {
    const stay = inHouse({ startsOn: day(-2), endsOn: day(3) });
    const broken = unit("102", { status: "out_of_service" });
    const dorm = unit("201", { sellable: false, beds: [unit("A")] });
    const calendar = calendarOf(broken, dorm);
    expect(guestConflicts(calendar, stay, broken.unitId)).toEqual([
      { kind: "outOfUse", unit: "102", status: "out_of_service" },
    ]);
    expect(guestConflicts(calendar, stay, dorm.unitId)).toEqual([
      { kind: "notSellable", unit: "201" },
    ]);
  });
});

describe("RC-S3-08: pulling the end of a Guest's stay", () => {
  const stay = inHouse({ startsOn: day(-2), endsOn: day(3) });
  const own = unit("101", { bars: [stay] });

  it("shortening never collides with anything", () => {
    const calendar = calendarOf(
      unit("101", {
        bars: [stay, booking({ startsOn: day(3), endsOn: day(5) })],
      }),
    );
    expect(
      departureConflicts(calendar, calendar.units[0]!, stay, day(2)),
    ).toEqual([]);
  });

  it("extending into the next booking's first night collides; up to its arrival day does not", () => {
    const calendar = calendarOf(
      unit("101", {
        bars: [
          stay,
          booking({ startsOn: day(5), endsOn: day(7), guestName: "Ada" }),
        ],
      }),
    );
    const room = calendar.units[0]!;
    expect(departureConflicts(calendar, room, stay, day(5))).toEqual([]);
    expect(departureConflicts(calendar, room, stay, day(6))).toEqual([
      { kind: "booked", guest: "Ada", from: day(5), to: day(7) },
    ]);
  });

  it("leaving today is a check-out, and so is leaving before it", () => {
    const calendar = calendarOf(own);
    expect(departureConflicts(calendar, own, stay, day(0))).toEqual([
      { kind: "leavesToday" },
    ]);
    expect(departureConflicts(calendar, own, stay, day(-1))).toEqual([
      { kind: "leavesToday" },
    ]);
    expect(departureConflicts(calendar, own, stay, day(1))).toEqual([]);
  });

  it("giving an open-ended stay an end, or taking it away, adds nothing to collide with when it grows no further", () => {
    const resident = inHouse({
      startsOn: day(-2),
      endsOn: null,
      heldUntil: null,
      stayType: "resident",
    });
    const room = unit("101", { bars: [resident] });
    expect(
      departureConflicts(calendarOf(room), room, resident, day(10)),
    ).toEqual([]);
  });
});

describe("RC-S3-01: what a drag proposes", () => {
  const room = unit("101");
  const other = unit("102");
  const confirmed = booking({ startsOn: day(2), endsOn: day(4) });

  it("a booking carried to another row and day takes both, keeping its length", () => {
    const request = proposeMove(
      entryOf(confirmed, room),
      "move",
      3,
      other.unitId,
    );
    expect(request).toMatchObject({
      kind: "booking",
      target: { unitId: other.unitId, startsOn: day(5), endsOn: day(7) },
    });
  });

  it("a booking put back where it was proposes nothing", () => {
    expect(
      proposeMove(entryOf(confirmed, room), "move", 0, room.unitId),
    ).toBeNull();
  });

  it("a booking moved along its own row keeps its Unit", () => {
    expect(
      proposeMove(entryOf(confirmed, room), "move", -1, room.unitId),
    ).toMatchObject({
      target: { unitId: room.unitId, startsOn: day(1), endsOn: day(3) },
    });
  });

  it("an open-ended booking moves with no end", () => {
    const resident = booking({ startsOn: day(2), endsOn: null });
    expect(
      proposeMove(entryOf(resident, room), "move", 2, room.unitId),
    ).toMatchObject({ target: { startsOn: day(4), endsOn: null } });
  });

  it("pulling a booking's end changes its departure and nothing else", () => {
    expect(
      proposeMove(entryOf(confirmed, room), "resize", 2, other.unitId),
    ).toMatchObject({
      kind: "booking",
      target: { unitId: room.unitId, startsOn: day(2), endsOn: day(6) },
    });
  });

  it("pulling a booking's end back past its arrival still leaves it one night", () => {
    expect(
      proposeMove(entryOf(confirmed, room), "resize", -5, room.unitId),
    ).toMatchObject({ target: { startsOn: day(2), endsOn: day(3) } });
  });

  it("a Guest in house dragged to another row is moved there, whatever the days", () => {
    const guest = inHouse({ startsOn: day(-2), endsOn: day(3) });
    expect(
      proposeMove(entryOf(guest, room), "move", 4, other.unitId),
    ).toMatchObject({ kind: "guest", unitId: other.unitId });
  });

  it("a Guest in house dragged along their own row proposes nothing: they keep the day they arrived", () => {
    const guest = inHouse({ startsOn: day(-2), endsOn: day(3) });
    expect(
      proposeMove(entryOf(guest, room), "move", 4, room.unitId),
    ).toBeNull();
  });

  it("pulling a Guest's end proposes a departure, measured from where the bar is drawn to", () => {
    const guest = inHouse({ startsOn: day(-2), endsOn: day(3) });
    expect(
      proposeMove(entryOf(guest, room), "resize", 2, room.unitId),
    ).toMatchObject({ kind: "departure", endsOn: day(5) });
    const overdue = inHouse({
      startsOn: day(-4),
      endsOn: day(-1),
      heldUntil: day(1),
      overdue: true,
    });
    expect(
      proposeMove(entryOf(overdue, room), "resize", 1, room.unitId),
    ).toMatchObject({ kind: "departure", endsOn: day(2) });
  });

  it("a Stay that has ended cannot be moved, and says why", () => {
    const left = inHouse({
      startsOn: day(-5),
      endsOn: day(-1),
      status: "departed",
    });
    const request = proposeMove(entryOf(left, room), "move", 1, other.unitId);
    expect(request).toMatchObject({
      kind: "refused",
      conflicts: [{ kind: "cannotMove", why: "ended" }],
    });
  });

  it("the stretch of a room a Guest was moved out of is history", () => {
    const stretch = inHouse({
      startsOn: day(-5),
      endsOn: day(-2),
      current: false,
      status: "departed",
    });
    expect(
      proposeMove(entryOf(stretch, room), "move", 0, other.unitId),
    ).toMatchObject({ kind: "refused" });
  });

  it("a Stay with no booking behind it cannot be changed by a command", () => {
    const orphan = inHouse({
      startsOn: day(-2),
      endsOn: day(3),
      reservationId: null,
    });
    expect(
      proposeMove(entryOf(orphan, room), "move", 0, other.unitId),
    ).toMatchObject({
      kind: "refused",
      conflicts: [{ kind: "cannotMove", why: "noBooking" }],
    });
  });
});

describe("RC-S3-02: the outline a drag draws", () => {
  const room = unit("101");
  const other = unit("102", {
    bars: [booking({ startsOn: day(2), endsOn: day(4) })],
  });
  const calendar = calendarOf(room, other);

  it("sits on the row and the half-days the booking would take", () => {
    const confirmed = booking({ startsOn: day(0), endsOn: day(1) });
    const request = proposeMove(
      entryOf(confirmed, room),
      "move",
      6,
      other.unitId,
    ) as MoveRequest;
    const ghost = ghostOf(calendar, request);
    expect(ghost.unitId).toBe(other.unitId);
    expect(ghost.span).toEqual(spanOf(day(6), day(7), FROM, DAYS));
    expect(ghost.blocked).toBe(false);
  });

  it("is marked blocked when the calendar already knows it cannot go there", () => {
    const confirmed = booking({ startsOn: day(0), endsOn: day(2) });
    const request = proposeMove(
      entryOf(confirmed, room),
      "move",
      2,
      other.unitId,
    ) as MoveRequest;
    expect(ghostOf(calendar, request).blocked).toBe(true);
  });

  it("has no span in view when the nights are off the window", () => {
    const confirmed = booking({ startsOn: day(0), endsOn: day(1) });
    const request = proposeMove(
      entryOf(confirmed, room),
      "move",
      30,
      room.unitId,
    ) as MoveRequest;
    const { span } = ghostOf(calendar, request);
    expect(span.start >= span.end).toBe(true);
  });

  it("an end handle is offered only where the end is on the grid", () => {
    const lastDay = day(10);
    expect(
      hasEndHandle(booking({ startsOn: day(0), endsOn: day(4) }), lastDay),
    ).toBe(true);
    expect(
      hasEndHandle(booking({ startsOn: day(0), endsOn: day(30) }), lastDay),
    ).toBe(false);
    expect(
      hasEndHandle(booking({ startsOn: day(0), endsOn: null }), lastDay),
    ).toBe(false);
    expect(
      hasEndHandle(
        inHouse({ startsOn: day(-5), endsOn: day(-1), status: "departed" }),
        lastDay,
      ),
    ).toBe(false);
  });

  it("names a bed by its room", () => {
    const bed = unit("A", { unitType: "bed" });
    const dorm = unit("201", { sellable: false, beds: [bed] });
    const found = calendarOf(dorm);
    expect(placeOfUnit(found, bed.unitId)).toBe("201 · A");
    expect(placeOfUnit(found, dorm.unitId)).toBe("201");
    expect(placeOfUnit(found, "missing")).toBeNull();
  });
});

describe("RC-S3-14: filters by Unit type and state", () => {
  const LENGTHS = [7, 14, 30];
  const view = (params: Record<string, string>) =>
    parseView(params, {}, LENGTHS, 14);

  const king = unit("101");
  const suite = unit("301", { unitType: "suite" });
  const blocked = unit("102", { status: "blocked" });
  const bed = unit("A", { unitType: "bed", status: "out_of_service" });
  const dorm = unit("201", { sellable: false, beds: [bed] });
  const calendar = calendarOf(king, blocked, dorm, suite);
  const names = (params: Record<string, string>) =>
    calendarRows(calendar, view(params))
      .flatMap((row) => (row.kind === "unit" ? [row.unit.name] : []))
      .filter((name) => !["A"].includes(name));

  it("no filter shows every Unit", () => {
    expect(names({})).toEqual(["101", "102", "201", "301"]);
  });

  it("a type keeps the Units of that type", () => {
    expect(names({ type: "suite" })).toEqual(["301"]);
  });

  it("a state keeps the Units in that state", () => {
    expect(names({ state: "blocked" })).toEqual(["102"]);
  });

  it("a room is kept when one of its beds is what was asked for, with its beds beside it", () => {
    const rows = calendarRows(calendar, view({ type: "bed" }));
    expect(
      rows.flatMap((row) => (row.kind === "unit" ? [row.unit.name] : [])),
    ).toEqual(["201", "A"]);
    expect(
      calendarRows(calendar, view({ state: "out_of_service" })).length,
    ).toBe(2);
  });

  it("type and state together narrow further", () => {
    expect(names({ type: "room", state: "blocked" })).toEqual(["102"]);
    expect(names({ type: "suite", state: "blocked" })).toEqual([]);
  });

  it("anything that is not a type or a state is dropped on its own, keeping the rest", () => {
    const parsed = view({ type: "castle", state: "blocked", floor: "3" });
    expect(parsed.unitType).toBeNull();
    expect(parsed.unitState).toBe("blocked");
    expect(parsed.floor).toBe("3");
  });

  it("the filters are in the link and a default view leaves them out", () => {
    const search = new URLSearchParams(
      viewSearch(view({ type: "suite", state: "available" }), "p", 14),
    );
    expect(search.get("type")).toBe("suite");
    expect(search.get("state")).toBe("available");
    expect(viewSearch(view({}), "p", 14)).toBe("property=p");
  });
});

describe("RC-S5-02: nights dragged across a free row", () => {
  const room = unit("101", {
    bars: [booking({ startsOn: day(4), endsOn: day(6) })],
  });
  const calendar = calendarOf(room);

  it("are the nights from the earlier day to the morning after the later, either way dragged", () => {
    const right = nightsDragged(room.unitId, day(1), day(3), TODAY);
    const left = nightsDragged(room.unitId, day(3), day(1), TODAY);
    expect(right).toEqual({
      unitId: room.unitId,
      startsOn: day(1),
      endsOn: day(4),
    });
    expect(left).toEqual(right);
  });

  it("one day pressed and let go on is one night", () => {
    expect(nightsDragged(room.unitId, day(2), day(2), TODAY)).toMatchObject({
      startsOn: day(2),
      endsOn: day(3),
    });
  });

  it("never begin before today, even dragged back past it", () => {
    expect(nightsDragged(room.unitId, day(2), day(-3), TODAY)).toMatchObject({
      startsOn: TODAY,
      endsOn: day(3),
    });
  });

  it("free nights draw an open outline, and up to the next arrival is free", () => {
    const free = bookingGhost(
      calendar,
      nightsDragged(room.unitId, day(1), day(3), TODAY),
    );
    expect(free.unitId).toBe(room.unitId);
    expect(free.span).toEqual(spanOf(day(1), day(4), FROM, DAYS));
    expect(free.blocked).toBe(false);
  });

  it("a night already booked marks the outline, as a bar's drag does", () => {
    const target = nightsDragged(room.unitId, day(2), day(4), TODAY);
    expect(bookingGhost(calendar, target).blocked).toBe(true);
    expect(bookingConflicts(calendar, null, target)).toEqual([
      { kind: "booked", guest: "Booked Guest", from: day(4), to: day(6) },
    ]);
  });

  it("a blocked room marks it too", () => {
    const blocked = unit("102", { status: "blocked" });
    const target = nightsDragged(blocked.unitId, day(1), day(2), TODAY);
    expect(bookingGhost(calendarOf(blocked), target).blocked).toBe(true);
  });
});

describe("RC-S5-04: which drops confirm in place", () => {
  const room = unit("101");
  const other = unit("102");
  const guest = inHouse({ startsOn: day(-1), endsOn: day(2) });
  const confirmed = booking({ startsOn: day(3), endsOn: day(5) });
  room.bars.push(guest, confirmed);
  const calendar = calendarOf(room, other);

  it("one more night for a Guest in house, with nothing in the way", () => {
    const request = proposeMove(
      entryOf(guest, room),
      "resize",
      1,
      room.unitId,
    ) as MoveRequest;
    expect(confirmsInPlace(calendar, request, "resize")).toBe(true);
  });

  it("not a pull into the next booking: that opens the dialog that names it", () => {
    const request = proposeMove(
      entryOf(guest, room),
      "resize",
      2,
      room.unitId,
    ) as MoveRequest;
    expect(confirmsInPlace(calendar, request, "resize")).toBe(false);
  });

  it("not a pull back to today, which is a check-out", () => {
    const request = proposeMove(
      entryOf(guest, room),
      "resize",
      -2,
      room.unitId,
    ) as MoveRequest;
    expect(confirmsInPlace(calendar, request, "resize")).toBe(false);
  });

  it("a booking's end pulled along its own row", () => {
    const request = proposeMove(
      entryOf(confirmed, room),
      "resize",
      -1,
      room.unitId,
    ) as MoveRequest;
    expect(confirmsInPlace(calendar, request, "resize")).toBe(true);
  });

  it("not a booking carried to other days or another room", () => {
    const later = proposeMove(
      entryOf(confirmed, room),
      "move",
      2,
      room.unitId,
    ) as MoveRequest;
    const elsewhere = proposeMove(
      entryOf(confirmed, room),
      "move",
      0,
      other.unitId,
    ) as MoveRequest;
    expect(confirmsInPlace(calendar, later, "move")).toBe(false);
    expect(confirmsInPlace(calendar, elsewhere, "move")).toBe(false);
  });

  it("not a Guest moved to another room, which asks for a reason", () => {
    const request = proposeMove(
      entryOf(guest, room),
      "move",
      0,
      other.unitId,
    ) as MoveRequest;
    expect(confirmsInPlace(calendar, request, "move")).toBe(false);
  });
});
