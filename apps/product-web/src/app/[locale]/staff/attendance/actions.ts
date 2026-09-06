"use server";

import { isSupportedLocale } from "@ranza/i18n";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createProductWebClient } from "../../../../lib/supabase/server";

export async function configureAttendanceSchedule(form: FormData) {
  const rawLocale = form.get("locale");
  const locale = isSupportedLocale(rawLocale) ? rawLocale : "tr";
  const branch = String(form.get("branch") ?? "");
  const path = `/${locale}/staff/attendance?branch=${encodeURIComponent(branch)}`;
  const timezone = String(form.get("timezone") ?? "");
  const cutoffMinute = Number(form.get("cutoffMinute"));
  if (
    !Number.isInteger(cutoffMinute) ||
    cutoffMinute < 0 ||
    cutoffMinute > 1439
  ) {
    redirect(`${path}&result=invalid`);
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(0);
  } catch {
    redirect(`${path}&result=invalid`);
  }

  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect(`/${locale}/staff/sign-in`);
  const { error } = await client.rpc("configure_attendance_schedule", {
    branch_timezone: timezone,
    nightly_cutoff_minute: cutoffMinute,
    target_branch_id: branch,
  });
  if (error) redirect(`${path}&result=denied`);
  revalidatePath(`/${locale}/staff/attendance`);
  redirect(`${path}&result=saved`);
}
