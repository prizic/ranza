"use server";

import { normalizeStaffEmail } from "@ranza/auth";
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
  const siteUrl =
    process.env.NEXT_PUBLIC_PRODUCT_WEB_URL ?? "http://localhost:3101";
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
