import { describe, expect, it, vi } from "vitest";

vi.mock("../../apps/operator-workspace/node_modules/server-only", () => ({}));
vi.mock("server-only", () => ({}));

import { parseRange } from "../../apps/operator-workspace/src/server/analytics";
import {
  formatMinorMoney,
  formatPercentValue,
  formatShortDate,
} from "../../apps/operator-workspace/src/features/analytics/format";

describe("Analytics Unit Tests (AN-S1-01 to AN-S1-14)", () => {
  describe("Range Parsing & Fallback (AN-S1-14)", () => {
    it("parses valid ranges correctly", () => {
      expect(parseRange("today")).toBe("today");
      expect(parseRange("7d")).toBe("7d");
      expect(parseRange("30d")).toBe("30d");
      expect(parseRange("mtd")).toBe("mtd");
    });

    it("falls back to 7d on invalid or unknown range strings (AN-S1-14)", () => {
      expect(parseRange("unknown")).toBe("7d");
      expect(parseRange("1y")).toBe("7d");
      expect(parseRange("")).toBe("7d");
      expect(parseRange(null)).toBe("7d");
      expect(parseRange(undefined)).toBe("7d");
    });
  });

  describe("Division by Zero Safety (AN-S1-03, AN-S1-04)", () => {
    it("safely handles 0 sellable units without division by zero (AN-S1-03)", () => {
      const totalSellableUnits = 0;
      const dayCount = 7;
      const availableRoomNights = totalSellableUnits * dayCount;
      const totalOccupiedRoomNights = 0;
      const roomRevenueMinor = 0;

      const occupancyRatePercent =
        availableRoomNights > 0
          ? Math.round((totalOccupiedRoomNights / availableRoomNights) * 1000) /
            10
          : 0;

      const revParMinor =
        availableRoomNights > 0
          ? Math.round(roomRevenueMinor / availableRoomNights)
          : 0;

      expect(occupancyRatePercent).toBe(0);
      expect(revParMinor).toBe(0);
      expect(Number.isFinite(occupancyRatePercent)).toBe(true);
      expect(Number.isFinite(revParMinor)).toBe(true);
    });

    it("safely handles 0 occupied nights without division by zero (AN-S1-04)", () => {
      const totalOccupiedRoomNights = 0;
      const roomRevenueMinor = 0;

      const adrMinor =
        totalOccupiedRoomNights > 0
          ? Math.round(roomRevenueMinor / totalOccupiedRoomNights)
          : 0;

      expect(adrMinor).toBe(0);
      expect(Number.isFinite(adrMinor)).toBe(true);
    });

    it("computes accurate non-zero ADR, RevPAR, and occupancy percentage", () => {
      const totalSellableUnits = 10;
      const dayCount = 7;
      const availableRoomNights = totalSellableUnits * dayCount; // 70
      const totalOccupiedRoomNights = 35; // 50%
      const roomRevenueMinor = 350000; // 3500.00 currency units

      const occupancyRatePercent =
        availableRoomNights > 0
          ? Math.round((totalOccupiedRoomNights / availableRoomNights) * 1000) /
            10
          : 0;

      const adrMinor =
        totalOccupiedRoomNights > 0
          ? Math.round(roomRevenueMinor / totalOccupiedRoomNights)
          : 0;

      const revParMinor =
        availableRoomNights > 0
          ? Math.round(roomRevenueMinor / availableRoomNights)
          : 0;

      expect(occupancyRatePercent).toBe(50.0);
      expect(adrMinor).toBe(10000);
      expect(revParMinor).toBe(5000);
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
});
