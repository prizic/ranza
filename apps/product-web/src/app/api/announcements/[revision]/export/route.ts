import {
  announcementFollowupCsv,
  type AnnouncementFollowupRow,
} from "@ranza/domain";
import { createProductWebClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ revision: string }> },
) {
  const { revision } = await params;
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
  };
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      revision,
    )
  )
    return new Response(null, { status: 404, headers });
  const status = new URL(request.url).searchParams.get("status") ?? "all";
  try {
    const client = await createProductWebClient();
    const result = await client.rpc("announcement_followup", {
      target_revision_id: revision,
      target_status: status,
      record_export: true,
    });
    if (result.error || !result.data)
      return new Response(null, { status: 404, headers });
    return new Response(
      announcementFollowupCsv(
        result.data.recipients as AnnouncementFollowupRow[],
      ),
      {
        headers: {
          ...headers,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="announcement-${revision}.csv"`,
        },
      },
    );
  } catch {
    return new Response(null, { status: 404, headers });
  }
}
