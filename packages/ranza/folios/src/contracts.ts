import type { CapabilityRef } from "@ranza/core";

/**
 * The public vocabulary of Folios.
 *
 * A Folio is the financial record collecting charges, credits, taxes,
 * adjustments and payments for a Stay (blueprint 2 and 5.9). This module covers
 * a Folio, a line, a balance, a correction and closing. Charge routing, taxes,
 * discounts, credits, deposits, refunds, split folios and company billing are
 * also section 5.9 and are deliberately absent.
 *
 * Recording money is not moving money. Blueprint 5.9 is explicit that a payment
 * record is a record and that external payment processing is a separately
 * entitled integration, so there is no gateway, no provider and no pending
 * state anywhere in this module.
 */

/** Entitlement key for Billing and Folios (blueprint 5.9). */
export const BILLING_MODULE = "billing_folios";

/**
 * Working a Folio: seeing what a Stay has accrued, and posting to it.
 *
 * Gate 3 of blueprint 3.5 for every statement in this module, including the
 * writes. A read carries the commercial gates in the query around it; a write
 * has no such query, so this key is named inside the row-level policies
 * themselves (ADR 0012). Changing it here without changing them stops writes
 * working, which is the safe direction.
 */
export const FOLIO_CAPABILITY: CapabilityRef = {
  moduleKey: BILLING_MODULE,
  capabilityKey: "finance",
};

/**
 * Permissions for posting and reversing lines on a Folio (ADR 0041, PRE-01).
 * Named here so a screen offering the actions asks the same keys the insert
 * policy does.
 */
export const POST_CHARGE_PERMISSION = "finance.post_charge";
export const REVERSE_CHARGE_PERMISSION = "finance.reverse_charge";
export const POST_PAYMENT_PERMISSION = "finance.post_payment";
export const REVERSE_PAYMENT_PERMISSION = "finance.reverse_payment";

/**
 * Open or closed, and nothing else yet.
 *
 * Blueprint 5.9 also names folio closure rules — a balance that must be
 * settled, an approval, a reopening. None of them are built, and a status
 * invented for one would be inventing the workflow (blueprint section 13).
 */
export type FolioStatus = "open" | "closed";

/**
 * Valid payment methods accepted when recording a payment (PRE-01).
 */
export const PAYMENT_METHODS = [
  "cash",
  "card",
  "bank_transfer",
  "other",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * A charge, a payment, or the reversal that cancels one.
 */
export type FolioLineType = "charge" | "payment" | "reversal";

/**
 * Money, as this product holds it.
 *
 * `amountMinor` is an integer count of the currency's minor unit — kuruş for
 * TRY, fils for AED — and is signed: a charge is positive, a payment is negative,
 * and a reversal cancels the original line (ADR 0015). Never a float, because
 * a balance that is the sum of its lines must be exact and binary floating
 * point is not.
 *
 * A JavaScript number is safe to 2^53, which is ninety trillion major units.
 * The column is `bigint`, so the database is not the limit; this contract is,
 * and deliberately, because a string amount would be additions waiting to be
 * done by concatenation.
 */
export interface FolioLine {
  lineId: string;
  lineType: FolioLineType;
  description: string;
  amountMinor: number;
  /** Payment method when lineType is 'payment'; null otherwise. */
  paymentMethod: PaymentMethod | null;
  /** The line this one cancels, on a reversal. Null on a charge or payment. */
  reversesLineId: string | null;
  /** Whether a later line has already cancelled this one. */
  reversed: boolean;
  postedAt: Date;
  /**
   * The business date a room night is for, `YYYY-MM-DD` (ADR 0038); null on
   * every other line. A screen names such a line in the reader's language
   * rather than by the description the database wrote.
   */
  roomNightOf: string | null;
}

/**
 * A Folio as the Finance screen lists it.
 *
 * `balanceMinor` is the sum of the lines the reader may see, computed in the
 * query that read them. It is stored nowhere: a kept total is a second source
 * of truth, and the first thing it does is disagree (ADR 0015).
 */
export interface FolioSummary {
  folioId: string;
  /** The Property it is at — what a screen asks a permission about. */
  propertyId: string;
  stayId: string;
  status: FolioStatus;
  /** ISO 4217, copied from the Property when the Folio opened. */
  currency: string;
  /**
   * From the Reservation, and empty when the Stay began without one. A walk-in
   * has no name recorded anywhere yet — Guest profiles are blueprint 5.3 and
   * are not built, so this says nothing rather than inventing something.
   */
  guestName: string;
  unitName: string;
  balanceMinor: number;
  lineCount: number;
  /**
   * The Guest is still in house, so the Folio cannot be closed by anybody: its
   * nights are still being charged to it (FO-S5-01, ADR 0038).
   */
  stayInHouse: boolean;
}

/** One Folio and everything posted to it, newest first. */
export interface FolioDetail extends FolioSummary {
  lines: readonly FolioLine[];
}

/** What a caller must supply to post a charge. */
export interface Charge {
  folioId: string;
  description: string;
  /** Positive integer minor units of the Folio's own currency. */
  amountMinor: number;
}

/** What a caller must supply to record a payment (PRE-01). */
export interface Payment {
  folioId: string;
  description: string;
  paymentMethod: PaymentMethod;
  /**
   * Positive integer minor units paid by the Guest.
   *
   * The caller supplies a positive integer (what was paid). The write
   * operation stores it signed negative (`amountMinor < 0`) so that the
   * Folio balance remains the exact sum of all lines (ADR 0015).
   */
  amountMinor: number;
}

/**
 * Something that could not be posted.
 *
 * One type for every reason, on the same principle as `CheckInError`: out of
 * reach, closed, already reversed, never existed. Told apart, the first of them
 * would confirm that a Folio the caller cannot see is there.
 *
 * A contract choice rather than an architectural one (ADR 0012's closing note),
 * so a later module may need a different shape.
 */
export class FolioWriteError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FolioWriteError";
  }
}

/** The amount or the description was not something that could be posted. */
export class FolioAmountError extends FolioWriteError {
  constructor(message: string) {
    super(message);
    this.name = "FolioAmountError";
  }
}
