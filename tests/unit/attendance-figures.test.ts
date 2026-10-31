import { describe, expect, it } from "vitest";
import {
  figuresOf,
  inWalkingOrder,
  statusOf,
} from "../../packages/ranza/attendance/src";

describe("where a Resident stands on a night (LA-S1-13)", () => {
  it("is on leave whatever was marked, since leave outranks a mark", () => {
    expect(statusOf(true, "absent")).toBe("on_leave");
    expect(statusOf(true, "present")).toBe("on_leave");
    expect(statusOf(true, null)).toBe("on_leave");
  });

  it("is the mark when there is no leave, and not yet called when there is neither", () => {
    expect(statusOf(false, "absent")).toBe("absent");
    expect(statusOf(false, "present")).toBe("present");
    expect(statusOf(false, null)).toBe("not_called");
  });
});

describe("the figures of a night (LA-S1-14)", () => {
  it("are the rows counted, so the list and the figures cannot disagree", () => {
    const rows = [
      { status: "present" },
      { status: "present" },
      { status: "absent" },
      { status: "on_leave" },
      { status: "not_called" },
      { status: "not_called" },
    ] as const;
    expect(figuresOf(rows)).toEqual({
      inHouse: 6,
      present: 2,
      absent: 1,
      onLeave: 1,
      notCalled: 2,
    });
  });

  it("are zero for a Property with nobody in house", () => {
    expect(figuresOf([])).toEqual({
      inHouse: 0,
      present: 0,
      absent: 0,
      onLeave: 0,
      notCalled: 0,
    });
  });
});

describe("the order a warden walks (LA-S2-02)", () => {
  const at = (
    building: string | null,
    floor: number | null,
    roomName: string,
    bedName: string | null,
  ) => ({ building, floor, roomName, bedName });

  it("is block, then floor, then room, then bed, numbers as numbers", () => {
    const sorted = inWalkingOrder([
      at("Blok B", 1, "301", "A"),
      at("Blok A", 2, "201", "B"),
      at("Blok A", 1, "110", "A"),
      at("Blok A", 1, "9", "B"),
      at("Blok A", 1, "9", "A"),
      at("Blok A", 2, "201", "A"),
    ]);
    expect(
      sorted.map((row) => [row.building, row.floor, row.roomName, row.bedName]),
    ).toEqual([
      ["Blok A", 1, "9", "A"],
      ["Blok A", 1, "9", "B"],
      ["Blok A", 1, "110", "A"],
      ["Blok A", 2, "201", "A"],
      ["Blok A", 2, "201", "B"],
      ["Blok B", 1, "301", "A"],
    ]);
  });

  it("puts rooms with no block or floor after those that have them", () => {
    const sorted = inWalkingOrder([
      at(null, null, "5", null),
      at("Blok A", null, "2", null),
      at("Blok A", 1, "1", null),
    ]);
    expect(sorted.map((row) => row.roomName)).toEqual(["1", "2", "5"]);
  });
});
