/**
 * The database's answers that mean "no", as opposed to "something broke".
 *
 * A posting is refused by the insert policy or the closed-Folio trigger
 * (42501), by a check or the exact-reversal rule (23514), by a composite key
 * (23503), or — for a reversal — by the one-reversal-per-line index (23505). A
 * closure is refused by its trigger (55000). Those become `FolioWriteError`.
 * Anything else — a lost connection, a schema that moved — is a defect and
 * travels on as itself, so the caller logs it rather than showing it as a
 * refusal nobody hears about (FO-S9-04).
 */
export const POSTING_REFUSED = ["42501", "23514", "23503"] as const;
export const REVERSAL_REFUSED = [...POSTING_REFUSED, "23505"] as const;
export const CLOSURE_REFUSED = ["55000"] as const;

/**
 * Whether a failure carries one of these SQLSTATEs.
 *
 * Read from the code rather than from a constraint or trigger name, for the
 * reasons `@ranza/reservations` gives: Prisma reports a raw-query failure as
 * P2010 with the real code inside `meta`, and the message is checked too
 * because the shape of `meta` is Prisma's private arrangement.
 */
export function raisedOneOf(error: unknown, codes: readonly string[]): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { meta, message } = error as {
    meta?: { driverAdapterError?: { cause?: { code?: unknown } } };
    message?: unknown;
  };
  const code = meta?.driverAdapterError?.cause?.code;
  return codes.some(
    (expected) =>
      code === expected ||
      (typeof message === "string" && message.includes(expected)),
  );
}
