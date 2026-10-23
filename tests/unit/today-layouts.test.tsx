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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryProvider } from "../../apps/operator-workspace/src/app/providers/query-provider";
import {
  Hydrated,
  requestQueryClient,
} from "../../apps/operator-workspace/src/app/providers/hydrate";
import { messages } from "../../apps/operator-workspace/src/messages";
import type { SupportedLocale } from "../../packages/i18n/src";
import type {
  ArrivalRow,
  DepartureRow,
  DeskRoom,
  RoomState,
  TodaySummary,
} from "../../apps/operator-workspace/src/server/today-derive";
import { TodayDashboard } from "../../apps/operator-workspace/src/features/today/components/today-dashboard";
import {
  layoutCookieName,
  TODAY_LAYOUTS,
  type TodayLayout,
} from "../../apps/operator-workspace/src/features/today/layouts/model";
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
  mayCheckOut: false,
});

function summary(overrides: Partial<TodaySummary> = {}): TodaySummary {
  return {
    day: {
      propertyId: PROPERTY,
      propertyName: "Demo Otel İstanbul",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      businessDate: "2026-10-19",
      calendarDate: "2026-10-19",
      cutoff: "04:00",
    },
    focus: "front_desk",
    mayBook: true,
    occupancy: {
      status: "ok",
      data: { sellable: 5, inHouse: 2, expectedTonight: 3 },
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
  options: { layout?: TodayLayout; locale?: SupportedLocale } = {},
) {
  const locale = options.locale ?? "en";
  const prefetched = requestQueryClient();
  prefetched.setQueryData(todayKeys.summary(SCOPE), value);
  return render(
    <QueryProvider scope={SCOPE.userId}>
      <Hydrated client={prefetched}>
        <NextIntlClientProvider locale={locale} messages={messages[locale]}>
          <TodayDashboard
            clock="14:32"
            greeting="afternoon"
            initialLayout={options.layout ?? "timeline"}
            locale={locale}
            name="Selin"
            nowMs={NOW}
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
  it("puts_each_arrival_with_a_time_on_the_line_and_the_rest_under_it", () => {
    view(summary());
    const flow = screen.getByRole("region", { name: "Today's flow" });
    for (const guest of ["Costa", "Demir"]) {
      expect(within(flow).getByText(guest)).toBeInTheDocument();
    }
    // Moreau, at 20:30, is past the next five hours: counted, not drawn.
    expect(within(flow).queryByText("Moreau")).toBeNull();
    // Petrov has no time to be placed by: named under the line, not on it.
    expect(within(flow).getByText(/Petrov/)).toBeInTheDocument();
    expect(within(flow).getByText(/No expected time/)).toBeInTheDocument();
  });

  it("says_how_late_the_late_arrival_is_and_which_room_is_not_ready", () => {
    view(summary());
    expect(screen.getAllByText("32m late").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Room not ready").length).toBeGreaterThan(0);
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

  it("offers_check_in_only_where_the_room_is_ready_and_the_viewer_may", () => {
    view(summary());
    const flow = screen.getByRole("region", { name: "Today's flow" });
    // Costa's room is ready; Demir's is not, so he is sent to housekeeping.
    expect(
      within(flow).getAllByRole("button", { name: /Check in/i }),
    ).toHaveLength(1);
    const plan = screen.getByRole("region", { name: "Do these in order" });
    expect(
      within(plan).getAllByRole("link", { name: "Open Housekeeping" }),
    ).toHaveLength(2);
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

  it("the_plan_is_ranked_overdue_first_and_names_every_row_with_a_way_in", () => {
    view(summary());
    const plan = screen.getByRole("region", { name: "Do these in order" });
    const titles = within(plan)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent ?? "");
    expect(titles[0]).toContain("Kaya");
    expect(titles[1]).toContain("Costa");
    expect(titles.join("|")).toContain("Petrov");
  });

  describe("the_plan_folds_to_five_and_opens_into_groups_by_kind", () => {
    function crowdedPlan(overdue: number) {
      const base = summary();
      if (base.desk?.status !== "ok") throw new Error("fixture has a desk");
      const rows = Array.from({ length: overdue }, (_, i) =>
        leaving(`Late ${i}`, `4${String(i).padStart(2, "0")}`, true),
      );
      return summary({
        desk: { status: "ok", data: { ...base.desk.data, departures: rows } },
      });
    }

    it("shows_the_five_most_urgent_and_says_how_many_are_left", () => {
      view(crowdedPlan(7));
      const plan = screen.getByRole("region", { name: "Do these in order" });
      expect(within(plan).getAllByRole("heading", { level: 3 })).toHaveLength(
        5,
      );
      expect(
        within(plan).getByRole("button", { name: "Show 6 more" }),
      ).toHaveAttribute("aria-expanded", "false");
      expect(within(plan).queryByText(/Overdue departures ·/)).toBeNull();
    });

    it("opens_into_a_group_for_each_kind_in_the_same_order", () => {
      view(crowdedPlan(7));
      const plan = screen.getByRole("region", { name: "Do these in order" });
      fireEvent.click(
        within(plan).getByRole("button", { name: "Show 6 more" }),
      );
      const labels = within(plan)
        .getAllByText(/ · \d+$/)
        .map((node) => node.textContent);
      expect(labels).toEqual([
        "Overdue departures · 7",
        "Late arrivals · 1",
        "Rooms at risk · 2",
        "No expected time · 1",
      ]);
      expect(within(plan).getAllByRole("heading", { level: 3 })).toHaveLength(
        11,
      );
    });

    it("a_short_plan_is_shown_whole_with_nothing_to_open", () => {
      view(summary());
      const plan = screen.getByRole("region", { name: "Do these in order" });
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
    const plan = screen.getByRole("region", { name: "Do these in order" });
    expect(
      await within(plan).findByRole("button", { name: /Check .*Kaya.* out/ }),
    ).toBeInTheDocument();
    // Kaya can be checked out from the row; Aydın's viewer is sent to the screen.
    expect(
      within(plan).getAllByRole("link", { name: "Open Departures" }),
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
    expect(screen.getByText("Nothing is waiting on you.")).toBeInTheDocument();
    expect(
      screen.getByText("No arrival has a time in this window."),
    ).toBeInTheDocument();
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
    expect(tile("102")).toHaveAccessibleName("102, In house");
    expect(tile("306")).toHaveAccessibleName("306, Out of service");
    expect(tile("305")).toHaveAccessibleName("305, Dirty");
    expect(within(map).getAllByRole("button")).toHaveLength(8);
  });

  it("choosing_an_arrival_marks_other_ready_rooms_of_the_same_type_that_can_take_them", () => {
    view(summary(), { layout: "house" });
    fireEvent.click(screen.getByRole("button", { name: /Demir/ }));
    const map = screen.getByRole("region", { name: "The house" });
    // 101 and 207 are ready Doubles, but 207 is booked for Petrov; 205 is a
    // Twin. Only 101 can take him.
    expect(within(map).getAllByText("Can take")).toHaveLength(1);
    expect(
      screen.getByText("Ready rooms of this type: 101."),
    ).toBeInTheDocument();
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
      "305, Dirty",
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
    expect(steps[5]).toHaveTextContent("5");
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
