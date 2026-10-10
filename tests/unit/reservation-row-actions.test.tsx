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
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReservationRow } from "../../packages/ranza/reservations/src";
import { messages } from "../../apps/operator-workspace/src/messages";

beforeAll(() => {
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", Observer);
});

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
  reverseCheckIn: vi.fn(),
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
  expectedArrival: null,
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
  checkInBlocker: null,
  mayChangeStay: false,
  mayUndoCheckIn: false,
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

  it("a_check_in_made_today_can_be_withdrawn_from_the_list: offers Withdraw check-in where the row says it may, and only there", () => {
    const withdraw = { name: new RegExp(messages.en.undoCheckIn, "i") };
    const offered = show({ ...IN_HOUSE, mayUndoCheckIn: true });
    expect(within(offered).getByRole("button", withdraw)).toBeVisible();
    cleanup();

    // Arrived on an earlier day, or a viewer without the permission.
    const refused = show({ ...IN_HOUSE, mayUndoCheckIn: false });
    expect(within(refused).queryByRole("button", withdraw)).toBeNull();
  });

  it("a_due_booking_that_cannot_be_checked_in_says_why_instead_of_offering_the_button: says what stands in the way, in place of Check in", () => {
    for (const blocker of [
      "not_confirmed",
      "unit_blocked",
      "unit_out_of_service",
      "unit_occupied",
    ] as const) {
      const row = show({ ...BASE, checkInBlocker: blocker });
      expect(
        within(row).getByText(messages.en.checkInBlocked[blocker]),
      ).toBeVisible();
      expect(
        within(row).queryByRole("button", { name: messages.en.checkIn }),
      ).toBeNull();
      cleanup();
    }
    // Nothing in the way, and nothing due: neither a reason nor a button.
    const quiet = show({ ...BASE });
    for (const message of Object.values(messages.en.checkInBlocked)) {
      expect(within(quiet).queryByText(message)).toBeNull();
    }
  });

  it("show_on_the_room_map_links_to_the_unit: carries the unit parameter in the room map link", () => {
    const row = show({ ...BASE, unitId: "u1" });
    openMenu(row);
    const link = screen
      .getByRole("menuitem", { name: messages.en.showOnRoomMap })
      .closest("a");
    expect(link).toHaveAttribute("href", "/en/rooms?property=p1&unit=u1");
  });

  it("copy_reference_button: copies the reservation reference to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });
    const row = show({ ...BASE, reference: "RZ-TEST-COPY" });
    const copyBtn = within(row).getByRole("button", {
      name: messages.en.copyReference,
    });
    expect(copyBtn).toBeVisible();
    fireEvent.click(copyBtn);
    expect(writeText).toHaveBeenCalledWith("RZ-TEST-COPY");
  });

  it("reservation_detail_sheet: clicking a row opens the reservation detail sheet", () => {
    const row = show({
      ...BASE,
      guestEmail: "ada@example.test",
      guestPhone: "+90 532 999 88 77",
      nightlyRateMinor: 50_000,
      rateCurrency: "TRY",
      totalMinor: 100_000,
    });
    const guestCell = within(row).getByText("Ada Lovelace");
    fireEvent.click(guestCell);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeVisible();
    expect(within(dialog).getByText(/Reservation details/)).toBeVisible();
    expect(within(dialog).getByText(messages.en.stayTimeline)).toBeVisible();
    expect(within(dialog).getByText(messages.en.contactDetails)).toBeVisible();
    expect(within(dialog).getByText("ada@example.test")).toBeVisible();
    expect(within(dialog).getByText("+90 532 999 88 77")).toBeVisible();
    expect(
      within(dialog).getByText(messages.en.financialDetails),
    ).toBeVisible();
  });
});
