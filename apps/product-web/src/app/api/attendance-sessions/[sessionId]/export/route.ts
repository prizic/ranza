import {
  buildAttendanceStudentCsv,
  buildAttendanceTotalsCsv,
  type AttendanceExportStatus,
} from "@ranza/domain";

import { createProductWebClient } from "../../../../../lib/supabase/server";

export const runtime = "nodejs";

interface StudentRow {
  corrected: boolean;
  correction_reason: string | null;
  cutoff_status: AttendanceExportStatus;
  effective_status: AttendanceExportStatus;
  student_access_id: string;
  student_name: string;
}

interface TotalsRow {
  corrected_students: number;
  cutoff_away: number;
  cutoff_staying: number;
  cutoff_unconfirmed: number;
  effective_away: number;
  effective_staying: number;
  effective_unconfirmed: number;
  eligible_students: number;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(sessionId))
    return new Response("Not found", { status: 404 });
  const kind = new URL(request.url).searchParams.get("kind") ?? "students";
  if (kind !== "students" && kind !== "totals")
    return new Response("Not found", { status: 404 });
  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return new Response("Unauthorized", { status: 401 });

  let csv: string;
  if (kind === "students") {
    const { data, error } = await client.rpc("attendance_export_rows", {
      target_session_id: sessionId,
    });
    if (error) return new Response("Forbidden", { status: 403 });
    csv = buildAttendanceStudentCsv(
      ((data ?? []) as StudentRow[]).map((row) => ({
        corrected: row.corrected,
        correctionReason: row.correction_reason,
        cutoffStatus: row.cutoff_status,
        effectiveStatus: row.effective_status,
        studentAccessId: row.student_access_id,
        studentName: row.student_name,
      })),
    );
  } else {
    const { data, error } = await client.rpc("attendance_export_totals", {
      target_session_id: sessionId,
    });
    const row = ((data ?? []) as TotalsRow[])[0];
    if (error || !row) return new Response("Forbidden", { status: 403 });
    csv = buildAttendanceTotalsCsv({
      correctedStudents: row.corrected_students,
      cutoffAway: row.cutoff_away,
      cutoffStaying: row.cutoff_staying,
      cutoffUnconfirmed: row.cutoff_unconfirmed,
      effectiveAway: row.effective_away,
      effectiveStaying: row.effective_staying,
      effectiveUnconfirmed: row.effective_unconfirmed,
      eligibleStudents: row.eligible_students,
    });
  }

  return new Response(csv, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="attendance-${sessionId}-${kind}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
