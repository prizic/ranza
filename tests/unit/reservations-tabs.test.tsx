/**
 * How the Reservations list is narrowed and searched, and what its price column
 * says (RG-S4-08..10).
 *
 * Tabs narrow what is already on the page, so these are about which rows a tab
 * keeps and what its number says — including the two rows a tab must not keep:
 * a booking whose nights all passed unarrived, which belongs only under All,
 * and a late arrival, which belongs under Arriving.
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
import { formatMoney } from "../../packages/i18n/src";
import { messages } from "../../apps/operator-workspace/src/messages";
import { inTab } from "../../apps/operator-workspace/src/features/front-office/reservation-tabs";

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
  stayNights: null,
  totalMinor: null,
};

const ARRIVING = {
  ...BASE,
  reservationId: "r1",
  reference: "RZ-ARRIVING",
  guestName: "Grace Hopper",
  guestEmail: "grace@example.test",
  guestPhone: "+90 532 123 45 67",
};
const IN_HOUSE = {
  ...BASE,
  reservationId: "r2",
  reference: "RZ-INHOUSE",
  guestName: "Alan Turing",
  status: "checked_in" as const,
  startsOn: "2030-01-08",
};
const UPCOMING = {
  ...BASE,
  reservationId: "r3",
  reference: "RZ-UPCOMING",
  guestName: "Edsger Dijkstra",
  startsOn: "2030-01-20",
  endsOn: "2030-01-22",
};
const EXPIRED = {
  ...BASE,
  reservationId: "r4",
  reference: "RZ-EXPIRED",
  guestName: "Barbara Liskov",
  startsOn: "2030-01-01",
  endsOn: "2030-01-05",
};
const ROWS = [ARRIVING, IN_HOUSE, UPCOMING, EXPIRED];

function show(rows: ReservationRow[], today: string | null = TODAY) {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ReservationsTable
        changing={null}
        locale="en"
        propertyId="p1"
        reservations={rows}
        today={today}
      />
    </NextIntlClientProvider>,
  );
}

const tab = (name: RegExp) => screen.getByRole("tab", { name });
const pick = (name: RegExp) => fireEvent.mouseDown(tab(name), { button: 0 });
const listed = () =>
  screen
    .queryAllByText(/^RZ-/)
    .map((cell) => cell.textContent)
    .sort();

afterEach(cleanup);

describe("the Reservations list's tabs", () => {
  it("status_tabs_narrow_the_list_and_show_counts: each tab keeps its own rows and says how many", () => {
    show(ROWS);

    expect(tab(/^All/)).toHaveAttribute("aria-selected", "true");
    expect(listed()).toHaveLength(4);
    expect(tab(/^All/)).toHaveTextContent("4");
    expect(tab(/Arriving today/)).toHaveTextContent("1");
    expect(tab(/In house/)).toHaveTextContent("1");
    expect(tab(/Upcoming/)).toHaveTextContent("1");

    pick(/Arriving today/);
    expect(listed()).toEqual(["RZ-ARRIVING"]);
    pick(/In house/);
    expect(listed()).toEqual(["RZ-INHOUSE"]);
    pick(/Upcoming/);
    expect(listed()).toEqual(["RZ-UPCOMING"]);
    // Only under All: nobody arrived, and its nights are gone.
    pick(/^All/);
    expect(listed()).toContain("RZ-EXPIRED");
  });

  it("status_tabs_narrow_the_list_and_show_counts: an empty tab says so and All is still one press away", () => {
    show([UPCOMING]);
    pick(/Arriving today/);

    expect(
      screen.getByText(messages.en.reservationsTabEmpty.arriving),
    ).toBeVisible();
    expect(
      screen.getByText(messages.en.reservationsTabEmptyHint),
    ).toBeVisible();
    pick(/^All/);
    expect(listed()).toEqual(["RZ-UPCOMING"]);
  });

  it("status_tabs_narrow_the_list_and_show_counts: no list, no tabs; and no business date, no tabs to get wrong", () => {
    show([]);
    expect(screen.queryByRole("tab")).toBeNull();
    cleanup();
    show(ROWS, null);
    expect(screen.queryByRole("tab")).toBeNull();
    expect(listed()).toHaveLength(4);
  });

  it("status_tabs_narrow_the_list_and_show_counts: a late arrival is arriving, and a booking whose nights all passed is not", () => {
    const late = { ...BASE, startsOn: "2030-01-09", endsOn: "2030-01-12" };
    expect(inTab(late, "arriving", TODAY)).toBe(true);
    expect(inTab(EXPIRED, "arriving", TODAY)).toBe(false);
    expect(inTab(EXPIRED, "upcoming", TODAY)).toBe(false);
    expect(inTab({ ...BASE, endsOn: null }, "arriving", TODAY)).toBe(true);
    // Leaving today is not staying tonight.
    expect(
      inTab(
        { ...BASE, startsOn: "2030-01-08", endsOn: TODAY },
        "arriving",
        TODAY,
      ),
    ).toBe(false);
    expect(inTab({ ...BASE, status: "cancelled" }, "upcoming", TODAY)).toBe(
      false,
    );
  });

  it("status_tabs_narrow_the_list_and_show_counts: the counts do not move while somebody searches", () => {
    show(ROWS);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Grace" },
    });
    expect(listed()).toEqual(["RZ-ARRIVING"]);
    expect(tab(/^All/)).toHaveTextContent("4");
  });
});

describe("a booking or check-in the desk has just made", () => {
  function showTabbed(rows: ReservationRow[]) {
    const view = (list: ReservationRow[]) => (
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ReservationsTable
          changing={null}
          locale="en"
          propertyId="p1"
          reservations={list}
          today={TODAY}
        />
      </NextIntlClientProvider>
    );
    const { rerender } = render(view(rows));
    return (list: ReservationRow[]) => rerender(view(list));
  }
  const rowOf = (reference: string) =>
    screen.getByText(reference).closest("tr") as HTMLElement;

  it("a_booking_or_check_in_just_made_is_never_hidden_by_a_tab: a new booking under another tab returns the list to All, marked", () => {
    const reread = showTabbed([IN_HOUSE]);
    pick(/In house/);
    expect(tab(/In house/)).toHaveAttribute("aria-selected", "true");

    // A booking for next week is not in house: without this it would vanish.
    reread([IN_HOUSE, UPCOMING]);
    expect(tab(/^All/)).toHaveAttribute("aria-selected", "true");
    expect(rowOf("RZ-UPCOMING")).toHaveClass("ring-primary/30");
    expect(rowOf("RZ-INHOUSE")).not.toHaveClass("ring-primary/30");
  });

  it("a_booking_or_check_in_just_made_is_never_hidden_by_a_tab: a check-in on Arriving today keeps its row in view", () => {
    const reread = showTabbed([ARRIVING]);
    pick(/Arriving today/);
    expect(listed()).toEqual(["RZ-ARRIVING"]);

    reread([{ ...ARRIVING, status: "checked_in" }]);
    expect(tab(/^All/)).toHaveAttribute("aria-selected", "true");
    expect(rowOf("RZ-ARRIVING")).toHaveClass("ring-primary/30");
  });

  it("a_booking_or_check_in_just_made_is_never_hidden_by_a_tab: a re-read with nothing new leaves the tab and marks alone", () => {
    const reread = showTabbed([ARRIVING, UPCOMING]);
    pick(/Upcoming/);

    reread([{ ...ARRIVING }, { ...UPCOMING }]);
    expect(tab(/Upcoming/)).toHaveAttribute("aria-selected", "true");
    expect(listed()).toEqual(["RZ-UPCOMING"]);
    expect(rowOf("RZ-UPCOMING")).not.toHaveClass("ring-primary/30");
  });

  it("a_booking_or_check_in_just_made_is_never_hidden_by_a_tab: choosing a tab clears the mark", () => {
    const reread = showTabbed([IN_HOUSE]);
    reread([IN_HOUSE, UPCOMING]);
    expect(rowOf("RZ-UPCOMING")).toHaveClass("ring-primary/30");
    pick(/Upcoming/);
    expect(rowOf("RZ-UPCOMING")).not.toHaveClass("ring-primary/30");
  });
});

describe("searching the Reservations list", () => {
  const search = (value: string) =>
    fireEvent.change(screen.getByRole("searchbox"), { target: { value } });

  it("search_matches_a_guests_phone_and_email: finds the row by either", () => {
    show(ROWS);
    search("grace@example");
    expect(listed()).toEqual(["RZ-ARRIVING"]);
    search("+90 532");
    expect(listed()).toEqual(["RZ-ARRIVING"]);
  });

  it("search_matches_a_guests_phone_and_email: a number typed without the spaces it was written with still matches", () => {
    show(ROWS);
    search("5321234567");
    expect(listed()).toEqual(["RZ-ARRIVING"]);
    search("0000");
    expect(listed()).toEqual([]);
  });

  it("search_matches_a_guests_phone_and_email: a telephone stored in Arabic-Indic digits is found by ordinary ones", () => {
    show([{ ...ARRIVING, guestPhone: "+٩٠ ٥٣٢ ١٢٣ ٤٥ ٦٧" }, IN_HOUSE]);
    search("5321234567");
    expect(listed()).toEqual(["RZ-ARRIVING"]);
  });

  it("search_matches_a_guests_phone_and_email: the row shows the phone beside the email", () => {
    show(ROWS);
    const row = screen.getByText("RZ-ARRIVING").closest("tr")!;
    expect(within(row).getByText("grace@example.test")).toBeVisible();
    expect(within(row).getByText("+90 532 123 45 67")).toBeVisible();
  });
});

describe("the Reservations list's price column", () => {
  const money = (minor: number) => formatMoney(minor, "TRY", "en");
  const priced = {
    ...BASE,
    nightlyRateMinor: 12_500,
    rateCurrency: "TRY",
  };
  const row = (reference: string) =>
    screen.getByText(reference).closest("tr") as HTMLElement;

  it("the_price_column_shows_the_total_for_the_stay: a priced booking says nights and total, with the stamped rate beneath", () => {
    show([
      {
        ...priced,
        reference: "RZ-TOTAL",
        stayNights: 3,
        totalMinor: 37_500,
      },
    ]);
    const cell = row("RZ-TOTAL");
    expect(
      within(cell).getByText(
        new RegExp(`3 nights: .*${money(37_500).replace(/\s/g, ".")} in total`),
      ),
    ).toBeVisible();
    expect(within(cell).getByText(/\/ night/)).toBeVisible();
  });

  it("the_price_column_shows_the_total_for_the_stay: a late arrival is totalled on the nights slept, not the nights booked", () => {
    show([
      {
        ...priced,
        reference: "RZ-LATE",
        status: "checked_in",
        startsOn: "2030-01-09",
        endsOn: "2030-01-12",
        stayId: "s",
        stayStartsOn: "2030-01-10",
        stayNights: 2,
        totalMinor: 25_000,
      },
    ]);
    const cell = row("RZ-LATE");
    expect(within(cell).getByText(/2 nights: /)).toBeVisible();
    expect(within(cell).queryByText(/3 nights/)).toBeNull();
  });

  it("a_late_arrivals_period_starts_when_the_stay_did: the period agrees with the nights in the total", () => {
    show([
      {
        ...priced,
        reference: "RZ-PERIOD",
        status: "checked_in",
        startsOn: "2030-01-09",
        endsOn: "2030-01-12",
        stayId: "s",
        stayStartsOn: "2030-01-10",
        stayNights: 2,
        totalMinor: 25_000,
      },
      {
        ...priced,
        reference: "RZ-BOOKED",
        startsOn: "2030-01-09",
        endsOn: "2030-01-12",
        stayNights: 3,
        totalMinor: 37_500,
      },
    ]);
    // Arrived on the 10th: the booking's 9th is not where the stay began.
    expect(within(row("RZ-PERIOD")).getByText(/Jan 10, 2030/)).toBeVisible();
    expect(within(row("RZ-PERIOD")).queryByText(/Jan 9/)).toBeNull();
    // Not arrived yet: the booking's own dates are all there is.
    expect(within(row("RZ-BOOKED")).getByText(/Jan 9, 2030/)).toBeVisible();
  });

  it("the_price_column_shows_the_total_for_the_stay: open-ended and unpriced bookings claim no total", () => {
    show([
      { ...priced, reference: "RZ-OPEN", endsOn: null },
      { ...BASE, reference: "RZ-FREE" },
    ]);
    expect(within(row("RZ-OPEN")).queryByText(/in total/)).toBeNull();
    expect(within(row("RZ-OPEN")).getByText(/\/ night/)).toBeVisible();
    expect(
      within(row("RZ-FREE")).getByText(messages.en.bookedUnpriced),
    ).toBeVisible();
    expect(within(row("RZ-FREE")).queryByText(/in total/)).toBeNull();
  });
});
