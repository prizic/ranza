import { describe, expect, it } from "vitest";
import { unitLabel } from "../../apps/operator-workspace/src/features/front-office/unit-label";

describe("unitLabel", () => {
  // A bed is let on its own and named "A"; without its room nobody at the
  // desk knows which A (ADR 0025).
  it("unit label names a bed by its room", () => {
    expect(unitLabel("401", "A")).toBe("401 · A");
  });

  it("names a room by itself", () => {
    expect(unitLabel(null, "401")).toBe("401");
  });
});
