// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as credentials from "../../apps/product-web/src/server/student-credential-crypto";

describe("Student activation cryptography", () => {
  it("issues distinct human-transcribable 128-bit codes and salted slow hashes", async () => {
    expect(credentials).toHaveProperty("issueActivationCode");
    const first = await credentials.issueActivationCode();
    const second = await credentials.issueActivationCode();
    expect(first.code).toMatch(/^(?:[A-F0-9]{4}-){7}[A-F0-9]{4}$/);
    expect(first.code).not.toBe(second.code);
    expect(first.hash).toMatch(/^scrypt-v1\$/);
    expect(first.hash).not.toContain(first.code.replaceAll("-", ""));
    expect(
      await credentials.verifyActivationCode(
        first.code.toLowerCase(),
        first.hash,
      ),
    ).toBe(true);
    expect(
      await credentials.verifyActivationCode(second.code, first.hash),
    ).toBe(false);
    expect(
      await credentials.verifyActivationCode(first.code, "unknown$hash"),
    ).toBe(false);
  });
  it("derives a stable versioned Auth password bound to Student and server pepper", () => {
    const pepper = "p".repeat(64);
    const password = credentials.deriveStudentPassword(
      "student-a",
      "123456",
      pepper,
    );
    expect(password).toMatch(/^pin-v1\.[A-Za-z0-9_-]{43}$/);
    expect(password).toBe(
      credentials.deriveStudentPassword("student-a", "123456", pepper),
    );
    expect(password).not.toBe(
      credentials.deriveStudentPassword("student-b", "123456", pepper),
    );
    expect(() =>
      credentials.deriveStudentPassword("student-a", "123", pepper),
    ).toThrow();
    expect(() =>
      credentials.deriveStudentPassword("student-a", "123456", "short"),
    ).toThrow();
  });
  it("uses bounded opaque rate keys without trusting forwarded headers by default", () => {
    const headers = new Headers({ "x-forwarded-for": "spoofed" });
    expect(credentials.networkSignal(headers)).toBe("shared");
    expect(credentials.networkSignal(headers, "x-forwarded-for")).toBe(
      "spoofed",
    );
    const key = credentials.credentialRateKey(
      "network",
      "sensitive-address",
      "x".repeat(64),
    );
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain("sensitive");
  });
});
