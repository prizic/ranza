/**
 * Today, as a person sees it (docs/features/today-dashboard, slice 1 interface
 * rows). The summary is given; what is decided here is only what the page does
 * with it: which figures lead, what an empty or failed card says, that every
 * figure is a way in, and that a refresh that fails keeps what was true.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { QueryProvider } from "../../apps/operator-workspace/src/app/providers/query-provider";
import {
  Hydrated,
  requestQueryClient,
} from "../../apps/operator-workspace/src/app/providers/hydrate";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";
import type { SupportedLocale } from "../../packages/i18n/src";
import type {
  AttentionItem,
  TodaySummary,
} from "../../apps/operator-workspace/src/server/today-derive";
import {
  REFRESH_MS,
  TodayDashboard,
} from "../../apps/operator-workspace/src/features/today/components/today-dashboard";
import { todayKeys } from "../../apps/operator-workspace/src/features/today/query-keys";

// The commands a row offers: the server actions the Arrivals, Departures and
// Housekeeping screens already call, which reach the composition root and a
// database. Here only whether a row offers them is in question.
vi.mock("../../apps/operator-workspace/src/server/housekeeping", () => ({
  markRooms: vi.fn(),
}));
vi.mock("../../apps/operator-workspace/src/server/front-office", () => ({
  checkInReservation: vi.fn(),
  checkOutStay: vi.fn(),
}));

const PROPERTY = "d0000003-0000-4000-8000-000000000001";
const SCOPE = { userId: "u", organizationId: "o", propertyId: PROPERTY };

const DAY: TodaySummary["day"] = {
  propertyId: PROPERTY,
  propertyName: "Galata Rezidans",
  timezone: "Europe/Istanbul",
  currency: "TRY",
  businessDate: "2026-09-25",
  calendarDate: "2026-09-25",
  cutoff: "04:00",
};

const ROOMS = {
  status: "ok" as const,
  data: {
    total: 48,
    ready: 31,
    awaitingInspection: 6,
    dirty: 9,
    outOfService: 2,
    floors: [
      { floor: 1, ready: 11, total: 12 },
      { floor: 2, ready: 6, total: 12 },
    ],
    arrivalsWaiting: 3,
    cleanFirst: [
      {
        unitId: "u-204",
        name: "204",
        floor: 2,
        priority: "arrival" as const,
        status: "dirty" as const,
        inHouse: false,
        since: null,
      },
    ],
    cleanFirstTotal: 12,
    waitingOnGuests: 3,
    mayMark: true,
  },
};

function item(overrides: Partial<AttentionItem>): AttentionItem {
  return {
    kind: "not_ready",
    unit: { unitName: "204", roomName: null },
    guestName: "Lina Haddad",
    reference: "RZ-1",
    blocker: null,
    dueOn: null,
    ...overrides,
  };
}

function frontDesk(overrides: Partial<TodaySummary> = {}): TodaySummary {
  return {
    day: DAY,
    focus: "front_desk",
    mayBook: true,
    arrivals: {
      status: "ok",
      data: {
        expected: 18,
        checkedIn: 7,
        rows: [
          {
            reservationId: "r-1",
            reference: "RZ-1",
            guestName: "Lina Haddad",
            stayType: "guest",
            unit: { unitName: "204", roomName: null },
            startsOn: "2026-09-25",
            endsOn: "2026-09-28",
            state: "not_ready",
            blocker: null,
          },
        ],
      },
    },
    departures: {
      status: "ok",
      data: {
        due: 12,
        departed: 9,
        overdue: 1,
        longestOverdueDays: 3,
        rows: [
          {
            stayId: "s-1",
            reference: "RZ-9",
            guestName: "Ece Koç",
            unit: { unitName: "118", roomName: null },
            endsOn: "2026-09-25",
            overdue: false,
            overdueDays: 0,
            balance: { amountMinor: 184_000, currency: "TRY" },
            folioId: "f-1",
          },
        ],
      },
    },
    occupancy: {
      status: "ok",
      data: {
        sellable: 96,
        available: 96,
        inHouse: 79,
        expectedTonight: 85,
        leavingTonight: 0,
        arrivingTonight: 6,
      },
    },
    rooms: ROOMS,
    attention: {
      items: [
        item({}),
        item({
          kind: "overdue",
          dueOn: "2026-09-24",
          unit: { unitName: "311", roomName: null },
          guestName: "Jonas Weber",
        }),
      ],
      complete: true,
    },
    ...overrides,
  };
}

function housekeeping(): TodaySummary {
  return {
    day: DAY,
    focus: "housekeeping",
    mayBook: false,
    rooms: ROOMS,
    attention: {
      items: [item({ guestName: null, reference: null })],
      complete: true,
    },
  };
}

/**
 * Mounted the way the page mounts it: the summary prefetched into a request
 * client and handed over through `Hydrated`, under the workspace's own
 * provider, so the retry policy and the stale time are the real ones.
 */
