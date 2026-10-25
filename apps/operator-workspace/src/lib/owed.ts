/**
 * What a Guest owes, in one place (FINANCE-01, RANZ-52).
 *
 * Nights post to a Folio when each business day closes and at check-out
 * (ADR 0038), so a Guest in house always owes more than their Folio says: the
 * balance is what is on the bill, and the nights already slept that no close
 * has charged yet are what check-out will add. Every screen that shows what
 * somebody owes asks this file, so Today, Departures and Finance cannot give
 * three answers to one question.
 *
 * Pure arithmetic on numbers a read already holds, kept apart from the module
 * so a client component can import it without pulling in the database.
 */

/** What every read of a bill carries: the Folio's balance and the nights check-out would add. */
export interface Bill {
  balanceMinor: number;
  pendingMinor: number;
}

/**
 * What one Guest owes. `nowMinor` is what is already on the bill and unpaid,
 * `atCheckOutMinor` is what check-out adds on top, and `totalMinor` is both.
 * `netMinor` is the same total with its sign, for the one place that must say
 * a Guest is in credit: negative means the hotel holds that much of theirs.
 *
 * The three parts are zero for a Guest who owes nothing, a credit included:
 * money held for one Guest does not make another Guest's debt smaller, so a
 * credit is never a negative amount owed.
 */
export interface Owed {
  nowMinor: number;
  atCheckOutMinor: number;
  totalMinor: number;
  netMinor: number;
}

/**
 * A credit already on the Folio is spent on the nights check-out will charge,
 * so `nowMinor` never goes below zero and the two parts always add up to the
 * total the Guest pays.
 */
export function owedOnFolio(bill: Bill): Owed {
  const netMinor = bill.balanceMinor + bill.pendingMinor;
  if (netMinor <= 0) {
    return { nowMinor: 0, atCheckOutMinor: 0, totalMinor: 0, netMinor };
  }
  const nowMinor = Math.max(bill.balanceMinor, 0);
  return {
    nowMinor,
    atCheckOutMinor: netMinor - nowMinor,
    totalMinor: netMinor,
    netMinor,
  };
}

/** The bill leaves something to pay, counting the nights check-out will add. */
export function isOwing(bill: Bill): boolean {
  return owedOnFolio(bill).totalMinor > 0;
}

/** What a set of Folios owes in one currency, and how many of them owe it. */
export interface OwedIn {
  currency: string;
  folios: number;
  nowMinor: number;
  atCheckOutMinor: number;
  totalMinor: number;
}

/**
 * What the Folios in `bills` owe, per currency: only those that owe anything
 * count, because a Folio in credit is not money that makes another Folio's
 * debt smaller. A sum across two currencies is a number in neither, so each
 * keeps its own.
 */
export function owedAcrossFolios(
  bills: readonly (Bill & { currency: string })[],
): OwedIn[] {
  const byCurrency = new Map<string, OwedIn>();
  for (const bill of bills) {
    const owed = owedOnFolio(bill);
    if (owed.totalMinor === 0) continue;
    const sum = byCurrency.get(bill.currency) ?? {
      currency: bill.currency,
      folios: 0,
      nowMinor: 0,
      atCheckOutMinor: 0,
      totalMinor: 0,
    };
    byCurrency.set(bill.currency, {
      currency: bill.currency,
      folios: sum.folios + 1,
      nowMinor: sum.nowMinor + owed.nowMinor,
      atCheckOutMinor: sum.atCheckOutMinor + owed.atCheckOutMinor,
      totalMinor: sum.totalMinor + owed.totalMinor,
    });
  }
  return [...byCurrency.values()];
}
