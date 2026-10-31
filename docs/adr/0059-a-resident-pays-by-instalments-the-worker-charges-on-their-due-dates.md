# 0059. A Resident pays by instalments the worker charges on their due dates

Date: 2026-10-31

Status: Proposed

Builds on [ADR 0012](0012-a-write-is-bounded-by-a-policy-not-a-check.md),
[ADR 0015](0015-money-is-an-integer-a-balance-is-a-sum-and-a-correction-is-a-line.md),
[ADR 0018](0018-the-worker-has-its-own-role-and-its-own-context.md),
[ADR 0038](0038-a-night-is-priced-by-its-unit-type-and-fixed-when-booked.md) and
[ADR 0057](0057-a-propertys-operating-model-sets-its-defaults-and-its-words-never-its-rules.md).
The rows are [`docs/features/payment-plans/edge-cases.csv`](../features/payment-plans/edge-cases.csv).
Decisions 2 and 7 of [`docs/yurt-first-plan.html`](../yurt-first-plan.html) are this
ADR's questions, answered there as recommendations.

## Context

A Resident is not billed by the night: ADR 0038 stamps a price on a Guest's booking and
leaves a Resident's unpriced, and `app.room_nights_due()` is a Guest's alone. Nothing
bills a Resident at all (RT-DEF-04), and the booking dialog said "billed monthly" while it
did not (RANZ-106). A Turkish yurt takes a term's fee in parts, ten monthly payments or
four senets, so what has to exist is a schedule of amounts and dates charged to the
Resident's Folio as they fall due, and a way to say who is behind.

The tempting shapes are both wrong. "Monthly rent" is one case of the need and makes the
four-senet yurt a special case. A flag on the booking that a worker reads to charge a
number every month moves a contract into a job and leaves no record of what was agreed.

## Decision

### A plan is N amounts, each due on a date

`payment_plans` holds one row per booking of a Resident, and `plan_instalments` one row per
amount and due date. Ten monthly payments and four senets are the same rows with different
counts. A booking has at most one plan, by a unique key. The plan is the contract's header,
the instalments are what was agreed, and the Folio lines are what was charged.

### A plan needs a term, and says so on the plan

A plan is only for a booking of a Resident that has a departure date, and a booking that
has one keeps it. Instalments are scheduled against a term, so the end date is a rule of
the plan, held by triggers for every writer. It is not a rule of the operating model: a
dormitory opens the plan section by default and a hotel one press away, and that is all the
model chooses (ADR 0057). An instalment falls due on or before the departure date and may
fall due before the term starts, because the first payment is often taken at registration.

### The worker charges, once, by a unique key

`ranza_worker` holds nothing on the plan tables. Two functions executable by it alone find
the Properties with something ready and charge them: the same shape as the business day's
close (ADR 0018). The charge is a Folio line dated the day the instalment fell due, with
`source = 'instalment'`, and `folio_lines.instalment_id` carries a unique index. A second
pass, or a second worker, charges nothing: the guarantee is a constraint and not a check
someone has to remember. That an instalment was charged is the line that names it and is
not stored on the instalment, so the two cannot disagree.

An instalment waits when its Resident has no Folio yet, or the Folio is closed or in
another currency, and is charged on the pass after the Folio is able to take it. Waiting is
a count in the pass's report and never an error, and the instalment is overdue by its date
all the same.

### Overdue is defined once, in SQL

`app.payment_plan_standing()` says where every live instalment stands: upcoming, due,
overdue, paid or waived. Overdue is the day after its due date in the Property's own
calendar, not paid in full. A payment settles the oldest instalment first: what the Resident
has paid on their Folio, net of reversed payments, is laid over their instalments in due-date
order. A reversed instalment charge is waived and covers nothing. The Today screen, the
booking's schedule and the Resident's portal read this function and none restates it.

Laying payments over the oldest instalment is a simplification, and a recorded one: a
payment made toward another charge on the Folio is laid over the instalments all the same
(PP-DEF-01). A payment allocated to a chosen line is the general case and needs its own
design.

### History is revised and never rewritten

Instalments are never changed and never deleted. A revision withdraws the instalments that
were not charged and writes the new schedule beside them as the plan's next revision. A
charged instalment is history for every writer: withdrawing, changing or deleting it is
refused by a trigger. One that was wrong is reversed on the Folio and is then waived. A
booking that ends withdraws what was not charged, as the front desk that ended it, bounded
by a policy.

### Who may make and change a plan

Whoever may take the booking makes its plan (`front_desk.book`), in the same dialog and the
same transaction as the booking: it is the same act as registering the student. Revising it
needs `finance.post_charge`: a revision schedules charges to somebody's bill, and the front
desk holds no finance permission. Both are functions that check their caller, and
`ranza_app` can read the tables and write none of them, except the two columns a booking's
ending withdraws, which a policy bounds to the rows of a booking that has ended and to a Staff
Member who holds the permission of the command that ended it (`front_desk.cancel` or
`front_desk.check_out`) with the front desk available at the Property. Reach alone is not
enough: a first version of the policy asked for it and a Housekeeping member could withdraw a
Resident's schedule. Reads are by reach, as the Folio is.

### An instalment is accommodation revenue

The ledger posts a charge to Other Revenue unless it is a room night. An instalment is what
a Resident pays for the room, so it credits Accommodation Revenue, and its reversal debits
it. This changes `app.post_folio_line_to_ledger()` in two places.

## Alternatives rejected

- **A monthly rent on the booking.** One case of the need, and it leaves the senet yurt
  with a workaround. The general case costs one more column.
- **A paid flag on the instalment.** It would disagree with the Folio the first time a line
  was reversed. The Folio line is the record.
- **Postings that can be repeated safely by a check.** A check can be forgotten by the next
  writer; a unique index cannot.
- **Allocating each payment to an instalment.** The correct general case and a screen the
  desk would have to use on every payment. Oldest-first is what a yurt's desk does in its
  head, and it is deferred, not denied.
- **A new permission for plans.** Two already say what is meant: the booking's and the
  charge's. A third would have to be given to every role on every Organization.

## Consequences

- A Resident with a plan is charged what they agreed to, on the day, without anyone
  touching it, and nothing double-charges them: `room_nights_due` is a Guest's, and an
  instalment's line is unique.
- The Today lane reads `students overdue` and the rows behind it from the module; the
  Resident's portal reads the standing of their own booking.
- A Property whose billing is off has no plan: a plan nothing could charge is refused.
- The check-out of a Resident with instalments left withdraws them; a contract that
  continues past a departure is a revision made before it.
- Reversing a charged instalment needs finance and is the way to correct one.
- Two definers write (making and revising a plan), two are the worker's, and one is the
  shared definition of ready, granted to nobody. `app.post_folio_line_to_ledger()` is
  replaced, its grants unchanged.
