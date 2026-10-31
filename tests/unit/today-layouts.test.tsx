/**
 * The desk layouts of Today, as a person sees them
 * (docs/features/today-layouts/edge-cases.csv, interface rows). The summary is
 * given; what is decided here is what each layout does with it, that the choice
 * of layout is kept, and that every locale draws every layout.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryProvider } from "../../apps/operator-workspace/src/app/providers/query-provider";
import {
  Hydrated,
  requestQueryClient,
} from "../../apps/operator-workspace/src/app/providers/hydrate";
import { messages } from "../../apps/operator-workspace/src/messages";
import { dormitoryWords } from "../../apps/operator-workspace/src/words/dormitory";
import { withOverlay } from "../../apps/operator-workspace/src/words/overlay";
import type { SupportedLocale } from "../../packages/i18n/src";
import type {
  ArrivalRow,
  DepartureRow,
  DeskRoom,
  RoomState,
  TodaySummary,
} from "../../apps/operator-workspace/src/server/today-derive";
import { checkInReservation } from "../../apps/operator-workspace/src/server/front-office";
import { TodayDashboard } from "../../apps/operator-workspace/src/features/today/components/today-dashboard";
import {
  layoutCookieName,
  TODAY_LAYOUTS,
  type TodayLayout,
} from "../../apps/operator-workspace/src/features/today/layouts/model";
import { LayoutSwitcher } from "../../apps/operator-workspace/src/features/today/layouts/layout-switcher";
import { hourStepFor } from "../../apps/operator-workspace/src/features/today/layouts/timeline-layout";
import { mergeSummary } from "../../apps/operator-workspace/src/features/today/merge";
import { todayKeys } from "../../apps/operator-workspace/src/features/today/query-keys";

vi.mock("../../apps/operator-workspace/src/server/housekeeping", () => ({
  markRooms: vi.fn(),
}));
vi.mock(
  "../../apps/operator-workspace/src/features/front-office/queries",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../apps/operator-workspace/src/features/front-office/queries")
    >()),
    fetchDepartures: vi.fn(async () => reviews),
  }),
);
vi.mock("../../apps/operator-workspace/src/server/front-office", () => ({
  checkInReservation: vi.fn(),
  checkOutStay: vi.fn(),
}));

const reviews = vi.hoisted((): unknown[] => []);
const PROPERTY = "d0000003-0000-4000-8000-000000000001";
const SCOPE = { userId: "u-1", organizationId: "o", propertyId: PROPERTY };
/** 14:32 at the Property, which is UTC+3. */
const NOW = Date.UTC(2026, 9, 19, 11, 32);

const room = (
  name: string,
  unitType: string,
  state: RoomState,
  guestName: string | null = null,
): DeskRoom => ({
  unitId: `u-${name}`,
  name,
  unitType,
  floor: Number(name[0]),
  state,
  guestName,
  endsOn: guestName ? "2026-10-21" : null,
});

const arrival = (
  guest: string,
  unit: string,
  expected: string | null,
  extra: Partial<ArrivalRow> = {},
): ArrivalRow => ({
  reservationId: `r-${unit}`,
  reference: `REF${unit}`,
  guestName: guest,
  stayType: "guest",
  unit: { unitName: unit, roomName: null },
  startsOn: "2026-10-19",
  endsOn: "2026-10-22",
  state: "ready",
  blocker: null,
  expectedArrival: expected,
  expectedArrivalPassed: false,
  mayCheckIn: true,
  ...extra,
});

const leaving = (
  guest: string,
  unit: string,
  overdue: boolean,
): DepartureRow => ({
  stayId: `s-${unit}`,
  reference: `S${unit}`,
  guestName: guest,
  unit: { unitName: unit, roomName: null },
  endsOn: overdue ? "2026-10-17" : "2026-10-19",
  overdue,
  overdueDays: overdue ? 2 : 0,
  mayCheckOut: false,
});

function summary(overrides: Partial<TodaySummary> = {}): TodaySummary {
  return {
    day: {
      propertyId: PROPERTY,
      propertyName: "Demo Otel İstanbul",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      operatingModel: "hotel",
      businessDate: "2026-10-19",
      calendarDate: "2026-10-19",
      cutoff: "04:00",
    },
    focus: "front_desk",
    mayBook: true,
    occupancy: {
      status: "ok",
      data: {
        sellable: 5,
        available: 5,
        inHouse: 2,
        expectedTonight: 3,
        leavingTonight: 0,
        arrivingTonight: 1,
      },
    },
    attention: { items: [], complete: true },
    desk: {
      status: "ok",
      data: {
        rooms: [
          room("101", "Double", "ready"),
          room("102", "Double", "in_house", "Yılmaz"),
          room("103", "Double", "in_house", "Kaya"),
          room("201", "Double", "awaiting_inspection"),
          room("205", "Twin", "ready"),
          room("207", "Double", "ready"),
          room("305", "Twin", "dirty"),
          room("306", "Twin", "out_of_service"),
        ],
        departed: 1,
        arrivals: [
          arrival("Costa", "205", "14:00", { expectedArrivalPassed: true }),
          arrival("Demir", "201", "16:00", { state: "not_ready" }),
          arrival("Moreau", "305", "20:30", { state: "not_ready" }),
          arrival("Petrov", "207", null),
        ],
        departures: [leaving("Kaya", "103", true)],
        unclosed: {
          status: "ok",
          data: { waiting: 8, oldest: "2026-10-11" },
        },
      },
    },
    ...overrides,
  };
}

function view(
  value: TodaySummary,
  options: {
    layout?: TodayLayout;
    locale?: SupportedLocale;
    nowMs?: number;
  } = {},
) {
  const locale = options.locale ?? "en";
  const nowMs = options.nowMs ?? NOW;
  vi.setSystemTime(nowMs);
  const prefetched = requestQueryClient();
  prefetched.setQueryData(todayKeys.summary(SCOPE), value);
  return render(
    <QueryProvider scope={SCOPE.userId}>
      <Hydrated client={prefetched}>
        <NextIntlClientProvider
          locale={locale}
          messages={
            // The words of the Property it is drawn at, as the app chooses them.
            value.day.operatingModel === "dormitory"
              ? withOverlay(messages[locale], dormitoryWords[locale])
              : messages[locale]
          }
        >
          <TodayDashboard
            clock="14:32"
            greeting="afternoon"
            initialLayout={options.layout ?? "timeline"}
            locale={locale}
            name="Selin"
            nowMs={nowMs}
            properties={[]}
            scope={SCOPE}
          />
        </NextIntlClientProvider>
      </Hydrated>
    </QueryProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
  // The timeline packs arrivals by the width it is given; jsdom has no layout.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 1200,
  });
  // Radix's select measures and scrolls; jsdom does neither.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.cookie = `${layoutCookieName(SCOPE.userId)}=; max-age=0; path=/`;
});

