import { describe, expect, it } from "vitest";
import {
  parseAmount,
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

/**
 * FIN-04: the grouping a person types is the grouping of the language of the
 * screen, and a lone separator is read by that language.
 */
describe("toMinorUnits in the language of the screen", () => {
  it.each([
    ["1,250.00", "TRY", "en", 125000],
    ["1,250", "TRY", "en", 125000],
    ["1,250,000.5", "TRY", "en", 125000050],
    ["1.250,00", "TRY", "tr", 125000],
    ["1.250", "TRY", "tr", 125000],
    ["1.250.000,5", "TRY", "tr", 125000050],
    ["12,5", "TRY", "tr", 1250],
    ["12.5", "TRY", "tr", 1250],
    ["1,250.00", "TRY", "tr", 125000],
    ["١٬٢٥٠٫٠٠", "TRY", "ar", 125000],
    ["١٬٢٥٠", "TRY", "ar", 125000],
    ["1,250", "TRY", "ar", 125000],
    ["١٢,٥٠", "TRY", "ar", 1250],
    ["1 250,00", "TRY", "tr", 125000],
    ["12.345", "KWD", "en", 12345],
    ["1.250", "KWD", "ar", 1250],
  ])("reads %j %s typed in %s as %i", (typed, currency, locale, minor) => {
    expect(toMinorUnits(typed, currency, locale)).toBe(minor);
  });

  it.each([
    ["12.505", "TRY", "en", "decimals"],
    ["12,505", "TRY", "tr", "decimals"],
    ["1,2,3", "TRY", "en", "format"],
    ["1,25,000", "TRY", "en", "format"],
    ["12abc", "TRY", "en", "format"],
    ["", "TRY", "en", "format"],
    ["9999999999999", "TRY", "en", "size"],
  ] as const)(
    "refuses %j %s typed in %s because of its %s",
    (typed, currency, locale, fault) => {
      expect(parseAmount(typed, currency, locale)).toEqual({
        ok: false,
        fault,
      });
    },
  );
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
