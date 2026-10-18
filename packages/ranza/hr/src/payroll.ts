import { withOrganizationContext } from "@ranza/db";
import { recordWithin } from "@ranza/platform-audit";
import type {
  ApprovePayrollInput,
  PayrollBlocker,
  PayrollPeriodSummary,
  PayrollStatus,
  PayslipRecord,
} from "./contracts";
import { calculatePlaceholderDeductions } from "./deductions";
import { HrRefusedError } from "./errors";
import { toWageChanges, wageFor } from "./employees";
import { maskIban } from "./iban";
import { minorUnits, validPeriod } from "./input";
import type { HrDeps, HrTransaction } from "./ports";
import { refusal } from "./refusals";
import { organizationToday as today } from "./clock";

interface PayrollAccess {
  /** Blueprint 3.5 gates 1-3: the Subscription, the Entitlement and a Property with HR on. */
  available: boolean;
  wholeOrganization: boolean;
  view: boolean;
  manage: boolean;
}

/**
 * What the acting Staff Member may do about payroll, asked of the database in
 * the transaction that is about to rely on it. Payroll is the whole
 * Organization's, so it takes reach to the whole Organization as well as the
 * permission (HR-S1-24). The policies say the same; this is what lets a refusal
 * name its reason instead of arriving as a row that is not there.
 */
async function payrollAccess(
  tx: HrTransaction,
  organizationId: string,
): Promise<PayrollAccess> {
  const [access] = await tx.$queryRaw<PayrollAccess[]>`
    select app.can_use_capability_in_organization(
             ${organizationId}::uuid, 'human_resources', 'staff_administration')
             as available,
           app.has_organization_wide_reach(${organizationId}::uuid)
             as "wholeOrganization",
           app.has_organization_permission(${organizationId}::uuid, 'hr.view')
             as view,
           app.has_organization_permission(${organizationId}::uuid, 'hr.manage')
             as manage
  `;
  return (
    access ?? {
      available: false,
      wholeOrganization: false,
      view: false,
      manage: false,
    }
  );
}

/**
 * Everyone a run covers: every employee of the Organization who was employed at
 * any point in the period — hired by its last day, and not ended before its
 * first. A person who left in the middle of it is paid for it, because a run is
 * locked and leaving them out would be a mistake no one can correct; paying
 * them in full is HR-DEF-05's. Not "the employees this person can see": the run
 * is unique per period, so one that left a Property out would leave it without
 * payslips for good (HR-S1-24).
 */
async function payableEmployees(
  tx: HrTransaction,
  organizationId: string,
  firstDay: Date,
  lastDay: Date,
) {
  const employees = await tx.hrEmployee.findMany({
    where: {
      organizationId,
      hiredOn: { lte: lastDay },
      OR: [{ terminatedOn: null }, { terminatedOn: { gte: firstDay } }],
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }],
  });
  // The pay in force for the period, from the dated changes, so a raise that
  // starts later does not change what an earlier month says (HR-03).
  const changes = await tx.hrWageChange.findMany({
    where: {
      organizationId,
      employeeId: { in: employees.map((employee) => employee.id) },
    },
    orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }],
    select: { employeeId: true, effectiveFrom: true, grossPayMinor: true },
  });
  const month = firstDay.toISOString().slice(0, 7);
  return employees.map((employee) => ({
    ...employee,
    grossPayMinor: BigInt(
      wageFor(
        minorUnits(employee.grossPayMinor),
        toWageChanges(
          changes.filter((change) => change.employeeId === employee.id),
        ),
        month,
      ),
    ),
  }));
}

interface Payable {
  id: string;
  firstName: string;
  lastName: string;
  department: string;
  position: string;
  grossPayMinor: bigint;
  currency: string;
  iban: string | null;
}

interface Slip {
  employee: Payable;
  grossPayMinor: number;
  socialSecurityDeductionMinor: number;
  taxDeductionMinor: number;
  stampDutyMinor: number;
  netPayMinor: number;
}

