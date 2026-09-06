import { describe, expect, it } from "vitest";

import {
  normalizeStaffEmail,
  resolveStaffAccess,
  selectAuthorizedBranch,
  type OperatorMembership,
} from "../../packages/auth/src/index";

const branches = [
  { id: "women", operatorId: "north", status: "active" as const },
  { id: "men", operatorId: "north", status: "active" as const },
  { id: "old", operatorId: "north", status: "archived" as const },
  { id: "other", operatorId: "south", status: "active" as const },
];

function membership(
  overrides: Partial<OperatorMembership> = {},
): OperatorMembership {
  return {
    accessScope: "assigned_branches",
    operatorId: "north",
    role: "branch_staff",
    status: "active",
    ...overrides,
  };
}

describe("staff access resolution", () => {
  it("normalizes a staff email without accepting malformed input", () => {
    expect(normalizeStaffEmail("  OWNER@North.Test ")).toBe("owner@north.test");
    expect(() => normalizeStaffEmail("not-an-email")).toThrow("email");
  });

  it("rejects a manipulated Branch selection and uses an authorized fallback", () => {
    expect(selectAuthorizedBranch(["women", "men"], "other")).toBe("women");
    expect(selectAuthorizedBranch(["women", "men"], "men")).toBe("men");
    expect(selectAuthorizedBranch([], "women")).toBeNull();
  });

  it("gives an Owner every active Branch in only their Operator", () => {
    const access = resolveStaffAccess({
      assignments: [],
      branches,
      membership: membership({ accessScope: "operator_wide", role: "owner" }),
      selectedBranchId: "men",
    });

    expect(access).toEqual({
      accessibleBranchIds: ["women", "men"],
      capabilities: [
        "branch.read",
        "branch.manage",
        "staff.manage",
        "roster.manage",
        "workflow.manage",
        "finance.manage",
        "operator.export",
      ],
      selectedBranchId: "men",
    });
  });

  it("limits assigned Managers and Branch Staff to current assignments", () => {
    expect(
      resolveStaffAccess({
        assignments: [
          { branchId: "women", role: "manager", status: "active" },
          { branchId: "men", role: "manager", status: "revoked" },
        ],
        branches,
        membership: membership({ role: "manager" }),
        selectedBranchId: "men",
      }),
    ).toEqual({
      accessibleBranchIds: ["women"],
      capabilities: [
        "branch.read",
        "branch.manage",
        "roster.manage",
        "workflow.manage",
      ],
      selectedBranchId: "women",
    });

    expect(
      resolveStaffAccess({
        assignments: [{ branchId: "men", role: "staff", status: "active" }],
        branches,
        membership: membership(),
        selectedBranchId: "women",
      }),
    ).toEqual({
      accessibleBranchIds: ["men"],
      capabilities: ["branch.read", "workflow.read", "workflow.update"],
      selectedBranchId: "men",
    });
  });

  it("returns no access for an inactive membership", () => {
    expect(
      resolveStaffAccess({
        assignments: [{ branchId: "women", role: "staff", status: "active" }],
        branches,
        membership: membership({ status: "revoked" }),
        selectedBranchId: "women",
      }),
    ).toEqual({
      accessibleBranchIds: [],
      capabilities: [],
      selectedBranchId: null,
    });
  });
});
