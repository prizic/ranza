/**
 * The three dialogs a drop opens, started on what was proposed (RC-S3-01,
 * RC-S3-04, RC-S3-07, RC-S3-08).
 *
 * Each is the dialog of its own command, so what they decide for themselves is
 * tested beside them (change-booking, move-guest, change-departure). What a
 * drop adds is only this: they start on the proposal instead of the booking as
 * it stands, they say From → To, and they will not save while the calendar
 * knows a reason — even when the preview, which is the database's answer, is
 * silent about it. That last one is the part no other test reaches, because in
 * life the preview agrees; it is the calendar's word standing on its own.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type {
  ChangePreview,
  DeparturePreview,
  MovePreview,
} from "../../packages/ranza/reservations/src";
import { messages } from "../../apps/operator-workspace/src/messages";
import "@testing-library/jest-dom/vitest";

vi.mock("../../apps/operator-workspace/src/server/front-office", () => ({
  changeBooking: vi.fn(),
  moveGuest: vi.fn(),
  changeDeparture: vi.fn(),
}));

const { ChangeBookingDialog } =
  await import("../../apps/operator-workspace/src/features/front-office/components/change-booking-dialog");
const { MoveGuestDialog } =
  await import("../../apps/operator-workspace/src/features/front-office/components/move-guest-dialog");
const { ChangeDepartureDialog } =
  await import("../../apps/operator-workspace/src/features/front-office/components/change-departure-dialog");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeAll(() => {
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = Observer as unknown as typeof ResizeObserver;
  window.matchMedia = (() => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

function answering(body: unknown) {
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ kind: "preview", preview: body })),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const t = messages.en;
const submitted = (name: string) => {
  const form = document.querySelector("form");
  return form ? new FormData(form).get(name) : null;
};
const inSummary = () => document.querySelector("[data-move-summary]");
const reasons = () =>
  [...document.querySelectorAll("[data-move-conflicts] li")].map(
    (item) => item.textContent,
  );

describe("RC-S3-01 and RC-S3-04: Change booking opened by a drop", () => {
  const BOOKING = {
    reservationId: "d9100003-0000-4000-8000-000000000001",
    reference: "RABC123",
    guestName: "Ayşe Yılmaz",
    unitLabel: "101",
    unitId: "u101",
    startsOn: "2026-10-05",
    endsOn: "2026-10-07",
    expectedArrival: null,
  };

  function preview(overrides: Partial<ChangePreview> = {}): ChangePreview {
    const free = {
      roomName: null,
      unitType: "room" as const,
      sameKind: true,
      takesBookings: true,
      blocker: null,
      conflictReference: null,
      nightlyRateMinor: 150000,
      rateCurrency: "TRY",
    };
    return {
      reservationId: BOOKING.reservationId,
      reference: BOOKING.reference,
      stayType: "guest",
      startsOn: BOOKING.startsOn,
      endsOn: BOOKING.endsOn,
      expectedArrival: null,
      unitId: "u101",
      nightlyRateMinor: 150000,
      rateCurrency: "TRY",
      today: "2026-09-28",
      version: 3,
      options: [
        { ...free, unitId: "u101", unitName: "101", current: true },
        { ...free, unitId: "u102", unitName: "102", current: false },
      ],
      ...overrides,
    };
  }

  function drop(conflictsFor: (target: unknown) => string[] = () => []) {
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ChangeBookingDialog
          booking={BOOKING}
          locale="en"
          move={{
            to: {
              unitId: "u102",
              startsOn: "2026-10-06",
              endsOn: "2026-10-08",
            },
            conflictsFor,
          }}
          onOpenChange={() => {}}
          open
        />
      </NextIntlClientProvider>,
    );
  }

  const confirm = () =>
    screen.getByRole("button", { name: t.roomCalendar.confirmMove });

  it("starts on the Unit and nights dropped on, says From → To, and saves them with the version it read", async () => {
    const fetch = answering(preview());
    drop();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url] = fetch.mock.calls[0] as unknown as [string];
    expect(url).toContain("from=2026-10-06");
    expect(url).toContain("to=2026-10-08");

    await waitFor(() => expect(confirm()).toBeEnabled());
    expect(
      screen.getByRole("heading", { name: t.roomCalendar.moveBooking }),
    ).toBeInTheDocument();
    expect(inSummary()?.textContent).toContain("101");
    expect(inSummary()?.textContent).toContain("102");
    expect(submitted("unit")).toBe("u102");
    expect(submitted("startsOn")).toBe("2026-10-06");
    expect(submitted("endsOn")).toBe("2026-10-08");
    expect(submitted("version")).toBe("3");
  });

  it("will not save while the calendar knows a reason, though the preview says the Unit is free", async () => {
    answering(preview());
    drop(() => ["Ada Lovelace has booked some of those nights."]);
    await screen.findByText("Ada Lovelace has booked some of those nights.");
    expect(reasons()).toEqual([
      "Ada Lovelace has booked some of those nights.",
    ]);
    // The database's own words for the same nights are not said twice.
    expect(
      screen.queryByText(/holds some of those nights/),
    ).not.toBeInTheDocument();
    // Long enough for the preview to land: it is the reason that holds the button.
    await waitFor(() =>
      expect(document.querySelector('input[name="version"]')).toHaveValue("3"),
    );
    expect(confirm()).toBeDisabled();
  });

  it("is asked about the nights as they stand in the dialog, not as they were dropped", async () => {
    answering(preview());
    const conflictsFor = vi.fn(() => [] as string[]);
    drop(conflictsFor);
    await waitFor(() => expect(confirm()).toBeEnabled());
    expect(conflictsFor).toHaveBeenCalledWith({
      unitId: "u102",
      startsOn: "2026-10-06",
      endsOn: "2026-10-08",
    });
  });

  it("drops the proposal when the booking changed after the calendar drew it, and says so", async () => {
    answering(preview({ startsOn: "2026-10-09", endsOn: "2026-10-11" }));
    drop();
    expect(await screen.findByText(t.changeBookingChanged)).toBeInTheDocument();
    await waitFor(() => expect(submitted("startsOn")).toBe("2026-10-09"));
    expect(submitted("unit")).toBe("u101");
  });
});

describe("RC-S3-07: Move Guest opened by a drop", () => {
  const STAY = {
    stayId: "d9300003-0000-4000-8000-000000000001",
    guestName: "Ayşe Yılmaz",
    unitLabel: "101",
  };

  const preview: MovePreview = {
    stayId: STAY.stayId,
    reference: "RABC123",
    unitId: "u101",
    unitType: "room",
    startsOn: "2026-09-26",
    endsOn: "2026-09-30",
    nightlyRateMinor: 150000,
    rateCurrency: "TRY",
    version: 1,
    options: [
      {
        unitId: "u102",
        unitName: "102",
        roomName: null,
        unitType: "room",
        sameKind: true,
        blocker: null,
        conflictReference: null,
        ready: true,
      },
    ],
  };

  function drop(conflictsFor: (unitId: string) => string[] = () => []) {
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <MoveGuestDialog
          locale="en"
          move={{ unitId: "u102", conflictsFor }}
          onOpenChange={() => {}}
          open
          stay={STAY}
        />
      </NextIntlClientProvider>,
    );
  }

  const confirm = () =>
    screen.getAllByRole("button", { name: t.moveGuest }).at(-1)!;

  async function giveAReason() {
    fireEvent.click(
      await screen.findByRole("radio", { name: t.moveReason.guest_request }),
    );
  }

  it("starts on the Unit dropped on and still asks for a reason", async () => {
    answering(preview);
    drop();
    await waitFor(() => expect(submitted("unit")).toBe("u102"));
    expect(inSummary()?.textContent).toContain("101");
    expect(inSummary()?.textContent).toContain("102");
    expect(confirm()).toBeDisabled();
    await giveAReason();
    await waitFor(() => expect(confirm()).toBeEnabled());
    expect(submitted("reason")).toBe("guest_request");
  });

  it("will not save while the calendar knows a reason, though the preview says the Unit is free", async () => {
    answering(preview);
    drop(() => ["Ada Lovelace has booked some of those nights."]);
    await screen.findByText("Ada Lovelace has booked some of those nights.");
    await giveAReason();
    await waitFor(() =>
      expect(document.querySelector('input[name="version"]')).toHaveValue("1"),
    );
    expect(confirm()).toBeDisabled();
  });
});

describe("RC-S3-08: Change departure opened by a pull", () => {
  const STAY = {
    stayId: "d9200003-0000-4000-8000-000000000001",
    reference: "RABC123",
    guestName: "Ayşe Yılmaz",
    unitLabel: "101",
    startsOn: "2026-09-26",
    endsOn: "2026-09-30",
  };

  const preview: DeparturePreview = {
    stayId: STAY.stayId,
    reference: STAY.reference,
    stayType: "guest",
    startsOn: STAY.startsOn,
    endsOn: STAY.endsOn,
    unitId: "u101",
    nightlyRateMinor: 150000,
    rateCurrency: "TRY",
    today: "2026-09-28",
    version: 1,
    blocker: null,
    conflictReference: null,
  };

  function pull(conflictsFor: (endsOn: string | null) => string[] = () => []) {
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ChangeDepartureDialog
          locale="en"
          move={{ endsOn: "2026-10-02", conflictsFor }}
          onOpenChange={() => {}}
          open
          stay={STAY}
        />
      </NextIntlClientProvider>,
    );
  }

  const confirm = () => screen.getByRole("button", { name: t.saveDeparture });

  it("starts on the day pulled to, with the extra nights said", async () => {
    const fetch = answering(preview);
    pull();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url] = fetch.mock.calls[0] as unknown as [string];
    expect(url).toContain("to=2026-10-02");
    await waitFor(() => expect(confirm()).toBeEnabled());
    expect(inSummary()?.textContent).toContain("Oct 2");
    expect(
      await screen.findByText(/2 more nights/, undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(submitted("endsOn")).toBe("2026-10-02");
  });

  it("will not save while the calendar knows a reason, though the preview says nothing is in the way", async () => {
    answering(preview);
    pull(() => ["Ada Lovelace has booked some of those nights."]);
    await screen.findByText("Ada Lovelace has booked some of those nights.");
    await waitFor(() =>
      expect(document.querySelector('input[name="version"]')).toHaveValue("1"),
    );
    expect(confirm()).toBeDisabled();
  });
});
