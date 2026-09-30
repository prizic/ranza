/**
 * What a Reservations row offers the desk (RG-S4-01..04).
 *
 * Check in is offered only where the list's own read says it may work, and an
 * in-house row reaches the Folio and the Stay changes that Departures already
 * offers. Nothing here decides whether a press succeeds: the check-in and the
 * policies do, so these tests are about what is on screen.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReservationRow } from "../../packages/ranza/reservations/src";
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
vi.mock("../../apps/operator-workspace/src/server/front-office", () => ({
  checkInReservation: vi.fn(),
}));

const { ReservationsTable } =
  await import("../../apps/operator-workspace/src/features/front-office/components/reservations-table");

const BASE: ReservationRow = {
  reservationId: "r1",
  reference: "RZ-ROW",
  guestId: "g1",
  guestName: "Ada Lovelace",
  guestEmail: null,
  guestPhone: null,
  stayType: "guest",
  status: "confirmed",
  startsOn: "2030-01-10",
  endsOn: "2030-01-12",
  unitId: "u1",
  unitName: "101",
  roomName: null,
  unitType: "room",
  nightlyRateMinor: null,
  rateCurrency: null,
  mayCancel: false,
  mayMarkNoShow: false,
  mayAmend: false,
  mayCheckIn: false,
  mayChangeStay: false,
  stayId: null,
  stayStartsOn: null,
  folioId: null,
  stayNights: null,
  totalMinor: null,
};

const IN_HOUSE: ReservationRow = {
  ...BASE,
  status: "checked_in",
  stayId: "s1",
  stayStartsOn: "2030-01-11",
  folioId: "f1",
  mayChangeStay: true,
};

function show(row: ReservationRow) {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ReservationsTable
        changing={null}
        locale="en"
        propertyId="p1"
        reservations={[row]}
        today="2030-01-10"
      />
    </NextIntlClientProvider>,
  );
  return screen.getByText(row.reference).closest("tr") as HTMLElement;
}

function openMenu(row: HTMLElement) {
  fireEvent.pointerDown(
    within(row).getByRole("button", { name: /more actions/i }),
    { button: 0, ctrlKey: false },
  );
}

afterEach(cleanup);

describe("a Reservations row's actions", () => {
  it("a_confirmed_booking_can_be_checked_in_from_the_reservations_list: shows Check in when the row says it may", () => {
    const row = show({ ...BASE, mayCheckIn: true });
    expect(
      within(row).getByRole("button", { name: messages.en.checkIn }),
    ).toBeVisible();
  });

  it("check_in_is_only_offered_on_a_confirmed_booking_that_has_arrived_to_a_viewer_who_may: offers none otherwise", () => {
    const row = show({ ...BASE, mayCheckIn: false });
    expect(
      within(row).queryByRole("button", { name: messages.en.checkIn }),
    ).toBeNull();
  });

  it("a_checked_in_row_offers_the_folio_and_stay_changes: menu carries Open folio, Change departure and Move Guest", () => {
    const row = show({ ...IN_HOUSE, mayCancel: true, mayAmend: true });
    expect(
      within(row).queryByRole("button", { name: messages.en.checkIn }),
    ).toBeNull();
    openMenu(row);
    const items = screen.getAllByRole("menuitem").map((i) => i.textContent);
    expect(items).toContain(messages.en.openFolio);
    expect(items).toContain(messages.en.changeDeparture);
    expect(items).toContain(messages.en.moveGuest);
    // A booking's own endings do not apply once the Guest is in house, even for
    // a row that says the viewer may cancel and amend.
    expect(items).not.toContain(messages.en.cancelBooking);
    expect(items).not.toContain(messages.en.changeBooking);
  });

  it("open_folio_is_only_offered_when_the_row_has_an_open_folio: no Folio, no Open folio", () => {
    const row = show({ ...IN_HOUSE, folioId: null });
    openMenu(row);
    const items = screen.getAllByRole("menuitem").map((i) => i.textContent);
    expect(items).not.toContain(messages.en.openFolio);
    expect(items).toContain(messages.en.changeDeparture);
  });

  it("a_checked_in_row_offers_the_folio_and_stay_changes: without the stay permission only the Folio remains", () => {
    const row = show({ ...IN_HOUSE, mayChangeStay: false });
    openMenu(row);
    const items = screen.getAllByRole("menuitem").map((i) => i.textContent);
    expect(items).toContain(messages.en.openFolio);
    expect(items).not.toContain(messages.en.changeDeparture);
    expect(items).not.toContain(messages.en.moveGuest);
  });
});
