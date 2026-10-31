/**
 * What a document number is, before the database is asked (PA-S2-*).
 *
 * The database refuses what these refuse (`guest_particulars_document_number_check`
 * and `app.is_tc_kimlik`); this is the same rule applied first, so the desk is
 * told which field to fix instead of being handed a constraint name.
 */

/** Spaces and hyphens are how people write a number down; neither is part of it. */
export function normalizeDocumentNumber(typed: string): string {
  return typed.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * Whether an eleven-digit string is a T.C. kimlik number. The tenth digit is
 * seven times the sum of the odd positions among the first nine, less the sum
 * of the even ones, modulo ten; the eleventh is the sum of the first ten,
 * modulo ten; the first is never zero.
 */
export function isTcKimlik(candidate: string): boolean {
  if (!/^[1-9][0-9]{10}$/.test(candidate)) return false;
  const digit = [...candidate].map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const odd = digit[0] + digit[2] + digit[4] + digit[6] + digit[8];
  const even = digit[1] + digit[3] + digit[5] + digit[7];
  return (
    (((odd * 7 - even) % 10) + 10) % 10 === digit[9] &&
    (odd + even + digit[9]) % 10 === digit[10]
  );
}
