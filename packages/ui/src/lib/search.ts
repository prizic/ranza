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
 * There is no dialling-rule normalization here. The dashboard this came from folds
 * Saudi numbers to a local form; a Guest's telephone is stored as it was typed,
 * and inventing a country's dialling rules would be guessing. A caller that wants
 * a number found by its country-code variants supplies those as fields;
 * `rowMatches` only reads a typed number by its digits.
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

/** Combining marks left once a letter is split from its accent: ş to s, ğ to g. */
const COMBINING_MARKS = /\p{M}/gu;

/** `fold`, with accents removed too, so "Ayse" finds "Ayşe". */
function foldLoose(value: string): string {
  return fold(value).normalize("NFD").replace(COMBINING_MARKS, "");
}

/** A word typed as a telephone number: digits with the punctuation a number is written with. */
const PHONE_WORD = /^[+()\d.-]*\d[+()\d.-]*$/;

/** Words shorter than this are not corrected: two room numbers one digit apart are different rooms. */
const MIN_TYPO_LENGTH = 5;

/** Whether `a` becomes `b` by one insertion, deletion, substitution or swap of neighbours. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let at = 0;
  while (at < a.length && at < b.length && a[at] === b[at]) at += 1;
  if (at === a.length && at === b.length) return true;
  const tail = (value: string, from: number) => value.slice(from);
  return (
    tail(a, at + 1) === tail(b, at + 1) ||
    tail(a, at + 1) === tail(b, at) ||
    tail(a, at) === tail(b, at + 1) ||
    (a[at] === b[at + 1] &&
      a[at + 1] === b[at] &&
      tail(a, at + 2) === tail(b, at + 2))
  );
}

function wordMatches(word: string, fields: readonly string[]): boolean {
  if (fields.some((field) => field.includes(word))) return true;
  // A number typed "+90 532 123" or "(0532) 123-45" is found by its digits.
  if (PHONE_WORD.test(word)) {
    const digits = word.replace(/\D/g, "");
    if (digits !== word && fields.some((field) => field.includes(digits))) {
      return true;
    }
  }
  if (word.length < MIN_TYPO_LENGTH || /\d/.test(word)) return false;
  return fields.some((field) =>
    field
      .split(/[^\p{L}\p{N}]+/u)
      .some((token) => token !== "" && withinOneEdit(word, token)),
  );
}

/**
 * Whether a table row answers a typed query: every word of it is found in some
 * field of the row, so "ayse hotel.com" finds a Guest by name and e-mail at once.
 *
 * Case, script, digit form and accents are ignored. A word typed as a telephone
 * number is also tried as its digits, so spaces, a leading + and brackets do not
 * hide a number. A word of five letters or more that is nowhere in the row is
 * tried again allowing one slipped letter against the row's words.
 */
export function rowMatches(fields: readonly string[], query: string): boolean {
  const words = foldLoose(query)
    .split(/\s+/)
    .filter((word) => word !== "");
  if (words.length === 0) return true;
  const haystack = fields.map(foldLoose);
  return words.every((word) => wordMatches(word, haystack));
}
