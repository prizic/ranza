import {
  Account,
  AccountBalance,
  assertPostableEntry,
  JournalEntry,
  JournalEntryInput,
} from "../domain/entry";
import {
  ensureDefaultAccounts,
  findJournalEntryById,
  findJournalEntryBySource,
  getAccountBalances,
  insertJournalEntry,
  listAccounts,
} from "../infrastructure/repository";
import type { FinanceClient, FinanceDeps } from "../ports";

export interface FinanceModule {
  postJournalEntry(entry: JournalEntryInput): Promise<JournalEntry>;
  getJournalEntryBySource(
    organizationId: string,
    sourceType: string,
    sourceId: string,
  ): Promise<JournalEntry | null>;
  getJournalEntry(
    organizationId: string,
    entryId: string,
  ): Promise<JournalEntry | null>;
  listAccounts(organizationId: string): Promise<Account[]>;
  getAccountBalances(
    organizationId: string,
    currency?: string,
  ): Promise<AccountBalance[]>;
}

/**
 * Posts a balanced journal entry inside an existing transaction.
 *
 * Validates domain invariants (balanced debits and credits) before persistence.
 */
export async function postJournalEntryWithin(
  tx: FinanceClient,
  entry: JournalEntryInput,
): Promise<JournalEntry> {
  assertPostableEntry(entry);
  return insertJournalEntry(tx, entry);
}

/**
 * Finds a journal entry by its source reference inside an existing transaction.
 */
export async function getJournalEntryBySourceWithin(
  tx: FinanceClient,
  organizationId: string,
  sourceType: string,
  sourceId: string,
): Promise<JournalEntry | null> {
  return findJournalEntryBySource(tx, organizationId, sourceType, sourceId);
}

/**
 * Finds a journal entry by id inside an existing transaction.
 */
export async function getJournalEntryWithin(
  tx: FinanceClient,
  organizationId: string,
  entryId: string,
): Promise<JournalEntry | null> {
  return findJournalEntryById(tx, organizationId, entryId);
}

/**
 * Lists chart of accounts for an organization.
 */
export async function listAccountsWithin(
  tx: FinanceClient,
  organizationId: string,
): Promise<Account[]> {
  return listAccounts(tx, organizationId);
}

/**
 * Ensures standard chart of accounts exists for an organization.
 */
export async function ensureDefaultAccountsWithin(
  tx: FinanceClient,
  organizationId: string,
): Promise<Account[]> {
  return ensureDefaultAccounts(tx, organizationId);
}

/**
 * Calculates current net balances across chart of accounts.
 */
export async function getAccountBalancesWithin(
  tx: FinanceClient,
  organizationId: string,
  currency?: string,
): Promise<AccountBalance[]> {
  return getAccountBalances(tx, organizationId, currency);
}

export function createFinanceModule(deps: FinanceDeps): FinanceModule {
  return {
    async postJournalEntry(entry: JournalEntryInput): Promise<JournalEntry> {
      return postJournalEntryWithin(deps.db as unknown as FinanceClient, entry);
    },
    async getJournalEntryBySource(
      organizationId: string,
      sourceType: string,
      sourceId: string,
    ): Promise<JournalEntry | null> {
      return getJournalEntryBySourceWithin(
        deps.db as unknown as FinanceClient,
        organizationId,
        sourceType,
        sourceId,
      );
    },
    async getJournalEntry(
      organizationId: string,
      entryId: string,
    ): Promise<JournalEntry | null> {
      return getJournalEntryWithin(
        deps.db as unknown as FinanceClient,
        organizationId,
        entryId,
      );
    },
    async listAccounts(organizationId: string): Promise<Account[]> {
      return listAccountsWithin(
        deps.db as unknown as FinanceClient,
        organizationId,
      );
    },
    async getAccountBalances(
      organizationId: string,
      currency?: string,
    ): Promise<AccountBalance[]> {
      return getAccountBalancesWithin(
        deps.db as unknown as FinanceClient,
        organizationId,
        currency,
      );
    },
  };
}
