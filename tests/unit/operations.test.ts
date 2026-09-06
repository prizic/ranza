// @vitest-environment node
import { expect, it } from "vitest";
import { summarizeOperationalSignals } from "../../packages/observability/src/operations";
it("reports missing and stale service signals honestly without carrying diagnostics or secrets", () => {
  const now = Date.parse("2026-09-06T12:00:00Z");
  const signals = summarizeOperationalSignals(
    [
      {
        component: "storefront",
        status: "ok",
        observed_at: "2026-09-06T11:59:00Z",
      },
      {
        component: "scheduler",
        status: "ok",
        observed_at: "2026-09-06T11:00:00Z",
      },
      {
        component: "auth_gateway",
        status: "failed",
        observed_at: "2026-09-06T11:59:00Z",
      },
    ],
    now,
  );
  expect(signals.find((s) => s.component === "storefront")?.status).toBe("ok");
  expect(signals.find((s) => s.component === "scheduler")?.status).toBe(
    "stale",
  );
  expect(signals.find((s) => s.component === "auth_gateway")?.status).toBe(
    "failed",
  );
  expect(signals.find((s) => s.component === "exports")?.status).toBe(
    "unknown",
  );
});
