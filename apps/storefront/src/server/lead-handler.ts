import { createHash } from "node:crypto";
import { validateLead, type LeadInput } from "@ranza/domain/leads";

export interface LeadDependencies {
  origin: string;
  correlationId(): string;
  rateLimit(request: Request): Promise<boolean>;
  receipt(key: string, fingerprint: string): Promise<string>;
  verifyBot(token: string, key: string): Promise<boolean>;
  save(
    key: string,
    fingerprint: string,
    value: LeadInput,
    correlationId: string,
  ): Promise<string>;
}

export async function handleLead(
  request: Request,
  dependencies: LeadDependencies,
): Promise<Response> {
  const correlationId = dependencies.correlationId();
  const reply = (status: number, extra = {}) =>
    Response.json(
      { ok: status < 300, correlationId, ...extra },
      {
        status,
        headers: {
          "cache-control": "no-store",
          "x-request-id": correlationId,
          ...(status === 429 ? { "retry-after": "3600" } : {}),
        },
      },
    );
  if (request.headers.get("origin") !== dependencies.origin) return reply(403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return reply(415);
  try {
    // Bound the actual stream, not only the attacker-controlled Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return reply(400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 16384) {
        await reader.cancel();
        return reply(413);
      }
      chunks.push(value);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return reply(400);
    }
    if (!(await dependencies.rateLimit(request))) return reply(429);
    const validation = validateLead(raw);
    if (!validation.ok) return reply(422, { errors: validation.errors });
    const body = raw as Record<string, unknown>;
    if (
      body.website ||
      typeof body.idempotencyKey !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        body.idempotencyKey,
      )
    )
      return reply(400);
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(validation.value))
      .digest("hex");
    const receipt = await dependencies.receipt(
      body.idempotencyKey,
      fingerprint,
    );
    if (receipt === "accepted") return reply(200);
    if (receipt === "conflict") return reply(409);
    if (
      typeof body.token !== "string" ||
      body.token.length > 2048 ||
      !(await dependencies.verifyBot(body.token, body.idempotencyKey))
    )
      return reply(400);
    const outcome = await dependencies.save(
      body.idempotencyKey,
      fingerprint,
      validation.value,
      correlationId,
    );
    return reply(outcome === "accepted" ? 201 : 409);
  } catch {
    return reply(503);
  }
}
