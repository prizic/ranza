/**
 * Today, derived (docs/features/today-dashboard/edge-cases.csv, slices 1 and 4).
 *
 * Pure functions over the rows the modules already return, so each row of the
 * table is one input and one answer. What the database decides — who reaches
 * the Property, which rows a policy lets through — is the integration suite's.
 *
 * Breaks that were run, and what went red:
 *   money let through for every viewer        TD-S1-03, TD-S1-04, -14, -15
 *   the manager focus never chosen            TD-S1-01, TD-S1-02
 *   a failed read allowed to throw            TD-S1-24
 *   the reads run side by side                "one after another"
 *   maintenance items without the permission  TD-S4-01, TD-S4-03
 */
import { describe, expect, it, vi } from "vitest";
import type { WorkingDay } from "../../packages/ranza/core/src";
import type { FolioSummary } from "../../packages/ranza/folios/src";
import type {
  HousekeepingBoard,
  HousekeepingRoom,
} from "../../packages/ranza/housekeeping/src";
import type { Arrival, Departure } from "../../packages/ranza/reservations/src";
import type {
  UnitCounts,
  UnitEntry,
  UnitMap,
} from "../../packages/ranza/accommodation/src";
import type { TodayMaintenance } from "../../packages/ranza/maintenance/src";
import {
  cleanFirst,
  deriveToday,
  focusFor,
  grantsFor,
  needsFor,
  occupancyFrom,
  type TodayInput,
} from "../../apps/operator-workspace/src/server/today-derive";
import {
  readTodaySummary,
  type TodayReads,
} from "../../apps/operator-workspace/src/server/today-summary";
import { displayName } from "../../apps/operator-workspace/src/server/display-name";

const FRONT_DESK = [
  "front_desk.book",
  "front_desk.check_in",
  "front_desk.check_out",
  "front_desk.cancel",
  "finance.manage_folio",
  "housekeeping.update_status",
];
const HOUSEKEEPING = ["housekeeping.update_status"];
const FINANCE = ["finance.manage_folio", "finance.post_charge"];
const MANAGER = [
  ...FRONT_DESK,
  "finance.post_charge",
  "staff.administer",
  "audit.read",
];

/** Every shipped role reports a problem (MT-S1-28); a manager works the board. */
const REPORTS = ["maintenance.report"];
const MANAGES = ["maintenance.report", "maintenance.manage"];

const ALL = {
  frontDesk: true,
  housekeeping: true,
  billing: true,
  maintenance: true,
};

function day(
  permissions: string[],
  overrides: Partial<WorkingDay> = {},
): WorkingDay {
  return {
    propertyId: "d0000003-0000-4000-8000-000000000001",
    propertyName: "Galata Rezidans",
    organizationId: "d0000002-0000-4000-8000-000000000001",
    timezone: "Europe/Istanbul",
    currency: "TRY",
    businessDate: "2026-09-25",
    calendarDate: "2026-09-25",
    cutoff: "04:00",
    permissions,
    capabilities: [true, true, true],
    ...overrides,
  };
}

function arrival(overrides: Partial<Arrival>): Arrival {
  return {
    reservationId: "r-1",
    reference: "RZ-1",
    guestName: "Lina Haddad",
    stayType: "guest",
    status: "confirmed",
    startsOn: "2026-09-25",
    endsOn: "2026-09-28",
    unitId: "u-204",
    unitName: "204",
    roomName: null,
    unitType: "room",
    unitStatus: "available",
    unitIsReady: true,
    canCheckIn: true,
    checkInBlocker: null,
    occupantLeaves: null,
    stayId: null,
    folioId: null,
    daysLate: 0,
    balanceMinor: 0,
    currency: "TRY",
    mayCheckIn: true,
    mayCancel: true,
    ...overrides,
  } as Arrival;
}

function departure(overrides: Partial<Departure>): Departure {
  return {
    stayId: "s-1",
    reservationId: "r-9",
    reference: "RZ-9",
    guestName: "Ece Koç",
    stayType: "guest",
    startsOn: "2026-09-22",
    endsOn: "2026-09-25",
    unitId: "u-118",
    unitName: "118",
    roomName: null,
    unitType: "room",
    unitStatus: "occupied",
    overdue: false,
    early: false,
    folioId: "f-1",
    folioVersion: 2,
    balanceMinor: 184_000,
    currency: "TRY",
    mayCheckOut: true,
    ...overrides,
  } as Departure;
}

