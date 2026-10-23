/**
 * Money at display (FO-S9-06, ADR 0015).
 *
 * An amount is an integer count of minor units until the moment it is shown,
 * and how many there are to a major unit is the currency's to say — none for
 * JPY, two for TRY, three for KWD — read by Intl at display and nowhere else.
 * A hardcoded 100 would print a yen amount a hundred times too small and a
 * dinar amount ten times too large, in every language at once.
 */
import { describe, expect, it } from "vitest";
import { formatMoney, supportedLocales } from "../../packages/i18n/src";

/**
 * The signed number as printed, without the symbol or bidi marks. Matched
 * rather than stripped: the Arabic dinar's symbol, د.ك., carries dots of its
 * own, and the sign may stand before the symbol rather than the digits.
 */
const figure = (text: string): string => {
  const clean = text.replace(/[\u200e\u200f\u061c\u2066-\u2069]/g, "");
  const digits = clean.match(/\d(?:[\d.,]*\d)?/)?.[0] ?? "";
  return /[-\u2212]/.test(clean) ? `-${digits}` : digits;
};

const cases = {
  tr: { JPY: "123.456", TRY: "1.234,56", KWD: "123,456" },
  en: { JPY: "123,456", TRY: "1,234.56", KWD: "123.456" },
  ar: { JPY: "123,456", TRY: "1,234.56", KWD: "123.456" },
} as const;

const smallest = {
  tr: { JPY: "-5", TRY: "-0,05", KWD: "-0,005" },
  en: { JPY: "-5", TRY: "-0.05", KWD: "-0.005" },
  ar: { JPY: "-5", TRY: "-0.05", KWD: "-0.005" },
} as const;

describe("an amount in minor units, shown", () => {
  for (const locale of supportedLocales) {
    for (const currency of ["JPY", "TRY", "KWD"] as const) {
      it(`${currency} in ${locale} uses the currency's own minor unit`, () => {
        expect(figure(formatMoney(123456, currency, locale))).toBe(
          cases[locale][currency],
        );
        // A reversal is negative, and the smallest amount keeps every digit.
        expect(figure(formatMoney(-5, currency, locale))).toBe(
          smallest[locale][currency],
        );
      });
    }
  }

  it("names the currency, so two Folios in two currencies never read alike", () => {
    expect(formatMoney(123456, "TRY", "en")).not.toBe(
      formatMoney(123456, "KWD", "en"),
    );
    expect(formatMoney(123456, "KWD", "ar")).toMatch(/د\.ك/);
  });
});

/**
 * Money is one left-to-right unit in an Arabic cell. ICU writes a
 * right-to-left mark before a positive Arabic amount and a left-to-right mark
 * before the sign of a negative one, so two amounts in one column read in two
 * orders: `TRY${NBSP}740.00` and "-100.00 TRY". Every character is spelled out
 * because the invisible ones are the whole behaviour.
 */
describe("an amount is one left-to-right unit", () => {
  const LRI = "\u2066";
  const PDI = "\u2069";
  const NBSP = "\u00a0";

  const exact: [
    amountMinor: number,
    currency: string,
    locale: "en" | "tr" | "ar",
    expected: string,
  ][] = [
    [74000, "TRY", "en", `TRY${NBSP}740.00`],
    [-10000, "TRY", "en", `-TRY${NBSP}100.00`],
    [0, "TRY", "en", `TRY${NBSP}0.00`],
    [123456, "KWD", "en", `KWD${NBSP}123.456`],
    [74000, "TRY", "tr", "\u20ba740,00"],
    [-10000, "TRY", "tr", "-\u20ba100,00"],
    [0, "TRY", "tr", "\u20ba0,00"],
    [123456, "KWD", "tr", `KWD${NBSP}123,456`],
    [74000, "TRY", "ar", `${LRI}740.00${NBSP}TRY${PDI}`],
    [-10000, "TRY", "ar", `${LRI}-100.00${NBSP}TRY${PDI}`],
    [0, "TRY", "ar", `${LRI}0.00${NBSP}TRY${PDI}`],
    [-123456, "KWD", "ar", `${LRI}-123.456${NBSP}\u062f.\u0643.\u200f${PDI}`],
    [123456, "KWD", "ar", `${LRI}123.456${NBSP}\u062f.\u0643.\u200f${PDI}`],
  ];

  for (const [amountMinor, currency, locale, expected] of exact) {
    it(`${amountMinor} minor units of ${currency} in ${locale} is spelled exactly`, () => {
      expect(formatMoney(amountMinor, currency, locale)).toBe(expected);
    });
  }

  it("writes no invisible character into an English or Turkish amount", () => {
    for (const locale of ["en", "tr"] as const) {
      expect(formatMoney(-10000, "TRY", locale)).not.toMatch(
        /[\u200e\u200f\u061c\u2066-\u2069]/,
      );
    }
  });

  it("gives a positive and a negative Arabic amount the same shape", () => {
    const shape = (text: string) => text.replace(/[-\d.]+/, "N");
    expect(shape(formatMoney(74000, "TRY", "ar"))).toBe(
      shape(formatMoney(-10000, "TRY", "ar")),
    );
  });
});
