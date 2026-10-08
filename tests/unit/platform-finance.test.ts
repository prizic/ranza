import { describe, expect, it } from "vitest";
import {
  assertPostableEntry,
  createFinanceModule,
  ensureDefaultAccountsWithin,
  getAccountBalancesWithin,
  InvalidEntryError,
  postJournalEntryWithin,
  UnbalancedEntryError,
  type FinanceClient,
  type JournalEntryInput,
} from "../../packages/platform/finance/src";

const ORG = "a1000000-0000-4000-8000-000000000001";
const ACC_RECEIVABLE = "a2000000-0000-4000-8000-000000000001";
const ACC_REVENUE = "a2000000-0000-4000-8000-000000000002";
const SOURCE_ID = "a3000000-0000-4000-8000-000000000001";

describe("platform finance: domain validation", () => {
  it("rejects an entry where debits do not equal credits", () => {
    const entry: JournalEntryInput = {
      organizationId: ORG,
      currency: "TRY",
      description: "Unbalanced charge",
      sourceType: "folio_line",
      sourceId: SOURCE_ID,
      lines: [
        {
          accountId: ACC_RECEIVABLE,
          direction: "debit",
          amountMinor: 1000,
        },
        {
          accountId: ACC_REVENUE,
          direction: "credit",
          amountMinor: 800,
        },
      ],
    };

    expect(() => assertPostableEntry(entry)).toThrow(UnbalancedEntryError);
  });

  it("rejects an entry with fewer than two lines", () => {
    const entry: JournalEntryInput = {
      organizationId: ORG,
      currency: "TRY",
      description: "One line only",
      sourceType: "folio_line",
      sourceId: SOURCE_ID,
      lines: [
        {
          accountId: ACC_RECEIVABLE,
          direction: "debit",
          amountMinor: 1000,
        },
      ],
    };

    expect(() => assertPostableEntry(entry)).toThrow(InvalidEntryError);
  });

  it("rejects non-positive or float amounts", () => {
    const entryZero: JournalEntryInput = {
      organizationId: ORG,
      currency: "TRY",
      description: "Zero amount",
      sourceType: "folio_line",
      sourceId: SOURCE_ID,
      lines: [
        { accountId: ACC_RECEIVABLE, direction: "debit", amountMinor: 0 },
        { accountId: ACC_REVENUE, direction: "credit", amountMinor: 0 },
      ],
    };
    expect(() => assertPostableEntry(entryZero)).toThrow(InvalidEntryError);

    const entryFloat: JournalEntryInput = {
      organizationId: ORG,
      currency: "TRY",
      description: "Float amount",
      sourceType: "folio_line",
      sourceId: SOURCE_ID,
      lines: [
        { accountId: ACC_RECEIVABLE, direction: "debit", amountMinor: 10.5 },
        { accountId: ACC_REVENUE, direction: "credit", amountMinor: 10.5 },
      ],
    };
    expect(() => assertPostableEntry(entryFloat)).toThrow(InvalidEntryError);
  });

  it("rejects invalid ISO currencies", () => {
    const entryBadCurrency: JournalEntryInput = {
      organizationId: ORG,
      currency: "usd", // lowercase not allowed
      description: "Room charge",
      sourceType: "folio_line",
      sourceId: SOURCE_ID,
      lines: [
        { accountId: ACC_RECEIVABLE, direction: "debit", amountMinor: 100 },
        { accountId: ACC_REVENUE, direction: "credit", amountMinor: 100 },
      ],
    };
    expect(() => assertPostableEntry(entryBadCurrency)).toThrow(
      InvalidEntryError,
    );
  });

  it("rejects unsafe integers exceeding MAX_SAFE_INTEGER", () => {
    const entryUnsafe: JournalEntryInput = {
      organizationId: ORG,
      currency: "TRY",
      description: "Huge amount",
      sourceType: "folio_line",
      sourceId: SOURCE_ID,
      lines: [
        {
          accountId: ACC_RECEIVABLE,
          direction: "debit",
          amountMinor: 2 ** 53,
        },
        {
          accountId: ACC_REVENUE,
          direction: "credit",
          amountMinor: 2 ** 53,
        },
      ],
    };
    expect(() => assertPostableEntry(entryUnsafe)).toThrow(InvalidEntryError);
  });

  it("rejects non-uuid createdBy", () => {
    const entryBadCreatedBy: JournalEntryInput = {
      organizationId: ORG,
      currency: "TRY",
      description: "Room charge",
      sourceType: "folio_line",
      sourceId: SOURCE_ID,
      createdBy: "not-a-valid-uuid",
      lines: [
        { accountId: ACC_RECEIVABLE, direction: "debit", amountMinor: 100 },
        { accountId: ACC_REVENUE, direction: "credit", amountMinor: 100 },
      ],
    };
    expect(() => assertPostableEntry(entryBadCreatedBy)).toThrow(
      InvalidEntryError,
    );
  });

  it("rejects line description exceeding 500 characters", () => {
    const entryLongLineDesc: JournalEntryInput = {
      organizationId: ORG,
      currency: "TRY",
      description: "Room charge",
      sourceType: "folio_line",
      sourceId: SOURCE_ID,
      lines: [
        {
          accountId: ACC_RECEIVABLE,
          direction: "debit",
          amountMinor: 100,
          description: "x".repeat(501),
        },
        { accountId: ACC_REVENUE, direction: "credit", amountMinor: 100 },
      ],
    };
    expect(() => assertPostableEntry(entryLongLineDesc)).toThrow(
      InvalidEntryError,
    );
  });

  it("accepts a well-formed, balanced journal entry", () => {
    const entry: JournalEntryInput = {
      organizationId: ORG,
      currency: "TRY",
      description: "Room charge",
      sourceType: "folio_line",
      sourceId: SOURCE_ID,
      lines: [
        { accountId: ACC_RECEIVABLE, direction: "debit", amountMinor: 50000 },
        { accountId: ACC_REVENUE, direction: "credit", amountMinor: 50000 },
      ],
    };

    expect(() => assertPostableEntry(entry)).not.toThrow();
  });
});

