import {
  formatCurrencyName,
  formatTimeZoneOffset,
  type SupportedLocale,
} from "@ranza/i18n";
import type { PickerOption } from "./components/searchable-picker";
import { TIME_ZONE_COUNTRY } from "./time-zone-countries";

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

/** The country a zone is in, named in the reader's language, or nothing. */
function countryOf(zone: string, locale: SupportedLocale): string | null {
  const code = TIME_ZONE_COUNTRY[zone];
  if (!code) return null;
  return new Intl.DisplayNames(locale, { type: "region" }).of(code) ?? null;
}

/**
 * What a country is still called by people who type it. CLDR renamed some (it
 * says Türkiye, and nobody in a hurry types that), and a few have a short form
 * everyone uses.
 */
const COUNTRY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  TR: ["Turkey"],
  CZ: ["Czech Republic"],
  CI: ["Ivory Coast"],
  MM: ["Burma"],
  SZ: ["Swaziland"],
  MK: ["Macedonia"],
  TL: ["East Timor"],
  CV: ["Cape Verde"],
  NL: ["Holland"],
  US: ["USA", "America", "United States of America"],
  GB: ["UK", "England", "Britain"],
  AE: ["UAE", "Emirates"],
};

/**
 * A zone as a person says it: the city and the country, the country in their
 * language — "Istanbul, Türkiye", "Istanbul, تركيا" — rather than the database's
 * `Europe/Istanbul` in Latin script in every language (CONFIG-09). A zone in no
 * country is the name it has.
 */
export function timezoneLabel(zone: string, locale: SupportedLocale): string {
  if (zone === "UTC") return "UTC";
  const country = countryOf(zone, locale);
  return country ? `${zoneCity(zone)}, ${country}` : zone.replaceAll("_", " ");
}

/**
 * What a search for a zone may be typed as: its database name, its city, its
 * country in English and in the reader's language, and the name the time it
 * keeps goes by ("Türkiye Standard Time"). "Turkey" finds Istanbul (CONFIG-05).
 */
function timezoneKeywords(zone: string, locale: SupportedLocale): string[] {
  const code = TIME_ZONE_COUNTRY[zone];
  return [
    zone,
    zone.replaceAll("_", " "),
    zoneCity(zone),
    ...(code
      ? [
          code,
          countryOf(zone, "en") ?? "",
          countryOf(zone, locale) ?? "",
          ...(COUNTRY_ALIASES[code] ?? []),
        ]
      : []),
    zoneTimeName(zone, locale),
  ].filter((term) => term !== "");
}

/** Zones this runtime can write the time of; a zone it has never heard of has no name to find it by. */
const RUNTIME_ZONES = new Set([...Intl.supportedValuesOf("timeZone"), "UTC"]);

function zoneTimeName(zone: string, locale: SupportedLocale): string {
  if (!RUNTIME_ZONES.has(zone)) return "";
  return (
    new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      timeZoneName: "longGeneric",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value ?? ""
  );
}

export function timezoneOptions(
  zones: readonly string[],
  locale: SupportedLocale,
): PickerOption[] {
  return zones.map((zone) => ({
    value: zone,
    label: timezoneLabel(zone, locale),
    detail: formatTimeZoneOffset(zone, locale),
    keywords: timezoneKeywords(zone, locale),
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
