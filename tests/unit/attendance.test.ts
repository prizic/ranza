import { describe, expect, it } from "vitest";

import {
  buildAttendanceBoard,
  parseAttendanceDeclaration,
  snapshotAttendance,
} from "../../packages/domain/src/attendance";

describe("nightly attendance", () => {
  it("accepts only explicit staying and away declarations", () => {
    expect(parseAttendanceDeclaration("staying")).toBe("staying");
    expect(parseAttendanceDeclaration("away")).toBe("away");
    expect(() => parseAttendanceDeclaration("unconfirmed")).toThrow(
      "staying or away",
    );
  });

  it("keeps missing responses unconfirmed and calculates honest totals", () => {
    const board = buildAttendanceBoard(
      [
        { id: "student-1", name: "Ada" },
        { id: "student-2", name: "Ece" },
        { id: "student-3", name: "Mert" },
      ],
      [
        {
          declaration: "away",
          studentId: "student-2",
          updatedAt: "2026-09-06T20:00:00Z",
        },
      ],
    );

    expect(board).toMatchObject({
      away: 1,
      responsePercentage: 33,
      staying: 0,
      total: 3,
      unconfirmed: 2,
    });
    expect(board.rows.map((row) => row.status)).toEqual([
      "unconfirmed",
      "away",
      "unconfirmed",
    ]);
  });

  it("returns zero percent for an empty eligible roster", () => {
    expect(buildAttendanceBoard([], []).responsePercentage).toBe(0);
  });

  it("freezes explicit and missing responses into snapshot totals", () => {
    expect(
      snapshotAttendance(
        [
          { id: "student-1", name: "Ada" },
          { id: "student-2", name: "Ece" },
          { id: "student-3", name: "Mert" },
        ],
        [
          {
            declaration: "staying",
            studentId: "student-1",
            updatedAt: "2026-09-06T21:00:00Z",
          },
          {
            declaration: "away",
            studentId: "student-2",
            updatedAt: "2026-09-06T21:01:00Z",
          },
        ],
      ),
    ).toEqual({ away: 1, eligible: 3, staying: 1, unconfirmed: 1 });
  });
});
