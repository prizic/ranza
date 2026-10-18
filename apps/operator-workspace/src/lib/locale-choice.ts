import {
  defaultLocale,
  isSupportedLocale,
  type SupportedLocale,
} from "@ranza/i18n";

/**
 * Which language the bare address opens in (SIGN-03).
 *
 * The address with no language in it used to open Turkish for everybody, so a
 * bookmark to it lost the language a person had chosen, and an English or
 * Arabic browser was answered in Turkish. Now: the language last used on this
 * device, then the browser's own preference, then Turkish.
 */

/** The cookie that remembers the last language, set on every localized page. */
export const LOCALE_COOKIE = "ranza_locale";

/**
 * The supported language an `Accept-Language` header prefers, or undefined.
 * Quality values order the list; a range naming a region (`en-GB`) matches on
 * its language; `*` and anything unsupported are passed over.
 */
export function preferredLocale(
  header: string | null | undefined,
): SupportedLocale | undefined {
  if (!header) return undefined;
  const ranked = header
    .split(",")
    .map((part, position) => {
      const [range = "", ...parameters] = part.trim().split(";");
      const quality = parameters
        .map((parameter) => /^\s*q\s*=\s*([\d.]+)\s*$/i.exec(parameter)?.[1])
        .find((value) => value !== undefined);
      return {
        language: range.trim().toLowerCase().split("-")[0] ?? "",
        quality: quality === undefined ? 1 : Number(quality),
        position,
      };
    })
    .filter(({ quality }) => Number.isFinite(quality) && quality > 0)
    .sort((a, b) => b.quality - a.quality || a.position - b.position);

  return ranked.map(({ language }) => language).find(isSupportedLocale);
}

/** The language to open the bare address in. */
export function openingLocale(
  remembered: string | null | undefined,
  acceptLanguage: string | null | undefined,
): SupportedLocale {
  if (isSupportedLocale(remembered)) return remembered;
  return preferredLocale(acceptLanguage) ?? defaultLocale;
}