describe("the choice of layout", () => {
  it("is_offered_to_a_desk", () => {
    view(summary());
    expect(
      screen.getByRole("combobox", { name: "Layout" }),
    ).toBeInTheDocument();
  });

  it("a_role_with_no_desk_section_sees_no_switcher_and_the_overview", () => {
    const { desk: _desk, ...without } = summary();
    view(without as TodaySummary);
    expect(screen.queryByRole("combobox", { name: "Layout" })).toBeNull();
    expect(screen.queryByText("Today's flow")).toBeNull();
  });

  it("overview_draws_the_page_as_it_was", () => {
    view(summary(), { layout: "overview" });
    expect(screen.queryByText("Today's flow")).toBeNull();
    expect(screen.queryByText("The house")).toBeNull();
    expect(
      screen.getByRole("combobox", { name: "Layout" }),
    ).toBeInTheDocument();
  });

  it("choosing_one_draws_it_and_keeps_it_in_a_cookie_for_this_staff_member", () => {
    view(summary());
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Layout" }), {
      key: "Enter",
    });
    fireEvent.click(screen.getByRole("option", { name: /House map/ }));
    expect(screen.getByText("The house")).toBeInTheDocument();
    expect(document.cookie).toContain(`${layoutCookieName("u-1")}=house`);
    // And only this Staff Member's: nobody else's key was written.
    expect(document.cookie).not.toContain(layoutCookieName("u-2"));
  });

  it("the_switcher_names_the_layout_on_one_line_before_the_page_is_hydrated", () => {
    // Radix fills the trigger from the chosen item once the page is up, hint
    // and all, which grew the header by a line under the figures' feet on a
    // phone. Rendered on the server, nothing has run yet: the name is there
    // or the trigger is empty.
    for (const locale of ["en", "tr", "ar"] as const) {
      const html = renderToString(
        <NextIntlClientProvider locale={locale} messages={messages[locale]}>
          <LayoutSwitcher onChange={() => {}} value="overview" />
        </NextIntlClientProvider>,
      );
      const trigger = html.match(
        /<button[^>]*role="combobox"[^>]*>.*?<\/button>/,
      );
      const names = messages[locale].todayLayouts.switcher;
      expect(trigger?.[0]).toContain(names.names.overview);
      expect(trigger?.[0]).not.toContain(names.hints.overview);
    }
  });

  it("describes_each_layout_by_what_it_is_for_and_says_where_the_choice_is_kept", () => {
    // TODAY-23: "The cards, as before" and "One thing at a time" said nothing
    // to somebody who had never seen the old page.
    view(summary());
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Layout" }), {
      key: "Enter",
    });
    const list = within(screen.getByRole("listbox"));
    expect(
      list.getByText("The most urgent job, one at a time"),
    ).toBeInTheDocument();
    expect(list.getByText("Close the day and hand over")).toBeInTheDocument();
    expect(
      list.getByText("What needs attention, and the day's figures"),
    ).toBeInTheDocument();
    expect(screen.getByText("Saved on this device.")).toBeInTheDocument();
  });

  it("a_desk_section_that_could_not_be_read_says_so_and_still_offers_the_overview", () => {
    view(summary({ desk: { status: "unavailable" } }));
    expect(
      screen.getByText(messages.en.dashboard.sectionUnavailable),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Layout" }),
    ).toBeInTheDocument();
  });

  it("a_failed_refresh_keeps_the_last_good_desk_marked_stale", () => {
    const good = summary();
    const failed = summary({ desk: { status: "unavailable" } });
    const merged = mergeSummary(good, failed);
    expect(merged.desk?.status).toBe("ok");
    expect(merged.desk?.status === "ok" && merged.desk.stale).toBe(true);
  });
});

