import { describe, expect, it } from "vitest";
import {
  mapFolioLineToJournalEntry,
  postFolioLineToLedgerWithin,
  resolvePaymentAccount,
  STANDARD_ACCOUNT_CODES,
  type AccountMap,
  type FolioLineRecord,
} from "../../packages/adapters/ranza-finance/src";
import {
  InvalidEntryError,
  type FinanceClient,
} from "../../packages/platform/finance/src";

const ORG = "b1000000-0000-4000-8000-000000000001";
const PROP = "b2000000-0000-4000-8000-000000000001";
const FOLIO = "b3000000-0000-4000-8000-000000000001";
const LINE_CHARGE = "b4000000-0000-4000-8000-000000000001";
const LINE_PAYMENT = "b4000000-0000-4000-8000-000000000002";
const LINE_REVERSAL = "b4000000-0000-4000-8000-000000000003";

const MOCK_ACCOUNTS: AccountMap = {
  [STANDARD_ACCOUNT_CODES.CASH]: "acc-cash-1000",
  [STANDARD_ACCOUNT_CODES.BANK]: "acc-bank-1010",
  [STANDARD_ACCOUNT_CODES.CARD]: "acc-card-1020",
  [STANDARD_ACCOUNT_CODES.RECEIVABLES]: "acc-rec-1200",
  [STANDARD_ACCOUNT_CODES.ROOM_REVENUE]: "acc-rev-4000",
  [STANDARD_ACCOUNT_CODES.OTHER_REVENUE]: "acc-rev-4100",
};

