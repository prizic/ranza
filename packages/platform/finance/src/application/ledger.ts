import type { Account, AccountBalance, JournalEntry } from "../domain/entry";
import {
  findJournalEntryById,
  findJournalEntryBySource,
  getAccountBalances,
  listAccounts,
} from "../infrastructure/repository";
import type { FinanceClient, FinanceDeps } from "../ports";

/**
 * Reads of the general ledger (blueprint 5.10).
 *
 * Reading is bounded by the caller's own row-level security: a member who does
 * not hold `finance.view_ledger`, or whose Subscription has lapsed, gets empty
 * results rather than an error. Writing the ledger is not part of this contract
 * (ADR 0042).
 */
export interface FinanceModule {
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
  const db = deps.db as unknown as FinanceClient;
  return {
    getJournalEntryBySource: (organizationId, sourceType, sourceId) =>
      getJournalEntryBySourceWithin(db, organizationId, sourceType, sourceId),
    getJournalEntry: (organizationId, entryId) =>
      getJournalEntryWithin(db, organizationId, entryId),
    listAccounts: (organizationId) => listAccountsWithin(db, organizationId),
    getAccountBalances: (organizationId, currency) =>
      getAccountBalancesWithin(db, organizationId, currency),
  };
}
