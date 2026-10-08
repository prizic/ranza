import { withOrganizationContext, type PrismaClient } from "@ranza/db";
import type {
  EmployeeRecord,
  ShiftRecord,
  LeaveRequestRecord,
  PayrollPeriodSummary,
  PayslipRecord,
  RegisterEmployeeInput,
  AssignShiftInput,
  SubmitLeaveRequestInput,
  ContractType,
  EmploymentStatus,
  ShiftType,
  LeaveType,
  LeaveStatus,
  PayrollStatus,
} from "./contracts";
import type { HrDeps } from "./ports";

export const STATUTORY_SGK_CEILING = 150_000;

export function cleanString(val?: string | null): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function calculateDeductions(gross: number): {
  sgk: number;
  tax: number;
  stamp: number;
  net: number;
} {
  if (gross <= 0) {
    return { sgk: 0, tax: 0, stamp: 0, net: 0 };
  }
  const sgkSubject = Math.min(gross, STATUTORY_SGK_CEILING);
  const sgk = Math.round(sgkSubject * 0.15 * 100) / 100;
  const taxable = Math.max(0, gross - sgk);
  const tax = Math.round(taxable * 0.15 * 100) / 100;
  const stamp = Math.round(gross * 0.00759 * 100) / 100;
  const net = Math.round((gross - sgk - tax - stamp) * 100) / 100;
  return { sgk, tax, stamp, net };
}

async function getPayrollSummary(
  client: PrismaClient,
  organizationId: string,
  period: string,
): Promise<PayrollPeriodSummary> {
  const existingRun = await client.hrPayrollRun.findUnique({
    where: {
      organizationId_period: {
        organizationId,
        period,
      },
    },
    include: {
      payslips: {
        include: {
          employee: {
            select: {
              firstName: true,
              lastName: true,
              department: true,
              position: true,
            },
          },
        },
      },
    },
  });

  if (existingRun && existingRun.payslips.length > 0) {
    return {
      period: existingRun.period,
      status: existingRun.status as PayrollStatus,
      totalGross: Number(existingRun.totalGross),
      totalNet: Number(existingRun.totalNet),
      approvedAt: existingRun.approvedAt,
      payslips: existingRun.payslips.map((p) => ({
        id: p.id,
        employeeId: p.employeeId,
        employeeName: `${p.employee.firstName} ${p.employee.lastName}`.trim(),
        department: p.employee.department,
        position: p.employee.position,
        grossPay: Number(p.grossPay),
        socialSecurityDeduction: Number(p.socialSecurityDeduction),
        taxDeduction: Number(p.taxDeduction),
        stampDuty: Number(p.stampDuty),
        netPay: Number(p.netPay),
        iban: p.iban,
      })),
    };
  }

  // Calculate draft preview from active employees
  const activeEmployees = await client.hrEmployee.findMany({
    where: { organizationId, status: "active" },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });

  let totalGross = 0;
  let totalNet = 0;

  const payslips: PayslipRecord[] = activeEmployees.map((e) => {
    const gross = Number(e.grossPay);
    const { sgk, tax, stamp, net } = calculateDeductions(gross);
    totalGross += gross;
    totalNet += net;

    return {
      id: `draft-${e.id}`,
      employeeId: e.id,
      employeeName: `${e.firstName} ${e.lastName}`.trim(),
      department: e.department,
      position: e.position,
      grossPay: gross,
      socialSecurityDeduction: sgk,
      taxDeduction: tax,
      stampDuty: stamp,
      netPay: net,
      iban: e.iban,
    };
  });

  return {
    period,
    status: "draft",
    totalGross: Math.round(totalGross * 100) / 100,
    totalNet: Math.round(totalNet * 100) / 100,
    approvedAt: null,
    payslips,
  };
}

