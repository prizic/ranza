/**
 * The arrivals list is read again every thirty seconds (CI-S3-15) and after
 * every check-in, and a reading must not take the desk's place in it.
 *
 * Each read hands the table new rows. When the table rebuilt its columns on
 * every render, every cell was a new component to React and was mounted
 * afresh: the button the desk had just been moved to lost focus, and a row's
 * open question ("check in anyway?") was forgotten. Asserted by element
 * identity and by state held inside the row's action, so a remount for any
 * reason goes red.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Arrival } from "../../packages/ranza/reservations/src";
import { messages } from "../../apps/operator-workspace/src/messages";

// Stands in for the row's check-in form: state that lives in the row, which a
// remount would reset to zero.
vi.mock(
  "../../apps/operator-workspace/src/features/front-office/components/check-in-action",
  () => ({
    CheckInAction: ({ guestName }: { guestName?: string }) => {
      const [presses, setPresses] = useState(0);
      return (
        <button onClick={() => setPresses((n) => n + 1)} type="button">
          {`Check in ${guestName} (${presses})`}
        </button>
      );
    },
  }),
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

function arrival(guestName: string): Arrival {
  return {
    reservationId: `r-${guestName}`,
    reference: "R000001",
    guestName,
    stayType: "guest",
    status: "confirmed",
    startsOn: "2026-10-10",
    endsOn: "2026-10-12",
    unitId: `u-${guestName}`,
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
  } as Arrival;
}

function table(rows: Arrival[]) {
  return (
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ArrivalsTable arrivals={rows} locale="en" propertyId="p-1" />
    </NextIntlClientProvider>
  );
}

describe("the arrivals list read again", () => {
  it("a_reading_keeps_the_focused_check_in_and_what_its_row_was_doing", () => {
    const { rerender } = render(table([arrival("Ayşe"), arrival("Deniz")]));
    const button = screen.getByRole("button", { name: /^Check in Deniz/ });
    fireEvent.click(button);
    act(() => button.focus());
    expect(button).toHaveAccessibleName("Check in Deniz (1)");

    // What a poll hands over: the same rows, in a new array of new objects.
    rerender(table([arrival("Ayşe"), arrival("Deniz")]));

    const after = screen.getByRole("button", { name: /^Check in Deniz/ });
    expect(after).toBe(button);
    expect(after).toHaveFocus();
    expect(after).toHaveAccessibleName("Check in Deniz (1)");
  });

  it("a_reading_that_adds_the_balance_column_keeps_the_focused_check_in", () => {
    // The first check-in of the day gives a row a Folio, and the Balance
    // column appears in the same reading that re-sorts the list.
    const { rerender } = render(table([arrival("Ayşe"), arrival("Deniz")]));
    const button = screen.getByRole("button", { name: /^Check in Deniz/ });
    act(() => button.focus());

    rerender(table([arrival("Deniz"), { ...arrival("Ayşe"), folioId: "f-1" }]));

    expect(screen.getByRole("button", { name: /^Check in Deniz/ })).toBe(
      button,
    );
    expect(button).toHaveFocus();
  });
});
