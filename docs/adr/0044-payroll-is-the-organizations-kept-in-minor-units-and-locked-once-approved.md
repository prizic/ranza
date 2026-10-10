# 0044. Payroll is the Organization's, kept in minor units and locked once approved

Date: 2026-10-10

Status: Proposed

Builds on [ADR 0012](0012-a-write-is-bounded-by-a-policy-not-a-check.md),
[ADR 0015](0015-money-is-an-integer-a-balance-is-a-sum-and-a-correction-is-a-line.md),
[ADR 0026](0026-a-role-is-a-named-set-of-permissions-and-reach-is-taken-away-for-free.md),
[ADR 0031](0031-an-audit-record-carries-its-location-and-is-read-by-permission.md) and
[ADR 0040](0040-what-admits-a-subscription-status-and-an-active-property.md).

## Context

HR shipped in two migrations (`20260916010100`, `20260916010500`) with the
policies of a table nobody had thought about yet. A review found that a payroll
run was computed from the employees its approver could read, though it is unique
per Organization and period, so a manager assigned to some Properties approved a
run that left the others without payslips for good. The HR policies carried no
commercial gate, so a lapsed Organization could still write payroll. Amounts
were `numeric(12,2)` computed with floats. An approved run could be changed or
reverted. Its deductions were an invented 15% and a ceiling.

A second review found that a manager of one Property crashed the HR page once a
colleague rostered someone they could not read, that a month still running could
be approved and locked, that a leaver was left out of the run for the month they
worked, and that the audit record carried a kind of leave.

These are decisions the code now assumes. The owner has not made them.

## Decision

### A payroll run belongs to the whole Organization

A run has no Property, so it takes reach to every Property as an audit record
with no location does (ADR 0031): reading, opening and approving a run each ask
`has_organization_wide_reach`, `hr.view` or `hr.manage`, and the HR gates, in the
policy and again in the module, which is what lets a refusal name its reason. A
run covers everyone employed at any point in the period (below). Approving needs
no permission of its own; whether it should (as reversing a charge got one, ADR 0041) is HR-DEF-08.

An employee with no Property is the whole Organization's by the same reasoning
and takes the same reach. A read is gated against the Organization, not the
employee's own Property, so an approver who reaches everything reads everyone and
a run is never one short.

### A period is approved once it has ended, and covers everyone employed in it

A run is locked, so approving a month that is still running would fix a
headcount that is still changing, and nothing can revise it (HR-DEF-10). A
period has ended when the first day of the next one is no later than today,
counted as the earliest calendar day across the Organization's Properties so
that it is over everywhere it works. The module refuses the running month and
any later one with its reason, the database refuses it for a caller that never
came through the module, and payroll opens on the most recent month that has
ended.

A run holds everyone who was employed at any point in the period: hired by its
last day, and not ended before its first. Someone who left in the middle is in
it, paid in full, because leaving them out is a mistake the lock makes
permanent. Paying them for part of a month is HR-DEF-05, and it carries a
consequence this ADR is plain about: a month paid in full to someone who left on
the 3rd cannot be corrected in the product, because an approved run has no
reversal or revision (HR-DEF-10). Approving shows a dialog that names the
period, the headcount, the currency and the totals, and says the run locks.

### Money is bigint minor units, and a run has one currency

`*_minor bigint` throughout (ADR 0015); arithmetic is integer, rounded half up
once. An employee is paid in the currency of the Property they are registered at
and that currency is not in the update grant, as a Folio's is fixed. A run is in
one currency and a period whose employees are paid in two is refused with its
reason, not split (HR-DEF-04). The database also refuses a payslip in another
currency than its run's.

### An approved run cannot change

A run is opened as a draft with its payslips and moves to approved once, naming
who approved it. A trigger checks that the totals equal the payslips' sums at
that moment, refuses an insert as approved, and refuses any change to an approved
run or its payslips for every role. Restating an approval changes nothing and
emits nothing. Approval takes an advisory lock so two at once are one.

### The deductions are placeholders

`deductions.ts` carries the rates the first version called statutory. Nothing in
the repository says they are. They stay as named constants in one pure function
and the screen says so, until the owner and an accountant decide (HR-DEF-03).

### Employment is not access, and ending it is final

Ending employment sets a status and a day on a record that stays, dated on or
after the day it happens and never ahead of it: a plan would leave a person
terminated today and working tomorrow. It does not touch a membership, and
withdrawing a membership does not touch it. A terminated record cannot be
revived: a re-hire is a new record, because payslips and the audit trail point
at the old one, and the database gives a leaver no new shift and no new leave.
`on_leave` and `paid` are removed because nothing reached them.

### A rota, like leave and payslips, is read where the employee is

A shift belongs to a Property and to an employee, and it is read only where both
can be reached. A shift of an employee with no Property, or of one moved to a
Property the reader does not reach, used to come back joined to no employee and
broke the page that listed it.

### An audit record never carries a kind of leave

Leave is audited by employee and days. A kind of leave is health and pregnancy
data, and the table is append-only.

### The IBAN never leaves the server whole

It is stored whole and every read returns it masked. Nothing needs the whole
number until a payout exists (HR-DEF-01).

## Consequences

A manager of one Property sees a notice where the payroll tab was, and cannot
read the payslips of a run they cannot read the header of. An Organization with
Properties in two currencies cannot approve payroll until HR-DEF-04 is decided.
`payroll.approved` is emitted with minor units and a currency and nothing
consumes it (HR-DEF-02); `20260916010500` says otherwise in a comment and is not
edited, since a correction to an applied migration is a new one.

A wrong run cannot be corrected inside the product until the owner decides what a
correction to payroll is (HR-DEF-10): AGENTS.md requires it to be a reversal or a
revision record and not an edit, and neither exists.

Employees of an archived Property are read and paid through whole-Organization
reach but cannot be changed until they are reassigned (HR-DEF-06).
