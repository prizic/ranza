/**
 * What the Branding page says to each person who reaches it (RANZ-47, BR-S1-38).
 *
 * Which Properties a viewer may open it from is decided by the funnel, and by
 * policies that tests/integration/branding.test.ts exercises against a real
 * database; so is whether they may then change the brand. What is asserted here
 * is the sentence the page chooses for each answer: a gate that has failed is
 * said as the screen every unreachable destination shows, and only reach is
 * said as reach, which holding the permission at one Property does not put
 * right.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";

const permittedProperties = vi.fn();
const organizationBrand = vi.fn();
// Which gate stopped them is proved against a database
// (tests/integration/core-denial.test.ts); what the page does with the answer
// is what is asserted here.
const whyDenied = vi.fn(async () => ({ reason: "not_subscribed" as const }));

const PROPERTY = {
  propertyId: "d9100001-0000-4000-8000-000000000001",
  propertyName: "Deniz Otel",
  timezone: "Europe/Istanbul",
  organizationId: "d9100002-0000-4000-8000-000000000001",
  organizationName: "Deniz Otelleri",
};
const DEFAULT_BRAND = {
  primaryColor: null,
  primaryForeground: null,
  primaryText: null,
  logo: null,
};

vi.mock("../../apps/operator-workspace/node_modules/server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  usePathname: () => "/en/branding",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () =>
    createTranslator({ locale: "en", messages: messages.en as never }),
  setRequestLocale: vi.fn(),
}));
vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  organizationBrand,
  permittedProperties,
  whyDenied,
  requireViewer: async () => ({
    userId: "d9100003-0000-4000-8000-000000000001",
  }),
}));
vi.mock("../../apps/operator-workspace/src/server/front-desk", () => ({
  frontDeskProperty: async (properties: readonly unknown[]) => properties[0],
}));
vi.mock("../../apps/operator-workspace/src/server/branding", () => ({
  assessBrandingColor: vi.fn(),
  resetBranding: vi.fn(),
  saveBranding: vi.fn(),
}));

const { default: BrandingPage } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/branding/page");

async function show() {
  const page = await BrandingPage({
    params: Promise.resolve({ locale: "en" }),
    searchParams: Promise.resolve({}),
  });
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      {page}
    </NextIntlClientProvider>,
  );
}

const SUBSCRIPTION = "This module is not in your Subscription";
const REACH = "Only someone who reaches every Property changes the brand";

beforeEach(() => {
  permittedProperties.mockReset();
  organizationBrand.mockReset();
});
afterEach(cleanup);

describe("the Branding page", () => {
  it("BR-S1-38: asks for the permission and the Configuration capability together", async () => {
    permittedProperties.mockResolvedValue([]);
    await show();
    expect(permittedProperties).toHaveBeenCalledWith(
      "branding.manage",
      "platform_core",
      "configuration",
    );
  });

  it("BR-S1-38: says what every unreachable screen says where a gate has failed, not that reach is missing", async () => {
    // A suspended Subscription, an Entitlement that is gone and a Property with
    // Configuration off all leave the list empty.
    permittedProperties.mockResolvedValue([]);
    await show();
    expect(screen.getByText(SUBSCRIPTION)).toBeInTheDocument();
    expect(screen.queryByText(REACH)).not.toBeInTheDocument();
  });

  it("BR-S1-38: says the same where the gate fails between the list and the read", async () => {
    permittedProperties.mockResolvedValue([PROPERTY]);
    organizationBrand.mockResolvedValue({
      canManage: false,
      reason: "unavailable",
      brand: DEFAULT_BRAND,
    });
    await show();
    expect(screen.getByText(SUBSCRIPTION)).toBeInTheDocument();
    expect(screen.queryByText(REACH)).not.toBeInTheDocument();
  });

  it("BR-S1-30: says it is reach that is missing to a holder who reaches one Property", async () => {
    permittedProperties.mockResolvedValue([PROPERTY]);
    organizationBrand.mockResolvedValue({
      canManage: false,
      reason: "reach",
      brand: DEFAULT_BRAND,
    });
    await show();
    expect(screen.getByText(REACH)).toBeInTheDocument();
    expect(screen.queryByText(SUBSCRIPTION)).not.toBeInTheDocument();
  });

  it("BR-S1-38: shows the form to somebody who may change the brand", async () => {
    permittedProperties.mockResolvedValue([PROPERTY]);
    organizationBrand.mockResolvedValue({
      canManage: true,
      reason: null,
      brand: DEFAULT_BRAND,
    });
    await show();
    expect(screen.getByLabelText(/Colour \(#rrggbb\)/)).toBeInTheDocument();
    expect(screen.queryByText(SUBSCRIPTION)).not.toBeInTheDocument();
    expect(screen.queryByText(REACH)).not.toBeInTheDocument();
  });
});
