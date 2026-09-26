/**
 * What a live Today keeps when a refresh goes wrong (TD-S1-24, TD-S1-25).
 */
import { describe, expect, it } from "vitest";
import type { TodaySummary } from "../../apps/operator-workspace/src/server/today-derive";
import { mergeSummary } from "../../apps/operator-workspace/src/features/today/merge";

const DAY: TodaySummary["day"] = {
  propertyId: "p-1",
  propertyName: "Galata Rezidans",
  timezone: "Europe/Istanbul",
  currency: "TRY",
  businessDate: "2026-09-25",
  calendarDate: "2026-09-25",
  cutoff: "04:00",
};

function summary(overrides: Partial<TodaySummary>): TodaySummary {
  return {
    day: DAY,
    focus: "manager",
    mayBook: true,
    attention: { items: [], complete: true },
    ...overrides,
  };
}

const ROOMS = {
  status: "ok" as const,
  data: {
    total: 4,
    ready: 3,
    awaitingInspection: 0,
    dirty: 1,
    outOfService: 0,
    floors: [],
    arrivalsWaiting: 0,
    cleanFirst: [],
    cleanFirstTotal: 0,
  },
};

describe("mergeSummary", () => {
  it("keeps the last good copy of a card that could not be read, marked stale", () => {
    const merged = mergeSummary(
      summary({ rooms: ROOMS }),
      summary({ rooms: { status: "unavailable" } }),
    );
    expect(merged.rooms).toEqual({ ...ROOMS, stale: true });
  });

  it("never brings back a card the new answer leaves out", () => {
    // A permission withdrawn, or a module switched off, since the last read.
    const merged = mergeSummary(summary({ rooms: ROOMS }), summary({}));
    expect("rooms" in merged).toBe(false);
  });

  it("never carries a card across a Property switch", () => {
    const merged = mergeSummary(
      summary({ rooms: ROOMS }),
      summary({
        day: { ...DAY, propertyId: "p-2" },
        rooms: { status: "unavailable" },
      }),
    );
    expect(merged.rooms).toEqual({ status: "unavailable" });
  });

  it("never carries a card across the business date cutoff", () => {
    const merged = mergeSummary(
      summary({ rooms: ROOMS }),
      summary({
        day: { ...DAY, businessDate: "2026-09-26", calendarDate: "2026-09-26" },
        rooms: { status: "unavailable" },
      }),
    );
    expect(merged.rooms).toEqual({ status: "unavailable" });
  });

  it("takes a fresh answer as it is", () => {
    const fresh = { ...ROOMS, data: { ...ROOMS.data, ready: 4 } };
    expect(
      mergeSummary(summary({ rooms: ROOMS }), summary({ rooms: fresh })).rooms,
    ).toEqual(fresh);
  });
});
