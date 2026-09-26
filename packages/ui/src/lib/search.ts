/**
 * Free-text matching for listing toolbars.
 *
 * Arabic-Indic digits are folded to ASCII before comparing, because a Reservation
 * reference typed on an Arabic keyboard arrives as ٢٠٢٦ and is stored as 2026.
 * Without this a Resident searching for their own booking finds nothing and has
 * no way to tell why.
 *
 * Turkish case folding is deliberate too: `toLocaleLowerCase("tr")` maps I to ı
 * and İ to i, so searching "İSTANBUL" finds "istanbul". The invariant lower-case
 * used elsewhere gets that pair wrong in exactly the language this product
 * leads with. Dotless ı is then read as i, for the reason on `fold`.
 *
 * There is no phone normalization here. The dashboard this came from folds Saudi
 * numbers to a local form; Ranza has no phone column yet, and inventing a
 * country's dialling rules before there is a number to match would be guessing.
 */

/** Arabic-Indic and Eastern Arabic-Indic digits to their ASCII forms. */
const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

export function toAsciiDigits(value: string): string {
  return value.replace(ARABIC_DIGITS, (digit) => {
    const code = digit.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

/**
 * Lower-cased the Turkish way, then with dotless ı read as i. Turkish rules
 * alone make "Istanbul Suites" into "ıstanbul suites", so a Latin brand name
 * with a plain capital I is missed by anybody who types it with an i; folding
 * the pair together finds it whichever of the two was typed.
 */
function fold(value: string): string {
  return toAsciiDigits(value).toLocaleLowerCase("tr").replaceAll("ı", "i");
}

/** True when `query` appears in `value`, ignoring case, script and digit form. */
export function fieldMatches(value: string, query: string): boolean {
  const needle = fold(query.trim());
  if (!needle) return true;
  return fold(value).includes(needle);
}
