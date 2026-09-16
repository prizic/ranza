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
 * leads with.
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

/** True when `query` appears in `value`, ignoring case, script and digit form. */
export function fieldMatches(value: string, query: string): boolean {
  const needle = toAsciiDigits(query.trim()).toLocaleLowerCase("tr");
  if (!needle) return true;
  return toAsciiDigits(value).toLocaleLowerCase("tr").includes(needle);
}
