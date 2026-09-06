import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { verifySchedulerRequest } from "../../../../server/scheduler-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const correlationId = randomUUID();
  const schedulerSecret = process.env.ATTENDANCE_SCHEDULER_SECRET ?? "";
  if (!verifySchedulerRequest(request.headers, schedulerSecret)) {
    return Response.json(
      { correlationId, error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return Response.json(
      { correlationId, error: "Scheduler unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.rpc("finalize_due_attendance", {
    maximum_sessions: 100,
    requested_correlation_id: correlationId,
  });
  if (error) {
    return Response.json(
      { correlationId, error: "Finalization unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
