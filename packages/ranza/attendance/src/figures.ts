import type { AttendanceFigures, NightStatus, RollCallRow } from "./contracts";

/** Where a Resident stands: leave outranks a mark, and a mark outranks nothing. */
export function statusOf(
  hasLeave: boolean,
  mark: "present" | "absent" | null,
): NightStatus {
  if (hasLeave) return "on_leave";
  return mark ?? "not_called";
}

/** The figures of a night, counted from the rows so the two cannot disagree. */
export function figuresOf(
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

const collator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

/** Building, floor, room and bed in the order a warden walks them. */
export function inWalkingOrder<
  T extends Pick<RollCallRow, "building" | "floor" | "roomName" | "bedName">,
>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      Number(a.building === null) - Number(b.building === null) ||
      collator.compare(a.building ?? "", b.building ?? "") ||
      (a.floor ?? Number.MAX_SAFE_INTEGER) -
        (b.floor ?? Number.MAX_SAFE_INTEGER) ||
      collator.compare(a.roomName, b.roomName) ||
      collator.compare(a.bedName ?? "", b.bedName ?? ""),
  );
}
