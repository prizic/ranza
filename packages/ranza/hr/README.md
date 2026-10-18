# @ranza/hr

Human resources and payroll (blueprint 5.11, Phase 4).
Staff records beyond membership: contracts, weekly rota shifts, leave requests, and payroll runs with payslips.

## What this module owns

The `hr_employees`, `hr_shifts`, `hr_leave_requests`, `hr_payroll_runs`, and `hr_payslips` tables, their constraints, triggers and row-level security policies — in
[`prisma/migrations/20260916010100_human_resources_and_payroll`](../../../prisma/migrations/20260916010100_human_resources_and_payroll/migration.sql),
[`…010500_hr_security_and_hardening`](../../../prisma/migrations/20260916010500_hr_security_and_hardening/migration.sql) and
[`…010800_payroll_is_approved_organization_wide_and_locked_once_approved`](../../../prisma/migrations/20260916010800_payroll_is_approved_organization_wide_and_locked_once_approved/migration.sql)
and [`…010900_an_employee_is_linked_to_one_login`](../../../prisma/migrations/20260916010900_an_employee_is_linked_to_one_login/migration.sql),
which state the end state. The design is [`docs/features/hr/`](../../../docs/features/hr/edge-cases.csv) and
[ADR 0044](../../../docs/adr/0044-payroll-is-the-organizations-kept-in-minor-units-and-locked-once-approved.md).

## Invariant: Membership is access, not employment

An employee record (`hr_employees`) represents an employed human being with department, position, hire date, salary, and contract details.
A system membership (`organization_memberships`) represents login credentials, roles, and software permissions.
Conflating the two is the mistake this module avoids:

- An employee can be employed without having system access (e.g. frontline staff without system logins).
- When a staff member's system access is revoked or ends, their employment record, contract history, rota shifts, and payroll slips remain intact and outlive their access to the system.
- Ending employment is its own act: `terminateEmployee` sets a status and a day, keeps everything, and does not touch a membership.
- Linking them is an act too, and optional: `registerEmployee` takes a `userId`, and the Employees screen offers every active login that no record is linked to (HR-S1-49). A login is linked to at most one record per Organization, a leaver's included, held by a partial unique index; a second registration is refused as `already_registered` (HR-S1-51). The module does not check that the login is a member of the Organization: the host reads the roster and does (HR-S1-55).

## Contract

```ts
import { createHrModule } from "@ranza/hr";

const hr = createHrModule({ db });
await hr.employees(userId, organizationId);
await hr.registerEmployee(userId, input); // grossPayMinor + currency, never a float; userId optional
await hr.terminateEmployee(userId, {
  organizationId,
  employeeId,
  terminatedOn,
});
await hr.shifts(userId, organizationId, propertyId, from, to);
await hr.assignShift(userId, input);
await hr.leaveRequests(userId, organizationId);
await hr.submitLeaveRequest(userId, input);
await hr.decideLeave(userId, { organizationId, leaveId, approved });
await hr.payrollSummary(userId, organizationId, "2026-09"); // null without whole-Organization reach
await hr.approvePayroll(userId, { organizationId, period: "2026-09" }); // only a period that has ended
await hr.latestEndedPeriod(userId, organizationId); // the month before the running one
await hr.workplace(userId, propertyId); // the Property's currency and today
```

Every command takes the acting user first and runs in their request context. A command that does not happen throws `HrInputError` (what was typed, by field) or `HrRefusedError` (why, by reason); anything else is a defect or an outage and is the host's to report.

## Rules

- Receives its client; never reads the environment or process.env (ADR 0006).
- Row-level security enforces tenant boundaries, permissions (`hr.view`, `hr.manage`), the commercial gates and reach (ADR 0012). A Staff Member who reaches one Property reads and writes only that Property's rows.
- **Payroll is the whole Organization's.** A run is read, opened and approved only with reach to every Property, covers everyone employed at any point in the period, and is approved only once the period has ended.
- **Pay is dated.** `changeWage()` adds a row to `hr_wage_changes` from a month on and rewrites nothing; the wage for a month is the newest row at or before it, else the employee's own `gross_pay_minor`, which the application role cannot update. A month an approved run covers refuses a change, and `updateEmployee()` edits everything but pay.
- **Money is whole minor units** (ADR 0015), and a run is in one currency.
- **An approved run cannot change**, for any role. Approving again is a no-op that emits nothing.
- **The deductions are placeholders** (`deductions.ts`), pending the owner and an accountant. Do not add rules to that function without an approved row.
- The IBAN is stored whole and returned masked; nothing here returns the whole number.
- Never deletes operational history or employment records: terminations update status, dated on or after the day they happen. A leaver takes no new shift or leave, in the module and in the database.
- A rota, leave and payslips are read where their employee is.
- Meaningful actions are audited in the transaction that does them: `employee.registered`, `employee.updated` (the fields changed, never their values), `employee.wage_changed`, `employee.terminated`, `leave.approved`, `leave.declined`, `payroll_run.approved`. A kind of leave is never recorded: it is health data.
- `payroll.approved` is emitted to the outbox and nothing consumes it yet (HR-DEF-02).
