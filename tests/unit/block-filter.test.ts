/**
 * The building a Today figure narrows Rooms to (RANZ-108, TD-S10-02): how the
 * address names it, and how the free places divide building by building.
 */
import { describe, expect, it } from "vitest";
import {
  blockParam,
  freeByBlock,
  inBlock,
  parseBlockFilter,
  type BlockFilter,
} from "../../apps/operator-workspace/src/features/today/views";

type Rooms = Parameters<typeof freeByBlock>[0];

function room(
  building: string | null,
  admits: "female" | "male" | null,
  free: number,
  taken = 0,
): Rooms[number] {
  const bed = (kind: "free" | "occupied") =>
    ({ beds: [], state: { kind } }) as unknown as Rooms[number];
  return {
    building,
    admits,
    beds: [
      ...Array.from({ length: free }, () => bed("free")),
      ...Array.from({ length: taken }, () => bed("occupied")),
    ],
    state: null,
  } as unknown as Rooms[number];
}

describe("the block in the address", () => {
  it("reads_a_building_by_name_and_no_building_as_none", () => {
    expect(parseBlockFilter("Blok A")).toEqual({ block: "Blok A" });
    expect(parseBlockFilter("none")).toEqual({ block: null });
    expect(blockParam(null)).toBe("none");
    expect(blockParam("Blok A")).toBe("Blok A");
  });

  it("narrows_nothing_when_the_address_names_no_block", () => {
    expect(parseBlockFilter(undefined)).toBeNull();
    expect(parseBlockFilter("  ")).toBeNull();
  });

  it("keeps_only_the_rooms_of_the_named_building", () => {
    const a: BlockFilter = { block: "Blok A" };
    const none: BlockFilter = { block: null };
    expect(inBlock({ building: "Blok A" }, a)).toBe(true);
    expect(inBlock({ building: "Blok B" }, a)).toBe(false);
    expect(inBlock({ building: null }, a)).toBe(false);
    expect(inBlock({ building: null }, none)).toBe(true);
    expect(inBlock({ building: "Blok B" }, null)).toBe(true);
  });
});

describe("the free places by block", () => {
  it("divides_the_free_places_building_by_building_with_no_building_last", () => {
    const rows = freeByBlock([
      room(null, null, 1),
      room("Blok B", "male", 2),
      room("Blok A", "female", 1, 1),
      room("Blok B", "male", 1),
    ]);
    expect(rows).toEqual([
      { block: "Blok B", female: 0, male: 3, anyone: 0 },
      { block: "Blok A", female: 1, male: 0, anyone: 0 },
      { block: null, female: 0, male: 0, anyone: 1 },
    ]);
  });

  it("says_nothing_for_a_house_with_no_buildings", () => {
    expect(freeByBlock([room(null, "female", 2), room(null, null, 1)])).toEqual(
      [],
    );
    expect(freeByBlock([])).toEqual([]);
  });
});
