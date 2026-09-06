"use server";
import { isSupportedLocale } from "@ranza/i18n";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createProductWebClient } from "../../../../lib/supabase/server";

export async function manageAnnouncementAction(form: FormData) {
  const raw = form.get("locale");
  const locale = isSupportedLocale(raw) ? raw : "tr";
  const operator = String(form.get("operator") ?? "");
  let success = false;
  try {
    const client = await createProductWebClient();
    const operation = form.get("operation");
    if (operation === "draft" || operation === "revise") {
      const source = String(form.get("source") ?? "tr");
      const translations = Object.fromEntries(
        ["tr", "en", "ar"]
          .filter((key) => key !== source && String(form.get(key) ?? "").trim())
          .map((key) => [key, String(form.get(key))]),
      );
      const result = await client.rpc(
        operation === "revise"
          ? "revise_announcement"
          : "save_announcement_draft",
        {
          ...(operation === "revise"
            ? { target_id: String(form.get("announcement") ?? "") }
            : { target_operator_id: operator, target_id: null }),
          target_scope: String(form.get("scope") ?? "branches"),
          target_branches:
            form.get("scope") === "operator"
              ? []
              : form.getAll("branch").map(String),
          source_locale: source,
          source_content: String(form.get("content") ?? ""),
          translations,
        },
      );
      success = !result.error;
    } else if (operation === "publish" || operation === "archive") {
      const result = await client.rpc(
        operation === "publish"
          ? "publish_announcement"
          : "archive_announcement",
        { target_id: String(form.get("announcement") ?? "") },
      );
      success = !result.error;
    }
  } catch {
    /* Keep authorization and content out of error URLs/logs. */
  }
  revalidatePath(`/${locale}/staff/announcements`);
  redirect(
    `/${locale}/staff/announcements?operator=${encodeURIComponent(operator)}&result=${success ? "saved" : "failed"}`,
  );
}
