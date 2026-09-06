"use server";

import { parseAttendanceDeclaration } from "@ranza/domain";
import { isSupportedLocale } from "@ranza/i18n";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createProductWebClient } from "../../../../lib/supabase/server";

export async function submitAttendance(form: FormData) {
  const rawLocale = form.get("locale");
  const locale = isSupportedLocale(rawLocale) ? rawLocale : "tr";
  const path = `/${locale}/student/attendance`;
  const session = String(form.get("session") ?? "");
  let declaration;
  try {
    declaration = parseAttendanceDeclaration(form.get("declaration"));
  } catch {
    redirect(`${path}?result=failed`);
  }

  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect(`/${locale}/student/sign-in`);
  const { error } = await client.rpc("submit_attendance_declaration", {
    requested_declaration: declaration,
    target_session_id: session,
  });
  if (error) {
    const result = error.message.toLowerCase().includes("cutoff")
      ? "late"
      : "failed";
    redirect(`${path}?result=${result}`);
  }
  revalidatePath(path);
  redirect(`${path}?result=saved`);
}
