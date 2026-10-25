/**
 * Money on a record, as a reader says it rather than as the ledger stores it.
 *
 * The ledger keeps a payment as a credit, a negative amount, so the lines of a
 * Folio sum to what is owed (ADR 0015), and the payment's record carries that
 * stored sign. A manager reading "Payment · -₺2,735.00" takes it for a refund,
 * so a payment posted reads as the money received. A reversal keeps its sign,
 * because there the sign says which way it went (DATA-02).
 */

/** The action whose amount is stored as a credit. */
const PAYMENT_POSTED = "folio.payment_posted";

/** The amount a record's reader should see, in minor units. */
export function shownAmount(action: string, amountMinor: number): number {
  return action === PAYMENT_POSTED ? Math.abs(amountMinor) : amountMinor;
}

/**
 * An amount a record carries, whichever way the writer stored it. A balance read
 * out of a SQL `sum` was recorded as a string of digits ("0") before it was
 * recorded as a number, and records are never rewritten, so both are read.
 */
export function minorUnitsOf(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && /^-?\d{1,15}$/.test(value)) {
    return Number(value);
  }
  return null;
}
