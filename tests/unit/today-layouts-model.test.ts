/**
 * What the desk layouts decide, away from the screen
 * (docs/features/today-layouts/edge-cases.csv): which layout a value names, what
 * the desk should do first, how the house moved, which other room could take a
 * guest. Each is a function of one `DeskCard`.
 */
import { describe, expect, it } from "vitest";
import type {
  ArrivalRow,
  DepartureRow,
  DeskCard,
  DeskRoom,
  RoomState,
} from "../../apps/operator-workspace/src/server/today-derive";
import {
  actionsFor,
  alternativesFor,
  countsByState,
  DEFAULT_LAYOUT,
  floorsOf,
  houseFlow,
  layoutCookieName,
  minutesAt,
  parseLayout,
  readinessOf,
  roomsByName,
  TODAY_LAYOUTS,
} from "../../apps/operator-workspace/src/features/today/layouts/model";
import { duration } from "../../apps/operator-workspace/src/features/today/format";

const NOW = 14 * 60 + 32;

const room = (
  name: string,
  state: RoomState,
  extra: Partial<DeskRoom> = {},
): DeskRoom => ({
  unitId: `u-${name}`,
  name,
  unitType: "Double",
  floor: Number(name[0]),
  state,
  guestName: null,
  endsOn: null,
  ...extra,
});

const arrival = (
  guest: string,
  unit: string,
  expected: string | null,
  extra: Partial<ArrivalRow> = {},
): ArrivalRow => ({
  reservationId: `r-${unit}`,
  reference: `R${unit}`,
  guestName: guest,
  stayType: "guest",
  unit: { unitName: unit, roomName: null },
  startsOn: "2026-10-19",
  endsOn: "2026-10-22",
  state: "ready",
  blocker: null,
  expectedArrival: expected,
  expectedArrivalPassed: false,
  mayCheckIn: true,
  ...extra,
});

const leaving = (
  guest: string,
  unit: string,
  overdue: boolean,
): DepartureRow => ({
  stayId: `s-${unit}`,
  reference: `S${unit}`,
  guestName: guest,
  unit: { unitName: unit, roomName: null },
  endsOn: overdue ? "2026-10-17" : "2026-10-19",
  overdue,
  mayCheckOut: true,
});

const desk = (parts: Partial<DeskCard>): DeskCard => ({
  arrivals: [],
  departures: [],
  departed: 0,
  rooms: [],
  ...parts,
});

describe("which layout a value names", () => {
  it("a_viewer_who_never_chose_gets_the_timeline", () => {
    expect(parseLayout(undefined)).toBe("timeline");
    expect(DEFAULT_LAYOUT).toBe("timeline");
  });

  it("every_layout_round_trips_and_nothing_else_is_one", () => {
    for (const layout of TODAY_LAYOUTS)
      expect(parseLayout(layout)).toBe(layout);
    for (const stale of ["", "grid", "TIMELINE", "timeline ", "__proto__"]) {
      expect(parseLayout(stale)).toBe(DEFAULT_LAYOUT);
    }
  });

  it("the_choice_is_kept_per_staff_member_so_a_shared_pc_keeps_each_their_own", () => {
    expect(layoutCookieName("u-1")).not.toBe(layoutCookieName("u-2"));
    expect(layoutCookieName("u-1")).toContain("u-1");
  });
});

describe("the property's own clock", () => {
  it("reads_minutes_since_midnight_in_the_zone_not_the_machines", () => {
    // 11:32 UTC is 14:32 in Istanbul (UTC+3, no daylight saving).
    const instant = Date.UTC(2026, 9, 19, 11, 32);
    expect(minutesAt(instant, "Europe/Istanbul")).toBe(NOW);
    expect(minutesAt(instant, "UTC")).toBe(11 * 60 + 32);
  });

  it("midnight_is_zero_not_twenty_four", () => {
    expect(minutesAt(Date.UTC(2026, 9, 19, 21, 0), "Europe/Istanbul")).toBe(0);
  });
});

