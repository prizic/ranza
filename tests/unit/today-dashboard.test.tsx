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
        since: null,
      },
    ],
    cleanFirstTotal: 12,
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
        rows: [
          {
            stayId: "s-1",
            reference: "RZ-9",
            guestName: "Ece Koç",
            unit: { unitName: "118", roomName: null },
            endsOn: "2026-09-25",
            overdue: false,
            balance: { amountMinor: 184_000, currency: "TRY" },
            folioId: "f-1",
          },
        ],
      },
    },
    occupancy: {
      status: "ok",
      data: { sellable: 96, inHouse: 79, expectedTonight: 85 },
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
            locale={locale}
            name="Selin"
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
    expect(screen.getByText("1 gecikmiş")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /Çıkışlar/ }));
    expect(screen.getByText(/1\.840/)).toBeInTheDocument();
  });
});

describe("housekeeping", () => {
  it("sends a room not ready to the board, not to Arrivals", () => {
    view(housekeeping());
    const section = screen.getByRole("region", { name: /Dikkat gerekiyor/ });
    expect(within(section).getByRole("link")).toHaveAttribute(
      "href",
      `/tr/housekeeping?property=${PROPERTY}`,
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
      at("arrivals"),
      at("arrivals"),
      at("departures"),
      at("finance", "&folio=f-1"),
    ]);
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

describe("the finance card", () => {
  it("says so when no open Folio is owed anything, rather than an empty list", () => {
    view({
      day: DAY,
      focus: "finance",
      mayBook: false,
      money: {
        status: "ok",
        data: { openFolios: 0, openBalance: [], largest: [] },
      },
      attention: { items: [], complete: true },
    });
    expect(screen.getByText("Açık bakiye yok.")).toBeInTheDocument();
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
      fireEvent.click(screen.getAllByRole("button", { pressed: false })[0]!);
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
    expect(within(card).getByText("Rooms out of order")).toBeInTheDocument();
    expect(within(card).getByText("Waiting for parts")).toBeInTheDocument();
    // Every figure, and the card's own link, opens the board at the Property.
    const links = within(card).getAllByRole("link");
    expect(links).toHaveLength(5);
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(
        new RegExp(`/maintenance\\?property=${PROPERTY}$`),
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
