import { formatTime, type SupportedLocale } from "@ranza/i18n";

/**
 * An expected arrival (`HH:MM`, the Property's own clock) as the reader's
 * language writes a time of day.
 *
 * It is a wall-clock time and not an instant, so it is built on a fixed day in
 * UTC and formatted in UTC: any other zone would shift it by the reader's
 * offset and show the Guest arriving at a time nobody said.
 */
export function expectedArrivalLabel(
  time: string,
  locale: SupportedLocale,
): string {
  const [hours = "0", minutes = "0"] = time.split(":");
  return formatTime(
    Date.UTC(2000, 0, 1, Number(hours), Number(minutes)),
    locale,
    "UTC",
  );
}
