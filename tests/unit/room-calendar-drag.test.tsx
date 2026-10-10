/**
 * The pointer side of dragging a bar on the room calendar (RC-S3-01, RC-S3-10,
 * RC-S3-13, RC-S3-16): who is given a grip at all, what a release hands on,
 * and what leaves the bar where it was.
 *
 * jsdom has no layout, so the page's own answer to "which row and which day is
 * under the pointer" is replaced by a grid of fixed cells; the browser spec
 * proves the real one.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";
import type {
  RoomCalendar,
  RoomCalendarReservationBar,
  RoomCalendarUnit,
} from "../../packages/ranza/reservations/src";
import "@testing-library/jest-dom/vitest";

const { CalendarGrid } =
  await import("../../apps/operator-workspace/src/features/room-calendar/components/calendar-grid");
const { calendarRows } =
  await import("../../apps/operator-workspace/src/features/room-calendar/layout");
const { parseView } =
  await import("../../apps/operator-workspace/src/features/room-calendar/view");
import type { MoveRequest } from "../../apps/operator-workspace/src/features/room-calendar/move";

const TODAY = "2026-09-24";
const FROM = "2026-09-21";
const DAYS = 14;
const day = (index: number) => {
  const moved = new Date(`${FROM}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + index);
  return moved.toISOString().slice(0, 10);
};

const BOOKING: RoomCalendarReservationBar = {
  kind: "reservation",
  reservationId: "reservation-1",
  reference: "RES-0001",
  expectedArrival: null,
  status: "confirmed",
  stayType: "guest",
  guestName: "Ada Lovelace",
  startsOn: day(4),
  endsOn: day(6),
  heldUntil: day(6),
  overdue: false,
  holds: true,
  overlaps: false,
  clashesWith: null,
  bookedWhileBlocked: false,
};

function room(name: string, bars: RoomCalendarUnit["bars"] = []) {
  return {
    unitId: `unit-${name}`,
    name,
    unitType: "room",
    building: null,
    floor: null,
    status: "available",
    statusReason: null,
    sellable: true,
    bars,
    beds: [],
  } satisfies RoomCalendarUnit;
}

const CALENDAR: RoomCalendar = {
  today: TODAY,
  from: FROM,
  days: DAYS,
  sellable: 2,
  nights: Array.from({ length: DAYS }, (_, i) => ({ day: day(i), free: 2 })),
  overlaps: 0,
  bookedWhileBlocked: 0,
  mayAmend: true,
  units: [room("101", [BOOKING]), room("102")],
};

const onDrop = vi.fn<(request: MoveRequest) => void>();
const onOpen = vi.fn();

beforeEach(() => {
  // A fixed grid: x is ten pixels a day from the window's first, y ten pixels a row.
  document.elementsFromPoint = (x: number, y: number) => {
    const row = document.querySelectorAll("[data-unit-id]")[Math.floor(y / 10)];
    const cell = row?.querySelectorAll("[data-day]")[Math.floor(x / 10)];
    return [cell, row].filter((element): element is Element => !!element);
  };
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  onDrop.mockReset();
  onOpen.mockReset();
});

function renderGrid(mayAmend: boolean) {
  const rows = calendarRows(CALENDAR, parseView({}, {}, [7, 14, 30], 14));
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <CalendarGrid
        calendar={CALENDAR}
        locale="en"
        mayAmend={mayAmend}
        onDrop={onDrop}
        onOpen={onOpen}
        onToggleBeds={() => undefined}
        rows={rows}
        updating={false}
      />
    </NextIntlClientProvider>,
  );
  return screen.getByRole("button", { name: /^Ada Lovelace/ });
}

function press(
  target: Element,
  at: { x: number; y: number },
  pointerType = "mouse",
) {
  fireEvent.pointerDown(target, {
    button: 0,
    pointerId: 1,
    pointerType,
    clientX: at.x,
    clientY: at.y,
  });
}

function travel(target: Element, to: { x: number; y: number }) {
  fireEvent.pointerMove(target, {
    pointerId: 1,
    pointerType: "mouse",
    clientX: to.x,
    clientY: to.y,
  });
}

function release(target: Element, at: { x: number; y: number }) {
  fireEvent.pointerUp(target, {
    pointerId: 1,
    pointerType: "mouse",
    clientX: at.x,
    clientY: at.y,
  });
}

// Over day 5 of the first row: inside the bar, which runs from day 4 to day 6.
const GRAB = { x: 55, y: 5 };
// Day 6 of the second row.
const DROP = { x: 65, y: 15 };

describe("RC-S3-10: only somebody who may amend is given a grip", () => {
  it("a viewer without front_desk.amend has no hint, no end grip, and a drag hands nothing on", () => {
    const bar = renderGrid(false);
    expect(bar.getAttribute("title")).not.toMatch(/drag/i);
    expect(document.querySelector("[data-end-handle]")).toBeNull();

    press(bar, GRAB);
    travel(bar, DROP);
    expect(document.querySelector("[data-drop-ghost]")).toBeNull();
    release(bar, DROP);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("a viewer who may amend is told the bar can be dragged and is given its end", () => {
    const bar = renderGrid(true);
    expect(bar.getAttribute("title")).toMatch(/drag/i);
    expect(document.querySelector("[data-end-handle]")).not.toBeNull();
  });
});

describe("RC-S3-01: a release hands the proposal on, and a plain click opens the drawer", () => {
  it("dropped on another row and day, the booking asks to go there, keeping its length", () => {
    const bar = renderGrid(true);
    press(bar, GRAB);
    travel(bar, DROP);
    expect(document.querySelector("[data-drop-ghost]")).not.toBeNull();
    release(bar, DROP);

    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop.mock.calls[0]![0]).toMatchObject({
      kind: "booking",
      target: { unitId: "unit-102", startsOn: day(5), endsOn: day(7) },
    });
    expect(document.querySelector("[data-drop-ghost]")).toBeNull();
    // The click a release leaves behind must not open the drawer.
    fireEvent.click(bar);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("a press that does not travel is a click", () => {
    const bar = renderGrid(true);
    press(bar, GRAB);
    travel(bar, { x: GRAB.x + 2, y: GRAB.y });
    release(bar, GRAB);
    fireEvent.click(bar);
    expect(onDrop).not.toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("put back where it was, the booking proposes nothing", () => {
    const bar = renderGrid(true);
    press(bar, GRAB);
    travel(bar, { x: GRAB.x + 1, y: GRAB.y + 6 });
    travel(bar, GRAB);
    travel(bar, { x: GRAB.x + 1, y: GRAB.y - 2 });
    release(bar, GRAB);
    expect(onDrop).not.toHaveBeenCalled();
  });
});

describe("RC-S3-16: Escape drops a drag in progress", () => {
  it("the outline goes, and the release hands nothing on", () => {
    const bar = renderGrid(true);
    press(bar, GRAB);
    travel(bar, DROP);
    expect(document.querySelector("[data-drop-ghost]")).not.toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.querySelector("[data-drop-ghost]")).toBeNull();
    release(bar, DROP);
    expect(onDrop).not.toHaveBeenCalled();
  });
});

describe("RC-S3-13: a finger on a bar is a swipe, so a touch screen moves a booking from its details", () => {
  it("a touch never starts a drag", () => {
    const bar = renderGrid(true);
    press(bar, GRAB, "touch");
    travel(bar, DROP);
    expect(document.querySelector("[data-drop-ghost]")).toBeNull();
    release(bar, DROP);
    expect(onDrop).not.toHaveBeenCalled();
  });
});
