/**
 * The Housekeeping board, as a person sees it (RANZ-28).
 *
 * The policies decide what a mark may do and the integration suite proves
 * them. These are the rows only the interface can keep: what an empty board
 * says, what a reader without the permission is shown, what every locale calls
 * a status, and what a refused mark leaves behind.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  HousekeepingBoard as Board,
  HousekeepingRoom,
} from "../../packages/ranza/housekeeping/src";
import { messages } from "../../apps/operator-workspace/src/messages";
import type { SupportedLocale } from "../../packages/i18n/src";

// The server action, which the board only calls. Reaching it would drag in the
// composition root and a database connection to assert what a screen shows.
const markRooms = vi.fn();
vi.mock("../../apps/operator-workspace/src/server/housekeeping", () => ({
  markRooms: (...args: unknown[]) => markRooms(...args),
}));

const { HousekeepingBoard } =
  await import("../../apps/operator-workspace/src/features/housekeeping/components/housekeeping-board");

function room(overrides: Partial<HousekeepingRoom>): HousekeepingRoom {
  return {
    unitId: "dd000004-0000-4000-8000-000000000001",
    name: "101",
    unitType: "room",
    building: null,
    floor: 1,
    bedCount: 0,
    status: "dirty",
    ready: false,
    changedAt: null,
    inHouse: false,
    outOfService: false,
    ...overrides,
  };
}

function boardOf(rooms: HousekeepingRoom[], mayMark: boolean): Board {
  return {
    rooms,
    counts: {
      rooms: rooms.length,
      dirty: rooms.filter((r) => r.status === "dirty").length,
      clean: rooms.filter((r) => r.status === "clean").length,
      inspected: rooms.filter((r) => r.status === "inspected").length,
      ready: rooms.filter((r) => r.ready).length,
    },
    mayMark,
  };
}

function show(board: Board, locale: SupportedLocale = "en") {
  cleanup();
  render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <HousekeepingBoard
        board={board}
        locale={locale}
        markLimit={60}
        propertyName="Deniz Otel"
        timeZone="Europe/Istanbul"
      />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  markRooms.mockReset();
});

describe("the housekeeping board", () => {
  it("says there are no rooms, and claims no restriction about them (HK-S1-16)", () => {
    show(boardOf([], false));
    expect(screen.getByText("No rooms here yet")).toBeInTheDocument();
    expect(
      screen.queryByText(/can see every room here but not change it/),
    ).not.toBeInTheDocument();
  });

  it("names every status in every locale, never by colour alone (HK-S1-17)", () => {
    const rooms = [
      room({ unitId: "dd000004-0000-4000-8000-000000000001", status: "dirty" }),
      room({
        unitId: "dd000004-0000-4000-8000-000000000002",
        name: "102",
        status: "clean",
        ready: true,
      }),
      room({
        unitId: "dd000004-0000-4000-8000-000000000003",
        name: "103",
        status: "inspected",
        ready: true,
      }),
    ];
    for (const locale of ["tr", "en", "ar"] as const) {
      show(boardOf(rooms, true), locale);
      const words = messages[locale].housekeeping;
      for (const status of ["dirty", "clean", "inspected"] as const) {
        // Once in the row's badge at least; the stat cards and the facet
        // carry the same word, which is the point.
        expect(screen.getAllByText(words[status]).length).toBeGreaterThan(0);
      }
    }
  });

  it("mirrors for Arabic by construction: no physical direction utility (HK-S1-17)", () => {
    // AGENTS.md: directional utilities are logical, which is what makes Arabic
    // mirror without a flag. A physical one here would leave the board
    // left-aligned in a right-to-left page.
    const folder = path.resolve(
      __dirname,
      "../../apps/operator-workspace/src/features/housekeeping/components",
    );
    const physical =
      /\b(?:m[lr]|p[lr]|left|right|border-[lr]|rounded-[lr]|text-(?:left|right))-/;
    for (const file of readdirSync(folder)) {
      const source = readFileSync(path.join(folder, file), "utf8");
      const classNames = source.match(/className="[^"]*"/g) ?? [];
      for (const className of classNames) {
        expect(className, `${file}: ${className}`).not.toMatch(physical);
      }
    }
  });

  it("shows a reader without the permission every room and no control (HK-S2-12)", () => {
    show(boardOf([room({})], false));
    expect(screen.getByText("101")).toBeInTheDocument();
    expect(
      screen.getByText(/can see every room here but not change it/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Actions for 101" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the selection when a mark is refused (HK-S2-13)", async () => {
    markRooms.mockResolvedValue({ status: "refused" });
    show(boardOf([room({})], true));

    const tick = screen.getByRole("checkbox", { name: "Select row" });
    fireEvent.click(tick);
    fireEvent.click(screen.getByRole("button", { name: "Mark clean" }));

    expect(await screen.findByText(/couldn't be updated/)).toBeInTheDocument();
    expect(markRooms).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("checkbox", { name: "Select row" })).toBeChecked();
  });
});
