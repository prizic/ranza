import { withOrganizationContext } from "@ranza/db";
import { recordWithin } from "@ranza/platform-audit";
import { organizationToday } from "./clock";
import type {
  ChangeWageInput,
  ContractType,
  EmployeeRecord,
  EmploymentStatus,
  RegisterEmployeeInput,
  TerminateEmployeeInput,
  UpdateEmployeeInput,
  WageChange,
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
  validPeriod,
  wholeMinorUnits,
} from "./input";
import type { HrDeps, HrTransaction } from "./ports";
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

/** A dated wage row as read: the month it starts and what it sets. */
export interface WageRow {
  employeeId: string;
  effectiveFrom: Date;
  grossPayMinor: bigint;
}

/**
 * The wage in force for a month: the newest change at or before it, else the
 * pay the record began with. `changes` is oldest first, and where a month has
 * more than one the later is the correction, so it wins.
 */
export function wageFor(
  base: number,
  changes: readonly WageChange[],
  month: string,
): number {
  let wage = base;
  for (const change of changes) {
    if (change.effectiveFrom <= month) wage = change.grossPayMinor;
  }
  return wage;
}

export function toWageChanges(rows: readonly WageRow[]): WageChange[] {
  return rows.map((row) => ({
    effectiveFrom: isoDay(row.effectiveFrom).slice(0, 7),
    grossPayMinor: minorUnits(row.grossPayMinor),
  }));
}

