/**
 * The term view and the block and gender narrowing, without React or a
 * database (RC-S7-01 to RC-S7-05, RB-S6-01). Where a screen holds a copy of a
 * rule the module owns, the two are held to each other here.
 */
import { describe, expect, it } from "vitest";
import {
  buildRoomCalendar,
  calendarLength,
  termStart,
  type CalendarUnitRow,
  type RawCalendarBar,
} from "../../packages/ranza/reservations/src/room-calendar";
import { ROOM_CALENDAR_TERM_DAYS } from "../../packages/ranza/reservations/src/contracts";
import {
  calendarRows,
  monthSpans,
  narrowedFree,
  shiftYear,
} from "../../apps/operator-workspace/src/features/room-calendar/layout";
import {
  isTermScale,
  parseView,
  TERM_DAYS,
} from "../../apps/operator-workspace/src/features/room-calendar/view";
import {
  blocksOf,
  noticeFor,
  freeIn,
  knownBlock,
  type NarrowableRoom,
} from "../../apps/operator-workspace/src/features/rooms/narrowing";

const LENGTHS = [7, 14, 30, TERM_DAYS];
const TODAY = "2026-10-31";

function bar(startsOn: string, endsOn: string): RawCalendarBar {
  return {
    kind: "reservation",
    reservationId: crypto.randomUUID(),
    reference: "R",
    expectedArrival: null,
    stayId: null,
    status: "confirmed",
    stayType: "resident",
    guestName: "Resident",
    startsOn,
    endsOn,
    heldUntil: endsOn,
    overdue: false,
    bookedStartsOn: null,
    bookedEndsOn: null,
    balanceMinor: null,
    currency: null,
    folioClosed: null,
    current: null,
    arrivedOn: null,
  };
}

function row(overrides: Partial<CalendarUnitRow>): CalendarUnitRow {
  return {
    unitId: crypto.randomUUID(),
    parentId: null,
    name: "A-101",
    unitType: "room",
    building: "Blok A",
    floor: 1,
    status: "available",
    statusReason: null,
    admits: "female",
    hasChildren: false,
    today: TODAY,
    firstDay: "2026-09-01",
    bars: [],
    ...overrides,
  };
}

