/**
 * "New booking" on Arrivals is offered only to somebody who can use it
 * (audit 2026-11-07, D-03 and A-04).
 *
 * Arrivals opens for any of five front-desk permissions; the booking form is
 * on Reservations and needs `front_desk.book`. A Check in permission alone was
 * shown the button, which ended on a list with no form and no word about why.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gateOf } from "../../apps/operator-workspace/src/lib/screens";
import { messages } from "../../apps/operator-workspace/src/messages";

const permittedProperties = vi.fn();
const screenProperties = vi.fn();

vi.mock("../../apps/operator-workspace/node_modules/server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () =>
    createTranslator({ locale: "en", messages: messages.en as never }),
  setRequestLocale: vi.fn(),
}));
vi.mock("../../apps/operator-workspace/src/app/providers/hydrate", () => ({
  Hydrated: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  requestQueryClient: () => ({ prefetchQuery: async () => undefined }),
}));
vi.mock("../../apps/operator-workspace/src/server/front-desk", () => ({
  frontDeskProperty: async (properties: readonly unknown[]) => properties[0],
  frontDeskReach: async () => ({}),
}));
vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  arrivals: async () => [],
  permittedProperties,
  requireViewer: async () => ({ userId: "u1" }),
  screenProperties,
  whyDenied: async () => ({ reason: "not_reachable" as const }),
}));
vi.mock(
  "../../apps/operator-workspace/src/features/front-office/components/live-arrivals",
  () => ({ LiveArrivals: () => <p>arrivals list</p> }),
);

const PROPERTY = {
  propertyId: "d9000004-0000-4000-8000-000000000001",
  propertyName: "Deniz Otel Kadıköy",
  timezone: "Europe/Istanbul",
  organizationId: "d9000002-0000-4000-8000-000000000001",
  organizationName: "Deniz Otelleri",
};

const { default: ArrivalsPage } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/arrivals/page");

async function show() {
  const page = await ArrivalsPage({
    params: Promise.resolve({ locale: "en" }),
    searchParams: Promise.resolve({ property: PROPERTY.propertyId }),
  });
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      {page}
    </NextIntlClientProvider>,
  );
}

let canBook = true;
let canOpenReservations = true;

beforeEach(() => {
  canBook = true;
  canOpenReservations = true;
  permittedProperties
    .mockReset()
    .mockImplementation(async (permission: string) =>
      permission === "front_desk.book" && canBook ? [PROPERTY] : [],
    );
  screenProperties.mockReset().mockImplementation(async (gate: unknown) =>
    // Arrivals and Reservations share their permissions, so only the gate
    // itself says which was asked about.
    gate === gateOf("reservations") && !canOpenReservations ? [] : [PROPERTY],
  );
});
afterEach(cleanup);

describe("New booking on Arrivals", () => {
  it("is a link to the booking form for somebody who may book", async () => {
    await show();

    expect(
      screen.getByRole("link", { name: messages.en.newBooking }),
    ).toHaveAttribute(
      "href",
      `/en/reservations?property=${PROPERTY.propertyId}&new=1`,
    );
  });

  it("is absent for somebody who may check guests in but not book", async () => {
    canBook = false;
    await show();

    expect(
      screen.queryByRole("link", { name: messages.en.newBooking }),
    ).toBeNull();
    expect(screen.getByText("arrivals list")).toBeVisible();
  });

  it("is absent when Reservations does not open for them at this Property", async () => {
    canOpenReservations = false;
    await show();

    expect(
      screen.queryByRole("link", { name: messages.en.newBooking }),
    ).toBeNull();
  });
});