function room(overrides: Partial<HousekeepingRoom>): HousekeepingRoom {
  return {
    unitId: "u-101",
    name: "101",
    unitType: "room",
    building: null,
    floor: 1,
    bedCount: 0,
    status: "clean",
    ready: true,
    changedAt: null,
    inHouse: false,
    outOfService: false,
    ...overrides,
  };
}

function board(rooms: HousekeepingRoom[]): HousekeepingBoard {
  return {
    rooms,
    counts: { rooms: rooms.length, dirty: 0, clean: 0, inspected: 0, ready: 0 },
    mayMark: true,
  };
}

const COUNTS: UnitCounts = {
  rooms: 10,
  sellable: 10,
  inHouse: 6,
  reserved: 2,
  free: 2,
  blocked: 0,
  outOfService: 0,
};

function unit(overrides: Partial<UnitEntry>): UnitEntry {
  return {
    unitId: "u-101",
    name: "101",
    unitType: "room",
    capacity: 2,
    building: null,
    floor: 1,
    status: "available",
    state: { kind: "free" },
    beds: [],
    ...overrides,
  };
}

function map(units: UnitEntry[] = [unit({})]): UnitMap {
  return { today: "2026-09-25", units, counts: COUNTS };
}

const ok = <T>(value: T) => ({ ok: true as const, value });

type Urgent = TodayMaintenance["urgent"][number];
type Held = TodayMaintenance["holds"][number];

function maintenance(
  overrides: Partial<TodayMaintenance> = {},
): TodayMaintenance {
  return {
    open: { new: 0, in_progress: 0, waiting_for_parts: 0 },
    outOfOrder: 0,
    urgent: [],
    holds: [],
    ...overrides,
  };
}

function urgent(overrides: Partial<Urgent>): Urgent {
  return {
    requestId: "m-1",
    number: 1,
    title: "Water through the ceiling",
    unit: { unitId: "u-101", name: "101", roomName: null },
    equipment: null,
    ...overrides,
  };
}

function held(overrides: Partial<Held>): Held {
  return {
    unitId: "u-509",
    requestId: "m-9",
    number: 9,
    title: "Boiler leaking",
    status: "in_progress",
    unit: { unitId: "u-509", name: "509", roomName: null },
    expectedBackOn: null,
    ...overrides,
  };
}

const OUT = {
  status: "out_of_service",
  state: { kind: "out_of_service" },
} as const;

function input(
  permissions: string[],
  overrides: Partial<TodayInput> = {},
): TodayInput {
  return {
    day: day(permissions),
    capabilities: ALL,
    arrivals: ok([arrival({})]),
    departures: ok([departure({})]),
    departedToday: ok(0),
    units: ok(map()),
    board: ok(board([room({})])),
    ...overrides,
  };
}

describe("focus", () => {
  it("focus_follows_the_permissions_held_not_the_role_name", () => {
    // A custom role is only its permissions: the same keys lead the same way.
    expect(focusFor(grantsFor(["front_desk.check_out"]))).toBe("front_desk");
    expect(focusFor(grantsFor(HOUSEKEEPING))).toBe("housekeeping");
    expect(focusFor(grantsFor(FINANCE))).toBe("finance");
    expect(focusFor(grantsFor(MANAGER))).toBe("manager");
    expect(focusFor(grantsFor([]))).toBe("none");
  });

  it("a_role_with_mixed_permissions_leads_by_precedence_and_keeps_its_attention", () => {
    const mixed = grantsFor([...HOUSEKEEPING, "finance.manage_folio"]);
    expect(focusFor(mixed)).toBe("housekeeping");
    // Housekeeping leads, and the balance it may see still reaches attention.
    const summary = deriveToday(
      input([...HOUSEKEEPING, "finance.manage_folio"]),
    );
    expect(summary.focus).toBe("housekeeping");
    expect(summary.attention.items.map((item) => item.kind)).toContain(
      "balance",
    );
    // The money figures are the finance focus's, not a union: the shipped
    // Front desk holds finance.manage_folio too.
    expect(needsFor(mixed, ALL).folios).toBe(false);
    expect(summary.money).toBeUndefined();
    expect(focusFor(grantsFor(["audit.read"]))).toBe("manager");
  });
});

