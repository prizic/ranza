import {
  formatCurrencyName,
  formatTimeZoneOffset,
  type SupportedLocale,
} from "@ranza/i18n";
import type { PickerOption } from "./components/searchable-picker";

/**
 * What the Configuration form offers, named in the reader's language.
 *
 * The lists themselves are not decided here. Time zones come from the server
 * (the ones Postgres and this runtime both know); currencies are every ISO
 * 4217 code the runtime can name, which the database's own check then bounds
 * to three capital letters. These only turn a code into words.
 */

/** `Europe/Istanbul` → `Istanbul`, the part a person recognises. */
export function zoneCity(zone: string): string {
  return (zone.split("/").at(-1) ?? zone).replaceAll("_", " ");
}

export function timezoneOptions(
  zones: readonly string[],
  locale: SupportedLocale,
): PickerOption[] {
  return zones.map((zone) => ({
    value: zone,
    label: zone === "UTC" ? "UTC" : `${zoneCity(zone)} · ${zone.split("/")[0]}`,
    detail: formatTimeZoneOffset(zone, locale),
    keywords: [zone, zone.replaceAll("_", " ")],
  }));
}

export function currencyOptions(locale: SupportedLocale): PickerOption[] {
  return Intl.supportedValuesOf("currency").flatMap((code) => {
    const name = formatCurrencyName(code, locale);
    return name
      ? [{ value: code, label: name, detail: code, keywords: [code] }]
      : [];
  });
}

/**
 * Every quarter hour from 03:00 up to but not including noon — the window
 * ADR 0021 allows — and the saved value too, if somebody set an odd minute in
 * SQL before this screen existed.
 */
export function cutoffOptions(current: string): string[] {
  const steps = Array.from({ length: 36 }, (_, index) => {
    const minutes = 180 + index * 15;
    const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
    return `${hours}:${String(minutes % 60).padStart(2, "0")}`;
  });
  return steps.includes(current) ? steps : [...steps, current].sort();
}
