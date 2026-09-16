"use server";

import { normalizeStaffEmail } from "@ranza/auth";
import { parseServerEnvironment } from "@ranza/config";
import { isSupportedLocale } from "@ranza/i18n";
import { redirect } from "next/navigation";

import { createProductWebClient } from "../../../lib/supabase/server";

export async function requestStaffSignIn(formData: FormData) {
  const rawLocale = formData.get("locale");
  const locale = isSupportedLocale(rawLocale) ? rawLocale : "tr";
  let email: string;
  try {
    email = normalizeStaffEmail(formData.get("email"));
  } catch {
    redirect(`/${locale}/staff/sign-in?error=invalid-email`);
  }

  const client = await createProductWebClient();
  const environment = parseServerEnvironment(process.env);
  const siteUrl =
    environment.PRODUCT_WEB_ORIGIN ??
    (environment.NODE_ENV === "production" ? null : "http://localhost:3101");
  if (!siteUrl) redirect(`/${locale}/staff/sign-in?error=not-authorized`);
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl}/${locale}/staff/auth/callback`,
      shouldCreateUser: false,
    },
  });
  redirect(
    error
      ? `/${locale}/staff/sign-in?error=not-authorized`
      : `/${locale}/staff/sign-in?sent=1`,
  );
}
