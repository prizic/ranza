/**
 * The room calendar's arithmetic without a database: which bars overlap,
 * which clash, what counts as free, and the order rows come in. The statement
 * that feeds it is proved in tests/integration/room-calendar.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  addDays,
  buildRoomCalendar,
  calendarLength,
  type CalendarUnitRow,
  type RawCalendarBar,
} from "../../packages/ranza/reservations/src/room-calendar";

const TODAY = "2026-09-24";
const FROM = "2026-09-21";

function bar(overrides: Partial<RawCalendarBar>): RawCalendarBar {
  return {
    kind: "reservation",
    reservationId: crypto.randomUUID(),
    stayId: null,
    status: "confirmed",
    stayType: "guest",
    guestName: "Guest",
    startsOn: TODAY,
    endsOn: addDays(TODAY, 2),
    heldUntil: addDays(TODAY, 2),
    overdue: false,
    bookedStartsOn: null,
    bookedEndsOn: null,
    balanceMinor: null,
    currency: null,
    folioClosed: null,
    ...overrides,
  };
}

function stay(overrides: Partial<RawCalendarBar>): RawCalendarBar {
  return bar({
    kind: "stay",
    stayId: crypto.randomUUID(),
    status: "in_house",
    ...overrides,
  });
}

function row(overrides: Partial<CalendarUnitRow>): CalendarUnitRow {
  return {
    unitId: crypto.randomUUID(),
    parentId: null,
    name: "101",
    unitType: "room",
    building: null,
    floor: null,
    status: "available",
    statusReason: null,
    hasChildren: false,
    today: TODAY,
    firstDay: FROM,
    bars: [],
    ...overrides,
  };
}

const build = (rows: CalendarUnitRow[], days = 14) =>
  buildRoomCalendar(rows, { from: FROM, days });

describe("dates", () => {
  it("moves across a month end and a leap day without a timezone", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("RC-S1-06: offers 7, 14 and 30 days and nothing else", () => {
    expect([7, 14, 30].map(calendarLength)).toEqual([7, 14, 30]);
    expect([null, 0, 13, 365, -7].map(calendarLength)).toEqual([
      14, 14, 14, 14, 14,
    ]);
  });

  it("RC-S1-05: reads the window the statement chose", () => {
    const calendar = build([row({})]);
    expect(calendar.from).toBe(FROM);
    expect(calendar.nights).toHaveLength(14);
    expect(calendar.nights[0]!.day).toBe(FROM);
    expect(calendar.nights[13]!.day).toBe(addDays(FROM, 13));
  });
});

describe("overlaps", () => {
  it("RC-S1-25: an in-house Stay and a booking on the same night overlap, once", () => {
    const calendar = build([
      row({
        bars: [
          stay({ startsOn: addDays(TODAY, -2), heldUntil: addDays(TODAY, 3) }),
          bar({ startsOn: addDays(TODAY, 1), heldUntil: addDays(TODAY, 4) }),
        ],
      }),
    ]);
    expect(calendar.units[0]!.bars.map((b) => b.overlaps)).toEqual([
      true,
      true,
    ]);
    expect(calendar.overlaps).toBe(1);
  });

  it("RC-S1-27: a changeover day is not an overlap", () => {
    const calendar = build([
      row({
        bars: [
          bar({ startsOn: TODAY, heldUntil: addDays(TODAY, 2) }),
          bar({ startsOn: addDays(TODAY, 2), heldUntil: addDays(TODAY, 4) }),
        ],
      }),
    ]);
    expect(calendar.overlaps).toBe(0);
    expect(calendar.units[0]!.bars.some((b) => b.overlaps)).toBe(false);
  });

  it("RC-S1-17: a bar with no end overlaps anything after it", () => {
    const calendar = build([
      row({
        bars: [
          stay({ startsOn: "2026-01-01", endsOn: null, heldUntil: null }),
          bar({ startsOn: addDays(TODAY, 5), heldUntil: addDays(TODAY, 6) }),
        ],
      }),
    ]);
    expect(calendar.overlaps).toBe(1);
  });

  it("does not count an overlap that falls wholly outside the window", () => {
    const calendar = build([
      row({
        bars: [
          stay({ startsOn: "2026-09-01", heldUntil: addDays(FROM, 1) }),
          bar({ startsOn: "2026-09-10", heldUntil: "2026-09-12" }),
        ],
      }),
    ]);
    expect(calendar.overlaps).toBe(0);
  });

  it("RC-S1-28: a departed Stay collides with nothing, though it still holds its nights", () => {
    // An overdue Guest checked out: their Stay ends the day they left, which
    // covers the first night of the booking they stayed into.
    const calendar = build([
      row({
        bars: [
          stay({
            status: "departed",
            startsOn: addDays(TODAY, -3),
            heldUntil: TODAY,
          }),
          bar({ startsOn: addDays(TODAY, -1), heldUntil: addDays(TODAY, 2) }),
        ],
      }),
    ]);
    expect(calendar.overlaps).toBe(0);
    expect(calendar.units[0]!.bars.some((b) => b.overlaps)).toBe(false);
    const lastNight = calendar.nights.find(
      (night) => night.day === addDays(TODAY, -2),
    );
    expect(lastNight?.free).toBe(0);
  });

  it("RC-S1-29 and RC-S1-30: a requested clash is labelled and never counted", () => {
    const calendar = build([
      row({
        bars: [
          stay({ startsOn: addDays(TODAY, -1), heldUntil: addDays(TODAY, 3) }),
          bar({ startsOn: TODAY, heldUntil: addDays(TODAY, 2) }),
          bar({
            status: "requested",
            startsOn: TODAY,
            heldUntil: addDays(TODAY, 1),
          }),
        ],
      }),
    ]);
    const [inHouse, confirmed, requested] = calendar.units[0]!.bars;
    expect(calendar.overlaps).toBe(1);
    expect(inHouse!.overlaps && confirmed!.overlaps).toBe(true);
    expect(requested).toMatchObject({
      holds: false,
      overlaps: false,
      clashesWith: "booking",
    });
  });

  it("RC-S1-29: a request over a Guest in house clashes with the Stay, and confirming it would be refused", () => {
    const calendar = build([
      row({
        bars: [
          stay({ startsOn: addDays(TODAY, -1), heldUntil: addDays(TODAY, 3) }),
          bar({
            status: "requested",
            startsOn: TODAY,
            heldUntil: addDays(TODAY, 1),
          }),
        ],
      }),
    ]);
    const requested = calendar.units[0]!.bars[1]!;
    expect(requested.clashesWith).toBe("stay");
    expect(calendar.overlaps).toBe(0);
  });

  it("RC-S1-29: a request over a departed Stay's nights clashes with nothing — they are history", () => {
    const calendar = build([
      row({
        bars: [
          stay({
            status: "departed",
            startsOn: addDays(TODAY, -3),
            heldUntil: TODAY,
          }),
          bar({
            status: "requested",
            startsOn: addDays(TODAY, -2),
            heldUntil: addDays(TODAY, -1),
          }),
        ],
      }),
    ]);
    expect(calendar.units[0]!.bars[1]!.clashesWith).toBeNull();
  });

  it("RC-S1-31: counts every Unit, whatever a screen later hides", () => {
    const clash = [
      stay({ startsOn: TODAY, heldUntil: addDays(TODAY, 2) }),
      bar({ startsOn: TODAY, heldUntil: addDays(TODAY, 2) }),
    ];
    const calendar = build([
      row({ name: "101", floor: 1, bars: clash }),
      row({ name: "301", floor: 3, bars: clash.map((b) => ({ ...b })) }),
    ]);
    expect(calendar.overlaps).toBe(2);
  });
});

describe("blocks and free nights", () => {
  it("RC-S1-34: a booking held on a blocked Unit from today on is counted apart", () => {
    const calendar = build([
      row({
        status: "blocked",
        statusReason: "Painting",
        bars: [
          stay({
            status: "departed",
            startsOn: addDays(TODAY, -3),
            heldUntil: addDays(TODAY, -1),
          }),
          bar({ startsOn: addDays(TODAY, 2), heldUntil: addDays(TODAY, 4) }),
        ],
      }),
    ]);
    const [past, coming] = calendar.units[0]!.bars;
    expect(past!.bookedWhileBlocked).toBe(false);
    expect(coming!.bookedWhileBlocked).toBe(true);
    expect(calendar.bookedWhileBlocked).toBe(1);
    expect(calendar.overlaps).toBe(0);
  });

  it("RC-S1-24: counts sellable Units, takes held nights and blocks from today", () => {
    const room = row({ name: "Dorm", hasChildren: true });
    const calendar = build(
      [
        room,
        row({
          name: "A",
          unitType: "bed",
          parentId: room.unitId,
          bars: [
            stay({
              startsOn: addDays(TODAY, -1),
              heldUntil: addDays(TODAY, 1),
            }),
          ],
        }),
        row({ name: "B", unitType: "bed", parentId: room.unitId }),
        row({ name: "Blocked", status: "blocked", statusReason: "Leak" }),
        row({
          name: "Requested",
          bars: [bar({ status: "requested", startsOn: TODAY })],
        }),
      ],
      7,
    );
    expect(calendar.sellable).toBe(4);
    const free = Object.fromEntries(
      calendar.nights.map((n) => [n.day, n.free]),
    );
    expect(free[addDays(TODAY, -1)]).toBe(3);
    expect(free[TODAY]).toBe(2);
    expect(free[addDays(TODAY, 1)]).toBe(3);
  });
});

describe("rows", () => {
  it("RC-S1-38 and RC-S1-39: building, then floor, then number; nulls last", () => {
    const calendar = build([
      row({ name: "10", building: "B", floor: 1 }),
      row({ name: "2", building: "B", floor: 1 }),
      row({ name: "101", building: "B", floor: null }),
      row({ name: "5", building: null, floor: 1 }),
      row({ name: "3", building: "A", floor: 2 }),
    ]);
    expect(calendar.units.map((u) => u.name)).toEqual([
      "3",
      "2",
      "10",
      "101",
      "5",
    ]);
  });

  it("RC-S1-01 and RC-S1-37: beds sit under their room; a bed with no room is a row", () => {
    const room = row({ name: "201", hasChildren: true });
    const calendar = build([
      row({ name: "B", unitType: "bed", parentId: room.unitId }),
      room,
      row({ name: "A", unitType: "bed", parentId: room.unitId }),
      row({ name: "Lone", unitType: "bed" }),
    ]);
    expect(calendar.units.map((u) => u.name)).toEqual(["201", "Lone"]);
    expect(calendar.units[0]!.sellable).toBe(false);
    expect(calendar.units[0]!.beds.map((b) => b.name)).toEqual(["A", "B"]);
  });

  it("uses the server's day when there is no row to read the Property's from", () => {
    const calendar = buildRoomCalendar([], { from: null, days: null });
    expect(calendar.units).toEqual([]);
    expect(calendar.days).toBe(14);
    expect(calendar.from).toBe(addDays(calendar.today, -3));
  });

  it("RC-S1-49: a Stay with no Folio has no balance, never zero", () => {
    const calendar = build([
      row({
        bars: [
          stay({ balanceMinor: null, currency: null }),
          stay({
            startsOn: addDays(TODAY, 3),
            balanceMinor: 0,
            currency: "TRY",
            folioClosed: false,
          }),
        ],
      }),
    ]);
    const [noFolio, settled] = calendar.units[0]!.bars;
    expect(noFolio).toMatchObject({ balance: null });
    expect(settled).toMatchObject({
      balance: { balanceMinor: 0, currency: "TRY", closed: false },
    });
  });
});
