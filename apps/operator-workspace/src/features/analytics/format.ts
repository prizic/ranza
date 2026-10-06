import {
  formatDate,
  formatMoney,
  formatNumber,
  formatWeekday,
  type SupportedLocale,
} from "@ranza/i18n";

export function formatMinorMoney(
  amountMinor: number | null | undefined,
  currency: string,
  locale: SupportedLocale,
): string {
  if (amountMinor === null || amountMinor === undefined) return "—";
  return formatMoney(amountMinor, currency, locale);
}

export function formatPercentValue(
  value: number,
  locale: SupportedLocale,
): string {
  return formatNumber(value / 100, locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function asDay(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00Z`);
}

export function formatShortDate(
  isoDate: string,
  locale: SupportedLocale,
): string {
  const weekday = formatWeekday(asDay(isoDate), locale, "UTC");
  const date = formatDate(asDay(isoDate), locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${weekday}, ${date}`;
}

/** `2026-09` as the locale writes a month and a year: "September 2026". */
export function formatMonthTitle(
  month: string,
  locale: SupportedLocale,
): string {
  return formatDate(asDay(`${month}-01`), locale, {
    month: "long",
    day: undefined,
    year: "numeric",
    timeZone: "UTC",
  });
}

/** A business date as the locale writes it in full, for "as of". */
export function formatLongDate(
  isoDate: string,
  locale: SupportedLocale,
): string {
  return formatDate(asDay(isoDate), locale, {
    month: "long",
    timeZone: "UTC",
  });
}

export function formatWeekdayShort(
  isoDate: string,
  locale: SupportedLocale,
): string {
  return formatDate(asDay(isoDate), locale, {
    weekday: "short",
    day: undefined,
    month: undefined,
    year: undefined,
    timeZone: "UTC",
  });
}

export function formatDayOfMonth(
  isoDate: string,
  locale: SupportedLocale,
): string {
  return formatNumber(Number(isoDate.slice(8, 10)), locale);
}

/** A change in percent of the prior figure, signed: "+4.2%". A dash when there is none. */
export function formatPercentChange(
  value: number | null,
  locale: SupportedLocale,
): string {
  if (value === null) return "—";
  return formatNumber(value / 100, locale, {
    style: "percent",
    signDisplay: "exceptZero",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/** A change in percentage points, signed and to one place: "+5.0". A dash when there is none. */
export function formatPointValue(
  value: number | null,
  locale: SupportedLocale,
): string | null {
  if (value === null) return null;
  return formatNumber(value, locale, {
    signDisplay: "exceptZero",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
