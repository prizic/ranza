/**
 * The Rooms map, as a person reads it (RB-S1-05, RB-S1-09).
 *
 * The integration suite proves what `listUnits` says. These are the rows only
 * the screen can keep: that a Unit with an arrival later is still drawn free
 * and says when, that reserved tonight is counted apart from free, that a leaf
 * out of order is counted apart from both, and that every one of those words
 * exists in every locale.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  UnitEntry,
  UnitMap,
} from "../../packages/ranza/accommodation/src";
import type { SupportedLocale } from "../../packages/i18n/src";
import { messages } from "../../apps/operator-workspace/src/messages";

// The page asks the server again while it is open; there is no router here.
const refresh = vi.hoisted(() => vi.fn());
vi.mock("../../apps/operator-workspace/node_modules/next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

// The server actions the dialogs call. Reaching them would drag in the
// composition root and a database connection to assert what a screen shows.
vi.mock("../../apps/operator-workspace/src/server/accommodation", () => ({
  addRooms: vi.fn(),
  blockUnit: vi.fn(),
  unblockUnit: vi.fn(),
}));

const accommodation =
  await import("../../apps/operator-workspace/src/server/accommodation");

const { RoomsView } =
  await import("../../apps/operator-workspace/src/features/rooms/components/rooms-view");

function unit(name: string, state: UnitEntry["state"]): UnitEntry {
  return {
    unitId: `dd000004-0000-4000-8000-${name.padStart(12, "0")}`,
    name,
    unitType: "room",
    capacity: 2,
    building: null,
    floor: 1,
    status:
      state?.kind === "blocked"
        ? "blocked"
        : state?.kind === "out_of_service"
          ? "out_of_service"
          : "available",
    state,
    beds: [],
  };
}

const map: UnitMap = {
  today: "2026-10-01",
  units: [
    unit("101", { kind: "free", nextArrivalOn: "2026-10-03" }),
    unit("102", { kind: "reserved", arrivesOn: "2026-10-01" }),
    unit("103", { kind: "free", nextArrivalOn: null }),
    unit("104", { kind: "blocked", reason: "Leak" }),
    unit("105", { kind: "out_of_service" }),
    unit("106", {
      kind: "in_house",
      guestName: "Ayşe Yılmaz",
      endsOn: "2026-10-02",
    }),
  ],
  counts: {
    rooms: 6,
    sellable: 6,
    inHouse: 1,
    reserved: 1,
    free: 2,
    blocked: 1,
    outOfService: 1,
  },
};

function screenOf(
  locale: SupportedLocale,
  options: { data?: UnitMap; mayConfigure?: boolean } = {},
) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <RoomsView
        data={options.data ?? map}
        housekeepingHref="/en/housekeeping?property=dd000003-0000-4000-8000-000000000001"
        initialView="map"
        locale={locale}
        maintenance={{ holds: [], mayReport: false }}
        mayConfigure={options.mayConfigure ?? true}
        propertyId="dd000003-0000-4000-8000-000000000001"
      />
    </NextIntlClientProvider>
  );
}

afterEach(cleanup);

/** The number in the tile with this label. */
function tileCount(label: string): string {
  // A state can also be a filter chip beside the tiles; the tile's label is
  // the paragraph set in capitals.
  const tile = screen
    .getAllByText(label)
    .find((element) => element.tagName === "P")!
    .closest("div")!.parentElement!;
  return within(tile).getAllByText(/^\d+$/)[0]!.textContent!;
}

describe("the rooms map", () => {
  it("says when the next arrival is beside a free room, and only for that room (RB-S1-05)", () => {
    render(screenOf("en"));
    expect(screen.getByText("Free · Next arrival Oct 3")).toBeInTheDocument();
    // The room with nothing coming, and the room reserved tonight, say neither.
    expect(
      screen.getAllByText("Free").filter((el) => el.tagName !== "BUTTON"),
    ).toHaveLength(1);
    expect(screen.getAllByText(/Next arrival/)).toHaveLength(1);
    expect(
      screen.getAllByText("Reserved").filter((el) => el.tagName !== "BUTTON"),
    ).toHaveLength(1);
  });

  it("counts reserved tonight apart from free, and out of order apart from both (RB-S1-09)", () => {
    render(screenOf("en"));
    expect(tileCount("Reserved tonight")).toBe("1");
    expect(tileCount("Free tonight")).toBe("2");
    expect(tileCount("Occupied")).toBe("1");
    expect(tileCount("Blocked")).toBe("1");
    expect(screen.getByText("1 out of order")).toBeInTheDocument();
  });

  it.each(["tr", "en", "ar"] as const)(
    "has a word for reserved tonight and the next arrival in %s (RB-S1-05)",
    (locale) => {
      render(screenOf(locale));
      expect(
        screen.getByText(messages[locale].statReserved),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          new RegExp(messages[locale].nextArrivalOn.split("{date}")[0]!.trim()),
        ),
      ).toBeInTheDocument();
    },
  );
});

