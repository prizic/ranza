/**
 * The identity document as the booking dialog and the registration sheet know
 * it (PA-S2-*). `@ranza/guests` holds the rule the database enforces; a client
 * component does not import a module (ADR 0007), so it is restated here and
 * `tests/unit/identity-document.test.ts` fails if the two disagree.
 */

export const DOCUMENT_TYPES = [
  "tc_kimlik",
  "passport",
  "residence_permit",
  "other",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export function isDocumentType(value: string): value is DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(value);
}

/** The bounds of a number that is not a T.C. kimlik. */
export const DOCUMENT_NUMBER = { min: 6, max: 20, tcKimlik: 11 } as const;

/** Spaces and hyphens are how a number is written down; neither is part of it. */
export function normalizeDocumentNumber(typed: string): string {
  return typed.replace(/[\s-]/g, "").toUpperCase();
}

function isTcKimlik(candidate: string): boolean {
  if (!/^[1-9][0-9]{10}$/.test(candidate)) return false;
  const digit = [...candidate].map(Number);
  const at = (index: number) => digit[index] ?? 0;
  const odd = at(0) + at(2) + at(4) + at(6) + at(8);
  const even = at(1) + at(3) + at(5) + at(7);
  return (
    (((odd * 7 - even) % 10) + 10) % 10 === at(9) &&
    (odd + even + at(9)) % 10 === at(10)
  );
}

export type DocumentNumberProblem = "tcKimlik" | "other" | "type";

/**
 * Why a typed number is not one, or null when it is acceptable or empty. An
 * empty number is nothing typed, which is always allowed; a number with no
 * kind chosen cannot be checked and is the desk's to complete.
 */
export function documentNumberProblem(
  type: DocumentType | "",
  typed: string,
): DocumentNumberProblem | null {
  const number = normalizeDocumentNumber(typed.trim());
  if (number === "") return null;
  if (type === "") return "type";
  if (type === "tc_kimlik") return isTcKimlik(number) ? null : "tcKimlik";
  return /^[A-Z0-9]+$/.test(number) &&
    number.length >= DOCUMENT_NUMBER.min &&
    number.length <= DOCUMENT_NUMBER.max
    ? null
    : "other";
}

/** What a screen shows of a number until somebody asks for the rest. */
export function maskedDocumentNumber(lastFour: string): string {
  return `•••• ${lastFour}`;
}