describe("the timeline", () => {
  it("puts_each_arrival_with_a_time_on_the_line_and_every_arrival_in_a_row_above_it", () => {
    view(summary());
    const flow = screen.getByRole("region", { name: "Today's flow" });
    const rows = within(
      within(flow).getByRole("region", { name: "Still to arrive" }),
    );
    // Every arrival still to come is a row with its own command (TODAY-07).
    for (const guest of ["Costa", "Demir", "Moreau", "Petrov"]) {
      expect(rows.getByText(guest)).toBeInTheDocument();
    }
    // On the line twice over only where the time falls in the next five hours:
    // Moreau, at 20:30, is counted below it, not drawn; Petrov has no time.
    expect(within(flow).getAllByText("Costa")).toHaveLength(2);
    expect(within(flow).getAllByText("Demir")).toHaveLength(2);
    expect(within(flow).getAllByText("Moreau")).toHaveLength(1);
    expect(within(flow).getAllByText("Petrov")).toHaveLength(1);
    expect(rows.getByText("No expected time")).toBeInTheDocument();
  });

  it("without_a_time_on_any_arrival_there_is_no_chart_to_draw", () => {
    const base = summary();
    if (base.desk?.status !== "ok") throw new Error("fixture has a desk");
    view(
      summary({
        desk: {
          status: "ok",
          data: {
            ...base.desk.data,
            arrivals: [arrival("Petrov", "207", null)],
          },
        },
      }),
    );
    const flow = screen.getByRole("region", { name: "Today's flow" });
    expect(
      within(flow).queryByRole("button", { name: "Whole day" }),
    ).toBeNull();
    expect(within(flow).queryByText("On time")).toBeNull();
    expect(within(flow).queryByText("Now")).toBeNull();
    expect(within(flow).getByText("Petrov")).toBeInTheDocument();
  });

  it("says_how_late_the_late_arrival_is_and_why_each_room_cannot_take_its_guest_yet", () => {
    view(summary());
    expect(screen.getAllByText("32m late").length).toBeGreaterThan(0);
    // The same words in the plan and under the line (TODAY-08).
    expect(
      screen.getAllByText(/Room: Clean, awaiting inspection\./).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/Room: Dirty\./).length).toBeGreaterThan(0);
  });

  it("lists_the_overdue_departure_above_the_line_with_how_long_it_has_been", () => {
    view(summary());
    const flow = screen.getByRole("region", { name: "Today's flow" });
    expect(within(flow).getByText(/Overdue since Oct 17/)).toBeInTheDocument();
    expect(within(flow).getByText("Due out today")).toBeInTheDocument();
  });

  describe("a_long_due_out_list_shows_the_most_urgent_few_and_opens_into_groups", () => {
    function crowded(overdue: number, leavingToday: number) {
      const base = summary();
      if (base.desk?.status !== "ok") throw new Error("fixture has a desk");
      const rows = [
        ...Array.from({ length: overdue }, (_, i) =>
          leaving(`Late ${i}`, `4${String(i).padStart(2, "0")}`, true),
        ),
        ...Array.from({ length: leavingToday }, (_, i) =>
          leaving(`Today ${i}`, `5${String(i).padStart(2, "0")}`, false),
        ),
      ];
      return summary({
        desk: {
          status: "ok",
          data: { ...base.desk.data, departures: rows },
        },
      });
    }

    it("folds_to_six_rows_and_still_counts_everybody", () => {
      view(crowded(7, 3));
      const flow = screen.getByRole("region", { name: "Today's flow" });
      expect(within(flow).getAllByText(/^Overdue since/)).toHaveLength(6);
      expect(within(flow).queryByText("Today 0")).toBeNull();
      expect(within(flow).getByText("7 overdue")).toBeInTheDocument();
      expect(within(flow).getByText(/3 leave today/)).toBeInTheDocument();
      expect(
        within(flow).getByRole("button", { name: "Show 4 more" }),
      ).toHaveAttribute("aria-expanded", "false");
    });

    it("opens_into_overdue_and_leaving_today_and_folds_back", () => {
      view(crowded(7, 3));
      const flow = screen.getByRole("region", { name: "Today's flow" });
      fireEvent.click(
        within(flow).getByRole("button", { name: "Show 4 more" }),
      );
      expect(within(flow).getAllByText(/^Overdue since/)).toHaveLength(7);
      expect(within(flow).getByText("Today 2")).toBeInTheDocument();
      expect(
        within(flow).getByRole("heading", { name: "Overdue · 7" }),
      ).toBeInTheDocument();
      expect(
        within(flow).getByRole("heading", { name: "Leaves today · 3" }),
      ).toBeInTheDocument();
      fireEvent.click(within(flow).getByRole("button", { name: "Show fewer" }));
      expect(within(flow).queryByText("Today 2")).toBeNull();
    });

    it("shows_what_a_guest_owes_beside_the_name_and_a_total_only_with_balances", () => {
      const base = summary();
      if (base.desk?.status !== "ok") throw new Error("fixture has a desk");
      const withBalance = {
        ...leaving("Kaya", "103", true),
        balance: { amountMinor: 733000, currency: "TRY" },
      };
      view(
        summary({
          desk: {
            status: "ok",
            data: { ...base.desk.data, departures: [withBalance] },
          },
        }),
      );
      const flow = screen.getByRole("region", { name: "Today's flow" });
      expect(within(flow).getByText("TRY 7,330.00")).toBeInTheDocument();
      expect(within(flow).getByText(/TRY 7,330.00 owed/)).toBeInTheDocument();
      cleanup();

      view(summary());
      expect(
        within(
          screen.getByRole("region", { name: "Today's flow" }),
        ).queryByText(/owed/),
      ).toBeNull();
    });

    it("a_short_list_is_shown_whole_with_nothing_to_open", () => {
      view(crowded(4, 2));
      const flow = screen.getByRole("region", { name: "Today's flow" });
      expect(within(flow).getByText("Today 1")).toBeInTheDocument();
      expect(within(flow).queryByRole("button", { name: /Show/ })).toBeNull();
    });
  });

  it("offers_check_in_wherever_the_viewer_may_and_the_booking_is_not_blocked", () => {
    view(summary());
    const rows = within(
      screen.getByRole("region", { name: "Still to arrive" }),
    );
    // Costa's room is ready; Demir's and Moreau's are not, and the desk is
    // still offered the button: the server decides, and asks in place (TODAY-09).
    expect(rows.getAllByRole("button", { name: /Check in/i })).toHaveLength(4);
  });

  it("a_booking_that_cannot_be_checked_in_names_why_and_links_to_the_screen_that_mends_it", () => {
    const base = summary();
    if (base.desk?.status !== "ok") throw new Error("fixture has a desk");
    view(
      summary({
        desk: {
          status: "ok",
          data: {
            ...base.desk.data,
            arrivals: [
              arrival("Hughes", "306", "18:00", {
                state: "blocked",
                blocker: "unit_out_of_service",
              }),
              arrival("Ivanov", "101", "18:00", {
                state: "blocked",
                blocker: "not_confirmed",
              }),
              arrival("Jones", "102", "18:00", {
                state: "blocked",
                blocker: "unit_occupied",
              }),
            ],
          },
        },
      }),
    );
    const rows = within(
      screen.getByRole("region", { name: "Still to arrive" }),
    );
    expect(rows.queryByRole("button", { name: /Check in/i })).toBeNull();
    expect(rows.getByText("The room is out of service.")).toBeInTheDocument();
    expect(
      rows.getByText("The booking is not confirmed yet."),
    ).toBeInTheDocument();
    expect(rows.getByText("A guest is still in the room.")).toBeInTheDocument();
    // Each goes to the page that owns the blocker.
    expect(
      rows.getAllByRole("link", { name: "Open Housekeeping" }),
    ).toHaveLength(1);
    expect(rows.getAllByRole("link", { name: "Open Arrivals" })).toHaveLength(
      1,
    );
    expect(rows.getAllByRole("link", { name: "Open Departures" })).toHaveLength(
      1,
    );
  });

  it("a_room_that_is_not_ready_is_asked_about_in_place_with_check_in_anyway", async () => {
    vi.mocked(checkInReservation).mockResolvedValueOnce("notReady");
    view(summary());
    const rows = within(
      screen.getByRole("region", { name: "Still to arrive" }),
    );
    fireEvent.click(rows.getAllByRole("button", { name: /Check in/i })[1]!);
    expect(
      await rows.findByRole("button", { name: "Check in anyway" }),
    ).toBeInTheDocument();
    expect(
      rows.getByText("201 is clean and waiting for inspection."),
    ).toBeInTheDocument();
  });

  it("outside_the_window_it_counts_what_is_left_out_and_one_click_shows_them", () => {
    view(summary());
    // Moreau at 20:30 is beyond the next five hours.
    fireEvent.click(
      screen.getByRole("button", { name: "1 more outside this window" }),
    );
    expect(
      screen.getByRole("button", { name: "Whole day", pressed: true }),
    ).toBeInTheDocument();
  });

  it("the_hour_labels_are_spaced_for_the_width_of_the_line", () => {
    // A phone's lane is about 310 px: a label every second hour put the 00:00
    // of one over the 02:00 of the next.
    expect(hourStepFor(24, 1100)).toBe(2);
    expect(hourStepFor(24, 310)).toBe(4);
    expect(hourStepFor(5, 310)).toBe(1);
    expect(hourStepFor(5, 200)).toBe(2);
    // Before the line has been measured nothing is thinned.
    expect(hourStepFor(24, 0)).toBe(2);
  });

  it("the_whole_day_starts_at_midnight_so_an_early_flight_still_to_come_is_on_the_line", () => {
    // 04:15 at the Property: a Guest due at 05:00 has not come and is not late.
    const earlyMorning = Date.UTC(2026, 9, 19, 1, 15);
    const base = summary();
    if (base.desk?.status !== "ok") throw new Error("the fixture has a desk");
    view(
      {
        ...base,
        desk: {
          ...base.desk,
          data: {
            ...base.desk.data,
            arrivals: [arrival("Early", "207", "05:00")],
          },
        },
      },
      { nowMs: earlyMorning },
    );
    const flow = screen.getByRole("region", { name: "Today's flow" });
    fireEvent.click(within(flow).getByRole("button", { name: "Whole day" }));
    // A row under "Still to arrive" and a chip on the line, not "1 more outside this window".
    expect(within(flow).getAllByText("Early")).toHaveLength(2);
    expect(
      within(flow).queryByRole("button", { name: /outside this window/ }),
    ).not.toBeInTheDocument();
  });

  it("the_plan_lists_arrivals_and_rooms_and_leaves_the_departures_to_the_list_above", () => {
    view(summary());
    const plan = screen.getByRole("region", { name: "Do these next" });
    const titles = within(plan)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent ?? "");
    // Kaya is overdue and already a row of "Due out today": one row, one
    // Check out button, not two (TODAY-11).
    expect(titles.join("|")).not.toContain("Kaya");
    expect(titles[0]).toContain("Costa");
    expect(titles.join("|")).toContain("Petrov");
    expect(
      within(screen.getByRole("region", { name: "Today's flow" })).getByText(
        "Kaya",
      ),
    ).toBeInTheDocument();
  });

  describe("the_plan_folds_to_five_and_opens_into_groups_by_kind", () => {
    function crowdedPlan(late: number) {
      const base = summary();
      if (base.desk?.status !== "ok") throw new Error("fixture has a desk");
      const extra = Array.from({ length: late }, (_, i) =>
        arrival(`Late ${i}`, `4${String(i).padStart(2, "0")}`, "13:00", {
          expectedArrivalPassed: true,
        }),
      );
      return summary({
        desk: {
          status: "ok",
          data: {
            ...base.desk.data,
            arrivals: [...extra, ...base.desk.data.arrivals],
          },
        },
      });
    }

    it("shows_the_five_most_urgent_and_says_how_many_are_left", () => {
      view(crowdedPlan(6));
      const plan = screen.getByRole("region", { name: "Do these next" });
      expect(within(plan).getAllByRole("heading", { level: 3 })).toHaveLength(
        5,
      );
      expect(
        within(plan).getByRole("button", { name: "Show 5 more" }),
      ).toHaveAttribute("aria-expanded", "false");
      expect(within(plan).queryByText(/Late arrivals ·/)).toBeNull();
    });

    it("opens_into_a_group_for_each_kind_in_the_same_order", () => {
      view(crowdedPlan(6));
      const plan = screen.getByRole("region", { name: "Do these next" });
      fireEvent.click(
        within(plan).getByRole("button", { name: "Show 5 more" }),
      );
      const labels = within(plan)
        .getAllByText(/ · \d+$/)
        .map((node) => node.textContent);
      expect(labels).toEqual([
        "Late arrivals · 7",
        "Rooms at risk · 2",
        "No expected time · 1",
      ]);
      expect(within(plan).getAllByRole("heading", { level: 3 })).toHaveLength(
        10,
      );
    });

    it("a_short_plan_is_shown_whole_with_nothing_to_open", () => {
      view(summary());
      const plan = screen.getByRole("region", { name: "Do these next" });
      expect(within(plan).queryByRole("button", { name: /Show/ })).toBeNull();
    });
  });

  it("a_row_has_a_link_in_only_when_it_has_no_command_of_its_own", async () => {
    const base = summary();
    if (base.desk?.status !== "ok") throw new Error("fixture has a desk");
    const mayLeave = { ...leaving("Kaya", "103", true), mayCheckOut: true };
    const mayNot = { ...leaving("Aydın", "104", true), mayCheckOut: false };
    reviews.splice(0, reviews.length, {
      stayId: mayLeave.stayId,
      guestName: "Kaya",
      roomName: null,
      unitName: "103",
      balanceMinor: 0,
      pendingMinor: 0,
      currency: "TRY",
      stayType: "guest",
      nightlyRateMinor: 1000,
      folioId: "f",
    });
    view(
      summary({
        desk: {
          status: "ok",
          data: { ...base.desk.data, departures: [mayLeave, mayNot] },
        },
      }),
    );
    const flow = screen.getByRole("region", { name: "Today's flow" });
    expect(
      await within(flow).findByRole("button", { name: /Check .*Kaya.* out/ }),
    ).toBeInTheDocument();
    // Kaya can be checked out from the row; Aydın's viewer is sent to the
    // screen, and not before: a link that turns into a button is what the
    // audit saw change under the pointer (TODAY-20).
    expect(
      within(flow).getAllByRole("link", { name: "Open Departures" }),
    ).toHaveLength(1);
    reviews.length = 0;
  });

  it("an_empty_day_says_nothing_is_waiting", () => {
    const base = summary();
    const desk = base.desk?.status === "ok" ? base.desk.data : null;
    if (!desk) throw new Error("fixture");
    view({
      ...base,
      desk: {
        status: "ok",
        data: { ...desk, arrivals: [], departures: [], rooms: desk.rooms },
      },
    });
    expect(
      screen.getByText("No arrival or room needs you."),
    ).toBeInTheDocument();
    // No arrival has a time, so there is no line to draw and no empty one.
    expect(screen.queryByText(/in this window/)).toBeNull();
  });

  it("an_overdue_guest_is_the_only_thing_open_and_the_plan_points_up_to_them", () => {
    const base = summary();
    if (base.desk?.status !== "ok") throw new Error("fixture has a desk");
    view(
      summary({
        desk: { status: "ok", data: { ...base.desk.data, arrivals: [] } },
      }),
    );
    expect(
      screen.getByText(
        "No arrival or room needs you. The departures above are what is open.",
      ),
    ).toBeInTheDocument();
  });

  it("checked_out_is_of_the_guests_due_today_with_the_overdue_ones_counted_apart", () => {
    // TODAY-02: 1 of (1 gone + 0 due today), and one overdue beside it.
    view(summary());
    const figure = screen.getByRole("link", { name: /Checked out/ });
    expect(figure).toHaveTextContent("1/1");
    expect(figure).toHaveTextContent("1 departure overdue");
  });

  it("tonight_is_the_cards_figure_and_names_how_overdue_guests_are_counted", () => {
    view(summary());
    const figure = screen.getByRole("link", { name: /In house now/ });
    expect(figure).toHaveTextContent("3 expected tonight, of 5 rooms");
    expect(figure).toHaveTextContent(
      "Counts 1 overdue guest as staying until checked out.",
    );
  });

  it("in_house_now_counts_what_tonight_under_it_counts_where_rooms_are_let_by_the_bed", () => {
    // A dormitory: two rooms on the board have somebody in them, seven beds do.
    const occupancy = summary().occupancy;
    view(
      summary({
        occupancy:
          occupancy?.status === "ok"
            ? { ...occupancy, data: { ...occupancy.data, inHouse: 7 } }
            : occupancy,
      }),
    );
    const figure = screen.getByRole("link", { name: /In house now/ });
    expect(figure).toHaveTextContent(/^In house now7/);
  });

  it("the_rooms_headline_counts_vacant_rooms_the_way_its_list_does", () => {
    view(summary());
    const rooms = within(screen.getByRole("region", { name: "Rooms" }));
    // 101, 205 and 207 ready, 201 awaiting inspection, 305 dirty: five empty.
    expect(
      rooms.getByText("5 vacant rooms tonight, 3 ready to sell."),
    ).toBeInTheDocument();
    expect(
      rooms.getByText("Dirty and awaiting inspection count empty rooms only."),
    ).toBeInTheDocument();
  });

  it("days_not_closed_past_the_pills_say_how_many_more_there_are", () => {
    const base = summary();
    if (base.desk?.status !== "ok") throw new Error("fixture has a desk");
    view(
      summary({
        desk: {
          status: "ok",
          data: {
            ...base.desk.data,
            unclosed: {
              status: "ok",
              data: { waiting: 13, oldest: "2026-10-06" },
            },
          },
        },
      }),
    );
    expect(screen.getByText("+5")).toBeInTheDocument();
  });

  it("places_chips_by_logical_offset_so_arabic_mirrors_by_construction", () => {
    const { container } = view(summary(), { locale: "ar" });
    const chip = container.querySelector<HTMLElement>(
      "[style*='inset-inline']",
    );
    expect(chip).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/style="[^"]*\bleft:/);
  });
});

