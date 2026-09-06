import { describe, expect, it } from "vitest";

import { buildMealExportCsv } from "../../packages/domain/src/meal-export";

describe("Meal export CSV", () => {
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
      "student_access_id,student_name,response_status,selected_meals,corrected\r\n" +
        "rz-001,Ayşe Kaya,zero_meal,,false\r\n" +
        'rz-002,"Elif, ""E""",selected,breakfast|dinner,true\r\n',
    );
  });
});
