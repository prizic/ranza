/**
 * How a typed name or number is compared with the Guests on file.
 *
 * One folding rule, applied by the database to the stored value and to what was
 * typed alike, so the two cannot disagree about what counts as the same letter:
 * a desk typing "Ozdemir" finds "Özdemir", "Ayse" finds "Ayşe", "ISTANBUL" finds
 * "İstanbul", and a number written with Arabic-Indic digits is read as digits.
 * It is the matching the Reservations list already gives a search
 * (`packages/ui/src/lib/search.ts`), restated here because a module cannot
 * import the interface and the suggestion is computed in the database.
 *
 * Only ever a suggestion (blueprint 18.7): a match is shown to the desk, who
 * decides, and nothing here merges two Guests.
 */

/** Letters read as another letter, each as [from, to]; case is folded after. */
const LETTER_PAIRS: readonly (readonly [string, string])[] = [
  ["ç", "c"],
  ["Ç", "c"],
  ["ğ", "g"],
  ["Ğ", "g"],
  ["ı", "i"],
  ["İ", "i"],
  ["ö", "o"],
  ["Ö", "o"],
  ["ş", "s"],
  ["Ş", "s"],
  ["ü", "u"],
  ["Ü", "u"],
  ["á", "a"],
  ["à", "a"],
  ["â", "a"],
  ["ä", "a"],
  ["ã", "a"],
  ["å", "a"],
  ["Á", "a"],
  ["À", "a"],
  ["Â", "a"],
  ["Ä", "a"],
  ["Ã", "a"],
  ["Å", "a"],
  ["é", "e"],
  ["è", "e"],
  ["ê", "e"],
  ["ë", "e"],
  ["É", "e"],
  ["È", "e"],
  ["Ê", "e"],
  ["Ë", "e"],
  ["í", "i"],
  ["ì", "i"],
  ["î", "i"],
  ["ï", "i"],
  ["Í", "i"],
  ["Ì", "i"],
  ["Î", "i"],
  ["Ï", "i"],
  ["ó", "o"],
  ["ò", "o"],
  ["ô", "o"],
  ["õ", "o"],
  ["Ó", "o"],
  ["Ò", "o"],
  ["Ô", "o"],
  ["Õ", "o"],
  ["ú", "u"],
  ["ù", "u"],
  ["û", "u"],
  ["Ú", "u"],
  ["Ù", "u"],
  ["Û", "u"],
  ["ñ", "n"],
  ["Ñ", "n"],
  ["ý", "y"],
  ["ÿ", "y"],
  ["Ý", "y"],
  // The four forms of alef are one letter to a reader who types fast, and
  // tā' marbūṭa / alef maksura are the two endings people swap.
  ["أ", "ا"],
  ["إ", "ا"],
  ["آ", "ا"],
  ["ة", "ه"],
  ["ى", "ي"],
  ["٠", "0"],
  ["١", "1"],
  ["٢", "2"],
  ["٣", "3"],
  ["٤", "4"],
  ["٥", "5"],
  ["٦", "6"],
  ["٧", "7"],
  ["٨", "8"],
  ["٩", "9"],
  ["۰", "0"],
  ["۱", "1"],
  ["۲", "2"],
  ["۳", "3"],
  ["۴", "4"],
  ["۵", "5"],
  ["۶", "6"],
  ["۷", "7"],
  ["۸", "8"],
  ["۹", "9"],
];

/** Arabic vowel marks and the tatweel, which `translate` deletes when unmatched. */
const DELETED = "ًٌٍَُِّْـ̇";

/** `translate()`'s second argument; the deleted marks sit past the pairs. */
export const FOLD_FROM = LETTER_PAIRS.map(([from]) => from).join("") + DELETED;

/** `translate()`'s third argument: shorter than `FOLD_FROM`, so the tail is dropped. */
export const FOLD_TO = LETTER_PAIRS.map(([, to]) => to).join("");

/**
 * How many trailing digits of a number are compared. A telephone is stored as it
 * was typed, so the same line is "0537 021 04 95" on one booking and
 * "+90 537 021 04 95" on another; the national number is the last ten digits
 * in both, and a country code or a trunk zero in front is not part of it.
 */
export const PHONE_TAIL_DIGITS = 10;

/** Fewest characters of a name, and digits of a number, worth looking anything up for. */
export const MIN_NAME_CHARACTERS = 3;
export const MIN_NUMBER_DIGITS = 4;