describe("what a viewer is sent", () => {
  it("the_summary_carries_no_balance_without_finance_manage_folio", () => {
    for (const permissions of [
      HOUSEKEEPING,
      ["front_desk.check_in", "front_desk.check_out"],
    ]) {
      const json = JSON.stringify(deriveToday(input(permissions)));
      expect(json).not.toMatch(
        /"balance"|Minor|"currency":"TRY","amount|folioId/,
      );
      expect(json).not.toContain("184000");
    }
    // And the same rows do carry it for somebody who may see it.
    expect(JSON.stringify(deriveToday(input(FRONT_DESK)))).toContain("184000");
  });

  it("a_card_whose_capability_the_property_lacks_is_absent", () => {
    const grants = grantsFor(MANAGER);
    const withoutHousekeeping = needsFor(grants, {
      frontDesk: true,
      housekeeping: false,
      billing: true,
      maintenance: false,
    });
    expect(withoutHousekeeping.rooms).toBe(false);
    const summary = deriveToday(
      input(MANAGER, {
        capabilities: {
          frontDesk: true,
          housekeeping: false,
          billing: true,
          maintenance: false,
        },
        board: undefined,
      }),
    );
    // Absent, not zero: the key is not there at all.
    expect("rooms" in summary).toBe(false);
    expect(summary.arrivals?.status).toBe("ok");

    const noBilling = deriveToday(
      input(FRONT_DESK, {
        capabilities: {
          frontDesk: true,
          housekeeping: true,
          billing: false,
          maintenance: false,
        },
      }),
    );
    expect(JSON.stringify(noBilling)).not.toContain("184000");
  });

  it("finance where there is no front desk shows Folios, not departures at zero", () => {
    const summary = deriveToday(
      input(FINANCE, {
        capabilities: {
          frontDesk: false,
          housekeeping: false,
          billing: true,
          maintenance: false,
        },
        arrivals: undefined,
        departures: undefined,
        departedToday: undefined,
        units: undefined,
        board: undefined,
        folios: ok([]),
      }),
    );
    expect(summary.money?.status).toBe("ok");
    expect(
      summary.money?.status === "ok" && "leaving" in summary.money.data,
    ).toBe(false);
  });

  it("the finance focus reads Folios only with the permission and billing", () => {
    expect(needsFor(grantsFor(FINANCE), ALL).folios).toBe(true);
    expect(
      needsFor(grantsFor(FINANCE), { ...ALL, billing: false }).folios,
    ).toBe(false);
    expect(needsFor(grantsFor(HOUSEKEEPING), ALL).folios).toBe(false);
  });
});

describe("the figures", () => {
  it("arrivals_count_checked_in_of_expected", () => {
    const summary = deriveToday(
      input(FRONT_DESK, {
        arrivals: ok([
          arrival({ reservationId: "a", status: "checked_in" }),
          arrival({ reservationId: "b" }),
          arrival({ reservationId: "c" }),
        ]),
      }),
    );
    expect(summary.arrivals).toMatchObject({
      status: "ok",
      data: { expected: 3, checkedIn: 1 },
    });
    // The list shows who is still to come, not who has been dealt with.
    expect(
      summary.arrivals?.status === "ok" &&
        summary.arrivals.data.rows.map((row) => row.reservationId),
    ).toEqual(["b", "c"]);
  });

  it("a_withdrawn_check_in_counts_as_an_arrival_again", () => {
    // ADR 0022: the Reservation is confirmed again, and the arrivals read
    // returns it as confirmed.
    const summary = deriveToday(
      input(FRONT_DESK, { arrivals: ok([arrival({ status: "confirmed" })]) }),
    );
    expect(summary.arrivals).toMatchObject({
      data: { expected: 1, checkedIn: 0 },
    });
  });

  it("departures_count_out_of_due_and_overdue_apart", () => {
    const summary = deriveToday(
      input(FRONT_DESK, {
        departures: ok([
          departure({ stayId: "a" }),
          departure({ stayId: "b", overdue: true, endsOn: "2026-09-24" }),
        ]),
        departedToday: ok(9),
      }),
    );
    expect(summary.departures).toMatchObject({
      data: { due: 10, departed: 9, overdue: 1 },
    });
  });

  it("occupancy_and_expected_tonight_are_derived_and_never_divide_by_zero", () => {
    expect(
      occupancyFrom(
        COUNTS,
        [arrival({}), arrival({ status: "checked_in" })],
        [departure({})],
      ),
    ).toEqual({ sellable: 10, inHouse: 6, expectedTonight: 6 });
    expect(
      occupancyFrom(
        { ...COUNTS, inHouse: 9 },
        [arrival({}), arrival({}), arrival({})],
        [],
      ),
    ).toMatchObject({ expectedTonight: 10 });
    expect(
      occupancyFrom(
        { ...COUNTS, sellable: 0, inHouse: 0 },
        [],
        [departure({})],
      ),
    ).toEqual({ sellable: 0, inHouse: 0, expectedTonight: 0 });
  });

  it("the_day_is_the_property_business_date", () => {
    const summary = deriveToday({
      ...input(FRONT_DESK),
      day: day(FRONT_DESK, {
        businessDate: "2026-09-24",
        calendarDate: "2026-09-25",
      }),
    });
    expect(summary.day).toMatchObject({
      businessDate: "2026-09-24",
      calendarDate: "2026-09-25",
      cutoff: "04:00",
    });
  });
});

