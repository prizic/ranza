import { describe, expect, it } from "vitest";
import {
  createFinanceModule,
  getAccountBalancesWithin,
  getJournalEntryBySourceWithin,
  listJournalEntriesWithin,
  type FinanceClient,
} from "../../packages/platform/finance/src";

const ORG = "a1000000-0000-4000-8000-000000000001";
const ACC_RECEIVABLE = "a2000000-0000-4000-8000-000000000001";
const ACC_REVENUE = "a2000000-0000-4000-8000-000000000002";
const SOURCE_ID = "a3000000-0000-4000-8000-000000000001";

describe("platform finance: reading the ledger", () => {
  it("calculates account balances with correct normal balance directions", async () => {
    const mockTx: Partial<FinanceClient> = {
      $queryRaw: async () => [
        {
          accountId: ACC_RECEIVABLE,
          accountCode: "1200",
          accountName: "Accounts Receivable",
          accountType: "asset",
          normalBalance: "debit",
          debitMinor: "50000",
          creditMinor: "20000",
        },
        {
          accountId: ACC_REVENUE,
          accountCode: "4000",
          accountName: "Accommodation Revenue",
          accountType: "revenue",
          normalBalance: "credit",
          debitMinor: "0",
          creditMinor: "50000",
        },
      ],
    };

    const balances = await getAccountBalancesWithin(
      mockTx as FinanceClient,
      ORG,
    );

    expect(balances).toHaveLength(2);
    // Asset (normal debit): 50000 - 20000 = 30000
    expect(balances[0].netBalanceMinor).toBe(30000);
    // Revenue (normal credit): 50000 - 0 = 50000
    expect(balances[1].netBalanceMinor).toBe(50000);
  });

  it("reads nothing when the caller's policies admit no entry", async () => {
    const mockTx: Partial<FinanceClient> = { $queryRaw: async () => [] };

    await expect(
      getJournalEntryBySourceWithin(
        mockTx as FinanceClient,
        ORG,
        "folio_line",
        SOURCE_ID,
      ),
    ).resolves.toBeNull();
  });

  it("offers reads and no write", () => {
    const mockDb: Partial<FinanceClient> = {
      $queryRaw: async () => [],
    };
    const mod = createFinanceModule({ db: mockDb as never });

    expect(Object.keys(mod).sort()).toEqual([
      "getAccountBalances",
      "getJournalEntry",
      "getJournalEntryBySource",
      "listAccounts",
      "listCurrencies",
      "listJournalEntries",
    ]);
  });
});

describe("platform finance: paging the journal", () => {
  const row = (entryNumber: number) => ({
    id: `a4000000-0000-4000-8000-${String(entryNumber).padStart(12, "0")}`,
    entryNumber: String(entryNumber),
    entryDate: "2026-10-01",
    postedAt: "2026-10-01T10:00:00Z",
    currency: "TRY ",
    description: `Entry ${entryNumber}`,
    sourceType: "folio_line",
    sourceId: SOURCE_ID,
    totalMinor: "1000",
  });

  /** A client that answers with `rows` and remembers what it was asked. */
  function asking(rows: unknown[]) {
    const asked: unknown[][] = [];
    const tx: Partial<FinanceClient> = {
      $queryRaw: (async (_sql: TemplateStringsArray, ...values: unknown[]) => {
        asked.push(values);
        return rows;
      }) as never,
    };
    return { tx: tx as FinanceClient, asked };
  }

  it("says there is an older page only when one more row came back than was asked for", async () => {
    const more = asking([row(30), row(29), row(28)]);
    const page = await listJournalEntriesWithin(more.tx, ORG, {}, { limit: 2 });
    expect(page.entries.map((entry) => entry.entryNumber)).toEqual([30, 29]);
    expect(page.nextCursor).toBe("29");

    const last = asking([row(2), row(1)]);
    const final = await listJournalEntriesWithin(
      last.tx,
      ORG,
      {},
      { limit: 2 },
    );
    expect(final.entries).toHaveLength(2);
    expect(final.nextCursor).toBeNull();

    const none = asking([]);
    const empty = await listJournalEntriesWithin(none.tx, ORG, {});
    expect(empty).toEqual({ entries: [], nextCursor: null });
  });

  it("trims the currency, reads money as a number and keeps the dates as dates", async () => {
    const { tx } = asking([row(5)]);
    const [entry] = (await listJournalEntriesWithin(tx, ORG, {})).entries;
    expect(entry?.currency).toBe("TRY");
    expect(entry?.totalMinor).toBe(1000);
    expect(entry?.entryDate).toBeInstanceOf(Date);
  });

  it("cannot be asked for the whole ledger in one read", async () => {
    const big = asking([]);
    await listJournalEntriesWithin(big.tx, ORG, {}, { limit: 100000 });
    expect(big.asked[0]?.at(-1)).toBe(201);

    const small = asking([]);
    await listJournalEntriesWithin(small.tx, ORG, {}, { limit: 0 });
    expect(small.asked[0]?.at(-1)).toBe(2);
  });

  it("treats a day or a position that is not one as no filter", async () => {
    const { tx, asked } = asking([]);
    await listJournalEntriesWithin(
      tx,
      ORG,
      { from: "yesterday", to: "2026-13-45x" },
      { cursor: "1; drop table" },
    );
    const values = asked[0] ?? [];
    expect(values).not.toContain("yesterday");
    expect(values).not.toContain("1; drop table");
    expect(values.filter((value) => value === null).length).toBeGreaterThan(2);
  });
});
