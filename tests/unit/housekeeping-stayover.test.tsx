/**
 * Cleaning of rooms somebody is staying in, as a person sees it (RANZ-83,
 * ADR 0063, HK-S4-*).
 *
 * The database proves which rooms are due (`housekeeping_stayover.test.sql`)
 * and the browser spec proves the press end to end. These are the rows only
 * the interface keeps: the defaults the operating model picks, what each
 * schedule is called, the board a hotel with no schedule still sees, a reader
 * who may not mark, and the press answering on the card.
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
import type {
  HousekeepingBoard as Board,
  StayoverBoard,
  StayoverCadence,
  StayoverRoom,
} from "../../packages/ranza/housekeeping/src";
import {
  isStayoverCadence,
  stayoverValueOf,
} from "../../packages/ranza/housekeeping/src";
import { messages } from "../../apps/operator-workspace/src/messages";
import type { SupportedLocale } from "../../packages/i18n/src";
import { stayoverDefaultFor } from "../../apps/operator-workspace/src/features/housekeeping/stayover";

const markRooms = vi.fn();
const markStayoverCleaned = vi.fn();
const undoStayoverCleaned = vi.fn();
vi.mock("../../apps/operator-workspace/src/server/housekeeping", () => ({
  markRooms: (...args: unknown[]) => markRooms(...args),
  markStayoverCleaned: (...args: unknown[]) => markStayoverCleaned(...args),
  undoStayoverCleaned: (...args: unknown[]) => undoStayoverCleaned(...args),
  setStayover: vi.fn(),
}));

const push = vi.fn();
const router = { push };
vi.mock("../../apps/operator-workspace/node_modules/next/navigation", () => ({
  useRouter: () => router,
}));

const { HousekeepingBoard } =
  await import("../../apps/operator-workspace/src/features/housekeeping/components/housekeeping-board");
const { StayoverList } =
  await import("../../apps/operator-workspace/src/features/housekeeping/components/stayover-list");

Element.prototype.scrollIntoView = vi.fn();

// An action's state is what it returned, so a mock that returns nothing would
// leave the card reading `undefined.status`.
const DONE = { status: "done" } as const;

beforeEach(() => {
  markStayoverCleaned.mockResolvedValue(DONE);
  undoStayoverCleaned.mockResolvedValue(DONE);
});

afterEach(() => {
  cleanup();
  markRooms.mockReset();
  markStayoverCleaned.mockReset();
  undoStayoverCleaned.mockReset();
});

function stayoverRoom(overrides: Partial<StayoverRoom>): StayoverRoom {
  return {
    unitId: "5a000000-0000-4000-8000-000000000001",
    name: "A-101",
    building: "Blok A",
    floor: 1,
    bedCount: 2,
    occupants: 2,
    arrivedOn: "2026-10-01",
    lastCleanedOn: null,
    dueOn: "2026-10-08",
    overdueDays: 0,
    doneToday: false,
    ...overrides,
  };
}

const WEEKLY: StayoverCadence = { kind: "weekly", weekday: 1 };

function stayoverOf(
  rooms: StayoverRoom[],
  overrides: Partial<StayoverBoard> = {},
): StayoverBoard {
  return {
    cadence: WEEKLY,
    today: "2026-10-31",
    rooms,
    counts: {
      due: rooms.filter((r) => !r.doneToday).length,
      done: rooms.filter((r) => r.doneToday).length,
    },
    mayMark: true,
    ...overrides,
  };
}

function inLocale(locale: SupportedLocale, children: React.ReactNode) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      {children}
    </NextIntlClientProvider>
  );
}

function showList(
  board: StayoverBoard,
  locale: SupportedLocale = "en",
): ReturnType<typeof render> {
  cleanup();
  return render(
    inLocale(locale, <StayoverList board={board} locale={locale} />),
  );
}

const EMPTY_TURNOVER: Board = {
  rooms: [],
  counts: { rooms: 0, dirty: 0, clean: 0, inspected: 0 },
  mayMark: true,
};

function showBoard(stayover: StayoverBoard | null) {
  cleanup();
  return render(
    inLocale(
      "en",
      <HousekeepingBoard
        allHref=""
        board={EMPTY_TURNOVER}
        days={{}}
        locale="en"
        markLimit={60}
        narrowed={null}
        propertyName="Deniz Otel"
        reportHref={null}
        stayover={stayover}
        timeZone="Europe/Istanbul"
      />,
    ),
  );
}

describe("the default schedule (HK-S4-01)", () => {
  it("is daily for a hotel and weekly on Monday for a dormitory, and only a default", () => {
    expect(stayoverDefaultFor("hotel")).toEqual({
      kind: "every_n_days",
      everyDays: 1,
    });
    expect(stayoverDefaultFor("dormitory")).toEqual({
      kind: "weekly",
      weekday: 1,
    });
    expect(stayoverDefaultFor(null)).toEqual({
      kind: "every_n_days",
      everyDays: 1,
    });
  });
});

describe("a schedule the database would accept (HK-S4-02)", () => {
  it("accepts never, every one to fourteen days, and any ISO weekday", () => {
    expect(isStayoverCadence({ kind: "none" })).toBe(true);
    expect(isStayoverCadence({ kind: "every_n_days", everyDays: 1 })).toBe(
      true,
    );
    expect(isStayoverCadence({ kind: "every_n_days", everyDays: 14 })).toBe(
      true,
    );
    expect(isStayoverCadence({ kind: "weekly", weekday: 7 })).toBe(true);
  });

  it("refuses what the check constraint would, before a statement runs", () => {
    expect(isStayoverCadence({ kind: "every_n_days", everyDays: 0 })).toBe(
      false,
    );
    expect(isStayoverCadence({ kind: "every_n_days", everyDays: 15 })).toBe(
      false,
    );
    expect(isStayoverCadence({ kind: "every_n_days", everyDays: 1.5 })).toBe(
      false,
    );
    expect(isStayoverCadence({ kind: "weekly", weekday: 0 })).toBe(false);
    expect(isStayoverCadence({ kind: "weekly", weekday: 8 })).toBe(false);
    expect(isStayoverCadence({ kind: "daily" })).toBe(false);
    expect(isStayoverCadence(null)).toBe(false);
  });

  it("words a schedule the way the audit log records it", () => {
    expect(stayoverValueOf(null)).toBe("default");
    expect(stayoverValueOf({ kind: "none" })).toBe("none");
    expect(stayoverValueOf({ kind: "every_n_days", everyDays: 3 })).toBe(
      "every_3_days",
    );
    expect(stayoverValueOf(WEEKLY)).toBe("weekly_1");
  });
});

describe("the stayover list", () => {
  it("says nothing is due, and what the schedule is, when no room is (HK-S4-12)", () => {
    showList(stayoverOf([]));
    expect(screen.getByText("No rooms in use are due")).toBeInTheDocument();
    expect(
      screen.getByText(/At this Property: Every week on Monday\./),
    ).toBeInTheDocument();
  });

  it("shows one room, with how overdue it is and since when it has been in (HK-S4-06)", () => {
    showList(stayoverOf([stayoverRoom({ overdueDays: 1 })]));
    const card = screen.getByTestId("stayover-card");
    expect(within(card).getByText("A-101")).toBeInTheDocument();
    expect(within(card).getByText("Overdue by 1 day")).toBeInTheDocument();
    expect(
      within(card).getByText("2 people in the room · 2 beds"),
    ).toBeInTheDocument();
    expect(within(card).getByText(/In since Oct 1/)).toBeInTheDocument();
  });

  it("says 'Due today' for a room that fell due today and 'Last cleaned' for one cleaned before", () => {
    showList(
      stayoverOf([
        stayoverRoom({ name: "A-101", lastCleanedOn: "2026-10-24" }),
        stayoverRoom({
          unitId: "5a000000-0000-4000-8000-000000000002",
          name: "A-102",
          overdueDays: 3,
        }),
      ]),
    );
    expect(screen.getByText("Due today")).toBeInTheDocument();
    expect(screen.getByText(/Last cleaned Oct 24/)).toBeInTheDocument();
    expect(screen.getByText("Overdue by 3 days")).toBeInTheDocument();
  });

  it("filters by block and then floor, with the counts on the chips (HK-S4-09)", () => {
    showList(
      stayoverOf([
        stayoverRoom({
          unitId: "a1",
          name: "A-101",
          building: "Blok A",
          floor: 1,
        }),
        stayoverRoom({
          unitId: "a2",
          name: "A-201",
          building: "Blok A",
          floor: 2,
        }),
        stayoverRoom({
          unitId: "b1",
          name: "B-101",
          building: "Blok B",
          floor: 1,
        }),
      ]),
    );
    expect(screen.getAllByTestId("stayover-card")).toHaveLength(3);

    const block = screen.getByRole("group", { name: "Block" });
    fireEvent.click(within(block).getByRole("button", { name: /^Blok B/ }));
    expect(screen.getAllByTestId("stayover-card")).toHaveLength(1);
    expect(screen.getByText("B-101")).toBeInTheDocument();

    fireEvent.click(within(block).getByRole("button", { name: /^All blocks/ }));
    const floor = screen.getByRole("group", { name: "Floor" });
    fireEvent.click(within(floor).getByRole("button", { name: /^Floor 2/ }));
    expect(screen.getAllByTestId("stayover-card")).toHaveLength(1);
    expect(screen.getByText("A-201")).toBeInTheDocument();
  });

  it("offers no block chips when there is only one block (HK-S4-09)", () => {
    showList(stayoverOf([stayoverRoom({ name: "A-101" })]));
    expect(
      screen.queryByRole("group", { name: "Block" }),
    ).not.toBeInTheDocument();
  });

  it("marks a room in one press and answers on the card at once, with Undo where the button was (HK-S4-10)", () => {
    showList(stayoverOf([stayoverRoom({})]));
    fireEvent.click(screen.getByRole("button", { name: "Mark A-101 cleaned" }));
    expect(markStayoverCleaned).toHaveBeenCalledTimes(1);
    const form = markStayoverCleaned.mock.calls[0]![1] as FormData;
    expect(form.get("unitId")).toBe("5a000000-0000-4000-8000-000000000001");
    expect(
      within(screen.getByTestId("stayover-card")).getByText("Cleaned today"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Undo cleaning of A-101" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mark A-101 cleaned" }),
    ).not.toBeInTheDocument();
  });

  it("offers Undo, and not Mark, on a room already cleaned today (HK-S4-11)", () => {
    showList(stayoverOf([stayoverRoom({ doneToday: true })]));
    expect(
      screen.queryByRole("button", { name: "Mark A-101 cleaned" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Undo cleaning of A-101" }),
    );
    expect(undoStayoverCleaned).toHaveBeenCalledTimes(1);
    // The card answers before the server does: the room is due again.
    expect(
      screen.getByRole("button", { name: "Mark A-101 cleaned" }),
    ).toBeInTheDocument();
  });

  it("shows a reader who may not mark every room and no button, and says why (HK-S4-13)", () => {
    showList(stayoverOf([stayoverRoom({})], { mayMark: false }));
    expect(screen.getByText("A-101")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Mark/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/You can see these rooms but not mark them cleaned/),
    ).toBeInTheDocument();
  });

  it("congratulates nobody and counts honestly when every room is done", () => {
    showList(stayoverOf([stayoverRoom({ doneToday: true })]));
    expect(
      screen.getByText("Every room in use is cleaned for today."),
    ).toBeInTheDocument();
  });

  it.each(["tr", "en", "ar"] as const)(
    "reads in %s without a missing word",
    (locale) => {
      const { container } = showList(
        stayoverOf([stayoverRoom({ overdueDays: 2 })]),
        locale,
      );
      expect(container.textContent).toContain("A-101");
      expect(container.textContent).not.toMatch(/housekeeping\.|stayover[A-Z]/);
      expect(screen.getByRole("button", { name: /A-101/ })).toBeInTheDocument();
    },
  );
});

describe("the board around it (HK-S4-03, HK-S4-04)", () => {
  it("is exactly the turnover board when the Property has no schedule", () => {
    showBoard(stayoverOf([], { cadence: { kind: "none" } }));
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByText("No rooms here yet")).toBeInTheDocument();
  });

  it("is exactly the turnover board when the stayover list is not offered", () => {
    showBoard(null);
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByText("No rooms here yet")).toBeInTheDocument();
  });

  it("puts Stayover due beside Turnover, with the count, when there is a schedule", () => {
    showBoard(
      stayoverOf([
        stayoverRoom({}),
        stayoverRoom({ unitId: "x", name: "A-102" }),
      ]),
    );
    expect(screen.getByRole("tab", { name: "Turnover" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Stayover due · 2" }),
    ).toBeInTheDocument();
  });
});

describe("the catalogue", () => {
  it("has every stayover word in all three languages", () => {
    const keys = Object.keys(messages.en.housekeeping).filter((key) =>
      /^(stayover|cadence|noBlock|turnoverTab)/.test(key),
    );
    expect(keys.length).toBeGreaterThan(20);
    for (const locale of ["tr", "ar"] as const) {
      for (const key of keys) {
        const value = (messages[locale].housekeeping as Record<string, string>)[
          key
        ];
        expect(value, `${locale} ${key}`).toBeTruthy();
      }
    }
  });
});
