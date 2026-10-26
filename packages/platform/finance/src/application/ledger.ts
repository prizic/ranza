import type {
  Account,
  AccountBalance,
  DateRange,
  JournalEntry,
  JournalFilter,
  JournalPage,
} from "../domain/entry";
import {
  findJournalEntryById,
  findJournalEntryBySource,
  getAccountBalances,
  listAccounts,
  listCurrencies,
  listJournalEntries,
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
    range?: DateRange,
  ): Promise<AccountBalance[]>;
  listJournalEntries(
    organizationId: string,
    filter: JournalFilter,
    page?: PageRequest,
  ): Promise<JournalPage>;
  listCurrencies(organizationId: string): Promise<string[]>;
}

/** Which page of the journal to read: how many, and where the last one stopped. */
export interface PageRequest {
  limit?: number;
  cursor?: string | undefined;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

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
 * Net balances across the chart of accounts, for one currency and a span of
 * entry dates when asked; every entry ever posted when not.
 */
export async function getAccountBalancesWithin(
  tx: FinanceClient,
  organizationId: string,
  currency?: string,
  range?: DateRange,
): Promise<AccountBalance[]> {
  return getAccountBalances(tx, organizationId, currency, range);
}

/**
 * One page of the journal, newest first. A limit outside 1 to 200 is brought
 * into it: a caller cannot ask for the whole ledger in one read.
 */
export async function listJournalEntriesWithin(
  tx: FinanceClient,
  organizationId: string,
  filter: JournalFilter,
  page: PageRequest = {},
): Promise<JournalPage> {
  const limit = Math.min(
    Math.max(Math.trunc(page.limit ?? DEFAULT_PAGE_SIZE), 1),
    MAX_PAGE_SIZE,
  );
  return listJournalEntries(tx, organizationId, filter, {
    limit,
    cursor: page.cursor,
  });
}

/** The currencies the ledger holds entries in. */
export async function listCurrenciesWithin(
  tx: FinanceClient,
  organizationId: string,
): Promise<string[]> {
  return listCurrencies(tx, organizationId);
}

export function createFinanceModule(deps: FinanceDeps): FinanceModule {
  const db = deps.db as unknown as FinanceClient;
  return {
    getJournalEntryBySource: (organizationId, sourceType, sourceId) =>
      getJournalEntryBySourceWithin(db, organizationId, sourceType, sourceId),
    getJournalEntry: (organizationId, entryId) =>
      getJournalEntryWithin(db, organizationId, entryId),
    listAccounts: (organizationId) => listAccountsWithin(db, organizationId),
    getAccountBalances: (organizationId, currency, range) =>
      getAccountBalancesWithin(db, organizationId, currency, range),
    listJournalEntries: (organizationId, filter, page) =>
      listJournalEntriesWithin(db, organizationId, filter, page),
    listCurrencies: (organizationId) =>
      listCurrenciesWithin(db, organizationId),
  };
}