describe("needs attention", () => {
  const kinds = (permissions: string[], overrides: Partial<TodayInput>) =>
    deriveToday(input(permissions, overrides)).attention.items.map(
      (item) => item.kind,
    );

  it("an_arrival_into_a_room_not_ready_needs_attention", () => {
    expect(
      kinds(FRONT_DESK, { arrivals: ok([arrival({ unitIsReady: false })]) }),
    ).toContain("not_ready");
    // Housekeeping is told about the room, not the Guest.
    const item = deriveToday(
      input(HOUSEKEEPING, { arrivals: ok([arrival({ unitIsReady: false })]) }),
    ).attention.items.find((entry) => entry.kind === "not_ready");
    expect(item?.guestName).toBeNull();
  });

  it("an_overdue_departure_needs_attention", () => {
    const items = deriveToday(
      input(["front_desk.check_out"], {
        departures: ok([departure({ overdue: true, endsOn: "2026-09-24" })]),
      }),
    ).attention.items;
    expect(items).toEqual([
      expect.objectContaining({ kind: "overdue", dueOn: "2026-09-24" }),
    ]);
    // Without finance.manage_folio the overdue item carries no amount.
    expect(items[0]).not.toHaveProperty("balance");
  });

  it("a_departure_with_a_balance_needs_attention_for_finance_holders", () => {
    expect(kinds(FRONT_DESK, {})).toContain("balance");
    expect(
      kinds(["front_desk.check_in", "front_desk.check_out"], {}),
    ).not.toContain("balance");
    // Overdue and owing is one item, carrying the amount.
    const items = deriveToday(
      input(FRONT_DESK, {
        departures: ok([departure({ overdue: true, endsOn: "2026-09-24" })]),
      }),
    ).attention.items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "overdue",
      balance: { amountMinor: 184_000, currency: "TRY" },
    });
  });

  it("an_arrival_that_cannot_be_checked_in_needs_attention", () => {
    const items = deriveToday(
      input(FRONT_DESK, {
        arrivals: ok([
          arrival({ checkInBlocker: "unit_occupied", unitIsReady: false }),
        ]),
      }),
    ).attention.items;
    expect(items[0]).toMatchObject({
      kind: "blocked",
      blocker: "unit_occupied",
    });
    // One item for the booking, not a second for its room.
    expect(items.filter((item) => item.kind === "not_ready")).toHaveLength(0);
  });

  it("an_out_of_service_unit_needs_attention", () => {
    const broken = map([
      unit({
        unitId: "a",
        name: "509",
        status: "out_of_service",
        state: { kind: "out_of_service" },
      }),
      // One bed out of service in a room that is otherwise let: the board
      // cannot see it, because the room is out only when every bed is.
      unit({
        unitId: "b",
        name: "402",
        state: null,
        beds: [
          unit({ unitId: "b-a", name: "A", unitType: "bed" }),
          unit({
            unitId: "b-b",
            name: "B",
            unitType: "bed",
            status: "out_of_service",
            state: { kind: "out_of_service" },
          }),
        ],
      }),
      // Blocked is a decision with a reason, not a fault.
      unit({
        unitId: "c",
        name: "510",
        status: "blocked",
        state: { kind: "blocked", reason: "Kept for the owner" },
      }),
    ]);
    const items = deriveToday(
      input(HOUSEKEEPING, { units: ok(broken) }),
    ).attention.items.filter((item) => item.kind === "out_of_service");
    expect(items.map((item) => item.unit)).toEqual([
      { unitName: "509", roomName: null },
      { unitName: "B", roomName: "402" },
    ]);
    // The front desk sees them without housekeeping switched on.
    expect(
      kinds(["front_desk.check_in"], {
        capabilities: {
          frontDesk: true,
          housekeeping: false,
          billing: false,
          maintenance: false,
        },
        board: undefined,
        units: ok(broken),
      }),
    ).toContain("out_of_service");
    expect(kinds(FINANCE, { units: ok(broken) })).not.toContain(
      "out_of_service",
    );
  });

  it("attention_items_are_ordered_and_capped: most urgent first", () => {
    expect(
      kinds(FRONT_DESK, {
        arrivals: ok([
          arrival({ reservationId: "a", checkInBlocker: "unit_blocked" }),
          arrival({ reservationId: "b", unitIsReady: false }),
        ]),
        departures: ok([
          departure({ stayId: "x" }),
          departure({ stayId: "y", overdue: true, balanceMinor: 0 }),
        ]),
        units: ok(
          map([
            unit({
              status: "out_of_service",
              state: { kind: "out_of_service" },
            }),
          ]),
        ),
      }),
    ).toEqual(["not_ready", "blocked", "overdue", "balance", "out_of_service"]);
  });
});