describe("platform finance: application operations", () => {
  it("posts a journal entry through postJournalEntryWithin", async () => {
    const mockTx: Partial<FinanceClient> = {
      $queryRaw: async (query: TemplateStringsArray) => {
        const text = query.join("");
        if (text.includes("from finance.accounts")) {
          return [
            {
              id: ACC_RECEIVABLE,
              isActive: true,
              code: "1200",
              organizationId: ORG,
            },
            {
              id: ACC_REVENUE,
              isActive: true,
              code: "4000",
              organizationId: ORG,
            },
          ];
        }
        if (text.includes("insert into finance.journal_entries")) {
          return [
            {
              id: "e1000000-0000-4000-8000-000000000001",
              organizationId: ORG,
              entryNumber: 1,
              entryDate: new Date("2026-10-08"),
              postedAt: new Date("2026-10-08T12:00:00Z"),
              currency: "TRY",
              description: "Room charge",
              sourceType: "folio_line",
              sourceId: SOURCE_ID,
              createdBy: null,
            },
          ];
        }
        if (text.includes("insert into finance.journal_lines")) {
          return [
            {
              id: "l1000000-0000-4000-8000-000000000001",
              journalEntryId: "e1000000-0000-4000-8000-000000000001",
              accountId: ACC_RECEIVABLE,
              accountCode: "1200",
              accountName: "Accounts Receivable",
              direction: "debit",
              amountMinor: 50000,
              description: "Room charge",
              lineNumber: 1,
            },
          ];
        }
        return [];
      },
    };

    const entry: JournalEntryInput = {
      organizationId: ORG,
      currency: "TRY",
      description: "Room charge",
      sourceType: "folio_line",
      sourceId: SOURCE_ID,
      lines: [
        { accountId: ACC_RECEIVABLE, direction: "debit", amountMinor: 50000 },
        { accountId: ACC_REVENUE, direction: "credit", amountMinor: 50000 },
      ],
    };

    const posted = await postJournalEntryWithin(mockTx as FinanceClient, entry);

    expect(posted.id).toBe("e1000000-0000-4000-8000-000000000001");
    expect(posted.entryNumber).toBe(1);
    expect(posted.currency).toBe("TRY");
    expect(posted.lines).toHaveLength(2);
  });

  it("rejects posting if an account is inactive", async () => {
    const mockTx: Partial<FinanceClient> = {
      $queryRaw: async (query: TemplateStringsArray) => {
        const text = query.join("");
        if (text.includes("from finance.accounts")) {
          return [
            {
              id: ACC_RECEIVABLE,
              isActive: false, // inactive account
              code: "1200",
              organizationId: ORG,
            },
          ];
        }
        return [];
      },
    };

    const entry: JournalEntryInput = {
      organizationId: ORG,
      currency: "TRY",
      description: "Charge to inactive account",
      sourceType: "folio_line",
      sourceId: SOURCE_ID,
      lines: [
        { accountId: ACC_RECEIVABLE, direction: "debit", amountMinor: 50000 },
        { accountId: ACC_REVENUE, direction: "credit", amountMinor: 50000 },
      ],
    };

    await expect(
      postJournalEntryWithin(mockTx as FinanceClient, entry),
    ).rejects.toThrow(InvalidEntryError);
  });

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

  it("creates a module via createFinanceModule", async () => {
    const mockDb: Partial<FinanceClient> = {
      $queryRaw: async () => [],
      $queryRawUnsafe: async () => [],
    };
    const mod = createFinanceModule({ db: mockDb as never });
    expect(mod.postJournalEntry).toBeDefined();
    expect(mod.getJournalEntry).toBeDefined();
    expect(mod.listAccounts).toBeDefined();
    expect(mod.getAccountBalances).toBeDefined();
  });
});