describe("who is offered what on the rooms screen", () => {
  it("offers Add rooms only to somebody who holds the permission (ROOMS-01)", () => {
    render(screenOf("en", { mayConfigure: false }));
    expect(
      screen.queryByRole("button", { name: "Add rooms" }),
    ).not.toBeInTheDocument();

    cleanup();
    render(screenOf("en", { mayConfigure: true }));
    expect(screen.getByRole("button", { name: "Add rooms" })).toBeVisible();
  });

  it("names the permission on an empty Property when the viewer cannot add (ROOMS-01, ROOMS-14)", () => {
    const empty: UnitMap = {
      today: map.today,
      units: [],
      counts: {
        rooms: 0,
        sellable: 0,
        inHouse: 0,
        reserved: 0,
        free: 0,
        blocked: 0,
        outOfService: 0,
      },
    };
    render(screenOf("en", { data: empty, mayConfigure: false }));
    expect(screen.getByText(/Configure rooms & beds/)).toBeInTheDocument();
    expect(screen.queryByText("Reserved tonight")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Bed map" }),
    ).not.toBeInTheDocument();

    cleanup();
    render(screenOf("en", { data: empty, mayConfigure: true }));
    expect(screen.getByRole("button", { name: "Add rooms" })).toBeVisible();
  });
});

describe("finding a room (ROOMS-09)", () => {
  it("narrows the map by number, by state, and says so when nothing matches", () => {
    render(screenOf("en"));
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "104" },
    });
    expect(screen.getByText("104")).toBeInTheDocument();
    expect(screen.queryByText("101")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "zzz" },
    });
    expect(screen.getByText("No rooms match")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all rooms" }));
    expect(screen.getByText("101")).toBeInTheDocument();
    expect(screen.getByText("106")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "In house" }));
    expect(screen.getByText("106")).toBeInTheDocument();
    expect(screen.queryByText("101")).not.toBeInTheDocument();
  });

  it("finds a room by the guest in it", () => {
    render(screenOf("en"));
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "yılmaz" },
    });
    expect(screen.getByText("106")).toBeInTheDocument();
    expect(screen.queryByText("105")).not.toBeInTheDocument();
  });
});

describe("the words for a Property with and without beds (ROOMS-06, ROOMS-13)", () => {
  it("shows no Beds tile and no floor heading when nothing is let by the bed or on a floor", () => {
    render(screenOf("en"));
    expect(screen.queryByText("Beds")).not.toBeInTheDocument();
    expect(screen.queryByText("No floor set")).not.toBeInTheDocument();
  });

  it("shows the Beds tile once a room is let by the bed", () => {
    const bed = { ...unit("A", { kind: "free", nextArrivalOn: null }) };
    const shared: UnitEntry = {
      ...unit("201", null),
      beds: [bed],
    };
    render(
      screenOf("en", {
        data: {
          ...map,
          units: [shared],
          counts: { ...map.counts, rooms: 1, sellable: 1 },
        },
      }),
    );
    expect(screen.getByText("Beds")).toBeInTheDocument();
    expect(screen.getByText("Empty beds tonight")).toBeInTheDocument();
  });
});

describe("adding rooms", () => {
  async function openAdd() {
    render(screenOf("en"));
    fireEvent.click(screen.getByRole("button", { name: "Add rooms" }));
    return await screen.findByRole("dialog");
  }

  it("says what will be created before the press (ROOMS-02)", async () => {
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByLabelText("First room number"), {
      target: { value: "301" },
    });
    fireEvent.change(within(dialog).getByLabelText("Number of rooms"), {
      target: { value: "40" },
    });
    fireEvent.change(within(dialog).getByLabelText("Floor (optional)"), {
      target: { value: "3" },
    });
    fireEvent.change(within(dialog).getByLabelText("Building (optional)"), {
      target: { value: "Block A" },
    });
    expect(within(dialog).getByTestId("add-rooms-preview")).toHaveTextContent(
      "Adds 40 rooms: 301 to 340, floor 3, Block A, sleeps 2",
    );
    expect(
      within(dialog).getByRole("button", { name: "Add 40 rooms" }),
    ).toBeVisible();
  });

  it("keeps zero-padded numbering in the preview (RB-S2-01)", async () => {
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByLabelText("First room number"), {
      target: { value: "001" },
    });
    fireEvent.change(within(dialog).getByLabelText("Number of rooms"), {
      target: { value: "3" },
    });
    expect(within(dialog).getByTestId("add-rooms-preview")).toHaveTextContent(
      "001 to 003",
    );
  });

  it("asks before Escape throws away a half-typed batch (ROOMS-05)", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByLabelText("First room number"), {
      target: { value: "301" },
    });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(confirm).toHaveBeenCalledWith(
      "Discard the rooms you were about to add?",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    confirm.mockReturnValue(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    confirm.mockRestore();
  });

  it("closes an untouched dialog without asking", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const dialog = await openAdd();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it.each([
    [{ status: "taken", name: "302" }, /Room 302 already exists/],
    [
      { status: "notPermitted" },
      /needs the permission “Configure rooms & beds”/,
    ],
    [{ status: "invalid", field: "count" }, /from 1 to 60/],
    [{ status: "refused" }, /can't be added right now/],
  ] as const)(
    "answers %j in the screen's own words and keeps what was typed (ROOMS-03)",
    async (outcome, words) => {
      vi.mocked(accommodation.addRooms).mockResolvedValue(outcome);
      const dialog = await openAdd();
      fireEvent.change(within(dialog).getByLabelText("First room number"), {
        target: { value: "301" },
      });
      fireEvent.submit(dialog.querySelector("form")!);
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(words);
      expect(within(dialog).getByLabelText("First room number")).toHaveValue(
        "301",
      );
    },
  );
});
