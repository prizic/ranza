import {
  createOperatorControlService,
  type BranchRecord,
  type OperatorControlRepository,
  type OperatorRecord,
  type PlatformActor,
} from "@ranza/database";
import type {
  BranchDraft,
  BranchStatus,
  OperatorStatus,
  ResidenceClassification,
} from "@ranza/domain";
import { redirect } from "next/navigation";

import { createControlPlaneClient } from "./supabase/server";

interface PlatformAccessRow {
  auth_user_id: string;
  mfa_required: boolean;
  role: "platform_admin" | "platform_support";
  status: "active" | "suspended" | "archived";
}

export interface OperatorView {
  branches: Array<{
    defaultLocale: "tr" | "en" | "ar";
    id: string;
    name: string;
    residenceClassification: ResidenceClassification;
    status: BranchStatus;
    timezone: string;
    billableBeds: number;
  }>;
  billableBeds: number;
  currentSubscription: null | {
    pricingReference: string;
    status: string;
  };
  defaultLocale: "tr" | "en" | "ar";
  id: string;
  name: string;
  status: OperatorStatus;
}

async function currentActor(locale: string): Promise<PlatformActor> {
  const client = await createControlPlaneClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect(`/${locale}/sign-in`);

  const { data, error } = await client
    .from("platform_access")
    .select("auth_user_id, role, status, mfa_required")
    .eq("auth_user_id", user.id)
    .maybeSingle<PlatformAccessRow>();
  if (error || !data) redirect(`/${locale}/forbidden`);

  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  return {
    mfaRequired: data.mfa_required,
    mfaVerified: assurance.data?.currentLevel === "aal2",
    role: data.role,
    status: data.status,
    userId: data.auth_user_id,
  };
}

function repository(): OperatorControlRepository {
  return {
    async archiveBranch(input, context) {
      const client = await createControlPlaneClient(context.correlationId);
      const { data, error } = await client
        .from("branches")
        .update({ status: "archived" })
        .eq("id", input.branchId)
        .eq("operator_id", input.operatorId)
        .select("id, operator_id, status")
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: String(data.id),
        operatorId: String(data.operator_id),
        status: data.status as BranchStatus,
      };
    },
    async createBranch(input, context) {
      const client = await createControlPlaneClient(context.correlationId);
      const { data, error } = await client
        .from("branches")
        .insert({
          default_locale: input.defaultLocale,
          name: input.name,
          operator_id: input.operatorId,
          residence_classification: input.residenceClassification,
          timezone: input.timezone,
        })
        .select("id, operator_id, status")
        .single();
      if (error) throw error;
      return {
        id: String(data.id),
        operatorId: String(data.operator_id),
        status: data.status as BranchStatus,
      } satisfies BranchRecord;
    },
    async createOperator(input, context) {
      const client = await createControlPlaneClient(context.correlationId);
      const { data, error } = await client
        .from("operators")
        .insert({ default_locale: input.defaultLocale, name: input.name })
        .select("id, status")
        .single();
      if (error) throw error;
      return {
        id: String(data.id),
        status: data.status as OperatorStatus,
      } satisfies OperatorRecord;
    },
    async setOperatorStatus(input, context) {
      const client = await createControlPlaneClient(context.correlationId);
      const { data, error } = await client
        .from("operators")
        .update({ status: input.status })
        .eq("id", input.operatorId)
        .eq("status", input.currentStatus)
        .select("id, status")
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: String(data.id),
        status: data.status as OperatorStatus,
      };
    },
  };
}

export async function operatorControl(locale: string) {
  return {
    actor: await currentActor(locale),
    service: createOperatorControlService(repository()),
  };
}

export async function readOperators(locale: string): Promise<OperatorView[]> {
  await currentActor(locale);
  const client = await createControlPlaneClient();
  const [
    { data: operators, error: operatorError },
    { data: branches, error: branchError },
    { data: capacity, error: capacityError },
    { data: subscriptions, error: subscriptionError },
  ] = await Promise.all([
    client
      .from("operators")
      .select("id, name, status, default_locale")
      .order("created_at", { ascending: false }),
    client
      .from("branches")
      .select(
        "id, operator_id, name, status, timezone, default_locale, residence_classification",
      )
      .order("created_at", { ascending: true }),
    client
      .from("branch_capacity_summary")
      .select("operator_id, branch_id, billable_beds"),
    client
      .from("subscriptions")
      .select("operator_id, status, pricing_reference")
      .eq("is_current", true),
  ]);
  if (operatorError) throw operatorError;
  if (branchError) throw branchError;
  if (capacityError) throw capacityError;
  if (subscriptionError) throw subscriptionError;

  return (operators ?? []).map((operator) => {
    const operatorBranches = (branches ?? [])
      .filter((branch) => branch.operator_id === operator.id)
      .map((branch) => ({
        billableBeds:
          capacity?.find((summary) => summary.branch_id === branch.id)
            ?.billable_beds ?? 0,
        defaultLocale: branch.default_locale as "tr" | "en" | "ar",
        id: String(branch.id),
        name: String(branch.name),
        residenceClassification:
          branch.residence_classification as ResidenceClassification,
        status: branch.status as BranchStatus,
        timezone: String(branch.timezone),
      }));
    const subscription = subscriptions?.find(
      (item) => item.operator_id === operator.id,
    );
    return {
      billableBeds: operatorBranches.reduce(
        (total, branch) => total + branch.billableBeds,
        0,
      ),
      branches: operatorBranches,
      currentSubscription: subscription
        ? {
            pricingReference: String(subscription.pricing_reference),
            status: String(subscription.status),
          }
        : null,
      defaultLocale: operator.default_locale as "tr" | "en" | "ar",
      id: String(operator.id),
      name: String(operator.name),
      status: operator.status as OperatorStatus,
    };
  });
}

export type { BranchDraft };
