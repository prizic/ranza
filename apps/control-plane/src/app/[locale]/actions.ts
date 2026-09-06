"use server";

import type { ApplicationLocale, OperatorStatus } from "@ranza/domain";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { operatorControl } from "../../lib/operator-control";
import { formText, localeFromFormData } from "../../lib/form-data";
import { createControlPlaneClient } from "../../lib/supabase/server";

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
  const locale = localeFromFormData(formData);
  await operatorControl(locale);
  const client = await createControlPlaneClient(randomUUID());
  const { error } = await client.rpc("request_operator_export", {
    target_operator_id: formText(formData, "operatorId"),
  });
  if (error) throw error;
  revalidatePath(`/${locale}`);
  redirect(resultPath(locale, "export-requested"));
}

export async function approveLifecyclePolicyAction(formData: FormData) {
  const locale = localeFromFormData(formData);
  await operatorControl(locale);
  const client = await createControlPlaneClient(randomUUID());
  const { error } = await client.rpc("approve_operator_lifecycle_policy", {
    anonymize_days: Number(formText(formData, "anonymizeDays")),
    archive_days: Number(formText(formData, "archiveDays")),
    delete_days: Number(formText(formData, "deleteDays")),
    export_hours: Number(formText(formData, "exportHours")),
    target_operator_id: formText(formData, "operatorId"),
  });
  if (error) throw error;
  revalidatePath(`/${locale}`);
  redirect(resultPath(locale, "policy-approved"));
}

export async function planLifecycleAction(formData: FormData) {
  const locale = localeFromFormData(formData);
  await operatorControl(locale);
  const client = await createControlPlaneClient(randomUUID());
  const { error } = await client.rpc("plan_operator_lifecycle", {
    target_action: formText(formData, "lifecycleAction"),
    target_operator_id: formText(formData, "operatorId"),
  });
  if (error) throw error;
  revalidatePath(`/${locale}`);
  redirect(resultPath(locale, "dry-run"));
}

export async function executeLifecycleAction(formData: FormData) {
  const locale = localeFromFormData(formData);
  await operatorControl(locale);
  const client = await createControlPlaneClient(randomUUID());
  const { error } = await client.rpc("execute_operator_lifecycle", {
    target_idempotency_key: formText(formData, "idempotencyKey"),
    target_operator_id: formText(formData, "operatorId"),
    target_run_id: formText(formData, "runId"),
  });
  if (error) throw error;
  revalidatePath(`/${locale}`);
  redirect(resultPath(locale, "lifecycle-queued"));
}

export async function signInAction(formData: FormData) {
  const locale = localeFromFormData(formData);
  const client = await createControlPlaneClient();
  const { error } = await client.auth.signInWithPassword({
    email: formText(formData, "email"),
    password: formText(formData, "password"),
  });
  if (error) redirect(`/${locale}/sign-in?error=invalid`);
  redirect(`/${locale}/mfa`);
}

export async function signOutAction(formData: FormData) {
  const locale = localeFromFormData(formData);
  const client = await createControlPlaneClient();
  await client.auth.signOut();
  redirect(`/${locale}/sign-in`);
}

export async function createOperatorAction(formData: FormData) {
  const locale = localeFromFormData(formData);
  const { actor, service } = await operatorControl(locale);
  await service.createOperator(actor, {
    defaultLocale: formText(formData, "defaultLocale") as ApplicationLocale,
    name: formText(formData, "name"),
  });
  revalidatePath(`/${locale}`);
  redirect(resultPath(locale, "created"));
}

export async function setOperatorStatusAction(formData: FormData) {
  const locale = localeFromFormData(formData);
  const { actor, service } = await operatorControl(locale);
  await service.setOperatorStatus(actor, {
    currentStatus: formText(formData, "currentStatus") as OperatorStatus,
    operatorId: formText(formData, "operatorId"),
    status: formText(formData, "status") as OperatorStatus,
  });
  revalidatePath(`/${locale}`);
  redirect(resultPath(locale, "updated"));
}

export async function createBranchAction(formData: FormData) {
  const locale = localeFromFormData(formData);
  const { actor, service } = await operatorControl(locale);
  await service.createBranch(actor, {
    defaultLocale: formText(formData, "defaultLocale") as ApplicationLocale,
    name: formText(formData, "name"),
    operatorId: formText(formData, "operatorId"),
    residenceClassification: formText(formData, "residenceClassification") as
      "male" | "female" | "mixed" | "other",
    timezone: formText(formData, "timezone"),
  });
  revalidatePath(`/${locale}`);
  redirect(resultPath(locale, "created"));
}

export async function archiveBranchAction(formData: FormData) {
  const locale = localeFromFormData(formData);
  const { actor, service } = await operatorControl(locale);
  await service.archiveBranch(actor, {
    branchId: formText(formData, "branchId"),
    operatorId: formText(formData, "operatorId"),
  });
  revalidatePath(`/${locale}`);
  redirect(resultPath(locale, "updated"));
}
