"use server";
import { isSupportedLocale } from "@ranza/i18n";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createProductWebClient } from "../../../lib/supabase/server";

export async function acknowledgeAnnouncementAction(form: FormData) {
  const raw = form.get("locale");
  const locale = isSupportedLocale(raw) ? raw : "tr";
  let success = false;
  try {
    const client = await createProductWebClient();
    const result = await client.rpc("acknowledge_announcement", {
      target_revision_id: String(form.get("revision") ?? ""),
    });
    success = !result.error;
  } catch {
    /* Do not reveal authorization or database internals. */
  }
  revalidatePath(`/${locale}/announcements`);
  redirect(`/${locale}/announcements?result=${success ? "saved" : "failed"}`);
}
