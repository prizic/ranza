import { describe, expect, it } from "vitest";

import { parseServerEnvironment } from "../../packages/config/src/index";

describe("server environment origins", () => {
  it.each([
    "https://admin.ranza.prizic.com",
    "http://localhost:3002",
    "http://127.0.0.1:3002",
    "http://[::1]:3002",
  ])("accepts a safe Control Plane origin: %s", (origin) => {
    expect(
      parseServerEnvironment({ CONTROL_PLANE_ORIGIN: origin })
        .CONTROL_PLANE_ORIGIN,
    ).toBe(origin);
  });

  it.each([
    "http://admin.ranza.prizic.com",
    "ftp://localhost:3002",
    "https://admin.ranza.prizic.com/path",
    "https://user:password@admin.ranza.prizic.com",
  ])("rejects an unsafe Control Plane origin: %s", (origin) => {
    expect(() =>
      parseServerEnvironment({ CONTROL_PLANE_ORIGIN: origin }),
    ).toThrow();
  });

  it("validates and preserves the Product Web credential boundary", () => {
    const parsed = parseServerEnvironment({
      NODE_ENV: "production",
      PRODUCT_WEB_ORIGIN: "https://app.ranza.prizic.com",
      STUDENT_CREDENTIAL_PEPPER_V1: "p".repeat(64),
      STUDENT_TRUSTED_IP_HEADER: "x-forwarded-for",
    });

    expect(parsed.PRODUCT_WEB_ORIGIN).toBe("https://app.ranza.prizic.com");
    expect(parsed.STUDENT_CREDENTIAL_PEPPER_V1).toBe("p".repeat(64));
    expect(parsed.STUDENT_TRUSTED_IP_HEADER).toBe("x-forwarded-for");
  });

  it.each([
    "http://app.ranza.prizic.com",
    "https://app.ranza.prizic.com/path",
    "https://user:password@app.ranza.prizic.com",
  ])("rejects an unsafe Product Web origin: %s", (origin) => {
    expect(() =>
      parseServerEnvironment({ PRODUCT_WEB_ORIGIN: origin }),
    ).toThrow();
  });
});
