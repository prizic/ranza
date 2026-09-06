// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
const resolve = vi.hoisted(() => vi.fn());
vi.mock("../../apps/product-web/src/server/public-wifi", () => ({
  resolvePublicWifi: resolve,
}));
import { POST } from "../../apps/product-web/src/app/api/public-wifi/route";
afterEach(() => {
  vi.unstubAllEnvs();
  resolve.mockReset();
});
function request(origin = "https://ranza.example") {
  return new Request("https://ranza.example/api/public-wifi", {
    method: "POST",
    headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    body: "token=" + "a".repeat(64),
  });
}
it("keeps valid public presentations out of caches and referrers", async () => {
  vi.stubEnv("PRODUCT_WEB_ORIGIN", "https://ranza.example");
  resolve.mockResolvedValue({
    networkName: "Guest",
    password: "secret",
    instructions: "Welcome",
  });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
  expect(await response.json()).toEqual({
    networkName: "Guest",
    password: "secret",
    instructions: "Welcome",
  });
});
it("returns a generic credential-free result for invalid tokens and cross-origin requests", async () => {
  vi.stubEnv("PRODUCT_WEB_ORIGIN", "https://ranza.example");
  resolve.mockResolvedValue(null);
  const invalid = await POST(request());
  const foreign = await POST(request("https://foreign.example"));
  expect(invalid.status).toBe(404);
  expect(foreign.status).toBe(404);
  expect(await invalid.json()).toEqual({ error: "unavailable" });
  expect(await foreign.json()).toEqual({ error: "unavailable" });
});
