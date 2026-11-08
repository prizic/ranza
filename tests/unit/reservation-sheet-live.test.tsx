/**
 * The booking sheet reads the list's live row (RES-SHEET-LIVE).
 *
 * A row opened from the list used to be kept as the object that was clicked, so
 * after Check in the list behind showed Checked in while the sheet still said
 * Confirmed and still offered Check in; the sheet opened from a link read the
 * live row. Both now read it.
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
import {
  REACHES_EVERYTHING,
  type FrontDeskReach,
} from "../../apps/operator-workspace/src/features/front-office/reach";

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
// The booking sheet's invitation buttons are server actions it only calls.
vi.mock(
  "../../apps/operator-workspace/src/server/portal-invitation-actions",
  () => ({}),
);
// And its payment plan, whose add button calls a server action it only imports.
vi.mock(
  "../../apps/operator-workspace/src/server/payment-plan-actions",
  () => ({}),
);

const { ReservationsTable } =
  await import("../../apps/operator-workspace/src/features/front-office/components/reservations-table");

const TODAY = "2030-01-10";

const BASE: ReservationRow = {
  reservationId: "r",
  reference: "RZ-BASE",
  guestId: "g",
  guestName: "Ada Lovelace",
  guestEmail: null,
  guestPhone: null,
  stayType: "guest",
  status: "confirmed",
  startsOn: TODAY,
  endsOn: "2030-01-13",
  expectedArrival: null,
  unitId: "u",
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
  overdueDays: 0,
  stayNights: null,
  totalMinor: null,
};

afterEach(cleanup);

const view = (
  list: ReservationRow[],
  reach: FrontDeskReach = REACHES_EVERYTHING,
) => (
  <NextIntlClientProvider locale="en" messages={messages.en}>
    <ReservationsTable
      changing={null}
      locale="en"
      propertyId="p1"
      reach={reach}
      reservations={list}
      today={TODAY}
    />
  </NextIntlClientProvider>
);

const arriving: ReservationRow = {
  ...BASE,
  reservationId: "r1",
  reference: "RZ-LIVE",
  guestName: "Grace Hopper",
  mayCheckIn: true,
};
const checkedIn: ReservationRow = {
  ...arriving,
  status: "checked_in",
  mayCheckIn: false,
  mayUndoCheckIn: true,
  stayId: "s1",
  stayStartsOn: TODAY,
};

describe("the booking sheet opened from a row", () => {
  it("follows the booking when an action changes it, instead of offering the finished action", async () => {
    const { rerender } = render(view([arriving]));
    fireEvent.click(screen.getByText("RZ-LIVE").closest("tr") as HTMLElement);
    const sheet = await screen.findByRole("dialog");
    expect(
      within(sheet).getByRole("button", { name: /^Check in/ }),
    ).toBeVisible();

    rerender(view([checkedIn]));

    const after = screen.getByRole("dialog");
    expect(
      within(after).queryByRole("button", { name: /^Check in/ }),
    ).toBeNull();
    expect(within(after).getByText("Checked in")).toBeVisible();
  });

  it("closes when the booking is no longer on the list, and does not show a copy of it", async () => {
    const { rerender } = render(view([arriving]));
    fireEvent.click(screen.getByText("RZ-LIVE").closest("tr") as HTMLElement);
    await screen.findByRole("dialog");

    rerender(view([]));

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("the links out of a booking's sheet (audit 2026-11-07, A-06)", () => {
  const withFolio: ReservationRow = { ...arriving, folioId: "f1" };

  async function openSheet(reach: FrontDeskReach) {
    render(view([withFolio], reach));
    fireEvent.click(screen.getByText("RZ-LIVE").closest("tr") as HTMLElement);
    return within(await screen.findByRole("dialog"));
  }

  it("offers the Folio and the room map where the viewer may open both", async () => {
    const sheet = await openSheet(REACHES_EVERYTHING);

    expect(sheet.getByRole("link", { name: /Open folio/ })).toHaveAttribute(
      "href",
      expect.stringContaining("/finance?property=p1&folio=f1"),
    );
    expect(
      sheet.getByRole("link", { name: /Show on the room map/ }),
    ).toBeVisible();
  });

  it("offers no Folio link to a desk that cannot open Finance", async () => {
    const sheet = await openSheet({ ...REACHES_EVERYTHING, folio: false });

    expect(sheet.queryByRole("link", { name: /Open folio/ })).toBeNull();
    expect(
      sheet.getByRole("link", { name: /Show on the room map/ }),
    ).toBeVisible();
  });

  it("offers no room map link to a viewer who cannot open Rooms", async () => {
    const sheet = await openSheet({ ...REACHES_EVERYTHING, rooms: false });

    expect(
      sheet.queryByRole("link", { name: /Show on the room map/ }),
    ).toBeNull();
    expect(sheet.getByRole("link", { name: /Open folio/ })).toBeVisible();
  });
});