describe("what to do first", () => {
  const rooms = [
    room("105", "ready"),
    room("201", "awaiting_inspection"),
    room("205", "ready"),
    room("208", "ready"),
    room("305", "dirty"),
    room("103", "in_house"),
  ];

  it("ranks_overdue_then_late_then_room_at_risk_soonest_first_then_no_time", () => {
    const actions = actionsFor(
      desk({
        rooms,
        departures: [
          leaving("Kaya", "103", true),
          leaving("Novak", "204", false),
        ],
        arrivals: [
          arrival("Petrov", "208", null),
          arrival("Moreau", "305", "20:30", { state: "not_ready" }),
          arrival("Demir", "201", "16:00", { state: "not_ready" }),
          arrival("Costa", "205", "14:00", { expectedArrivalPassed: true }),
          arrival("Lindqvist", "105", "15:30"),
        ],
      }),
      NOW,
    );
    expect(
      actions.map((a) => [
        a.kind,
        a.arrival?.guestName ?? a.departure?.guestName,
      ]),
    ).toEqual([
      ["overdue_departure", "Kaya"],
      ["late_arrival", "Costa"],
      ["room_at_risk", "Demir"],
      ["room_at_risk", "Moreau"],
      ["no_time", "Petrov"],
    ]);
  });

  it("a_departure_due_later_today_is_not_something_to_do_yet", () => {
    expect(
      actionsFor(desk({ departures: [leaving("Novak", "204", false)] }), NOW),
    ).toEqual([]);
  });

  it("a_ready_arrival_on_time_is_not_in_the_list_at_all", () => {
    expect(
      actionsFor(
        desk({ rooms, arrivals: [arrival("Lindqvist", "105", "15:30")] }),
        NOW,
      ),
    ).toEqual([]);
  });

  it("an_arrival_already_in_is_never_an_action", () => {
    expect(
      actionsFor(
        desk({
          rooms,
          arrivals: [
            arrival("Fischer", "205", "13:05", { state: "checked_in" }),
          ],
        }),
        NOW,
      ),
    ).toEqual([]);
  });

  it("a_late_arrival_says_how_late_in_minutes", () => {
    const [late] = actionsFor(
      desk({
        rooms,
        arrivals: [
          arrival("Costa", "205", "14:00", { expectedArrivalPassed: true }),
        ],
      }),
      NOW,
    );
    expect(late?.minutes).toBe(32);
  });

  it("a_blocked_arrival_is_at_risk_whatever_the_room", () => {
    const blocked = arrival("Hughes", "301", "18:00", { state: "blocked" });
    expect(readinessOf(blocked, roomsByName([room("301", "ready")]))).toBe(
      "blocked",
    );
    expect(
      actionsFor(
        desk({ rooms: [room("301", "ready")], arrivals: [blocked] }),
        NOW,
      ).map((a) => a.kind),
    ).toEqual(["room_at_risk"]);
  });
});

describe("how the house moved", () => {
  it("the_day_adds_up_to_the_occupancy_cards_own_expected_tonight", () => {
    // TODAY-01: two cards on one page said two different numbers for tonight.
    const flow = houseFlow(
      desk({
        departed: 3,
        departures: [
          leaving("Kaya", "103", true),
          leaving("Novak", "204", false),
          leaving("Okonkwo", "302", false),
        ],
        arrivals: [
          arrival("Fischer", "303", "13:05", { state: "checked_in" }),
          ...["205", "105", "201", "301", "305", "208"].map((unit) =>
            arrival("X", unit, "16:00"),
          ),
        ],
      }),
      { sellable: 23, inHouse: 10, expectedTonight: 13 },
    );
    expect(flow).toMatchObject({
      startOfDay: 12,
      left: 3,
      arrived: 1,
      stillLeaving: 3,
      stillArriving: 6,
      tonight: 13,
      sellable: 23,
    });
    expect(flow.startOfDay - flow.left + flow.arrived).toBe(10);
  });

  it("a_house_booked_past_its_rooms_says_so_rather_than_hiding_it", () => {
    const flow = houseFlow(
      desk({
        arrivals: ["1", "2", "3"].map((unit) => arrival("X", unit, "16:00")),
      }),
      { sellable: 3, inHouse: 2, expectedTonight: 3 },
    );
    expect(flow.tonight).toBe(5);
  });
});

describe("the building", () => {
  it("floors_run_top_down_and_rooms_with_no_floor_come_last", () => {
    const floors = floorsOf([
      room("101", "ready"),
      room("301", "ready"),
      room("201", "ready"),
      room("X", "ready", { floor: null }),
    ]);
    expect(floors.map((f) => f.floor)).toEqual([3, 2, 1, null]);
  });

  it("counts_every_state_and_in_house_is_not_ready", () => {
    expect(
      countsByState([
        room("101", "ready"),
        room("102", "in_house"),
        room("103", "in_house"),
        room("104", "dirty"),
      ]),
    ).toEqual({
      in_house: 2,
      ready: 1,
      awaiting_inspection: 0,
      dirty: 1,
      out_of_service: 0,
    });
  });
});

describe("another room for the guest", () => {
  const rooms = [
    room("201", "awaiting_inspection"),
    room("101", "ready"),
    room("207", "ready"),
    room("105", "ready"),
    room("307", "ready", { unitType: "Twin" }),
    room("108", "dirty"),
  ];
  const demir = arrival("Demir", "201", "16:00", { state: "not_ready" });

  it("offers_ready_rooms_of_the_same_type_not_booked_for_somebody_else_today", () => {
    const lindqvist = arrival("Lindqvist", "105", "15:30");
    expect(
      alternativesFor(demir, desk({ rooms, arrivals: [demir, lindqvist] })).map(
        (r) => r.name,
      ),
    ).toEqual(["101", "207"]);
  });

  it("never_offers_a_room_of_another_type_or_one_that_is_not_ready", () => {
    const names = alternativesFor(
      demir,
      desk({ rooms, arrivals: [demir] }),
    ).map((r) => r.name);
    expect(names).not.toContain("307");
    expect(names).not.toContain("108");
  });
});

describe("a length of time", () => {
  it("is_hours_and_minutes_without_a_zero_beside_an_hour", () => {
    expect(duration(152, "en")).toBe("2h 32m");
    expect(duration(120, "en")).toBe("2h");
    expect(duration(32, "en")).toBe("32m");
    expect(duration(0, "en")).toBe("0m");
  });

  it("never_goes_negative", () => {
    expect(duration(-5, "en")).toBe("0m");
  });
});
