import { createHealthPayload } from "@ranza/observability";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(createHealthPayload("product-web"), {
    headers: { "Cache-Control": "no-store" },
  });
}
