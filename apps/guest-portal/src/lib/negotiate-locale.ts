import {
  defaultLocale,
  isSupportedLocale,
  type SupportedLocale,
} from "@ranza/i18n";

/** The cookie that remembers the language somebody last chose. */
export const LOCALE_COOKIE = "ranza-locale";

/**
 * The language to open a link that names none: the one the visitor last
 * chose, else the first of their browser's languages that the Portal speaks,
 * else Turkish. `Accept-Language` is read by quality, then by the order it was
 * written in, and a regional tag (`en-GB`, `ar-EG`) counts as its language.
 */
export function negotiateLocale(
  remembered: string | undefined,
  acceptLanguage: string | null,
): SupportedLocale {
  if (isSupportedLocale(remembered)) return remembered;

  const ranked = (acceptLanguage ?? "")
    .split(",")
    .map((part, index) => {
      const [tag = "", ...parameters] = part.trim().split(";");
      const quality = parameters
        .map((parameter) => parameter.trim().match(/^q=([0-9.]+)$/)?.[1])
        .find((value) => value !== undefined);
      return {
        language: tag.trim().toLowerCase().split("-")[0] ?? "",
        quality: quality === undefined ? 1 : Number(quality),
        index,
      };
    })
    .filter(({ quality }) => quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  return (
    (ranked.find(({ language }) => isSupportedLocale(language))?.language as
      SupportedLocale | undefined) ?? defaultLocale
  );
}
