import { describe, expect, it } from "vitest";
import {
  createFinanceModule,
  getAccountBalancesWithin,
  getJournalEntryBySourceWithin,
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
    ]);
  });
});
