export type CapacityStatus = "active" | "archived";

export interface BedCapacityInput {
  available: boolean;
  occupied: boolean;
  status: CapacityStatus;
}

export interface BranchCapacityInput {
  beds: readonly BedCapacityInput[];
  branchId: string;
  branchName: string;
  branchStatus: CapacityStatus;
}

export interface BranchCapacitySummary {
  billableBeds: number;
  branchId: string;
  branchName: string;
}

export interface CapacitySummary {
  branches: BranchCapacitySummary[];
  totalBillableBeds: number;
}

export interface RoomDraft {
  label: string;
}

export interface BedDraft extends RoomDraft {
  available: boolean;
}

function recordFrom(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("input must be an object");
  }
  return value as Record<string, unknown>;
}

function normalizedLabel(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("label must be a string");
  const label = value.trim();
  if (label.length < 1 || label.length > 80) {
    throw new RangeError("label must contain between 1 and 80 characters");
  }
  return label;
}

export function parseRoomDraft(input: unknown): RoomDraft {
  const value = recordFrom(input);
  return { label: normalizedLabel(value.label) };
}

export function parseBedDraft(input: unknown): BedDraft {
  const value = recordFrom(input);
  if (typeof value.available !== "boolean") {
    throw new TypeError("available must be a boolean");
  }
  return { available: value.available, label: normalizedLabel(value.label) };
}

export function summarizeBillableBeds(
  branches: readonly BranchCapacityInput[],
): CapacitySummary {
  const breakdown = branches.map((branch) => ({
    billableBeds:
      branch.branchStatus === "active"
        ? branch.beds.filter((bed) => bed.status === "active" && bed.available)
            .length
        : 0,
    branchId: branch.branchId,
    branchName: branch.branchName,
  }));

  return {
    branches: breakdown,
    totalBillableBeds: breakdown.reduce(
      (total, branch) => total + branch.billableBeds,
      0,
    ),
  };
}

export function createBillingSnapshot(summary: CapacitySummary) {
  const branchBreakdown = summary.branches.map((branch) =>
    Object.freeze({ ...branch }),
  );
  return Object.freeze({
    billableBeds: summary.totalBillableBeds,
    branchBreakdown: Object.freeze(branchBreakdown),
  });
}
