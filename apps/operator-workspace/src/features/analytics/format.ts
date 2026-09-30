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
