"use server";

import { revalidatePath } from "next/cache";
import { isSupportedLocale } from "@ranza/i18n";
import type { ShiftType, LeaveType, ContractType } from "@ranza/hr";
import { getComposition } from "./composition";
import {
  currentViewer,
  entitledProperties,
  permittedProperties,
  HR_CAPABILITY,
} from "./viewer";

export interface HrActionResult {
  status: "idle" | "done" | "refused" | "error";
  message?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidateHr(locale: string, propertyId: string): void {
  revalidatePath(`/${locale}/hr`);
  revalidatePath(`/${locale}/hr?property=${propertyId}`);
}

async function resolveOrganization(propertyId: string): Promise<string | null> {
  const entitled = await entitledProperties(HR_CAPABILITY);
  const target = entitled.find((p) => p.propertyId === propertyId);
  return target?.organizationId ?? null;
}

function cleanString(val?: string | null): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function registerEmployeeAction(
  locale: string,
  propertyId: string,
  data: {
    firstName: string;
    lastName: string;
    email?: string | undefined;
    phone?: string | undefined;
    department: string;
    position: string;
    contractType?: ContractType | undefined;
    grossPay: number;
    iban?: string | undefined;
  },
): Promise<HrActionResult> {
  if (!isSupportedLocale(locale) || !UUID.test(propertyId)) {
    return { status: "refused", message: "Invalid parameters" };
  }

  if (
    typeof data.grossPay !== "number" ||
    isNaN(data.grossPay) ||
    data.grossPay < 0
  ) {
    return { status: "refused", message: "Invalid gross pay amount" };
  }

  const viewer = await currentViewer();
  if (!viewer) {
    return { status: "refused", message: "Unauthorized" };
  }

  const organizationId = await resolveOrganization(propertyId);
  if (!organizationId) {
    return { status: "refused", message: "Property not accessible" };
  }

  const manageProps = await permittedProperties("hr.manage");
  if (!manageProps.some((p) => p.propertyId === propertyId)) {
    return {
      status: "refused",
      message: "Permission denied: requires hr.manage",
    };
  }

  try {
    const comp = getComposition();
    await comp.hr.registerEmployee(viewer.userId, {
      organizationId,
      propertyId,
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      email: cleanString(data.email),
      phone: cleanString(data.phone),
      department: data.department.trim(),
      position: data.position.trim(),
      contractType: data.contractType,
      grossPay: data.grossPay,
      iban: cleanString(data.iban),
    });
    revalidateHr(locale, propertyId);
    return { status: "done" };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Failed to register employee",
    };
  }
}

export async function assignShiftAction(
  locale: string,
  propertyId: string,
  data: {
    employeeId: string;
    date: string; // YYYY-MM-DD
    shiftType: ShiftType;
  },
): Promise<HrActionResult> {
  if (
    !isSupportedLocale(locale) ||
    !UUID.test(propertyId) ||
    !UUID.test(data.employeeId) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(data.date)
  ) {
    return { status: "refused", message: "Invalid parameters" };
  }

  const viewer = await currentViewer();
  if (!viewer) {
    return { status: "refused", message: "Unauthorized" };
  }

  const organizationId = await resolveOrganization(propertyId);
  if (!organizationId) {
    return { status: "refused", message: "Property not accessible" };
  }

  const manageProps = await permittedProperties("hr.manage");
  if (!manageProps.some((p) => p.propertyId === propertyId)) {
    return {
      status: "refused",
      message: "Permission denied: requires hr.manage",
    };
  }

  try {
    const comp = getComposition();
    const employees = await comp.hr.employees(viewer.userId, organizationId);
    const targetEmployee = employees.find((e) => e.id === data.employeeId);
    if (!targetEmployee) {
      return {
        status: "refused",
        message: "Employee not found in organization",
      };
    }
    if (targetEmployee.status === "terminated") {
      return {
        status: "refused",
        message: "Cannot assign shift to a terminated employee",
      };
    }
    if (targetEmployee.propertyId && targetEmployee.propertyId !== propertyId) {
      return {
        status: "refused",
        message: "Employee is assigned to a different property",
      };
    }

    await comp.hr.assignShift(viewer.userId, {
      organizationId,
      propertyId,
      employeeId: data.employeeId,
      date: new Date(data.date),
      shiftType: data.shiftType,
    });
    revalidateHr(locale, propertyId);
    return { status: "done" };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Failed to assign shift",
    };
  }
}

