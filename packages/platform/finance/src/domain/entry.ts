import { InvalidEntryError, UnbalancedEntryError } from "./errors";

/**
 * Double-entry journal entry and account definitions (blueprint 5.10).
 *
 * Framework-independent domain layer:
 * Every journal entry must balance: sum(debits) === sum(credits).
 * Money is tracked as signed or unsigned integer minor units.
 */

export type AccountType =
  "asset" | "liability" | "equity" | "revenue" | "expense";

export type BalanceDirection = "debit" | "credit";

export interface Account {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  type: AccountType;
  normalBalance: BalanceDirection;
  isActive: boolean;
  createdAt: Date;
}

export interface JournalLineInput {
  accountId: string;
  direction: BalanceDirection;
  amountMinor: number;
  description?: string | null;
}

export interface JournalEntryInput {
  organizationId: string;
  entryDate?: Date | string;
  currency: string;
  description: string;
  sourceType: string;
  sourceId: string;
  createdBy?: string | null;
  lines: readonly JournalLineInput[];
}

export interface JournalLine {
  id: string;
  journalEntryId: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  direction: BalanceDirection;
  amountMinor: number;
  description: string | null;
  lineNumber: number;
}

export interface JournalEntry {
  id: string;
  organizationId: string;
  entryNumber: number;
  entryDate: Date;
  postedAt: Date;
  currency: string;
  description: string;
  sourceType: string;
  sourceId: string;
  createdBy: string | null;
  lines: readonly JournalLine[];
}

export interface AccountBalance {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  normalBalance: BalanceDirection;
  debitMinor: number;
  creditMinor: number;
  netBalanceMinor: number;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY = /^[A-Z]{3}$/;
const SOURCE_TYPE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

/**
 * Validates that a journal entry input satisfies all structural and financial invariants
 * before reaching persistence.
 */
export function assertPostableEntry(input: JournalEntryInput): void {
  if (!UUID.test(input.organizationId)) {
    throw new InvalidEntryError("organizationId must be a valid uuid");
  }
  if (!CURRENCY.test(input.currency)) {
    throw new InvalidEntryError(
      `currency must be a 3-letter ISO code, received "${input.currency}"`,
    );
  }
  if (!SOURCE_TYPE.test(input.sourceType)) {
    throw new InvalidEntryError(
      `sourceType must be a dotted lower-case identifier, received "${input.sourceType}"`,
    );
  }
  if (!UUID.test(input.sourceId)) {
    throw new InvalidEntryError("sourceId must be a valid uuid");
  }
  if (!input.description || input.description.trim().length === 0) {
    throw new InvalidEntryError("description must not be empty");
  }
  if (input.description.trim().length > 500) {
    throw new InvalidEntryError("description must not exceed 500 characters");
  }
  if (!Array.isArray(input.lines) || input.lines.length < 2) {
    throw new InvalidEntryError(
      "a journal entry must contain at least two lines",
    );
  }

  let totalDebits = 0;
  let totalCredits = 0;

  for (const [index, line] of input.lines.entries()) {
    if (!UUID.test(line.accountId)) {
      throw new InvalidEntryError(
        `line ${index + 1}: accountId must be a valid uuid`,
      );
    }
    if (line.direction !== "debit" && line.direction !== "credit") {
      throw new InvalidEntryError(
        `line ${index + 1}: direction must be "debit" or "credit"`,
      );
    }
    if (!Number.isInteger(line.amountMinor) || line.amountMinor <= 0) {
      throw new InvalidEntryError(
        `line ${index + 1}: amountMinor must be a positive integer, received ${line.amountMinor}`,
      );
    }

    if (line.direction === "debit") {
      totalDebits += line.amountMinor;
    } else {
      totalCredits += line.amountMinor;
    }
  }

  if (totalDebits !== totalCredits) {
    throw new UnbalancedEntryError(
      `journal entry is not balanced: total debits (${totalDebits}) !== total credits (${totalCredits})`,
    );
  }
}
