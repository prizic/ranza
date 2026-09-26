import {
  AssigneeOutOfReachError,
  AssigneeRequiredError,
  MaintenanceRefusedError,
} from "./contracts";

/**
 * What the database says when it refuses a maintenance write, turned into this
 * module's errors. Every command file reads from here, so a refusal means the
 * same thing wherever it is raised.
 */

/** A policy said no, or a column grant did. */
export const INSUFFICIENT_PRIVILEGE = "42501";

/** A check constraint, or a trigger speaking for one. */
export const CHECK_VIOLATION = "23514";

/** A foreign key: the Unit is at another Property, or does not exist. */
export const FOREIGN_KEY_VIOLATION = "23503";

/** A trigger refused a state (a done request cancelled, a closed hold). */
export const NOT_PERMITTED_BY_STATE = "55000";

/**
 * A unique index: a second open work order for one item (MT-S4-03), or a
 * Folio line linked twice. Both are something the screen already showed as
 * done — a double press, or two people at once.
 */
export const UNIQUE_VIOLATION = "23505";

/**
 * Whether a failure carries a particular SQLSTATE. Read from the code rather
 * than from a constraint name, and from the message as well as Prisma's
 * `meta`, for the reasons `@ranza/accommodation` gives beside its own copy.
 */
export function raised(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { meta, message } = error as {
    meta?: { driverAdapterError?: { cause?: { code?: unknown } } };
    message?: unknown;
  };
  return (
    meta?.driverAdapterError?.cause?.code === code ||
    (typeof message === "string" && message.includes(code))
  );
}

/** Whether a failure's message says something a trigger is known to say. */
export function says(error: unknown, words: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { message?: unknown }).message === "string" &&
    (error as { message: string }).message.includes(words)
  );
}

/**
 * Turns what a write to a request can raise into this module's errors, and
 * rethrows anything it does not recognise.
 */
export function refusal(error: unknown): Error {
  if (raised(error, CHECK_VIOLATION)) {
    if (says(error, "assignee does not reach")) {
      return new AssigneeOutOfReachError();
    }
    if (says(error, "starts with somebody assigned")) {
      return new AssigneeRequiredError();
    }
    // The Stay moved rooms after the form listed it, or the form was forged.
    if (says(error, "a damage charge")) {
      return new MaintenanceRefusedError({ cause: error });
    }
  }
  if (
    raised(error, INSUFFICIENT_PRIVILEGE) ||
    raised(error, FOREIGN_KEY_VIOLATION) ||
    raised(error, UNIQUE_VIOLATION) ||
    raised(error, NOT_PERMITTED_BY_STATE)
  ) {
    return new MaintenanceRefusedError({ cause: error });
  }
  return error instanceof Error ? error : new Error(String(error));
}
