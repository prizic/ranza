/**
 * The room calendar's view state and layout, without React: what the URL and
 * the cookie hold, where each bar sits on the half-day grid, and which rows a
 * filter leaves. Rows are named from docs/features/room-calendar/edge-cases.csv.
 */
import { describe, expect, it } from "vitest";
import type {
  RoomCalendar,
  RoomCalendarBar,
  RoomCalendarUnit,
} from "../../packages/ranza/reservations/src";
import {
  barsByKey,
  bedsTaken,
  calendarRows,
  outOfUseOn,
  placeBars,
} from "../../apps/operator-workspace/src/features/room-calendar/layout";
import {
  parseView,
  readRemembered,
  rememberedCookie,
  viewSearch,
  type RoomCalendarView,
} from "../../apps/operator-workspace/src/features/room-calendar/view";

const LENGTHS = [7, 14, 30];
const PROPERTY = "dc000003-0000-4000-8000-000000000001";
const ROOM = "dc000004-0000-4000-8000-000000000001";

const DEFAULT: RoomCalendarView = parseView({}, {}, LENGTHS, 14);

function bar(
  overrides: Partial<RoomCalendarBar> & Pick<RoomCalendarBar, "startsOn">,
): RoomCalendarBar {
  return {
    kind: "reservation",
    reservationId: crypto.randomUUID(),
    status: "confirmed",
    stayType: "guest",
    guestName: "Guest",
    endsOn: null,
    heldUntil: null,
    overdue: false,
    holds: true,
    overlaps: false,
    clashesWith: null,
    bookedWhileBlocked: false,
    ...overrides,
  } as RoomCalendarBar;
}

