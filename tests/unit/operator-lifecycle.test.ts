import { describe, expect, it } from "vitest";

import {
  buildLifecycleDryRunManifest,
  operatorArchiveSections,
} from "../../packages/domain/src/operator-lifecycle";

describe("Operator data lifecycle contracts", () => {
  it("keeps a stable full-archive section manifest", () => {
    expect(operatorArchiveSections).toEqual([
      "operator",
      "branches",
      "staff",
      "students",
      "attendance",
      "meals",
      "announcements",
      "maintenance",
      "wifi",
      "balances",
      "billing",
      "audit",
    ]);
  });

  it("builds a narrowly resolved destructive dry-run manifest", () => {
    expect(
      buildLifecycleDryRunManifest({
        action: "anonymize",
        counts: { branches: 2, students: 42 },
        operatorId: "33333333-3333-4333-8333-333333333333",
        policyVersion: 3,
      }),
    ).toEqual({
      action: "anonymize",
      counts: { branches: 2, students: 42 },
      operatorId: "33333333-3333-4333-8333-333333333333",
      policyVersion: 3,
      schemaVersion: 1,
    });
  });

  it("rejects a broad or unresolved lifecycle target", () => {
    expect(() =>
      buildLifecycleDryRunManifest({
        action: "delete",
        counts: {},
        operatorId: "*",
        policyVersion: 1,
      }),
    ).toThrow(/Operator/);
  });
});