function slipFor(employee: Payable): Slip {
  const grossPayMinor = minorUnits(employee.grossPayMinor);
  const deductions = calculatePlaceholderDeductions(grossPayMinor);
  return {
    employee,
    grossPayMinor,
    socialSecurityDeductionMinor: deductions.socialSecurityMinor,
    taxDeductionMinor: deductions.incomeTaxMinor,
    stampDutyMinor: deductions.stampDutyMinor,
    netPayMinor: deductions.netMinor,
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** What stops a draft from being approved as it stands, if anything. */
function blockerOf(employees: readonly Payable[]): PayrollBlocker | null {
  if (employees.length === 0) return "no_employees";
  return new Set(employees.map((employee) => employee.currency)).size > 1
    ? "mixed_currency"
    : null;
}

function draftSummary(
  period: string,
  employees: readonly Payable[],
  ended: boolean,
): PayrollPeriodSummary {
  const blocker = ended ? blockerOf(employees) : "period_not_ended";
  if (blocker !== null) {
    return {
      period,
      status: "draft",
      currency: null,
      totalGrossMinor: 0,
      totalNetMinor: 0,
      approvedAt: null,
      payslips: [],
      blocker,
    };
  }
  const slips = employees.map(slipFor);
  return {
    period,
    status: "draft",
    currency: employees[0]?.currency ?? null,
    totalGrossMinor: sum(slips.map((slip) => slip.grossPayMinor)),
    totalNetMinor: sum(slips.map((slip) => slip.netPayMinor)),
    approvedAt: null,
    payslips: slips.map((slip) => ({
      id: `draft-${slip.employee.id}`,
      employeeId: slip.employee.id,
      employeeName:
        `${slip.employee.firstName} ${slip.employee.lastName}`.trim(),
      department: slip.employee.department,
      position: slip.employee.position,
      grossPayMinor: slip.grossPayMinor,
      socialSecurityDeductionMinor: slip.socialSecurityDeductionMinor,
      taxDeductionMinor: slip.taxDeductionMinor,
      stampDutyMinor: slip.stampDutyMinor,
      netPayMinor: slip.netPayMinor,
      ibanMasked: maskIban(slip.employee.iban),
    })),
    blocker: null,
  };
}

async function readRun(
  tx: HrTransaction,
  organizationId: string,
  period: string,
): Promise<PayrollPeriodSummary | null> {
  const run = await tx.hrPayrollRun.findUnique({
    where: { organizationId_period: { organizationId, period } },
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
        orderBy: [{ employee: { firstName: "asc" } }, { id: "asc" }],
      },
    },
  });
  if (!run) return null;

  return {
    period: run.period,
    status: run.status as PayrollStatus,
    currency: run.currency,
    totalGrossMinor: minorUnits(run.totalGrossMinor),
    totalNetMinor: minorUnits(run.totalNetMinor),
    approvedAt: run.approvedAt,
    payslips: run.payslips.map((payslip): PayslipRecord => ({
      id: payslip.id,
      employeeId: payslip.employeeId,
      employeeName:
        `${payslip.employee.firstName} ${payslip.employee.lastName}`.trim(),
      department: payslip.employee.department,
      position: payslip.employee.position,
      grossPayMinor: minorUnits(payslip.grossPayMinor),
      socialSecurityDeductionMinor: minorUnits(
        payslip.socialSecurityDeductionMinor,
      ),
      taxDeductionMinor: minorUnits(payslip.taxDeductionMinor),
      stampDutyMinor: minorUnits(payslip.stampDutyMinor),
      netPayMinor: minorUnits(payslip.netPayMinor),
      ibanMasked: maskIban(payslip.iban),
    })),
    blocker: null,
  };
}

