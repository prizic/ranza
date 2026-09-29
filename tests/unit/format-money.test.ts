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
  const clean = text.replace(/[\u200e\u200f\u061c]/g, "");
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