export function createHrModule(deps: HrDeps) {
  const { db } = deps;

  return {
    async employees(
      userId: string,
      organizationId: string,
    ): Promise<readonly EmployeeRecord[]> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const client = tx as unknown as PrismaClient;
        const rows = await client.hrEmployee.findMany({
          where: { organizationId },
          orderBy: [
            { status: "asc" },
            { firstName: "asc" },
            { lastName: "asc" },
          ],
        });

        return rows.map((r) => ({
          id: r.id,
          organizationId: r.organizationId,
          propertyId: r.propertyId,
          userId: r.userId,
          firstName: r.firstName,
          lastName: r.lastName,
          fullName: `${r.firstName} ${r.lastName}`.trim(),
          email: r.email,
          phone: r.phone,
          department: r.department,
          position: r.position,
          contractType: r.contractType as ContractType,
          hiredOn: r.hiredOn,
          grossPay: Number(r.grossPay),
          currency: r.currency,
          status: r.status as EmploymentStatus,
          bankName: r.bankName,
          iban: r.iban,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }));
      });
    },

    async registerEmployee(
      userId: string,
      input: RegisterEmployeeInput,
    ): Promise<EmployeeRecord> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const client = tx as unknown as PrismaClient;
        const created = await client.hrEmployee.create({
          data: {
            organizationId: input.organizationId,
            propertyId: input.propertyId ?? null,
            userId: input.userId ?? null,
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            email: cleanString(input.email),
            phone: cleanString(input.phone),
            department: input.department.trim(),
            position: input.position.trim(),
            contractType: input.contractType ?? "full_time",
            hiredOn: input.hiredOn ?? new Date(),
            grossPay: input.grossPay,
            currency: input.currency ?? "TRY",
            status: "active",
            bankName: cleanString(input.bankName),
            iban: cleanString(input.iban),
          },
        });

        return {
          id: created.id,
          organizationId: created.organizationId,
          propertyId: created.propertyId,
          userId: created.userId,
          firstName: created.firstName,
          lastName: created.lastName,
          fullName: `${created.firstName} ${created.lastName}`.trim(),
          email: created.email,
          phone: created.phone,
          department: created.department,
          position: created.position,
          contractType: created.contractType as ContractType,
          hiredOn: created.hiredOn,
          grossPay: Number(created.grossPay),
          currency: created.currency,
          status: created.status as EmploymentStatus,
          bankName: created.bankName,
          iban: created.iban,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        };
      });
    },

    async terminateEmployee(
      userId: string,
      employeeId: string,
      organizationId: string,
    ): Promise<boolean> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const client = tx as unknown as PrismaClient;
        const result = await client.hrEmployee.updateMany({
          where: { id: employeeId, organizationId },
          data: { status: "terminated", updatedAt: new Date() },
        });
        return result.count > 0;
      });
    },

    async shifts(
      userId: string,
      organizationId: string,
      propertyId?: string,
      startDate?: Date,
      endDate?: Date,
    ): Promise<readonly ShiftRecord[]> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const client = tx as unknown as PrismaClient;
        const where: {
          organizationId: string;
          propertyId?: string;
          date?: { gte?: Date; lte?: Date };
        } = { organizationId };

        if (propertyId) {
          where.propertyId = propertyId;
        }

        if (startDate || endDate) {
          where.date = {};
          if (startDate) where.date.gte = startDate;
          if (endDate) where.date.lte = endDate;
        }

        const rows = await client.hrShift.findMany({
          where,
          include: {
            employee: {
              select: { firstName: true, lastName: true },
            },
          },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
        });

        return rows.map((r) => ({
          id: r.id,
          organizationId: r.organizationId,
          propertyId: r.propertyId,
          employeeId: r.employeeId,
          employeeName: `${r.employee.firstName} ${r.employee.lastName}`.trim(),
          date: r.date,
          shiftType: r.shiftType as ShiftType,
          startTime: r.startTime,
          endTime: r.endTime,
          notes: r.notes,
        }));
      });
    },

    async assignShift(
      userId: string,
      input: AssignShiftInput,
    ): Promise<ShiftRecord> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const client = tx as unknown as PrismaClient;

        const emp = await client.hrEmployee.findUnique({
          where: { id: input.employeeId },
        });
        if (!emp || emp.organizationId !== input.organizationId) {
          throw new Error("Employee not found in organization");
        }
        if (emp.status === "terminated") {
          throw new Error("Cannot assign shift to a terminated employee");
        }
        if (emp.propertyId && emp.propertyId !== input.propertyId) {
          throw new Error("Employee is assigned to a different property");
        }

        const defaultTimes: Record<ShiftType, [string, string]> = {
          morning: ["07:00", "15:00"],
          evening: ["15:00", "23:00"],
          day: ["09:00", "18:00"],
          off: ["00:00", "00:00"],
        };

        const [defStart, defEnd] = defaultTimes[input.shiftType] || [
          "09:00",
          "18:00",
        ];
        const startTime = input.startTime ?? defStart;
        const endTime = input.endTime ?? defEnd;

        const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
        if (!TIME_REGEX.test(startTime) || !TIME_REGEX.test(endTime)) {
          throw new Error("Invalid shift time format (HH:MM required)");
        }

        const record = await client.hrShift.upsert({
          where: {
            organizationId_employeeId_date: {
              organizationId: input.organizationId,
              employeeId: input.employeeId,
              date: input.date,
            },
          },
          create: {
            organizationId: input.organizationId,
            propertyId: input.propertyId,
            employeeId: input.employeeId,
            date: input.date,
            shiftType: input.shiftType,
            startTime,
            endTime,
            notes: input.notes ?? null,
          },
          update: {
            shiftType: input.shiftType,
            startTime,
            endTime,
            notes: input.notes ?? null,
            updatedAt: new Date(),
          },
          include: {
            employee: {
              select: { firstName: true, lastName: true },
            },
          },
        });

        return {
          id: record.id,
          organizationId: record.organizationId,
          propertyId: record.propertyId,
          employeeId: record.employeeId,
          employeeName:
            `${record.employee.firstName} ${record.employee.lastName}`.trim(),
          date: record.date,
          shiftType: record.shiftType as ShiftType,
          startTime: record.startTime,
          endTime: record.endTime,
          notes: record.notes,
        };
      });
    },

    async leaveRequests(
      userId: string,
      organizationId: string,
    ): Promise<readonly LeaveRequestRecord[]> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const client = tx as unknown as PrismaClient;
        const rows = await client.hrLeaveRequest.findMany({
          where: { organizationId },
          include: {
            employee: {
              select: {
                firstName: true,
                lastName: true,
                department: true,
                position: true,
              },
            },
          },
          orderBy: [{ startsOn: "desc" }],
        });

        // Detect clashes among colleagues in same department who are pending or approved
        return rows.map((r) => {
          const isClashing =
            r.status === "pending" &&
            rows.some(
              (other) =>
                other.id !== r.id &&
                other.status !== "rejected" &&
                other.employee.department === r.employee.department &&
                other.startsOn <= r.endsOn &&
                r.startsOn <= other.endsOn,
            );

          return {
            id: r.id,
            organizationId: r.organizationId,
            employeeId: r.employeeId,
            employeeName:
              `${r.employee.firstName} ${r.employee.lastName}`.trim(),
            employeeDepartment: r.employee.department,
            employeePosition: r.employee.position,
            leaveType: r.leaveType as LeaveType,
            startsOn: r.startsOn,
            endsOn: r.endsOn,
            status: r.status as LeaveStatus,
            notes: r.notes,
            clash: isClashing,
          };
        });
      });
    },

    async submitLeaveRequest(
      userId: string,
      input: SubmitLeaveRequestInput,
    ): Promise<LeaveRequestRecord> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const client = tx as unknown as PrismaClient;

        const emp = await client.hrEmployee.findUnique({
          where: { id: input.employeeId },
        });
        if (!emp || emp.organizationId !== input.organizationId) {
          throw new Error("Employee not found in organization");
        }
        if (emp.status === "terminated") {
          throw new Error(
            "Cannot submit leave request for a terminated employee",
          );
        }
        if (input.endsOn < input.startsOn) {
          throw new Error("End date cannot be earlier than start date");
        }

        const created = await client.hrLeaveRequest.create({
          data: {
            organizationId: input.organizationId,
            employeeId: input.employeeId,
            leaveType: input.leaveType,
            startsOn: input.startsOn,
            endsOn: input.endsOn,
            status: "pending",
            notes: input.notes ?? null,
          },
          include: {
            employee: {
              select: {
                firstName: true,
                lastName: true,
                department: true,
                position: true,
              },
            },
          },
        });

        return {
          id: created.id,
          organizationId: created.organizationId,
          employeeId: created.employeeId,
          employeeName:
            `${created.employee.firstName} ${created.employee.lastName}`.trim(),
          employeeDepartment: created.employee.department,
          employeePosition: created.employee.position,
          leaveType: created.leaveType as LeaveType,
          startsOn: created.startsOn,
          endsOn: created.endsOn,
          status: created.status as LeaveStatus,
          notes: created.notes,
          clash: false,
        };
      });
    },

    async approveLeave(
      userId: string,
      id: string,
      organizationId: string,
      approved: boolean,
    ): Promise<boolean> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const client = tx as unknown as PrismaClient;
        const result = await client.hrLeaveRequest.updateMany({
          where: { id, organizationId },
          data: {
            status: approved ? "approved" : "rejected",
            updatedAt: new Date(),
          },
        });
        return result.count > 0;
      });
    },

    async payrollSummary(
      userId: string,
      organizationId: string,
      period: string,
    ): Promise<PayrollPeriodSummary> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const client = tx as unknown as PrismaClient;
        return getPayrollSummary(client, organizationId, period);
      });
    },

    async approvePayroll(
      userId: string,
      organizationId: string,
      period: string,
    ): Promise<PayrollPeriodSummary> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const client = tx as unknown as PrismaClient;
        const activeEmployees = await client.hrEmployee.findMany({
          where: { organizationId, status: "active" },
        });

        if (activeEmployees.length === 0) {
          throw new Error(
            "Cannot approve payroll: no active employees in organization",
          );
        }

        const existingRun = await client.hrPayrollRun.findUnique({
          where: {
            organizationId_period: {
              organizationId,
              period,
            },
          },
        });

        if (existingRun) {
          if (existingRun.status === "paid") {
            throw new Error(
              "Payroll period is already paid and cannot be re-approved",
            );
          }
          if (existingRun.status === "approved") {
            return getPayrollSummary(client, organizationId, period);
          }
        }

        let totalGross = 0;
        let totalNet = 0;

        const calculated = activeEmployees.map((e) => {
          const gross = Number(e.grossPay);
          const { sgk, tax, stamp, net } = calculateDeductions(gross);
          totalGross += gross;
          totalNet += net;
          return {
            employeeId: e.id,
            grossPay: gross,
            socialSecurityDeduction: sgk,
            taxDeduction: tax,
            stampDuty: stamp,
            netPay: net,
            iban: e.iban,
          };
        });

        const roundedGross = Math.round(totalGross * 100) / 100;
        const roundedNet = Math.round(totalNet * 100) / 100;

        const run = await client.hrPayrollRun.upsert({
          where: {
            organizationId_period: {
              organizationId,
              period,
            },
          },
          create: {
            organizationId,
            period,
            totalGross: roundedGross,
            totalNet: roundedNet,
            status: "approved",
            approvedAt: new Date(),
          },
          update: {
            totalGross: roundedGross,
            totalNet: roundedNet,
            status: "approved",
            approvedAt: new Date(),
            updatedAt: new Date(),
          },
        });

        // Batch insert payslips in a single query
        await client.hrPayslip.createMany({
          data: calculated.map((item) => ({
            organizationId,
            payrollRunId: run.id,
            employeeId: item.employeeId,
            grossPay: item.grossPay,
            socialSecurityDeduction: item.socialSecurityDeduction,
            taxDeduction: item.taxDeduction,
            stampDuty: item.stampDuty,
            netPay: item.netPay,
            iban: item.iban,
          })),
          skipDuplicates: true,
        });

        return getPayrollSummary(client, organizationId, period);
      });
    },
  };
}
