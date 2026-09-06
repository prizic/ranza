export { parseStudentDraft } from "./student-roster";
export { selectAnnouncementContent } from "./announcements";
export type { AnnouncementContent } from "./announcements";
export type { StudentDraft } from "./student-roster";
export { mealTypes, parseMealSelection, summarizeMealResponses } from "./meals";
export type { MealType } from "./meals";
export { buildMealExportCsv, mealExportHeaders } from "./meal-export";
export type { MealExportRow } from "./meal-export";
export {
  attendanceStudentExportHeaders,
  attendanceTotalsExportHeaders,
  buildAttendanceStudentCsv,
  buildAttendanceTotalsCsv,
} from "./attendance-export";
export type {
  AttendanceExportStatus,
  AttendanceStudentExportRow,
  AttendanceTotalsExportRow,
} from "./attendance-export";
export {
  balanceEntryTypes,
  formatMinorUnits,
  remainingBalance,
  toSignedMinorUnits,
} from "./balance";
export type { BalanceEntryType, PostableBalanceEntryType } from "./balance";

export {
  attendanceDeclarations,
  buildAttendanceBoard,
  parseAttendanceDeclaration,
  snapshotAttendance,
} from "./attendance";
export type {
  AttendanceBoard,
  AttendanceBoardRow,
  AttendanceDeclaration,
  AttendanceResponse,
  AttendanceRosterStudent,
  AttendanceStatus,
  AttendanceSnapshot,
} from "./attendance";

export {
  featureCatalog,
  resolveCapability,
  validateFeatureConfiguration,
} from "./entitlements";
export type {
  Entitlement,
  FeatureConfiguration,
  FeatureDefinition,
} from "./entitlements";

export const applicationNames = [
  "storefront",
  "product-web",
  "control-plane",
] as const;

export type ApplicationName = (typeof applicationNames)[number];

export {
  createBillingSnapshot,
  parseBedDraft,
  parseRoomDraft,
  summarizeBillableBeds,
} from "./capacity";
export type {
  BedCapacityInput,
  BedDraft,
  BranchCapacityInput,
  BranchCapacitySummary,
  CapacityStatus,
  CapacitySummary,
  RoomDraft,
} from "./capacity";

export const operatorStatuses = [
  "pending",
  "active",
  "suspended",
  "archived",
] as const;
export type OperatorStatus = (typeof operatorStatuses)[number];

export const branchStatuses = ["active", "archived"] as const;
export type BranchStatus = (typeof branchStatuses)[number];

export const residenceClassifications = [
  "male",
  "female",
  "mixed",
  "other",
] as const;
export type ResidenceClassification = (typeof residenceClassifications)[number];

export const applicationLocales = ["tr", "en", "ar"] as const;
export type ApplicationLocale = (typeof applicationLocales)[number];

export interface OperatorDraft {
  defaultLocale: ApplicationLocale;
  name: string;
}

export interface BranchDraft extends OperatorDraft {
  residenceClassification: ResidenceClassification;
  timezone: string;
}

function recordFrom(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("input must be an object");
  }
  return value as Record<string, unknown>;
}

function nonEmptyName(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("name must be a string");
  const name = value.trim();
  if (name.length < 2 || name.length > 120) {
    throw new RangeError("name must contain between 2 and 120 characters");
  }
  return name;
}

function applicationLocale(value: unknown): ApplicationLocale {
  if (!applicationLocales.includes(value as ApplicationLocale)) {
    throw new RangeError("defaultLocale must be tr, en, or ar");
  }
  return value as ApplicationLocale;
}

export function parseOperatorDraft(input: unknown): OperatorDraft {
  const value = recordFrom(input);
  return {
    defaultLocale: applicationLocale(value.defaultLocale),
    name: nonEmptyName(value.name),
  };
}

export function parseBranchDraft(input: unknown): BranchDraft {
  const value = recordFrom(input);
  const operator = parseOperatorDraft(value);
  if (
    !residenceClassifications.includes(
      value.residenceClassification as ResidenceClassification,
    )
  ) {
    throw new RangeError("residenceClassification is unsupported");
  }
  if (typeof value.timezone !== "string") {
    throw new TypeError("timezone must be an IANA timezone");
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: value.timezone }).format(0);
  } catch {
    throw new RangeError("timezone must be an IANA timezone");
  }
  return {
    ...operator,
    residenceClassification:
      value.residenceClassification as ResidenceClassification,
    timezone: value.timezone,
  };
}

const operatorTransitions: Record<OperatorStatus, readonly OperatorStatus[]> = {
  active: ["suspended", "archived"],
  archived: [],
  pending: ["active", "suspended", "archived"],
  suspended: ["active", "archived"],
};

export function canTransitionOperator(
  current: OperatorStatus,
  next: OperatorStatus,
): boolean {
  return current === next || operatorTransitions[current].includes(next);
}
