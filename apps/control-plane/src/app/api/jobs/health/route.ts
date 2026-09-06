import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  collectHealth,
  verifyCollectorRequest,
} from "../../../../server/health-collector";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  if (
    !verifyCollectorRequest(
      request.headers,
      process.env.RANZA_HEALTH_COLLECTOR_SECRET ?? "",
    )
  ) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  }
  const correlationId = randomUUID();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    return Response.json(
      { error: "collector_not_configured", correlationId },
      { status: 503, headers },
    );
  try {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const result = await collectHealth(process.env, {
      fetch,
      record: async (component, status) => {
        const { error } = await client
          .rpc("record_operational_signal", {
            component,
            signal_status: status,
          })
          .abortSignal(AbortSignal.timeout(5000));
        if (error) throw new Error("signal_ingestion_failed");
      },
    });
    return Response.json(
      { ...result, correlationId },
      { status: result.persisted && !result.degraded ? 200 : 503, headers },
    );
  } catch {
    return Response.json(
      { error: "collector_unavailable", correlationId },
      { status: 503, headers },
    );
  }
}