export async function submitLeaveRequestAction(
  locale: string,
  propertyId: string,
  data: {
    employeeId: string;
    leaveType: LeaveType;
    startsOn: string;
    endsOn: string;
    notes?: string | undefined;
  },
): Promise<HrActionResult> {
  if (
    !isSupportedLocale(locale) ||
    !UUID.test(propertyId) ||
    !UUID.test(data.employeeId) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(data.startsOn) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(data.endsOn)
  ) {
    return { status: "refused", message: "Invalid parameters" };
  }

  if (new Date(data.endsOn) < new Date(data.startsOn)) {
    return {
      status: "refused",
      message: "End date cannot be earlier than start date",
    };
  }

  const viewer = await currentViewer();
  if (!viewer) {
    return { status: "refused", message: "Unauthorized" };
  }

  const organizationId = await resolveOrganization(propertyId);
  if (!organizationId) {
    return { status: "refused", message: "Property not accessible" };
  }

  try {
    const comp = getComposition();
    const employees = await comp.hr.employees(viewer.userId, organizationId);
    const targetEmployee = employees.find((e) => e.id === data.employeeId);
    if (!targetEmployee) {
      return {
        status: "refused",
        message: "Employee not found in organization",
      };
    }
    if (targetEmployee.status === "terminated") {
      return {
        status: "refused",
        message: "Cannot submit leave for a terminated employee",
      };
    }

    await comp.hr.submitLeaveRequest(viewer.userId, {
      organizationId,
      employeeId: data.employeeId,
      leaveType: data.leaveType,
      startsOn: new Date(data.startsOn),
      endsOn: new Date(data.endsOn),
      notes: cleanString(data.notes),
    });
    revalidateHr(locale, propertyId);
    return { status: "done" };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Failed to submit leave",
    };
  }
}

export async function approveLeaveAction(
  locale: string,
  propertyId: string,
  leaveId: string,
  approved: boolean,
): Promise<HrActionResult> {
  if (
    !isSupportedLocale(locale) ||
    !UUID.test(propertyId) ||
    !UUID.test(leaveId)
  ) {
    return { status: "refused", message: "Invalid parameters" };
  }

  const viewer = await currentViewer();
  if (!viewer) {
    return { status: "refused", message: "Unauthorized" };
  }

  const organizationId = await resolveOrganization(propertyId);
  if (!organizationId) {
    return { status: "refused", message: "Property not accessible" };
  }

  const manageProps = await permittedProperties("hr.manage");
  if (!manageProps.some((p) => p.propertyId === propertyId)) {
    return {
      status: "refused",
      message: "Permission denied: requires hr.manage",
    };
  }

  try {
    const comp = getComposition();
    await comp.hr.approveLeave(
      viewer.userId,
      leaveId,
      organizationId,
      approved,
    );
    revalidateHr(locale, propertyId);
    return { status: "done" };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Failed to update leave",
    };
  }
}

export async function approvePayrollAction(
  locale: string,
  propertyId: string,
  period: string,
): Promise<HrActionResult> {
  if (
    !isSupportedLocale(locale) ||
    !UUID.test(propertyId) ||
    !/^\d{4}-\d{2}$/.test(period)
  ) {
    return { status: "refused", message: "Invalid parameters" };
  }

  const viewer = await currentViewer();
  if (!viewer) {
    return { status: "refused", message: "Unauthorized" };
  }

  const organizationId = await resolveOrganization(propertyId);
  if (!organizationId) {
    return { status: "refused", message: "Property not accessible" };
  }

  const manageProps = await permittedProperties("hr.manage");
  if (!manageProps.some((p) => p.propertyId === propertyId)) {
    return {
      status: "refused",
      message: "Permission denied: requires hr.manage",
    };
  }

  try {
    const comp = getComposition();
    await comp.hr.approvePayroll(viewer.userId, organizationId, period);
    revalidateHr(locale, propertyId);
    return { status: "done" };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Failed to approve payroll",
    };
  }
}
