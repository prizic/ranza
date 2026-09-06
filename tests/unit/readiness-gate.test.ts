import { describe, expect, it } from "vitest";

// @ts-expect-error Repository scripts are intentionally plain Node ESM.
import { evaluateReadiness } from "../../scripts/lib/readiness-contract.mjs";

describe("production readiness evidence", () => {
  it("never reports ready while an external gate is pending", () => {
    expect(
      evaluateReadiness([
        { id: "local", status: "passed" },
        { id: "privacy-approval", status: "external_pending" },
      ]),
    ).toBe("blocked_external");
  });

  it("reports failed evidence before pending external evidence", () => {
    expect(
      evaluateReadiness([
        { id: "local", status: "failed" },
        { id: "restore", status: "external_pending" },
      ]),
    ).toBe("failed");
  });

  it("reports ready only when every gate has passed", () => {
    expect(
      evaluateReadiness([
        { id: "local", status: "passed" },
        { id: "staging", status: "passed" },
      ]),
    ).toBe("ready");
  });
});
