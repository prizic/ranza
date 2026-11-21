import { describe, expect, it } from "vitest";
import { readRoom, stageRooms } from "../../packages/ranza/imports/src";

/**
 * A row of rooms is checked before anything is written (IMP-S1-19). The
 * command decides again when the row is imported; this names the cell to fix.
 */
const row = (cells: Record<string, string>) => ({
  building: "",
  floor: "",
  room: "101",
  type: "",
  sleeps: "2",
  byBed: "",
  admits: "",
  ...cells,
});

const problemsOf = (cells: Record<string, string>) =>
  readRoom(row(cells), { letByTheBed: false }).problems;

describe("readRoom", () => {
  it("IMP-S1-19: each wrong cell of a room row is named with its column", () => {
    expect(problemsOf({ room: "A-101" })).toEqual([
      { column: "room", code: "not_digits" },
    ]);
    expect(problemsOf({ room: "" })).toEqual([
      { column: "room", code: "required" },
    ]);
    expect(problemsOf({ floor: "ground" })).toEqual([
      { column: "floor", code: "not_a_whole_number" },
    ]);
    expect(problemsOf({ floor: "900" })).toEqual([
      { column: "floor", code: "out_of_range" },
    ]);
    expect(problemsOf({ sleeps: "0" })).toEqual([
      { column: "sleeps", code: "out_of_range" },
    ]);
    expect(problemsOf({ sleeps: "" })).toEqual([
      { column: "sleeps", code: "required" },
    ]);
    expect(problemsOf({ sleeps: "2.5" })).toEqual([
      { column: "sleeps", code: "not_a_whole_number" },
    ]);
    expect(problemsOf({ type: "tent" })).toEqual([
      { column: "type", code: "unknown_type" },
    ]);
    expect(problemsOf({ type: "suite", byBed: "yes" })).toEqual([
      { column: "byBed", code: "only_a_room" },
    ]);
    expect(problemsOf({ byBed: "maybe" })).toEqual([
      { column: "byBed", code: "unknown_yes_no" },
    ]);
    expect(problemsOf({ byBed: "yes", sleeps: "27" })).toEqual([
      { column: "sleeps", code: "too_many_beds" },
    ]);
    expect(problemsOf({ admits: "children" })).toEqual([
      { column: "admits", code: "unknown_admits" },
    ]);
    expect(problemsOf({ building: "x".repeat(61) })).toEqual([
      { column: "building", code: "too_long" },
    ]);
    // Every wrong cell of one row, not only the first.
    expect(problemsOf({ room: "x", sleeps: "y" })).toHaveLength(2);
  });

  it("IMP-S1-19: yes and no, and whom a room admits, are read in all three languages", () => {
    const read = (cells: Record<string, string>) =>
      readRoom(row(cells), { letByTheBed: false }).room;
    for (const yes of ["Yes", "EVET", "نعم", "1"]) {
      expect(read({ byBed: yes })?.letByTheBed).toBe(true);
    }
    for (const no of ["no", "Hayır", "لا"]) {
      expect(read({ byBed: no })?.letByTheBed).toBe(false);
    }
    for (const women of ["Women", "KADIN", "Kız", "نساء", "إناث"]) {
      expect(read({ admits: women })?.admits).toBe("female");
    }
    for (const men of ["men", "Erkek", "رجال"]) {
      expect(read({ admits: men })?.admits).toBe("male");
    }
    for (const anyone of ["", "Herkes", "mixed", "الجميع"]) {
      expect(read({ admits: anyone })?.admits).toBeNull();
    }
    expect(read({ type: "Süit" })?.unitType).toBe("suite");
    expect(read({ type: "غرفة" })?.unitType).toBe("room");
  });

  it("IMP-S1-22: a row becomes the room accommodation's command takes", () => {
    expect(
      readRoom(
        row({
          building: " A ",
          floor: "1",
          sleeps: "4",
          byBed: "Evet",
          admits: "Kadın",
        }),
        { letByTheBed: false },
      ).room,
    ).toEqual({
      building: "A",
      floor: 1,
      unitType: "room",
      firstNumber: "101",
      capacity: 4,
      letByTheBed: true,
      admits: "female",
    });
  });

  it("IMP-S1-19: an empty let-by-the-bed is the Property's default, for a room only", () => {
    const dormitory = { letByTheBed: true };
    expect(readRoom(row({}), dormitory).room?.letByTheBed).toBe(true);
    expect(readRoom(row({ type: "suite" }), dormitory).room?.letByTheBed).toBe(
      false,
    );
    expect(readRoom(row({ byBed: "no" }), dormitory).room?.letByTheBed).toBe(
      false,
    );
  });
});

describe("stageRooms", () => {
  const staged = stageRooms(
    [
      { rowNumber: 2, cells: row({ room: "101" }) },
      { rowNumber: 3, cells: row({ room: "102" }) },
      { rowNumber: 4, cells: row({ room: "101", sleeps: "3" }) },
      { rowNumber: 5, cells: row({ room: "bad" }) },
    ],
    new Set(["102"]),
    { letByTheBed: false },
  );

  it("IMP-S1-19: the same room twice in one file is a duplicate", () => {
    expect(staged[2]).toMatchObject({
      state: "wrong",
      problems: [{ column: "room", code: "duplicate_in_file" }],
    });
  });

  it("IMP-S1-20: a room the Property already has is already there, and the rest are ready or wrong", () => {
    expect(staged.map((item) => item.state)).toEqual([
      "ready",
      "skipped",
      "wrong",
      "wrong",
    ]);
  });

  it("IMP-S1-19: no file gives no rows", () => {
    expect(stageRooms([], new Set(), { letByTheBed: false })).toEqual([]);
  });
});
