# @ranza/hr

Human resources and payroll (blueprint 5.11, Phase 4).
Staff records beyond membership: contracts, weekly rota shifts, leave requests, and payroll runs with payslips.

## What this module owns

The `hr_employees`, `hr_shifts`, `hr_leave_requests`, `hr_payroll_runs`, and `hr_payslips` tables, their constraints, and row-level security policies — in
[`prisma/migrations/20260916010100_human_resources_and_payroll`](../../../prisma/migrations/20260916010100_human_resources_and_payroll/migration.sql).

## Invariant: Membership is access, not employment

An employee record (`hr_employees`) represents an employed human being with department, position, hire date, salary, and contract details.
A system membership (`organization_memberships`) represents login credentials, roles, and software permissions.
Conflating the two is the mistake this module avoids:

- An employee can be employed without having system access (e.g. frontline staff without system logins).
- When a staff member's system access is revoked or ends, their employment record, contract history, rota shifts, and payroll slips remain intact and outlive their access to the system.

## Contract

```ts
import { createHrModule } from "@ranza/hr";

const hrModule = createHrModule({ db });
await hrModule.employees(organizationId);
await hrModule.registerEmployee(data);
await hrModule.shifts(organizationId, startDate, endDate);
await hrModule.assignShift(data);
await hrModule.leaveRequests(organizationId);
await hrModule.submitLeaveRequest(data);
await hrModule.approveLeave(leaveId, approved);
await hrModule.payrollSummary(organizationId, period);
await hrModule.approvePayroll(organizationId, period);
```

## Rules

- Receives its client; never reads the environment or process.env (ADR 0006).
- Row-level security enforces tenant boundaries and permissions (`hr.view`, `hr.manage`).
- Never deletes operational history or employment records: terminations update status.
