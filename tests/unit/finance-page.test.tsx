/**
 * What the Finance page shows where finance is not on (FO-S9-01).
 *
 * Rendered with the funnel mocked: which Properties the viewer may use Finance
 * at is the capability gate's answer, exercised against a real database in
 * tests/integration. What is asserted here is what the page does with an empty
 * answer, and with a `?property=` that names none of the Properties in it.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";

const screenProperties = vi.fn();
const folio = vi.fn();
const folioPage = vi.fn();
const permittedProperties = vi.fn();
const whyDenied = vi.fn();

vi.mock("../../apps/operator-workspace/node_modules/server-only", () => ({}));
// Nothing remembered on this device (OA-S3-05).
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
    usePathname: () => "/en/finance",
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
  FOLIO_CAPABILITY: { moduleKey: "billing_folios", capabilityKey: "finance" },
  POST_CHARGE_PERMISSION: "finance.post_charge",
  POST_PAYMENT_PERMISSION: "finance.post_payment",
  REVERSE_CHARGE_PERMISSION: "finance.reverse_charge",
  REVERSE_PAYMENT_PERMISSION: "finance.reverse_payment",
  AUDIT_READ_PERMISSION: "audit.read",
  FRONT_DESK_CAPABILITY: {
    moduleKey: "front_office",
    capabilityKey: "front_desk",
  },
  screenProperties,
  folio,
  folioPage,
  permittedProperties,
  whyDenied,
  requireViewer: async () => ({
    userId: "d9100001-0000-4000-8000-000000000001",
  }),
}));
// Both are tested on their own; here only whether the page reaches them.
vi.mock(
  "../../apps/operator-workspace/src/features/finance/components/folios-table",
  () => ({
    FoliosTable: (props: { folioHref: string }) => (
      <p data-folio-href={props.folioHref} data-testid="folios-table" />
    ),
  }),
);
const folioPanel = vi.fn();
vi.mock(
  "../../apps/operator-workspace/src/features/finance/components/folio-panel",
  () => ({
    FolioPanel: (props: unknown) => {
      folioPanel(props);
      return <p data-testid="folio-panel" />;
    },
  }),
);

const PROPERTY = {
  propertyId: "d9100004-0000-4000-8000-000000000001",
  propertyName: "Deniz Otel Kadıköy",
  timezone: "Europe/Istanbul",
  organizationId: "d9100002-0000-4000-8000-000000000001",
  organizationName: "Deniz Otelleri",
};
// Finance is switched off here, so it is not in the page's list.
const SWITCHED_OFF = "d9100004-0000-4000-8000-000000000002";
const FORGED = "d9100004-0000-4000-8000-0000000000ff";

const { default: FinancePage } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/finance/page");

async function show(search: {
  property?: string;
  folio?: string;
  show?: string;
}) {
  const page = await FinancePage({
    params: Promise.resolve({ locale: "en" }),
    searchParams: Promise.resolve(search),
  });
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      {page}
    </NextIntlClientProvider>,
  );
}

function expectFinanceIsNotOn() {
  expect(screen.getByText(messages.en.noFinanceTitle)).toBeVisible();
  expect(screen.getByText(messages.en.noFinanceDescription)).toBeVisible();
  expect(screen.queryByTestId("folios-table")).toBeNull();
  expect(screen.queryByTestId("folio-panel")).toBeNull();
  expect(folioPage).not.toHaveBeenCalled();
  expect(folio).not.toHaveBeenCalled();
}

beforeEach(() => {
  screenProperties.mockReset().mockResolvedValue([PROPERTY]);
  folio.mockReset().mockResolvedValue(null);
  folioPage.mockReset().mockResolvedValue({ folios: [], total: 0 });
  permittedProperties.mockReset().mockResolvedValue([]);
  whyDenied.mockReset().mockResolvedValue({ reason: "not_reachable" });
  folioPanel.mockReset();
});
afterEach(cleanup);

describe("the Finance page where finance is not on", () => {
  it("FO-S9-01: says finance is not on when the viewer may use it at no Property", async () => {
    screenProperties.mockResolvedValue([]);
    await show({});
    expectFinanceIsNotOn();
  });

  it("FO-S9-01: answers a forged ?property= exactly as a switched-off one, though the gate that stopped each differs", async () => {
    whyDenied.mockImplementation(async (_gate: unknown, property?: string) =>
      property === FORGED
        ? { reason: "not_reachable" }
        : { reason: "not_enabled" },
    );
    const forged = (
      await show({
        property: FORGED,
        folio: "d9100005-0000-4000-8000-000000000001",
      })
    ).container.innerHTML;
    expectFinanceIsNotOn();
    cleanup();

    const switchedOff = (
      await show({
        property: SWITCHED_OFF,
        folio: "d9100005-0000-4000-8000-000000000001",
      })
    ).container.innerHTML;
    expectFinanceIsNotOn();
    expect(forged).toBe(switchedOff);
  });

  it("SP-S6-11: tells a role without a finance permission which one it lacks, and does not claim the Subscription is the reason", async () => {
    screenProperties.mockResolvedValue([]);
    whyDenied.mockResolvedValue({
      reason: "no_permission",
      permission: "finance.manage_folio",
    });
    await show({});
    expect(
      screen.getByText(messages.en.denied.noPermissionTitle),
    ).toBeVisible();
    expect(screen.queryByText(messages.en.noFinanceTitle)).toBeNull();
    expect(screen.queryByTestId("folios-table")).toBeNull();
    expect(folioPage).not.toHaveBeenCalled();
  });

  it("and names the Property's folios where it is on, so the two above are about finance", async () => {
    await show({ property: PROPERTY.propertyId });
    expect(screen.getByTestId("folios-table")).toBeInTheDocument();
    expect(screen.queryByText(messages.en.noFinanceTitle)).toBeNull();
    expect(folioPage).toHaveBeenCalledWith(PROPERTY.propertyId, "all");
  });
});

describe("the Finance list's tabs (FIN-02)", () => {
  it("asks the module for the tab named in the address, and for all when it names none the screen knows", async () => {
    for (const [shown, asked] of [
      ["owing", "owing"],
      ["open", "open"],
      ["closed", "closed"],
      ["nonsense", "all"],
      [undefined, "all"],
    ] as const) {
      folioPage.mockClear();
      await show({ property: PROPERTY.propertyId, show: shown });
      expect(folioPage).toHaveBeenCalledWith(PROPERTY.propertyId, asked);
      cleanup();
    }
  });

  it("marks the tab that is open", async () => {
    await show({ property: PROPERTY.propertyId, show: "owing" });
    expect(
      screen.getByRole("link", { name: messages.en.finance.tabs.owing }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("link", { name: messages.en.finance.tabs.all }),
    ).not.toHaveAttribute("aria-current");
  });
});

describe("a folio's history (AUDIT-03)", () => {
  const FOLIO = {
    folioId: "d9100005-0000-4000-8000-000000000001",
    propertyId: PROPERTY.propertyId,
  };
  const history = () =>
    (folioPanel.mock.calls.at(-1)?.[0] as { auditHref: string | null })
      .auditHref;

  it("links the Audit log narrowed to the folio, with the Property kept, for a viewer who may read it", async () => {
    folio.mockResolvedValue(FOLIO);
    permittedProperties.mockImplementation(async (permission: string) =>
      permission === "audit.read" ? [PROPERTY] : [],
    );
    await show({ property: PROPERTY.propertyId, folio: FOLIO.folioId });
    expect(history()).toBe(
      `/en/audit-log?property=${PROPERTY.propertyId}&subject=${FOLIO.folioId}`,
    );
  });

  it("offers no link to a viewer who may not read the Audit log", async () => {
    folio.mockResolvedValue(FOLIO);
    permittedProperties.mockResolvedValue([]);
    await show({ property: PROPERTY.propertyId, folio: FOLIO.folioId });
    expect(history()).toBeNull();
  });
});

describe("the list a folio is opened from (FINANCE-05, FINANCE-12)", () => {
  const ROW = (balanceMinor: number, pendingMinor: number) => ({
    folioId: "d9100005-0000-4000-8000-0000000000aa",
    balanceMinor,
    pendingMinor,
    currency: "TRY",
  });

  it("a_folio_opened_from_the_owing_list_comes_back_to_the_owing_list", async () => {
    await show({ property: PROPERTY.propertyId, show: "owing" });
    expect(screen.getByTestId("folios-table")).toHaveAttribute(
      "data-folio-href",
      `/en/finance?property=${PROPERTY.propertyId}&show=owing`,
    );
  });

  it("the_whole_list_keeps_no_tab_in_its_links", async () => {
    await show({ property: PROPERTY.propertyId });
    expect(screen.getByTestId("folios-table")).toHaveAttribute(
      "data-folio-href",
      `/en/finance?property=${PROPERTY.propertyId}`,
    );
  });

  it("a_folio_that_cannot_be_opened_says_so_above_the_list_and_still_offers_it", async () => {
    folio.mockResolvedValue(null);
    await show({
      property: PROPERTY.propertyId,
      folio: "00000000-0000-0000-0000-000000000000",
    });
    expect(screen.getByTestId("folio-not-found")).toHaveTextContent(
      messages.en.finance.folioNotFound,
    );
    expect(screen.getByTestId("folios-table")).toBeInTheDocument();
  });

  it("no_notice_without_a_folio_in_the_address", async () => {
    await show({ property: PROPERTY.propertyId });
    expect(screen.queryByTestId("folio-not-found")).toBeNull();
  });

  it("the_summary_adds_what_check_out_will_charge_and_says_how_much_of_it_that_is", async () => {
    folioPage.mockResolvedValue({
      folios: [ROW(733_000, 0), ROW(0, 1_120_000), ROW(-50_000, 0)],
      total: 3,
    });
    await show({ property: PROPERTY.propertyId, show: "owing" });
    const summary = screen.getByTestId("owing-summary");
    expect(summary).toHaveTextContent(
      "2 folios owe TRY 18,530.00 in all: TRY 7,330.00 already on the bills and TRY 11,200.00 for nights check-out will charge",
    );
  });

  it("the_summary_is_on_the_open_list_too_and_says_nothing_when_nobody_owes", async () => {
    folioPage.mockResolvedValue({ folios: [ROW(100, 0)], total: 1 });
    await show({ property: PROPERTY.propertyId, show: "open" });
    expect(screen.getByTestId("owing-summary")).toHaveTextContent(
      "1 folio owes TRY 1.00 in all",
    );
    cleanup();
    folioPage.mockResolvedValue({ folios: [ROW(-5, 0)], total: 1 });
    await show({ property: PROPERTY.propertyId, show: "open" });
    expect(screen.queryByTestId("owing-summary")).toBeNull();
  });
});
