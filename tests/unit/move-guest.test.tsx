/**
 * The Move Guest dialog (amend-booking slice 3).
 *
 * What the dialog decides on its own: when it lets the desk save, what it
 * says about each Unit and about the price, and that the version it sends is
 * the one it read. Whether a Guest may be moved is `app.move_stay()`'s answer,
 * proven in tests/database/move_stay.test.sql and
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
import type { MovePreview } from "../../packages/ranza/reservations/src";
import { messages } from "../../apps/operator-workspace/src/messages";

vi.mock("../../apps/operator-workspace/src/server/front-office", () => ({
  moveGuest: vi.fn(),
}));

const { moveGuest } = vi.mocked(
  await import("../../apps/operator-workspace/src/server/front-office"),
);
const { MoveGuestDialog } =
  await import("../../apps/operator-workspace/src/features/front-office/components/move-guest-dialog");

const STAY = {
  stayId: "d9300003-0000-4000-8000-000000000001",
  guestName: "Ayşe Yılmaz",
  unitLabel: "101",
};

function option(
  unitId: string,
  unitName: string,
  extra: Partial<MovePreview["options"][number]> = {},
): MovePreview["options"][number] {
  return {
    unitId,
    unitName,
    roomName: null,
    unitType: "room",
    sameKind: true,
    blocker: null,
    conflictReference: null,
    ready: true,
    ...extra,
  };
}

function preview(overrides: Partial<MovePreview> = {}): MovePreview {
  return {
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
      option("u102", "102"),
      option("u103", "103", { ready: false }),
      option("u104", "104", { blocker: "occupied" }),
    ],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  moveGuest.mockReset();
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

function answering(...previews: MovePreview[]) {
  let calls = 0;
  const fetch = vi.fn(async () => {
    const now = previews[Math.min(calls, previews.length - 1)];
    calls += 1;
    return new Response(JSON.stringify({ kind: "preview", preview: now }));
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function open() {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <MoveGuestDialog locale="en" onOpenChange={() => {}} open stay={STAY} />
    </NextIntlClientProvider>,
  );
}

const save = () =>
  screen.getAllByRole("button", { name: messages.en.moveGuest }).at(-1)!;
/** What a submit would send: the form's own entries, however each is rendered. */
const submitted = (name: string) => {
  const form = document.querySelector("form");
  return form ? new FormData(form).get(name) : null;
};

async function chooseUnit(description: RegExp) {
  fireEvent.click(
    await screen.findByRole("combobox", { name: messages.en.unit }),
  );
  fireEvent.click(await screen.findByText(description));
}

async function chooseReason(label: string) {
  fireEvent.click(
    screen.getByRole("combobox", { name: messages.en.moveGuestReason }),
  );
  fireEvent.click(await screen.findByRole("option", { name: label }));
}

describe("the Move Guest dialog", () => {
  it("a_move_keeps_the_booked_price and needs a free, ready Unit and a reason", async () => {
    answering(preview());
    open();
    expect(
      await screen.findByText(
        /1,500\.00 a night, as booked: a move does not change the price/,
      ),
    ).toBeInTheDocument();
    expect(save()).toBeDisabled();

    await chooseUnit(/Room · Free/);
    expect(save()).toBeDisabled();
    await chooseReason(messages.en.moveReason.fault);
    await waitFor(() => expect(save()).toBeEnabled());
    expect(submitted("version")).toBe("1");
    expect(submitted("reason")).toBe("fault");
  });

  it("a_guest_is_moved_only_into_a_ready_room", async () => {
    answering(preview());
    open();
    await chooseUnit(/Room · Not ready/);
    await chooseReason(messages.en.moveReason.guest_request);
    expect(
      await screen.findByText(messages.en.moveGuestNotReady),
    ).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it("a_guest_is_not_moved_into_an_occupied_room", async () => {
    answering(preview());
    open();
    await chooseUnit(/Room · Somebody is staying/);
    await chooseReason(messages.en.moveReason.guest_request);
    expect(
      await screen.findByText(messages.en.changeBookingBlockedOccupied),
    ).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it("a_move_needs_a_reason: another reason is said in the note", async () => {
    answering(preview());
    open();
    await chooseUnit(/Room · Free/);
    await chooseReason(messages.en.moveReason.other);
    expect(
      await screen.findByText(messages.en.moveGuestNoteRequired),
    ).toBeInTheDocument();
    expect(save()).toBeDisabled();
    fireEvent.change(screen.getByLabelText(messages.en.changeBookingNote), {
      target: { value: "Family moved together" },
    });
    await waitFor(() => expect(save()).toBeEnabled());
  });

  it("a refused room keeps the reason and the note the desk gave", async () => {
    answering(preview(), preview());
    moveGuest.mockResolvedValueOnce("notReady");
    open();
    await chooseUnit(/Room · Free/);
    await chooseReason(messages.en.moveReason.other);
    fireEvent.change(screen.getByLabelText(messages.en.changeBookingNote), {
      target: { value: "Family moved together" },
    });
    await waitFor(() => expect(save()).toBeEnabled());
    fireEvent.click(save());
    expect(
      await screen.findByText(messages.en.moveGuestNotReady),
    ).toBeInTheDocument();
    await waitFor(() => expect(submitted("reason")).toBe("other"));
    expect(submitted("note")).toBe("Family moved together");
  });

  it("two_moves_of_one_guest_do_not_both_land: a refused save reads again and clears the choice", async () => {
    answering(preview(), preview({ version: 2 }));
    moveGuest.mockResolvedValueOnce("changed");
    open();
    await chooseUnit(/Room · Free/);
    await chooseReason(messages.en.moveReason.fault);
    await waitFor(() => expect(save()).toBeEnabled());
    fireEvent.click(save());
    expect(
      await screen.findByText(messages.en.changeBookingChanged),
    ).toBeInTheDocument();
    await waitFor(() => expect(submitted("version")).toBe("2"));
    expect(submitted("unit") ?? "").toBe("");
    await waitFor(() => expect(save()).toBeDisabled());
  });
});
