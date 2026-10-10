import { withOrganizationContext } from "@ranza/db";
import type { AssignShiftInput, ShiftRecord, ShiftType } from "./contracts";
import { HrRefusedError } from "./errors";
import { calendarDay, isoDay, optionalText, validTime } from "./input";
import type { HrDeps } from "./ports";
import { refusal } from "./refusals";

const DEFAULT_TIMES: Record<ShiftType, readonly [string, string]> = {
  morning: ["07:00", "15:00"],
  evening: ["15:00", "23:00"],
  day: ["09:00", "18:00"],
  off: ["00:00", "00:00"],
};

interface ShiftRow {
  id: string;
  organizationId: string;
  propertyId: string;
  employeeId: string;
  date: Date;
  shiftType: string;
  startTime: string;
  endTime: string;
  notes: string | null;
  employee: { firstName: string; lastName: string };
}

function toShiftRecord(row: ShiftRow): ShiftRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    propertyId: row.propertyId,
    employeeId: row.employeeId,
    employeeName: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
    date: row.date,
    shiftType: row.shiftType as ShiftType,
    startTime: row.startTime,
    endTime: row.endTime,
    notes: row.notes,
  };
}

/** The weekly rota: one shift per employee per day (HR-S1-07, HR-S1-08). */
export function createShifts(deps: HrDeps) {
  async function shifts(
    userId: string,
    organizationId: string,
    propertyId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<readonly ShiftRecord[]> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const rows = await tx.hrShift.findMany({
        where: {
          organizationId,
          ...(propertyId ? { propertyId } : {}),
          ...(startDate || endDate
            ? {
                date: {
                  ...(startDate ? { gte: startDate } : {}),
                  ...(endDate ? { lte: endDate } : {}),
                },
              }
            : {}),
        },
        include: { employee: { select: { firstName: true, lastName: true } } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      });
      return rows.map(toShiftRecord);
    });
  }

  async function assignShift(
    userId: string,
    input: AssignShiftInput,
  ): Promise<ShiftRecord> {
    const date = calendarDay(input.date, "dates");
    const [defaultStart, defaultEnd] = DEFAULT_TIMES[input.shiftType];
    const startTime = validTime(input.startTime ?? defaultStart);
    const endTime = validTime(input.endTime ?? defaultEnd);

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const employee = await tx.hrEmployee.findFirst({
        where: { id: input.employeeId, organizationId: input.organizationId },
        select: { status: true, propertyId: true },
      });
      if (!employee) throw new HrRefusedError("not_permitted");
      if (employee.status === "terminated") {
        throw new HrRefusedError("employee_terminated");
      }
      if (employee.propertyId && employee.propertyId !== input.propertyId) {
        throw new HrRefusedError("other_property");
      }

      try {
        const [written] = await tx.$queryRaw<{ id: string }[]>`
          insert into public.hr_shifts
            (organization_id, property_id, employee_id, date, shift_type,
             start_time, end_time, notes)
          values (
            ${input.organizationId}::uuid, ${input.propertyId}::uuid,
            ${input.employeeId}::uuid, ${isoDay(date)}::date,
            ${input.shiftType}, ${startTime}, ${endTime},
            ${optionalText(input.notes)}
          )
          on conflict (organization_id, employee_id, date) do update
            set shift_type = excluded.shift_type,
                start_time = excluded.start_time,
                end_time = excluded.end_time,
                notes = excluded.notes,
                updated_at = now()
          returning id
        `;
        if (!written) throw new HrRefusedError("not_permitted");
        const record = await tx.hrShift.findFirst({
          where: { id: written.id },
          include: {
            employee: { select: { firstName: true, lastName: true } },
          },
        });
        if (!record) throw new HrRefusedError("not_permitted");
        return toShiftRecord(record);
      } catch (error: unknown) {
        throw refusal(error);
      }
    });
  }

  return { shifts, assignShift };
}
