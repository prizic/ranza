import { buildStudentImportErrorCsv } from "@ranza/domain";

import { createProductWebClient } from "../../../../../lib/supabase/server";

interface Preview {
  rows: Array<{
    displayName: string | null;
    errors: string[];
    externalReference: string | null;
    preferredLocale: string | null;
    rowNumber: number;
  }>;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(runId))
    return new Response("Not found", { status: 404 });
  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return new Response("Unauthorized", { status: 401 });
  const { data, error } = await client.rpc("student_roster_import_preview", {
    target_import_id: runId,
  });
  if (error || !data) return new Response("Forbidden", { status: 403 });
  const preview = data as Preview;
  const csv = buildStudentImportErrorCsv(
    preview.rows
      .filter((row) => row.errors.length > 0)
      .map((row) => ({
        displayName: row.displayName ?? "",
        errors: row.errors,
        externalReference: row.externalReference ?? "",
        preferredLocale: row.preferredLocale ?? "",
        rowNumber: row.rowNumber,
      })),
  );
  return new Response(csv, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="student-import-${runId}-errors.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
