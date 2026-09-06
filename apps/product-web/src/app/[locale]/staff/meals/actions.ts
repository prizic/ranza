"use server";

import { isSupportedLocale } from "@ranza/i18n";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createProductWebClient } from "../../../../lib/supabase/server";

export async function publishMealDayAction(formData: FormData) {
  const rawLocale = formData.get("locale");
  const locale = isSupportedLocale(rawLocale) ? rawLocale : "tr";
  const branchId = String(formData.get("branchId") ?? "");
  const deadline = String(formData.get("deadlineAt") ?? "");
  const client = await createProductWebClient();
  const { error } = await client.rpc("publish_meal_day", {
    offered_meals: formData
      .getAll("meal")
      .filter((value): value is string => typeof value === "string"),
    target_branch_id: branchId,
    target_deadline_at: new Date(`${deadline}Z`).toISOString(),
    target_operator_id: String(formData.get("operatorId") ?? ""),
    target_service_date: String(formData.get("serviceDate") ?? ""),
  });
  if (error)
    redirect(`/${locale}/staff/meals?branch=${branchId}&result=failed`);
  revalidatePath(`/${locale}/staff/meals`);
  redirect(`/${locale}/staff/meals?branch=${branchId}&result=published`);
}
