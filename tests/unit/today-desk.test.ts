/**
 * The desk section of Today (docs/features/today-layouts/edge-cases.csv, TL-S2
 * server rows). Pure, like `today-derive.test.ts`: the rows the modules return
 * go in, the section comes out. Who may read a Property is the database's.
 *
 * Breaks that were run, and what went red:
 *   a room with a guest in it called ready      TL-S2-06
 *   the section built from a failed read        TL-S2-17
 *   a balance carried for a viewer without it   TL-S2-15
 */
import { describe, expect, it } from "vitest";
import type { WorkingDay } from "../../packages/ranza/core/src";
import type { DaysWaiting } from "../../packages/ranza/business-day/src";
import type {
  HousekeepingBoard,
  HousekeepingRoom,
} from "../../packages/ranza/housekeeping/src";
import type { Arrival, Departure } from "../../packages/ranza/reservations/src";
import {
  deriveToday,
  needsFor,
  grantsFor,
  LIST_LIMIT,
  type TodayInput,
} from "../../apps/operator-workspace/src/server/today-derive";
import {
  deskFrom,
  roomState,
} from "../../apps/operator-workspace/src/server/today-desk";

const FRONT_DESK = [
  "front_desk.check_in",
  "front_desk.check_out",
  "housekeeping.update_status",
];
const WITH_MONEY = [...FRONT_DESK, "finance.manage_folio"];
const ALL = {
  frontDesk: true,
  housekeeping: true,
  billing: true,
  maintenance: true,
};

const day = (permissions: string[]): WorkingDay => ({
  propertyId: "p",
  propertyName: "Demo Otel İstanbul",
  organizationId: "o",
  timezone: "Europe/Istanbul",
  currency: "TRY",
  businessDate: "2026-10-19",
  calendarDate: "2026-10-19",
  cutoff: "04:00",
  permissions,
  capabilities: [true, true, true],
});

const arrival = (overrides: Partial<Arrival>): Arrival =>
  ({
    reservationId: "r-1",
    reference: "RZ-1",
    guestName: "Costa",
    stayType: "guest",
    status: "confirmed",
    startsOn: "2026-10-19",
    endsOn: "2026-10-22",
    unitId: "u-205",
    unitName: "205",
    roomName: null,
    unitType: "room",
    unitStatus: "available",
    unitIsReady: true,
    canCheckIn: true,
    checkInBlocker: null,
    expectedArrival: "14:00",
    expectedArrivalPassed: false,
    mayCheckIn: true,
    ...overrides,
  }) as Arrival;

const departure = (overrides: Partial<Departure>): Departure =>
  ({
    stayId: "s-1",
    reference: "S1",
    guestName: "Kaya",
    unitId: "u-103",
    unitName: "103",
    roomName: null,
    endsOn: "2026-10-19",
    overdue: false,
    folioId: "f-1",
    balanceMinor: 124_000,
    pendingNights: 0,
    pendingMinor: 0,
    currency: "TRY",
    mayCheckOut: true,
    ...overrides,
  }) as Departure;

const room = (overrides: Partial<HousekeepingRoom>): HousekeepingRoom => ({
  unitId: "u-101",
  name: "101",
  unitType: "Double",
  building: null,
  floor: 1,
  bedCount: 0,
  status: "inspected",
  ready: true,
  changedAt: null,
  inHouse: false,
  outOfService: false,
  ...overrides,
});

const board = (rooms: HousekeepingRoom[]): HousekeepingBoard => ({
  rooms,
  counts: { rooms: rooms.length, dirty: 0, clean: 0, inspected: 0, ready: 0 },
  mayMark: true,
});

const ok = <T>(value: T) => ({ ok: true as const, value });
const daysWaiting = (count: number): DaysWaiting => ({
  oldest: "2026-10-11",
  count,
});

