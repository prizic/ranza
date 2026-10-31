/**
 * The room calendar as a dormitory's term board, and the block and gender
 * chips over it (RC-S7-03, RC-S7-05).
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
import { messages } from "../../apps/operator-workspace/src/messages";
import { frontOfficeKeys } from "../../apps/operator-workspace/src/features/front-office/query-keys";
import type {
  RoomCalendar,
  RoomCalendarUnit,
} from "../../packages/ranza/reservations/src";

vi.mock(
  "../../apps/operator-workspace/node_modules/next/navigation.js",
  async (original) => ({
    ...(await original<Record<string, unknown>>()),
    useSearchParams: () => new URLSearchParams({ property: "p-1" }),
  }),
);
vi.mock("../../apps/operator-workspace/src/server/front-office", () => ({
  changeDeparture: vi.fn(),
}));

const { QueryProvider } =
  await import("../../apps/operator-workspace/src/app/providers/query-provider");
const { Hydrated, requestQueryClient } =
  await import("../../apps/operator-workspace/src/app/providers/hydrate");
const { LiveRoomCalendar } =
  await import("../../apps/operator-workspace/src/features/room-calendar/components/live-room-calendar");

const scope = {
  organizationId: "org-1",
  propertyId: "dc000003-0000-4000-8000-000000000001",
  userId: "user-1",
};
const DAYS = 305;
const FROM = "2026-09-01";

function day(index: number): string {
  return new Date(Date.UTC(2026, 8, 1 + index)).toISOString().slice(0, 10);
}

function room(
  unitId: string,
  name: string,
  building: string,
  admits: "female" | "male",
  booked: boolean,
): RoomCalendarUnit {
  return {
    unitId,
    name,
    unitType: "room",
    building,
    floor: 1,
    status: "available",
    statusReason: null,
    admits,
    sellable: true,
    beds: [],
    bars: booked
      ? [
          {
            kind: "reservation",
            reservationId: `res-${unitId}`,
            reference: "R1",
            expectedArrival: null,
            status: "confirmed",
            stayType: "resident",
            guestName: `Resident ${name}`,
            startsOn: "2026-09-15",
            endsOn: "2027-06-15",
            heldUntil: "2027-06-15",
            overdue: false,
            overlaps: false,
            clashesWith: null,
            bookedWhileBlocked: false,
            holds: true,
          },
        ]
      : [],
  };
}

const CALENDAR: RoomCalendar = {
  today: "2026-10-31",
  from: FROM,
  days: DAYS,
  sellable: 4,
  nights: Array.from({ length: DAYS }, (_, i) => ({
    day: day(i),
    free: 2,
    booked: 2,
  })),
  overlaps: 0,
  bookedWhileBlocked: 0,
  mayAmend: true,
  // Free tonight: A-102 and B-102, by the Rooms read's own definition.
  freeTonight: ["a2", "b2"],
  units: [
    room("a1", "A-101", "Blok A", "female", true),
    room("a2", "A-102", "Blok A", "female", false),
    room("b1", "B-101", "Blok B", "male", true),
    room("b2", "B-102", "Blok B", "male", false),
  ],
};

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

function renderTerm(
  options: { search?: Partial<Record<string, string>>; days?: number } = {},
) {
  const prefetched = requestQueryClient();
  prefetched.setQueryData(
    frontOfficeKeys.roomCalendar(scope, { from: null, days: DAYS }),
    CALENDAR,
  );
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <QueryProvider scope={scope.userId}>
        <Hydrated client={prefetched}>
          <LiveRoomCalendar
            booking={null}
            defaultLength={DAYS}
            initialView={{
              from: null,
              days: DAYS,
              floor: null,
              unitType: null,
              unitState: null,
              block: options.search?.block ?? null,
              admits: (options.search?.admits as "female") ?? null,
              showRequested: true,
              showDeparted: true,
              search: "",
              overlapsOnly: false,
              collapsed: [],
            }}
            lengths={[7, 14, 30, DAYS]}
            locale="en"
            scope={scope}
          />
        </Hydrated>
      </QueryProvider>
    </NextIntlClientProvider>,
  );
}

describe("a term board (RC-S7-03)", () => {
  it("heads the window by month, September to July, and draws no cell for a day", () => {
    renderTerm();
    const headings = screen
      .getAllByRole("columnheader")
      .map((heading) => heading.textContent);
    expect(headings).toContain("Sep 2026");
    expect(headings).toContain("Jan 2027");
    expect(headings).toContain("Jun");
    expect(document.querySelectorAll("[data-day]")).toHaveLength(0);
  });

  it("says what the free row counts and what it does not offer", () => {
    renderTerm();
    expect(
      screen.getByRole("rowheader", { name: "Free all month" }),
    ).toBeVisible();
    expect(
      screen.getByText(/Open a booking to move it or change its departure/),
    ).toBeInTheDocument();
  });

  it("draws the ten-month booking as one bar, with no grip to pull its end", () => {
    renderTerm();
    const bars = document.querySelectorAll("[data-bar-key]");
    expect(bars).toHaveLength(2);
    // The viewer may amend; at this scale nothing is dragged all the same.
    expect(document.querySelectorAll("[data-end-handle]")).toHaveLength(0);
    expect(bars[0]).not.toHaveClass("cursor-grab");
  });

  it("marks the Term length as the one shown", () => {
    renderTerm();
    expect(
      screen.getByRole("button", { name: "Term", pressed: true }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous term" })).toBeVisible();
  });
});

describe("block and gender chips (RC-S7-05)", () => {
  it("count the empty beds each would leave, from the places the Rooms read says are free", () => {
    renderTerm();
    const blocks = screen.getByRole("group", { name: "Building" });
    expect(
      within(blocks).getByRole("button", { name: /^All buildings\s*2$/ }),
    ).toBeVisible();
    expect(
      within(blocks).getByRole("button", { name: /^Blok A\s*1$/ }),
    ).toBeVisible();
    const admits = screen.getByRole("group", { name: "Rooms for" });
    expect(
      within(admits).getByRole("button", { name: /^Men only\s*1$/ }),
    ).toBeVisible();
    expect(
      within(admits).getByRole("button", { name: /^Anyone\s*0$/ }),
    ).toBeVisible();
  });

  it("narrow the rows, say so in words with the count, and Show all takes it back", () => {
    renderTerm();
    fireEvent.click(screen.getByRole("button", { name: /^Blok B/ }));
    expect(screen.queryByText("A-101")).not.toBeInTheDocument();
    expect(screen.getByText("B-101")).toBeVisible();
    expect(screen.getByTestId("list-filter-notice")).toHaveTextContent(
      "2 rooms in Blok B",
    );
    expect(window.location.search).toContain("block=Blok+B");
    // The other group's counts are given the block: women in Blok B are none.
    expect(
      screen.getByRole("button", { name: /^Women only\s*0$/ }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByText("A-101")).toBeVisible();
    expect(screen.queryByTestId("list-filter-notice")).not.toBeInTheDocument();
    expect(window.location.search).not.toContain("block=");
  });

  it("combines both, and counts the free row over the rooms left", () => {
    renderTerm({ search: { block: "Blok A", admits: "female" } });
    expect(screen.getByTestId("list-filter-notice")).toHaveTextContent(
      "1 free tonight in Blok A, in rooms for women only",
    );
    const freeRow = screen.getByRole("rowheader", { name: "Free all month" })
      .parentElement as HTMLElement;
    // Two rooms in the block, one booked all term: one free, not the house's two.
    expect(within(freeRow).getAllByRole("cell")[0]).toHaveTextContent("1");
  });

  it("offer no count when the Rooms read could not say, rather than a wrong one", () => {
    const { freeTonight: _unknown, ...withoutCounts } = CALENDAR;
    const prefetched = requestQueryClient();
    prefetched.setQueryData(
      frontOfficeKeys.roomCalendar(scope, { from: null, days: DAYS }),
      withoutCounts,
    );
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <QueryProvider scope={scope.userId}>
          <Hydrated client={prefetched}>
            <LiveRoomCalendar
              booking={null}
              defaultLength={DAYS}
              initialView={{
                from: null,
                days: DAYS,
                floor: null,
                unitType: null,
                unitState: null,
                block: null,
                admits: null,
                showRequested: true,
                showDeparted: true,
                search: "",
                overlapsOnly: false,
                collapsed: [],
              }}
              lengths={[7, 14, 30, DAYS]}
              locale="en"
              scope={scope}
            />
          </Hydrated>
        </QueryProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: "Blok A" })).toBeVisible();
  });
});
