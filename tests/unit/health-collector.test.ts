// @vitest-environment node
import { expect, it } from "vitest";
import {
  collectHealth,
  verifyCollectorRequest,
} from "../../apps/control-plane/src/server/health-collector";

it("rejects absent, short, wrong and non-Bearer collector credentials", () => {
  const secret = "collector-secret-at-least-thirty-two-characters";
  expect(verifyCollectorRequest(new Headers(), secret)).toBe(false);
  expect(
    verifyCollectorRequest(
      new Headers({ authorization: "Bearer short" }),
      "short",
    ),
  ).toBe(false);
  expect(
    verifyCollectorRequest(
      new Headers({ authorization: `Basic ${secret}` }),
      secret,
    ),
  ).toBe(false);
  expect(
    verifyCollectorRequest(
      new Headers({ authorization: "Bearer wrong" }),
      secret,
    ),
  ).toBe(false);
  expect(
    verifyCollectorRequest(
      new Headers({ authorization: `Bearer ${secret}` }),
      secret,
    ),
  ).toBe(true);
});

it("records real probe outcomes but never claims worker freshness from collector success", async () => {
  const recorded: unknown[] = [];
  const result = await collectHealth(
    {
      STOREFRONT_ORIGIN: "https://store.example",
      PRODUCT_WEB_ORIGIN: "https://product.example",
    },
    {
      fetch: async (url, init) => {
        expect(init?.cache).toBe("no-store");
        expect(init?.redirect).toBe("error");
        if (String(url) === "https://store.example/health")
          return Response.json({ status: "ok", application: "storefront" });
        if (String(url) === "https://product.example/health")
          return new Response("private diagnostic", { status: 503 });
        throw new Error("Unexpected target");
      },
      record: async (component, status) => {
        recorded.push({ component, status });
      },
    },
  );
  expect(result).toEqual({ persisted: true, degraded: true });
  expect(recorded).toContainEqual({ component: "storefront", status: "ok" });
  expect(recorded).toContainEqual({
    component: "product_web",
    status: "failed",
  });
  expect(recorded).toContainEqual({
    component: "control_plane",
    status: "unknown",
  });
  expect(recorded).toContainEqual({ component: "database", status: "ok" });
  expect(JSON.stringify(recorded)).not.toMatch(/scheduler|exports|diagnostic/);
});

it("treats wrong-app success, redirects, timeouts and malformed health bodies as failed", async () => {
  for (const response of [
    Response.json({ status: "ok", application: "product-web" }),
    new Response("not json"),
  ]) {
    const rows: string[] = [];
    await collectHealth(
      { STOREFRONT_ORIGIN: "https://store.example" },
      {
        fetch: async () => response,
        record: async (key, status) => {
          rows.push(`${key}:${status}`);
        },
      },
    );
    expect(rows).toContain("storefront:failed");
  }
  const rows: string[] = [];
  await collectHealth(
    { STOREFRONT_ORIGIN: "https://store.example" },
    {
      fetch: async () => {
        throw new Error("secret network diagnostic");
      },
      record: async (key, status) => {
        rows.push(`${key}:${status}`);
      },
    },
  );
  expect(rows).toContain("storefront:failed");
});

it("does not fetch origins containing credentials or insecure remote origins", async () => {
  const rows: string[] = [];
  await collectHealth(
    {
      STOREFRONT_ORIGIN: "https://user:password@store.example",
      PRODUCT_WEB_ORIGIN: "http://remote.example",
    },
    {
      fetch: async () => {
        throw new Error("must not fetch");
      },
      record: async (key, status) => {
        rows.push(`${key}:${status}`);
      },
    },
  );
  expect(rows).toContain("storefront:unknown");
  expect(rows).toContain("product_web:unknown");
});

it("reports ingestion failures instead of falsely acknowledging durable observations", async () => {
  expect(
    await collectHealth(
      {},
      {
        fetch,
        record: async () => {
          throw new Error("database secret detail");
        },
      },
    ),
  ).toEqual({ persisted: false, degraded: true });
});
