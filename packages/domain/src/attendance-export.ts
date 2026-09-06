export type AttendanceExportStatus = "away" | "staying" | "unconfirmed";

export interface AttendanceStudentExportRow {
  corrected: boolean;
  correctionReason: string | null;
  cutoffStatus: AttendanceExportStatus;
  effectiveStatus: AttendanceExportStatus;
  studentAccessId: string;
  studentName: string;
}

export interface AttendanceTotalsExportRow {
  correctedStudents: number;
  cutoffAway: number;
  cutoffStaying: number;
  cutoffUnconfirmed: number;
  effectiveAway: number;
  effectiveStaying: number;
  effectiveUnconfirmed: number;
  eligibleStudents: number;
}

export const attendanceStudentExportHeaders = [
  "student_access_id",
  "student_name",
  "cutoff_status",
  "effective_status",
  "corrected",
  "correction_reason",
] as const;

export const attendanceTotalsExportHeaders = [
  "eligible_students",
  "cutoff_staying",
  "cutoff_away",
  "cutoff_unconfirmed",
  "effective_staying",
  "effective_away",
  "effective_unconfirmed",
  "corrected_students",
] as const;

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function csv(headers: readonly string[], rows: readonly (readonly string[])[]) {
  return `${headers.join(",")}\r\n${rows.map((row) => `${row.map(csvField).join(",")}\r\n`).join("")}`;
}

export function buildAttendanceStudentCsv(
  rows: readonly AttendanceStudentExportRow[],
): string {
  return csv(
    attendanceStudentExportHeaders,
    rows.map((row) => [
      row.studentAccessId,
      row.studentName,
      row.cutoffStatus,
      row.effectiveStatus,
      String(row.corrected),
      row.correctionReason ?? "",
    ]),
  );
}

export function buildAttendanceTotalsCsv(
  row: AttendanceTotalsExportRow,
): string {
  return csv(attendanceTotalsExportHeaders, [
    [
      row.eligibleStudents,
      row.cutoffStaying,
      row.cutoffAway,
      row.cutoffUnconfirmed,
      row.effectiveStaying,
      row.effectiveAway,
      row.effectiveUnconfirmed,
      row.correctedStudents,
    ].map(String),
  ]);
}
