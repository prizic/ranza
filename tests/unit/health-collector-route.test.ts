// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { POST } from "../../apps/control-plane/src/app/api/jobs/health/route";

afterEach(() => vi.unstubAllEnvs());
it("denies unauthenticated ingestion and never caches the response", async () => {
  vi.stubEnv(
    "RANZA_HEALTH_COLLECTOR_SECRET",
    "separate-collector-secret-at-least-32-characters",
  );
  const response = await POST(
    new Request("https://control.example/api/jobs/health", { method: "POST" }),
  );
  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: "unauthorized" });
});
it("fails closed when privileged ingestion is not configured", async () => {
  const secret = "separate-collector-secret-at-least-32-characters";
  vi.stubEnv("RANZA_HEALTH_COLLECTOR_SECRET", secret);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  const response = await POST(
    new Request("https://control.example/api/jobs/health", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    }),
  );
  expect(response.status).toBe(503);
  const body = await response.json();
  expect(body.error).toBe("collector_not_configured");
  expect(body.correlationId).toMatch(/^[a-f0-9-]{36}$/);
  expect(JSON.stringify(body)).not.toContain(secret);
});
