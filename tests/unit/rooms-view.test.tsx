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
import type { RoomReadiness } from "../../apps/operator-workspace/src/server/viewer";
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
  options: {
    data?: UnitMap;
    mayConfigure?: boolean;
    readiness?: Readonly<Record<string, RoomReadiness>> | null;
    reportable?: boolean;
  } = {},
) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <RoomsView
        data={options.data ?? map}
        housekeepingHref="/en/housekeeping?property=dd000003-0000-4000-8000-000000000001"
        initialView="map"
        locale={locale}
        maintenance={{ holds: [], mayReport: options.reportable ?? false }}
        mayConfigure={options.mayConfigure ?? true}
        propertyId="dd000003-0000-4000-8000-000000000001"
        readiness={options.readiness ?? null}
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

  it("asks before Escape throws away a half-typed batch, in the app's own dialog (ROOMS-05, CALENDAR-14)", async () => {
    const discardDialog = async () =>
      (
        await screen.findByText("Discard the rooms you were about to add?")
      ).closest<HTMLElement>('[role="dialog"]')!;
    const confirm = vi.spyOn(window, "confirm");
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByLabelText("First room number"), {
      target: { value: "301" },
    });
    fireEvent.keyDown(dialog, { key: "Escape" });
    const asking = await discardDialog();
    expect(confirm).not.toHaveBeenCalled();

    fireEvent.click(
      within(asking).getByRole("button", { name: "Keep editing" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText("Discard the rooms you were about to add?"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText("First room number")).toHaveValue("301");

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.click(
      within(await discardDialog()).getByRole("button", { name: "Discard" }),
    );
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

describe("adding rooms: numbers in use, a large batch, and digits only (CALENDAR-11, CALENDAR-13)", () => {
  async function openAdd() {
    render(screenOf("en"));
    fireEvent.click(screen.getByRole("button", { name: "Add rooms" }));
    return await screen.findByRole("dialog");
  }

  it("says which numbers are already in use before the press, and does not offer it", async () => {
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByLabelText("First room number"), {
      target: { value: "101" },
    });
    fireEvent.change(within(dialog).getByLabelText("Number of rooms"), {
      target: { value: "3" },
    });
    expect(within(dialog).getByTestId("add-rooms-preview")).toHaveTextContent(
      "Already in use: 101, 102, 103",
    );
    expect(
      within(dialog).getByRole("button", { name: "Add 3 rooms" }),
    ).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText("First room number"), {
      target: { value: "201" },
    });
    expect(
      within(dialog).getByRole("button", { name: "Add 3 rooms" }),
    ).toBeEnabled();
  });

  it("asks once more before a batch of more than twenty, naming its first and last number", async () => {
    vi.mocked(accommodation.addRooms).mockClear();
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByLabelText("First room number"), {
      target: { value: "501" },
    });
    fireEvent.change(within(dialog).getByLabelText("Number of rooms"), {
      target: { value: "40" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add 40 rooms" }),
    );
    expect(accommodation.addRooms).not.toHaveBeenCalled();
    expect(within(dialog).getByTestId("add-rooms-preview")).toHaveTextContent(
      "That is 40 rooms, 501 to 540",
    );
    expect(
      within(dialog).getByRole("button", { name: "Yes, add 40 rooms" }),
    ).toBeEnabled();

    // Any change asks again.
    fireEvent.change(within(dialog).getByLabelText("Number of rooms"), {
      target: { value: "30" },
    });
    expect(
      within(dialog).getByRole("button", { name: "Add 30 rooms" }),
    ).toBeEnabled();
  });

  it("does not ask about a batch of twenty or fewer", async () => {
    vi.mocked(accommodation.addRooms).mockResolvedValue({ status: "refused" });
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByLabelText("First room number"), {
      target: { value: "501" },
    });
    fireEvent.change(within(dialog).getByLabelText("Number of rooms"), {
      target: { value: "20" },
    });
    expect(
      within(dialog).getByRole("button", { name: "Add 20 rooms" }),
    ).toBeEnabled();
    expect(
      within(dialog).getByTestId("add-rooms-preview"),
    ).not.toHaveTextContent("Press again");
  });

  it("says digits only beside the field, with no native pattern bubble to raise", async () => {
    const dialog = await openAdd();
    const field = within(dialog).getByLabelText("First room number");
    expect(field).not.toHaveAttribute("pattern");
    fireEvent.change(field, { target: { value: "4a1" } });
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Use digits only",
    );
    fireEvent.change(field, { target: { value: "401" } });
    expect(field).not.toHaveAttribute("aria-invalid");
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("what pressing a room opens, and for whom (CALENDAR-08, CALENDAR-09)", () => {
  const press = (name: string) =>
    fireEvent.click(document.getElementById(`unit-${unitId(name)}`)!);
  const unitId = (name: string) =>
    map.units.find((candidate) => candidate.name === name)!.unitId;

  it("does not hand a block form to somebody who may not block, and names the permission", async () => {
    render(screenOf("en", { mayConfigure: false, reportable: true }));
    press("103");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText(/Reason/)).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Block room" }),
    ).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      "Blocking or unblocking a room needs “Configure rooms & beds”",
    );
    expect(
      within(dialog).getByRole("link", { name: "Report a problem" }),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("link", { name: "Show on the room calendar" }),
    ).toHaveAttribute("href", expect.stringContaining("q=103"));
  });

  it("does not hand a block form for a room with a Guest in it, even to somebody who may block", async () => {
    render(screenOf("en", { mayConfigure: true }));
    press("106");
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).queryByRole("button", { name: "Block room" }),
    ).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent("A Guest is in this room");
    expect(dialog).toHaveTextContent("Ayşe Yılmaz");
  });

  it("keeps the block form for somebody who may block an empty room", async () => {
    render(screenOf("en", { mayConfigure: true }));
    press("103");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(/Reason/)).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Block room" }),
    ).toBeVisible();
  });

  it("says in words on every tile what pressing it opens", () => {
    render(screenOf("en", { mayConfigure: true }));
    const tile = (name: string) =>
      document.getElementById(`unit-${unitId(name)}`)!;
    expect(within(tile("103")).getByText("Report or block")).toBeVisible();
    expect(within(tile("104")).getByText("Unblock")).toBeVisible();
    expect(within(tile("106")).getByText("Room details")).toBeVisible();

    cleanup();
    render(screenOf("en", { mayConfigure: false }));
    expect(within(tile("103")).getByText("Room details")).toBeVisible();
  });
});

