"use server";

import type { ApplicationLocale, OperatorStatus } from "@ranza/domain";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { operatorControl } from "../../lib/operator-control";
import { createControlPlaneClient } from "../../lib/supabase/server";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function localeFrom(formData: FormData): ApplicationLocale {
  const locale = text(formData, "locale");
  return locale === "en" || locale === "ar" ? locale : "tr";
}

function resultPath(
  locale: ApplicationLocale,
  result:
    | "created"
    | "updated"
    | "export-requested"
    | "policy-approved"
    | "dry-run"
    | "lifecycle-queued",
) {
  return `/${locale}?result=${result}`;
}

export async function requestOperatorExportAction(formData: FormData) {
  const locale = localeFrom(formData);
  await operatorControl(locale);
  const client = await createControlPlaneClient(randomUUID());
  const { error } = await client.rpc("request_operator_export", {
    target_operator_id: text(formData, "operatorId"),
  });
  if (error) throw error;
  revalidatePath(`/${locale}`);
  redirect(resultPath(locale, "export-requested"));
}

export async function approveLifecyclePolicyAction(formData: FormData) {
  const locale = localeFrom(formData);
  await operatorControl(locale);
  const client = await createControlPlaneClient(randomUUID());
  const { error } = await client.rpc("approve_operator_lifecycle_policy", {
    anonymize_days: Number(text(formData, "anonymizeDays")),
    archive_days: Number(text(formData, "archiveDays")),
    delete_days: Number(text(formData, "deleteDays")),
    export_hours: Number(text(formData, "exportHours")),
    target_operator_id: text(formData, "operatorId"),
  });
  if (error) throw error;
  revalidatePath(`/${locale}`);
  redirect(resultPath(locale, "policy-approved"));
}

export async function planLifecycleAction(formData: FormData) {
  const locale = localeFrom(formData);
  await operatorControl(locale);
  const client = await createControlPlaneClient(randomUUID());
  const { error } = await client.rpc("plan_operator_lifecycle", {
    target_action: text(formData, "lifecycleAction"),
    target_operator_id: text(formData, "operatorId"),
  });
  if (error) throw error;
  revalidatePath(`/${locale}`);
  redirect(resultPath(locale, "dry-run"));
}

export async function executeLifecycleAction(formData: FormData) {
  const locale = localeFrom(formData);
  await operatorControl(locale);
  const client = await createControlPlaneClient(randomUUID());
  const { error } = await client.rpc("execute_operator_lifecycle", {
    target_idempotency_key: text(formData, "idempotencyKey"),
    target_operator_id: text(formData, "operatorId"),
    target_run_id: text(formData, "runId"),
  });
  if (error) throw error;
  revalidatePath(`/${locale}`);
  redirect(resultPath(locale, "lifecycle-queued"));
}

export async function signInAction(formData: FormData) {
  const locale = localeFrom(formData);
  const client = await createControlPlaneClient();
  const { error } = await client.auth.signInWithPassword({
    email: text(formData, "email"),
    password: text(formData, "password"),
  });
  if (error) redirect(`/${locale}/sign-in?error=invalid`);
  redirect(`/${locale}/mfa`);
}

export async function signOutAction(formData: FormData) {
  const locale = localeFrom(formData);
  const client = await createControlPlaneClient();
  await client.auth.signOut();
  redirect(`/${locale}/sign-in`);
}

export async function createOperatorAction(formData: FormData) {
  const locale = localeFrom(formData);
  const { actor, service } = await operatorControl(locale);
  await service.createOperator(actor, {
    defaultLocale: text(formData, "defaultLocale") as ApplicationLocale,
    name: text(formData, "name"),
  });
  revalidatePath(`/${locale}`);
  redirect(resultPath(locale, "created"));
}

export async function setOperatorStatusAction(formData: FormData) {
  const locale = localeFrom(formData);
  const { actor, service } = await operatorControl(locale);
  await service.setOperatorStatus(actor, {
    currentStatus: text(formData, "currentStatus") as OperatorStatus,
    operatorId: text(formData, "operatorId"),
    status: text(formData, "status") as OperatorStatus,
  });
  revalidatePath(`/${locale}`);
  redirect(resultPath(locale, "updated"));
}

export async function createBranchAction(formData: FormData) {
  const locale = localeFrom(formData);
  const { actor, service } = await operatorControl(locale);
  await service.createBranch(actor, {
    defaultLocale: text(formData, "defaultLocale") as ApplicationLocale,
    name: text(formData, "name"),
    operatorId: text(formData, "operatorId"),
    residenceClassification: text(formData, "residenceClassification") as
      "male" | "female" | "mixed" | "other",
    timezone: text(formData, "timezone"),
  });
  revalidatePath(`/${locale}`);
  redirect(resultPath(locale, "created"));
}

export async function archiveBranchAction(formData: FormData) {
  const locale = localeFrom(formData);
  const { actor, service } = await operatorControl(locale);
  await service.archiveBranch(actor, {
    branchId: text(formData, "branchId"),
    operatorId: text(formData, "operatorId"),
  });
  revalidatePath(`/${locale}`);
  redirect(resultPath(locale, "updated"));
}