function view(summary: TodaySummary, locale: SupportedLocale = "tr") {
  const prefetched = requestQueryClient();
  prefetched.setQueryData(todayKeys.summary(SCOPE), summary);
  return render(
    <QueryProvider scope={SCOPE.userId}>
      <Hydrated client={prefetched}>
        <NextIntlClientProvider locale={locale} messages={messages[locale]}>
          <TodayDashboard
            clock="09:41"
            greeting="morning"
            initialLayout="overview"
            locale={locale}
            name="Selin"
            nowMs={0}
            properties={[]}
            scope={SCOPE}
          />
        </NextIntlClientProvider>
      </Hydrated>
    </QueryProvider>,
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  // A refresh that never settles unless a test says otherwise: the first
  // paint is the prefetched summary.
  fetchMock.mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the front desk", () => {
  it("leads with arrivals and departures, and greets by name", () => {
    view(frontDesk());
    expect(screen.getByText("Günaydın,")).toBeInTheDocument();
    expect(screen.getByText("Selin")).toBeInTheDocument();
    expect(screen.getByText("Giriş yapıldı")).toBeInTheDocument();
    expect(screen.getByText("Çıkış yapıldı")).toBeInTheDocument();
    expect(
      screen.getByText("1 kişi ayrılmadı, 3 gün gecikmiş"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Yeni rezervasyon/ }),
    ).toBeInTheDocument();
  });

  it("every_way_in_carries_the_property", () => {
    view(frontDesk());
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(8);
    for (const link of links) {
      expect(link.getAttribute("href")).toContain(`property=${PROPERTY}`);
    }
  });

  it("a balance is shown in the Property's currency", () => {
    view(frontDesk());
    fireEvent.click(screen.getByRole("tab", { name: /Çıkışlar/ }));
    expect(screen.getByText(/1\.840/)).toBeInTheDocument();
  });
});

