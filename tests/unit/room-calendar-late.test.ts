/**
 * Which bars are bookings whose Guest never arrived (CALENDAR-03): the lateness
 * the drawer, the bar's name and the hover card all say, from one function.
 */
import { describe, expect, it } from "vitest";
import type { RoomCalendarBar } from "../../packages/ranza/reservations/src";
import { lateArrival } from "../../apps/operator-workspace/src/features/room-calendar/late";

const TODAY = "2026-10-24";

function booking(startsOn: string, endsOn: string | null): RoomCalendarBar {
  return {
    kind: "reservation",
    reservationId: "r1",
    reference: "RABC123",
    expectedArrival: null,
    status: "confirmed",
    stayType: "guest",
    guestName: "Amelia Taylor",
    startsOn,
    endsOn,
    heldUntil: endsOn,
    overdue: false,
    holds: true,
    overlaps: false,
    clashesWith: null,
    bookedWhileBlocked: false,
  };
}

describe("a booking whose arrival passed", () => {
  it("is not late on the day it arrives, nor before", () => {
    expect(lateArrival(booking("2026-10-24", "2026-10-26"), TODAY)).toBeNull();
    expect(lateArrival(booking("2026-10-26", "2026-10-28"), TODAY)).toBeNull();
  });

  it("is late with nights still ahead, counted from the day it was due", () => {
    expect(lateArrival(booking("2026-10-22", "2026-10-26"), TODAY)).toEqual({
      days: 2,
      nightsGone: false,
    });
  });

  it("did not arrive once every night is behind it, the departure day included", () => {
    expect(lateArrival(booking("2026-10-19", "2026-10-22"), TODAY)).toEqual({
      days: 5,
      nightsGone: true,
    });
    expect(lateArrival(booking("2026-10-21", "2026-10-24"), TODAY)).toEqual({
      days: 3,
      nightsGone: true,
    });
  });

  it("is late, never gone, with no end date", () => {
    expect(lateArrival(booking("2026-10-22", null), TODAY)).toEqual({
      days: 2,
      nightsGone: false,
    });
  });

  it("is never said of a Guest in the house", () => {
    const stay: RoomCalendarBar = {
      kind: "stay",
      stayId: "s1",
      reservationId: "r1",
      reference: "RABC123",
      current: true,
      arrivedOn: "2026-10-19",
      status: "in_house",
      bookedStartsOn: null,
      bookedEndsOn: null,
      balance: null,
      stayType: "guest",
      guestName: "Amelia Taylor",
      startsOn: "2026-10-19",
      endsOn: "2026-10-26",
      heldUntil: "2026-10-26",
      overdue: false,
      holds: true,
      overlaps: false,
      clashesWith: null,
      bookedWhileBlocked: false,
    };
    expect(lateArrival(stay, TODAY)).toBeNull();
  });
});
