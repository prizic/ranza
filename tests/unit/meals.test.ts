import { describe, expect, it } from "vitest";

import {
  parseMealSelection,
  summarizeMealResponses,
} from "../../packages/domain/src/meals";

describe("meal selection", () => {
  it("accepts an explicit zero-meal response and canonicalizes offered selections", () => {
    expect(parseMealSelection([], ["breakfast", "lunch"])).toEqual([]);
    expect(
      parseMealSelection(
        ["lunch", "breakfast", "lunch"],
        ["breakfast", "lunch", "dinner"],
      ),
    ).toEqual(["breakfast", "lunch"]);
  });

  it("rejects a meal that was not offered", () => {
    expect(() => parseMealSelection(["dinner"], ["breakfast"])).toThrow(
      "offered",
    );
  });
});

describe("meal response summary", () => {
  it("distinguishes zero-meal responses from silence", () => {
    expect(
      summarizeMealResponses({
        eligibleStudentIds: ["ayse", "elif", "zeynep"],
        offeredMeals: ["breakfast", "lunch"],
        responses: [
          { selectedMeals: [], studentId: "ayse" },
          { selectedMeals: ["breakfast", "lunch"], studentId: "elif" },
        ],
      }),
    ).toEqual({
      breakfast: 1,
      dinner: 0,
      lunch: 1,
      responded: 2,
      unconfirmed: 1,
      zeroMeal: 1,
    });
  });
});
