import { describe, expect, it } from "vitest";

import { buildMealExportCsv } from "../../packages/domain/src/meal-export";

describe("Meal export CSV", () => {
  it("exports effective kitchen totals from exactly the same frozen named rows", () => {
    const csv = buildMealExportCsv([
      {
        corrected: true,
        responseStatus: "selected",
        selectedMeals: ["lunch", "dinner"],
        studentAccessId: "1",
        studentName: "A",
      },
      {
        corrected: false,
        responseStatus: "zero_meal",
        selectedMeals: [],
        studentAccessId: "2",
        studentName: "B",
      },
      {
        corrected: false,
        responseStatus: "unconfirmed",
        selectedMeals: [],
        studentAccessId: "3",
        studentName: "C",
      },
    ]);
    expect(csv).toContain(",,,,,total,eligible_students,3\r\n");
    expect(csv).toContain(",,,,,total,responded,2\r\n");
    expect(csv).toContain(",,,,,total,zero_meal,1\r\n");
    expect(csv).toContain(",,,,,total,unconfirmed,1\r\n");
    expect(csv).toContain(",,,,,total,breakfast,0\r\n");
    expect(csv).toContain(",,,,,total,lunch,1\r\n");
    expect(csv).toContain(",,,,,total,dinner,1\r\n");
    expect(csv).toContain(",,,,,total,corrections,1\r\n");
  });
  it("includes zero totals for an empty finalized roster", () => {
    expect(buildMealExportCsv([])).toContain(
      ",,,,,total,eligible_students,0\r\n",
    );
  });
  it("uses stable UTF-8 headers and preserves explicit zero and unconfirmed states", () => {
    expect(
      buildMealExportCsv([
        {
          corrected: false,
          responseStatus: "zero_meal",
          selectedMeals: [],
          studentAccessId: "rz-001",
          studentName: "Ayşe Kaya",
        },
        {
          corrected: true,
          responseStatus: "selected",
          selectedMeals: ["breakfast", "dinner"],
          studentAccessId: "rz-002",
          studentName: 'Elif, "E"',
        },
      ]),
    ).toBe(
      "student_access_id,student_name,response_status,selected_meals,corrected,record_type,total,value\r\n" +
        "rz-001,Ayşe Kaya,zero_meal,,false,student,,\r\n" +
        'rz-002,"Elif, ""E""",selected,breakfast|dinner,true,student,,\r\n' +
        ",,,,,total,eligible_students,2\r\n,,,,,total,responded,2\r\n,,,,,total,zero_meal,1\r\n,,,,,total,unconfirmed,0\r\n" +
        ",,,,,total,breakfast,1\r\n,,,,,total,lunch,0\r\n,,,,,total,dinner,1\r\n,,,,,total,corrections,1\r\n",
    );
  });
});
