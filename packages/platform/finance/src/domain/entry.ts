/**
 * Double-entry journal entry and account definitions (blueprint 5.10).
 *
 * Framework-independent domain layer. What a reader of the ledger sees: the
 * database guarantees every entry balances (sum(debits) = sum(credits)), and
 * money is integer minor units, positive on a line with the direction beside it.
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
  currency?: string | undefined;
}

/** One entry as a list shows it: what it is for and how much, not its lines. */
export interface JournalEntrySummary {
  id: string;
  entryNumber: number;
  entryDate: Date;
  postedAt: Date;
  currency: string;
  description: string;
  sourceType: string;
  sourceId: string;
  /** What was moved: the debits, which equal the credits. */
  totalMinor: number;
}

/** A day, `YYYY-MM-DD`, in the ledger's own calendar (an entry's `entryDate`). */
export interface DateRange {
  from?: string | undefined;
  to?: string | undefined;
}

export interface JournalFilter extends DateRange {
  /** Only entries with a line on this account. */
  accountId?: string | undefined;
  sourceType?: string | undefined;
  currency?: string | undefined;
}

export interface JournalPage {
  /** Newest first. */
  entries: readonly JournalEntrySummary[];
  /** Hand back as `cursor` for the next, older page; null on the last. */
  nextCursor: string | null;
}
