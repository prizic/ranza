/**
 * The rota's week is counted on the Property's calendar (HR-06).
 *
 * The defect was a browser's local midnight written with `toISOString()`, so
 * these run in the zones where it showed — and the suite is meant to be run
 * under `TZ=Europe/Istanbul` and `TZ=America/Los_Angeles` as well as the
 * default, because a test that passes in one zone proves nothing about the
 * others.
 */
import { describe, expect, it } from "vitest";
import {
  addDays,
  isCalendarDay,
  mondayOf,
  weekOf,
  weekToShow,
} from "../../apps/operator-workspace/src/lib/hr-week";

describe("the rota's week", () => {
  it("HR-S1-69: starts on the Monday of the Property's today, whatever the machine's zone", () => {
    // Tuesday 6 October 2026: the week the audit saw keyed one day early.
    const week = weekOf("2026-10-06");
    expect(week[0]).toBe("2026-10-05");
    expect(week[6]).toBe("2026-10-11");
    expect(week).toHaveLength(7);
  });

  it("HR-S1-69: keys the Monday column with Monday, not the Sunday before it", () => {
    for (const day of ["2026-10-05", "2026-10-07", "2026-10-11"]) {
      expect(
        weekOf(day).map((date) => new Date(`${date}T00:00:00Z`).getUTCDay()),
      ).toEqual([1, 2, 3, 4, 5, 6, 0]);
    }
  });

  it("HR-S1-69: carries across a month, a year and a leap day", () => {
    expect(weekOf("2026-12-31")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
    expect(mondayOf("2028-03-01")).toBe("2028-02-28");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("HR-S1-69: shows the week asked for, moved to its Monday, and the Property's own when none is", () => {
    expect(weekToShow("2026-10-14", "2026-10-06")[0]).toBe("2026-10-12");
    expect(weekToShow(undefined, "2026-10-06")[0]).toBe("2026-10-05");
  });

  it("HR-S1-69: reads a date that is not on the calendar as none", () => {
    expect(isCalendarDay("2026-02-31")).toBe(false);
    expect(isCalendarDay("2026-10-5")).toBe(false);
    expect(isCalendarDay("soon")).toBe(false);
    expect(weekToShow("2026-02-31", "2026-10-06")[0]).toBe("2026-10-05");
  });
});
