"use server";

import { parseStudentDraft } from "@ranza/domain";
import { isSupportedLocale } from "@ranza/i18n";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createProductWebClient } from "../../../../lib/supabase/server";

export async function manageRoster(form: FormData) {
  const rawLocale = form.get("locale");
  const locale = isSupportedLocale(rawLocale) ? rawLocale : "tr";
  const branch = String(form.get("branch") ?? "");
  const path = `/${locale}/staff/roster?branch=${encodeURIComponent(branch)}`;
  const operation = String(form.get("operation") ?? "");
  let draft;
  try {
    if (operation === "create" || operation === "edit")
      draft = parseStudentDraft({
        displayName: form.get("displayName"),
        preferredLocale: form.get("preferredLocale"),
        externalReference: form.get("externalReference"),
      });
  } catch {
    redirect(`${path}&error=invalid`);
  }
  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect(`/${locale}/staff/sign-in`);
  const { error } = await client.rpc("manage_student_roster", {
    operation,
    target_operator_id: form.get("operator"),
    target_student_id: form.get("student") || null,
    target_branch_id:
      operation === "transfer" ? form.get("destination") : branch,
    student_name: draft?.displayName ?? null,
    student_locale: draft?.preferredLocale ?? locale,
    student_reference: draft?.externalReference ?? null,
  });
  if (error) redirect(`${path}&error=denied`);
  revalidatePath(`/${locale}/staff/roster`);
  redirect(`${path}&saved=1`);
}
