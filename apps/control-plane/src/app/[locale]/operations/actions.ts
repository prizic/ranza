"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createControlPlaneClient } from "../../../lib/supabase/server";

export async function supportAction(form: FormData) {
  const value = (name: string) => String(form.get(name) ?? "");
  const locale =
    value("locale") === "en" || value("locale") === "ar"
      ? value("locale")
      : "tr";
  const client = await createControlPlaneClient(randomUUID());
  const context = value("context");
  const operation = value("operation");
  const result =
    operation === "start"
      ? await client.rpc("start_support_context", {
          target_operator_id: value("operator"),
          context_reason: value("reason"),
        })
      : operation === "revoke"
        ? await client.rpc("revoke_support_context", { context_id: context })
        : operation === "disable"
          ? await client.rpc("support_disable_capability", {
              context_id: context,
              target_operator_id: value("operator"),
              capability: value("capability"),
              override_reason: value("reason"),
            })
          : operation === "retry"
            ? await client.rpc("retry_platform_job", {
                context_id: context,
                target_job_id: value("job"),
                retry_reason: value("reason"),
              })
            : { error: true, data: null };
  const nextContext =
    operation === "start" && !result.error ? String(result.data) : context;
  redirect(
    `/${locale}/operations?context=${encodeURIComponent(nextContext)}&result=${result.error ? "denied" : "saved"}`,
  );
}
