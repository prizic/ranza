"use server";

import { isSupportedLocale } from "@ranza/i18n";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createProductWebClient } from "../../../../lib/supabase/server";
import { storeProtectedWifi } from "../../../../server/protected-wifi";

export async function saveProtectedWifi(form: FormData) {
  const rawLocale = form.get("locale");
  const locale = isSupportedLocale(rawLocale) ? rawLocale : "tr";
  const branchId = String(form.get("branchId") ?? "");
  const path = `/${locale}/staff/wifi?branch=${encodeURIComponent(branchId)}`;
  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect(`/${locale}/staff/sign-in`);
  try {
    await storeProtectedWifi(client, branchId, {
      instructions: form.get("instructions"),
      networkName: form.get("networkName"),
      password: form.get("password"),
    });
  } catch {
    redirect(`${path}&result=failed`);
  }
  revalidatePath(`/${locale}/wifi`);
  revalidatePath(`/${locale}/staff/wifi`);
  redirect(`${path}&result=saved`);
}
