/**
 * The expected arrival on an arrivals row (FD-S6-18, FD-S6-19, FD-S6-24).
 *
 * What the screen decides on its own: how a time of day is written in each
 * language, that it is never shifted by the reader's zone, what the cell says
 * for a Guest with no time and for one whose time has passed, and that the
 * column sorts the ones with no time last in either direction. Whether a time
 * has passed is the database's, on the Property's clock, and is proven in
 * tests/integration/expected-arrival.test.ts.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Arrival } from "../../packages/ranza/reservations/src";
import { expectedArrivalLabel } from "../../apps/operator-workspace/src/features/front-office/expected-arrival";
import { messages } from "../../apps/operator-workspace/src/messages";

// The row's actions reach server actions; this test is about the time.
vi.mock(
  "../../apps/operator-workspace/src/features/front-office/components/check-in-action",
  () => ({ CheckInAction: () => null }),
);
vi.mock(
  "../../apps/operator-workspace/src/features/front-office/components/row-menu",
  () => ({ FrontDeskRowMenu: () => null }),
);
vi.mock(
  "../../apps/operator-workspace/src/features/front-office/components/check-out-dialog",
  () => ({ CheckOutDialog: () => null }),
);
vi.mock(
  "../../apps/operator-workspace/src/features/front-office/components/undo-check-in-dialog",
  () => ({ UndoCheckInDialog: () => null }),
);

const { ArrivalsTable } =
  await import("../../apps/operator-workspace/src/features/front-office/components/arrivals-table");

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

function arrival(overrides: Partial<Arrival>): Arrival {
  return {
    reservationId: overrides.guestName ?? "r-1",
    reference: "R000001",
    guestName: "Ayşe Yılmaz",
    stayType: "guest",
    status: "confirmed",
    startsOn: "2026-10-10",
    endsOn: "2026-10-12",
    unitId: "u-1",
    unitName: "101",
    roomName: null,
    unitType: "room",
    unitStatus: "available",
    unitIsReady: true,
    canCheckIn: true,
    checkInBlocker: null,
    occupantLeaves: null,
    stayId: null,
    folioId: null,
    daysLate: 0,
    expectedArrival: null,
    expectedArrivalPassed: false,
    balanceMinor: 0,
    currency: "TRY",
    mayCheckIn: true,
    mayCancel: true,
    mayAmend: true,
    ...overrides,
  } as Arrival;
}

function show(rows: Arrival[]) {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ArrivalsTable arrivals={rows} locale="en" propertyId="p-1" />
    </NextIntlClientProvider>,
  );
}

/** The Guests in the order the table shows them. */
function order(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map(
      (row) =>
        ["Early", "Late", "Unsaid"].find((name) =>
          row.textContent?.includes(name),
        ) ?? "",
    );
}

const early = arrival({ guestName: "Early", expectedArrival: "09:00" });
const late = arrival({ guestName: "Late", expectedArrival: "21:30" });
const unsaid = arrival({ guestName: "Unsaid" });

describe("writing a time of day", () => {
  it("an_expected_time_is_written_as_the_property_clock_reads_whatever_the_readers_zone", () => {
    // 24-hour in every language, and never shifted: it is a wall-clock time.
    expect(expectedArrivalLabel("14:05", "en")).toBe("14:05");
    expect(expectedArrivalLabel("00:01", "tr")).toBe("00:01");
    expect(expectedArrivalLabel("23:59", "en")).toBe("23:59");
  });

  it("an_expected_time_is_written_in_the_readers_digits_in_arabic", () => {
    const written = expectedArrivalLabel("14:05", "ar");
    // Arabic-Indic digits or Latin ones, but the same numbers either way.
    expect(
      written.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)),
    ).toMatch(/14.05/);
  });
});

describe("the expected arrival column", () => {
  it("the_column_says_nothing_is_known_with_a_dash_and_a_name_for_the_screen_reader", () => {
    show([unsaid]);
    expect(
      screen.getByLabelText(messages.en.expectedArrivalNone),
    ).toHaveTextContent("—");
  });

  it("the_column_says_the_time_has_passed_only_when_the_row_says_so", () => {
    show([
      arrival({
        guestName: "Passed",
        expectedArrival: "09:00",
        expectedArrivalPassed: true,
      }),
    ]);
    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(
      screen.getByText(messages.en.expectedArrivalPassed),
    ).toBeInTheDocument();
    cleanup();

    show([early]);
    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(screen.queryByText(messages.en.expectedArrivalPassed)).toBeNull();
  });

  it("the_column_sorts_the_guests_with_no_time_last_in_either_direction", () => {
    show([unsaid, late, early]);
    const header = () =>
      screen.getByRole("button", {
        name: new RegExp(`^${messages.en.expectedArrival} `),
      });

    fireEvent.click(header());
    expect(order()).toEqual(["Early", "Late", "Unsaid"]);

    fireEvent.click(header());
    expect(order()).toEqual(["Late", "Early", "Unsaid"]);
  });
});