describe("maintenance", () => {
  const items = (permissions: string[], overrides: Partial<TodayInput>) =>
    deriveToday(input(permissions, overrides)).attention.items;

  it("an_open_urgent_request_needs_attention", () => {
    const read = ok(
      maintenance({
        urgent: [
          urgent({}),
          urgent({
            requestId: "m-2",
            number: 2,
            title: "No heating",
            unit: { unitId: "u-402-b", name: "B", roomName: "402" },
          }),
          urgent({
            requestId: "m-3",
            number: 3,
            title: "Lift stuck",
            unit: null,
            equipment: { equipmentId: "e-1", name: "Lift 1" },
          }),
        ],
      }),
    );
    const repairs = items([...HOUSEKEEPING, ...REPORTS], {
      maintenance: read,
    }).filter((item) => item.kind === "urgent_repair");
    // In the order the read gave them: oldest reported first.
    expect(repairs).toEqual([
      expect.objectContaining({
        unit: { unitName: "101", roomName: null },
        request: {
          number: 1,
          title: "Water through the ceiling",
          equipmentName: null,
        },
      }),
      expect.objectContaining({
        unit: { unitName: "B", roomName: "402" },
        request: expect.objectContaining({ number: 2 }),
      }),
      // Equipment in no room: the item names the equipment instead.
      expect.objectContaining({
        unit: null,
        request: { number: 3, title: "Lift stuck", equipmentName: "Lift 1" },
      }),
    ]);
    // Without a maintenance permission there is nothing, even handed the read.
    expect(
      items(HOUSEKEEPING, { maintenance: read }).map((item) => item.kind),
    ).not.toContain("urgent_repair");
    // Ranked after the arrivals, before the departures.
    expect(
      items([...FRONT_DESK, ...REPORTS], {
        arrivals: ok([arrival({ unitIsReady: false })]),
        departures: ok([departure({ overdue: true, balanceMinor: 0 })]),
        maintenance: ok(maintenance({ urgent: [urgent({})] })),
      }).map((item) => item.kind),
    ).toEqual(["not_ready", "urgent_repair", "overdue"]);
  });

  it("a_hold_past_its_return_needs_attention_once", () => {
    const units = ok(
      map([
        unit({ unitId: "u-509", name: "509", ...OUT }),
        unit({
          unitId: "u-402",
          name: "402",
          state: null,
          beds: [
            unit({ unitId: "u-402-a", name: "A", unitType: "bed", ...OUT }),
          ],
        }),
        unit({ unitId: "u-510", name: "510", ...OUT }),
      ]),
    );
    const read = ok(
      maintenance({
        holds: [
          // Two requests hold 509; the earlier-due one is the item.
          held({ number: 9, expectedBackOn: "2026-09-23" }),
          held({ requestId: "m-4", number: 4, expectedBackOn: "2026-09-24" }),
          held({
            unitId: "u-402-a",
            requestId: "m-5",
            number: 5,
            unit: { unitId: "u-402-a", name: "A", roomName: "402" },
            expectedBackOn: "2026-09-20",
          }),
          // Due back on the business date itself is not yet late.
          held({
            unitId: "u-510",
            requestId: "m-6",
            number: 6,
            unit: { unitId: "u-510", name: "510", roomName: null },
            expectedBackOn: "2026-09-25",
          }),
        ],
      }),
    );
    const listed = items([...HOUSEKEEPING, ...REPORTS], {
      units,
      maintenance: read,
    });
    expect(
      listed.map((item) => [item.kind, item.unit?.unitName, item.dueOn]),
    ).toEqual([
      ["overdue_return", "509", "2026-09-23"],
      ["overdue_return", "A", "2026-09-20"],
      ["out_of_service", "510", null],
    ]);
    expect(listed[0]?.request?.number).toBe(9);

    // An urgent request holding the room absorbs its hold, carrying the date.
    const absorbed = items([...HOUSEKEEPING, ...REPORTS], {
      units,
      maintenance: ok(
        maintenance({
          urgent: [
            urgent({
              requestId: "m-9",
              number: 9,
              title: "Boiler leaking",
              unit: { unitId: "u-509", name: "509", roomName: null },
            }),
          ],
          holds: [held({ expectedBackOn: "2026-09-23" })],
        }),
      ),
    }).filter((item) => item.unit?.unitName === "509");
    expect(absorbed).toEqual([
      expect.objectContaining({ kind: "urgent_repair", dueOn: "2026-09-23" }),
    ]);
  });

  it("out_of_service_from_a_hold_opens_maintenance", () => {
    const units = ok(
      map([
        unit({ unitId: "u-509", name: "509", ...OUT }),
        unit({ unitId: "u-511", name: "511", ...OUT }),
        unit({ unitId: "u-512", name: "512", ...OUT }),
      ]),
    );
    const read = ok(
      maintenance({
        holds: [
          held({ requestId: "m-12", number: 12, title: "Tiles" }),
          held({ requestId: "m-7", number: 7, title: "Window" }),
          // Done, and still holding its room until somebody returns it.
          held({
            unitId: "u-512",
            requestId: "m-8",
            number: 8,
            title: "Paint drying",
            status: "done",
            unit: { unitId: "u-512", name: "512", roomName: null },
          }),
        ],
      }),
    );
    const outOfService = (permissions: string[]) =>
      items(permissions, { units, maintenance: read }).filter(
        (item) => item.kind === "out_of_service",
      );
    // Named for the lowest-numbered request holding the room.
    expect(
      outOfService([...HOUSEKEEPING, ...REPORTS]).map((item) => [
        item.unit?.unitName,
        item.request?.number ?? null,
      ]),
    ).toEqual([
      ["509", 7],
      ["511", null],
      ["512", 8],
    ]);
    // Without a maintenance permission TD-S1-17 is as it was.
    for (const item of outOfService(HOUSEKEEPING)) {
      expect(item).not.toHaveProperty("request");
    }
  });

  it("the_manager_sees_open_maintenance_at_a_glance", () => {
    const read = ok(
      maintenance({
        open: { new: 2, in_progress: 3, waiting_for_parts: 1 },
        outOfOrder: 4,
        urgent: [urgent({})],
      }),
    );
    const summary = deriveToday(
      input([...MANAGER, ...MANAGES], { maintenance: read }),
    );
    expect(summary.maintenance).toEqual({
      status: "ok",
      data: {
        open: 6,
        new: 2,
        inProgress: 3,
        waitingForParts: 1,
        outOfOrder: 4,
      },
    });
    for (const permissions of [FRONT_DESK, HOUSEKEEPING, FINANCE]) {
      const other = deriveToday(
        input([...permissions, ...REPORTS], { maintenance: read }),
      );
      expect("maintenance" in other).toBe(false);
    }
    // Nothing about money, vendors or charges reaches the page.
    expect(JSON.stringify(summary)).not.toMatch(/costMinor|vendor|charges/);
  });

  it("no_maintenance_capability_shows_no_maintenance", () => {
    const grants = grantsFor([...MANAGER, ...MANAGES]);
    expect(needsFor(grants, { ...ALL, maintenance: false }).maintenance).toBe(
      false,
    );
    expect(needsFor(grants, ALL).maintenance).toBe(true);
    // Taking a room out of order alone is not reading maintenance, and a role
    // that leads nowhere reads nothing (TD-DEF-08).
    expect(
      needsFor(
        grantsFor([...HOUSEKEEPING, "maintenance.take_out_of_order"]),
        ALL,
      ).maintenance,
    ).toBe(false);
    expect(needsFor(grantsFor(MANAGES), ALL).maintenance).toBe(false);
    // Not read: TD-S1-17 is unchanged and there is no card.
    const summary = deriveToday(
      input([...MANAGER, ...MANAGES], {
        capabilities: { ...ALL, maintenance: false },
        units: ok(map([unit({ ...OUT })])),
      }),
    );
    expect("maintenance" in summary).toBe(false);
    expect(
      summary.attention.items.filter((item) => item.kind === "out_of_service"),
    ).toEqual([
      {
        kind: "out_of_service",
        unit: { unitName: "101", roomName: null },
        guestName: null,
        reference: null,
        blocker: null,
        dueOn: null,
      },
    ]);
  });

  it("a_failed_maintenance_read_leaves_the_rest", () => {
    const summary = deriveToday(
      input([...MANAGER, ...MANAGES], {
        units: ok(map([unit({ ...OUT })])),
        maintenance: { ok: false },
      }),
    );
    expect(summary.maintenance).toEqual({ status: "unavailable" });
    expect(summary.attention.complete).toBe(false);
    expect(summary.arrivals?.status).toBe("ok");
    // The out-of-service item falls back to the plain one.
    const plain = summary.attention.items.find(
      (item) => item.kind === "out_of_service",
    );
    expect(plain).toBeDefined();
    expect(plain).not.toHaveProperty("request");
  });
});

