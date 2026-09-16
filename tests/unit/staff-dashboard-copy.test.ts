import { expect, it } from "vitest";

import {
  capabilityLabel,
  roleLabel,
  staffDashboardCopy,
} from "../../apps/product-web/src/lib/staff-dashboard-copy";

it("localizes staff access labels without exposing internal role names", () => {
  for (const locale of ["tr", "en", "ar"] as const) {
    expect(staffDashboardCopy[locale].activeBranch).toBeTruthy();
    expect(staffDashboardCopy[locale].switchBranch).toBeTruthy();
    expect(roleLabel(locale, "branch_staff")).not.toBe("branch_staff");
    expect(capabilityLabel(locale, "roster.manage")).not.toBe("roster.manage");
  }
});