function input(
  permissions: string[],
  overrides: Partial<TodayInput> = {},
): TodayInput {
  return {
    day: day(permissions),
    capabilities: ALL,
    arrivals: ok([arrival({})]),
    departures: ok([departure({})]),
    departedToday: ok(3),
    units: ok({
      today: "2026-10-19",
      units: [],
      counts: {
        rooms: 3,
        sellable: 3,
        inHouse: 1,
        reserved: 1,
        free: 1,
        blocked: 0,
        outOfService: 0,
      },
    }),
    board: ok(board([room({})])),
    inHouse: ok([]),
    daysWaiting: ok(daysWaiting(2)),
    ...overrides,
  };
}

describe("what a room is to the desk", () => {
  it("a_room_with_a_guest_in_it_is_in_house_whatever_housekeeping_says", () => {
    // TODAY-02: a ready room with somebody in it was counted as one to sell.
    expect(roomState(room({ inHouse: true, ready: true }))).toBe("in_house");
  });

  it("out_of_service_wins_over_everything", () => {
    expect(roomState(room({ outOfService: true, inHouse: true }))).toBe(
      "out_of_service",
    );
  });

  it("an_empty_room_is_ready_dirty_or_clean_and_awaiting_inspection", () => {
    expect(roomState(room({}))).toBe("ready");
    expect(roomState(room({ ready: false, status: "dirty" }))).toBe("dirty");
    expect(roomState(room({ ready: false, status: "clean" }))).toBe(
      "awaiting_inspection",
    );
  });
});

describe("the desk section", () => {
  it("names_the_guest_in_a_room_from_the_in_house_read", () => {
    const desk = deskFrom({
      arrivals: [],
      departures: [],
      departed: 0,
      board: board([
        room({ name: "102", inHouse: true }),
        room({ unitId: "u-103", name: "103" }),
      ]),
      inHouse: [departure({ unitName: "102", guestName: "Yılmaz" })],
      daysWaiting: undefined,
    });
    expect(desk.rooms.map((r) => [r.name, r.guestName])).toEqual([
      ["102", "Yılmaz"],
      ["103", null],
    ]);
  });

  it("a_bed_is_found_in_its_room", () => {
    const desk = deskFrom({
      arrivals: [],
      departures: [],
      departed: 0,
      board: board([room({ name: "401", inHouse: true, bedCount: 2 })]),
      inHouse: [
        departure({ unitName: "A", roomName: "401", guestName: "Rossi" }),
      ],
      daysWaiting: undefined,
    });
    expect(desk.rooms[0]?.guestName).toBe("Rossi");
  });

  it("carries_every_arrival_not_just_the_first_few_and_their_expected_time", () => {
    const many = Array.from({ length: LIST_LIMIT + 4 }, (_, i) =>
      arrival({
        reservationId: `r-${i}`,
        expectedArrival: i === 0 ? null : "15:30",
        expectedArrivalPassed: i === 1,
      }),
    );
    const summary = deriveToday(input(FRONT_DESK, { arrivals: ok(many) }));
    const desk = summary.desk;
    if (desk?.status !== "ok") throw new Error("the desk section is missing");
    expect(desk.data.arrivals).toHaveLength(LIST_LIMIT + 4);
    expect(desk.data.arrivals[0]?.expectedArrival).toBeNull();
    expect(desk.data.arrivals[1]?.expectedArrivalPassed).toBe(true);
    // The card beside it keeps its own cap: this is not a change to it.
    expect(
      summary.arrivals?.status === "ok" && summary.arrivals.data.rows,
    ).toHaveLength(LIST_LIMIT);
  });

  it("lists_the_overdue_departure_before_the_ones_due_today", () => {
    const desk = deskFrom({
      arrivals: [],
      departures: [
        { ...rowOf(departure({ stayId: "a", guestName: "Novak" })) },
        {
          ...rowOf(
            departure({ stayId: "b", guestName: "Kaya", overdue: true }),
          ),
        },
      ],
      departed: 0,
      board: board([]),
      inHouse: [],
      daysWaiting: undefined,
    });
    expect(desk.departures.map((d) => d.guestName)).toEqual(["Kaya", "Novak"]);
  });

  it("days_waiting_to_close_come_from_the_close_the_day_read", () => {
    const withDays = deskFrom({
      arrivals: [],
      departures: [],
      departed: 0,
      board: board([]),
      inHouse: [],
      daysWaiting: ok(daysWaiting(8)),
    });
    expect(withDays.unclosed).toEqual({
      status: "ok",
      data: { waiting: 8, oldest: "2026-10-11" },
    });
  });

  it("a_property_the_viewer_cannot_close_days_at_says_nothing_about_them", () => {
    const desk = deskFrom({
      arrivals: [],
      departures: [],
      departed: 0,
      board: board([]),
      inHouse: [],
      daysWaiting: ok(null),
    });
    expect(desk.unclosed).toBeUndefined();
  });

  it("a_failed_close_the_day_read_is_unavailable_not_zero_days", () => {
    const desk = deskFrom({
      arrivals: [],
      departures: [],
      departed: 0,
      board: board([]),
      inHouse: [],
      daysWaiting: { ok: false },
    });
    expect(desk.unclosed).toEqual({ status: "unavailable" });
  });
});

