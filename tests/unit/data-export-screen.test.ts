/**
 * What the data export screen decides on its own (RANZ-74): the limits and the
 * lists it restates from the module, and the small functions that word a time,
 * a size and a range. The module's own answers are proved against a database;
 * what is here is that the screen and the module cannot drift apart unseen.
 */
import { describe, expect, it } from "vitest";
import {
  EXPORT_FILE_LIMIT_BYTES,
  EXPORT_RESOURCE_TYPES as MODULE_RESOURCE_TYPES,
  EXPORT_ROW_LIMIT as MODULE_ROW_LIMIT,
  RANGE_CUT_DATASETS as MODULE_RANGE_CUT,
} from "../../packages/ranza/data-export/src";
import {
  firstRunAt,
  formatElapsed,
  formatSize,
  holdsPersonalData,
  inCatalogueOrder,
  rangeCutsAny,
  rangePresets,
  shiftDay,
} from "../../apps/operator-workspace/src/features/data-export/helpers";
import {
  EXPORT_FILE_LIMIT_MEGABYTES,
  EXPORT_RESOURCE_TYPES,
  EXPORT_ROW_LIMIT,
  PERSONAL_DATASETS,
  RANGE_CUT_DATASETS,
} from "../../apps/operator-workspace/src/features/data-export/types";

describe("what the screen restates from the module", () => {
  it("EXP-S1-45: the limits it names are the limits the worker holds", () => {
    expect(EXPORT_ROW_LIMIT).toBe(MODULE_ROW_LIMIT);
    expect(EXPORT_FILE_LIMIT_MEGABYTES * 1024 * 1024).toBe(
      EXPORT_FILE_LIMIT_BYTES,
    );
  });

  it("EXP-S1-08: the datasets it offers are the datasets the database holds, in the same order", () => {
    expect([...EXPORT_RESOURCE_TYPES]).toEqual([...MODULE_RESOURCE_TYPES]);
  });

  it("EXP-S1-52: the datasets it says a range cuts are the ones the readers cut", () => {
    expect([...RANGE_CUT_DATASETS]).toEqual([...MODULE_RANGE_CUT]);
  });

  it("EXP-S1-56: the datasets it warns hold personal data are every one but the rooms", () => {
    expect(
      EXPORT_RESOURCE_TYPES.filter((type) => !PERSONAL_DATASETS.includes(type)),
    ).toEqual(["rooms_beds"]);
  });
});

describe("what a choice of datasets means", () => {
  it("EXP-S1-56: rooms alone hold no personal data, and anything else does", () => {
    expect(holdsPersonalData(["rooms_beds"])).toBe(false);
    expect(holdsPersonalData([])).toBe(false);
    expect(holdsPersonalData(["rooms_beds", "audit_log"])).toBe(true);
  });

  it("EXP-S1-52: a range cuts nothing of guests and rooms, and says so", () => {
    expect(rangeCutsAny(["residents_guests", "rooms_beds"])).toBe(false);
    expect(rangeCutsAny(["residents_guests", "folios_payments"])).toBe(true);
  });

  it("EXP-S1-08: datasets are kept in the catalogue's order whatever order they were chosen in", () => {
    expect(inCatalogueOrder(["audit_log", "residents_guests"])).toEqual([
      "residents_guests",
      "audit_log",
    ]);
  });
});

describe("the days the date field offers", () => {
  it("EXP-S1-52: counts a month back across a year and into a short February", () => {
    expect(rangePresets("2026-01-15").lastMonth).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(rangePresets("2026-03-05").lastMonth).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(rangePresets("2028-03-05").lastMonth.to).toBe("2028-02-29");
  });

  it("EXP-S1-52: the last thirty days include today and the twenty-nine before it", () => {
    expect(rangePresets("2026-03-05").last30).toEqual({
      from: "2026-02-04",
      to: "2026-03-05",
    });
    expect(rangePresets("2026-03-05").thisMonth.from).toBe("2026-03-01");
    expect(rangePresets("2026-03-05").thisYear.from).toBe("2026-01-01");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("a schedule's first run", () => {
  it("EXP-S1-34: is a day, a week or a month from now, a month clamped to the shorter month as the database does", () => {
    const start = new Date(2026, 0, 31, 10, 0);
    expect(firstRunAt("daily", start)).toEqual(new Date(2026, 1, 1, 10, 0));
    expect(firstRunAt("weekly", start)).toEqual(new Date(2026, 1, 7, 10, 0));
    expect(firstRunAt("monthly", start)).toEqual(new Date(2026, 1, 28, 10, 0));
    expect(firstRunAt("monthly", new Date(2026, 4, 15, 9, 0))).toEqual(
      new Date(2026, 5, 15, 9, 0),
    );
  });
});

describe("how a wait and a size are written", () => {
  it("EXP-S1-47: a wait is seconds, then minutes, then hours, in the reader's digits", () => {
    expect(formatElapsed(40_000, "en")).toBe("40s");
    expect(formatElapsed(3 * 60_000 + 5_000, "en")).toBe("3m");
    expect(formatElapsed(2 * 3_600_000, "en")).toBe("2h");
    expect(formatElapsed(-5_000, "en")).toBe("0s");
  });

  it("EXP-S1-47: a size is bytes, kilobytes or megabytes", () => {
    expect(formatSize(512, "en")).toBe("512 byte");
    expect(formatSize(2048, "en")).toBe("2 kB");
    expect(formatSize(5 * 1024 * 1024, "en")).toBe("5 MB");
  });
});
