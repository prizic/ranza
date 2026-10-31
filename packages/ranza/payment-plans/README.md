# @ranza/payment-plans

A Resident pays by instalments: a schedule of N payments, each an amount and a
due date, against their booking for a term, charged to their Folio by the worker
on each due date, and chased when it is late (RANZ-96).
[ADR 0059](../../../docs/adr/0059-a-resident-pays-by-instalments-the-worker-charges-on-their-due-dates.md)
says why; [`docs/features/payment-plans/`](../../../docs/features/payment-plans/edge-cases.csv)
says what it owes.

## What this module owns

`payment_plans` and `plan_instalments`, their constraints, triggers, grants and
policies, and the functions that write them — in
[`20260916013810_a_resident_pays_by_instalments`](../../../prisma/migrations/20260916013810_a_resident_pays_by_instalments/migration.sql).
Who may make a plan and who may revise it, that it belongs to a Resident with a
departure date, that an instalment falls due within the term and is charged
once, that a charged one is history, and what overdue means, are the database's.
This module checks the shape a form can get wrong, asks for the writes, words
the refusals, and records who did it.

## Contract

```ts
const plans = createPaymentPlansModule({ db }); // db: the ranza_app client (ADR 0006)

await plans.createPaymentPlan(userId, reservationId, [
  { amountMinor: 120_000, dueOn: "2026-11-01" },
]); // or createPaymentPlanWithin(tx, ...) to make it in the booking's own transaction
await plans.revisePaymentPlan(userId, reservationId, instalments, reason);
await plans.readPaymentPlan(userId, reservationId); // the schedule with where each stands, or null
await plans.planOffer(userId, propertyId); // { currency } when the viewer may be offered a plan here, else null
await plans.overdueFigure(userId, propertyId); // { students, instalments, overdueMinor, currency }
await plans.overdueResidents(userId, propertyId); // the rows that figure counts

const poster = createInstalmentPoster({ db }); // db: the ranza_worker client (ADR 0018)
await poster.postDueInstalments(); // { due, posted, waiting, failures }
```

An instalment is `waived`, `paid`, `overdue`, `due` or `upcoming`, decided once
in `app.payment_plan_standing()`: overdue is past its due date, in the
Property's own time, and not paid in full. It does not wait for the worker.
`overdueFigure` and `overdueResidents` read the same definition, so Today's
number and the rows it opens cannot disagree.

A plan made with a booking is made in the booking's own transaction:
`reservations.createReservation(userId, booking, alongside)` runs `alongside`
before it commits, and a host that passes `createPaymentPlanWithin` there gets
one act, so a plan the database refuses leaves no booking behind (PP-S2-05).
Neither module imports the other.

A revision withdraws what was not charged and writes a new schedule beside it;
nothing is deleted, and a charged instalment is history for every writer.

## Rules

- Only `index.ts` is importable.
- It receives its clients and never constructs one, and never reads
  `process.env`
  ([ADR 0006](../../../docs/adr/0006-modules-take-dependencies-by-injection.md)).
- Two clients for two callers, never one for both: the module is `ranza_app`,
  the poster is `ranza_worker`, which holds nothing on either table.
- A Property's failure in a pass is recorded and the pass goes on to the next.
- Nothing here reads the Property's operating model: a plan is a rule on the
  booking, and no SQL knows the model
  ([ADR 0057](../../../docs/adr/0057-a-propertys-operating-model-sets-its-defaults-and-its-words-never-its-rules.md)).
