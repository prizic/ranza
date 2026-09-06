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
  "record_type",
  "total",
  "value",
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
      "student",
      "",
      "",
    ]
      .map(csvField)
      .join(","),
  );
  const totals = [
    ["eligible_students", rows.length],
    [
      "responded",
      rows.filter((row) => row.responseStatus !== "unconfirmed").length,
    ],
    [
      "zero_meal",
      rows.filter((row) => row.responseStatus === "zero_meal").length,
    ],
    [
      "unconfirmed",
      rows.filter((row) => row.responseStatus === "unconfirmed").length,
    ],
    ...["breakfast", "lunch", "dinner"].map((meal) => [
      meal,
      rows.filter((row) => row.selectedMeals.includes(meal)).length,
    ]),
    ["corrections", rows.filter((row) => row.corrected).length],
  ].map(([key, value]) => `,,,,,total,${key},${value}`);
  return `${mealExportHeaders.join(",")}\r\n${[...records, ...totals].map((row) => `${row}\r\n`).join("")}`;
}
