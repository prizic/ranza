import { withOrganizationContext } from "@ranza/db";
import { recordWithin } from "@ranza/platform-audit";
import type {
  DecideLeaveInput,
  LeaveRequestRecord,
  LeaveStatus,
  LeaveType,
  SubmitLeaveRequestInput,
} from "./contracts";
import { HrInputError, HrRefusedError } from "./errors";
import { calendarDay, isoDay, optionalText } from "./input";
import type { HrDeps } from "./ports";
import { refusal } from "./refusals";

interface LeaveRow {
  id: string;
  organizationId: string;
  employeeId: string;
  leaveType: string;
  startsOn: Date;
  endsOn: Date;
  status: string;
  notes: string | null;
  employee: {
    firstName: string;
    lastName: string;
    department: string;
    position: string;
    status: string;
  };
}

const EMPLOYEE_FIELDS = {
  firstName: true,
  lastName: true,
  department: true,
  position: true,
  status: true,
} as const;

function toLeaveRecord(row: LeaveRow, clash: boolean): LeaveRequestRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    employeeId: row.employeeId,
    employeeName: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
    employeeDepartment: row.employee.department,
    employeePosition: row.employee.position,
    employeeTerminated: row.employee.status === "terminated",
    leaveType: row.leaveType as LeaveType,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    status: row.status as LeaveStatus,
    notes: row.notes,
    clash,
  };
}

/** Leave requests and the decision on them (HR-S1-09, HR-S1-10). */
export function createLeave(deps: HrDeps) {
  async function leaveRequests(
    userId: string,
    organizationId: string,
  ): Promise<readonly LeaveRequestRecord[]> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const rows = await tx.hrLeaveRequest.findMany({
        where: { organizationId },
        include: { employee: { select: EMPLOYEE_FIELDS } },
        orderBy: [{ startsOn: "desc" }],
      });

      // A pending request clashes with a colleague in the same department
      // whose leave is pending or approved over any of the same days.
      return rows.map((row) =>
        toLeaveRecord(
          row,
          row.status === "pending" &&
            rows.some(
              (other) =>
                other.id !== row.id &&
                other.status !== "rejected" &&
                other.employee.department === row.employee.department &&
                other.startsOn <= row.endsOn &&
                row.startsOn <= other.endsOn,
            ),
        ),
      );
    });
  }

  async function submitLeaveRequest(
    userId: string,
    input: SubmitLeaveRequestInput,
  ): Promise<LeaveRequestRecord> {
    const startsOn = calendarDay(input.startsOn, "dates");
    const endsOn = calendarDay(input.endsOn, "dates");
    if (endsOn < startsOn) throw new HrInputError("dates");

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const employee = await tx.hrEmployee.findFirst({
        where: { id: input.employeeId, organizationId: input.organizationId },
        select: { status: true },
      });
      if (!employee) throw new HrRefusedError("not_permitted");
      if (employee.status === "terminated") {
        throw new HrRefusedError("employee_terminated");
      }

      try {
        const [written] = await tx.$queryRaw<{ id: string }[]>`
          insert into public.hr_leave_requests
            (organization_id, employee_id, leave_type, starts_on, ends_on,
             status, notes)
          values (
            ${input.organizationId}::uuid, ${input.employeeId}::uuid,
            ${input.leaveType}, ${isoDay(startsOn)}::date,
            ${isoDay(endsOn)}::date, 'pending', ${optionalText(input.notes)}
          )
          returning id
        `;
        if (!written) throw new HrRefusedError("not_permitted");
        const created = await tx.hrLeaveRequest.findFirst({
          where: { id: written.id },
          include: { employee: { select: EMPLOYEE_FIELDS } },
        });
        if (!created) throw new HrRefusedError("not_permitted");
        return toLeaveRecord(created, false);
      } catch (error: unknown) {
        throw refusal(error);
      }
    });
  }

  /**
   * Decides a pending request, once. Approving over days another approved
   * request of the same employee already covers is refused by the database
   * (HR-S1-20), and a terminated employee's request is not decided at all.
   */
  async function decideLeave(
    userId: string,
    input: DecideLeaveInput,
  ): Promise<void> {
    await withOrganizationContext(deps.db, { userId }, async (tx) => {
      const [request] = await tx.$queryRaw<
        {
          employeeId: string;
          propertyId: string | null;
          status: string;
          employeeStatus: string;
          leaveType: string;
          startsOn: string;
          endsOn: string;
        }[]
      >`
        select request.employee_id as "employeeId",
               employee.property_id as "propertyId",
               request.status, employee.status as "employeeStatus",
               request.leave_type as "leaveType",
               to_char(request.starts_on, 'YYYY-MM-DD') as "startsOn",
               to_char(request.ends_on, 'YYYY-MM-DD') as "endsOn"
          from public.hr_leave_requests as request
          join public.hr_employees as employee
            on employee.id = request.employee_id
         where request.id = ${input.leaveId}::uuid
           and request.organization_id = ${input.organizationId}::uuid
           for no key update of request
      `;
      if (!request) throw new HrRefusedError("not_permitted");
      if (request.status !== "pending")
        throw new HrRefusedError("leave_decided");
      if (request.employeeStatus === "terminated") {
        throw new HrRefusedError("employee_terminated");
      }

      try {
        await tx.$executeRaw`
          update public.hr_leave_requests
             set status = ${input.approved ? "approved" : "rejected"},
                 updated_at = now()
           where id = ${input.leaveId}::uuid
        `;
      } catch (error: unknown) {
        throw refusal(error);
      }

      const entry = {
        organizationId: input.organizationId,
        locationId: request.propertyId,
        actorId: userId,
        subjectType: "leave_request",
        subjectId: input.leaveId,
        context: {
          employeeId: request.employeeId,
          leaveType: request.leaveType,
          leaveFrom: request.startsOn,
          leaveTo: request.endsOn,
        },
      };
      if (input.approved) {
        await recordWithin(tx, {
          ...entry,
          action: "leave.approved",
        });
      } else {
        await recordWithin(tx, {
          ...entry,
          action: "leave.declined",
        });
      }
    });
  }

  return { leaveRequests, submitLeaveRequest, decideLeave };
}