describe("ranza-finance adapter: mapper", () => {
  it("resolves payment accounts correctly by payment method", () => {
    expect(resolvePaymentAccount("cash")).toBe(STANDARD_ACCOUNT_CODES.CASH);
    expect(resolvePaymentAccount("card")).toBe(STANDARD_ACCOUNT_CODES.CARD);
    expect(resolvePaymentAccount("bank_transfer")).toBe(
      STANDARD_ACCOUNT_CODES.BANK,
    );
    expect(resolvePaymentAccount("other")).toBe(STANDARD_ACCOUNT_CODES.CASH);
    expect(resolvePaymentAccount(null)).toBe(STANDARD_ACCOUNT_CODES.CASH);
    expect(() => resolvePaymentAccount("unsupported_method")).toThrow(
      InvalidEntryError,
    );
  });

  it("maps a charge line into Debit Receivables, Credit Revenue", () => {
    const chargeLine: FolioLineRecord = {
      id: LINE_CHARGE,
      organizationId: ORG,
      propertyId: PROP,
      folioId: FOLIO,
      lineType: "charge",
      description: "Night in Galata Suite",
      amountMinor: 150000,
      paymentMethod: null,
      reversesLineId: null,
      source: "room_night",
      currency: "TRY",
    };

    const entry = mapFolioLineToJournalEntry(chargeLine, MOCK_ACCOUNTS);

    expect(entry.organizationId).toBe(ORG);
    expect(entry.currency).toBe("TRY");
    expect(entry.sourceType).toBe("folio_line");
    expect(entry.sourceId).toBe(LINE_CHARGE);
    expect(entry.lines).toHaveLength(2);

    const debit = entry.lines.find((l) => l.direction === "debit")!;
    const credit = entry.lines.find((l) => l.direction === "credit")!;

    expect(debit.accountId).toBe(
      MOCK_ACCOUNTS[STANDARD_ACCOUNT_CODES.RECEIVABLES],
    );
    expect(debit.amountMinor).toBe(150000);

    expect(credit.accountId).toBe(
      MOCK_ACCOUNTS[STANDARD_ACCOUNT_CODES.ROOM_REVENUE],
    );
    expect(credit.amountMinor).toBe(150000);
  });

  it("maps a payment line into Debit Cash/Bank, Credit Receivables", () => {
    const paymentLine: FolioLineRecord = {
      id: LINE_PAYMENT,
      organizationId: ORG,
      propertyId: PROP,
      folioId: FOLIO,
      lineType: "payment",
      description: "Card payment at reception",
      amountMinor: -150000, // stored signed negative on Folio
      paymentMethod: "card",
      reversesLineId: null,
      source: null,
      currency: "TRY",
    };

    const entry = mapFolioLineToJournalEntry(paymentLine, MOCK_ACCOUNTS);

    expect(entry.lines).toHaveLength(2);
    const debit = entry.lines.find((l) => l.direction === "debit")!;
    const credit = entry.lines.find((l) => l.direction === "credit")!;

    expect(debit.accountId).toBe(MOCK_ACCOUNTS[STANDARD_ACCOUNT_CODES.CARD]);
    expect(debit.amountMinor).toBe(150000);

    expect(credit.accountId).toBe(
      MOCK_ACCOUNTS[STANDARD_ACCOUNT_CODES.RECEIVABLES],
    );
    expect(credit.amountMinor).toBe(150000);
  });

  it("maps a charge reversal into Debit Revenue, Credit Receivables", () => {
    const originalCharge: FolioLineRecord = {
      id: LINE_CHARGE,
      organizationId: ORG,
      propertyId: PROP,
      folioId: FOLIO,
      lineType: "charge",
      description: "Minibar",
      amountMinor: 2500,
      paymentMethod: null,
      reversesLineId: null,
      source: null,
      currency: "TRY",
    };

    const reversalLine: FolioLineRecord = {
      id: LINE_REVERSAL,
      organizationId: ORG,
      propertyId: PROP,
      folioId: FOLIO,
      lineType: "reversal",
      description: "Charged in error",
      amountMinor: -2500,
      paymentMethod: null,
      reversesLineId: LINE_CHARGE,
      source: null,
      currency: "TRY",
    };

    const entry = mapFolioLineToJournalEntry(
      reversalLine,
      MOCK_ACCOUNTS,
      originalCharge,
    );

    const debit = entry.lines.find((l) => l.direction === "debit")!;
    const credit = entry.lines.find((l) => l.direction === "credit")!;

    expect(debit.accountId).toBe(
      MOCK_ACCOUNTS[STANDARD_ACCOUNT_CODES.OTHER_REVENUE],
    );
    expect(debit.amountMinor).toBe(2500);

    expect(credit.accountId).toBe(
      MOCK_ACCOUNTS[STANDARD_ACCOUNT_CODES.RECEIVABLES],
    );
    expect(credit.amountMinor).toBe(2500);
  });

  it("maps a payment reversal into Debit Receivables, Credit Cash/Bank", () => {
    const originalPayment: FolioLineRecord = {
      id: LINE_PAYMENT,
      organizationId: ORG,
      propertyId: PROP,
      folioId: FOLIO,
      lineType: "payment",
      description: "Cash settlement",
      amountMinor: -5000,
      paymentMethod: "cash",
      reversesLineId: null,
      source: null,
      currency: "TRY",
    };

    const reversalLine: FolioLineRecord = {
      id: LINE_REVERSAL,
      organizationId: ORG,
      propertyId: PROP,
      folioId: FOLIO,
      lineType: "reversal",
      description: "Payment refund / correction",
      amountMinor: 5000,
      paymentMethod: null,
      reversesLineId: LINE_PAYMENT,
      source: null,
      currency: "TRY",
    };

    const entry = mapFolioLineToJournalEntry(
      reversalLine,
      MOCK_ACCOUNTS,
      originalPayment,
    );

    const debit = entry.lines.find((l) => l.direction === "debit")!;
    const credit = entry.lines.find((l) => l.direction === "credit")!;

    expect(debit.accountId).toBe(
      MOCK_ACCOUNTS[STANDARD_ACCOUNT_CODES.RECEIVABLES],
    );
    expect(debit.amountMinor).toBe(5000);

    expect(credit.accountId).toBe(MOCK_ACCOUNTS[STANDARD_ACCOUNT_CODES.CASH]);
    expect(credit.amountMinor).toBe(5000);
  });

  it("throws InvalidEntryError if reversal is missing original line", () => {
    const reversalLine: FolioLineRecord = {
      id: LINE_REVERSAL,
      organizationId: ORG,
      propertyId: PROP,
      folioId: FOLIO,
      lineType: "reversal",
      description: "Missing original",
      amountMinor: 5000,
      paymentMethod: null,
      reversesLineId: null,
      source: null,
      currency: "TRY",
    };

    expect(() =>
      mapFolioLineToJournalEntry(reversalLine, MOCK_ACCOUNTS, null),
    ).toThrow(InvalidEntryError);
  });
});

