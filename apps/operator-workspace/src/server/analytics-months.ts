/**
 * Calendar arithmetic for the analytics month report, on business dates.
 *
 * Every function here takes and returns plain `YYYY-MM-DD` / `YYYY-MM`
 * strings. A business date is a calendar date and not an instant (ADR 0021),
 * so none of this touches a time zone: the Property's own `today` is read from
 * the database and handed in. UTC `Date` is used only as a calendar.
 */

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** `2026-09` when the input is a real month, otherwise null. */
export function parseMonth(value?: string | null): string | null {
  if (!value) return null;
  const match = MONTH.exec(value);
  if (!match) return null;
  return Number(match[1]) >= 1900 ? value : null;
}

const BUSINESS_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whether the value is a real calendar date written `YYYY-MM-DD`. */
export function isBusinessDate(value: string): boolean {
  const match = BUSINESS_DATE.exec(value);
  if (!match || Number(match[1]) < 1900) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function parts(month: string): { year: number; month: number } {
  return {
    year: Number(month.slice(0, 4)),
    month: Number(month.slice(5, 7)),
  };
}

function format(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/** The month a business date falls in. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function monthStart(month: string): string {
  return `${month}-01`;
}

export function daysInMonth(month: string): number {
  const { year, month: m } = parts(month);
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

export function monthEnd(month: string): string {
  return `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number): string {
  const { year, month: m } = parts(month);
  const index = year * 12 + (m - 1) + delta;
  return format(Math.floor(index / 12), (index % 12) + 1);
}

export function addDays(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/** Every date from `start` to `end`, inclusive. */
export function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) dates.push(day);
  return dates;
}

/**
 * The month to show. A malformed month, and any month after the current one,
 * is the current month and never an error page (AN-S2-02).
 */
export function resolveMonth(requested: string | null, today: string): string {
  const current = monthOf(today);
  if (requested === null || requested > current) return current;
  return requested;
}

/**
 * The change from a prior figure to a current one, as a percentage of the
 * prior. Null — a dash on screen — when either figure is missing or the prior
 * is zero: a change from nothing is not infinity and not a made-up percentage
 * (AN-S2-07).
 */
export function percentChange(
  current: number | null,
  prior: number | null,
): number | null {
  if (current === null || prior === null || prior === 0) return null;
  return Math.round(((current - prior) / Math.abs(prior)) * 1000) / 10;
}

/** The change in occupancy, in percentage points; null when either is unknown. */
export function pointChange(
  current: number | null,
  prior: number | null,
): number | null {
  if (current === null || prior === null) return null;
  return Math.round((current - prior) * 10) / 10;
}
