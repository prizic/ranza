export type ContractType =
  "full_time" | "part_time" | "seasonal" | "fixed_term";
/**
 * An employee is employed or is not. Being away is not a status: it is an
 * approved leave request covering a day, and a person on leave is paid and on
 * the rota like anyone else (HR-S1-31).
 */
export type EmploymentStatus = "active" | "terminated";
export type ShiftType = "morning" | "evening" | "day" | "off";
export type LeaveType =
  "annual" | "sick" | "unpaid" | "emergency" | "maternity";
export type LeaveStatus = "pending" | "approved" | "rejected";
/**
 * A run is opened as a draft and approved once. There is no `paid`: paying is
 * a movement of money this module does not make (HR-DEF-01).
 */
export type PayrollStatus = "draft" | "approved";

/**
 * Every amount is a whole number of minor units of a currency (ADR 0015); how
 * many make a major unit is read from Intl when it is shown.
 */
export interface EmployeeRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly propertyId: string | null;
  readonly userId: string | null;
  readonly firstName: string;
  readonly lastName: string;
  readonly fullName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly department: string;
  readonly position: string;
  readonly contractType: ContractType;
  readonly hiredOn: Date;
  readonly grossPayMinor: number;
  readonly currency: string;
  readonly status: EmploymentStatus;
  readonly terminatedOn: Date | null;
  readonly bankName: string | null;
  /** Masked on the server. The whole number is never returned (HR-S1-30). */
  readonly ibanMasked: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ShiftRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly propertyId: string;
  readonly employeeId: string;
  readonly employeeName?: string;
  readonly date: Date;
  readonly shiftType: ShiftType;
  readonly startTime: string;
  readonly endTime: string;
  readonly notes: string | null;
}

export interface LeaveRequestRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly employeeId: string;
  readonly employeeName: string;
  readonly employeeDepartment: string;
  readonly employeePosition: string;
  /** A terminated employee's request cannot be decided. */
  readonly employeeTerminated: boolean;
  readonly leaveType: LeaveType;
  readonly startsOn: Date;
  readonly endsOn: Date;
  readonly status: LeaveStatus;
  readonly notes: string | null;
  readonly clash: boolean;
}

export interface PayslipRecord {
  readonly id: string;
  readonly employeeId: string;
  readonly employeeName: string;
  readonly department: string;
  readonly position: string;
  readonly grossPayMinor: number;
  readonly socialSecurityDeductionMinor: number;
  readonly taxDeductionMinor: number;
  readonly stampDutyMinor: number;
  readonly netPayMinor: number;
  readonly ibanMasked: string | null;
}

/** Why a period that is still a draft cannot be approved as it stands. */
export type PayrollBlocker = "no_employees" | "mixed_currency";

export interface PayrollPeriodSummary {
  readonly period: string;
  readonly status: PayrollStatus;
  /** Null only for a draft nobody can be paid in: no employees, or several currencies. */
  readonly currency: string | null;
  readonly totalGrossMinor: number;
  readonly totalNetMinor: number;
  readonly approvedAt: Date | null;
  readonly payslips: readonly PayslipRecord[];
  readonly blocker: PayrollBlocker | null;
}

export interface RegisterEmployeeInput {
  readonly organizationId: string;
  readonly propertyId?: string | null | undefined;
  readonly userId?: string | null | undefined;
  readonly firstName: string;
  readonly lastName: string;
  readonly email?: string | null | undefined;
  readonly phone?: string | null | undefined;
  readonly department: string;
  readonly position: string;
  readonly contractType?: ContractType | undefined;
  readonly hiredOn?: Date | undefined;
  readonly grossPayMinor: number;
  readonly currency: string;
  readonly bankName?: string | null | undefined;
  readonly iban?: string | null | undefined;
}

export interface TerminateEmployeeInput {
  readonly organizationId: string;
  readonly employeeId: string;
  /** The last day of employment; not before the day they were hired. */
  readonly terminatedOn: Date;
}

export interface AssignShiftInput {
  readonly organizationId: string;
  readonly propertyId: string;
  readonly employeeId: string;
  readonly date: Date;
  readonly shiftType: ShiftType;
  readonly startTime?: string | undefined;
  readonly endTime?: string | undefined;
  readonly notes?: string | null | undefined;
}

export interface SubmitLeaveRequestInput {
  readonly organizationId: string;
  readonly employeeId: string;
  readonly leaveType: LeaveType;
  readonly startsOn: Date;
  readonly endsOn: Date;
  readonly notes?: string | null | undefined;
}

export interface DecideLeaveInput {
  readonly organizationId: string;
  readonly leaveId: string;
  readonly approved: boolean;
}

export interface ApprovePayrollInput {
  readonly organizationId: string;
  /** `YYYY-MM`. */
  readonly period: string;
}

export const HR_CAPABILITY = {
  moduleKey: "human_resources",
  capabilityKey: "staff_administration",
} as const;
