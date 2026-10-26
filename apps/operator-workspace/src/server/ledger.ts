import { withOrganizationContext } from "@ranza/db";
import {
  getAccountBalancesWithin,
  getJournalEntryWithin,
  listAccountsWithin,
  listCurrenciesWithin,
  listJournalEntriesWithin,
  type Account,
  type AccountBalance,
  type FinanceClient,
  type JournalEntry,
  type JournalEntrySummary,
} from "@ranza/platform-finance";
import { getComposition } from "./composition";
import { currentViewer } from "./viewer";

/**
 * The ledger, read for its screen (ACC-S3-*).
 *
 * Same funnel as every other read (ADR 0007): the permission, the Organization's
 * whole reach and the Folio finance capability are asked by the read policies
 * inside the same transaction as the read, so a viewer who may not read the
 * books gets empty answers here, never rows narrowed by a second check in this
 * file. The page decides what to say about an empty answer by asking the gate
 * (`whyDenied`) first.
 *
 * Reads only. The ledger is written by the worker alone (ADR 0042).
 */

/** Entries a page of the journal holds. */
export const JOURNAL_PAGE_SIZE = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface JournalQuery {
  from?: string | undefined;
  to?: string | undefined;
  accountId?: string | undefined;
  sourceType?: string | undefined;
  currency?: string | undefined;
  cursor?: string | undefined;
}

/** Where the Folio behind an entry can be opened, when the viewer may read it. */
export interface FolioReference {
  folioId: string;
  propertyId: string;
}

export interface JournalRow extends JournalEntrySummary {
  /** Null when the entry is not from a Folio line or the viewer cannot read that Folio. */
  folio: FolioReference | null;
}

export interface JournalView {
  entries: readonly JournalRow[];
  nextCursor: string | null;
  /** What the filters offer. */
  accounts: readonly Account[];
  currencies: readonly string[];
  sourceTypes: readonly string[];
}

export interface EntryView {
  entry: JournalEntry;
  folio: FolioReference | null;
}

export interface AccountsView {
  balances: readonly AccountBalance[];
  currencies: readonly string[];
}

/**
 * The Folios behind these sources that the viewer can open: the line is one
 * their policies let them read, and its Property is one where the Folio screen
 * is open to them. Reading the line is not enough: that policy asks reach alone,
 * so somebody who may read the books and not the Folios would be offered a link
 * to a refusal.
 */
async function foliosOf(
  tx: FinanceClient,
  sources: readonly { sourceType: string; sourceId: string }[],
  foliosOpenAt: ReadonlySet<string>,
): Promise<Map<string, FolioReference>> {
  const lineIds = sources
    .filter(
      (source) =>
        source.sourceType === "folio_line" && UUID.test(source.sourceId),
    )
    .map((source) => source.sourceId);
  if (lineIds.length === 0) return new Map();
  const rows = await tx.$queryRaw<
    { lineId: string; folioId: string; propertyId: string }[]
  >`
    select line.id          as "lineId",
           line.folio_id    as "folioId",
           line.property_id as "propertyId"
      from public.folio_lines as line
     where line.id = any(${lineIds}::uuid[])
  `;
  return new Map(
    rows
      .filter((row) => foliosOpenAt.has(row.propertyId))
      .map((row) => [
        row.lineId,
        { folioId: row.folioId, propertyId: row.propertyId },
      ]),
  );
}

/**
 * The kinds of entry the ledger holds, so the filter offers what exists and
 * not a list that goes stale when a second source starts posting (ACC-DEF-04).
 */
async function sourceTypesOf(
  tx: FinanceClient,
  organizationId: string,
): Promise<string[]> {
  const rows = await tx.$queryRaw<{ sourceType: string }[]>`
    select distinct source_type as "sourceType"
      from finance.journal_entries
     where organization_id = ${organizationId}::uuid
     order by 1
  `;
  return rows.map((row) => row.sourceType);
}

/** One page of the journal and what its filters offer. Empty when the viewer may not read the books. */
export async function journalView(
  organizationId: string,
  query: JournalQuery,
  foliosOpenAt: ReadonlySet<string>,
): Promise<JournalView> {
  const viewer = await currentViewer();
  if (!viewer) {
    return {
      entries: [],
      nextCursor: null,
      accounts: [],
      currencies: [],
      sourceTypes: [],
    };
  }
  return withOrganizationContext(
    getComposition().db,
    { userId: viewer.userId },
    async (client) => {
      const tx = client as unknown as FinanceClient;
      const { cursor, ...filter } = query;
      const [page, accounts, currencies, sourceTypes] = await Promise.all([
        listJournalEntriesWithin(tx, organizationId, filter, {
          limit: JOURNAL_PAGE_SIZE,
          cursor,
        }),
        listAccountsWithin(tx, organizationId),
        listCurrenciesWithin(tx, organizationId),
        sourceTypesOf(tx, organizationId),
      ]);
      const folios = await foliosOf(tx, page.entries, foliosOpenAt);
      return {
        entries: page.entries.map((entry) => ({
          ...entry,
          folio:
            entry.sourceType === "folio_line"
              ? (folios.get(entry.sourceId) ?? null)
              : null,
        })),
        nextCursor: page.nextCursor,
        accounts,
        currencies,
        sourceTypes,
      };
    },
  );
}

/** One entry with its lines. Null for one that does not exist and one the viewer may not read, alike. */
export async function entryView(
  organizationId: string,
  entryId: string,
  foliosOpenAt: ReadonlySet<string>,
): Promise<EntryView | null> {
  const viewer = await currentViewer();
  if (!viewer || !UUID.test(entryId)) return null;
  return withOrganizationContext(
    getComposition().db,
    { userId: viewer.userId },
    async (client) => {
      const tx = client as unknown as FinanceClient;
      const entry = await getJournalEntryWithin(tx, organizationId, entryId);
      if (!entry) return null;
      const folios = await foliosOf(tx, [entry], foliosOpenAt);
      return { entry, folio: folios.get(entry.sourceId) ?? null };
    },
  );
}

/** The chart with its balances for one currency and span; the currencies the ledger holds. */
export async function accountsView(
  organizationId: string,
  query: {
    currency?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
  },
): Promise<AccountsView> {
  const viewer = await currentViewer();
  if (!viewer) return { balances: [], currencies: [] };
  return withOrganizationContext(
    getComposition().db,
    { userId: viewer.userId },
    async (client) => {
      const tx = client as unknown as FinanceClient;
      const currencies = await listCurrenciesWithin(tx, organizationId);
      // One currency at a time: balances in different currencies are never
      // added (ACC-S3-05), so the first the ledger holds is the one shown
      // until another is chosen.
      const currency =
        query.currency && currencies.includes(query.currency)
          ? query.currency
          : currencies[0];
      const balances = await getAccountBalancesWithin(
        tx,
        organizationId,
        currency,
        { from: query.from, to: query.to },
      );
      return { balances, currencies };
    },
  );
}
