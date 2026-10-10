import { HrInputError, type HrField } from "./errors";

/** What a person typed, trimmed; refused when nothing is left. */
export function requiredText(value: string, field: HrField): string {
  const trimmed = value.trim();
  if (trimmed === "") throw new HrInputError(field);
  return trimmed;
}

/** Null for blank, because a missing phone number is not an empty one. */
export function optionalText(value?: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export function optionalEmail(value?: string | null): string | null {
  const email = optionalText(value);
  if (email !== null && !/^[^@\s]+@[^@\s]+$/.test(email)) {
    throw new HrInputError("email");
  }
  return email;
}

/** An amount in whole minor units; never a fraction (ADR 0015). */
export function wholeMinorUnits(value: number, field: HrField): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new HrInputError(field);
  }
  return value;
}

const currencies = new Set(Intl.supportedValuesOf("currency"));

/**
 * An ISO 4217 code. The runtime's own list decides which codes are real, the
 * same source that decides how many minor units each has at display.
 */
export function validCurrency(value: string): string {
  if (!/^[A-Z]{3}$/.test(value) || !currencies.has(value)) {
    throw new HrInputError("currency");
  }
  return value;
}

/** A payroll period, `YYYY-MM`, and the last day of it. */
export function validPeriod(value: string): {
  period: string;
  lastDay: Date;
} {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match) throw new HrInputError("period");
  const year = Number(match[1]);
  const month = Number(match[2]);
  return {
    period: value,
    lastDay: new Date(Date.UTC(year, month, 0)),
  };
}

/** A calendar day as the database stores it: midnight UTC. */
export function calendarDay(value: Date, field: HrField): Date {
  if (Number.isNaN(value.getTime())) throw new HrInputError(field);
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

/** A calendar day as `YYYY-MM-DD`: how the database is told one, and a comparison. */
export function isoDay(day: Date): string {
  return day.toISOString().slice(0, 10);
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validTime(value: string): string {
  if (!TIME.test(value)) throw new HrInputError("shiftTime");
  return value;
}

/** A safe JavaScript number from a column that is a bigint. */
export function minorUnits(value: bigint): number {
  const converted = Number(value);
  if (!Number.isSafeInteger(converted)) {
    throw new RangeError("an amount is too large to handle exactly");
  }
  return converted;
}
