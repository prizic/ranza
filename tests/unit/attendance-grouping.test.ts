/**
 * How the roll call lists, narrows and answers a floor (LA-S2-02, LA-S2-04,
 * LA-S2-10): the pure half of the screen, so it holds in every language and
 * without a browser.
 */
import { describe, expect, it } from "vitest";
import {
  figuresOf,
  inWalkingOrder,
  type RollCallRow,
} from "../../packages/ranza/attendance/src";
import {
  figuresOfRows,
  groupRows,
  stillToCall,
  visibleRows,
} from "../../apps/operator-workspace/src/features/attendance/grouping";

function row(
  stayId: string,
  place: Partial<RollCallRow>,
  status: RollCallRow["status"] = "not_called",
): RollCallRow {
  return {
    stayId,
    residentName: `Resident ${stayId}`,
    building: "Blok A",
    floor: 1,
    roomName: "101",
    bedName: "A",
    status,
    markedAt: null,
    leave: null,
    ...place,
  };
}

const HOUSE: RollCallRow[] = [
  row("b10", { roomName: "B-10", building: "Blok B" }),
  row("a10", { roomName: "A-10", floor: 2 }),
  row("a9", { roomName: "A-9", floor: 2 }, "present"),
  row("a1", { roomName: "A-1", floor: 1 }, "absent"),
  row("loose", { building: null, floor: null, roomName: "Annex" }, "on_leave"),
];

/** What the module hands the screen: already in the order a warden walks. */
const WALKED = inWalkingOrder(HOUSE);

describe("the order a warden walks", () => {
  it("LA-S2-02: building, then floor, then room and bed in the order a warden walks them", () => {
    const groups = groupRows(visibleRows(WALKED, "all", ""));
    expect(
      groups.map((group) => [
        group.building,
        group.floors.map((floor) => [
          floor.floor,
          floor.rows.map((r) => r.stayId),
        ]),
      ]),
    ).toEqual([
      [
        "Blok A",
        [
          [1, ["a1"]],
          // Room 9 before room 10: numbers are numbers.
          [2, ["a9", "a10"]],
        ],
      ],
      ["Blok B", [[1, ["b10"]]]],
      // Somebody with no block or floor is listed, last, and not dropped.
      [null, [[null, ["loose"]]]],
    ]);
  });
});

describe("narrowing the list", () => {
  it("LA-S2-04: a figure narrows the list to the Residents it counts", () => {
    const only = (filter: Parameters<typeof visibleRows>[1]) =>
      visibleRows(WALKED, filter, "").map((r) => r.stayId);
    expect(only("present")).toEqual(["a9"]);
    expect(only("absent")).toEqual(["a1"]);
    expect(only("on_leave")).toEqual(["loose"]);
    expect(only("not_called").sort()).toEqual(["a10", "b10"]);
    expect(only("all")).toHaveLength(5);
  });

  it("LA-S2-04: typed text finds a name, a room or a bed, whatever its case", () => {
    expect(visibleRows(WALKED, "all", " annex ").map((r) => r.stayId)).toEqual([
      "loose",
    ]);
    expect(
      visibleRows(WALKED, "all", "resident a1").map((r) => r.stayId),
    ).toEqual(["a1", "a10"]);
    expect(visibleRows(WALKED, "present", "annex")).toEqual([]);
  });
});

describe("a floor answered at once", () => {
  it("LA-S2-10: the rest of a floor is those not yet called", () => {
    const floorTwo = HOUSE.filter((r) => r.floor === 2);
    expect(stillToCall(floorTwo)).toEqual(["a10"]);
    expect(stillToCall(HOUSE.filter((r) => r.status !== "not_called"))).toEqual(
      [],
    );
  });
});

describe("the figures counted on screen", () => {
  it("LA-S2-04: are the module's own count, so the strip and Today cannot disagree", () => {
    expect(figuresOfRows(HOUSE)).toEqual(figuresOf(HOUSE));
    expect(figuresOfRows([])).toEqual(figuresOf([]));
  });
});
