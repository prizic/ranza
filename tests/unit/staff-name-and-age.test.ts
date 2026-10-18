import { describe, expect, it } from "vitest";
import { ageSince } from "../../apps/operator-workspace/src/lib/age";
import { staffName } from "../../apps/operator-workspace/src/lib/staff-name";

describe("a Staff Member known only by email is called by the name before the @", () => {
  it("reads maria.demir@hotel.test as Maria Demir", () => {
    expect(staffName("maria.demir@hotel.test", "Former")).toBe("Maria Demir");
  });

  it("keeps a single word and drops separators", () => {
    expect(staffName("finance@prizic.com", "Former")).toBe("Finance");
    expect(staffName("e2e-owner@example.test", "Former")).toBe("E2e Owner");
  });

  it("falls back for a person with no address, and never returns the address as a name's stand-in for nothing", () => {
    expect(staffName(null, "A former Staff Member")).toBe(
      "A former Staff Member",
    );
    expect(staffName("@odd.test", "Former")).toBe("@odd.test");
  });
});

describe("how long ago is the coarsest whole unit", () => {
  const now = new Date("2026-10-19T12:00:00Z");

  it("counts minutes under an hour, never zero", () => {
    expect(ageSince("2026-10-19T11:59:50Z", "en", now)).toBe("1 min. ago");
    expect(ageSince("2026-10-19T11:15:00Z", "en", now)).toBe("45 min. ago");
  });

  it("counts hours under a day and days after", () => {
    expect(ageSince("2026-10-19T09:00:00Z", "en", now)).toBe("3 hr. ago");
    expect(ageSince("2026-10-17T11:00:00Z", "en", now)).toBe("2 days ago");
  });

  it("is written in the reader's language", () => {
    expect(ageSince("2026-10-19T09:00:00Z", "tr", now)).toContain("önce");
  });
});
