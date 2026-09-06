"use server";

import {
  formatMinorUnits,
  toSignedMinorUnits,
  type PostableBalanceEntryType,
} from "@ranza/domain";
import { isSupportedLocale } from "@ranza/i18n";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createProductWebClient } from "../../../../lib/supabase/server";

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
function target(formData: FormData, result: string) {
  const locale = isSupportedLocale(formData.get("locale"))
    ? formData.get("locale")
    : "tr";
  return `/${locale}/staff/balances?branch=${encodeURIComponent(text(formData, "branchId"))}&student=${encodeURIComponent(text(formData, "studentId"))}&result=${result}`;
}

export async function postBalanceEntryAction(formData: FormData) {
  const entryType = text(formData, "entryType") as PostableBalanceEntryType;
  let amount: string;
  try {
    amount = formatMinorUnits(
      toSignedMinorUnits(entryType, text(formData, "amount")),
    );
  } catch {
    redirect(target(formData, "invalid"));
  }
  const client = await createProductWebClient();
  const { error } = await client.rpc("post_balance_entry", {
    target_amount: amount,
    target_branch_id: text(formData, "branchId"),
    target_currency: text(formData, "currency") || "TRY",
    target_description: text(formData, "description"),
    target_due_date: text(formData, "dueDate") || null,
    target_effective_date: text(formData, "effectiveDate"),
    target_entry_type: entryType,
    target_idempotency_key: text(formData, "idempotencyKey"),
    target_operator_id: text(formData, "operatorId"),
    target_student_id: text(formData, "studentId"),
  });
  if (error) redirect(target(formData, "failed"));
  revalidatePath(target(formData, "posted").split("?")[0] ?? "/");
  redirect(target(formData, "posted"));
}

export async function reverseBalanceEntryAction(formData: FormData) {
  const client = await createProductWebClient();
  const { error } = await client.rpc("reverse_balance_entry", {
    target_description: text(formData, "description"),
    target_entry_id: text(formData, "entryId"),
    target_idempotency_key: text(formData, "idempotencyKey"),
  });
  if (error) redirect(target(formData, "failed"));
  revalidatePath(target(formData, "reversed").split("?")[0] ?? "/");
  redirect(target(formData, "reversed"));
}