describe("ranza-finance adapter: postFolioLineToLedgerWithin", () => {
  it("returns null when folio line does not exist", async () => {
    const mockTx: Partial<FinanceClient> = {
      $queryRaw: async () => [],
    };

    const result = await postFolioLineToLedgerWithin(
      mockTx as FinanceClient,
      "00000000-0000-4000-8000-000000000000",
    );
    expect(result).toBeNull();
  });

  it("returns existing journal entry idempotently without re-posting", async () => {
    const existingEntry = {
      id: "e1000000-0000-4000-8000-000000000001",
      organizationId: ORG,
      entryNumber: 42,
      entryDate: new Date(),
      postedAt: new Date(),
      currency: "TRY",
      description: "Existing",
      sourceType: "folio_line",
      sourceId: LINE_CHARGE,
      createdBy: null,
      lines: [],
    };

    const mockTx: Partial<FinanceClient> = {
      $queryRaw: async (query: TemplateStringsArray) => {
        const text = query.join("");
        if (text.includes("from public.folio_lines")) {
          return [
            {
              id: LINE_CHARGE,
              organizationId: ORG,
              propertyId: PROP,
              folioId: FOLIO,
              lineType: "charge",
              description: "Room charge",
              amountMinor: "10000",
              paymentMethod: null,
              reversesLineId: null,
              source: "room_night",
              currency: "TRY",
            },
          ];
        }
        if (text.includes("from finance.journal_entries")) {
          return [
            {
              ...existingEntry,
              entryNumber: "42",
            },
          ];
        }
        return [];
      },
    };

    const result = await postFolioLineToLedgerWithin(
      mockTx as FinanceClient,
      LINE_CHARGE,
    );
    expect(result?.id).toBe(existingEntry.id);
    expect(result?.entryNumber).toBe(42);
  });

  it("uses snapshot payload directly without querying public.folio_lines", async () => {
    let queriedFolioLines = false;
    const existingEntry = {
      id: "e1000000-0000-4000-8000-000000000001",
      organizationId: ORG,
      entryNumber: 99,
      entryDate: new Date(),
      postedAt: new Date(),
      currency: "TRY",
      description: "Snapshot posting",
      sourceType: "folio_line",
      sourceId: LINE_CHARGE,
      createdBy: null,
      lines: [],
    };

    const mockTx: Partial<FinanceClient> = {
      $queryRaw: async (query: TemplateStringsArray) => {
        const text = query.join("");
        if (text.includes("from public.folio_lines")) {
          queriedFolioLines = true;
          return [];
        }
        if (text.includes("from finance.journal_entries")) {
          return [{ ...existingEntry, entryNumber: "99" }];
        }
        return [];
      },
    };

    const snapshot = {
      lineId: LINE_CHARGE,
      organizationId: ORG,
      propertyId: PROP,
      folioId: FOLIO,
      lineType: "charge",
      description: "Snapshot charge",
      amountMinor: 50000,
      paymentMethod: null,
      currency: "TRY",
    };

    const result = await postFolioLineToLedgerWithin(
      mockTx as FinanceClient,
      LINE_CHARGE,
      snapshot,
    );

    expect(queriedFolioLines).toBe(false);
    expect(result?.id).toBe(existingEntry.id);
  });

  it("handles 42501 permission denied gracefully with a descriptive error when snapshot is absent", async () => {
    const permissionError = new Error(
      "permission denied for table folio_lines",
    );
    (permissionError as unknown as { code: string }).code = "42501";

    const mockTx: Partial<FinanceClient> = {
      $queryRaw: async () => {
        throw permissionError;
      },
    };

    await expect(
      postFolioLineToLedgerWithin(
        mockTx as FinanceClient,
        "c1000000-0000-4000-8000-000000000001",
      ),
    ).rejects.toThrow(InvalidEntryError);
  });
});
