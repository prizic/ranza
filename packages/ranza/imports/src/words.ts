import { normalizeHeading } from "./columns";

/**
 * The words a cell may hold for yes and no, and for women, men and anyone,
 * in the three languages, compared as headings are (IMP-S1-19, IMP-S2-04).
 */
export const words = (...values: string[]) =>
  new Set(values.map(normalizeHeading));

export const YES = words("yes", "y", "true", "1", "evet", "e", "var", "نعم");
export const NO = words("no", "n", "false", "0", "hayır", "h", "yok", "لا");

export const WOMEN = words(
  "women",
  "woman",
  "female",
  "f",
  "girls",
  "kadın",
  "kız",
  "k",
  "bayan",
  "نساء",
  "إناث",
  "أنثى",
  "بنات",
);
export const MEN = words(
  "men",
  "man",
  "male",
  "m",
  "boys",
  "erkek",
  "bay",
  "رجال",
  "ذكور",
  "ذكر",
  "أولاد",
);
export const ANYONE = words(
  "anyone",
  "any",
  "all",
  "mixed",
  "herkes",
  "karma",
  "الجميع",
  "مختلط",
);
