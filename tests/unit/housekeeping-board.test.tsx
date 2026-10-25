/**
 * The Housekeeping board, as a person sees it (RANZ-28).
 *
 * The policies decide what a mark may do and the integration suite proves
 * them. These are the rows only the interface can keep: what an empty board
 * says, what a reader without the permission is shown, what every locale calls
 * a status, and what follows a refused mark.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  HousekeepingBoard as Board,
  HousekeepingRoom,
} from "../../packages/ranza/housekeeping/src";
import { messages } from "../../apps/operator-workspace/src/messages";
import type { SupportedLocale } from "../../packages/i18n/src";
import type { RoomDay } from "../../apps/operator-workspace/src/server/housekeeping-day";

// The server action, which the board only calls. Reaching it would drag in the
// composition root and a database connection to assert what a screen shows.
const markRooms = vi.fn();
vi.mock("../../apps/operator-workspace/src/server/housekeeping", () => ({
  markRooms: (...args: unknown[]) => markRooms(...args),
}));

// The row menu navigates with the app router, which a unit test does not mount.
const push = vi.fn();
const router = { push };
vi.mock("../../apps/operator-workspace/node_modules/next/navigation", () => ({
  useRouter: () => router,
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
    },
    mayMark,
  };
}

function screenOf(
  board: Board,
  locale: SupportedLocale,
  days: Record<string, RoomDay> = {},
  reportHref: string | null = null,
) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <HousekeepingBoard
        allHref=""
        board={board}
        days={days}
        locale={locale}
        markLimit={60}
        narrowed={null}
        propertyName="Deniz Otel"
        reportHref={reportHref}
        timeZone="Europe/Istanbul"
      />
    </NextIntlClientProvider>
  );
}

let rerenderScreen: ((ui: ReturnType<typeof screenOf>) => void) | undefined;

function show(
  board: Board,
  locale: SupportedLocale = "en",
  days: Record<string, RoomDay> = {},
  reportHref: string | null = null,
) {
  cleanup();
  rerenderScreen = render(screenOf(board, locale, days, reportHref)).rerender;
}

/** The same mounted board, handed new props — what a revalidation does. */
function rerender(board: Board, locale: SupportedLocale = "en") {
  rerenderScreen!(screenOf(board, locale));
}