describe("housekeeping", () => {
  it("sends a room not ready to the board, not to Arrivals", () => {
    view(housekeeping());
    const section = screen.getByRole("region", { name: /Dikkat gerekiyor/ });
    expect(within(section).getByRole("link")).toHaveAttribute(
      "href",
      `/tr/housekeeping?property=${PROPERTY}&show=for_arrival`,
    );
  });

  it("leads with the rooms to clean first, and shows no money", () => {
    const { container } = view(housekeeping());
    expect(
      screen.getByRole("heading", { name: "Önce bunları temizleyin" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Temizlenecek")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/₺|TRY|Bakiye/);
    expect(screen.queryByRole("link", { name: /Yeni rezervasyon/ })).toBeNull();
  });
});

describe("needs attention", () => {
  it("nothing_needs_attention_is_said_not_hidden", () => {
    view(frontDesk({ attention: { items: [], complete: true } }));
    expect(
      screen.getByText("Dikkat gerektiren bir şey yok."),
    ).toBeInTheDocument();
  });

  it("an attention list built from a failed read never says all is well", () => {
    view(frontDesk({ attention: { items: [], complete: false } }));
    expect(screen.queryByText("Dikkat gerektiren bir şey yok.")).toBeNull();
    expect(screen.getByText(/eksik olabilir/)).toBeInTheDocument();
  });

  it("attention_items_are_ordered_and_capped", () => {
    const items = Array.from({ length: 6 }, (_, index) =>
      item({ unit: { unitName: `2${index}0`, roomName: null } }),
    );
    view(frontDesk({ attention: { items, complete: true } }));
    const section = screen.getByRole("region", { name: /Dikkat gerekiyor/ });
    expect(within(section).getAllByRole("link")).toHaveLength(4);
    fireEvent.click(
      within(section).getByRole("button", { name: "2 tane daha" }),
    );
    expect(within(section).getAllByRole("link")).toHaveLength(6);
  });
});

describe("the folded attention row", () => {
  const overdue = (index: number) =>
    item({
      kind: "overdue",
      dueOn: "2026-09-24",
      unit: { unitName: `3${index}0`, roomName: null },
      guestName: `Guest ${index}`,
    });

  it("shows_the_first_of_every_kind_so_a_long_run_of_one_hides_none_of_the_rest", () => {
    // TODAY-06: eight overdue Guests used to push the blocked arrival and the
    // Guest leaving with a balance behind a "more" button.
    const items = [
      ...Array.from({ length: 8 }, (_, index) => overdue(index)),
      item({ kind: "blocked", blocker: "unit_blocked" }),
      item({
        kind: "balance",
        balance: { amountMinor: 5000, currency: "TRY" },
      }),
    ];
    view(frontDesk({ attention: { items, complete: true } }), "en");
    const section = screen.getByRole("region", { name: /Needs attention/ });
    const links = within(section).getAllByRole("link");
    // Still four cards: the first overdue Guest, the blocked arrival and the
    // Guest leaving with a balance, then the next overdue one; six sit behind
    // the button.
    expect(links).toHaveLength(4);
    expect(within(section).getByText("Can't check in")).toBeInTheDocument();
    expect(
      within(section).getByText("Leaving with a balance"),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole("button", { name: "6 more" }),
    ).toBeInTheDocument();
  });
});

describe("where attention leads", () => {
  it("each kind of item opens the list that resolves it", () => {
    const at = (path: string, extra = "") =>
      `/en/${path}?property=${PROPERTY}${extra}`;
    view(
      frontDesk({
        attention: {
          items: [
            item({ kind: "not_ready" }),
            item({ kind: "blocked", blocker: "unit_occupied" }),
            item({ kind: "overdue", dueOn: "2026-09-24" }),
            item({
              kind: "balance",
              balance: { amountMinor: 184_000, currency: "TRY" },
              folioId: "f-1",
            }),
          ],
          complete: true,
        },
      }),
      "en",
    );
    const section = screen.getByRole("region", { name: /Needs attention/ });
    expect(
      within(section)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual([
      // A desk that may mark rooms goes where one tap readies the room.
      at("housekeeping", "&show=for_arrival"),
      at("arrivals"),
      at("departures"),
      at("finance", "&folio=f-1"),
    ]);
  });

  it("a desk that may not mark rooms is sent to the arrival, where the Guest is", () => {
    const summary = frontDesk({
      attention: { items: [item({ kind: "not_ready" })], complete: true },
    });
    view(
      {
        ...summary,
        rooms: summary.rooms && {
          status: "ok",
          data: { ...ROOMS.data, mayMark: false },
        },
      },
      "en",
    );
    expect(
      within(screen.getByRole("region", { name: /Needs attention/ })).getByRole(
        "link",
      ),
    ).toHaveAttribute("href", `/en/arrivals?property=${PROPERTY}`);
  });

  it("out of service opens the board where there is one, and Rooms where not", () => {
    const out = item({
      kind: "out_of_service",
      guestName: null,
      reference: null,
    });
    view(frontDesk({ attention: { items: [out], complete: true } }), "en");
    expect(
      within(screen.getByRole("region", { name: /Needs attention/ })).getByRole(
        "link",
      ),
    ).toHaveAttribute("href", `/en/housekeeping?property=${PROPERTY}`);
    cleanup();
    const { rooms: _rooms, ...noBoard } = frontDesk({
      attention: { items: [out], complete: true },
    });
    view(noBoard, "en");
    expect(
      within(screen.getByRole("region", { name: /Needs attention/ })).getByRole(
        "link",
      ),
    ).toHaveAttribute("href", `/en/rooms?property=${PROPERTY}`);
  });
});

describe("states", () => {
  it("an_empty_day_reads_zero_and_offers_a_next_step", () => {
    view(
      frontDesk({
        arrivals: {
          status: "ok",
          data: { expected: 0, checkedIn: 0, rows: [] },
        },
      }),
    );
    expect(screen.getByText("Bugün kimse gelmiyor")).toBeInTheDocument();
    // The figure stays where it always is, reading zero.
    const tile = screen.getByText("Giriş yapıldı").closest("a")!;
    expect(tile.textContent?.replace(/\s/g, " ")).toContain("0 / 0");
    expect(
      screen.getByRole("link", { name: "Rezervasyonları aç" }),
    ).toHaveAttribute("href", `/tr/reservations?property=${PROPERTY}`);
  });

  it("a section that could not be read offers a retry and leaves the rest", () => {
    view(frontDesk({ rooms: { status: "unavailable" } }));
    expect(screen.getAllByText("Bu bölüm okunamadı").length).toBeGreaterThan(0);
    expect(screen.getByText("Giriş yapıldı")).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole("button", { name: /Yeniden dene/ })[0]!,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/today?property=${PROPERTY}`,
      expect.anything(),
    );
  });

  it("today_with_no_cards_says_so", () => {
    view({
      day: DAY,
      focus: "none",
      mayBook: false,
      attention: { items: [], complete: true },
    });
    expect(screen.getByText(/rolünüz için/)).toBeInTheDocument();
  });

  it("today_with_no_cards_says_so, whatever the focus", () => {
    // Finance leads, but the Property has no billing: nothing to show, and
    // never a calm all-clear over an empty grid.
    view({
      day: DAY,
      focus: "finance",
      mayBook: false,
      attention: { items: [], complete: true },
    });
    expect(screen.getByText(/rolünüz için/)).toBeInTheDocument();
    expect(screen.queryByText("Dikkat gerektiren bir şey yok.")).toBeNull();
  });

  it("after midnight it says the working day is still yesterday", () => {
    view(
      frontDesk({
        day: { ...DAY, businessDate: "2026-09-24", calendarDate: "2026-09-25" },
      }),
    );
    expect(screen.getByText(/Perşembe/)).toBeInTheDocument();
    expect(
      screen.getByText(/04:00 itibarıyla yeni güne geçer/),
    ).toBeInTheDocument();
  });
});

describe("staying current", () => {
  it("the_summary_refreshes_on_an_interval_and_on_focus", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Answered, so the focus refresh is not folded into one still in flight.
    fetchMock.mockImplementation(async () =>
      Response.json({ summary: frontDesk() }),
    );
    view(frontDesk());
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_MS + 10);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(REFRESH_MS).toBe(60_000);

    // Coming back to the tab reads again at once, not after the provider's
    // stale time.
    await act(async () => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      window.dispatchEvent(new Event("visibilitychange"));
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a card that fails is shown stale once, then as unavailable with a retry", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockImplementation(async () =>
      Response.json({
        summary: frontDesk({ rooms: { status: "unavailable" } }),
      }),
    );
    view(frontDesk());
    expect(screen.queryByText("Bu bölüm okunamadı")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_MS + 10);
    });
    // Kept, and the page says it is not current.
    expect(screen.getByText(/Yenilenemedi/)).toBeInTheDocument();
    expect(screen.queryByText("Bu bölüm okunamadı")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_MS + 10);
    });
    expect(screen.getAllByText("Bu bölüm okunamadı").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /Yeniden dene/ }).length,
    ).toBeGreaterThan(0);
  });

  it("a_failed_refresh_keeps_the_last_numbers_and_says_their_time", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockImplementation(
      async () => new Response(null, { status: 500 }),
    );
    view(frontDesk());
    expect(screen.queryByText(/Yenilenemedi/)).toBeNull();
    // The interval, then the provider's two retries on a 5xx.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_MS + 10_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Stale, and saying so — never blank, never passed off as current.
    expect(screen.getByText(/Yenilenemedi/)).toBeInTheDocument();
    expect(screen.getByText("Giriş yapıldı")).toBeInTheDocument();
  });
});

describe("right to left", () => {
  it("names, rooms and references are isolated runs, never one joined string", () => {
    const { container } = view(frontDesk(), "ar");
    const runs = [...container.querySelectorAll("bdi")].map(
      (bdi) => bdi.textContent,
    );
    // The attention item for the overdue Guest: room and name apart, so an
    // Arabic line cannot reorder "311 · Jonas Weber" into something else.
    expect(runs).toContain("311");
    expect(runs).toContain("Jonas Weber");
    expect(runs).not.toContain("311 · Jonas Weber");
    expect(runs).toContain("Selin");
  });
});

describe("the finance tiles", () => {
  const finance = (leaving: boolean): TodaySummary => ({
    day: DAY,
    focus: "finance",
    mayBook: false,
    money: {
      status: "ok",
      data: {
        openFolios: 30,
        openOwing: 27,
        openOwed: [{ amountMinor: 9433500, currency: "TRY" }],
        openAtCheckOut: [{ amountMinor: 2800000, currency: "TRY" }],
        largest: [],
        ...(leaving
          ? {
              leaving: {
                owed: [{ amountMinor: 2000000, currency: "TRY" }],
                owing: 4,
                overdueOwing: 2,
                overdueBalance: [{ amountMinor: 900000, currency: "TRY" }],
                rows: [],
              },
            }
          : {}),
      },
    },
    attention: { items: [], complete: true },
  });

  it("open_folios_and_their_balance_are_one_tile_not_two_that_open_the_same_list", () => {
    // TODAY-17: two tiles shared the eyebrow "All Folios" and one list.
    view(finance(true), "en");
    expect(screen.getAllByText("All Folios", { exact: true })).toHaveLength(1);
    const tile = screen.getByRole("link", { name: /Open Folios/ });
    expect(tile).toHaveTextContent("30");
    expect(tile).toHaveTextContent(
      "Owed TRY 94,335.00, TRY 28,000.00 of it at check-out",
    );
  });

  it("the_departures_tile_says_it_is_owed_by_guests_leaving_or_overdue", () => {
    view(finance(true), "en");
    expect(
      screen.getByText("Owed by Guests leaving or overdue"),
    ).toBeInTheDocument();
  });
});

describe("the housekeeping tiles", () => {
  it("to_clean_says_how_many_more_rooms_wait_on_a_guest_leaving", () => {
    // TODAY-05: a room a Guest is still in is not work somebody can start.
    view(housekeeping(), "en");
    expect(screen.getByText("3 more waiting on Guests")).toBeInTheDocument();
    expect(
      screen.getByText("Dirty and awaiting inspection count empty rooms only."),
    ).toBeInTheDocument();
  });
});

describe("the finance card", () => {
  it("says so when no open Folio is owed anything, rather than an empty list", () => {
    view({
      day: DAY,
      focus: "finance",
      mayBook: false,
      money: {
        status: "ok",
        data: {
          openFolios: 0,
          openOwing: 0,
          openOwed: [],
          openAtCheckOut: [],
          largest: [],
        },
      },
      attention: { items: [], complete: true },
    });
    expect(screen.getByText("Açık folyolarda borç yok.")).toBeInTheDocument();
    expect(
      document.querySelector('[aria-labelledby="today-largest"] ul'),
    ).toBeNull();
  });
});

describe("every locale", () => {
  it.each([
    ["tr", "Dikkat gerekiyor", "₺1.840,00", "25 Eylül 2026"],
    ["en", "Needs attention", "TRY 1,840.00", "September 25, 2026"],
    ["ar", "يحتاج إلى انتباه", "1,840.00", "25 سبتمبر 2026"],
  ] as const)(
    "today_renders_in_every_locale: %s",
    (locale, title, amount, date) => {
      const { container } = view(frontDesk(), locale);
      expect(
        screen.getByRole("heading", { name: new RegExp(title) }),
      ).toBeInTheDocument();
      // Dates and money in that language's own forms, not one format for all.
      // Intl separates with non-breaking spaces; the words are what matter.
      const text = () => (container.textContent ?? "").replace(/\s/g, " ");
      expect(text()).toContain(date);
      fireEvent.click(screen.getAllByRole("tab", { selected: false })[0]!);
      expect(text()).toContain(amount);
    },
  );
});

describe("maintenance", () => {
  const MAINTENANCE = {
    status: "ok" as const,
    data: {
      open: 6,
      new: 2,
      inProgress: 3,
      waitingForParts: 1,
      outOfOrder: 4,
    },
  };
  const manager = (overrides: Partial<TodaySummary> = {}) =>
    frontDesk({ focus: "manager", maintenance: MAINTENANCE, ...overrides });

  it("the_manager_sees_open_maintenance_at_a_glance", () => {
    view(manager(), "en");
    const card = screen.getByRole("region", { name: "Maintenance" });
    expect(within(card).getByText("Out of order")).toBeInTheDocument();
    expect(within(card).getByText("Waiting for parts")).toBeInTheDocument();
    // Every figure, and the card's own link, opens the board at the Property.
    const links = within(card).getAllByRole("link");
    expect(links).toHaveLength(6);
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(
        new RegExp(`/maintenance\\?property=${PROPERTY}(&outOfOrder=1)?$`),
      );
    }
  });

  it("the_rooms_out_of_order_figure_opens_the_board_narrowed_to_held_rooms: the statuses open it whole", () => {
    view(manager(), "en");
    const card = screen.getByRole("region", { name: "Maintenance" });
    expect(
      within(card)
        .getByRole("link", { name: /Out of order/ })
        .getAttribute("href"),
    ).toBe(`/en/maintenance?property=${PROPERTY}&outOfOrder=1`);
    for (const name of [/New/, /In progress/, /Waiting for parts/]) {
      expect(
        within(card).getByRole("link", { name }).getAttribute("href"),
      ).toBe(`/en/maintenance?property=${PROPERTY}`);
    }
  });

  it("the_manager_sees_open_maintenance_at_a_glance: its held rooms are not the Rooms card's out of service", () => {
    // Stacked on one another, the two cards count different things, so they
    // must never read as the same figure under the same word.
    for (const locale of ["tr", "en", "ar"] as const) {
      expect(messages[locale].dashboard.roomsOutOfOrder).not.toBe(
        messages[locale].dashboard.outOfService,
      );
    }
  });

  it("an_open_urgent_request_needs_attention: its title is an isolated run", () => {
    const { container } = view(
      manager({
        attention: {
          items: [
            item({
              kind: "urgent_repair",
              guestName: null,
              reference: null,
              request: {
                number: 12,
                title: "تسرّب في السقف",
                equipmentName: null,
              },
            }),
            item({
              kind: "urgent_repair",
              unit: null,
              guestName: null,
              reference: null,
              request: { number: 13, title: "Stuck", equipmentName: "Lift 1" },
            }),
          ],
          complete: true,
        },
      }),
      "ar",
    );
    const runs = [...container.querySelectorAll("bdi")].map(
      (bdi) => bdi.textContent,
    );
    expect(runs).toContain("تسرّب في السقف");
    expect(runs).toContain("Lift 1");
    const section = screen.getByRole("region", { name: /يحتاج إلى انتباه/ });
    for (const link of within(section).getAllByRole("link")) {
      expect(link).toHaveAttribute(
        "href",
        `/ar/maintenance?property=${PROPERTY}`,
      );
    }
  });

  it("a_failed_maintenance_read_leaves_the_rest: the card offers a retry", () => {
    view(manager({ maintenance: { status: "unavailable" } }), "en");
    const card = screen.getByRole("region", { name: "Maintenance" });
    expect(within(card).getByText(/could not be read/i)).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: /Try again/ }));
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/today?property=${PROPERTY}`,
      expect.anything(),
    );
    expect(screen.getByText("Checked in")).toBeInTheDocument();
  });
});

describe("the day, as the UX audit found it", () => {
  afterEach(() => {
    window.dispatchEvent(new Event("online"));
  });

  it("a_tab_gone_offline_says_its_figures_are_old_like_a_failed_refresh", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    view(frontDesk(), "en");
    expect(screen.getByRole("status")).toHaveTextContent(/^Updated/);
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
      await vi.advanceTimersByTimeAsync(REFRESH_MS + 10);
    });
    // Nothing failed: the browser is holding the refresh back. The figures are
    // going stale all the same.
    expect(screen.getByRole("status")).toHaveTextContent(/Couldn't refresh/);
  });

  it("the_overdue_guest_is_a_number_of_days_on_the_tile_the_row_and_the_card", () => {
    const summary = frontDesk();
    view(
      {
        ...summary,
        departures: summary.departures && {
          status: "ok",
          data: {
            ...(summary.departures.status === "ok"
              ? summary.departures.data
              : { due: 0, departed: 0, overdue: 0, rows: [] }),
            longestOverdueDays: 10,
            rows: [
              {
                stayId: "s-late",
                reference: "RZ-3",
                guestName: "Jonas Weber",
                unit: { unitName: "311", roomName: null },
                endsOn: "2026-09-15",
                overdue: true,
                overdueDays: 10,
                mayCheckOut: false,
              },
            ],
          },
        },
        attention: {
          items: [
            item({
              kind: "overdue",
              dueOn: "2026-09-15",
              overdueDays: 10,
              unit: { unitName: "311", roomName: null },
              guestName: "Jonas Weber",
            }),
          ],
          complete: true,
        },
      },
      "en",
    );
    expect(screen.getByText("1 to leave, overdue 10 days")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Departures/ }));
    expect(screen.getByText("Overdue · 10 days")).toBeInTheDocument();
    expect(
      screen.getByText(/10 days overdue · was due to leave on Sep 15/),
    ).toBeInTheDocument();
  });

  it("tonight_says_of_how_many_rooms_it_is_counted", () => {
    view(
      frontDesk({
        occupancy: {
          status: "ok",
          data: {
            sellable: 11,
            available: 9,
            inHouse: 4,
            expectedTonight: 5,
            leavingTonight: 0,
            arrivingTonight: 1,
          },
        },
      }),
      "en",
    );
    expect(
      screen.getByText(/Expected tonight 5 \/ 9 available rooms \(56%\)/),
    ).toBeInTheDocument();
  });

  it("tonight_says_that_an_overdue_guest_is_counted_as_staying", () => {
    // The fixture's departures card has one overdue Guest (TODAY-01).
    view(frontDesk(), "en");
    expect(
      screen.getByText(/Counts 1 overdue Guest as staying until checked out\./),
    ).toBeInTheDocument();
  });

  it("movements_are_tabs_and_the_arrow_keys_move_between_them", () => {
    view(frontDesk(), "en");
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
    // Only the selected tab is in the tab order; the arrows reach the other.
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    expect(tabs[1]).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName(/Departures/);
  });

  it("a_fraction_is_a_word_in_arabic_where_a_slash_reads_either_way", () => {
    const { container } = view(frontDesk(), "ar");
    expect(container.textContent).toMatch(/7\s*من\s*18/);
    cleanup();
    const english = view(frontDesk(), "en");
    expect(english.container.textContent).toMatch(/7\s*\/\s*18/);
  });

  it("the_time_zone_is_named_not_spelled_as_its_identifier", () => {
    const { container } = view(frontDesk(), "en");
    expect(container.textContent).not.toContain("Europe/Istanbul");
    expect(container.textContent).not.toContain("EUROPE/ISTANBUL");
    expect(screen.getByTitle("Europe/Istanbul")).toHaveTextContent(
      /Turkey|T[üu]rkiye/i,
    );
  });

  it("no_two_tiles_name_the_same_list_over_different_numbers", () => {
    view(frontDesk(), "en");
    // "Checked in 7 / 18" opens Arrivals; "rooms ready for waiting arrivals"
    // counts rooms, and says so: two tiles both titled Arrivals read as one
    // figure shown twice.
    expect(screen.getAllByText("Arrivals", { exact: true })).toHaveLength(1);
    expect(screen.getAllByText("Arrival rooms")).toHaveLength(1);
    cleanup();
    view(housekeeping(), "en");
    expect(screen.getAllByText("Arrival rooms")).toHaveLength(1);
  });
});
