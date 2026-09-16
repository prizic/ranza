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

export function localeFromPathname(pathname: string): SupportedLocale {
  const segment = pathname.split("/").filter(Boolean)[0];
  return isSupportedLocale(segment) ? segment : defaultLocale;
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
