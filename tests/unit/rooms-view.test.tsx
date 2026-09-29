/**
 * The Rooms map, as a person reads it (RB-S1-05, RB-S1-09).
 *
 * The integration suite proves what `listUnits` says. These are the rows only
 * the screen can keep: that a Unit with an arrival later is still drawn free
 * and says when, that reserved tonight is counted apart from free, that a leaf
 * out of order is counted apart from both, and that every one of those words
 * exists in every locale.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  UnitEntry,
  UnitMap,
} from "../../packages/ranza/accommodation/src";
import type { SupportedLocale } from "../../packages/i18n/src";
import { messages } from "../../apps/operator-workspace/src/messages";

// The server actions the dialogs call. Reaching them would drag in the
// composition root and a database connection to assert what a screen shows.
vi.mock("../../apps/operator-workspace/src/server/accommodation", () => ({
  addRooms: vi.fn(),
  blockUnit: vi.fn(),
  unblockUnit: vi.fn(),
}));

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

function screenOf(locale: SupportedLocale) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <RoomsView
        data={map}
        locale={locale}
        maintenance={{ holds: [], mayReport: false }}
        propertyId="dd000003-0000-4000-8000-000000000001"
        propertyName="Deniz Otel"
      />
    </NextIntlClientProvider>
  );
}

afterEach(cleanup);

/** The number in the tile with this label. */
function tileCount(label: string): string {
  const tile = screen.getByText(label).closest("div")!.parentElement!;
  return within(tile).getAllByText(/^\d+$/)[0]!.textContent!;
}

describe("the rooms map", () => {
  it("says when the next arrival is beside a free room, and only for that room (RB-S1-05)", () => {
    render(screenOf("en"));
    expect(screen.getByText("Free · Next arrival Oct 3")).toBeInTheDocument();
    // The room with nothing coming, and the room reserved tonight, say neither.
    expect(screen.getAllByText("Free")).toHaveLength(1);
    expect(screen.getAllByText(/Next arrival/)).toHaveLength(1);
    expect(screen.getByText("Reserved")).toBeInTheDocument();
  });

  it("counts reserved tonight apart from free, and out of order apart from both (RB-S1-09)", () => {
    render(screenOf("en"));
    expect(tileCount("Reserved tonight")).toBe("1");
    expect(tileCount("Empty beds tonight")).toBe("2");
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