// The floor filter is a command menu, which scrolls its active item into view.
Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  markRooms.mockReset();
  push.mockReset();
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

  it("tells a clean room waiting for inspection from a clean room that is ready (HK-S3-11)", () => {
    show(
      boardOf(
        [
          room({ status: "clean", ready: false }),
          room({
            unitId: "dd000004-0000-4000-8000-000000000002",
            name: "102",
            status: "clean",
            ready: true,
          }),
        ],
        true,
      ),
    );
    const waiting = screen.getByRole("row", { name: /101/ });
    const ready = screen.getByRole("row", { name: /102/ });
    expect(waiting).toHaveTextContent("Awaiting inspection");
    expect(ready).not.toHaveTextContent("Awaiting inspection");
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

  // Decided by the product owner, 2026-09-24. Every refusal the product can
  // produce — the permission taken away, housekeeping switched off, the
  // Subscription lapsed, the Property out of reach — also changes what the
  // board is allowed to show, so what follows a refusal is the board the server
  // sends next, not the selection that was refused.
  it("follows a refused mark with the board as the viewer may now use it (HK-S2-13)", async () => {
    markRooms.mockResolvedValue({ status: "refused" });
    const rooms = [room({})];
    show(boardOf(rooms, true));

    fireEvent.click(screen.getByRole("checkbox", { name: "Select 101" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark clean" }));

    expect(await screen.findByText(/couldn't be updated/)).toBeInTheDocument();
    expect(markRooms).toHaveBeenCalledTimes(1);

    // The page revalidates after the refusal and hands the board back without
    // the permission that was taken away.
    rerender(boardOf(rooms, false));

    expect(screen.getByText(/couldn't be updated/)).toBeInTheDocument();
    expect(
      screen.getByText(/can see every room here but not change it/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mark clean" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("row", { name: /101/ })).toHaveTextContent("Dirty");
  });

  it("filters rooms with multi-select status chips", () => {
    const rooms = [
      room({
        unitId: "dd000004-0000-4000-8000-000000000001",
        name: "101",
        status: "dirty",
      }),
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
    show(boardOf(rooms, true));

    expect(screen.getByRole("row", { name: /101/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /102/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /103/ })).toBeInTheDocument();

    const cleanChip = screen.getByRole("button", { name: /^Clean/ });
    const dirtyChip = screen.getByRole("button", { name: /^Dirty/ });
    const inspectedChip = screen.getByRole("button", { name: /^Inspected/ });

    expect(cleanChip).toHaveAttribute("aria-pressed", "false");
    expect(dirtyChip).toHaveAttribute("aria-pressed", "false");
    expect(inspectedChip).toHaveAttribute("aria-pressed", "false");

    // Click Clean chip -> only clean room (102) is shown
    fireEvent.click(cleanChip);
    expect(cleanChip).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("row", { name: /101/ })).not.toBeInTheDocument();
    expect(screen.getByRole("row", { name: /102/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /103/ })).not.toBeInTheDocument();

    // Multi-select: Click Dirty chip as well -> both Clean (102) and Dirty (101) shown
    fireEvent.click(dirtyChip);
    expect(cleanChip).toHaveAttribute("aria-pressed", "true");
    expect(dirtyChip).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("row", { name: /101/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /102/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /103/ })).not.toBeInTheDocument();

    // Unclick Clean chip -> only Dirty (101) shown
    fireEvent.click(cleanChip);
    expect(cleanChip).toHaveAttribute("aria-pressed", "false");
    expect(dirtyChip).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("row", { name: /101/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /102/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /103/ })).not.toBeInTheDocument();

    // Clear filters button resets all chips
    fireEvent.click(screen.getByRole("button", { name: /Clear filters/i }));
    expect(dirtyChip).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("row", { name: /101/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /102/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /103/ })).toBeInTheDocument();
  });

  it("counts as ready to let only a ready room nobody is in (HK-06, RANZ-57)", () => {
    const vacant = room({
      unitId: "dd000004-0000-4000-8000-000000000002",
      name: "102",
      status: "inspected",
      ready: true,
    });
    const occupied = room({
      unitId: "dd000004-0000-4000-8000-000000000003",
      name: "103",
      status: "inspected",
      ready: true,
      inHouse: true,
    });
    const closed = room({
      unitId: "dd000004-0000-4000-8000-000000000004",
      name: "104",
      status: "inspected",
      ready: true,
      outOfService: true,
    });
    show(boardOf([room({}), vacant, occupied, closed], true));
    const tile = screen.getByText("Ready to let").parentElement!;
    expect(tile).toHaveTextContent(/^Ready to let1$/);
  });

  it("says what the day asks of a room beside its status (HK-04)", () => {
    const arriving = room({
      unitId: "dd000004-0000-4000-8000-000000000002",
      name: "102",
    });
    const leaving = room({
      unitId: "dd000004-0000-4000-8000-000000000003",
      name: "103",
      inHouse: true,
    });
    show(boardOf([room({}), arriving, leaving], true), "en", {
      [arriving.unitId]: "arrival",
      [leaving.unitId]: "leaving",
    });
    expect(screen.getByRole("row", { name: /102/ })).toHaveTextContent(
      "Arrival today",
    );
    expect(screen.getByRole("row", { name: /103/ })).toHaveTextContent(
      "Leaving today",
    );
    expect(screen.getByRole("row", { name: /101/ })).not.toHaveTextContent(
      /today/,
    );
  });

  it("offers a floor filter only when the Property has more than one floor (HK-05)", () => {
    show(boardOf([room({ floor: 1 }), room({ name: "102", floor: 1 })], true));
    expect(
      screen.queryByRole("button", { name: /^Floor/ }),
    ).not.toBeInTheDocument();

    show(
      boardOf(
        [
          room({ floor: 1 }),
          room({
            unitId: "dd000004-0000-4000-8000-000000000002",
            name: "201",
            floor: 2,
          }),
          room({
            unitId: "dd000004-0000-4000-8000-000000000003",
            name: "G01",
            floor: null,
          }),
        ],
        true,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Floor/ }));
    fireEvent.click(screen.getByRole("option", { name: /Floor 2/ }));
    expect(screen.getByRole("row", { name: /201/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /101/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /G01/ })).not.toBeInTheDocument();
  });

  it("names a room never marked, and a mark from another year with its year (HK-13)", () => {
    show(
      boardOf(
        [
          room({ changedAt: null }),
          room({
            unitId: "dd000004-0000-4000-8000-000000000002",
            name: "102",
            changedAt: new Date("2019-03-04T10:00:00Z"),
          }),
        ],
        true,
      ),
    );
    expect(screen.getByRole("row", { name: /101/ })).toHaveTextContent(
      "Never marked",
    );
    expect(screen.getByRole("row", { name: /102/ })).toHaveTextContent("2019");
  });

  it("offers a report-a-problem link on the room's row to somebody who may report (MAINT-10)", () => {
    show(boardOf([room({})], false), "en", {}, "/en/maintenance?report=");
    expect(
      screen.getByRole("link", { name: "Report a problem" }),
    ).toHaveAttribute(
      "href",
      "/en/maintenance?report=dd000004-0000-4000-8000-000000000001",
    );

    show(boardOf([room({})], true));
    expect(
      screen.queryByRole("link", { name: "Report a problem" }),
    ).not.toBeInTheDocument();
  });
  it("says on a phone whether anybody is in the room, beside its status (HOUSEKEEPING-04)", () => {
    const occupied = room({
      unitId: "dd000004-0000-4000-8000-000000000002",
      name: "102",
      inHouse: true,
    });
    const closed = room({
      unitId: "dd000004-0000-4000-8000-000000000003",
      name: "103",
      outOfService: true,
    });
    show(boardOf([room({}), occupied, closed], true));
    // The block the room cell draws under a phone's first column; from `md` the
    // Occupancy column says the same, and this one is not drawn.
    const underRoom = (name: RegExp) =>
      screen
        .getByRole("row", { name })
        .querySelector<HTMLElement>(".md\\:hidden")!;
    expect(underRoom(/101/)).toHaveTextContent("Vacant");
    expect(underRoom(/102/)).toHaveTextContent("Guest in house");
    expect(underRoom(/103/)).toHaveTextContent("Out of service");
  });

  it("says the three status counts once on a phone, where the chips carry them (HOUSEKEEPING-05)", () => {
    show(boardOf([room({}), room({ name: "102", status: "clean" })], true));
    const tile = (label: string) =>
      screen.getAllByText(label).find((node) => node.tagName === "P")!
        .parentElement!;
    for (const label of ["Dirty", "Clean", "Inspected"]) {
      expect(tile(label)).toHaveClass("max-sm:hidden");
    }
    expect(tile("Rooms")).not.toHaveClass("max-sm:hidden");
    expect(tile("Ready to let")).not.toHaveClass("max-sm:hidden");
  });

  it("keeps the bulk bar to icons on a phone, each button still named (HOUSEKEEPING-03)", () => {
    show(boardOf([room({})], true));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select 101" }));
    for (const name of ["Mark clean", "Mark inspected", "Mark dirty"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveClass("max-sm:size-11");
      expect(within(button).getByText(name)).toHaveClass("max-sm:sr-only");
    }
  });

  it("reaches Report a problem from the row menu, and leaves the inline link to a desktop (HOUSEKEEPING-06)", async () => {
    show(boardOf([room({})], true), "en", {}, "/en/maintenance?report=");
    expect(screen.getByRole("link", { name: "Report a problem" })).toHaveClass(
      "max-md:hidden",
    );

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Actions for 101" }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Report a problem" }),
    );
    expect(push).toHaveBeenCalledWith(
      "/en/maintenance?report=dd000004-0000-4000-8000-000000000001",
    );
  });

  it("keeps the link on a phone for somebody with no menu to find it in (HOUSEKEEPING-06)", () => {
    show(boardOf([room({})], false), "en", {}, "/en/maintenance?report=");
    const link = screen.getByRole("link", { name: "Report a problem" });
    expect(link).not.toHaveClass("max-md:hidden");
    expect(link).toHaveClass("pointer-coarse:py-3");
  });

  it("does not remount a row's menu when the board renders again with nothing changed", () => {
    const rooms = [room({})];
    const days = {};
    const board = boardOf(rooms, true);
    cleanup();
    const view = render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <HousekeepingBoard
          allHref=""
          board={board}
          days={days}
          locale="en"
          markLimit={60}
          narrowed={null}
          propertyName="Deniz Otel"
          reportHref={null}
          timeZone="Europe/Istanbul"
        />
      </NextIntlClientProvider>,
    );
    const before = screen.getByRole("button", { name: "Actions for 101" });
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <HousekeepingBoard
          allHref=""
          board={board}
          days={days}
          locale="en"
          markLimit={60}
          narrowed={null}
          propertyName="Deniz Otel"
          reportHref={null}
          timeZone="Europe/Istanbul"
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: "Actions for 101" })).toBe(
      before,
    );
  });
});
