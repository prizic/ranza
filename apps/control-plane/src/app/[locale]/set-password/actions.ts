"use server";

import { redirect } from "next/navigation";

import { formText, localeFromFormData } from "../../../lib/form-data";
import { completePlatformInvite } from "../../../lib/platform-invite";
import { createControlPlaneClient } from "../../../lib/supabase/server";

export async function setInvitePasswordAction(formData: FormData) {
  const locale = localeFromFormData(formData);
  const client = await createControlPlaneClient();
  const result = await completePlatformInvite(
    {
      getUser: () => client.auth.getUser(),
      hasActivePlatformAccess: async (userId) => {
        const { data, error } = await client
          .from("platform_access")
          .select("status")
          .eq("auth_user_id", userId)
          .maybeSingle();
        return !error && data?.status === "active";
      },
      updateUser: (input) => client.auth.updateUser(input),
    },
    formText(formData, "password"),
    formText(formData, "passwordConfirmation"),
  );

  if (result.ok) redirect(`/${locale}/mfa`);
  if (result.reason === "unauthenticated") {
    redirect(`/${locale}/sign-in?error=invalid-invite`);
  }
  if (result.reason === "unauthorized") redirect(`/${locale}/forbidden`);
  redirect(`/${locale}/set-password?error=${result.reason}`);
}
