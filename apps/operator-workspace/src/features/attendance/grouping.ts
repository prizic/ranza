import type {
  AttendanceFigures,
  NightStatus,
  RollCallRow,
} from "@ranza/attendance";

/** What the list is narrowed to: everyone, or those in one state tonight. */
export type RollFilter = "all" | NightStatus;

const NARROWINGS: readonly RollFilter[] = ["on_leave", "absent", "not_called"];

/**
 * The narrowing a link asks for (`?show=`), or everyone when it names none the
 * screen knows: a figure elsewhere opens the people it counts, and a stale or
 * hand-made value must not hide the whole list.
 */
export function rollFilterFrom(value: string | undefined): RollFilter {
  return NARROWINGS.find((candidate) => candidate === value) ?? "all";
}

export interface FloorGroup {
  key: string;
  floor: number | null;
  rows: RollCallRow[];
}

export interface BuildingGroup {
  key: string;
  building: string | null;
  floors: FloorGroup[];
}

/**
 * The figures of the rows on screen, counted again as an answer is shown before
 * the server has kept it. The module counts the same way for Today
 * (`figuresOf`); a client component may not import a module, so this is its own
 * copy and `attendance-grouping.test.ts` holds the two to the same answers.
 */
export function figuresOfRows(
  rows: readonly Pick<RollCallRow, "status">[],
): AttendanceFigures {
  const figures: AttendanceFigures = {
    inHouse: rows.length,
    onLeave: 0,
    present: 0,
    absent: 0,
    notCalled: 0,
  };
  for (const row of rows) {
    if (row.status === "on_leave") figures.onLeave += 1;
    else if (row.status === "present") figures.present += 1;
    else if (row.status === "absent") figures.absent += 1;
    else figures.notCalled += 1;
  }
  return figures;
}

/**
 * Rows narrowed to a state and to what was typed, name or room. They arrive
 * from the module already in the order a warden walks them and an answer never
 * moves a row, so the order is kept as it is.
 */
export function visibleRows(
  rows: readonly RollCallRow[],
  filter: RollFilter,
  needle: string,
): RollCallRow[] {
  const wanted = needle.trim().toLocaleLowerCase();
  return rows.filter(
    (row) =>
      (filter === "all" || row.status === filter) &&
      (wanted === "" ||
        [row.residentName, row.roomName, row.bedName, row.building]
          .filter((part): part is string => part !== null)
          .some((part) => part.toLocaleLowerCase().includes(wanted))),
  );
}

/**
 * Building, then floor, each keeping the walking order its rows arrived in.
 * A Unit with no building or no floor is its own group at the end, so nobody
 * is dropped from the list for lacking a place in the hierarchy.
 */
export function groupRows(rows: readonly RollCallRow[]): BuildingGroup[] {
  const buildings: BuildingGroup[] = [];
  for (const row of rows) {
    const buildingKey = row.building ?? "";
    let building = buildings.find((group) => group.key === buildingKey);
    if (!building) {
      building = { key: buildingKey, building: row.building, floors: [] };
      buildings.push(building);
    }
    const floorKey = `${buildingKey}/${row.floor ?? ""}`;
    let floor = building.floors.find((group) => group.key === floorKey);
    if (!floor) {
      floor = { key: floorKey, floor: row.floor, rows: [] };
      building.floors.push(floor);
    }
    floor.rows.push(row);
  }
  return buildings;
}

/** The Residents of a floor the rest-present button would answer. */
export function stillToCall(rows: readonly RollCallRow[]): string[] {
  return rows
    .filter((row) => row.status === "not_called")
    .map((row) => row.stayId);
}
