export type ContractType =
  "full_time" | "part_time" | "seasonal" | "fixed_term";
export type EmploymentStatus = "active" | "terminated" | "on_leave";
export type ShiftType = "morning" | "evening" | "day" | "off";
export type LeaveType =
  "annual" | "sick" | "unpaid" | "emergency" | "maternity";
export type LeaveStatus = "pending" | "approved" | "rejected";
export type PayrollStatus = "draft" | "approved" | "paid";

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
  readonly grossPay: number;
  readonly currency: string;
  readonly status: EmploymentStatus;
  readonly bankName: string | null;
  readonly iban: string | null;
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
  readonly grossPay: number;
  readonly socialSecurityDeduction: number;
  readonly taxDeduction: number;
  readonly stampDuty: number;
  readonly netPay: number;
  readonly iban: string | null;
}

export interface PayrollPeriodSummary {
  readonly period: string;
  readonly status: PayrollStatus;
  readonly totalGross: number;
  readonly totalNet: number;
  readonly approvedAt: Date | null;
  readonly payslips: readonly PayslipRecord[];
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
  readonly grossPay: number;
  readonly currency?: string | undefined;
  readonly bankName?: string | null | undefined;
  readonly iban?: string | null | undefined;
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

export const HR_CAPABILITY = {
  moduleKey: "human_resources",
  capabilityKey: "staff_administration",
} as const;
