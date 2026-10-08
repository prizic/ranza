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
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email ?? null,
      phone: data.phone ?? null,
      department: data.department,
      position: data.position,
      contractType: data.contractType,
      grossPay: data.grossPay,
      iban: data.iban ?? null,
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
    !UUID.test(data.employeeId)
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
    !UUID.test(data.employeeId)
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

  try {
    const comp = getComposition();
    await comp.hr.submitLeaveRequest(viewer.userId, {
      organizationId,
      employeeId: data.employeeId,
      leaveType: data.leaveType,
      startsOn: new Date(data.startsOn),
      endsOn: new Date(data.endsOn),
      notes: data.notes ?? null,
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
  if (!isSupportedLocale(locale) || !UUID.test(propertyId)) {
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