export function toEmployeeRecord(
  row: EmployeeRow,
  wageChanges: readonly WageChange[] = [],
  month?: string,
): EmployeeRecord {
  const base = minorUnits(row.grossPayMinor);
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
    grossPayMinor: month ? wageFor(base, wageChanges, month) : base,
    wageChanges,
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
async function workplaceToday(
  tx: HrTransaction,
  where: { organizationId: string; propertyId?: string | null | undefined },
): Promise<string> {
  const [row] = await tx.$queryRaw<{ today: string }[]>`
    select to_char(app.hr_today(${where.organizationId}::uuid,
                                ${where.propertyId ?? null}::uuid),
                   'YYYY-MM-DD') as today
  `;
  return row?.today ?? new Date().toISOString().slice(0, 10);
}

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
      const changes = await tx.hrWageChange.findMany({
        where: { organizationId },
        orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }],
        select: { employeeId: true, effectiveFrom: true, grossPayMinor: true },
      });
      const month = (await organizationToday(tx, organizationId)).slice(0, 7);
      return rows.map((row) =>
        toEmployeeRecord(
          row,
          toWageChanges(
            changes.filter((change) => change.employeeId === row.id),
          ),
          month,
        ),
      );
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
      // A hire date is recorded when it has happened, as an ending is: the
      // people who work at the Property are the ones whose today it is.
      if (hiredOn !== null && hiredOn > (await workplaceToday(tx, input))) {
        throw new HrInputError("dates");
      }
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
          today: string;
        }[]
      >`
        select property_id as "propertyId", status,
               to_char(hired_on, 'YYYY-MM-DD') as "hiredOn",
               to_char(app.hr_today(organization_id, property_id), 'YYYY-MM-DD')
                 as "today"
          from public.hr_employees
         where id = ${input.employeeId}::uuid
           and organization_id = ${input.organizationId}::uuid
           for no key update
      `;
      if (!employee) throw new HrRefusedError("not_permitted");
      if (employee.status === "terminated") {
        throw new HrRefusedError("already_terminated");
      }
      // Not before they were hired, and not ahead of the day it is for the
      // people who work there: an ending is recorded when it has happened.
      if (
        isoDay(terminatedOn) < employee.hiredOn ||
        isoDay(terminatedOn) > employee.today
      ) {
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

  /**
   * Edits who somebody is and what they do. Pay is not here: it is dated, and
   * `changeWage` is the one way to change it.
   *
   * What the record says is audited as which fields changed and never as their
   * values — a phone number or an IBAN is not something a log should hold. A
   * save that changes nothing writes nothing.
   */
  async function updateEmployee(
    userId: string,
    input: UpdateEmployeeInput,
  ): Promise<readonly string[]> {
    const firstName = requiredText(input.firstName, "name");
    const lastName = requiredText(input.lastName, "name");
    const department = requiredText(input.department, "department");
    const position = requiredText(input.position, "position");
    const email = optionalEmail(input.email);
    const phone = optionalText(input.phone);
    const iban = input.iban ? normalizeIban(input.iban) : null;
    const hiredOn = isoDay(calendarDay(input.hiredOn, "dates"));

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const [current] = await tx.$queryRaw<
        (EmployeeRow & { hiredOnDay: string })[]
      >`
        select id, organization_id as "organizationId",
               property_id as "propertyId", user_id as "userId",
               first_name as "firstName", last_name as "lastName", email, phone,
               department, position, contract_type as "contractType",
               hired_on as "hiredOn", to_char(hired_on, 'YYYY-MM-DD') as "hiredOnDay",
               gross_pay_minor as "grossPayMinor", currency, status,
               terminated_on as "terminatedOn", bank_name as "bankName", iban,
               created_at as "createdAt", updated_at as "updatedAt"
          from public.hr_employees
         where id = ${input.employeeId}::uuid
           and organization_id = ${input.organizationId}::uuid
           for no key update
      `;
      if (!current) throw new HrRefusedError("not_permitted");
      if (current.status === "terminated") {
        throw new HrRefusedError("employee_terminated");
      }
      if (hiredOn > (await workplaceToday(tx, current))) {
        throw new HrInputError("dates");
      }

      const changed = [
        [
          "name",
          firstName !== current.firstName || lastName !== current.lastName,
        ],
        ["department", department !== current.department],
        ["position", position !== current.position],
        ["contractType", input.contractType !== current.contractType],
        ["phone", phone !== current.phone],
        ["email", email !== current.email],
        ["iban", iban !== null && iban !== current.iban],
        ["hiredOn", hiredOn !== current.hiredOnDay],
      ]
        .filter(([, differs]) => differs)
        .map(([field]) => field as string);
      if (changed.length === 0) return changed;

      try {
        await tx.$executeRaw`
          update public.hr_employees
             set first_name = ${firstName}, last_name = ${lastName},
                 department = ${department}, position = ${position},
                 contract_type = ${input.contractType}, phone = ${phone},
                 email = ${email}, iban = coalesce(${iban}, iban),
                 hired_on = ${hiredOn}::date, updated_at = now()
           where id = ${input.employeeId}::uuid
        `;
      } catch (error: unknown) {
        throw refusal(error);
      }

      await recordWithin(tx, {
        organizationId: input.organizationId,
        locationId: current.propertyId,
        actorId: userId,
        action: "employee.updated",
        subjectType: "employee",
        subjectId: input.employeeId,
        context: { fields: changed },
      });
      return changed;
    });
  }

  /**
   * Gives an employee a new gross pay from a month on.
   *
   * It adds a dated row and rewrites nothing: a run already approved keeps its
   * payslips, and the database refuses a month an approved run already covers
   * (HR-DEF-10). Pay is typed in the currency the record is paid in, which a
   * wage change cannot restate (ADR 0015).
   */
  async function changeWage(
    userId: string,
    input: ChangeWageInput,
  ): Promise<void> {
    const { firstDay } = validPeriod(input.effectiveFrom);
    const grossPayMinor = wholeMinorUnits(input.grossPayMinor, "grossPay");

    await withOrganizationContext(deps.db, { userId }, async (tx) => {
      const [employee] = await tx.$queryRaw<
        { propertyId: string | null; status: string; currency: string }[]
      >`
        select property_id as "propertyId", status, currency
          from public.hr_employees
         where id = ${input.employeeId}::uuid
           and organization_id = ${input.organizationId}::uuid
           for no key update
      `;
      if (!employee) throw new HrRefusedError("not_permitted");
      if (employee.status === "terminated") {
        throw new HrRefusedError("employee_terminated");
      }

      try {
        await tx.$executeRaw`
          insert into public.hr_wage_changes
            (organization_id, employee_id, effective_from, gross_pay_minor,
             created_by)
          values (${input.organizationId}::uuid, ${input.employeeId}::uuid,
                  ${isoDay(firstDay)}::date, ${grossPayMinor}::bigint,
                  ${userId}::uuid)
        `;
      } catch (error: unknown) {
        throw refusal(error);
      }

      await recordWithin(tx, {
        organizationId: input.organizationId,
        locationId: employee.propertyId,
        actorId: userId,
        action: "employee.wage_changed",
        subjectType: "employee",
        subjectId: input.employeeId,
        context: {
          effectiveFrom: input.effectiveFrom,
          currency: employee.currency,
          grossPayMinor,
        },
      });
    });
  }

  return {
    employees,
    registerEmployee,
    terminateEmployee,
    updateEmployee,
    changeWage,
  };
}