describe("the house map", () => {
  it("shows_every_room_in_words_and_never_calls_an_occupied_room_ready", () => {
    view(summary(), { layout: "house" });
    const map = screen.getByRole("region", { name: "The house" });
    const tile = (name: string) =>
      within(map).getByRole("button", { name: new RegExp(`^${name},`) });
    // The name carries everything the tile shows, not only the state (TODAY-15).
    expect(tile("102")).toHaveAccessibleName("102, Yılmaz, In house");
    expect(tile("306")).toHaveAccessibleName("306, Out of service");
    expect(tile("305")).toHaveAccessibleName(
      "305, Moreau, Dirty, Arrival 20:30",
    );
    expect(tile("103")).toHaveAccessibleName("103, Kaya, Overdue");
    expect(within(map).getAllByRole("button")).toHaveLength(8);
  });

  it("choosing_an_arrival_marks_other_ready_rooms_of_the_same_type_that_can_take_them", () => {
    view(summary(), { layout: "house" });
    fireEvent.click(
      within(
        screen
          .getByRole("heading", { name: /Still to arrive/ })
          .closest("section")!,
      ).getByRole("button", { name: /Demir/ }),
    );
    const map = screen.getByRole("region", { name: "The house" });
    // 101 and 207 are ready Doubles, but 207 is booked for Petrov; 205 is a
    // Twin. Only 101 can take him.
    expect(within(map).getAllByText("Can take")).toHaveLength(1);
    expect(
      screen.getByText("Ready rooms of this type: 101."),
    ).toBeInTheDocument();
  });

  it("a_tile_keeps_the_whole_guest_name_for_a_pointer_and_a_screen_reader", () => {
    const base = summary();
    if (base.desk?.status !== "ok") throw new Error("fixture has a desk");
    view(
      summary({
        desk: {
          status: "ok",
          data: {
            ...base.desk.data,
            rooms: base.desk.data.rooms.map((r) =>
              r.name === "102"
                ? {
                    ...r,
                    guestName: "Maria-Magdalena Wojciechowska-Papadopoulos",
                  }
                : r,
            ),
          },
        },
      }),
      { layout: "house" },
    );
    const tile = screen.getByRole("button", { name: /^102,/ });
    expect(tile).toHaveAccessibleName(
      "102, Maria-Magdalena Wojciechowska-Papadopoulos, In house",
    );
    expect(
      within(tile).getByTitle("Maria-Magdalena Wojciechowska-Papadopoulos"),
    ).toBeInTheDocument();
  });

  it("a_blocked_arrival_in_the_map_says_why_and_offers_no_check_in", () => {
    const base = summary();
    if (base.desk?.status !== "ok") throw new Error("fixture has a desk");
    view(
      summary({
        desk: {
          status: "ok",
          data: {
            ...base.desk.data,
            arrivals: [
              arrival("Hughes", "306", "18:00", {
                state: "blocked",
                blocker: "unit_out_of_service",
              }),
            ],
          },
        },
      }),
      { layout: "house" },
    );
    expect(
      screen.getAllByText("The room is out of service.").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Check in/i })).toBeNull();
  });

  it("a_filter_narrows_by_state_and_its_count_is_the_rooms_it_shows", () => {
    view(summary(), { layout: "house" });
    const filter = screen.getByRole("button", { name: /^1\s*Dirty$/ });
    fireEvent.click(filter);
    expect(filter).toHaveAttribute("aria-pressed", "true");
    const map = screen.getByRole("region", { name: "The house" });
    const lit = within(map)
      .getAllByRole("button")
      .filter((b) => !b.className.includes("opacity-30"));
    expect(lit.map((b) => b.getAttribute("aria-label"))).toEqual([
      "305, Moreau, Dirty, Arrival 20:30",
    ]);
  });

  it("a_room_that_is_in_house_names_the_guest_and_when_they_leave", () => {
    view(summary(), { layout: "house" });
    fireEvent.click(
      within(screen.getByRole("region", { name: "The house" })).getByRole(
        "button",
        { name: /^102,/ },
      ),
    );
    expect(screen.getByText("Yılmaz in house")).toBeInTheDocument();
    expect(screen.getByText("Leaves Oct 21")).toBeInTheDocument();
  });
});

