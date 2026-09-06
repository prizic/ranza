// @vitest-environment node
import { expect, it } from "vitest";
import { operatorExportDownload } from "../../apps/product-web/src/server/operator-export-download";
const exportId = "11111111-1111-4111-8111-111111111111";
const operatorId = "22222222-2222-4222-8222-222222222222";
it("denies invalid or expired/unowned exports before signing a private object", async () => {
  const ports = {
    authorize: async () => null,
    sign: async () => {
      throw new Error("must not sign");
    },
  };
  expect((await operatorExportDownload("bad", operatorId, ports)).status).toBe(
    404,
  );
  expect(
    (await operatorExportDownload(exportId, operatorId, ports)).status,
  ).toBe(403);
});
it("uses the authorizer's exact object and a one-minute signed URL with no-store headers", async () => {
  const response = await operatorExportDownload(exportId, operatorId, {
    authorize: async (id, operator) =>
      id === exportId && operator === operatorId ? `${exportId}.json` : null,
    sign: async (path, seconds) =>
      path === `${exportId}.json` && seconds === 60
        ? "https://storage.example/signed"
        : null,
  });
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    "https://storage.example/signed",
  );
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
});
it("does not leak signing diagnostics or arbitrary object paths", async () => {
  const response = await operatorExportDownload(exportId, operatorId, {
    authorize: async () => "other-object.json",
    sign: async () => {
      throw new Error("private diagnostic");
    },
  });
  expect(response.status).toBe(403);
  expect(await response.text()).not.toContain("diagnostic");
});
