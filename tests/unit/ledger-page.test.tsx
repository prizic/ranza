/**
 * Where the ledger page sends the reader and where Back brings them home
 * (audit 2026-11-07, B-05). Rendered with the reads mocked: what each read
 * returns is exercised against a database in tests/integration/ledger.test.ts;
 * what is asserted here is what the page hands the table to build its links from.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";

const screenProperties = vi.fn();
const journalView = vi.fn();

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
vi.mock("../../apps/operator-workspace/src/server/ledger", () => ({
  accountsView: vi.fn(),
  entryView: vi.fn(),
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
