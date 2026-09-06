export const mealTypes = ["breakfast", "lunch", "dinner"] as const;
export type MealType = (typeof mealTypes)[number];

function isMealType(value: string): value is MealType {
  return mealTypes.includes(value as MealType);
}

export function parseMealSelection(
  selected: readonly string[],
  offered: readonly MealType[],
): MealType[] {
  const selectedSet = new Set(selected);
  if (
    [...selectedSet].some(
      (meal) => !isMealType(meal) || !offered.includes(meal),
    )
  ) {
    throw new RangeError("selected meals must be offered");
  }
  return mealTypes.filter((meal) => selectedSet.has(meal));
}

export function summarizeMealResponses(input: {
  eligibleStudentIds: readonly string[];
  offeredMeals: readonly MealType[];
  responses: readonly {
    selectedMeals: readonly MealType[];
    studentId: string;
  }[];
}) {
  const eligible = new Set(input.eligibleStudentIds);
  const responses = input.responses.filter((response) =>
    eligible.has(response.studentId),
  );
  const totals = Object.fromEntries(
    mealTypes.map((meal) => [
      meal,
      responses.filter((response) => response.selectedMeals.includes(meal))
        .length,
    ]),
  ) as Record<MealType, number>;
  return {
    ...totals,
    responded: responses.length,
    unconfirmed: Math.max(0, eligible.size - responses.length),
    zeroMeal: responses.filter(
      (response) => response.selectedMeals.length === 0,
    ).length,
  };
}
