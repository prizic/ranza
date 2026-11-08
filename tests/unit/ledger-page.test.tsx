/**
 * Where the ledger page sends the reader and where Back brings them home
 * (audit 2026-11-07, B-05). Rendered with the reads mocked: what each read
 * returns is exercised against a database in tests/integration/ledger.test.ts;
 * what is asserted here is what the page hands the table to build its links from.
 */
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";

const screenProperties = vi.fn();
const journalView = vi.fn();
const accountsView = vi.fn();
const entryView = vi.fn();

vi.mock("../../apps/operator-workspace/node_modules/server-only", () => ({}));
vi.mock("../../apps/operator-workspace/node_modules/next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
const { navigation } = vi.hoisted(() => ({
  navigation: () => ({
    notFound: () => {
      throw new Error("notFound");
    },
    redirect: (to: string) => {
      throw new Error(`redirect ${to}`);
    },
    usePathname: () => "/en/ledger",
    useSearchParams: () => new URLSearchParams(),
  }),
}));
vi.mock("next/navigation", navigation);
vi.mock(
  "../../apps/operator-workspace/node_modules/next/navigation",
  navigation,
);
vi.mock("next-intl/server", () => ({
  getTranslations: async () =>
    createTranslator({ locale: "en", messages: messages.en as never }),
  setRequestLocale: vi.fn(),
}));
vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  screenProperties,
  whyDenied: vi.fn(),
  requireViewer: async () => ({ userId: "u-1" }),
}));
vi.mock("../../apps/operator-workspace/node_modules/next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("../../apps/operator-workspace/src/server/ledger", () => ({
  accountsView,
  entryView,
  journalView,
}));
vi.mock(
  "../../apps/operator-workspace/src/features/ledger/components/journal-table",
  () => ({
    JournalTable: (props: { search: Record<string, string | undefined> }) => (
      <p data-search={JSON.stringify(props.search)} data-testid="journal" />
    ),
  }),
);
vi.mock(
  "../../apps/operator-workspace/src/features/ledger/components/ledger-filters",
  () => ({ LedgerFilters: () => null }),
);

const PROPERTY = {
  propertyId: "d9100004-0000-4000-8000-000000000001",
  propertyName: "Deniz Otel Kadıköy",
  timezone: "Europe/Istanbul",
  organizationId: "d9100002-0000-4000-8000-000000000001",
  organizationName: "Deniz Otelleri",
};

const { default: LedgerPage } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/ledger/page");

async function show(search: Record<string, string>) {
  const page = await LedgerPage({
    params: Promise.resolve({ locale: "en" }),
    searchParams: Promise.resolve(search),
  });
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      {page}
    </NextIntlClientProvider>,
  );
}

const searchGiven = () =>
  JSON.parse(screen.getByTestId("journal").getAttribute("data-search") ?? "{}");

beforeEach(() => {
  screenProperties.mockReset().mockResolvedValue([PROPERTY]);
  journalView.mockReset().mockResolvedValue({
    entries: [],
    nextCursor: "123",
    accounts: [],
    currencies: [],
    sourceTypes: [],
  });
});
afterEach(cleanup);

describe("an entry opened from a later page of the journal (B-05)", () => {
  it("B-05: keeps the page the reader was on, so Back returns to it", async () => {
    await show({ property: PROPERTY.propertyId, cursor: "9876" });
    expect(searchGiven().cursor).toBe("9876");
  });

  it("B-05: keeps the filters with it", async () => {
    await show({
      property: PROPERTY.propertyId,
      cursor: "9876",
      currency: "TRY",
    });
    expect(searchGiven()).toMatchObject({ cursor: "9876", currency: "TRY" });
  });

  it("B-05: has no cursor on the first page", async () => {
    await show({ property: PROPERTY.propertyId });
    expect(searchGiven().cursor).toBeUndefined();
  });
});

const CASH = "d9100005-0000-4000-8000-000000000001";
const ENTRY = "d9100006-0000-4000-8000-000000000001";
const REVENUE = "d9100005-0000-4000-8000-000000000002";

describe("an account named on the ledger opens its entries (B-16)", () => {
  it("B-16: the accounts tab links each account to the journal, in the dates and currency it was read in", async () => {
    accountsView.mockResolvedValue({
      currencies: ["TRY"],
      balances: [
        {
          accountId: CASH,
          accountCode: "1000",
          accountName: "Cash",
          accountType: "asset",
          currency: "TRY",
          debitMinor: 5000,
          creditMinor: 0,
          netBalanceMinor: 5000,
        },
      ],
    });
    await show({
      property: PROPERTY.propertyId,
      tab: "accounts",
      from: "2026-10-01",
      to: "2026-10-31",
    });
    const href = screen
      .getByRole("link", { name: /Cash/ })
      .getAttribute("href")!;
    const params = new URL(href, "http://x").searchParams;
    expect(params.get("account")).toBe(CASH);
    expect(params.get("from")).toBe("2026-10-01");
    expect(params.get("to")).toBe("2026-10-31");
    expect(params.get("currency")).toBe("TRY");
    expect(params.get("property")).toBe(PROPERTY.propertyId);
    expect(params.get("tab")).toBeNull();
  });

  it("B-16: an entry's lines link each account to the journal in the entry's currency", async () => {
    entryView.mockResolvedValue({
      folio: null,
      entry: {
        id: ENTRY,
        organizationId: PROPERTY.organizationId,
        entryNumber: 7,
        entryDate: new Date("2026-10-30T00:00:00Z"),
        postedAt: new Date("2026-10-30T09:00:00Z"),
        currency: "TRY",
        description: "Payment",
        sourceType: "manual",
        sourceId: "s",
        createdBy: null,
        lines: [
          {
            id: "l1",
            journalEntryId: ENTRY,
            accountId: CASH,
            accountCode: "1000",
            accountName: "Cash",
            direction: "debit",
            amountMinor: 100,
            description: null,
            lineNumber: 1,
          },
          {
            id: "l2",
            journalEntryId: ENTRY,
            accountId: REVENUE,
            accountCode: "4000",
            accountName: "Room revenue",
            direction: "credit",
            amountMinor: 100,
            description: null,
            lineNumber: 2,
          },
        ],
      },
    });
    await show({ property: PROPERTY.propertyId, entry: ENTRY });
    const hrefOf = (name: RegExp) =>
      new URL(
        screen.getByRole("link", { name }).getAttribute("href")!,
        "http://x",
      ).searchParams;
    expect(hrefOf(/Cash/).get("account")).toBe(CASH);
    expect(hrefOf(/Room revenue/).get("account")).toBe(REVENUE);
    expect(hrefOf(/Cash/).get("currency")).toBe("TRY");
  });
});
