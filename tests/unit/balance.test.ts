import { describe, expect, it } from "vitest";

import {
  formatMinorUnits,
  remainingBalance,
  toSignedMinorUnits,
} from "../../packages/domain/src/balance";

describe("Balance sign convention", () => {
  it("stores charges as positive and recorded payments and credits as negative", () => {
    expect(toSignedMinorUnits("charge", "1250.50")).toBe(125050n);
    expect(toSignedMinorUnits("external_payment", "250.25")).toBe(-25025n);
    expect(toSignedMinorUnits("credit", "50")).toBe(-5000n);
  });

  it("permits an explicitly signed non-zero adjustment", () => {
    expect(toSignedMinorUnits("adjustment", "-15.25")).toBe(-1525n);
    expect(toSignedMinorUnits("adjustment", "+10.00")).toBe(1000n);
  });

  it("rejects zero, excess precision, and malformed money", () => {
    expect(() => toSignedMinorUnits("charge", "0")).toThrow("non-zero");
    expect(() => toSignedMinorUnits("credit", "2.999")).toThrow("money");
    expect(() => toSignedMinorUnits("external_payment", "-20")).toThrow(
      "positive",
    );
  });

  it("derives the remaining Balance without floating point", () => {
    const total = remainingBalance([125050n, -25025n, -5000n, -1525n]);
    expect(total).toBe(93500n);
    expect(formatMinorUnits(total)).toBe("935.00");
    expect(formatMinorUnits(-25n)).toBe("-0.25");
  });
});
