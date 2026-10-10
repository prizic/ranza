# @ranza/hr

Human resources and payroll (blueprint 5.11, Phase 4).
Staff records beyond membership: contracts, weekly rota shifts, leave requests, and payroll runs with payslips.

## What this module owns

The `hr_employees`, `hr_shifts`, `hr_leave_requests`, `hr_payroll_runs`, and `hr_payslips` tables, their constraints, triggers and row-level security policies — in
[`prisma/migrations/20260916010100_human_resources_and_payroll`](../../../prisma/migrations/20260916010100_human_resources_and_payroll/migration.sql),
[`…010500_hr_security_and_hardening`](../../../prisma/migrations/20260916010500_hr_security_and_hardening/migration.sql) and
[`…010800_payroll_is_approved_organization_wide_and_locked_once_approved`](../../../prisma/migrations/20260916010800_payroll_is_approved_organization_wide_and_locked_once_approved/migration.sql),
which states the end state. The design is [`docs/features/hr/`](../../../docs/features/hr/edge-cases.csv) and
[ADR 0044](../../../docs/adr/0044-payroll-is-the-organizations-kept-in-minor-units-and-locked-once-approved.md).

## Invariant: Membership is access, not employment

An employee record (`hr_employees`) represents an employed human being with department, position, hire date, salary, and contract details.
A system membership (`organization_memberships`) represents login credentials, roles, and software permissions.
Conflating the two is the mistake this module avoids:

- An employee can be employed without having system access (e.g. frontline staff without system logins).
- When a staff member's system access is revoked or ends, their employment record, contract history, rota shifts, and payroll slips remain intact and outlive their access to the system.
- Ending employment is its own act: `terminateEmployee` sets a status and a day, keeps everything, and does not touch a membership.

## Contract

```ts
import { createHrModule } from "@ranza/hr";

const hr = createHrModule({ db });
await hr.employees(userId, organizationId);
await hr.registerEmployee(userId, input); // grossPayMinor + currency, never a float
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
await hr.payrollSummary(userId, organizationId, "2026-10"); // null without whole-Organization reach
await hr.approvePayroll(userId, { organizationId, period: "2026-10" });
await hr.workplace(userId, propertyId); // the Property's currency and today
```

Every command takes the acting user first and runs in their request context. A command that does not happen throws `HrInputError` (what was typed, by field) or `HrRefusedError` (why, by reason); anything else is a defect or an outage and is the host's to report.

## Rules

- Receives its client; never reads the environment or process.env (ADR 0006).
- Row-level security enforces tenant boundaries, permissions (`hr.view`, `hr.manage`), the commercial gates and reach (ADR 0012). A Staff Member who reaches one Property reads and writes only that Property's rows.
- **Payroll is the whole Organization's.** A run is read, opened and approved only with reach to every Property, and covers every active employee hired by the end of the period.
- **Money is whole minor units** (ADR 0015), and a run is in one currency.
- **An approved run cannot change**, for any role. Approving again is a no-op that emits nothing.
- **The deductions are placeholders** (`deductions.ts`), pending the owner and an accountant. Do not add rules to that function without an approved row.
- The IBAN is stored whole and returned masked; nothing here returns the whole number.
- Never deletes operational history or employment records: terminations update status.
- Meaningful actions are audited in the transaction that does them: `employee.registered`, `employee.terminated`, `leave.approved`, `leave.declined`, `payroll_run.approved`.
- `payroll.approved` is emitted to the outbox and nothing consumes it yet (HR-DEF-02).
