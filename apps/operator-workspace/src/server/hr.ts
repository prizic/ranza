"use server";

import { revalidatePath } from "next/cache";
import { isSupportedLocale } from "@ranza/i18n";
import {
  HrInputError,
  HrRefusedError,
  type ContractType,
  type HrField,
  type HrRefusalReason,
  type LeaveType,
  type ShiftType,
} from "@ranza/hr";
import { toMinorUnits } from "../lib/amount";
import { getComposition } from "./composition";
import { currentViewer, entitledProperties, HR_CAPABILITY } from "./viewer";

/**
 * Working HR from the Workspace (RANZ-42).
 *
 * Every command goes through the composition root under the acting user's
 * context (ADR 0007), and the policies decide whether it lands (ADR 0012), so
 * nothing here checks a permission. An outcome carries no English: the
 * component chooses the copy from `status`, `reason` and `field`.
 */

export type HrOutcome =
  | { status: "done" }
  /** What the person typed that cannot be used. */
  | { status: "invalid"; field: HrField | "request" }
  | { status: "refused"; reason: HrRefusalReason }
  /** Something the module did not expect; it has been reported. */
  | { status: "error" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Matched by name as well, because a server bundle may hold two copies. */
function named(error: unknown, name: string): error is Error {
  return error instanceof Error && error.name === name;
}

/**
 * What a failed command becomes. A refusal or a bad input is an answer; any
 * other failure is a defect or an outage, so it is shown as a plain error and
 * recorded — the screen says "try again", and this is the only place anybody
 * learns it happened.
 */
function outcomeOf(
  command: string,
  context: Record<string, string>,
  error: unknown,
): HrOutcome {
  if (named(error, "HrInputError")) {
    return {
      status: "invalid",
      field: (error as Error & { field: HrField }).field,
    };
  }
  if (named(error, "HrRefusedError")) {
    return {
      status: "refused",
      reason: (error as Error & { reason: HrRefusalReason }).reason,
    };
  }
  console.error(`hr.${command}_failed`, context, error);
  return { status: "error" };
}

function revalidateHr(locale: string): void {
  revalidatePath(`/${locale}/hr`);
}

/**
 * The Organization a Property belongs to, among the Properties the viewer may
 * use HR at. Null for any other, which the command reports as a refusal.
 */
async function organizationOf(propertyId: string): Promise<string | null> {
  const entitled = await entitledProperties(HR_CAPABILITY);
  return (
    entitled.find((property) => property.propertyId === propertyId)
      ?.organizationId ?? null
  );
}

interface Scope {
  userId: string;
  organizationId: string;
}

/**
 * Runs one command for the signed-in viewer, with the locale and the ids
 * checked first. A malformed post is "invalid", never a cast error surfacing as
 * a crash.
 */
async function run(
  command: string,
  locale: string,
  propertyId: string,
  ids: readonly string[],
  work: (scope: Scope) => Promise<void>,
): Promise<HrOutcome> {
  if (
    !isSupportedLocale(locale) ||
    !UUID.test(propertyId) ||
    !ids.every((id) => UUID.test(id))
  ) {
    return { status: "invalid", field: "request" };
  }
  const viewer = await currentViewer();
  if (!viewer) return { status: "refused", reason: "not_permitted" };
  const organizationId = await organizationOf(propertyId);
  if (!organizationId) return { status: "refused", reason: "not_permitted" };

  try {
    await work({ userId: viewer.userId, organizationId });
    revalidateHr(locale);
    return { status: "done" };
  } catch (error: unknown) {
    // A refusal usually means the page is older than the truth: a permission
    // taken away, a request somebody else decided. The next read shows what is
    // true now.
    const outcome = outcomeOf(
      command,
      { propertyId, userId: viewer.userId },
      error,
    );
    if (outcome.status !== "invalid") revalidateHr(locale);
    return outcome;
  }
}

/**
 * A day as the form posts it, or null for one that is not on the calendar.
 * `Date` rolls 31 February over into March rather than refusing it, so the
 * answer is read back and has to say what was typed.
 */
function calendarDate(value: string): Date | null {
  if (!DAY.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? date
    : null;
}

/**
 * Whether a login may be linked to a new employee record: an active member of
 * this Organization. Read here and not taken from the form, because a post can
 * name any id (HR-S1-55). That the login is not already linked is the
 * database's to say, through a unique index, so two registrations at once end
 * in one record (HR-S1-51).
 */
async function isActiveMember(scope: Scope, loginId: string): Promise<boolean> {
  const roster = await getComposition().staff.readRoster(
    { userId: scope.userId },
    scope.organizationId,
  );
  return roster.some(
    (member) => member.userId === loginId && member.status === "active",
  );
}

export async function registerEmployeeAction(
  locale: string,
  propertyId: string,
  data: {
    /** The login this record is for, when it is registered from one. */
    userId?: string | undefined;
    firstName: string;
    lastName: string;
    email?: string | undefined;
    phone?: string | undefined;
    department: string;
    position: string;
    contractType?: ContractType | undefined;
    /** As the person typed it, in the Property's currency. */
    grossPay: string;
    iban?: string | undefined;
  },
): Promise<HrOutcome> {
  const loginIds = data.userId === undefined ? [] : [data.userId];
  return run(
    "register_employee",
    locale,
    propertyId,
    loginIds,
    async (scope) => {
      const comp = getComposition();
      if (
        data.userId !== undefined &&
        !(await isActiveMember(scope, data.userId))
      ) {
        throw new HrRefusedError("not_permitted");
      }
      // The currency is the Property's, read here and not taken from the form: a
      // caller that could name one could restate every amount it posted (ADR 0015).
      const workplace = await comp.hr.workplace(scope.userId, propertyId);
      if (!workplace) throw new HrRefusedError("not_permitted");
      const grossPayMinor = toMinorUnits(data.grossPay, workplace.currency);
      if (grossPayMinor === null) throw new HrInputError("grossPay");

      await comp.hr.registerEmployee(scope.userId, {
        organizationId: scope.organizationId,
        propertyId,
        userId: data.userId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        department: data.department,
        position: data.position,
        contractType: data.contractType,
        grossPayMinor,
        currency: workplace.currency,
        iban: data.iban,
      });
    },
  );
}

export async function terminateEmployeeAction(
  locale: string,
  propertyId: string,
  employeeId: string,
  terminatedOn: string,
): Promise<HrOutcome> {
  const day = calendarDate(terminatedOn);
  return run(
    "terminate_employee",
    locale,
    propertyId,
    [employeeId],
    async (scope) => {
      if (!day) throw new HrInputError("terminatedOn");
      await getComposition().hr.terminateEmployee(scope.userId, {
        organizationId: scope.organizationId,
        employeeId,
        terminatedOn: day,
      });
    },
  );
}

export async function assignShiftAction(
  locale: string,
  propertyId: string,
  data: { employeeId: string; date: string; shiftType: ShiftType },
): Promise<HrOutcome> {
  const day = calendarDate(data.date);
  return run(
    "assign_shift",
    locale,
    propertyId,
    [data.employeeId],
    async (scope) => {
      if (!day) throw new HrInputError("dates");
      await getComposition().hr.assignShift(scope.userId, {
        organizationId: scope.organizationId,
        propertyId,
        employeeId: data.employeeId,
        date: day,
        shiftType: data.shiftType,
      });
    },
  );
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
): Promise<HrOutcome> {
  const startsOn = calendarDate(data.startsOn);
  const endsOn = calendarDate(data.endsOn);
  return run(
    "submit_leave",
    locale,
    propertyId,
    [data.employeeId],
    async (scope) => {
      if (!startsOn || !endsOn) throw new HrInputError("dates");
      await getComposition().hr.submitLeaveRequest(scope.userId, {
        organizationId: scope.organizationId,
        employeeId: data.employeeId,
        leaveType: data.leaveType,
        startsOn,
        endsOn,
        notes: data.notes,
      });
    },
  );
}

export async function decideLeaveAction(
  locale: string,
  propertyId: string,
  leaveId: string,
  approved: boolean,
): Promise<HrOutcome> {
  return run("decide_leave", locale, propertyId, [leaveId], async (scope) => {
    await getComposition().hr.decideLeave(scope.userId, {
      organizationId: scope.organizationId,
      leaveId,
      approved,
    });
  });
}

/**
 * Approves a period for the whole Organization. Whether the viewer may is the
 * module's and the policies' to say — it takes reach to every Property, not
 * to the one this page was opened from (HR-S1-24) — so this does not narrow
 * it by the Property in the address.
 */
export async function approvePayrollAction(
  locale: string,
  propertyId: string,
  period: string,
): Promise<HrOutcome> {
  return run("approve_payroll", locale, propertyId, [], async (scope) => {
    await getComposition().hr.approvePayroll(scope.userId, {
      organizationId: scope.organizationId,
      period,
    });
  });
}
