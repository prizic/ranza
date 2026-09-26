import {
  formatDate,
  formatMoney,
  formatNumber,
  formatTime,
  formatWeekday,
  type SupportedLocale,
} from "@ranza/i18n";
import type { Money } from "../../server/today-derive";

/**
 * A calendar date as `YYYY-MM-DD`, shown as that day wherever the reader is.
 *
 * Read as noon UTC and formatted in UTC: a business date is a day, not an
 * instant, and formatting midnight in another timezone can land on the day
 * before.
 */
function asDay(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00Z`);
}

export function dayHeading(isoDate: string, locale: SupportedLocale): string {
  const weekday = formatWeekday(asDay(isoDate), locale, "UTC");
  const date = formatDate(asDay(isoDate), locale, {
    month: "long",
    timeZone: "UTC",
  });
  return `${weekday} · ${date}`;
}

export function shortDay(isoDate: string, locale: SupportedLocale): string {
  return formatDate(asDay(isoDate), locale, {
    year: undefined,
    timeZone: "UTC",
  });
}

export function clockAt(
  instant: number,
  locale: SupportedLocale,
  timeZone: string,
): string {
  return formatTime(instant, locale, timeZone);
}

/**
 * A Property's cutoff, stored as `HH:MM`, written the way every other time on
 * the page is. Formatted in UTC because it is a time of day, not an instant.
 */
export function cutoffTime(hhmm: string, locale: SupportedLocale): string {
  const [hour = 0, minute = 0] = hhmm.split(":").map(Number);
  return formatTime(Date.UTC(2000, 0, 1, hour, minute), locale, "UTC");
}

export function percent(
  part: number,
  whole: number,
  locale: SupportedLocale,
): string | null {
  if (whole <= 0) return null;
  return formatNumber(part / whole, locale, {
    style: "percent",
    maximumFractionDigits: 0,
  });
}

/** Every currency's total, joined; a Property keeps one in practice. */
export function money(
  amounts: readonly Money[],
  currency: string,
  locale: SupportedLocale,
) {
  if (amounts.length === 0) return formatMoney(0, currency, locale);
  return amounts
    .map((amount) => formatMoney(amount.amountMinor, amount.currency, locale))
    .join(" + ");
}

/** Nights from arrival to departure; null for an open-ended stay. */
export function nights(startsOn: string, endsOn: string | null): number | null {
  if (!endsOn) return null;
  return Math.round(
    (asDay(endsOn).getTime() - asDay(startsOn).getTime()) / 86_400_000,
  );
}
