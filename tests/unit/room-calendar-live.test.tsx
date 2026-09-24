/**
 * The live room calendar when a read fails (RC-S1-52, RC-S1-53).
 *
 * A window that cannot be opened must not leave the address, the toolbar and
 * the grid disagreeing, and the notice must carry the time of the calendar
 * actually shown — not the time of a read that never succeeded, which for a
 * new window is zero, the epoch.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatTime } from "../../packages/i18n/src";
import { messages } from "../../apps/operator-workspace/src/messages";
import { frontOfficeKeys } from "../../apps/operator-workspace/src/features/front-office/query-keys";
import type {
  RoomCalendar,
  RoomCalendarBar,
  RoomCalendarUnit,
} from "../../packages/ranza/reservations/src";

// The rail carries the Property onto every link from the URL's query, which
// outside Next's router has no search params to read. Mocked at the path the
// application resolves it from: the root package has no Next of its own.
vi.mock(
  "../../apps/operator-workspace/node_modules/next/navigation.js",
  async (original) => ({
    ...(await original<Record<string, unknown>>()),
    useSearchParams: () => new URLSearchParams({ property: "p-1" }),
  }),
);

// The application's own providers, so the retry policy and the hydration a
// page uses are the ones under test rather than a test's own.
const { QueryProvider } =
  await import("../../apps/operator-workspace/src/app/providers/query-provider");
const { Hydrated, requestQueryClient } =
  await import("../../apps/operator-workspace/src/app/providers/hydrate");
const { default: RoomCalendarError } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/room-calendar/error");
const { useWorkspaceNav } =
  await import("../../apps/operator-workspace/src/lib/nav");
const { LiveRoomCalendar } =
  await import("../../apps/operator-workspace/src/features/room-calendar/components/live-room-calendar");

const scope = {
  organizationId: "org-1",
  propertyId: "dc000003-0000-4000-8000-000000000001",
  userId: "user-1",
};

const CALENDAR: RoomCalendar = {
  today: "2026-09-24",
  from: "2026-09-21",
  days: 14,
  sellable: 1,
  nights: Array.from({ length: 14 }, (_, i) => ({
    day: `2026-${i < 10 ? "09" : "10"}-${String(i < 10 ? 21 + i : i - 9).padStart(2, "0")}`,
    free: 1,
  })),
  overlaps: 0,
  bookedWhileBlocked: 0,
  units: [
    {
      unitId: "dc000004-0000-4000-8000-000000000001",
      name: "101",
      unitType: "room",
      building: null,
      floor: null,
      status: "available",
      statusReason: null,
      sellable: true,
      bars: [],
      beds: [],
    },
  ],
};

beforeEach(() => {
  // Retries back off and the poll waits thirty seconds; both run on these.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 500 })),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

/** What the notice would say if it formatted a read that never happened. */
const EPOCH = formatTime(
  0,
  "en",
  Intl.DateTimeFormat().resolvedOptions().timeZone,
);

function renderCalendar(
  calendar: RoomCalendar = CALENDAR,
  locale: "en" | "ar" = "en",
): void {
  const prefetched = requestQueryClient();
  prefetched.setQueryData(
    frontOfficeKeys.roomCalendar(scope, { from: null, days: 14 }),
    calendar,
  );
  render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <QueryProvider scope={scope.userId}>
        <Hydrated client={prefetched}>
          <LiveRoomCalendar
            defaultLength={14}
            initialView={{
              from: null,
              days: 14,
              floor: null,
              showRequested: true,
              showDeparted: true,
              search: "",
              overlapsOnly: false,
              collapsed: [],
            }}
            lengths={[7, 14, 30]}
            locale={locale}
            propertyName="Calendar Property"
            scope={scope}
          />
        </Hydrated>
      </QueryProvider>
    </NextIntlClientProvider>,
  );
}

/** Past every retry's back-off, and past one poll. */
async function letTimePass(): Promise<void> {
  await act(() => vi.advanceTimersByTimeAsync(40_000));
}

