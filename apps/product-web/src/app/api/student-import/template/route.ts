import { studentCsvTemplate } from "@ranza/domain";

export function GET() {
  return new Response(studentCsvTemplate, {
    headers: {
      "Content-Disposition":
        'attachment; filename="ranza-student-import-template.csv"',
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
