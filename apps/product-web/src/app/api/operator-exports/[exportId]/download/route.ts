import { createProductWebClient } from "../../../../../lib/supabase/server";
import { operatorExportDownload } from "../../../../../server/operator-export-download";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ exportId: string }> },
) {
  const { exportId } = await params;
  const operatorId = new URL(request.url).searchParams.get("operator") ?? "";
  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user)
    return new Response("Unauthorized", {
      status: 401,
      headers: { "Cache-Control": "private, no-store" },
    });
  return operatorExportDownload(exportId, operatorId, {
    authorize: async (id, operator) => {
      const { data, error } = await client.rpc("authorize_operator_export", {
        target_export_id: id,
        target_operator_id: operator,
      });
      return !error && typeof data === "string" ? data : null;
    },
    sign: async (path, seconds) => {
      const { data, error } = await client.storage
        .from("operator-exports")
        .createSignedUrl(path, seconds);
      return error ? null : (data?.signedUrl ?? null);
    },
  });
}