describe("the words follow the Property, and a late arrival is not reserved tonight (CALENDAR-15, CALENDAR-03)", () => {
  it("calls the views the room map and the room list when no room is let by the bed", () => {
    render(screenOf("en"));
    expect(screen.getByRole("button", { name: "Room map" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Room list" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Bed map" }),
    ).not.toBeInTheDocument();
  });

  it("heads the room list Rooms when no room is let by the bed, and Rooms & beds once one is", () => {
    render(screenOf("en"));
    expect(
      screen.getByText("Every room at this Property, and who is in each one."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Room list" }));
    expect(
      screen.getByRole("columnheader", { name: "Rooms" }),
    ).toBeInTheDocument();
    cleanup();

    const shared: UnitEntry = {
      ...unit("201", null),
      beds: [unit("A", { kind: "free", nextArrivalOn: null })],
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
    expect(
      screen.getByText(
        "Every room and bed at this Property, and who is in each one.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bed list" }));
    expect(
      screen.getByRole("columnheader", { name: "Rooms & beds" }),
    ).toBeInTheDocument();
  });

  it("keeps the bed map and the bed list once a room is let by the bed", () => {
    const shared: UnitEntry = {
      ...unit("201", null),
      beds: [unit("A", { kind: "free", nextArrivalOn: null })],
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
    expect(screen.getByRole("button", { name: "Bed map" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Bed list" })).toBeVisible();
  });

  it("says a booking whose arrival has passed was due, on the tile and in the dialog", async () => {
    const late = unit("107", { kind: "reserved", arrivesOn: "2026-09-29" });
    render(
      screenOf("en", {
        data: { ...map, units: [late], counts: { ...map.counts, rooms: 1 } },
      }),
    );
    expect(screen.getByText("Not arrived · due Sep 29")).toBeVisible();
    expect(screen.queryByText("Reserved tonight")).toBeInTheDocument();
    fireEvent.click(document.getElementById(`unit-${late.unitId}`)!);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "A booking here was due on Sep 29, 2026 and nobody has checked in.",
    );
    expect(dialog).not.toHaveTextContent("A guest arrives here");
  });
});

describe("which rooms housekeeping says can be let now (CALENDAR-19)", () => {
  const readiness = (names: Record<string, RoomReadiness>) =>
    Object.fromEntries(
      Object.entries(names).map(([name, state]) => [
        map.units.find((candidate) => candidate.name === name)!.unitId,
        state,
      ]),
    );

  it("marks a free or reserved room ready or not, and no other", () => {
    render(
      screenOf("en", {
        readiness: readiness({
          "101": "ready",
          "102": "dirty",
          "103": "awaiting_inspection",
          "104": "ready",
          "106": "occupied",
        }),
      }),
    );
    expect(screen.getAllByText("Ready")).toHaveLength(2);
    expect(screen.getByText("Dirty")).toBeVisible();
    expect(screen.getByText("Clean, awaiting inspection")).toBeVisible();
  });

  it("offers a Ready chip that narrows the map to rooms that can be let now", () => {
    render(
      screenOf("en", {
        readiness: readiness({
          "101": "ready",
          "102": "dirty",
          "103": "ready",
        }),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Ready" }));
    expect(screen.getByText("101")).toBeInTheDocument();
    expect(screen.getByText("103")).toBeInTheDocument();
    expect(screen.queryByText("102")).not.toBeInTheDocument();
    expect(screen.queryByText("106")).not.toBeInTheDocument();
  });

  it("draws no mark and no chip for a Property without a board", () => {
    render(screenOf("en", { readiness: null }));
    expect(
      screen.queryByRole("button", { name: "Ready" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Dirty")).not.toBeInTheDocument();
  });
});
