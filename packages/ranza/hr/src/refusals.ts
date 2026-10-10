import { HrRefusedError } from "./errors";

/**
 * What the database says when it refuses an HR write, turned into this
 * module's errors. Every command reads from here, so a refusal means the same
 * thing wherever it is raised.
 */

/** A policy said no, or a column grant did. */
const INSUFFICIENT_PRIVILEGE = "42501";
/** A check constraint, or a trigger speaking for one. */
const CHECK_VIOLATION = "23514";
const FOREIGN_KEY_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";
/** A trigger refused a state: an approved run, a terminated employee. */
const NOT_PERMITTED_BY_STATE = "55000";
/** The exclusion constraint on approved leave (HR-S1-10). */
const EXCLUSION_VIOLATION = "23P01";
/** Prisma's own "the row it was asked to change is not there". */
const RECORD_NOT_FOUND = "P2025";

/**
 * Whether a failure carries a particular code. Read from the code rather than
 * from a constraint name, and from the message as well as Prisma's `meta`:
 * Prisma wraps a driver error and the SQLSTATE sits in different places for a
 * model call and a raw statement.
 */
export function raised(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const {
    meta,
    message,
    code: ownCode,
  } = error as {
    meta?: { driverAdapterError?: { cause?: { code?: unknown } } };
    message?: unknown;
    code?: unknown;
  };
  return (
    ownCode === code ||
    meta?.driverAdapterError?.cause?.code === code ||
    (typeof message === "string" && message.includes(code))
  );
}

function says(error: unknown, words: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { message?: unknown }).message === "string" &&
    (error as { message: string }).message.includes(words)
  );
}

/**
 * Turns what an HR write can raise into this module's errors, and returns
 * anything it does not recognise as it was, for the host to report.
 */
export function refusal(error: unknown): Error {
  if (error instanceof HrRefusedError) return error;
  if (raised(error, EXCLUSION_VIOLATION)) {
    return new HrRefusedError("leave_overlap", { cause: error });
  }
  if (raised(error, CHECK_VIOLATION) && says(error, "one currency")) {
    return new HrRefusedError("payroll_mixed_currency", { cause: error });
  }
  if (
    raised(error, NOT_PERMITTED_BY_STATE) &&
    says(error, "stays terminated")
  ) {
    return new HrRefusedError("already_terminated", { cause: error });
  }
  if (
    raised(error, INSUFFICIENT_PRIVILEGE) ||
    raised(error, FOREIGN_KEY_VIOLATION) ||
    raised(error, UNIQUE_VIOLATION) ||
    raised(error, NOT_PERMITTED_BY_STATE) ||
    raised(error, RECORD_NOT_FOUND)
  ) {
    return new HrRefusedError("not_permitted", { cause: error });
  }
  return error instanceof Error ? error : new Error(String(error));
}