function unit(overrides: Partial<RoomCalendarUnit>): RoomCalendarUnit {
  return {
    unitId: crypto.randomUUID(),
    name: "101",
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

function calendar(units: RoomCalendarUnit[]): RoomCalendar {
  return {
    today: "2026-09-24",
    from: "2026-09-21",
    days: 14,
    sellable: units.length,
    nights: [],
    overlaps: 0,
    bookedWhileBlocked: 0,
    units,
  };
}

describe("the view in the URL and the cookie", () => {
  it("RC-S1-60: a view survives the round trip through its URL", () => {
    const view: RoomCalendarView = {
      from: "2026-09-21",
      days: 30,
      floor: "3",
      showRequested: false,
      showDeparted: false,
      search: "Ada",
      overlapsOnly: true,
      collapsed: [ROOM],
    };
    const params = Object.fromEntries(
      new URLSearchParams(viewSearch(view, PROPERTY, 14)),
    );
    expect(params.property).toBe(PROPERTY);
    expect(parseView(params, {}, LENGTHS, 14)).toEqual(view);
  });

  it("RC-S1-60: drops each parameter that is not valid without discarding the rest", () => {
    const view = parseView(
      {
        from: "next tuesday",
        days: "365",
        floor: "penthouse",
        requested: "maybe",
        collapsed: `not-an-id,${ROOM}`,
        q: "Ada",
      },
      {},
      LENGTHS,
      14,
    );
    expect(view).toEqual({
      ...DEFAULT,
      search: "Ada",
      collapsed: [ROOM],
    });
  });

  it("RC-S1-07: drops a start that is not a day, or one outside the years the read takes", () => {
    for (const from of [
      "2026-02-30",
      "0000-01-01",
      "9999-12-31",
      "2026-13-01",
    ]) {
      expect(parseView({ from }, {}, LENGTHS, 14).from).toBeNull();
    }
    expect(parseView({ from: "2026-02-28" }, {}, LENGTHS, 14).from).toBe(
      "2026-02-28",
    );
  });

  it("writes only what differs from the default into the URL", () => {
    expect(viewSearch(DEFAULT, PROPERTY, 14)).toBe(`property=${PROPERTY}`);
  });

  it("RC-S1-61: remembers the length and toggles, and the URL wins over them", () => {
    const view = { ...DEFAULT, days: 30, showDeparted: false, search: "x" };
    const value = rememberedCookie(view).split(";")[0]!.split("=")[1];
    const remembered = readRemembered(value);
    expect(remembered).toEqual({
      days: 30,
      showRequested: true,
      showDeparted: false,
    });
    expect(parseView({}, remembered, LENGTHS, 14)).toMatchObject({
      days: 30,
      showDeparted: false,
      search: "",
      from: null,
    });
    expect(
      parseView({ days: "7", departed: "1" }, remembered, LENGTHS, 14),
    ).toMatchObject({ days: 7, showDeparted: true });
  });

  it("ignores a cookie it cannot read, and a remembered length not on offer", () => {
    expect(readRemembered("%7B%22days")).toEqual({});
    expect(readRemembered(undefined)).toEqual({});
    expect(parseView({}, readRemembered("90.1.1"), LENGTHS, 14).days).toBe(14);
  });
});

describe("where bars sit", () => {
  it("RC-S1-66: runs from the middle of arrival to the middle of departure", () => {
    const { placed } = placeBars(
      [
        bar({
          startsOn: "2026-09-23",
          endsOn: "2026-09-26",
          heldUntil: "2026-09-26",
        }),
      ],
      "2026-09-21",
      14,
    );
    // Day 2's middle is half 5; day 5's middle is half 11.
    expect(placed[0]).toMatchObject({
      start: 5,
      end: 11,
      continuesBefore: false,
      continuesAfter: false,
    });
  });

  it("RC-S1-27: a changeover shares a cell and a lane", () => {
    const { placed, lanes } = placeBars(
      [
        bar({ startsOn: "2026-09-22", heldUntil: "2026-09-24" }),
        bar({ startsOn: "2026-09-24", heldUntil: "2026-09-26" }),
      ],
      "2026-09-21",
      14,
    );
    expect(lanes).toBe(1);
    expect(placed[0]!.end).toBe(placed[1]!.start);
  });

  it("RC-S1-25 and RC-S1-30: overlapping bars stack, and a free lane is reused", () => {
    const { placed, lanes } = placeBars(
      [
        bar({ startsOn: "2026-09-21", heldUntil: "2026-09-25" }),
        bar({ startsOn: "2026-09-23", heldUntil: "2026-09-27" }),
        bar({
          startsOn: "2026-09-24",
          heldUntil: "2026-09-25",
          status: "requested",
          holds: false,
        }),
        bar({ startsOn: "2026-09-26", heldUntil: "2026-09-28" }),
      ],
      "2026-09-21",
      14,
    );
    expect(lanes).toBe(3);
    expect(placed.map((p) => p.lane)).toEqual([0, 1, 2, 0]);
  });

  it("RC-S1-17: a bar with no end, begun before the window, is square at both ends", () => {
    const { placed } = placeBars(
      [bar({ startsOn: "2026-08-01", heldUntil: null })],
      "2026-09-21",
      14,
    );
    expect(placed[0]).toMatchObject({
      start: 0,
      end: 28,
      continuesBefore: true,
      continuesAfter: true,
    });
  });
});

describe("which rows are drawn", () => {
  const room = unit({
    name: "201",
    floor: 2,
    sellable: false,
    unitId: ROOM,
    beds: [
      unit({
        name: "A",
        unitType: "bed",
        floor: 2,
        bars: [
          bar({
            startsOn: "2026-09-23",
            heldUntil: "2026-09-25",
            guestName: "Ada",
          }),
        ],
      }),
      unit({
        name: "B",
        unitType: "bed",
        floor: 2,
        bars: [
          bar({
            startsOn: "2026-09-24",
            heldUntil: "2026-09-26",
            status: "requested",
            holds: false,
          }),
        ],
      }),
    ],
  });
  const noFloor = unit({ name: "Annex" });
  const first = unit({
    name: "101",
    floor: 1,
    bars: [bar({ startsOn: "2026-09-22", overlaps: true })],
  });
  const found = calendar([first, room, noFloor]);

  it("RC-S1-39: Units with no building get a heading of their own when others have one", () => {
    const withBuilding = unit({ name: "Main-1", building: "Main", floor: 1 });
    const kinds = calendarRows(calendar([withBuilding, noFloor]), DEFAULT).map(
      (row) =>
        row.kind === "building" ? `building:${row.building}` : row.kind,
    );
    expect(kinds).toEqual([
      "building:Main",
      "floor",
      "unit",
      "building:null",
      "floor",
      "unit",
    ]);
  });

  it("RC-S1-39: groups under floor headings with no floor last", () => {
    const kinds = calendarRows(found, DEFAULT).map((row) =>
      row.kind === "floor"
        ? `floor:${row.floor}`
        : row.kind === "unit"
          ? row.unit.name
          : row.kind,
    );
    expect(kinds).toEqual([
      "floor:1",
      "101",
      "floor:2",
      "201",
      "A",
      "B",
      "floor:null",
      "Annex",
    ]);
  });

  it("RC-S1-40: a folded room keeps its row and hides its beds, and counts them per night", () => {
    const rows = calendarRows(found, { ...DEFAULT, collapsed: [ROOM] });
    expect(
      rows
        .filter((row) => row.kind === "unit")
        .map((row) => row.kind === "unit" && row.unit.name),
    ).toEqual(["101", "201", "Annex"]);
    expect(bedsTaken(room, ["2026-09-23", "2026-09-24", "2026-09-25"])).toEqual(
      [1, 1, 0],
    );
  });

  it("RC-S1-41: search finds a Guest and keeps the room they are in", () => {
    const rows = calendarRows(found, { ...DEFAULT, search: "ada" });
    expect(
      rows
        .filter((row) => row.kind === "unit")
        .map((row) => row.kind === "unit" && row.unit.name),
    ).toEqual(["201", "A", "B"]);
  });

  it("RC-S1-31: the overlap filter keeps only the rooms with one", () => {
    const rows = calendarRows(found, { ...DEFAULT, overlapsOnly: true });
    expect(
      rows
        .filter((row) => row.kind === "unit")
        .map((row) => row.kind === "unit" && row.unit.name),
    ).toEqual(["101"]);
  });

  it("RC-S1-11 and RC-S1-18: the toggles hide requested and departed bars", () => {
    const rows = calendarRows(found, { ...DEFAULT, showRequested: false });
    const bedB = rows.find(
      (row) => row.kind === "unit" && row.unit.name === "B",
    );
    expect(bedB?.kind === "unit" && bedB.unit.bars).toEqual([]);
  });

  it("filters by floor, including the Units with none", () => {
    const names = (floor: string) =>
      calendarRows(found, { ...DEFAULT, floor })
        .filter((row) => row.kind === "unit")
        .map((row) => row.kind === "unit" && row.unit.name);
    expect(names("1")).toEqual(["101"]);
    expect(names("none")).toEqual(["Annex"]);
  });

  it("RC-S1-32: a block is drawn from today on, never on a past night", () => {
    const blocked = unit({ status: "blocked", statusReason: "Leak" });
    expect(outOfUseOn(blocked, "2026-09-23", "2026-09-24")).toBe(false);
    expect(outOfUseOn(blocked, "2026-09-24", "2026-09-24")).toBe(true);
    expect(outOfUseOn(unit({}), "2026-09-30", "2026-09-24")).toBe(false);
  });
});

describe("the drawer's bar across a refresh", () => {
  it("RC-S1-65: follows an arriving Guest through check-in, from booking to Stay", () => {
    const reservationId = crypto.randomUUID();
    const booked = bar({ startsOn: "2026-09-24", reservationId });
    const before = barsByKey(calendar([unit({ bars: [booked] })]));
    expect(before.get(`reservation:${reservationId}`)?.bar.kind).toBe(
      "reservation",
    );

    const stayed = bar({
      kind: "stay",
      stayId: crypto.randomUUID(),
      reservationId,
      status: "in_house",
      startsOn: "2026-09-24",
    } as Partial<RoomCalendarBar> & Pick<RoomCalendarBar, "startsOn">);
    const after = barsByKey(calendar([unit({ bars: [stayed] })]));
    expect(after.get(`reservation:${reservationId}`)?.bar).toMatchObject({
      kind: "stay",
      status: "in_house",
    });
  });
});
