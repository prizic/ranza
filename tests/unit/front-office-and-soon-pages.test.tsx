/**
 * The pages that only lead somewhere (audit 2026-11-07, D-11): Front Office,
 * which opens its first page, and the two destinations with nothing behind them
 * yet. Both must ask about the Property the address names, not about every
 * Property the viewer has.
 *
 * Rendered with the funnel mocked; which Properties a page opens at is the
 * capability gate's answer, exercised against a database in tests/integration.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";
import { gateOf } from "../../apps/operator-workspace/src/lib/screens";

const screenProperties = vi.fn();
const whyDenied = vi.fn();
const operatingModelOf = vi.fn();

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
    usePathname: () => "/en/inventory",
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
  whyDenied,
  requireViewer: async () => ({ userId: "u-1" }),
}));
vi.mock("../../apps/operator-workspace/src/server/operating-model", () => ({
  operatingModelOf,
}));

const { default: FrontOfficePage } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/front-office/page");
const { default: InventoryPage } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/inventory/page");
const { default: FoodAndBeveragePage } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/food-and-beverage/page");

const property = (propertyId: string) => ({
  propertyId,
  propertyName: propertyId,
  timezone: "Europe/Istanbul",
  organizationId: "o-1",
  organizationName: "Deniz",
});
const KADIKOY = property("p-kadikoy");
const MODA = property("p-moda");

/** Which Properties each page opens at: the page's segment to its Properties. */
function opensAt(map: Record<string, ReturnType<typeof property>[]>) {
  const byGate = new Map(
    Object.entries(map).map(([segment, at]) => [gateOf(segment), at]),
  );
  screenProperties.mockImplementation(
    async (gate: unknown) => byGate.get(gate as never) ?? [],
  );
}

async function render_(
  Page: typeof FrontOfficePage,
  search: { property?: string },
) {
  const page = await Page({
    params: Promise.resolve({ locale: "en" }),
    searchParams: Promise.resolve(search),
  });
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      {page}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  screenProperties.mockReset().mockResolvedValue([]);
  whyDenied.mockReset().mockResolvedValue({ reason: "not_enabled" });
  operatingModelOf.mockReset().mockResolvedValue("hotel");
});
afterEach(cleanup);

describe("Front Office opens a page that opens at the Property named (D-11)", () => {
  const ALL = ["reservations", "room-calendar", "rooms", "arrivals"] as const;

  it("D-11: skips a page that is open only at another Property", async () => {
    // Reservations opens at Moda alone; Rooms opens at Kadıköy.
    opensAt({ reservations: [MODA], rooms: [KADIKOY, MODA] });
    await expect(
      render_(FrontOfficePage, { property: KADIKOY.propertyId }),
    ).rejects.toThrow(`redirect /en/rooms?property=${KADIKOY.propertyId}`);
  });

  it("D-11: opens the first page in the hotel's order where everything is open", async () => {
    opensAt(Object.fromEntries(ALL.map((segment) => [segment, [KADIKOY]])));
    await expect(
      render_(FrontOfficePage, { property: KADIKOY.propertyId }),
    ).rejects.toThrow(
      `redirect /en/reservations?property=${KADIKOY.propertyId}`,
    );
  });

  it("D-11: a dormitory starts at its beds, in the order its rail lists them", async () => {
    operatingModelOf.mockResolvedValue("dormitory");
    opensAt(Object.fromEntries(ALL.map((segment) => [segment, [KADIKOY]])));
    await expect(
      render_(FrontOfficePage, { property: KADIKOY.propertyId }),
    ).rejects.toThrow(`redirect /en/rooms?property=${KADIKOY.propertyId}`);
    expect(operatingModelOf).toHaveBeenCalledWith(KADIKOY.propertyId);
  });

  it("D-11: with no Property named, opens the first page open anywhere and names none", async () => {
    opensAt({ rooms: [KADIKOY] });
    await expect(render_(FrontOfficePage, {})).rejects.toThrow(
      "redirect /en/rooms",
    );
    expect(operatingModelOf).not.toHaveBeenCalled();
  });

  it("D-11: says why, rather than redirecting, when no page opens at the Property named", async () => {
    opensAt({ reservations: [MODA] });
    await render_(FrontOfficePage, { property: KADIKOY.propertyId });
    expect(
      screen.getByRole("heading", {
        name: messages.en.denied.notEnabledTitle,
      }),
    ).toBeInTheDocument();
    expect(whyDenied).toHaveBeenCalledWith(
      gateOf("reservations"),
      KADIKOY.propertyId,
    );
  });
});

describe("a destination with nothing behind it yet (D-11)", () => {
  const SOON = [
    ["inventory", InventoryPage],
    ["food-and-beverage", FoodAndBeveragePage],
  ] as const;

  for (const [segment, Page] of SOON) {
    it(`D-11: ${segment} says it is switched off at a Property that has it off, not "soon"`, async () => {
      opensAt({ [segment]: [MODA] });
      await render_(Page, { property: KADIKOY.propertyId });
      expect(
        screen.getByRole("heading", {
          name: messages.en.denied.notEnabledTitle,
        }),
      ).toBeInTheDocument();
      expect(screen.queryByText(messages.en.planned)).toBeNull();
      expect(whyDenied).toHaveBeenCalledWith(
        gateOf(segment),
        KADIKOY.propertyId,
      );
    });

    it(`D-11: ${segment} puts the Property it checked into the address`, async () => {
      opensAt({ [segment]: [MODA] });
      await expect(render_(Page, {})).rejects.toThrow(
        `redirect /en/${segment}?property=${MODA.propertyId}`,
      );
    });

    it(`D-11: ${segment} is the Soon screen at a Property that has it`, async () => {
      opensAt({ [segment]: [KADIKOY, MODA] });
      await render_(Page, { property: KADIKOY.propertyId });
      expect(screen.getByText(messages.en.planned)).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: messages.en.denied.goToToday }),
      ).toBeInTheDocument();
    });
  }
});
