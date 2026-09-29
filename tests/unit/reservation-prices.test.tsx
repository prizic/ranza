/**
 * What the Reservations list shows in its price column (RT-S2-10).
 *
 * The column reads the price each booking was stamped with (ADR 0038), so a
 * booking taken with a price shows it per night and one taken without says so
 * rather than showing a blank or a zero — a blank cannot be told from a price
 * that failed to load.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReservationRow } from "../../packages/ranza/reservations/src";
import { formatMoney } from "../../packages/i18n/src";
import { messages } from "../../apps/operator-workspace/src/messages";

const { navigation } = vi.hoisted(() => ({
  navigation: () => ({
    usePathname: () => "/en/reservations",
    useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
    useSearchParams: () => new URLSearchParams(),
  }),
}));
vi.mock("next/navigation", navigation);
vi.mock(
  "../../apps/operator-workspace/node_modules/next/navigation",
  navigation,
);
// The row actions call server actions this list only links to.
vi.mock("../../apps/operator-workspace/src/server/front-office", () => ({}));

const { ReservationsTable } =
  await import("../../apps/operator-workspace/src/features/front-office/components/reservations-table");

const BASE: ReservationRow = {
  reservationId: "r1",
  reference: "RZ-PRICED",
  guestId: "g1",
  guestName: "Ada Lovelace",
  guestEmail: null,
  stayType: "guest",
  status: "confirmed",
  startsOn: "2030-01-10",
  endsOn: "2030-01-12",
  unitId: "u1",
  unitName: "101",
  roomName: null,
  unitType: "room",
  nightlyRateMinor: 12_500,
  rateCurrency: "TRY",
  mayCancel: false,
  mayMarkNoShow: false,
  mayAmend: false,
};

function show(rows: ReservationRow[]) {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ReservationsTable
        changing={null}
        locale="en"
        propertyId="p1"
        reservations={rows}
      />
    </NextIntlClientProvider>,
  );
}

function rowOf(reference: string): HTMLElement {
  return screen.getByText(reference).closest("tr") as HTMLElement;
}

afterEach(cleanup);

describe("the Reservations list price column", () => {
  it("RT-S2-10: shows a priced booking's price per night and an unpriced one's No price", () => {
    show([
      BASE,
      {
        ...BASE,
        reservationId: "r2",
        reference: "RZ-UNPRICED",
        nightlyRateMinor: null,
        rateCurrency: null,
      },
    ]);

    // Testing Library collapses the no-break space Intl puts inside a price;
    // the expected text is collapsed the same way.
    const price = messages.en.bookedPerNight
      .replace("{price}", formatMoney(12_500, "TRY", "en"))
      .replace(/\s+/g, " ");
    expect(within(rowOf("RZ-PRICED")).getByText(price)).toBeVisible();
    expect(
      within(rowOf("RZ-PRICED")).queryByText(messages.en.bookedUnpriced),
    ).toBeNull();

    expect(
      within(rowOf("RZ-UNPRICED")).getByText(messages.en.bookedUnpriced),
    ).toBeVisible();
    expect(within(rowOf("RZ-UNPRICED")).queryByText(/\/ night/)).toBeNull();
  });
});
