import { describe, expect, it } from "vitest";
import {
  ROOM_COLUMNS,
  cellsByColumn,
  matchColumns,
  readTable,
  resultRows,
  rowsToFix,
  stageRooms,
  workbookOf,
  type ImportRow,
} from "../../packages/ranza/imports/src";

/** What a person downloads when an import is done (IMP-S1-25). */
const cells = (room: string, sleeps: string) => ({
  building: "A",
  floor: "1",
  room,
  type: "",
  sleeps,
  byBed: "",
  admits: "",
});

const rows: ImportRow[] = [
  {
    rowNumber: 2,
    state: "imported",
    cells: cells("101", "2"),
    problems: [],
    outcome: null,
  },
  {
    rowNumber: 3,
    state: "wrong",
    cells: cells("1o2", "2"),
    problems: [{ column: "room", code: "not_digits" }],
    outcome: null,
  },
  {
    rowNumber: 4,
    state: "refused",
    cells: cells("103", "2"),
    problems: [],
    outcome: "not_permitted",
  },
  {
    rowNumber: 5,
    state: "skipped",
    cells: cells("104", "2"),
    problems: [],
    outcome: "already_there",
  },
];

const wording = {
  rowHeading: "Row",
  outcomeHeading: "Outcome",
  reasonHeading: "What to fix",
  outcome: (row: ImportRow) => row.state,
  reason: (row: ImportRow) =>
    row.problems
      .map((problem) => `${problem.column}: ${problem.code}`)
      .join("; ") ||
    (row.outcome ?? ""),
};

describe("rowsToFix", () => {
  it("IMP-S1-25: the rows to fix come back in the template's columns with the reason", async () => {
    const sheet = rowsToFix(ROOM_COLUMNS, "en", rows, wording);
    expect(sheet[0]).toEqual([
      "Building",
      "Floor",
      "Room",
      "Type",
      "Sleeps",
      "Let by the bed",
      "Admits",
      "What to fix",
    ]);
    expect(sheet.slice(1).map((row) => [row[2], row[7]])).toEqual([
      ["1o2", "room: not_digits"],
      ["103", "not_permitted"],
    ]);

    // Corrected and uploaded as it is: the reason column is not one the
    // reader knows, so it is ignored and the fixed row is ready.
    const corrected = sheet.map((row) =>
      row.map((cell) => (cell === "1o2" ? "102" : cell)),
    );
    const table = await readTable(await workbookOf(corrected), "to-fix.xlsx");
    const { mapping, unknown } = matchColumns(table.headers, ROOM_COLUMNS);
    expect(unknown).toEqual([{ index: 7, heading: "What to fix" }]);
    expect(
      stageRooms(cellsByColumn(table, mapping), new Set(), {
        letByTheBed: false,
      }).map((row) => row.state),
    ).toEqual(["ready", "ready"]);
  });

  it("IMP-S1-25: with nothing to fix it is the headings alone", () => {
    expect(
      rowsToFix(ROOM_COLUMNS, "tr", rows.slice(0, 1), wording),
    ).toHaveLength(1);
  });
});

describe("resultRows", () => {
  it("IMP-S1-25: every row is in the result with its own number and outcome", () => {
    const sheet = resultRows(ROOM_COLUMNS, "en", rows, wording);
    expect(sheet).toHaveLength(5);
    expect(sheet.slice(1).map((row) => [row[0], row[8]])).toEqual([
      ["2", "imported"],
      ["3", "wrong"],
      ["4", "refused"],
      ["5", "skipped"],
    ]);
  });
});
