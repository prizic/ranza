export const supportedLocales = ["tr", "en", "ar"] as const;
export const defaultLocale = "tr" as const;

export type SupportedLocale = (typeof supportedLocales)[number];

const intlLocales: Record<SupportedLocale, string> = {
  ar: "ar-TR",
  en: "en-TR",
  tr: "tr-TR",
};

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return (
    typeof value === "string" &&
    supportedLocales.includes(value as SupportedLocale)
  );
}

export function directionFor(locale: SupportedLocale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

/**
 * Isolates a value whose direction is not the sentence's.
 *
 * A Guest's name is data, and in three languages it arrives in either script.
 * Dropped into an Arabic sentence, a Latin name — and worse, a name ending in a
 * bracket, a hyphen or a number — is reordered by the bidirectional algorithm
 * against the text around it: "Undo check-in for Ada Lovelace (VIP)" renders
 * with the bracket at the wrong end, and a name containing both scripts can
 * rearrange the sentence itself.
 *
 * `<bdi>` does this in rendered markup and is the right answer there. This is
 * for the places where there is no element to reach for — an `aria-label`, a
 * `title`, a document title — which are strings and carry the isolate
 * characters instead: U+2068 FIRST STRONG ISOLATE opens, U+2069 POP
 * DIRECTIONAL ISOLATE closes. Assistive technology and the layout engine both
 * honour them; they render as nothing.
 */
export function isolate(value: string): string {
  return `\u2068${value}\u2069`;
}

export function localizeHref(
  locale: SupportedLocale,
  pathname: string,
): string {
  const suffix = pathname === "/" ? "" : `/${pathname.replace(/^\/+/, "")}`;
  return `/${locale}${suffix}`;
}

export function formatNumber(
  value: number,
  locale: SupportedLocale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(intlLocales[locale], options).format(value);
}

/**
 * The weekday alone, in the Property's own timezone.
 *
 * Separate from formatDate because a Property in another timezone can be on a
 * different day from the person reading the screen, and the weekday is the
 * thing that answers "today" for the people working there.
 */
export function formatWeekday(
  value: Date | number,
  locale: SupportedLocale,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat(intlLocales[locale], {
    timeZone,
    weekday: "long",
  }).format(value);
}

/**
 * The calendar day it is at a Property, as `YYYY-MM-DD` — the form a date
 * field submits and a Postgres `date` reads. From the Property's timezone and
 * not the reader's, which is the wrong day for part of every day elsewhere.
 */
export function calendarDay(timeZone: string, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Wall-clock time at a Property. */
export function formatTime(
  value: Date | number,
  locale: SupportedLocale,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat(intlLocales[locale], {
    hour: "2-digit",
    // 24-hour in every language. A shift that starts at 07:00 is written that
    // way on the rota in all three, and en-TR would otherwise resolve to h12.
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  }).format(value);
}

export function formatDate(
  value: Date | number,
  locale: SupportedLocale,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(intlLocales[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options,
  }).format(value);
}

/**
 * An amount of money, from integer minor units.
 *
 * `Intl` rather than a symbol concatenated onto a number, because the symbol
 * is not always a prefix and is not always the same symbol: Turkish writes
 * ₺1.234,56 and Arabic places the currency after the number and may render the
 * digits differently again. Concatenation gets one of the three right.
 *
 * How many minor units make a major one is the currency's own business — 100
 * for TRY, 1000 for KWD, 1 for JPY — so it is read from the resolved format
 * rather than assumed to be two. The division is the only floating-point
 * arithmetic anywhere near money in this product, and it happens after every
 * sum, at the moment of display. Nothing computed from the result is stored.
 */
export function formatMoney(
  amountMinor: number,
  currency: string,
  locale: SupportedLocale,
): string {
  const format = new Intl.NumberFormat(intlLocales[locale], {
    currency,
    style: "currency",
  });
  const minorUnits =
    10 ** (format.resolvedOptions().maximumFractionDigits ?? 2);
  return format.format(amountMinor / minorUnits);
}

/**
 * A currency's name, `TRY` → "Turkish lira", in the reader's language. Null
 * when the runtime cannot name the code, so a caller can leave it out rather
 * than show the code twice.
 */
export function formatCurrencyName(
  code: string,
  locale: SupportedLocale,
): string | null {
  try {
    return (
      new Intl.DisplayNames(intlLocales[locale], {
        type: "currency",
        fallback: "none",
      }).of(code) ?? null
    );
  } catch {
    return null;
  }
}

/**
 * A zone's offset from UTC at an instant, as "GMT+3". Empty when the runtime
 * does not know the zone: an offset is a hint beside its name, never the name.
 */
export function formatTimeZoneOffset(
  zone: string,
  locale: SupportedLocale,
  at: Date | number = Date.now(),
): string {
  try {
    return (
      new Intl.DateTimeFormat(intlLocales[locale], {
        timeZone: zone,
        timeZoneName: "shortOffset",
      })
        .formatToParts(at)
        .find((part) => part.type === "timeZoneName")?.value ?? ""
    );
  } catch {
    return "";
  }
}
