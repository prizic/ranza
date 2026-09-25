import { describe, expect, it } from "vitest";
import {
  toMinorUnits,
  toTypedAmount,
} from "../../apps/operator-workspace/src/lib/amount";

/**
 * An amount as a person types it, in minor units and back. The number of
 * places is the currency's, so each case names one with two, three and none.
 */
describe("toMinorUnits", () => {
  it.each([
    ["450", "TRY", 45000],
    ["450.5", "TRY", 45050],
    ["450,50", "TRY", 45050],
    [" 0 ", "TRY", 0],
    ["12.345", "KWD", 12345],
    ["12", "KWD", 12000],
    ["500", "JPY", 500],
    ["٤٥٠", "TRY", 45000],
    ["٤٥٠٫٥", "TRY", 45050],
    ["٤٥٠,٥٠", "TRY", 45050],
    ["۴۵۰", "TRY", 45000],
  ])("reads %j %s as %i", (typed, currency, minor) => {
    expect(toMinorUnits(typed, currency)).toBe(minor);
  });

  it("reads nothing in a currency code that is not one", () => {
    expect(toMinorUnits("450", "NOT A CODE")).toBeNull();
  });

  it.each([
    ["450.555", "TRY"],
    ["5.5", "JPY"],
    ["-1", "TRY"],
    ["1e3", "TRY"],
    ["1.234,56", "TRY"],
    ["", "TRY"],
    ["9999999999999", "TRY"],
    ["٤٥٠٫٥٥٥", "TRY"],
    ["٤٬٥٠٠", "TRY"],
  ])("refuses %j %s", (typed, currency) => {
    expect(toMinorUnits(typed, currency)).toBeNull();
  });
});

describe("toTypedAmount", () => {
  it.each([
    [45000, "TRY", "450"],
    [45050, "TRY", "450.5"],
    [5, "TRY", "0.05"],
    [0, "TRY", "0"],
    [12345, "KWD", "12.345"],
    [500, "JPY", "500"],
  ])("writes %i %s as %j", (minor, currency, typed) => {
    expect(toTypedAmount(minor, currency)).toBe(typed);
  });

  it("round-trips what it writes", () => {
    for (const currency of ["TRY", "KWD", "JPY"]) {
      for (const minor of [0, 1, 7, 10, 99, 100, 101, 45050, 123456789]) {
        expect(toMinorUnits(toTypedAmount(minor, currency), currency)).toBe(
          minor,
        );
      }
    }
  });
});
