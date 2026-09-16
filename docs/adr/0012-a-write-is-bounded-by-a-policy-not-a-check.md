# 0012. A write is bounded by a policy, not by a check

Status: Accepted
Date: 2026-09-16

## Context

Until check-in, every tenant-owned table was `SELECT` only for `ranza_app`. The
one exception was `audit.records`, which the runtime role may insert into, and
whose policy was written alongside it without anything generalising from it.

Reservations and check-in change that. `ranza_app` now needs `INSERT` on
`reservations` and `stays`, and `UPDATE` on `reservations`. Every module after
this one will need the same thing, and will copy whatever this does.

Three facts make the obvious approach wrong.

**A read policy does nothing for a write.** PostgreSQL applies a `SELECT` policy
to the rows a statement returns. It is never consulted for the row an `INSERT`
proposes. `stays` carried two `SELECT` policies and `FORCE ROW LEVEL SECURITY`,
and would have accepted an insert of any row at all the moment a grant arrived —
the table looked protected and the protection was the wrong shape.

**Reach is not the same question as entitlement.** The read path evaluates
blueprint 3.5's commercial gates in the query around the policy:
`@ranza/core` and `@ranza/stays` both call a gate function inside their
`SELECT`. A write has no such query. If a write policy checked only
`app.accessible_property_ids()`, a Staff Member in an Organization whose
Subscription had lapsed could still create Reservations — gates 1-3 would govern
reading them and not making them. That is a commercial hole that looks like a
security one only after somebody notices the invoice.

**An application check is not a boundary.** Blueprint 7.1 makes row-level
security the authorization boundary rather than a backstop. A `if (!canWrite)
throw` in a module is skippable by the next caller, and this repository has
already shipped three security tests that were verifying nothing.

## Decision

### Every writable table gets its own policy per command

`INSERT`, `UPDATE` and `DELETE` are written separately and never inferred from a
`SELECT` policy. A command with no policy is denied under `FORCE ROW LEVEL
SECURITY`, and that absence is the decision: there is no `UPDATE` or `DELETE`
policy on `stays` because check-out does not exist yet, and no `DELETE` policy
anywhere because operational history is corrected by adding a record rather than
removing one (blueprint 7.4). The revoked grant says the same thing a second
way.

### The `WITH CHECK` carries all four gates, not just reach

A write policy's condition is `app.can_use_capability(property_id, <module>,
<capability>)` — Subscription, Entitlement, Property capability and Staff reach
together — rather than `app.accessible_property_ids()` alone.

This puts a capability key inside a policy, which is new. The policy lives in
the migration owned by the module that owns the table, so a module is naming its
own capability; and changing the key in TypeScript without changing the policy
stops writes working, which is the safe direction to fail.

### `UPDATE` states both halves, and each is tested in isolation

`USING` decides which existing rows a statement may touch. `WITH CHECK` decides
what a row may become. Both are written — and what each actually contributes
turned out to be narrower than the textbook description, which is worth
recording because the next module will copy this shape.

`USING` is what applies gates 1-3 to the row being changed, and it refuses
_quietly_: the statement matches no rows rather than raising. A lapsed
Subscription therefore makes an update silently do nothing, so a caller must
treat "no row returned" as a refusal rather than as success.

`WITH CHECK` overlaps more than expected, because PostgreSQL applies the
`SELECT` policy to the new row on an `UPDATE` as well — reach is covered twice.
What is left to `WITH CHECK` alone is gate 3 against the _destination_: moving a
Reservation to another Property in the same Organization that has not enabled
the front desk is refused by that clause and by nothing else.

That was found by removing each clause and watching which assertion went red,
and it changed the suite: the first two assertions written for these clauses
passed with the clause deleted, which means they were evidence of nothing. The
rule this repository already has for security tests — break the boundary and
confirm the test fails — applies to each clause of a policy, not to the policy
as a whole.

### Values written come from rows the database returned

`checkIn` builds the Stay from the columns the `UPDATE ... RETURNING` gave back,
never from its caller. Composite foreign keys then prove what would otherwise be
an application promise: the Stay is in the same Property and Organization as the
Reservation, on a Unit in that Property. A caller supplying a valid-looking
`organization_id` is refused by a foreign key before a policy is consulted.

### A multi-write command is one transaction, and the audit record is inside it

Check-in creates a Stay, moves the Reservation and records the action. Two
transactions can half-succeed, and each half is worse than nothing: an action
nobody recorded, or a record of an action that never happened. So
`packages/platform/audit` gained `recordWithin(tx, entry)` — the same validation
and the same statement as `record()`, joining a transaction the caller already
owns instead of opening its own.

### Availability is a constraint, not a query

Two current Stays must not overlap on one Accommodation Unit. That is enforced
by `stays_no_double_booking`, a partial exclusion constraint over `btree_gist`
and a half-open `daterange`, so a losing concurrent check-in fails on a
constraint rather than on a comparison the application made before somebody else
committed. Checking availability before inserting is a race with a window; this
has none.

`btree_gist` is available in the local docker image and already installed on the
hosted database, in its `extensions` schema. `create extension if not exists`
matches on the extension name rather than the schema, so the migration is a
no-op there rather than a second installation.

Reservations get no such constraint. Whether two Reservations may overlap on one
Unit is an overbooking policy, and blueprint section 13 forbids building the rule
before the workflow that needs it.

## Consequences

`ranza_app` now holds `INSERT` and `UPDATE` on tenant-owned tables, so the
consequence of ever pointing `DATABASE_URL` at a privileged role changed from
reading another Organization's rows to writing them. The composition root
already refuses the migration connection; that guard is now load-bearing in a
second direction.

A Guest or Resident reaches the database through the same role and the same
connection as Staff. Nothing in this decision grants them anything, and nothing
revokes anything either — what denies them is that every write condition here
resolves through `app.accessible_property_ids()`, which needs an
organization_membership a Resident does not have (ADR 0009). That is an absence,
and absences are the kind of guarantee that quietly stops being true, so it is
asserted directly in `tests/database/reservations_and_check_in.test.sql` rather
than left as reasoning.

A capability key now appears in two places — a TypeScript constant and a policy
— with no mechanism keeping them in step beyond the writes failing. That is
accepted here because the failure is loud and safe. If a third place appears, it
needs a generated one instead.

This decision says nothing about how a module reports a refused write. The
convention `@ranza/reservations` sets — one error type for every reason a write
was refused, so a denial cannot be told from a non-existent row — is a contract
choice, not an architectural one, and a later module may need a different shape.
