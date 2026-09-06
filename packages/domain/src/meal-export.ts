export interface MealExportRow {
  corrected: boolean;
  responseStatus: "selected" | "unconfirmed" | "zero_meal";
  selectedMeals: readonly string[];
  studentAccessId: string;
  studentName: string;
}

export const mealExportHeaders = [
  "student_access_id",
  "student_name",
  "response_status",
  "selected_meals",
  "corrected",
] as const;

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function buildMealExportCsv(rows: readonly MealExportRow[]): string {
  const records = rows.map((row) =>
    [
      row.studentAccessId,
      row.studentName,
      row.responseStatus,
      row.selectedMeals.join("|"),
      String(row.corrected),
    ]
      .map(csvField)
      .join(","),
  );
  return `${mealExportHeaders.join(",")}\r\n${records.map((row) => `${row}\r\n`).join("")}`;
}
