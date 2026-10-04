/**
 * The pure parts of analytics: parsing a request and calendar arithmetic on
 * business dates. Anything that computes a figure is proved against the
 * database in tests/integration/analytics.test.ts, because a unit test that
 * restates a formula passes whatever the query does (AN-DIFF-06).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../apps/operator-workspace/node_modules/server-only", () => ({}));
vi.mock("server-only", () => ({}));

import {
  parseRange,
  resolveAnalyticsView,
} from "../../apps/operator-workspace/src/server/analytics";
import {
  addDays,
  daysInMonth,
  monthEnd,
  monthOf,
  monthStart,
  parseMonth,
  percentChange,
  pointChange,
  resolveMonth,
  shiftMonth,
} from "../../apps/operator-workspace/src/server/analytics-months";
import {
  formatMinorMoney,
  formatPercentValue,
  formatShortDate,
} from "../../apps/operator-workspace/src/features/analytics/format";

describe("a range in the URL", () => {
  it("invalid_range_defaults_to_week", () => {
    expect(parseRange("today")).toBe("today");
    expect(parseRange("7d")).toBe("7d");
    expect(parseRange("30d")).toBe("30d");
    expect(parseRange("mtd")).toBe("mtd");
    for (const unknown of ["unknown", "1y", "", null, undefined]) {
      expect(parseRange(unknown)).toBe("7d");
    }
  });

  it("a month in the URL wins over a range, and mtd opens the current month", () => {
    expect(resolveAnalyticsView({ range: "mtd" })).toEqual({
      kind: "month",
      month: null,
    });
    expect(resolveAnalyticsView({ month: "2026-09", range: "30d" })).toEqual({
      kind: "month",
      month: "2026-09",
    });
    expect(resolveAnalyticsView({ month: "garbage" })).toEqual({
      kind: "month",
      month: null,
    });
    expect(resolveAnalyticsView({ range: "30d" })).toEqual({
      kind: "range",
      range: "30d",
    });
    expect(resolveAnalyticsView({})).toEqual({ kind: "range", range: "7d" });
  });
});

describe("a month in the URL", () => {
  it("accepts only a real calendar month", () => {
    expect(parseMonth("2026-09")).toBe("2026-09");
    expect(parseMonth("2026-12")).toBe("2026-12");
    for (const bad of [
      "abc",
      "2026-13",
      "2026-00",
      "2026-9",
      "26-09",
      "",
      null,
    ]) {
      expect(parseMonth(bad)).toBeNull();
    }
  });

  it("shows the current month for a month after it, and the month itself otherwise", () => {
    expect(resolveMonth(null, "2026-10-04")).toBe("2026-10");
    expect(resolveMonth("2026-11", "2026-10-04")).toBe("2026-10");
    expect(resolveMonth("2027-01", "2026-10-04")).toBe("2026-10");
    expect(resolveMonth("2026-10", "2026-10-04")).toBe("2026-10");
    expect(resolveMonth("2026-03", "2026-10-04")).toBe("2026-03");
  });
});

describe("calendar arithmetic on business dates", () => {
  it("knows how long each month is, leap years included", () => {
    expect(daysInMonth("2026-09")).toBe(30);
    expect(daysInMonth("2026-10")).toBe(31);
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(monthStart("2026-09")).toBe("2026-09-01");
    expect(monthEnd("2026-09")).toBe("2026-09-30");
    expect(monthEnd("2028-02")).toBe("2028-02-29");
  });

  it("moves a month across a year boundary", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-10", -13)).toBe("2025-09");
    expect(shiftMonth("2026-10", 0)).toBe("2026-10");
  });

  it("moves a date across month ends without a time zone", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(monthOf("2026-10-04")).toBe("2026-10");
  });
});

describe("a change from the prior month", () => {
  it("is a percentage of the prior, and a dash when there is nothing to divide by", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(100, 100)).toBe(0);
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
    expect(percentChange(5, null)).toBeNull();
    expect(percentChange(null, 5)).toBeNull();
  });

  it("is points for occupancy, and a dash when either side is unknown", () => {
    expect(pointChange(62.5, 50)).toBe(12.5);
    expect(pointChange(40, 50)).toBe(-10);
    expect(pointChange(10, 0)).toBe(10);
    expect(pointChange(null, 50)).toBeNull();
    expect(pointChange(50, null)).toBeNull();
  });
});

describe("Formatting Utilities", () => {
  it("formats minor money correctly across locales", () => {
    expect(formatMinorMoney(10000, "USD", "en")).toContain("100");
    expect(formatMinorMoney(null, "USD", "en")).toBe("—");
    expect(formatMinorMoney(undefined, "USD", "en")).toBe("—");
  });

  it("formats percentages correctly", () => {
    expect(formatPercentValue(75.5, "en")).toContain("75.5");
    expect(formatPercentValue(0, "en")).toContain("0");
  });

  it("formats short date consistently", () => {
    const formatted = formatShortDate("2026-09-29", "en");
    expect(formatted).toContain("Sep");
    expect(formatted).toContain("29");
  });
});