describe("the term window", () => {
  it("RC-S7-01: is one of the lengths the read allows, and the screen's copy of it agrees", () => {
    expect(TERM_DAYS).toBe(ROOM_CALENDAR_TERM_DAYS);
    expect(calendarLength(ROOM_CALENDAR_TERM_DAYS)).toBe(
      ROOM_CALENDAR_TERM_DAYS,
    );
    // Anything that is not a length somebody designed a screen for is still the default.
    expect(calendarLength(304)).toBe(14);
    expect(calendarLength(366)).toBe(14);
    expect(isTermScale(TERM_DAYS)).toBe(true);
    expect(isTermScale(30)).toBe(false);
  });

  it("RC-S7-02: opens on the 1st of September of the academic year today is in", () => {
    expect(termStart("2026-10-31")).toBe("2026-09-01");
    expect(termStart("2027-06-30")).toBe("2026-09-01");
    // July and August between two terms already point at the next.
    expect(termStart("2027-07-01")).toBe("2027-09-01");
    expect(termStart("2027-08-31")).toBe("2027-09-01");
    expect(termStart("2027-09-01")).toBe("2027-09-01");
    expect(termStart("2027-01-01")).toBe("2026-09-01");
  });

  it("RC-S7-01: shows a ten-month booking whole, from its first night to its departure", () => {
    const calendar = buildRoomCalendar(
      [row({ bars: [bar("2026-09-15", "2027-06-15")] })],
      { from: "2026-09-01", days: ROOM_CALENDAR_TERM_DAYS },
    );
    expect(calendar.days).toBe(ROOM_CALENDAR_TERM_DAYS);
    expect(calendar.nights).toHaveLength(ROOM_CALENDAR_TERM_DAYS);
    expect(calendar.nights[0]?.day).toBe("2026-09-01");
    const last = calendar.nights.at(-1)?.day ?? "";
    expect(last >= "2027-06-30").toBe(true);
    const [placed] = calendar.units[0]?.bars ?? [];
    expect(placed?.startsOn).toBe("2026-09-15");
    expect(placed?.heldUntil).toBe("2027-06-15");
  });

  it("RC-S7-03: groups the days into the months a term is read by", () => {
    const days = Array.from({ length: ROOM_CALENDAR_TERM_DAYS }, (_, i) => {
      const day = new Date(Date.UTC(2026, 8, 1 + i));
      return day.toISOString().slice(0, 10);
    });
    const spans = monthSpans(days);
    expect(spans.map((span) => span.month).slice(0, 3)).toEqual([
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
    expect(spans[0]).toMatchObject({ startIndex: 0, length: 30 });
    expect(spans[1]).toMatchObject({ startIndex: 30, length: 31 });
    expect(spans.reduce((sum, span) => sum + span.length, 0)).toBe(
      ROOM_CALENDAR_TERM_DAYS,
    );
    expect(monthSpans([])).toEqual([]);
  });

  it("RC-S7-03: moves by whole years, and the 29th of February becomes the 28th", () => {
    expect(shiftYear("2026-09-01", 1)).toBe("2027-09-01");
    expect(shiftYear("2026-09-01", -1)).toBe("2025-09-01");
    expect(shiftYear("2024-02-29", 1)).toBe("2025-02-28");
    expect(shiftYear("2024-02-29", 4)).toBe("2028-02-29");
  });
});

describe("what a Property opens on (RC-S7-04)", () => {
  it("opens a dormitory on a term, whatever this browser remembers of day lengths", () => {
    expect(parseView({}, {}, LENGTHS, TERM_DAYS).days).toBe(TERM_DAYS);
    expect(parseView({}, { days: 14 }, LENGTHS, TERM_DAYS).days).toBe(
      TERM_DAYS,
    );
  });

  it("opens a hotel on its remembered day length and never inherits a term", () => {
    expect(parseView({}, { days: 7 }, LENGTHS, 14).days).toBe(7);
    expect(parseView({}, { days: TERM_DAYS }, LENGTHS, 14).days).toBe(14);
  });

  it("lets the address choose either scale", () => {
    expect(parseView({ days: "305" }, {}, LENGTHS, 14).days).toBe(TERM_DAYS);
    expect(parseView({ days: "30" }, {}, LENGTHS, TERM_DAYS).days).toBe(30);
  });
});

const rooms = (): CalendarUnitRow[] => [
  row({ unitId: "a1", name: "A-101", building: "Blok A", admits: "female" }),
  row({ unitId: "a2", name: "A-102", building: "Blok A", admits: "female" }),
  row({ unitId: "b1", name: "B-101", building: "Blok B", admits: "male" }),
  row({ unitId: "x1", name: "C-1", building: null, admits: null }),
];

describe("narrowing by block and by whom a room admits (RC-S7-05, RB-S6-01)", () => {
  const calendar = buildRoomCalendar(rooms(), {
    from: "2026-09-01",
    days: ROOM_CALENDAR_TERM_DAYS,
  });
  const view = parseView({}, {}, LENGTHS, TERM_DAYS);
  const names = (narrowed: Partial<typeof view>) =>
    calendarRows(calendar, { ...view, ...narrowed }).flatMap((r) =>
      r.kind === "unit" ? [r.unit.name] : [],
    );

  it("keeps every room with no narrowing", () => {
    expect(names({})).toEqual(["A-101", "A-102", "B-101", "C-1"]);
  });

  it("keeps the rooms of one block, and of one gender, and both together", () => {
    expect(names({ block: "Blok A" })).toEqual(["A-101", "A-102"]);
    expect(names({ admits: "male" })).toEqual(["B-101"]);
    expect(names({ admits: "anyone" })).toEqual(["C-1"]);
    expect(names({ block: "Blok A", admits: "male" })).toEqual([]);
  });

  it("reads none as the rooms in no building, and a named block as that building", () => {
    expect(knownBlock("none", calendar.units)).toEqual({ block: null });
    expect(knownBlock("Blok B", calendar.units)).toEqual({ block: "Blok B" });
    expect(names({ block: "none" })).toEqual(["C-1"]);
  });

  it("says a narrowing in the shared notice's keys: the rooms of a block, or the empty beds", () => {
    const counts = { rooms: 2, free: 1 };
    expect(
      noticeFor({ block: null, admits: null }, counts, "Other"),
    ).toBeNull();
    expect(
      noticeFor({ block: { block: "Blok A" }, admits: null }, counts, "Other"),
    ).toEqual({ filter: "filterBlock", count: 2, block: "Blok A" });
    expect(
      noticeFor({ block: null, admits: "female" }, counts, "Other"),
    ).toEqual({ filter: "filterFreeFemale", count: 1, admits: "female" });
    expect(
      noticeFor({ block: { block: null }, admits: "male" }, counts, "Other"),
    ).toEqual({
      filter: "filterFreeInBlock",
      count: 1,
      block: "Other",
      admits: "male",
    });
  });

  it("narrows nothing for a block the Property does not have", () => {
    expect(knownBlock("Blok Z", calendar.units)).toBeNull();
    expect(names({ block: "Blok Z" })).toEqual([
      "A-101",
      "A-102",
      "B-101",
      "C-1",
    ]);
  });

  it("names the blocks in order, leaving out rooms that are in none", () => {
    expect(blocksOf(calendar.units)).toEqual(["Blok A", "Blok B"]);
  });

  it("counts the free places inside a narrowing from the places it is told are free", () => {
    const free = new Set(["a1", "b1", "x1"]);
    expect(freeIn(calendar.units, free, { block: null, admits: null })).toBe(3);
    expect(
      freeIn(calendar.units, free, {
        block: { block: "Blok A" },
        admits: null,
      }),
    ).toBe(1);
    expect(freeIn(calendar.units, free, { block: null, admits: "male" })).toBe(
      1,
    );
    expect(
      freeIn(calendar.units, free, { block: null, admits: "anyone" }),
    ).toBe(1);
    expect(
      freeIn(calendar.units, free, {
        block: { block: "Blok B" },
        admits: "female",
      }),
    ).toBe(0);
  });

  it("counts a room's beds and not the room, and a room let whole as itself", () => {
    const withBeds: NarrowableRoom[] = [
      {
        unitId: "room",
        building: "Blok A",
        admits: "female",
        beds: [{ unitId: "bed-a" }, { unitId: "bed-b" }],
      },
    ];
    expect(
      freeIn(withBeds, new Set(["room", "bed-a"]), {
        block: null,
        admits: null,
      }),
    ).toBe(1);
  });

  it("RC-S7-05: the free row over every room is the read's own, and over fewer it is the read's rule over fewer", () => {
    const booked = buildRoomCalendar(
      [
        row({ unitId: "a1", bars: [bar("2026-09-15", "2027-06-15")] }),
        row({ unitId: "b1", building: "Blok B", admits: "male" }),
      ],
      { from: "2026-09-01", days: ROOM_CALENDAR_TERM_DAYS },
    );
    const all = narrowedFree(booked, { block: null, admits: null });
    expect(all.nights).toEqual(booked.nights);
    expect(all.sellable).toBe(booked.sellable);
    const blockA = narrowedFree(booked, {
      block: { block: "Blok A" },
      admits: null,
    });
    expect(blockA.sellable).toBe(1);
    // Free before the booking arrives, taken from its first night.
    expect(blockA.nights.find((n) => n.day === "2026-09-14")?.free).toBe(1);
    expect(blockA.nights.find((n) => n.day === "2026-09-15")?.free).toBe(0);
    expect(blockA.nights.find((n) => n.day === "2027-06-15")?.free).toBe(1);
  });
});
