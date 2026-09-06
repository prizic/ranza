// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validateLead } from "../../packages/domain/src/leads";
import { handleLead } from "../../apps/storefront/src/server/lead-handler";

const input = {
  name: "  Ada Demir  ",
  contact: "ada@example.com",
  operator: "Ada Yurt",
  beds: "120",
  city: "İstanbul",
  language: "tr",
  message: "Demo please",
  consent: true,
  website: "",
  token: "valid-token",
  idempotencyKey: "034d5a73-7631-467f-8e07-0e0b68636592",
};

describe("lead validation", () => {
  it("normalizes only allowed contact fields and bounds bed counts", () => {
    expect(validateLead({ ...input, injected: "secret" })).toEqual({
      ok: true,
      value: {
        name: "Ada Demir",
        contact: "ada@example.com",
        operator: "Ada Yurt",
        beds: 120,
        city: "İstanbul",
        language: "tr",
        message: "Demo please",
      },
    });
    expect(validateLead({ ...input, beds: "-1" }).ok).toBe(false);
    expect(validateLead({ ...input, beds: "1.2" }).ok).toBe(false);
  });
  it("requires contact, language, and explicit consent without echoing data", () => {
    const result = validateLead({
      ...input,
      contact: "invalid",
      language: "xx",
      consent: false,
    });
    expect(result).toEqual({
      ok: false,
      errors: { contact: "contact", language: "required", consent: "consent" },
    });
    expect(validateLead(null).ok).toBe(false);
  });
});

function setup(overrides: Record<string, unknown> = {}) {
  let writes = 0;
  let stored: string | undefined;
  const deps = {
    origin: "https://ranza.example",
    correlationId: () => "request-reference",
    rateLimit: async () => true,
    receipt: async (_key: string, fingerprint: string) =>
      stored === fingerprint ? "accepted" : stored ? "conflict" : "missing",
    verifyBot: async (token: string) => token === "valid-token",
    save: async (_key: string, fingerprint: string) => {
      writes++;
      stored = fingerprint;
      return "accepted";
    },
    ...overrides,
  };
  return {
    deps: deps as Parameters<typeof handleLead>[1],
    writes: () => writes,
  };
}
const request = (body: unknown = input, origin = "https://ranza.example") =>
  new Request("https://ranza.example/api/leads", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });

describe("public intake", () => {
  it("accepts a valid request once and replays safely after a used bot token", async () => {
    const state = setup();
    expect((await handleLead(request(), state.deps)).status).toBe(201);
    const repeat = await handleLead(
      request({ ...input, token: "used" }),
      state.deps,
    );
    expect(repeat.status).toBe(200);
    expect(state.writes()).toBe(1);
    expect(await repeat.json()).toEqual({
      ok: true,
      correlationId: "request-reference",
    });
    expect(repeat.headers.get("cache-control")).toContain("no-store");
    expect(
      (await handleLead(request({ ...input, city: "Ankara" }), state.deps))
        .status,
    ).toBe(409);
  });
  it("rejects invalid, automated, oversized and cross-origin requests without writes", async () => {
    const state = setup();
    expect(
      (await handleLead(request({ ...input, consent: false }), state.deps))
        .status,
    ).toBe(422);
    expect(
      (await handleLead(request({ ...input, website: "spam" }), state.deps))
        .status,
    ).toBe(400);
    expect(
      (await handleLead(request({ ...input, token: "invalid" }), state.deps))
        .status,
    ).toBe(400);
    expect(
      (
        await handleLead(
          request({ ...input, message: "a".repeat(17000) }),
          state.deps,
        )
      ).status,
    ).toBe(413);
    expect(
      (await handleLead(request(input, "https://attacker.example"), state.deps))
        .status,
    ).toBe(403);
    expect(state.writes()).toBe(0);
  });
  it("fails closed when protection or persistence is unavailable", async () => {
    const limited = setup({ rateLimit: async () => false });
    expect((await handleLead(request(), limited.deps)).status).toBe(429);
    expect(limited.writes()).toBe(0);
    const failed = setup({
      save: async () => {
        throw new Error("private database error");
      },
    });
    const response = await handleLead(request(), failed.deps);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database");
  });
});
