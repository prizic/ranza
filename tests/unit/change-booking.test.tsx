/**
 * The Change booking dialog (amend-booking slice 1).
 *
 * What the dialog decides on its own: what it says about each Unit the preview
 * returns, when it lets the desk save, and that every word exists in every
 * language. Whether a change is allowed is the command's, and is proven in
 * tests/database/amend_booking.test.sql and tests/integration/amend-booking.test.ts.
 *
 * `NOTE` in the dialog restates `CHANGE_NOTE`, so the two are compared here.
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
import { CHANGE_NOTE } from "../../packages/ranza/reservations/src/contracts";
import type { ChangePreview } from "../../packages/ranza/reservations/src";
import { messages } from "../../apps/operator-workspace/src/messages";

vi.mock("../../apps/operator-workspace/src/server/front-office", () => ({
  changeBooking: vi.fn(),
}));

const { changeBooking } = vi.mocked(
  await import("../../apps/operator-workspace/src/server/front-office"),
);

const { ChangeBookingDialog } =
  await import("../../apps/operator-workspace/src/features/front-office/components/change-booking-dialog");

const BOOKING = {
  reservationId: "d9100003-0000-4000-8000-000000000001",
  reference: "RABC123",
  guestName: "Ayşe Yılmaz",
  unitLabel: "101",
  unitId: "u101",
  startsOn: "2026-10-05",
  endsOn: "2026-10-08",
};

function preview(overrides: Partial<ChangePreview> = {}): ChangePreview {
  return {
    reservationId: BOOKING.reservationId,
    reference: BOOKING.reference,
    stayType: "guest",
    startsOn: BOOKING.startsOn,
    endsOn: BOOKING.endsOn,
    unitId: "u101",
    nightlyRateMinor: 150000,
    rateCurrency: "TRY",
    today: "2026-09-28",
    version: 2,
    options: [
      {
        unitId: "u101",
        unitName: "101",
        roomName: null,
        unitType: "room",
        sameKind: true,
        current: true,
        takesBookings: true,
        blocker: null,
        conflictReference: null,
        nightlyRateMinor: 150000,
        rateCurrency: "TRY",
      },
      {
        unitId: "u102",
        unitName: "102",
        roomName: null,
        unitType: "room",
        sameKind: true,
        current: false,
        takesBookings: true,
        blocker: null,
        conflictReference: null,
        nightlyRateMinor: 150000,
        rateCurrency: "TRY",
      },
      {
        unitId: "u104",
        unitName: "104",
        roomName: null,
        unitType: "room",
        sameKind: true,
        current: false,
        takesBookings: true,
        blocker: "booked",
        conflictReference: "RXYZ789",
        nightlyRateMinor: 150000,
        rateCurrency: "TRY",
      },
    ],
    ...overrides,
  };
}

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
});

function answering(body: unknown, status = 200) {
  const fetch = vi.fn(async () =>
    status === 200
      ? new Response(JSON.stringify(body), { status })
      : new Response(null, { status }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function open(locale: "en" | "tr" | "ar" = "en") {
  render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <ChangeBookingDialog
        booking={BOOKING}
        locale={locale}
        onOpenChange={() => {}}
        open
      />
    </NextIntlClientProvider>,
  );
}

const save = () => screen.getByRole("button", { name: messages.en.saveChange });

describe("the Change booking dialog", () => {
  it("the_change_dialog_previews_conflicts_and_price", async () => {
    const fetch = answering({ kind: "preview", preview: preview() });
    open();

    // It asks about the booking's own nights at once, fresh every time.
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`reservation=${BOOKING.reservationId}`);
    expect(url).toContain("from=2026-10-05");
    expect(url).toContain("to=2026-10-08");
    expect(init.cache).toBe("no-store");

    // Unchanged, it has nothing to save and says so.
    expect(
      await screen.findByText(messages.en.changeBookingNothing),
    ).toBeInTheDocument();
    expect(save()).toBeDisabled();

    // The version it was shown travels back with the save.
    expect(
      document.querySelector<HTMLInputElement>('input[name="version"]')?.value,
    ).toBe("2");
    expect(screen.getByText(/as booked/)).toBeInTheDocument();
  });

  it("a_unit_the_preview_says_is_taken_is_not_saved_onto", async () => {
    answering({ kind: "preview", preview: preview() });
    open();
    // 104 is listed as taken, with the booking in the way; choosing it names
    // that booking and the dialog will not save.
    fireEvent.click(
      await screen.findByRole("combobox", { name: messages.en.unit }),
    );
    fireEvent.click(await screen.findByText("Room · Booked · RXYZ789"));
    expect(
      await screen.findByText(/Booking RXYZ789 holds some of those nights/),
    ).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it("an_arrival_is_never_moved_into_the_past", async () => {
    answering({
      kind: "preview",
      preview: preview({ today: "2026-10-06" }),
    });
    open();
    expect(
      await screen.findByText(messages.en.changeBookingBeforeToday),
    ).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it("a_preview_that_could_not_be_read_says_so", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    answering(null, 500);
    open();
    expect(
      await screen.findByText(messages.en.changeBookingLoadFailed),
    ).toBeInTheDocument();
    expect(save()).toBeDisabled();
    // Never silent: the browser's half of the failure is reported too.
    expect(error).toHaveBeenCalledWith(
      "booking_change.preview_failed",
      expect.objectContaining({ reservationId: BOOKING.reservationId }),
    );
    error.mockRestore();
  });

  it("a_booking_that_cannot_be_changed_says_so", async () => {
    answering({ kind: "refused" });
    open();
    expect(
      await screen.findByText(messages.en.changeBookingRefused),
    ).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it("two_changes_to_one_booking_do_not_both_land: a refused save shows the booking as it now stands", async () => {
    // Read at version 2 on 101; somebody else moves it to 5–9 October in 101
    // while this desk chooses 102.
    let calls = 0;
    const fetch = vi.fn(async () => {
      calls += 1;
      const now =
        calls === 1 ? preview() : preview({ endsOn: "2026-10-09", version: 3 });
      return new Response(JSON.stringify({ kind: "preview", preview: now }));
    });
    vi.stubGlobal("fetch", fetch);
    changeBooking.mockResolvedValueOnce("changed");
    open();

    fireEvent.click(
      await screen.findByRole("combobox", { name: messages.en.unit }),
    );
    fireEvent.click(await screen.findByText("102"));
    fireEvent.click(save());
    await waitFor(() => expect(changeBooking).toHaveBeenCalledTimes(1));

    // The desk's own choice is replaced by what stands now, not kept for one
    // more press of Save to overwrite a change nobody here has seen.
    expect(
      await screen.findByText(messages.en.changeBookingChanged),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        document.querySelector<HTMLInputElement>('input[name="version"]')
          ?.value,
      ).toBe("3"),
    );
    expect(
      document.querySelector<HTMLInputElement>('input[name="endsOn"]')?.value,
    ).toBe("2026-10-09");
    expect(
      screen.getByRole("combobox", { name: messages.en.unit }),
    ).toHaveTextContent("101");
    // Once the refused save has settled, nothing is left to save.
    await waitFor(() => expect(save()).toBeDisabled());
  });

  it("a_unit_taken_while_the_dialog_was_open_is_read_again", async () => {
    const fetch = answering({ kind: "preview", preview: preview() });
    changeBooking.mockResolvedValueOnce("unavailable");
    open();
    fireEvent.click(
      await screen.findByRole("combobox", { name: messages.en.unit }),
    );
    fireEvent.click(await screen.findByText("102"));
    fireEvent.click(save());
    expect(
      await screen.findByText(messages.en.bookingUnavailable),
    ).toBeInTheDocument();
    // The preview that said "Free" is asked again rather than trusted.
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });

  it("a read after a refusal that names another version fills the fields again, never just the version", async () => {
    // Read at version 2; the save is refused for its Unit, and the read that
    // follows finds somebody else moved the booking to 5–9 October.
    let calls = 0;
    const fetch = vi.fn(async () => {
      calls += 1;
      const now =
        calls === 1 ? preview() : preview({ endsOn: "2026-10-09", version: 3 });
      return new Response(JSON.stringify({ kind: "preview", preview: now }));
    });
    vi.stubGlobal("fetch", fetch);
    changeBooking.mockResolvedValueOnce("unavailable");
    open();

    fireEvent.click(
      await screen.findByRole("combobox", { name: messages.en.unit }),
    );
    fireEvent.click(await screen.findByText("102"));
    fireEvent.click(save());

    expect(
      await screen.findByText(messages.en.changeBookingChanged),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        document.querySelector<HTMLInputElement>('input[name="endsOn"]')?.value,
      ).toBe("2026-10-09"),
    );
    expect(
      document.querySelector<HTMLInputElement>('input[name="version"]')?.value,
    ).toBe("3");
    expect(
      screen.getByRole("combobox", { name: messages.en.unit }),
    ).toHaveTextContent("101");
    await waitFor(() => expect(save()).toBeDisabled());
  });

  it("a row that was already out of date is replaced by the first read", async () => {
    // The list was rendered before somebody moved the booking to 6–9 October.
    answering({
      kind: "preview",
      preview: preview({
        startsOn: "2026-10-06",
        endsOn: "2026-10-09",
        version: 4,
      }),
    });
    open();
    expect(
      await screen.findByText(messages.en.changeBookingChanged),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        document.querySelector<HTMLInputElement>('input[name="startsOn"]')
          ?.value,
      ).toBe("2026-10-06"),
    );
    expect(
      document.querySelector<HTMLInputElement>('input[name="version"]')?.value,
    ).toBe("4");
    await waitFor(() => expect(save()).toBeDisabled());
  });

  it("after a refill, the next refusal is told as itself", async () => {
    // The first read finds the row stale (version 4, other dates); a later
    // save to 102 is refused for its price, and the read after it is the same
    // version, so the desk is told about the price, not a change underneath.
    let calls = 0;
    const fetch = vi.fn(async () => {
      calls += 1;
      return new Response(
        JSON.stringify({
          kind: "preview",
          preview: preview({
            startsOn: "2026-10-06",
            endsOn: "2026-10-09",
            version: 4,
          }),
        }),
      );
    });
    vi.stubGlobal("fetch", fetch);
    changeBooking.mockResolvedValueOnce("priceChanged");
    open();
    expect(
      await screen.findByText(messages.en.changeBookingChanged),
    ).toBeInTheDocument();

    fireEvent.click(
      await screen.findByRole("combobox", { name: messages.en.unit }),
    );
    fireEvent.click(await screen.findByText("102"));
    await waitFor(() => expect(save()).toBeEnabled());
    fireEvent.click(save());
    expect(
      await screen.findByText(messages.en.bookingPriceChanged),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(messages.en.changeBookingChanged),
    ).not.toBeInTheDocument();
    expect(calls).toBeGreaterThan(1);
  });

  it("a_booking_on_a_room_gone_out_of_order_can_still_change_its_dates", async () => {
    const own = preview().options[0]!;
    answering({
      kind: "preview",
      preview: preview({
        options: [{ ...own, takesBookings: false }],
      }),
    });
    open();
    expect(
      await screen.findByText(messages.en.changeBookingCurrentNotTaking),
    ).toBeInTheDocument();
  });

  it("stops a note at the length the revision will accept", async () => {
    answering({ kind: "preview", preview: preview() });
    open();
    const note = await screen.findByLabelText(messages.en.changeBookingNote);
    expect(note).toHaveAttribute("maxlength", String(CHANGE_NOTE.max));
    expect(note).toHaveAttribute("minlength", String(CHANGE_NOTE.min));
    fireEvent.change(note, { target: { value: "The Guest asked" } });
    expect(note).toHaveValue("The Guest asked");
  });

  it.each(["tr", "ar"] as const)(
    "the_change_dialogs_read_in_every_locale (%s)",
    async (locale) => {
      answering({ kind: "preview", preview: preview() });
      open(locale);
      expect(
        await screen.findByRole("heading", {
          name: messages[locale].changeBooking,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(messages[locale].changeBookingNothing),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: messages[locale].saveChange }),
      ).toBeDisabled();
    },
  );
});
