/**
 * The rail at a dormitory lists the same pages in the order its work wants
 * them, and Close the day is moved down among the building's work (RANZ-108,
 * TD-S10-09).
 *
 * Order and grouping only. Which pages a role reaches is ADR 0056's and is
 * proved elsewhere: here the set of destinations is held equal across both
 * models, so a change that offered or withdrew a page by operating model would
 * fail beside a change that merely reordered them.
 */
import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";

let query = new URLSearchParams();
vi.mock("../../apps/operator-workspace/node_modules/next/navigation", () => ({
  useSearchParams: () => query,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => query,
}));

const { useWorkspaceNav } =
  await import("../../apps/operator-workspace/src/lib/nav");
const { ALL_SCREENS, SCREENS, screensFor } =
  await import("../../apps/operator-workspace/src/lib/screens");

const YURT = "aa000000-0000-4000-8000-0000000000d1";
const HOTEL = "aa000000-0000-4000-8000-0000000000d2";

const EVERYTHING = ALL_SCREENS.filter((screen) => !screen.children).map(
  (screen) => screen.segment,
);
const OPEN_AT = { [YURT]: EVERYTHING, [HOTEL]: EVERYTHING };

type Entry = {
  label: string;
  href?: string;
  children?: { label: string; href: string }[];
};

function railAt(property: string): Entry[] {
  query = new URLSearchParams({ property });
  const { result } = renderHook(
    () => useWorkspaceNav("en", EVERYTHING, HOTEL, OPEN_AT, [YURT]),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <NextIntlClientProvider locale="en" messages={messages.en}>
          {children}
        </NextIntlClientProvider>
      ),
    },
  );
  return result.current as Entry[];
}

const segmentOf = (href: string) => href.split("?")[0]!.split("/")[2]!;

/** Every page in the rail, top-level entries and group children, in order. */
function flat(entries: Entry[]): string[] {
  return entries.flatMap((entry) =>
    entry.children
      ? entry.children.map((child) => segmentOf(child.href))
      : [segmentOf(entry.href!)],
  );
}

afterEach(() => {
  query = new URLSearchParams();
});

describe("the rail at a dormitory", () => {
  it("lists_the_beds_first_and_close_the_day_below_the_buildings_work", () => {
    const rail = railAt(YURT);
    expect(flat(rail).slice(0, 11)).toEqual([
      "today",
      "rooms",
      "room-calendar",
      "reservations",
      "arrivals",
      "departures",
      "roll-call",
      "guest-experience",
      "maintenance",
      "housekeeping",
      "close-day",
    ]);
    // Lifted out of Front Office, where a hotel opens its day, to a page of its own.
    const frontOffice = rail.find((entry) => entry.children);
    expect(frontOffice?.children?.map((c) => segmentOf(c.href))).not.toContain(
      "close-day",
    );
  });

  it("offers_exactly_the_pages_a_hotel_offers_never_one_more_or_fewer", () => {
    expect([...flat(railAt(YURT))].sort()).toEqual(
      [...flat(railAt(HOTEL))].sort(),
    );
  });

  it("keeps_the_hotels_order_at_a_hotel", () => {
    const hotel = railAt(HOTEL);
    expect(flat(hotel).slice(0, 8)).toEqual([
      "today",
      "reservations",
      "room-calendar",
      "rooms",
      "arrivals",
      "departures",
      "close-day",
      "roll-call",
    ]);
    expect(screensFor("hotel")).toBe(SCREENS);
    expect(screensFor(null)).toBe(SCREENS);
  });

  it("keeps_a_pages_gate_when_it_is_moved", () => {
    const moved = screensFor("dormitory").find(
      (screen) => screen.segment === "close-day",
    );
    const original = ALL_SCREENS.find(
      (screen) => screen.segment === "close-day",
    );
    expect(moved?.permission).toBe(original?.permission);
    expect(moved?.requires).toBe(original?.requires);
    expect(moved?.module).toBe(original?.module);
  });
});
