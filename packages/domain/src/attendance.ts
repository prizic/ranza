export const attendanceDeclarations = ["staying", "away"] as const;

export type AttendanceDeclaration = (typeof attendanceDeclarations)[number];
export type AttendanceStatus = AttendanceDeclaration | "unconfirmed";

export interface AttendanceRosterStudent {
  id: string;
  name: string;
}

export interface AttendanceResponse {
  declaration: AttendanceDeclaration;
  studentId: string;
  updatedAt: string;
}

export interface AttendanceBoardRow extends AttendanceRosterStudent {
  lastUpdatedAt: string | null;
  status: AttendanceStatus;
}

export interface AttendanceBoard {
  away: number;
  responsePercentage: number;
  rows: AttendanceBoardRow[];
  staying: number;
  total: number;
  unconfirmed: number;
}

export function parseAttendanceDeclaration(
  value: unknown,
): AttendanceDeclaration {
  if (!attendanceDeclarations.includes(value as AttendanceDeclaration)) {
    throw new RangeError("declaration must be staying or away");
  }
  return value as AttendanceDeclaration;
}

export function buildAttendanceBoard(
  roster: readonly AttendanceRosterStudent[],
  responses: readonly AttendanceResponse[],
): AttendanceBoard {
  const responseByStudent = new Map(
    responses.map((response) => [response.studentId, response]),
  );
  const rows = roster.map((student): AttendanceBoardRow => {
    const response = responseByStudent.get(student.id);
    return {
      ...student,
      lastUpdatedAt: response?.updatedAt ?? null,
      status: response?.declaration ?? "unconfirmed",
    };
  });
  const staying = rows.filter((row) => row.status === "staying").length;
  const away = rows.filter((row) => row.status === "away").length;
  const total = rows.length;
  const answered = staying + away;

  return {
    away,
    responsePercentage: total === 0 ? 0 : Math.round((answered / total) * 100),
    rows,
    staying,
    total,
    unconfirmed: total - answered,
  };
}