describe("clean first", () => {
  it("clean_first_orders_rooms_by_who_needs_them", () => {
    const rooms = board([
      room({
        unitId: "q-old",
        name: "407",
        status: "dirty",
        ready: false,
        changedAt: "2026-09-25T03:40:00Z",
      }),
      room({
        unitId: "q-new",
        name: "406",
        status: "dirty",
        ready: false,
        changedAt: "2026-09-25T06:00:00Z",
      }),
      room({
        unitId: "leave",
        name: "118",
        status: "clean",
        ready: false,
        inHouse: true,
      }),
      room({ unitId: "insp", name: "208", status: "clean", ready: false }),
      room({ unitId: "arr", name: "204", status: "dirty", ready: false }),
      room({ unitId: "done", name: "112", status: "inspected", ready: true }),
      room({
        unitId: "oos",
        name: "509",
        status: "dirty",
        ready: false,
        outOfService: true,
      }),
      room({
        unitId: "stay",
        name: "301",
        status: "dirty",
        ready: false,
        inHouse: true,
      }),
    ]);
    const queue = cleanFirst(
      rooms,
      [
        arrival({ unitName: "204" }),
        arrival({ reservationId: "r-2", unitName: "A", roomName: "208" }),
        arrival({
          reservationId: "r-3",
          unitName: "112",
          status: "checked_in",
        }),
      ],
      [departure({ unitName: "118" })],
    );
    expect(queue.map((row) => [row.unitId, row.priority])).toEqual([
      ["arr", "arrival"],
      ["insp", "inspect_for_arrival"],
      ["leave", "leaving"],
      ["q-old", "queue"],
      ["q-new", "queue"],
    ]);
  });
});

