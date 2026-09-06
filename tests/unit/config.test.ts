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
});
