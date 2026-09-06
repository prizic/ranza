"use server";
import { redirect } from "next/navigation";
import { createControlPlaneClient } from "../../../lib/supabase/server";
export interface MfaState {
  factorId?: string;
  qr?: string;
  error?: boolean;
}
export async function mfaAction(
  _state: MfaState,
  form: FormData,
): Promise<MfaState> {
  const locale =
    form.get("locale") === "en" || form.get("locale") === "ar"
      ? String(form.get("locale"))
      : "tr";
  const client = await createControlPlaneClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect(`/${locale}/sign-in`);
  const access = await client
    .from("platform_access")
    .select("status")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (access.data?.status !== "active") return { error: true };
  const factorId = String(form.get("factorId") ?? "");
  if (factorId) {
    const { error } = await client.auth.mfa.challengeAndVerify({
      factorId,
      code: String(form.get("code") ?? ""),
    });
    if (error) return { factorId, error: true };
    redirect(`/${locale}`);
  }
  const factors = await client.auth.mfa.listFactors();
  const existing = factors.data?.totp.find(
    (factor) => factor.status === "verified",
  );
  if (existing) return { factorId: existing.id };
  const { data, error } = await client.auth.mfa.enroll({ factorType: "totp" });
  if (error || !data) return { error: true };
  return { factorId: data.id, qr: data.totp.qr_code };
}