describe("reading it", () => {
  function reads(overrides: Partial<TodayReads> = {}): TodayReads {
    return {
      workingDay: vi.fn(async () => day(MANAGER)),
      arrivals: vi.fn(async () => [arrival({})]),
      departures: vi.fn(async () => [departure({})]),
      departedToday: vi.fn(async () => 1),
      units: vi.fn(async () => map()),
      board: vi.fn(async () => board([room({})])),
      folios: vi.fn(async () => [] as FolioSummary[]),
      maintenance: vi.fn(async () => maintenance()),
      ...overrides,
    };
  }
  const CAPS = {
    frontDesk: { moduleKey: "front_office", capabilityKey: "front_desk" },
    housekeeping: { moduleKey: "housekeeping", capabilityKey: "housekeeping" },
    billing: { moduleKey: "billing_folios", capabilityKey: "finance" },
    maintenance: { moduleKey: "maintenance", capabilityKey: "maintenance" },
  };

  it("one_section_failing_leaves_the_others_standing", async () => {
    const report = vi.fn();
    const failure = new Error("connection reset");
    const summary = await readTodaySummary(
      reads({ board: vi.fn(async () => Promise.reject(failure)) }),
      "p",
      CAPS,
      report,
    );
    expect(summary?.rooms).toEqual({ status: "unavailable" });
    expect(summary?.arrivals?.status).toBe("ok");
    expect(summary?.occupancy?.status).toBe("ok");
    // Logged, never swallowed. Attention is not built from the board, so it
    // is still whole.
    expect(report).toHaveBeenCalledWith("rooms", failure);
    expect(summary?.attention.complete).toBe(true);

    // The unit map is what out-of-service items come from: without it,
    // attention says it may be incomplete.
    const noUnits = await readTodaySummary(
      reads({ units: vi.fn(async () => Promise.reject(failure)) }),
      "p",
      CAPS,
      report,
    );
    expect(noUnits?.attention.complete).toBe(false);
    expect(noUnits?.occupancy).toEqual({ status: "unavailable" });
    expect(noUnits?.rooms?.status).toBe("ok");
  });

  it("a card built from a failed sibling read is unavailable, never a confident zero", async () => {
    const report = vi.fn();
    const noArrivals = reads({
      arrivals: vi.fn(async () => Promise.reject(new Error("timeout"))),
    });
    const manager = await readTodaySummary(noArrivals, "p", CAPS, report);
    expect(manager?.occupancy).toEqual({ status: "unavailable" });
    expect(manager?.rooms).toEqual({ status: "unavailable" });

    const housekeeping = await readTodaySummary(
      reads({
        workingDay: vi.fn(async () => day(HOUSEKEEPING)),
        departures: vi.fn(async () => Promise.reject(new Error("timeout"))),
      }),
      "p",
      CAPS,
      report,
    );
    expect(housekeeping?.rooms).toEqual({ status: "unavailable" });
  });

  it("a failed count of who has gone leaves attention complete", async () => {
    const summary = await readTodaySummary(
      reads({
        departedToday: vi.fn(async () => Promise.reject(new Error("timeout"))),
      }),
      "p",
      CAPS,
      vi.fn(),
    );
    expect(summary?.attention.complete).toBe(true);
    expect(summary?.departures).toEqual({ status: "unavailable" });
    expect(summary?.arrivals?.status).toBe("ok");
  });

  it("a_property_without_today_summarises_nothing_and_reads_nothing_else", async () => {
    const r = reads({ workingDay: vi.fn(async () => null) });
    expect(await readTodaySummary(r, "p", CAPS, vi.fn())).toBeNull();
    expect(r.arrivals).not.toHaveBeenCalled();
    expect(r.folios).not.toHaveBeenCalled();
  });

  it("reads only what the focus needs, one after another", async () => {
    const order: string[] = [];
    let open = 0;
    let most = 0;
    const track =
      <T>(name: string, value: T) =>
      async () => {
        open += 1;
        most = Math.max(most, open);
        order.push(name);
        await new Promise((resolve) => setTimeout(resolve, 1));
        open -= 1;
        return value;
      };
    const r = reads({
      workingDay: track("day", day(HOUSEKEEPING)),
      arrivals: track("arrivals", [arrival({})]),
      departures: track("departures", [departure({})]),
      departedToday: track("departed", 0),
      units: track("units", map()),
      board: track("board", board([room({})])),
      folios: track("folios", []),
    });
    await readTodaySummary(r, "p", CAPS, vi.fn());
    // Never two transactions at once: the pool lesson of #58.
    expect(most).toBe(1);
    // Housekeeping needs arrivals and departures for its queue and the unit
    // map for what is out of service — never Folios or how many have gone.
    expect(order).toEqual(["day", "arrivals", "departures", "units", "board"]);

    // A manager at a Property with maintenance reads it last of all.
    order.length = 0;
    const manager = reads({
      workingDay: track(
        "day",
        day([...MANAGER, ...MANAGES], {
          capabilities: [true, true, true, true],
        }),
      ),
      arrivals: track("arrivals", [arrival({})]),
      departures: track("departures", [departure({})]),
      departedToday: track("departed", 0),
      units: track("units", map()),
      board: track("board", board([room({})])),
      folios: track("folios", []),
      maintenance: track("maintenance", maintenance()),
    });
    await readTodaySummary(manager, "p", CAPS, vi.fn());
    expect(most).toBe(1);
    expect(order).toEqual([
      "day",
      "arrivals",
      "departures",
      "departed",
      "units",
      "board",
      "maintenance",
    ]);
  });
});

describe("the greeting", () => {
  it("the_greeting_uses_the_display_name", () => {
    expect(displayName("Deniz", "deniz@example.test")).toBe("Deniz");
    expect(displayName("  ", "deniz@example.test")).toBe("deniz");
    expect(displayName("deniz@example.test", "deniz@example.test")).toBe(
      "deniz",
    );
    expect(displayName(null, "deniz@example.test")).toBe("deniz");
  });
});
