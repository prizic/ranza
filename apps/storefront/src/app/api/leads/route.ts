import { createHmac, randomUUID } from "node:crypto";
import { leadRpc } from "@ranza/database/leads";
import { handleLead } from "../../../server/lead-handler";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const origin = process.env.STOREFRONT_ORIGIN;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const rateSecret = process.env.LEAD_RATE_SECRET;
  if (!origin || !url || !key || !secret || !rateSecret) {
    return Response.json(
      { ok: false, correlationId: randomUUID() },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  const rpc = leadRpc(url, key);
  return handleLead(request, {
    origin,
    correlationId: randomUUID,
    rateLimit: async (req) => {
      // Only trust a header explicitly configured for a proxy that overwrites it.
      const header = process.env.LEAD_TRUSTED_IP_HEADER;
      const network = header
        ? (req.headers.get(header) ?? "unknown")
        : "global";
      const bucket = createHmac("sha256", rateSecret)
        .update(network)
        .digest("hex");
      return (await rpc("consume_lead_rate", { p_bucket: bucket })) === true;
    },
    receipt: async (id, fingerprint) =>
      String(
        await rpc("lead_receipt", { p_key: id, p_fingerprint: fingerprint }),
      ),
    verifyBot: async (token, id) => {
      const response = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
          body: new URLSearchParams({
            secret,
            response: token,
            idempotency_key: id,
          }),
        },
      );
      if (!response.ok) return false;
      const result = (await response.json()) as {
        success?: boolean;
        hostname?: string;
        action?: string;
      };
      return (
        result.success === true &&
        result.hostname === new URL(origin).hostname &&
        result.action === "demo"
      );
    },
    save: async (id, fingerprint, value, correlationId) =>
      String(
        await rpc("submit_lead", {
          p_key: id,
          p_fingerprint: fingerprint,
          p_value: value,
          p_correlation_id: correlationId,
        }),
      ),
  });
}
