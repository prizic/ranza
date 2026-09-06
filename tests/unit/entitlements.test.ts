import { describe, expect, it } from "vitest";
import {
  featureCatalog,
  resolveCapability,
  validateFeatureConfiguration,
  type Entitlement,
} from "../../packages/domain/src/entitlements";

const now = new Date("2026-09-06T12:00:00Z");
const grant: Entitlement = {
  status: "granted",
  startsAt: "2026-09-01T00:00:00Z",
  endsAt: "2026-10-01T00:00:00Z",
  allowedModes: ["protected", "public_qr"],
  constraints: {},
};

describe("server capability rules", () => {
  it("applies branch override over operator settings and catalog defaults", () => {
    expect(
      resolveCapability(
        featureCatalog.wifi,
        grant,
        now,
        { mode: "public_qr", values: {} },
        { mode: "protected", values: {} },
      ),
    ).toEqual({
      available: true,
      reason: null,
      mode: "protected",
      values: {},
      catalogVersion: 1,
    });
    expect(resolveCapability(featureCatalog.wifi, grant, now).mode).toBe(
      "protected",
    );
  });

  it.each([
    [null, "not_entitled"],
    [{ ...grant, status: "revoked" as const }, "revoked"],
    [{ ...grant, startsAt: "2026-09-07T00:00:00Z" }, "scheduled"],
    [{ ...grant, endsAt: now.toISOString() }, "expired"],
  ])(
    "blocks unavailable grants without modifying saved configuration",
    (entitlement, reason) => {
      const saved = { mode: "public_qr", values: {} };
      expect(
        resolveCapability(featureCatalog.wifi, entitlement, now, saved).reason,
      ).toBe(reason);
      expect(saved).toEqual({ mode: "public_qr", values: {} });
    },
  );

  it("rejects forbidden branch overrides and unknown modes/values", () => {
    expect(() =>
      validateFeatureConfiguration(
        featureCatalog.balance,
        { ...grant, allowedModes: ["standard"] },
        "branch",
        { mode: "standard", values: {} },
      ),
    ).toThrow("scope");
    expect(() =>
      validateFeatureConfiguration(
        featureCatalog.wifi,
        { ...grant, allowedModes: ["protected"] },
        "operator",
        { mode: "public_qr", values: {} },
      ),
    ).toThrow("mode");
    expect(() =>
      validateFeatureConfiguration(featureCatalog.wifi, grant, "operator", {
        mode: "protected",
        values: { arbitrary: true },
      }),
    ).toThrow("value");
  });

  it("enforces catalog bounds and narrower grant constraints", () => {
    const mealsGrant = {
      ...grant,
      allowedModes: ["standard"],
      constraints: { cutoffMinute: { min: 600, max: 1200 } },
    };
    expect(
      validateFeatureConfiguration(featureCatalog.meals, mealsGrant, "branch", {
        mode: "standard",
        values: { cutoffMinute: 900 },
      }).values,
    ).toEqual({ cutoffMinute: 900 });
    for (const value of [-1, 1440, 550, 1201, 900.5, "900"]) {
      expect(() =>
        validateFeatureConfiguration(
          featureCatalog.meals,
          mealsGrant,
          "branch",
          { mode: "standard", values: { cutoffMinute: value } },
        ),
      ).toThrow("value");
    }
  });

  it("fails closed when an entitlement removes a configured mode", () => {
    expect(
      resolveCapability(
        featureCatalog.wifi,
        { ...grant, allowedModes: ["protected"] },
        now,
        { mode: "public_qr", values: {} },
      ),
    ).toMatchObject({
      available: false,
      reason: "configuration_unavailable",
      mode: null,
    });
  });
});