/** The shaped row the card sends, for a test that hands `deskFrom` rows. */
function rowOf(d: Departure) {
  return {
    stayId: d.stayId,
    reference: d.reference,
    guestName: d.guestName,
    unit: { unitName: d.unitName, roomName: d.roomName },
    endsOn: d.endsOn,
    overdue: d.overdue,
    mayCheckOut: d.mayCheckOut,
  };
}

describe("who is given it", () => {
  it("a_front_desk_and_a_manager_get_it", () => {
    expect(deriveToday(input(FRONT_DESK)).desk?.status).toBe("ok");
    expect(
      deriveToday(input([...FRONT_DESK, "staff.administer"])).desk?.status,
    ).toBe("ok");
  });

  it("housekeeping_and_finance_do_not_get_it", () => {
    // They lead with their own work; a map of guests is not theirs.
    expect(deriveToday(input(["housekeeping.update_status"])).desk).toBe(
      undefined,
    );
    expect(deriveToday(input(["finance.manage_folio"])).desk).toBe(undefined);
  });

  it("a_property_without_housekeeping_has_no_board_and_so_no_section", () => {
    const summary = deriveToday(input(FRONT_DESK, { board: undefined }));
    expect(summary.desk).toBeUndefined();
  });

  it("any_read_it_is_made_of_failing_makes_it_unavailable_not_smaller", () => {
    for (const broken of [
      { arrivals: { ok: false as const } },
      { departures: { ok: false as const } },
      { departedToday: { ok: false as const } },
      { board: { ok: false as const } },
      { inHouse: { ok: false as const } },
    ]) {
      expect(deriveToday(input(FRONT_DESK, broken)).desk).toEqual({
        status: "unavailable",
      });
    }
  });

  it("a_failed_close_the_day_read_leaves_the_rest_standing", () => {
    const desk = deriveToday(
      input(FRONT_DESK, { daysWaiting: { ok: false } }),
    ).desk;
    expect(desk?.status).toBe("ok");
    expect(desk?.status === "ok" && desk.data.unclosed).toEqual({
      status: "unavailable",
    });
  });

  it("the_extra_reads_are_asked_for_only_by_the_desk_and_the_manager", () => {
    const asked = (permissions: string[]) =>
      needsFor(grantsFor(permissions), ALL);
    expect(asked(FRONT_DESK)).toMatchObject({ inHouse: true, closeDay: true });
    expect(asked(["housekeeping.update_status"])).toMatchObject({
      inHouse: false,
      closeDay: false,
    });
    expect(asked(["finance.manage_folio"])).toMatchObject({
      inHouse: false,
      closeDay: false,
    });
    // No front desk at the Property, nobody to read.
    expect(
      needsFor(grantsFor(FRONT_DESK), { ...ALL, frontDesk: false }),
    ).toMatchObject({ inHouse: false, closeDay: false });
  });

  it("carries_no_balance_without_finance_manage_folio", () => {
    const without = JSON.stringify(deriveToday(input(FRONT_DESK)).desk);
    expect(without).not.toMatch(/balance|124000|folioId/);
    const withMoney = JSON.stringify(deriveToday(input(WITH_MONEY)).desk);
    expect(withMoney).toContain("124000");
  });
});
