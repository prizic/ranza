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

/** The day of the month alone, for a tick under a chart. */
export function dayNumber(isoDate: string, locale: SupportedLocale): string {
  return formatDate(asDay(isoDate), locale, {
    day: "numeric",
    month: undefined,
    year: undefined,
    timeZone: "UTC",
  });
}

/** The weekday in its short form, for a tick that has a day number under it. */
export function weekdayShort(isoDate: string, locale: SupportedLocale): string {
  return formatDate(asDay(isoDate), locale, {
    weekday: "short",
    day: undefined,
    month: undefined,
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

/**
 * The name of a Property's time zone in the reader's language: "Türkiye
 * Time", not the identifier it is stored under.
 */
export function zoneName(timeZone: string, locale: SupportedLocale): string {
  const name = new Intl.DateTimeFormat(locale, {
    timeZone,
    timeZoneName: "longGeneric",
  })
    .formatToParts(new Date())
    .find((part) => part.type === "timeZoneName");
  return name?.value ?? timeZone;
}

/**
 * A length of time on the desk's scale, "2h 32m": hours and minutes, however
 * the language writes them, never seconds and never "0m" beside an hour.
 */
export function duration(minutes: number, locale: SupportedLocale): string {
  const whole = Math.max(0, Math.round(minutes));
  const unit = (value: number, name: "hour" | "minute") =>
    new Intl.NumberFormat(locale, {
      style: "unit",
      unit: name,
      unitDisplay: "narrow",
    }).format(value);
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (hours === 0) return unit(rest, "minute");
  return rest === 0
    ? unit(hours, "hour")
    : `${unit(hours, "hour")} ${unit(rest, "minute")}`;
}
