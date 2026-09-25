/**
 * The Close the day screen, rendered: what it offers, and what it never says.
 *
 * The browser suite presses the buttons against a real database. These are the
 * interface rows it would take a second signed-in account to reach — a viewer
 * without `front_desk.close_day` — and the ones worth asserting in every
 * language rather than one: nothing on the screen promises Accounting, or says
 * a close cannot be undone (CD-S1-46).
 */
import type { ReactNode } from "react";
import { readFileSync } from "node:fs";
import {
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";
import type { CloseTheDay } from "../../packages/ranza/business-day/src";
import {
  supportedLocales,
  type SupportedLocale,
} from "../../packages/i18n/src";

// The server actions, which these components only call. Reaching them would
// drag in the composition root and a database connection.
vi.mock("../../apps/operator-workspace/src/server/close-day", () => ({
  closeBusinessDay: vi.fn(),
}));
vi.mock("../../apps/operator-workspace/src/server/front-office", () => ({
  cancelBooking: vi.fn(),
  markNoShow: vi.fn(),
}));
// Next lives in the workspace's own node_modules, so it is mocked by that path:
// the bare specifier would not resolve from here, and the component would get
// the real router, which throws outside a mounted app.
vi.mock("../../apps/operator-workspace/node_modules/next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../../apps/operator-workspace/node_modules/next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const { useWorkspaceNav } =
  await import("../../apps/operator-workspace/src/lib/nav");
const { CloseDayView } =
  await import("../../apps/operator-workspace/src/features/front-office/components/close-day-view");

const DUE: CloseTheDay = {
  propertyId: "d9000005-0000-4000-8000-000000000001",
  today: "2026-09-24",
  cutoff: "04:00",
  dayToClose: "2026-09-23",
  waiting: 1,
  checklistDay: "2026-09-23",
  notArrived: [],
  notDeparted: [],
  foliosLeftOpen: [],
  mayClose: true,
  recent: [],
};

function show(day: CloseTheDay, locale: SupportedLocale = "en") {
  cleanup();
  render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <CloseDayView day={day} locale={locale} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe("who is offered the close", () => {
  it("offers the close to a viewer who holds close_day", () => {
    show(DUE);
    expect(
      screen.getByRole("button", { name: /^Close Wednesday/ }),
    ).toBeTruthy();
  });

  it("the close is not offered to a viewer without the permission", () => {
    show({ ...DUE, mayClose: false });
    expect(screen.queryByRole("button", { name: /^Close / })).toBeNull();
    expect(
      screen.getByText(/closing it needs the Close the day permission/),
    ).toBeTruthy();
  });
});

describe("room nights", () => {
  it("room nights are named as not yet posted, and never hold up the close", () => {
    show(DUE);
    expect(screen.getByText(/posted here once rooms have rates/)).toBeTruthy();
    expect(screen.getByText("Not available yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Close / })).toBeTruthy();
  });
});

describe("a day still being worked", () => {
  it("a day still being worked says when it can close", () => {
    show({ ...DUE, dayToClose: null, waiting: 0, checklistDay: "2026-09-24" });
    expect(screen.getByText(/ is still open$/)).toBeTruthy();
    expect(screen.getByText(/can be closed after 04:00/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Close / })).toBeNull();
  });
});

describe("what the screen never says", () => {
  // The words for Accounting, and for "cannot be undone", in each language.
  const promises: Record<SupportedLocale, RegExp> = {
    en: /accounting|cannot be undone/i,
    tr: /muhasebe|geri alınamaz/i,
    ar: /المحاسبة|لا يمكن التراجع عن الإغلاق/,
  };

  for (const locale of supportedLocales) {
    it(`the screen promises nothing that is not built, in ${locale}`, () => {
      show(
        {
          ...DUE,
          waiting: 3,
          foliosLeftOpen: [
            {
              stayId: "d9000005-0000-4000-8000-000000000002",
              folioId: "d9000005-0000-4000-8000-000000000003",
              guestName: "Ada Lovelace",
              departedOn: "2026-09-22",
              unitName: "101",
              roomName: null,
              balanceMinor: 4500,
              currency: "TRY",
            },
          ],
        },
        locale,
      );
      expect(document.body.textContent).not.toMatch(promises[locale]);
    });
  }
});

const ARRIVAL = {
  reservationId: "d9000005-0000-4000-8000-000000000010",
  reference: "R1234567",
  guestName: "Ayşe Yılmaz",
  status: "confirmed" as const,
  startsOn: "2026-09-23",
  endsOn: "2026-09-26",
  unitName: "101",
  roomName: null,
  arrivable: true,
  mayMarkNoShow: true,
  mayCancel: true,
};

const DEPARTURE = {
  stayId: "d9000005-0000-4000-8000-000000000011",
  reference: null,
  guestName: null,
  endsOn: "2026-09-23",
  unitName: "103",
  roomName: null,
};

/**
 * Opens a row's menu the way a mouse does, and names what it offers. Not by
 * keyboard: Radix then moves focus to the first item by measuring the layout,
 * which jsdom does not have.
 */
function menuFor(guest: string): string[] {
  const trigger = screen.getByRole("button", {
    name: new RegExp(`More actions for .*${guest}`),
  });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  return screen
    .queryAllByRole("menuitem")
    .map((item) => item.textContent ?? "");
}

describe("what the day shows", () => {
  it("a backlog names the oldest day and how many wait", () => {
    show({
      ...DUE,
      dayToClose: "2026-09-21",
      checklistDay: "2026-09-21",
      waiting: 3,
    });
    expect(
      screen.getByText("Monday, September 21, 2026 is ready to close"),
    ).toBeTruthy();
    expect(screen.getByText("3 days waiting")).toBeTruthy();
    expect(
      screen.getByText(
        "3 days are waiting to be closed; the oldest comes first.",
      ),
    ).toBeTruthy();
  });

  it("a quiet day offers close without a reason, every step reading done", () => {
    show(DUE);
    expect(screen.getAllByText("Done")).toHaveLength(2);
    expect(screen.queryByText(/ open$/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Close / }));
    expect(screen.getByText(/Nothing is left open/)).toBeTruthy();
    expect(screen.queryByLabelText("Reason")).toBeNull();
  });

  it("recent closes say who or that it was automatic, with their counts", () => {
    show({
      ...DUE,
      recent: [
        {
          closeId: "d9000005-0000-4000-8000-000000000020",
          businessDate: "2026-09-22",
          closedAt: new Date("2026-09-23T04:01:00Z"),
          closedBy: null,
          automatic: true,
          arrived: 4,
          departed: 7,
          nightsOccupied: 31,
          foliosLeftOpen: 2,
          leftOpen: 1,
          reason: "Guest arriving late",
        },
      ],
    });
    const row = screen.getByText("Automatically").closest("tr");
    expect(
      Array.from(row?.querySelectorAll("td") ?? []).map(
        (cell) => cell.textContent,
      ),
    ).toEqual(["Sep 22, 2026", "Automatically", "4", "7", "31", "1", "2"]);
  });

  it("folios left open are listed with their balance", () => {
    show({
      ...DUE,
      foliosLeftOpen: [
        {
          stayId: "d9000005-0000-4000-8000-000000000002",
          folioId: "d9000005-0000-4000-8000-000000000003",
          guestName: "Ada Lovelace",
          departedOn: "2026-09-22",
          unitName: "101",
          roomName: null,
          balanceMinor: 4500,
          currency: "TRY",
        },
      ],
    });
    expect(screen.getByText(/45\.00/)).toBeTruthy();
    expect(screen.getByText("Does not hold up the close")).toBeTruthy();
  });
});

describe("open items offer the commands that resolve them", () => {
  it("links a booking still arriving to arrivals, and a Guest past departure to departures", () => {
    show({ ...DUE, notArrived: [ARRIVAL], notDeparted: [DEPARTURE] });
    expect(
      screen.getByRole("link", { name: "Open arrivals" }).getAttribute("href"),
    ).toBe(`/en/arrivals?property=${DUE.propertyId}`);
    expect(
      screen
        .getByRole("link", { name: "Open departures" })
        .getAttribute("href"),
    ).toBe(`/en/departures?property=${DUE.propertyId}`);
  });

  it("does not link a booking that can no longer be checked in", () => {
    show({ ...DUE, notArrived: [{ ...ARRIVAL, arrivable: false }] });
    expect(screen.queryByRole("link", { name: "Open arrivals" })).toBeNull();
  });

  it("offers a no-show and a cancellation only to a viewer holding front_desk.cancel", () => {
    show({ ...DUE, notArrived: [ARRIVAL] });
    expect(menuFor("Ayşe")).toEqual(
      expect.arrayContaining(["Mark as no-show", "Cancel booking"]),
    );

    show({
      ...DUE,
      notArrived: [{ ...ARRIVAL, mayCancel: false, mayMarkNoShow: false }],
    });
    const offered = menuFor("Ayşe");
    expect(offered).not.toContain("Mark as no-show");
    expect(offered).not.toContain("Cancel booking");
  });
});

describe("the dialog promises nothing that is not built either", () => {
  const promises: Record<SupportedLocale, RegExp> = {
    en: /accounting|cannot be undone/i,
    tr: /muhasebe|geri alınamaz/i,
    ar: /المحاسبة|لا يمكن التراجع عن الإغلاق/,
  };

  for (const locale of supportedLocales) {
    it(`the close dialog says a close is final until reopening exists, in ${locale}`, () => {
      show({ ...DUE, notArrived: [ARRIVAL] }, locale);
      fireEvent.click(screen.getAllByRole("button")[0]!);
      const dialog = screen.getByRole("dialog");
      expect(dialog.textContent).toContain(messages[locale].closeDay.final);
      expect(document.body.textContent).not.toMatch(promises[locale]);
    });
  }
});

describe("Arabic mirrors by construction", () => {
  // A physical utility is what does not mirror. Logical ones — ps, pe, ms, me,
  // start, end, text-start — are the only direction the screen may name.
  const physical =
    /\b(?:[mp][lr]|left|right|text-left|text-right|rounded-[lr]|border-[lr])-?\S*/;

  for (const file of ["close-day-view.tsx", "close-day-dialog.tsx"]) {
    it(`the close the day screen mirrors in Arabic: ${file} names no physical side`, () => {
      const source = readFileSync(
        `apps/operator-workspace/src/features/front-office/components/${file}`,
        "utf8",
      );
      const classes = [...source.matchAll(/className="([^"]*)"/g)]
        .flatMap((match) => match[1]!.split(/\s+/))
        .filter((token) => physical.test(token));
      expect(classes).toEqual([]);
    });
  }
});

describe("where the screen lives", () => {
  function railLinks(entitled: string[]): string[] {
    const { result } = renderHook(
      () => useWorkspaceNav("en", entitled, undefined),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <NextIntlClientProvider locale="en" messages={messages.en}>
            {children}
          </NextIntlClientProvider>
        ),
      },
    );
    return result.current.flatMap((entry) =>
      "children" in entry && entry.children
        ? entry.children.map((child) => child.href)
        : "href" in entry && entry.href
          ? [entry.href]
          : [],
    );
  }

  it("close the day is in the rail where the front desk is, and absent where it is not", () => {
    expect(railLinks(["today", "front_desk"])).toContain("/en/close-day");
    expect(railLinks(["today"])).not.toContain("/en/close-day");
  });
});
