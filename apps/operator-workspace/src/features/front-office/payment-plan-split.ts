/**
 * A term's fees as a monthly schedule (PP-S2-01, PP-S2-07).
 *
 * The first suggestion for a payment plan, which the desk then edits row by
 * row: integer arithmetic only, so the instalments always add up to the total
 * to the minor unit. Pure and in the app because the booking dialog is a client
 * component and may not import a module's values (ADR 0007).
 */

/**
 * `INSTALMENTS.max` in `@ranza/payment-plans`, restated for the reason the
 * booking dialog restates `GUEST_DETAILS`; `tests/unit/payment-plan-split.test.ts`
 * fails if they disagree.
 */
export const MAX_INSTALMENTS = 60;

export interface PlannedInstalment {
  amountMinor: number;
  dueOn: string;
}

const DAY_MS = 86_400_000;

function utc(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

function dayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * `day` plus `months` calendar months, on the same day of the month or the last
 * one when the month is shorter: 31 January plus one month is 28 February, and
 * the next is 31 March again because each is counted from the start, not from
 * the one before.
 */
export function addMonths(day: string, months: number): string {
  const start = utc(day);
  const first = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1),
  );
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(start.getUTCDate(), lastDay));
  return dayOf(first);
}

/** The day after `day`. */
export function nextDay(day: string): string {
  return dayOf(new Date(utc(day).getTime() + DAY_MS));
}

/**
 * The fees split into one instalment a month from `from`, each due on the
 * same day of its month and all before `to`, the departure: an instalment due
 * the day the Resident leaves is charged for a term that is over. Whatever does
 * not divide evenly goes on the first, which is the one that falls due soonest.
 *
 * No schedule for a total that is not a positive amount, which is what a bed
 * the price list does not price gives: nothing is invented from a price that is
 * not there. A term shorter than a month is one instalment, due on arrival.
 */
export function splitTerm(
  totalMinor: number | null,
  from: string,
  to: string,
): PlannedInstalment[] {
  if (
    totalMinor === null ||
    !Number.isSafeInteger(totalMinor) ||
    totalMinor <= 0
  ) {
    return [];
  }
  const dueDays: string[] = [from];
  while (dueDays.length < MAX_INSTALMENTS) {
    const next = addMonths(from, dueDays.length);
    if (next >= to) break;
    dueDays.push(next);
  }
  const share = Math.floor(totalMinor / dueDays.length);
  const remainder = totalMinor - share * dueDays.length;
  return dueDays.map((dueOn, index) => ({
    amountMinor: index === 0 ? share + remainder : share,
    dueOn,
  }));
}

/** Nights between two `YYYY-MM-DD` days, counted in UTC so no clock shifts them. */
export function nightsBetween(from: string, to: string): number {
  return Math.round((utc(to).getTime() - utc(from).getTime()) / DAY_MS);
}
