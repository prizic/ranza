import { withOrganizationContext } from "@ranza/db";
import { recordWithin } from "@ranza/platform-audit";
import type {
  ContractType,
  EmployeeRecord,
  EmploymentStatus,
  RegisterEmployeeInput,
  TerminateEmployeeInput,
} from "./contracts";
import { HrInputError, HrRefusedError } from "./errors";
import { maskIban, normalizeIban } from "./iban";
import {
  calendarDay,
  isoDay,
  minorUnits,
  optionalEmail,
  optionalText,
  requiredText,
  validCurrency,
  wholeMinorUnits,
} from "./input";
import type { HrDeps } from "./ports";
import { refusal } from "./refusals";

/** The columns an employee record is read from. */
export interface EmployeeRow {
  id: string;
  organizationId: string;
  propertyId: string | null;
  userId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  department: string;
  position: string;
  contractType: string;
  hiredOn: Date;
  grossPayMinor: bigint;
  currency: string;
  status: string;
  terminatedOn: Date | null;
  bankName: string | null;
  iban: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toEmployeeRecord(row: EmployeeRow): EmployeeRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    propertyId: row.propertyId,
    userId: row.userId,
    firstName: row.firstName,
    lastName: row.lastName,
    fullName: `${row.firstName} ${row.lastName}`.trim(),
    email: row.email,
    phone: row.phone,
    department: row.department,
    position: row.position,
    contractType: row.contractType as ContractType,
    hiredOn: row.hiredOn,
    grossPayMinor: minorUnits(row.grossPayMinor),
    currency: row.currency,
    status: row.status as EmploymentStatus,
    terminatedOn: row.terminatedOn,
    bankName: row.bankName,
    ibanMasked: maskIban(row.iban),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Employees: who is employed, independently of who may sign in (blueprint
 * 5.11). A membership is access and a record here is employment, so ending
 * either leaves the other as it was.
 */
export function createEmployees(deps: HrDeps) {
  async function employees(
    userId: string,
    organizationId: string,
  ): Promise<readonly EmployeeRecord[]> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const rows = await tx.hrEmployee.findMany({
        where: { organizationId },
        orderBy: [{ status: "asc" }, { firstName: "asc" }, { lastName: "asc" }],
      });
      return rows.map(toEmployeeRecord);
    });
  }

  async function registerEmployee(
    userId: string,
    input: RegisterEmployeeInput,
  ): Promise<EmployeeRecord> {
    const firstName = requiredText(input.firstName, "name");
    const lastName = requiredText(input.lastName, "name");
    const department = requiredText(input.department, "department");
    const position = requiredText(input.position, "position");
    const email = optionalEmail(input.email);
    const grossPayMinor = wholeMinorUnits(input.grossPayMinor, "grossPay");
    const currency = validCurrency(input.currency);
    const iban = normalizeIban(input.iban);
    const hiredOn = input.hiredOn
      ? isoDay(calendarDay(input.hiredOn, "dates"))
      : null;

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      let created: EmployeeRow | undefined;
      try {
        [created] = await tx.$queryRaw<EmployeeRow[]>`
          insert into public.hr_employees
            (organization_id, property_id, user_id, first_name, last_name,
             email, phone, department, position, contract_type, hired_on,
             gross_pay_minor, currency, bank_name, iban)
          values (
            ${input.organizationId}::uuid, ${input.propertyId ?? null}::uuid,
            ${input.userId ?? null}::uuid, ${firstName}, ${lastName},
            ${email}, ${optionalText(input.phone)}, ${department}, ${position},
            ${input.contractType ?? "full_time"},
            coalesce(${hiredOn}::date, current_date),
            ${grossPayMinor}::bigint, ${currency},
            ${optionalText(input.bankName)}, ${iban}
          )
          returning id, organization_id as "organizationId",
                    property_id as "propertyId", user_id as "userId",
                    first_name as "firstName", last_name as "lastName",
                    email, phone, department, position,
                    contract_type as "contractType", hired_on as "hiredOn",
                    gross_pay_minor as "grossPayMinor", currency, status,
                    terminated_on as "terminatedOn", bank_name as "bankName",
                    iban, created_at as "createdAt", updated_at as "updatedAt"
        `;
      } catch (error: unknown) {
        throw refusal(error);
      }
      if (!created) throw new HrRefusedError("not_permitted");

      await recordWithin(tx, {
        organizationId: created.organizationId,
        locationId: created.propertyId,
        actorId: userId,
        action: "employee.registered",
        subjectType: "employee",
        subjectId: created.id,
        context: {
          contractType: created.contractType,
          currency: created.currency,
          hasSystemAccess: created.userId !== null,
        },
      });
      return toEmployeeRecord(created);
    });
  }

  /**
   * Ends employment. Nothing is deleted and nothing else changes: the record,
   * its shifts, its leave and its payslips stay and stay readable, and so does
   * the system access it may or may not have (HR-S1-01). Withdrawing access is
   * the People screen's act, and doing one does not do the other.
   */
  async function terminateEmployee(
    userId: string,
    input: TerminateEmployeeInput,
  ): Promise<void> {
    const terminatedOn = calendarDay(input.terminatedOn, "terminatedOn");

    await withOrganizationContext(deps.db, { userId }, async (tx) => {
      // The lock applies the update policy as well as the read one, so a Staff
      // Member who may not manage this employee locks nothing and sees no row.
      const [employee] = await tx.$queryRaw<
        {
          propertyId: string | null;
          status: string;
          hiredOn: string;
        }[]
      >`
        select property_id as "propertyId", status,
               to_char(hired_on, 'YYYY-MM-DD') as "hiredOn"
          from public.hr_employees
         where id = ${input.employeeId}::uuid
           and organization_id = ${input.organizationId}::uuid
           for no key update
      `;
      if (!employee) throw new HrRefusedError("not_permitted");
      if (employee.status === "terminated") {
        throw new HrRefusedError("already_terminated");
      }
      if (isoDay(terminatedOn) < employee.hiredOn) {
        throw new HrInputError("terminatedOn");
      }

      try {
        await tx.$executeRaw`
          update public.hr_employees
             set status = 'terminated',
                 terminated_on = ${isoDay(terminatedOn)}::date,
                 updated_at = now()
           where id = ${input.employeeId}::uuid
        `;
      } catch (error: unknown) {
        throw refusal(error);
      }

      await recordWithin(tx, {
        organizationId: input.organizationId,
        locationId: employee.propertyId,
        actorId: userId,
        action: "employee.terminated",
        subjectType: "employee",
        subjectId: input.employeeId,
        context: { terminatedOn: isoDay(terminatedOn) },
      });
    });
  }

  return { employees, registerEmployee, terminateEmployee };
}
