"use server";

import { parseServerEnvironment } from "@ranza/config";
import { redirect } from "next/navigation";

import { formText, localeFromFormData } from "../../../lib/form-data";
import { createControlPlaneClient } from "../../../lib/supabase/server";

function recoveryRedirect(locale: string): string {
  const environment = parseServerEnvironment({
    ...process.env,
    CONTROL_PLANE_ORIGIN: process.env.CONTROL_PLANE_ORIGIN || undefined,
  });
  if (
    environment.NODE_ENV === "production" &&
    !environment.CONTROL_PLANE_ORIGIN
  ) {
    throw new Error("Control Plane origin is required in production");
  }
  const origin = new URL(
    environment.CONTROL_PLANE_ORIGIN ?? "http://localhost:3002",
  );
  return new URL(`/${locale}/auth/confirm`, origin).toString();
}

export async function requestPasswordRecoveryAction(formData: FormData) {
  const locale = localeFromFormData(formData);
  const client = await createControlPlaneClient();
  await client.auth.resetPasswordForEmail(formText(formData, "email"), {
    redirectTo: recoveryRedirect(locale),
  });
  redirect(`/${locale}/forgot-password?sent=1`);
}
