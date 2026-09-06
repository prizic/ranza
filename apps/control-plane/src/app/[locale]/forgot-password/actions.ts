"use server";

import { redirect } from "next/navigation";

import { formText, localeFromFormData } from "../../../lib/form-data";
import { createControlPlaneClient } from "../../../lib/supabase/server";

function recoveryRedirect(locale: string): string {
  const configuredOrigin = process.env.CONTROL_PLANE_ORIGIN;
  const origin = new URL(configuredOrigin ?? "http://localhost:3002");
  if (
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/" ||
    (origin.protocol !== "https:" && origin.hostname !== "localhost")
  ) {
    throw new Error("The Control Plane origin is invalid.");
  }
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
