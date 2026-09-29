/**
 * What the Reservations page shows beside its list (decision sheet 2026-09-29).
 *
 * Rendered with the funnel mocked: which Units are sellable, the Property's
 * business date and who may manage rooms are the policies' answers, exercised
 * against a real database in tests/integration/booking-and-check-in.test.ts.
 * What is asserted here is what the page does with each answer.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localizeHref } from "../../packages/i18n/src";
import { messages } from "../../apps/operator-workspace/src/messages";

const bookableUnits = vi.fn();
const bookingDay = vi.fn();
const permittedProperties = vi.fn();
const reservations = vi.fn();

vi.mock("../../apps/operator-workspace/node_modules/server-only", () => ({}));
// Nothing remembered on this device (OA-S3-05): the page resolves its
// Property from the URL and its own list, as it did before there was a cookie.
vi.mock("../../apps/operator-workspace/node_modules/next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
const { navigation } = vi.hoisted(() => ({
  navigation: () => ({
    notFound: () => {
      throw new Error("notFound");
    },
    usePathname: () => "/en/reservations",
    useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
    useSearchParams: () => new URLSearchParams(),
  }),
}));
vi.mock("next/navigation", navigation);
// The table resolves the application's own copy of next.
vi.mock(
  "../../apps/operator-workspace/node_modules/next/navigation",
  navigation,
);
vi.mock("next-intl/server", () => ({
  getTranslations: async () =>
    createTranslator({ locale: "en", messages: messages.en as never }),
  setRequestLocale: vi.fn(),
}));
vi.mock("../../apps/operator-workspace/src/server/front-office", () => ({}));
vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  FRONT_DESK_CAPABILITY: {
    moduleKey: "front_office",
    capabilityKey: "front_desk",
  },
  bookableUnits,
  bookingDay,
  entitledProperties: async () => [PROPERTY],
  permittedProperties,
  requireViewer: async () => ({
    userId: "d9000001-0000-4000-8000-000000000001",
  }),
  reservations,
}));
// The dialog is tested on its own in new-reservation.test.tsx; here only the
// day it is handed matters.
vi.mock(
  "../../apps/operator-workspace/src/features/front-office/components/new-reservation-dialog",
  () => ({
    NewReservationDialog: ({ today }: { today: string }) => (
      <p data-testid="booking-today">{today}</p>
    ),
  }),
);

const PROPERTY = {
  propertyId: "d9000004-0000-4000-8000-000000000001",
  propertyName: "Deniz Otel Kadıköy",
  timezone: "Europe/Istanbul",
  organizationId: "d9000002-0000-4000-8000-000000000001",
  organizationName: "Deniz Otelleri",
};

const UNIT = {
  unitId: "u1",
  unitName: "101",
  roomName: null,
  unitType: "room",
  nightlyRateMinor: null,
  rateCurrency: null,
};

const { default: ReservationsPage } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/reservations/page");

async function show() {
  const page = await ReservationsPage({
    params: Promise.resolve({ locale: "en" }),
    // Named, as every page's URL is once it has opened (OA-S3-02).
    searchParams: Promise.resolve({ property: PROPERTY.propertyId }),
  });
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      {page}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  bookableUnits.mockReset().mockResolvedValue([UNIT]);
  // A date nobody's clock would produce, so a page that worked the day out
  // for itself could not match it by accident.
  bookingDay.mockReset().mockResolvedValue("2020-01-02");
  permittedProperties.mockReset().mockResolvedValue([]);
  reservations.mockReset().mockResolvedValue([]);
});
afterEach(cleanup);

describe("the Reservations page", () => {
  it("RG-S3-03: says nothing is booked ahead when the list is empty", async () => {
    await show();
    expect(screen.getByText(messages.en.noReservationsTitle)).toBeVisible();
    expect(
      screen.getByText(messages.en.noReservationsDescription),
    ).toBeVisible();
  });

  it("RG-S1-10: hands the booking form the Property's business date", async () => {
    await show();
    expect(bookingDay).toHaveBeenCalledWith(PROPERTY.propertyId);
    expect(screen.getByTestId("booking-today")).toHaveTextContent("2020-01-02");
  });

  it("RG-S3-04: with no Unit to sell, New reservation is disabled and says why", async () => {
    bookableUnits.mockResolvedValue([]);
    await show();

    const button = screen.getByRole("button", {
      name: messages.en.newReservation,
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(messages.en.noBookableUnit);
    expect(screen.queryByTestId("booking-today")).toBeNull();
    // Nobody here may manage rooms, so there is nowhere useful to send them.
    expect(
      screen.queryByRole("link", { name: messages.en.openRooms }),
    ).toBeNull();
  });

  it("RG-S3-04: somebody who may manage rooms is sent to Rooms, keeping the Property", async () => {
    bookableUnits.mockResolvedValue([]);
    permittedProperties.mockResolvedValue([PROPERTY]);
    await show();

    expect(permittedProperties).toHaveBeenCalledWith("accommodation.configure");
    expect(
      screen.getByRole("link", { name: messages.en.openRooms }),
    ).toHaveAttribute(
      "href",
      `${localizeHref("en", "rooms")}?property=${PROPERTY.propertyId}`,
    );
  });

  it("RG-S3-04: may manage rooms somewhere else is not a link here", async () => {
    bookableUnits.mockResolvedValue([]);
    permittedProperties.mockResolvedValue([
      { ...PROPERTY, propertyId: "d9000004-0000-4000-8000-000000000009" },
    ]);
    await show();
    expect(
      screen.queryByRole("link", { name: messages.en.openRooms }),
    ).toBeNull();
  });
});
