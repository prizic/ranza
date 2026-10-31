/**
 * A term's fees as a monthly schedule (PP-S2-01, PP-S2-07).
 *
 * The split is the first suggestion for a payment plan and the desk edits it,
 * so what matters is that it never loses a minor unit, never falls due on or
 * after the departure, and invents nothing from a price that is not there.
 */
import { describe, expect, it } from "vitest";
import { INSTALMENTS } from "../../packages/ranza/payment-plans/src";
import {
  addMonths,
  MAX_INSTALMENTS,
  nightsBetween,
  splitTerm,
} from "../../apps/operator-workspace/src/features/front-office/payment-plan-split";

describe("the monthly split", () => {
  it("restates the bound the module and the database hold", () => {
    expect(MAX_INSTALMENTS).toBe(INSTALMENTS.max);
  });

  it("a term is split monthly with the remainder on the first", () => {
    expect(splitTerm(1_000_001, "2026-10-01", "2026-12-15")).toEqual([
      { amountMinor: 333_335, dueOn: "2026-10-01" },
      { amountMinor: 333_333, dueOn: "2026-11-01" },
      { amountMinor: 333_333, dueOn: "2026-12-01" },
    ]);
  });

  it("always adds up to the total, to the minor unit", () => {
    for (const total of [1, 2, 99, 100, 123_457, 9_999_999]) {
      const schedule = splitTerm(total, "2026-09-15", "2027-06-15");
      expect(schedule.reduce((sum, i) => sum + i.amountMinor, 0)).toBe(total);
      expect(schedule[0]!.amountMinor).toBeGreaterThanOrEqual(
        schedule.at(-1)!.amountMinor,
      );
    }
  });

  it("nothing falls due on or after the departure", () => {
    // 15 June is the departure: nine instalments from 15 September to 15 May.
    const schedule = splitTerm(900_000, "2026-09-15", "2027-06-15");
    expect(schedule).toHaveLength(9);
    expect(schedule.at(-1)!.dueOn).toBe("2027-05-15");
    expect(schedule.every((i) => i.dueOn < "2027-06-15")).toBe(true);
  });

  it("a term shorter than a month is one instalment, due on arrival", () => {
    expect(splitTerm(50_000, "2026-10-01", "2026-10-20")).toEqual([
      { amountMinor: 50_000, dueOn: "2026-10-01" },
    ]);
  });

  it("a month the day does not exist in falls on its last day, counted from the start", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("is capped at the most a plan may hold", () => {
    const schedule = splitTerm(6_000_000, "2026-01-01", "2040-01-01");
    expect(schedule).toHaveLength(MAX_INSTALMENTS);
  });

  it("no price, no schedule (PP-S2-07)", () => {
    expect(splitTerm(null, "2026-10-01", "2026-12-01")).toEqual([]);
    expect(splitTerm(0, "2026-10-01", "2026-12-01")).toEqual([]);
    expect(splitTerm(-5, "2026-10-01", "2026-12-01")).toEqual([]);
    expect(splitTerm(1.5, "2026-10-01", "2026-12-01")).toEqual([]);
  });

  it("counts nights between days without a clock", () => {
    expect(nightsBetween("2026-10-25", "2026-10-26")).toBe(1);
    // The night the clocks go back is still one night.
    expect(nightsBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(nightsBetween("2026-12-31", "2027-01-02")).toBe(2);
  });
});
