"use server";

import { normalizeStaffEmail } from "@ranza/auth";
import { parseBedDraft, parseRoomDraft } from "@ranza/domain";
import { isSupportedLocale } from "@ranza/i18n";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createProductWebClient } from "../../../lib/supabase/server";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function staffPath(formData: FormData, result: "created" | "updated") {
  const rawLocale = formData.get("locale");
  const locale = isSupportedLocale(rawLocale) ? rawLocale : "tr";
  const branch = encodeURIComponent(text(formData, "branchId"));
  return `/${locale}/staff?branch=${branch}&result=${result}`;
}

function revalidateStaffPath(formData: FormData) {
  const rawLocale = formData.get("locale");
  const locale = isSupportedLocale(rawLocale) ? rawLocale : "tr";
  revalidatePath(`/${locale}/staff`);
}

async function capacityClient() {
  const client = await createProductWebClient();
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error("An active staff session is required");
  return client;
}

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

export async function createRoomAction(formData: FormData) {
  const draft = parseRoomDraft({ label: formData.get("label") });
  const client = await capacityClient();
  const { error } = await client.from("rooms").insert({
    branch_id: text(formData, "branchId"),
    label: draft.label,
    operator_id: text(formData, "operatorId"),
  });
  if (error) throw error;
  const path = staffPath(formData, "created");
  revalidateStaffPath(formData);
  redirect(path);
}

export async function updateRoomAction(formData: FormData) {
  const draft = parseRoomDraft({ label: formData.get("label") });
  const client = await capacityClient();
  const { error } = await client
    .from("rooms")
    .update({ label: draft.label })
    .eq("id", text(formData, "roomId"))
    .eq("operator_id", text(formData, "operatorId"))
    .eq("branch_id", text(formData, "branchId"));
  if (error) throw error;
  const path = staffPath(formData, "updated");
  revalidateStaffPath(formData);
  redirect(path);
}

export async function archiveRoomAction(formData: FormData) {
  const client = await capacityClient();
  const { error } = await client
    .from("rooms")
    .update({ status: "archived" })
    .eq("id", text(formData, "roomId"))
    .eq("operator_id", text(formData, "operatorId"))
    .eq("branch_id", text(formData, "branchId"));
  if (error) throw error;
  const path = staffPath(formData, "updated");
  revalidateStaffPath(formData);
  redirect(path);
}

export async function createBedAction(formData: FormData) {
  const draft = parseBedDraft({
    available: formData.get("available") === "on",
    label: formData.get("label"),
  });
  const client = await capacityClient();
  const { error } = await client.from("beds").insert({
    available: draft.available,
    branch_id: text(formData, "branchId"),
    label: draft.label,
    operator_id: text(formData, "operatorId"),
    room_id: text(formData, "roomId"),
  });
  if (error) throw error;
  const path = staffPath(formData, "created");
  revalidateStaffPath(formData);
  redirect(path);
}

export async function updateBedAction(formData: FormData) {
  const draft = parseBedDraft({
    available: formData.get("available") === "on",
    label: formData.get("label"),
  });
  const client = await capacityClient();
  const { error } = await client
    .from("beds")
    .update({ available: draft.available, label: draft.label })
    .eq("id", text(formData, "bedId"))
    .eq("operator_id", text(formData, "operatorId"))
    .eq("branch_id", text(formData, "branchId"));
  if (error) throw error;
  const path = staffPath(formData, "updated");
  revalidateStaffPath(formData);
  redirect(path);
}

export async function archiveBedAction(formData: FormData) {
  const client = await capacityClient();
  const { error } = await client
    .from("beds")
    .update({ status: "archived" })
    .eq("id", text(formData, "bedId"))
    .eq("operator_id", text(formData, "operatorId"))
    .eq("branch_id", text(formData, "branchId"));
  if (error) throw error;
  const path = staffPath(formData, "updated");
  revalidateStaffPath(formData);
  redirect(path);
}
