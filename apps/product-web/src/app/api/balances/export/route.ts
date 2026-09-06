import { buildBalanceExportCsv, type BalanceExportRow } from "@ranza/domain";

import { createProductWebClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const operatorId = url.searchParams.get("operator");
  const branchId = url.searchParams.get("branch");
  if (
    !operatorId ||
    !branchId ||
    !uuidPattern.test(operatorId) ||
    !uuidPattern.test(branchId)
  ) {
    return new Response("Not found", { status: 404 });
  }
  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return new Response("Unauthorized", { status: 401 });
  const { data, error } = await client.rpc("export_branch_balances", {
    target_branch_id: branchId,
    target_operator_id: operatorId,
  });
  if (error) return new Response("Forbidden", { status: 403 });
  const rows = (data ?? []) as unknown as Array<
    Record<keyof BalanceExportRow, unknown>
  >;
  const csv = buildBalanceExportCsv(
    rows.map(
      (row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            value == null ? "" : String(value),
          ]),
        ) as BalanceExportRow,
    ),
  );
  return new Response(csv, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="balance-${branchId}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
