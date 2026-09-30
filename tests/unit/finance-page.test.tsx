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

const entitledProperties = vi.fn();
const folio = vi.fn();
const folios = vi.fn();
const permittedProperties = vi.fn();

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
  entitledProperties,
  folio,
  folios,
  permittedProperties,
  requireViewer: async () => ({
    userId: "d9100001-0000-4000-8000-000000000001",
  }),
}));
// Both are tested on their own; here only whether the page reaches them.
vi.mock(
  "../../apps/operator-workspace/src/features/finance/components/folios-table",
  () => ({ FoliosTable: () => <p data-testid="folios-table" /> }),
);
vi.mock(
  "../../apps/operator-workspace/src/features/finance/components/folio-panel",
  () => ({ FolioPanel: () => <p data-testid="folio-panel" /> }),
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

async function show(search: { property?: string; folio?: string }) {
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
  expect(folios).not.toHaveBeenCalled();
  expect(folio).not.toHaveBeenCalled();
}

beforeEach(() => {
  entitledProperties.mockReset().mockResolvedValue([PROPERTY]);
  folio.mockReset().mockResolvedValue(null);
  folios.mockReset().mockResolvedValue([]);
  permittedProperties.mockReset().mockResolvedValue([]);
});
afterEach(cleanup);

describe("the Finance page where finance is not on", () => {
  it("FO-S9-01: says finance is not on when the viewer may use it at no Property", async () => {
    entitledProperties.mockResolvedValue([]);
    await show({});
    expectFinanceIsNotOn();
  });

  it("FO-S9-01: answers a forged ?property= exactly as a switched-off one", async () => {
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

  it("and names the Property's folios where it is on, so the two above are about finance", async () => {
    await show({ property: PROPERTY.propertyId });
    expect(screen.getByTestId("folios-table")).toBeInTheDocument();
    expect(screen.queryByText(messages.en.noFinanceTitle)).toBeNull();
    expect(folios).toHaveBeenCalledWith(PROPERTY.propertyId);
  });
});
