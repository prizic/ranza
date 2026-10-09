import {
  formatDate,
  formatMoney,
  formatNumber,
  type SupportedLocale,
} from "@ranza/i18n";

/** A whole number of units, requests or Properties, in the locale's digits. */
export function formatCount(value: number, locale: SupportedLocale): string {
  return formatNumber(value, locale);
}

/** A share given as 0 to 100, to one place as Analytics writes it: "66.7%". */
export function formatShare(percent: number, locale: SupportedLocale): string {
  return formatNumber(percent / 100, locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/** Integer minor units as the Property's own currency. */
export function formatBalance(
  amountMinor: number,
  currency: string,
  locale: SupportedLocale,
): string {
  return formatMoney(amountMinor, currency, locale);
}

/**
 * A Property's business date, `2026-09-16` as "16 Sep 2026".
 *
 * A calendar date and not an instant, so it is read at noon UTC and formatted
 * in UTC: no zone can move it to the day before.
 */
export function formatBusinessDate(
  isoDate: string,
  locale: SupportedLocale,
): string {
  return formatDate(new Date(`${isoDate}T12:00:00Z`), locale, {
    timeZone: "UTC",
  });
}
