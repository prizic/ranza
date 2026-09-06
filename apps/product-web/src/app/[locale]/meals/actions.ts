"use server";

import { isSupportedLocale } from "@ranza/i18n";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createProductWebClient } from "../../../lib/supabase/server";

export async function submitMealResponseAction(formData: FormData) {
  const rawLocale = formData.get("locale");
  const locale = isSupportedLocale(rawLocale) ? rawLocale : "tr";
  const mealDayId = String(formData.get("mealDayId") ?? "");
  const selectedMeals = formData
    .getAll("meal")
    .filter((item): item is string => typeof item === "string");
  const client = await createProductWebClient();
  const { error } = await client.rpc("submit_meal_response", {
    selected_meals: selectedMeals,
    target_meal_day_id: mealDayId,
  });
  if (error) redirect(`/${locale}/meals?result=failed`);
  revalidatePath(`/${locale}/meals`);
  redirect(`/${locale}/meals?result=saved`);
}
