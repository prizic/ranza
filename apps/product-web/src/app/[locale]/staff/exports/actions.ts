"use server";
import { redirect } from "next/navigation";
import { createProductWebClient } from "../../../../lib/supabase/server";
export async function requestExportAction(form: FormData) {
  const locale =
    form.get("locale") === "en" || form.get("locale") === "ar"
      ? String(form.get("locale"))
      : "tr";
  const operatorId = String(form.get("operator") ?? "");
  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect(`/${locale}/staff/sign-in`);
  const { error } = await client.rpc("request_operator_export", {
    target_operator_id: operatorId,
  });
  redirect(
    `/${locale}/staff/exports?operator=${encodeURIComponent(operatorId)}&result=${error ? "denied" : "queued"}`,
  );
}
