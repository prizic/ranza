import { describe, expect, it } from "vitest";

import {
  canTransitionOperator,
  parseBranchDraft,
  parseOperatorDraft,
} from "../../packages/domain/src/index";
import {
  createOperatorControlService,
  type OperatorControlRepository,
  type PlatformActor,
} from "../../packages/database/src/index";

const admin: PlatformActor = {
  mfaRequired: false,
  mfaVerified: false,
  role: "platform_admin",
  status: "active",
  userId: "11111111-1111-4111-8111-111111111111",
};

function repository(overrides: Partial<OperatorControlRepository> = {}) {
  const base: OperatorControlRepository = {
    archiveBranch: async () => ({
      id: "33333333-3333-4333-8333-333333333333",
      operatorId: "22222222-2222-4222-8222-222222222222",
      status: "archived",
    }),
    createBranch: async (input) => ({
      id: "33333333-3333-4333-8333-333333333333",
      operatorId: input.operatorId,
      status: "active",
    }),
    createOperator: async () => ({
      id: "22222222-2222-4222-8222-222222222222",
      status: "pending",
    }),
    setOperatorStatus: async (input) => ({
      id: input.operatorId,
      status: input.status,
    }),
  };

  return { ...base, ...overrides };
}

describe("Operator and Branch lifecycle rules", () => {
  it("normalizes a valid Operator draft and rejects an unsupported locale", () => {
    expect(
      parseOperatorDraft({ defaultLocale: "tr", name: "  Kuzey Yurtları  " }),
    ).toEqual({ defaultLocale: "tr", name: "Kuzey Yurtları" });
    expect(() =>
      parseOperatorDraft({ defaultLocale: "de", name: "Kuzey" }),
    ).toThrow("defaultLocale");
  });

  it("validates Branch timezone, locale, and residence classification", () => {
    expect(
      parseBranchDraft({
        defaultLocale: "ar",
        name: "  Kadın Öğrenci Yurdu ",
        residenceClassification: "female",
        timezone: "Europe/Istanbul",
      }),
    ).toEqual({
      defaultLocale: "ar",
      name: "Kadın Öğrenci Yurdu",
      residenceClassification: "female",
      timezone: "Europe/Istanbul",
    });
    expect(() =>
      parseBranchDraft({
        defaultLocale: "tr",
        name: "Şube",
        residenceClassification: "invalid",
        timezone: "Not/AZone",
      }),
    ).toThrow();
  });

  it("does not permit an archived Operator to return to service", () => {
    expect(canTransitionOperator("pending", "active")).toBe(true);
    expect(canTransitionOperator("active", "suspended")).toBe(true);
    expect(canTransitionOperator("suspended", "active")).toBe(true);
    expect(canTransitionOperator("archived", "active")).toBe(false);
  });
});

describe("secured Operator control service", () => {
  it("denies non-admin, inactive, and required-but-unverified MFA actors", async () => {
    const service = createOperatorControlService(repository());
    const input = { defaultLocale: "tr", name: "Kuzey" } as const;

    await expect(
      service.createOperator({ ...admin, role: "platform_support" }, input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.createOperator({ ...admin, status: "suspended" }, input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.createOperator(
        { ...admin, mfaRequired: true, mfaVerified: false },
        input,
      ),
    ).rejects.toMatchObject({ code: "MFA_REQUIRED" });
  });

  it("uses an opaque correlation ID for an authorized creation", async () => {
    let capturedCorrelationId = "";
    const service = createOperatorControlService(
      repository({
        createOperator: async (_input, context) => {
          capturedCorrelationId = context.correlationId;
          return {
            id: "22222222-2222-4222-8222-222222222222",
            status: "pending",
          };
        },
      }),
      () => "RANZA-CP-TEST",
    );

    await expect(
      service.createOperator(admin, { defaultLocale: "tr", name: "Kuzey" }),
    ).resolves.toMatchObject({ status: "pending" });
    expect(capturedCorrelationId).toBe("RANZA-CP-TEST");
  });

  it("denies a manipulated Operator/Branch target pair", async () => {
    const service = createOperatorControlService(
      repository({ archiveBranch: async () => null }),
    );

    await expect(
      service.archiveBranch(admin, {
        branchId: "33333333-3333-4333-8333-333333333333",
        operatorId: "44444444-4444-4444-8444-444444444444",
      }),
    ).rejects.toMatchObject({ code: "TARGET_NOT_FOUND" });
  });
});
