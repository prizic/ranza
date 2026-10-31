/**
 * The Change departure dialog (amend-booking slice 2).
 *
 * What the dialog decides on its own: when it lets the desk save, what it says
 * about the day chosen, and that the version it sends is the one its field
 * describes. Whether a departure may change is `app.change_departure()`'s
 * answer, proven in tests/database/change_departure.test.sql and
 * tests/integration/amend-booking.test.ts.
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
import type { DeparturePreview } from "../../packages/ranza/reservations/src";
import { messages } from "../../apps/operator-workspace/src/messages";

vi.mock("../../apps/operator-workspace/src/server/front-office", () => ({
  changeDeparture: vi.fn(),
}));

const { changeDeparture } = vi.mocked(
  await import("../../apps/operator-workspace/src/server/front-office"),
);
const { ChangeDepartureDialog } =
  await import("../../apps/operator-workspace/src/features/front-office/components/change-departure-dialog");

const STAY = {
  stayId: "d9200003-0000-4000-8000-000000000001",
  reference: "RABC123",
  guestName: "Ayşe Yılmaz",
  unitLabel: "101",
  startsOn: "2026-09-26",
  endsOn: "2026-09-30",
};

function preview(overrides: Partial<DeparturePreview> = {}): DeparturePreview {
  return {
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
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  changeDeparture.mockReset();
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
});

/** Answers each read with the next preview; the last one repeats. */
function answering(...previews: DeparturePreview[]) {
  let calls = 0;
  const fetch = vi.fn(async () => {
    const now = previews[Math.min(calls, previews.length - 1)];
    calls += 1;
    return new Response(JSON.stringify({ kind: "preview", preview: now }));
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function open(stay: typeof STAY = STAY) {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ChangeDepartureDialog
        locale="en"
        onOpenChange={() => {}}
        open
        stay={stay}
      />
    </NextIntlClientProvider>,
  );
}

const save = () =>
  screen.getByRole("button", { name: messages.en.saveDeparture });
const hidden = (name: string) =>
  document.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value;

/** The dialog has read the Stay and opened its field on one more night. */
const ready = () => waitFor(() => expect(hidden("endsOn")).toBe("2026-10-01"));

function pick(iso: string) {
  fireEvent.click(screen.getByRole("button", { name: /^Departure/ }));
  const day = document.querySelector<HTMLButtonElement>(
    `td:not([data-outside]) [data-day="${iso}"]`,
  );
  if (!day) throw new Error(`${iso} is not on the calendar`);
  fireEvent.click(day);
}

describe("the Change departure dialog", () => {
  it("shows the arrival, lets only the departure move, and says what an extension costs", async () => {
    answering(preview());
    open();
    await ready();
    expect(
      screen.queryByRole("button", { name: /^Arrival/ }),
    ).not.toBeInTheDocument();

    pick("2026-10-02");
    expect(
      await screen.findByText(/^2 more nights at .*1,500\.00 each$/),
    ).toBeInTheDocument();
    await waitFor(() => expect(save()).toBeEnabled());
    expect(hidden("endsOn")).toBe("2026-10-02");
    expect(hidden("version")).toBe("1");
  });

  it("an_extension_into_a_booked_night_is_refused before it is saved", async () => {
    answering(
      preview(),
      preview({ blocker: "booked", conflictReference: "RXYZ789" }),
    );
    open();
    await ready();
    pick("2026-10-03");
    expect(
      await screen.findByText(/Booking RXYZ789 holds some of those nights/),
    ).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it("a Guest's departure cleared is asked for, not shown as open-ended", async () => {
    const fetch = answering(preview());
    open();
    await ready();
    const reads = fetch.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: /^Departure/ }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(
      await screen.findByText(messages.en.changeDepartureNeedsEnd),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(messages.en.changeDepartureOpen),
    ).not.toBeInTheDocument();
    expect(save()).toBeDisabled();
    // Nothing is asked about an end the command would refuse anyway.
    expect(fetch.mock.calls.length).toBe(reads);
  });

  it("an_overdue_guest_opens_on_tomorrow_so_the_price_line_is_the_confirm", async () => {
    // Planned to leave the 26th, today is the 28th: the field offers the next
    // day rather than an empty "Open-ended" the desk must open a picker to fill
    // (CALENDAR-05).
    const fetch = answering(preview({ endsOn: "2026-09-26" }));
    open({ ...STAY, endsOn: "2026-09-26" });

    expect(
      await screen.findByText(/^3 more nights at .*1,500\.00 each$/),
    ).toBeInTheDocument();
    expect(hidden("endsOn")).toBe("2026-09-29");
    await waitFor(() => expect(save()).toBeEnabled());
    expect(
      screen.queryByText(messages.en.changeDepartureNeedsEnd),
    ).not.toBeInTheDocument();
    expect(String(fetch.mock.calls.at(-1)?.[0])).toContain("to=2026-09-29");
  });

  it("a Resident's extension is not called free: Finance posts their rent", async () => {
    answering(
      preview({
        stayType: "resident",
        nightlyRateMinor: null,
        rateCurrency: null,
      }),
    );
    open();
    await ready();
    pick("2026-10-02");
    expect(
      await screen.findByText(
        "2 more nights; Finance posts a Resident's rent, not by the night",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/not charged/)).not.toBeInTheDocument();
  });

  it("a Resident's end can be taken away", async () => {
    answering(preview({ stayType: "resident" }));
    open();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /^Departure/ }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(
      await screen.findByText(messages.en.changeDepartureOpen),
    ).toBeInTheDocument();
    await waitFor(() => expect(save()).toBeEnabled());
  });

  it("two_departure_changes_do_not_both_land: a read that names another version refills the field", async () => {
    // Somebody else moves the departure to 4 October while this desk is
    // choosing 2 October: the read after the pick names version 2, and the
    // field is refilled rather than saved over it.
    answering(
      preview(),
      preview(),
      preview({ endsOn: "2026-10-04", version: 2 }),
    );
    open();
    await ready();
    expect(hidden("version")).toBe("1");
    pick("2026-10-02");

    expect(
      await screen.findByText(messages.en.changeBookingChanged),
    ).toBeInTheDocument();
    await waitFor(() => expect(hidden("version")).toBe("2"));
    expect(hidden("endsOn")).toBe("2026-10-04");
    await waitFor(() => expect(save()).toBeDisabled());
  });

  it("a save refused as changed reads the Stay again", async () => {
    const fetch = answering(preview());
    changeDeparture.mockResolvedValueOnce("changed");
    open();
    await ready();
    pick("2026-10-02");
    await waitFor(() => expect(save()).toBeEnabled());
    const reads = fetch.mock.calls.length;
    fireEvent.click(save());
    expect(
      await screen.findByText(messages.en.changeBookingChanged),
    ).toBeInTheDocument();
    await waitFor(() => expect(fetch.mock.calls.length).toBeGreaterThan(reads));
  });

  it("opens_on_one_more_night_priced_and_ready_to_save_without_an_error_under_the_field", async () => {
    answering(preview());
    open();
    await ready();
    expect(
      await screen.findByText(/^1 more night at .*1,500\.00 each$/),
    ).toBeInTheDocument();
    await waitFor(() => expect(save()).toBeEnabled());
    expect(
      screen.queryByText(messages.en.changeDepartureNothing),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(messages.en.changeDepartureHintDate),
    ).not.toBeInTheDocument();

    // Choosing the day it already is answers the choice, and says so.
    fireEvent.click(screen.getByRole("button", { name: /^Departure/ }));
    fireEvent.click(screen.getByRole("button", { name: /previous month/i }));
    fireEvent.click(
      document.querySelector<HTMLButtonElement>(
        'td:not([data-outside]) [data-day="2026-09-30"]',
      )!,
    );
    expect(
      await screen.findByText(messages.en.changeDepartureNothing),
    ).toBeInTheDocument();
    await waitFor(() => expect(save()).toBeDisabled());
  });
});
