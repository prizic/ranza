import { parseServerEnvironment } from "@ranza/config";
import { createClient } from "@supabase/supabase-js";

export interface ImportPreviewRow {
  displayName: string | null;
  errors: string[];
  externalReference: string | null;
  preferredLocale: string | null;
  rowNumber: number;
}

export interface ImportPreview {
  error_count: number;
  error_reference: string | null;
  id: string;
  imported_count: number;
  row_count: number;
  rows: ImportPreviewRow[];
  status: "cancelled" | "committed" | "failed" | "importing" | "staged";
  valid_count: number;
}

function client() {
  const env = parseServerEnvironment(process.env);
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("The Student import service is not configured.");
  }
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}

async function call(name: string, args: Record<string, unknown>) {
  const { data, error } = await client().rpc(name, args);
  if (error) throw error;
  return data as ImportPreview;
}

export const studentImportGateway = {
  cancel: (args: { actorId: string; importKey: string; operatorId: string }) =>
    call("cancel_student_roster_import_service", {
      actor_id: args.actorId,
      target_import_key: args.importKey,
      target_operator_id: args.operatorId,
    }),
  confirm: (args: {
    actorId: string;
    importKey: string;
    operatorId: string;
    selectedRows: number[];
  }) =>
    call("confirm_student_roster_import_service", {
      actor_id: args.actorId,
      selected_rows: args.selectedRows,
      target_import_key: args.importKey,
      target_operator_id: args.operatorId,
    }),
  stage: (args: {
    actorId: string;
    branchId: string;
    importKey: string;
    operatorId: string;
    rows: unknown[];
  }) =>
    call("stage_student_roster_import_service", {
      actor_id: args.actorId,
      submitted_rows: args.rows,
      target_branch_id: args.branchId,
      target_import_key: args.importKey,
      target_operator_id: args.operatorId,
    }),
};
