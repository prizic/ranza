export const supportedLocales = ["tr", "en", "ar"] as const;
export const defaultLocale = "tr" as const;

export type SupportedLocale = (typeof supportedLocales)[number];

export function directionFor(locale: SupportedLocale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}