/** Payroll runs, approved once for the whole Organization and then locked. */
export function createPayroll(deps: HrDeps) {
  /**
   * The most recent period that has ended, `YYYY-MM`: the one a person opening
   * payroll most likely means, and the latest one that can be approved.
   */
  async function latestEndedPeriod(
    userId: string,
    organizationId: string,
  ): Promise<string> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const [year = 0, month = 1] = (await today(tx, organizationId))
        .split("-")
        .map(Number);
      return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
    });
  }

  /**
   * One period of payroll as it stands: the approved run if there is one,
   * otherwise what approving it now would produce.
   *
   * Null for somebody who does not reach the whole Organization or may not
   * view HR: a payroll run has no Property to narrow to, so there is nothing
   * of it that such a person may be shown.
   */
  async function payrollSummary(
    userId: string,
    organizationId: string,
    period: string,
  ): Promise<PayrollPeriodSummary | null> {
    const { firstDay, lastDay, nextPeriodStarts } = validPeriod(period);

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const access = await payrollAccess(tx, organizationId);
      if (!access.available || !access.wholeOrganization || !access.view) {
        return null;
      }

      return (
        (await readRun(tx, organizationId, period)) ??
        draftSummary(
          period,
          await payableEmployees(tx, organizationId, firstDay, lastDay),
          nextPeriodStarts <= (await today(tx, organizationId)),
        )
      );
    });
  }

  /**
   * Approves the period for every active employee of the Organization, once.
   *
   * Approving again returns the approved run and writes nothing, so a second
   * click, a retry and a rival colleague are all the same as the first. The
   * advisory lock is what makes that true for two at once: the second waits for
   * the first to commit and then finds its run.
   *
   * The run is opened as a draft with its payslips and then approved, because
   * the database checks the totals against the payslips at that moment and
   * refuses a run that was inserted already approved.
   */
  async function approvePayroll(
    userId: string,
    input: ApprovePayrollInput,
  ): Promise<PayrollPeriodSummary> {
    const { period, firstDay, lastDay, nextPeriodStarts } = validPeriod(
      input.period,
    );
    const { organizationId } = input;

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      await tx.$executeRaw`
        select pg_advisory_xact_lock(
          hashtextextended(${`payroll:${organizationId}:${period}`}, 0))
      `;

      const access = await payrollAccess(tx, organizationId);
      if (!access.available || !access.manage) {
        throw new HrRefusedError("not_permitted");
      }
      if (!access.wholeOrganization) {
        throw new HrRefusedError("payroll_needs_organization_reach");
      }

      const existing = await readRun(tx, organizationId, period);
      if (existing?.status === "approved") return existing;
      if (existing) throw new HrRefusedError("payroll_draft_exists");

      // A run is locked once approved, so a period that is still running is not
      // approved: its headcount is still changing and nothing can revise it.
      if (nextPeriodStarts > (await today(tx, organizationId))) {
        throw new HrRefusedError("payroll_period_not_ended");
      }

      const employees = await payableEmployees(
        tx,
        organizationId,
        firstDay,
        lastDay,
      );
      const blocker = blockerOf(employees);
      const [first] = employees;
      if (blocker === "no_employees" || !first) {
        throw new HrRefusedError("payroll_no_employees");
      }
      if (blocker === "mixed_currency") {
        throw new HrRefusedError("payroll_mixed_currency");
      }

      const slips = employees.map(slipFor);
      const { currency } = first;
      const totalGrossMinor = sum(slips.map((slip) => slip.grossPayMinor));
      const totalNetMinor = sum(slips.map((slip) => slip.netPayMinor));

      try {
        const [run] = await tx.$queryRaw<{ id: string }[]>`
          insert into public.hr_payroll_runs
            (organization_id, period, currency, total_gross_minor,
             total_net_minor)
          values (
            ${organizationId}::uuid, ${period}, ${currency},
            ${totalGrossMinor}::bigint, ${totalNetMinor}::bigint
          )
          returning id
        `;
        if (!run) throw new HrRefusedError("not_permitted");

        // Amounts travel as text and become bigint here: a JavaScript number
        // is not an integer to the driver once it is in an array.
        await tx.$executeRaw`
          insert into public.hr_payslips
            (organization_id, payroll_run_id, employee_id, gross_pay_minor,
             social_security_deduction_minor, tax_deduction_minor,
             stamp_duty_minor, net_pay_minor, iban)
          select ${organizationId}::uuid, ${run.id}::uuid, slip.employee_id,
                 slip.gross, slip.social_security, slip.tax, slip.stamp_duty,
                 slip.net, slip.iban
            from unnest(
              ${slips.map((slip) => slip.employee.id)}::uuid[],
              ${slips.map((slip) => String(slip.grossPayMinor))}::bigint[],
              ${slips.map((slip) => String(slip.socialSecurityDeductionMinor))}::bigint[],
              ${slips.map((slip) => String(slip.taxDeductionMinor))}::bigint[],
              ${slips.map((slip) => String(slip.stampDutyMinor))}::bigint[],
              ${slips.map((slip) => String(slip.netPayMinor))}::bigint[],
              ${slips.map((slip) => slip.employee.iban)}::text[]
            ) as slip(employee_id, gross, social_security, tax, stamp_duty,
                      net, iban)
        `;

        const approved = await tx.$executeRaw`
          update public.hr_payroll_runs
             set status = 'approved', approved_at = now(),
                 approved_by = ${userId}::uuid, updated_at = now()
           where id = ${run.id}::uuid and status = 'draft'
        `;
        if (approved !== 1) throw new HrRefusedError("not_permitted");

        // Ids, counts and amounts; never a name or an account number. The run
        // has no Property, so only whoever reaches the whole Organization may
        // read this record.
        await recordWithin(tx, {
          organizationId,
          actorId: userId,
          action: "payroll_run.approved",
          subjectType: "payroll_run",
          subjectId: run.id,
          context: {
            period,
            currency,
            employeeCount: slips.length,
            totalGrossMinor,
            totalNetMinor,
          },
        });
      } catch (error: unknown) {
        throw refusal(error);
      }

      const approved = await readRun(tx, organizationId, period);
      if (!approved) throw new HrRefusedError("not_permitted");
      return approved;
    });
  }

  return { payrollSummary, approvePayroll, latestEndedPeriod };
}