describe("next up", () => {
  it("leads_with_the_most_urgent_thing_and_the_arrows_step_through_the_rest", () => {
    view(summary(), { layout: "next-up" });
    expect(screen.getByText("Overdue departure · 103")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Late arrival · 205")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByText("Overdue departure · 103")).toBeInTheDocument();
  });

  it("the_queue_folds_at_five_and_the_arrows_sit_beside_the_title", () => {
    // TODAY-14: all 24 items were unfolded beside a card stretched to match.
    const base = summary();
    if (base.desk?.status !== "ok") throw new Error("fixture has a desk");
    const late = Array.from({ length: 8 }, (_, i) =>
      arrival(`Late ${i}`, `4${String(i).padStart(2, "0")}`, "13:00", {
        expectedArrivalPassed: true,
      }),
    );
    view(
      summary({
        desk: {
          status: "ok",
          data: {
            ...base.desk.data,
            arrivals: [...late, ...base.desk.data.arrivals],
          },
        },
      }),
      { layout: "next-up" },
    );
    const queue = within(
      screen
        .getByRole("heading", { name: "Waiting on you" })
        .closest("section")!,
    );
    expect(queue.getAllByRole("button", { pressed: false })).toHaveLength(4);
    expect(queue.getAllByRole("button", { pressed: true })).toHaveLength(1);
    fireEvent.click(queue.getByRole("button", { name: /^Show \d+ more$/ }));
    expect(
      queue.getByRole("button", { name: "Show fewer" }),
    ).toBeInTheDocument();
    // The arrows are in the hero's top row, with the eyebrow, not at its foot.
    const hero = screen.getByText(/Overdue departure/).closest("section")!;
    const next = within(hero).getByRole("button", { name: "Next" });
    expect(next.closest("div")?.firstElementChild?.tagName).toBe("P");
  });

  it("a_blocked_item_shows_what_blocks_it_in_words_as_well_as_colour", () => {
    view(summary(), { layout: "next-up" });
    fireEvent.click(screen.getByRole("button", { name: /Room for Demir/ }));
    const hero = screen.getByText(/Arrival at risk/).closest("section");
    if (!hero) throw new Error("hero");
    expect(
      within(hero).getByText("Clean, awaiting inspection"),
    ).toBeInTheDocument();
    expect(within(hero).getByText("Blocking")).toBeInTheDocument();
  });

  it("with_nothing_to_do_it_says_so_and_the_lanes_remain", () => {
    const base = summary();
    const desk = base.desk?.status === "ok" ? base.desk.data : null;
    if (!desk) throw new Error("fixture");
    view(
      {
        ...base,
        desk: { status: "ok", data: { ...desk, arrivals: [], departures: [] } },
      },
      { layout: "next-up" },
    );
    expect(
      screen.getAllByText("Nothing is waiting on you.").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Arriving")).toBeInTheDocument();
  });
});

describe("the night desk", () => {
  it("says_who_is_in_and_who_is_still_expected", () => {
    view(summary(), { layout: "night" });
    expect(screen.getByText("2 in house.")).toBeInTheDocument();
    expect(screen.getByText("4 still expected.")).toBeInTheDocument();
  });

  it("the_waterfall_ends_where_the_occupancy_card_says_tonight_ends", () => {
    view(summary(), { layout: "night" });
    const steps = within(
      screen.getByRole("list", { name: "How the house moved today" }),
    ).getAllByRole("listitem");
    expect(steps).toHaveLength(6);
    // 2 in house now, 1 still to leave, 4 still to arrive: 5, not the card's
    // clamped 3 (a house booked past its rooms says so).
    expect(steps[5]).toHaveTextContent("3");
  });

  it("says_tonight_of_the_available_rooms_and_that_overdue_guests_are_counted_as_staying", () => {
    view(summary(), { layout: "night" });
    expect(screen.getByText(/3 of 5 rooms tonight, 60%/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /1 overdue guest is counted as staying until checked out\./,
      ),
    ).toBeInTheDocument();
  });

  it("the_hand_over_names_the_overdue_guest_who_has_waited_longest", () => {
    view(summary(), { layout: "night" });
    const hand = within(
      screen
        .getByRole("heading", { name: "Before you hand over" })
        .closest("section")!,
    );
    expect(hand.getByText("1 guest is overdue to leave")).toBeInTheDocument();
    expect(
      hand.getByText("Longest: Kaya, room 103, 2 days late."),
    ).toBeInTheDocument();
  });

  it("the_seven_nights_are_columns_that_cannot_run_past_their_card", () => {
    const base = summary({
      booked: {
        status: "ok",
        data: {
          nights: Array.from({ length: 7 }, (_, i) => ({
            day: `2026-10-${19 + i}`,
            booked: i,
            inUse: 8,
          })),
        },
      },
    });
    const { container } = view(base, { layout: "night" });
    const columns = container.querySelectorAll("#outlook-title ~ ol > li");
    expect(columns).toHaveLength(7);
    for (const column of columns) expect(column.className).toContain("min-w-0");
    // A short weekday and the day number, not the whole weekday name.
    expect(
      within(columns[0] as HTMLElement).getByText("Mon"),
    ).toBeInTheDocument();
    expect(
      within(columns[0] as HTMLElement).getByText("19"),
    ).toBeInTheDocument();
  });

  it("names_the_days_waiting_to_close_and_links_to_closing_them", () => {
    view(summary(), { layout: "night" });
    expect(
      screen.getAllByText("8 days waiting to be closed").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "Open Close the day" }).length,
    ).toBeGreaterThan(0);
  });

  it("with_no_days_waiting_it_says_every_day_is_closed", () => {
    const base = summary();
    const desk = base.desk?.status === "ok" ? base.desk.data : null;
    if (!desk) throw new Error("fixture");
    view(
      {
        ...base,
        desk: {
          status: "ok",
          data: {
            ...desk,
            unclosed: {
              status: "ok",
              data: { waiting: 0, oldest: null },
            },
          },
        },
      },
      { layout: "night" },
    );
    expect(screen.getByText("Every day is closed.")).toBeInTheDocument();
  });

  it("the_hand_over_lists_only_what_exists", () => {
    const base = summary();
    const desk = base.desk?.status === "ok" ? base.desk.data : null;
    if (!desk) throw new Error("fixture");
    view(
      {
        ...base,
        desk: {
          status: "ok",
          data: {
            ...desk,
            arrivals: desk.arrivals.map((a) => ({
              ...a,
              state: "checked_in" as const,
            })),
            departures: [],
            rooms: desk.rooms.filter((r) => r.state !== "out_of_service"),
            unclosed: {
              status: "ok",
              data: { waiting: 0, oldest: null },
            },
          },
        },
      },
      { layout: "night" },
    );
    expect(screen.getByText("Nothing to hand over.")).toBeInTheDocument();
  });
});

