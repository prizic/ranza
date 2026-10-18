import type { SupportedLocale } from "@ranza/i18n";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long ago an instant was, in the reader's language and in the coarsest
 * unit that is still a whole number: "12 min. ago", "3 hr. ago", "2 days ago".
 * A board is read for "how long has this waited", never for the second.
 */
export function ageSince(
  instant: string,
  locale: SupportedLocale,
  now: Date = new Date(),
): string {
  const elapsed = Math.max(0, now.getTime() - new Date(instant).getTime());
  const formatter = new Intl.RelativeTimeFormat(locale, {
    numeric: "always",
    style: "short",
  });
  if (elapsed >= DAY)
    return formatter.format(-Math.floor(elapsed / DAY), "day");
  if (elapsed >= HOUR) {
    return formatter.format(-Math.floor(elapsed / HOUR), "hour");
  }
  return formatter.format(-Math.max(1, Math.floor(elapsed / MINUTE)), "minute");
}
