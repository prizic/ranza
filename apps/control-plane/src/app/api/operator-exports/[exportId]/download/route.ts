import { redirect } from "next/navigation";

import { createControlPlaneClient } from "../../../../../lib/supabase/server";

export const runtime = "nodejs";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ exportId: string }> },
) {
  const { exportId } = await params;
  const operatorId = new URL(request.url).searchParams.get("operator");
  if (
    !operatorId ||
    !uuidPattern.test(exportId) ||
    !uuidPattern.test(operatorId)
  ) {
    return new Response("Not found", { status: 404 });
  }
  const client = await createControlPlaneClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return new Response("Unauthorized", { status: 401 });
  const { data: objectPath, error } = await client.rpc(
    "authorize_operator_export",
    {
      target_export_id: exportId,
      target_operator_id: operatorId,
    },
  );
  if (error || typeof objectPath !== "string")
    return new Response("Forbidden", { status: 403 });
  const { data: signed, error: signError } = await client.storage
    .from("operator-exports")
    .createSignedUrl(objectPath, 60);
  if (signError) return new Response("Forbidden", { status: 403 });
  redirect(signed.signedUrl);
}
