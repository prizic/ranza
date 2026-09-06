export type ActorClass =
  "student" | "operator-staff" | "prizic-staff" | "system";

export const staffCapabilities = [
  "branch.read",
  "branch.manage",
  "staff.manage",
  "roster.manage",
  "workflow.read",
  "workflow.update",
  "workflow.manage",
  "finance.manage",
  "operator.export",
] as const;

export type StaffCapability = (typeof staffCapabilities)[number];
export type OperatorRole = "owner" | "manager" | "branch_staff";
export type OperatorAccessScope = "operator_wide" | "assigned_branches";
export type MembershipStatus = "active" | "revoked" | "archived";
export type BranchAssignmentRole = "manager" | "staff";
export type BranchAssignmentStatus = "active" | "revoked";

export interface OperatorMembership {
  accessScope: OperatorAccessScope;
  operatorId: string;
  role: OperatorRole;
  status: MembershipStatus;
}

export interface BranchAssignment {
  branchId: string;
  role: BranchAssignmentRole;
  status: BranchAssignmentStatus;
}

export interface StaffBranch {
  id: string;
  operatorId: string;
  status: "active" | "archived";
}

export interface StaffAccess {
  accessibleBranchIds: string[];
  capabilities: StaffCapability[];
  selectedBranchId: string | null;
}

export function normalizeStaffEmail(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("email must be a string");
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new RangeError("email must be valid");
  }
  return email;
}

export function selectAuthorizedBranch(
  accessibleBranchIds: readonly string[],
  requestedBranchId?: string | null,
): string | null {
  return requestedBranchId && accessibleBranchIds.includes(requestedBranchId)
    ? requestedBranchId
    : (accessibleBranchIds[0] ?? null);
}

const capabilitiesByRole: Record<OperatorRole, StaffCapability[]> = {
  owner: [
    "branch.read",
    "branch.manage",
    "staff.manage",
    "roster.manage",
    "workflow.manage",
    "finance.manage",
    "operator.export",
  ],
  manager: ["branch.read", "branch.manage", "roster.manage", "workflow.manage"],
  branch_staff: ["branch.read", "workflow.read", "workflow.update"],
};

export function resolveStaffAccess(input: {
  assignments: readonly BranchAssignment[];
  branches: readonly StaffBranch[];
  membership: OperatorMembership;
  selectedBranchId?: string | null;
}): StaffAccess {
  if (input.membership.status !== "active") {
    return {
      accessibleBranchIds: [],
      capabilities: [],
      selectedBranchId: null,
    };
  }

  const activeOperatorBranches = input.branches.filter(
    (branch) =>
      branch.operatorId === input.membership.operatorId &&
      branch.status === "active",
  );
  const assignedBranchIds = new Set(
    input.assignments
      .filter((assignment) => assignment.status === "active")
      .map((assignment) => assignment.branchId),
  );
  const operatorWide =
    input.membership.accessScope === "operator_wide" &&
    (input.membership.role === "owner" || input.membership.role === "manager");
  const accessibleBranchIds = activeOperatorBranches
    .filter((branch) => operatorWide || assignedBranchIds.has(branch.id))
    .map((branch) => branch.id);
  const selectedBranchId = selectAuthorizedBranch(
    accessibleBranchIds,
    input.selectedBranchId,
  );

  return {
    accessibleBranchIds,
    capabilities: [...capabilitiesByRole[input.membership.role]],
    selectedBranchId,
  };
}
