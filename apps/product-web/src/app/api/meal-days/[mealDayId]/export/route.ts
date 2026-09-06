import { buildMealExportCsv, type MealExportRow } from "@ranza/domain";

import { createProductWebClient } from "../../../../../lib/supabase/server";

export const runtime = "nodejs";

interface ExportRow {
  corrected: boolean;
  response_status: MealExportRow["responseStatus"];
  selected_meals: string[];
  student_access_id: string;
  student_name: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mealDayId: string }> },
) {
  const { mealDayId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(mealDayId))
    return new Response("Not found", { status: 404 });
  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return new Response("Unauthorized", { status: 401 });
  const { data, error } = await client
    .rpc("meal_export_rows", { target_meal_day_id: mealDayId })
    .returns<ExportRow>();
  if (error) return new Response("Forbidden", { status: 403 });
  const rows = (data ?? []) as unknown as ExportRow[];
  const csv = buildMealExportCsv(
    rows.map((row) => ({
      corrected: row.corrected,
      responseStatus: row.response_status,
      selectedMeals: row.selected_meals,
      studentAccessId: row.student_access_id,
      studentName: row.student_name,
    })),
  );
  return new Response(csv, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="meal-${mealDayId}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