describe("every locale draws every layout", () => {
  for (const locale of ["tr", "en", "ar"] as const) {
    for (const layout of TODAY_LAYOUTS.filter((l) => l !== "overview")) {
      it(`${layout}_in_${locale}_renders_without_a_missing_message`, () => {
        const errors = vi.spyOn(console, "error").mockImplementation(() => {});
        view(summary(), { layout, locale });
        const missing = errors.mock.calls.filter(
          (call) =>
            String(call[0]).includes("MISSING_MESSAGE") ||
            String(call[0]).includes("INVALID_MESSAGE"),
        );
        errors.mockRestore();
        expect(missing).toEqual([]);
        expect(screen.getByRole("combobox")).toBeInTheDocument();
      });
    }
  }
});

describe("a dormitory's Today (RANZ-108)", () => {
  const EMPTY_BEDS = {
    status: "ok",
    data: {
      female: 3,
      male: 1,
      anyone: 0,
      byBed: true,
      blocks: [
        { block: "Blok A", female: 3, male: 0, anyone: 0 },
        { block: "Blok B", female: 0, male: 1, anyone: 0 },
      ],
    },
  } as const;

  /** A day nobody arrives or leaves, at a Property of the given model. */
  function quietDay(model: "hotel" | "dormitory"): TodaySummary {
    const base = summary();
    if (base.desk?.status !== "ok") throw new Error("fixture has a desk");
    const occupancy = base.occupancy;
    if (occupancy?.status !== "ok") throw new Error("fixture has occupancy");
    return summary({
      day: { ...base.day, operatingModel: model },
      occupancy: {
        status: "ok",
        data: {
          ...occupancy.data,
          ...(model === "dormitory"
            ? {
                beds: { empty: 40, reserved: 2, blocked: 1, outOfService: 0 },
                available: 120,
              }
            : {}),
        },
      },
      emptyBeds: EMPTY_BEDS,
      arrivals: {
        status: "ok",
        data: { expected: 0, checkedIn: 0, ready: 0, notReady: 0, rows: [] },
      },
      departures: {
        status: "ok",
        data: {
          due: 0,
          departed: 0,
          overdue: 0,
          longestOverdueDays: 0,
          rows: [],
        },
      },
      desk: {
        status: "ok",
        data: {
          ...base.desk.data,
          arrivals: [],
          departures: [],
          departed: 0,
        },
      },
    });
  }

  it("draws_no_arrivals_or_departures_figure_or_flow_on_a_day_with_none", () => {
    view(quietDay("dormitory"));
    expect(screen.queryByRole("link", { name: /Checked in/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Checked out/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Today's flow" })).toBeNull();
    expect(screen.getByRole("link", { name: /In house now/ })).toBeVisible();
  });

  it("a_hotel_with_the_same_empty_day_draws_every_one_of_them_as_it_always_did", () => {
    view(quietDay("hotel"));
    expect(screen.getByRole("link", { name: /Checked in/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /Checked out/ })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Today's flow" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Rooms ready to sell/ }),
    ).toBeVisible();
  });

  it("brings_them_back_the_moment_there_is_somebody_to_arrive_or_leave", () => {
    const quiet = quietDay("dormitory");
    if (quiet.desk?.status !== "ok") throw new Error("fixture has a desk");
    const arriving = arrival("Costa", "205", "14:00");
    view({
      ...quiet,
      desk: {
        status: "ok",
        data: { ...quiet.desk.data, arrivals: [arriving] },
      },
    });
    expect(screen.getByRole("link", { name: /Checked in/ })).toBeVisible();
    expect(screen.queryByRole("link", { name: /Checked out/ })).toBeNull();
    expect(screen.getByRole("heading", { name: "Today's flow" })).toBeVisible();
  });

  it("do_these_next_points_at_the_departures_only_when_they_are_drawn_above", () => {
    const lines = {
      en: "Departures are listed above.",
      tr: "Çıkışlar yukarıda listelenir.",
      ar: "المغادرات مذكورة أعلاه.",
    } as const;
    for (const locale of ["en", "tr", "ar"] as const) {
      const quiet = view(quietDay("dormitory"), { locale });
      expect(screen.queryByText(new RegExp(lines[locale]))).toBeNull();
      expect(
        screen.getByText(
          messages[locale].todayLayouts.doNow.subWithoutDepartures,
        ),
      ).toBeVisible();
      quiet.unmount();
    }

    const day = quietDay("dormitory");
    if (day.desk?.status !== "ok") throw new Error("fixture has a desk");
    view(
      {
        ...day,
        desk: {
          status: "ok",
          data: {
            ...day.desk.data,
            departures: [leaving("Kaya", "103", true)],
          },
        },
      },
      { locale: "en" },
    );
    expect(screen.getByText(new RegExp(lines.en))).toBeVisible();
    cleanup();

    view(quietDay("hotel"));
    expect(screen.getByText(new RegExp(lines.en))).toBeVisible();
  });

  it("counts_empty_beds_where_a_hotel_counts_rooms_ready_to_sell_in_the_dormitorys_words", () => {
    view(quietDay("dormitory"));
    expect(
      screen.queryByRole("link", { name: /Rooms ready to sell/ }),
    ).toBeNull();
    const figure = screen.getByRole("link", { name: /Empty beds/ });
    expect(figure).toHaveTextContent("40/120");
    expect(figure).toHaveAttribute(
      "href",
      expect.stringContaining("/en/rooms?property=" + PROPERTY),
    );
    expect(figure).toHaveAttribute(
      "href",
      expect.stringContaining("show=free"),
    );
  });

  it("the_overview_leaves_out_the_same_empty_cards_and_a_hotel_keeps_them", () => {
    const { unmount } = view(quietDay("dormitory"), { layout: "overview" });
    expect(screen.queryByText("Checked in")).toBeNull();
    expect(screen.queryByText("Checked out")).toBeNull();
    unmount();
    view(quietDay("hotel"), { layout: "overview" });
    expect(screen.getByText("Checked in")).toBeVisible();
    expect(screen.getByText("Checked out")).toBeVisible();
  });

  it("every_desk_layout_draws_the_empty_beds_and_the_open_work_under_it", () => {
    for (const layout of ["house", "next-up", "night"] as const) {
      view(
        {
          ...quietDay("dormitory"),
          openWork: {
            status: "ok",
            data: {
              requests: { open: 3, urgent: 1 },
              maintenance: { open: 2, urgent: 0, outOfOrder: 1 },
            },
          },
        },
        { layout },
      );
      expect(
        screen.getByRole("region", { name: "Empty beds tonight" }),
      ).toBeVisible();
      expect(
        screen.getByRole("link", { name: "3 open requests" }),
      ).toHaveAttribute("href", `/en/guest-experience?property=${PROPERTY}`);
      cleanup();
    }
  });

  describe("the Residents' standing (TD-S10-15, TD-S10-16)", () => {
    const OVERDUE = {
      status: "ok",
      data: {
        students: 3,
        instalments: 5,
        overdueMinor: 1_250_000,
        currency: "TRY",
      },
    } as const;
    const ROLL_CALL = {
      status: "ok",
      data: {
        inHouse: 12,
        onLeave: 2,
        missing: 1,
        notCalled: 4,
        curfewPassed: true,
      },
    } as const;
    const standing = (overrides: Partial<TodaySummary> = {}) => ({
      ...quietDay("dormitory"),
      overdue: OVERDUE,
      rollCall: ROLL_CALL,
      ...overrides,
    });

    it("the_overdue_figure_opens_the_residents_it_counts_in_finance_with_the_money_overdue", () => {
      view(standing(), { layout: "timeline" });
      const card = within(
        screen.getByRole("region", { name: "Instalments overdue" }),
      );
      const figure = card.getByRole("link", {
        name: /3 students with an overdue instalment/,
      });
      expect(figure).toHaveAttribute(
        "href",
        `/en/finance?property=${PROPERTY}&show=overdue`,
      );
      expect(figure).toHaveTextContent("3");
      expect(figure).toHaveTextContent("5 instalments");
      expect(figure).toHaveTextContent(/12\.500,00|12,500\.00/);
    });

    it("each_roll_call_figure_opens_the_roll_call_at_the_same_property", () => {
      view(standing(), { layout: "timeline" });
      const card = within(
        screen.getByRole("region", { name: "Tonight's roll call" }),
      );
      for (const [name, count] of [
        ["On leave", "2"],
        ["Missing", "1"],
        ["Not yet called", "4"],
      ] as const) {
        const link = card.getByRole("link", { name: `${name}: ${count}` });
        expect(link).toHaveAttribute(
          "href",
          `/en/roll-call?property=${PROPERTY}`,
        );
      }
      expect(card.getByText("Curfew has passed")).toBeVisible();
    });

    it("every_layout_draws_both_cards_and_a_failed_read_is_a_retry_not_a_zero", () => {
      for (const layout of [
        "timeline",
        "overview",
        "house",
        "next-up",
        "night",
      ] as const) {
        view(standing(), { layout });
        expect(
          screen.getByRole("region", { name: "Instalments overdue" }),
        ).toBeVisible();
        expect(
          screen.getByRole("region", { name: "Tonight's roll call" }),
        ).toBeVisible();
        cleanup();
      }
      view(
        standing({
          overdue: { status: "unavailable" },
          rollCall: { status: "unavailable" },
        }),
        { layout: "timeline" },
      );
      expect(
        screen.queryByRole("region", { name: "Instalments overdue" }),
      ).toBeNull();
      expect(
        screen.getAllByRole("button", { name: /Try again|Retry/i }),
      ).not.toHaveLength(0);
    });

    it("reads_in_turkish_and_arabic_with_the_students_words", () => {
      view(standing(), { layout: "timeline", locale: "tr" });
      expect(
        screen.getByRole("region", { name: "Geciken taksitler" }),
      ).toBeVisible();
      expect(
        screen.getByRole("region", { name: "Bu geceki yoklama" }),
      ).toBeVisible();
      cleanup();
      view(standing(), { layout: "timeline", locale: "ar" });
      expect(
        screen.getByRole("region", { name: "أقساط متأخرة" }),
      ).toBeVisible();
      expect(
        screen.getByRole("region", { name: "كشف الحضور الليلة" }),
      ).toBeVisible();
    });

    it("a_property_with_no_plan_and_no_roll_call_draws_neither_card", () => {
      for (const model of ["dormitory", "hotel"] as const) {
        view(quietDay(model));
        expect(
          screen.queryByRole("region", { name: "Instalments overdue" }),
        ).toBeNull();
        expect(
          screen.queryByRole("region", { name: "Tonight's roll call" }),
        ).toBeNull();
        cleanup();
      }
    });
  });

  it("a_hotel_draws_neither_card_under_the_other_layouts", () => {
    for (const layout of ["house", "next-up", "night"] as const) {
      view({ ...quietDay("hotel"), emptyBeds: undefined }, { layout });
      expect(
        screen.queryByRole("region", { name: "Empty beds tonight" }),
      ).toBeNull();
      expect(
        screen.queryByRole("region", { name: "Requests and maintenance" }),
      ).toBeNull();
      cleanup();
    }
  });

  it("each_open_work_figure_opens_its_own_list_and_says_how_urgent_it_is", () => {
    view(
      {
        ...quietDay("dormitory"),
        openWork: {
          status: "ok",
          data: {
            requests: { open: 3, urgent: 1 },
            maintenance: { open: 2, urgent: 0, outOfOrder: 1 },
          },
        },
      },
      { layout: "timeline" },
    );
    const card = within(
      screen.getByRole("region", { name: "Requests and maintenance" }),
    );
    expect(card.getByRole("link", { name: "3 open requests" })).toHaveAttribute(
      "href",
      `/en/guest-experience?property=${PROPERTY}`,
    );
    expect(
      card.getByRole("link", { name: "2 open maintenance requests" }),
    ).toHaveAttribute("href", `/en/maintenance?property=${PROPERTY}`);
    expect(
      card.getByRole("link", { name: "1 room or bed out of order" }),
    ).toHaveAttribute(
      "href",
      `/en/maintenance?property=${PROPERTY}&outOfOrder=1`,
    );
    expect(card.getByText("1 urgent")).toBeVisible();
  });
});
