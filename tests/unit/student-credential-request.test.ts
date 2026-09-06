// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { readCredentialForm } from "../../apps/product-web/src/server/credential-request";

afterEach(() => vi.unstubAllEnvs());
it("rejects foreign origins and oversized bodies without echoing credentials", async () => {
  vi.stubEnv("PRODUCT_WEB_ORIGIN", "https://ranza.example");
  const request = (origin: string, body: string) =>
    new Request("https://ranza.example/tr/student/sign-in/exchange", {
      method: "POST",
      headers: { origin, "content-type": "application/x-www-form-urlencoded" },
      body,
    });
  expect(
    await readCredentialForm(request("https://evil.example", "pin=123456")),
  ).toBeNull();
  expect(
    await readCredentialForm(
      request("https://ranza.example", "pin=" + "1".repeat(2048)),
    ),
  ).toBeNull();
  const form = await readCredentialForm(
    request("https://ranza.example", "pin=123456&accessId=student"),
  );
  expect(form?.get("accessId")).toBe("student");
});