describe("a window that cannot be opened", () => {
  it("RC-S1-52: is put back, URL and toolbar with it, and the screen says so", async () => {
    renderCalendar();
    const RANGE = "Sep 21, 2026 – Oct 4, 2026";
    expect(screen.getByText(RANGE)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    await letTimePass();

    expect(
      await screen.findByText(/That window couldn't be opened/),
    ).toBeInTheDocument();
    // The window shown is the one the address names.
    await waitFor(() => expect(window.location.search).not.toMatch(/from=/));
    expect(screen.getByText(RANGE)).toBeInTheDocument();
    // RC-S1-53: the time is the shown calendar's, never the epoch. Sabotaged,
    // this does not go red, and that is recorded rather than hidden: once the
    // window is put back the notice renders against the old window's query,
    // whose own read time is right too, so the revert above is what binds.
    // Keeping the read time with the calendar guards only the one render
    // before the revert lands.
    expect(
      screen.getByText(/That window couldn't be opened/).textContent,
    ).not.toContain(EPOCH);
    expect(screen.getByRole("button", { name: "14 days" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("RC-S1-53: a failed poll keeps the calendar and names the time it was read", async () => {
    renderCalendar();
    await letTimePass();
    const notice = await screen.findByText(/Couldn't refresh/);
    expect(notice.textContent).not.toContain(EPOCH);
    expect(screen.getByRole("rowheader", { name: "101" })).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });
});

function withUnits(units: RoomCalendarUnit[]): RoomCalendar {
  return { ...CALENDAR, units };
}

function room(
  name: string,
  overrides: Partial<RoomCalendarUnit> = {},
): RoomCalendarUnit {
  return {
    ...CALENDAR.units[0]!,
    unitId: crypto.randomUUID(),
    name,
    ...overrides,
  };
}

const ADA: RoomCalendarBar = {
  kind: "reservation",
  reservationId: crypto.randomUUID(),
  status: "confirmed",
  stayType: "guest",
  guestName: "Ada Lovelace",
  startsOn: "2026-09-24",
  endsOn: "2026-09-26",
  heldUntil: "2026-09-26",
  overdue: false,
  holds: true,
  overlaps: false,
  clashesWith: null,
  bookedWhileBlocked: false,
};

describe("what the screen says", () => {
  it("RC-S1-50: a Property with no rooms says so, and points to Rooms & beds", () => {
    renderCalendar(withUnits([]));
    expect(screen.getByText("No rooms yet")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to Rooms & beds" }),
    ).toHaveAttribute("href", `/en/rooms?property=${scope.propertyId}`);
  });

  it("RC-S1-51: an empty window says nothing is booked, between its first and last day", () => {
    renderCalendar();
    expect(
      screen.getByText("Nothing is booked from Sep 21, 2026 to Oct 4, 2026."),
    ).toBeInTheDocument();
  });

  it("RC-S1-40: fold all beds keeps each room's row with beds taken per night, and shows them again", () => {
    const dorm = room("D-1", {
      sellable: false,
      beds: [room("A", { unitType: "bed" }), room("B", { unitType: "bed" })],
    });
    renderCalendar(withUnits([dorm]));
    expect(screen.getByRole("rowheader", { name: "A" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Fold all beds" }));
    expect(screen.queryByRole("rowheader", { name: "A" })).toBeNull();
    expect(screen.getAllByText("0/2")).toHaveLength(14);

    fireEvent.click(screen.getByRole("button", { name: "Show all beds" }));
    expect(screen.getByRole("rowheader", { name: "B" })).toBeInTheDocument();
  });

  it("RC-S1-56: calendar days are not shifted for a reader west of the meridian", () => {
    const zone = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      renderCalendar(CALENDAR, "ar");
      const headers = screen.getAllByRole("columnheader");
      // The first is the room column; the first day is the 21st, not the 20th.
      expect(headers[1]!.textContent).toMatch(/21/);
      expect(headers[1]!.textContent).not.toMatch(/20/);
      cleanup();
      renderCalendar(CALENDAR, "en");
      expect(
        screen.getByText("Sep 21, 2026 – Oct 4, 2026"),
      ).toBeInTheDocument();
    } finally {
      // Assigning undefined would store the string "undefined" and leave every
      // later test in this worker in a zone that does not exist.
      if (zone === undefined) delete process.env.TZ;
      else process.env.TZ = zone;
    }
  });
});

describe("live", () => {
  it("RC-S1-62: with the tab visible, the calendar is read again every 30 seconds", async () => {
    const fetched = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            calendar: withUnits([room("101", { bars: [ADA] })]),
          }),
        ),
    );
    vi.stubGlobal("fetch", fetched);
    renderCalendar();

    // No visibility or focus event anywhere in this test: only the interval
    // can cause a read, so this is the poll and not a refetch on focus.
    await act(() => vi.advanceTimersByTimeAsync(29_000));
    expect(fetched).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(fetched).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("button", { name: /^Ada Lovelace, Confirmed/ }),
    ).toBeInTheDocument();
  });

  it("RC-S1-62: a change elsewhere appears on the next refresh, and a hidden tab does not poll", async () => {
    const fetched = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            calendar: withUnits([room("101", { bars: [ADA] })]),
          }),
        ),
    );
    vi.stubGlobal("fetch", fetched);
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));

    renderCalendar();
    await letTimePass();
    expect(fetched).not.toHaveBeenCalled();

    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await letTimePass();
    expect(fetched).toHaveBeenCalled();
    expect(
      await screen.findByRole("button", { name: /^Ada Lovelace, Confirmed/ }),
    ).toBeInTheDocument();
    visibility.mockRestore();
  });
});

describe("when the page itself fails", () => {
  it("RC-S1-54: the boundary offers a retry and logs the error", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const reset = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <RoomCalendarError
          error={Object.assign(new Error("render failed"), { digest: "d1" })}
          reset={reset}
        />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByText("The room calendar could not be shown"),
    ).toBeInTheDocument();
    expect(logged).toHaveBeenCalledWith(
      "room_calendar.render_failed",
      expect.objectContaining({ digest: "d1" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe("who sees it in the rail", () => {
  const railFor = (entitled: string[]) =>
    // The Property comes from the URL, so there is no default to fall back to.
    renderHook(() => useWorkspaceNav("en", entitled, undefined), {
      wrapper: ({ children }) => (
        <NextIntlClientProvider locale="en" messages={messages.en}>
          {children}
        </NextIntlClientProvider>
      ),
    }).result.current;

  it("RC-S1-43: without front_desk the rail has no Room calendar", () => {
    const labels = JSON.stringify(railFor(["today"]));
    expect(labels).not.toContain("Room calendar");
  });

  it("RC-S1-43: with front_desk it sits under Front Office", () => {
    const frontOffice = railFor(["today", "front_desk"]).find(
      (entry) => "children" in entry && entry.children,
    );
    // And carries the Property, so opening it does not switch Property.
    expect(JSON.stringify(frontOffice)).toContain(
      "/en/room-calendar?property=p-1",
    );
  });
});
