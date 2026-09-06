// @vitest-environment node
import { expect, it } from "vitest";
import {
  generateWifiToken,
  hashWifiToken,
  publicWifiLink,
} from "../../apps/product-web/src/server/public-wifi-token";

it("issues 256-bit random tokens and never includes raw tokens in request URLs", () => {
  const first = generateWifiToken();
  const second = generateWifiToken();
  expect(first.token).toMatch(/^[a-f0-9]{64}$/);
  expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(first.token).not.toBe(second.token);
  expect(first.hash).not.toBe(first.token);
  expect(hashWifiToken(first.token)).toBe(first.hash);
  const url = new URL(
    publicWifiLink("https://ranza.example", "ar", first.token),
  );
  expect(url.pathname).toBe("/ar/public-wifi");
  expect(url.search).toBe("");
  expect(url.hash).toBe(`#${first.token}`);
});
it("rejects malformed tokens before any credential lookup", () => {
  expect(hashWifiToken("guess")).toBeNull();
  expect(hashWifiToken("a".repeat(65))).toBeNull();
});
