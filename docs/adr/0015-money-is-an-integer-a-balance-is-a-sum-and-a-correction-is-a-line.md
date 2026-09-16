# 0015. Money is an integer, a balance is a sum, and a correction is a line

Status: Accepted
Date: 2026-09-16

## Context

The Folio is the first thing in this product that holds money. Nothing before
it had an amount, so four questions that had never been asked all had to be
answered at once, and every later module — Accounting, F&B, Analytics — will
inherit whatever this decided.

The repository already has a rule that covers part of it. Blueprint 7.4 and
AGENTS.md both say financial history is corrected by adding a record, never by
changing one. What they do not say is how an amount is represented, where the
total lives, or what makes a correction a correction rather than a second
number somebody typed.

## Decision

### An amount is a signed integer count of minor units

`amount_minor bigint`, and never a float. A balance that is the sum of its
lines must be exact, and binary floating point is not: the classic failure is
not dramatic, it is a ledger that is four kuruş out after nine hundred
postings and cannot be reconciled by anybody.

`numeric` would also be exact. Integer minor units were chosen over it because
they remove the question of scale entirely — there is no "how many decimal
places did we agree on" to get wrong per currency, and the wrong answer is a
type error rather than a silent rounding. How many minor units make a major one
is read from `Intl` at the moment of display and nowhere else.

A charge is positive and a reversal negative, so the balance is a plain `sum()`
with no case analysis. Signing the amount rather than carrying a separate
direction column means a new line type cannot forget to say which way it goes.

### Currency lives on the Property, and a Folio copies it

Not the Organization: an Organization may hold Properties in more than one
country, which is the same reason `timezone` is already on the Property rather
than above it. Not the Folio alone either, because then nothing would know what
currency to open one in and the caller would have to say — and a caller that
can name a currency can restate every amount on the account.

So `properties.currency` is the source, and `openFolioWithin` copies it with a
statement that reads the Property rather than trusting its argument. The Folio
keeps the copy: re-reading the Property later would silently restate history
the first time a Property changed currency.

The lines carry no currency at all. A line that could disagree with its Folio
would make the sum meaningless, and the cheapest way to prevent that is for
there to be nothing to disagree with.

### The balance is computed in the query that reads the lines

Not a stored column, not a view, not a function.

A stored total is a second source of truth, and the job of keeping it in step
is one nobody signed up for — it is correct until the first partial failure,
and after that it is wrong in a way that looks like the lines are wrong.

A view and a function were the real alternatives, and both were rejected for
the same reason. Each is a second place the definition of "balance" lives, with
its own grant and its own answer to whose policies apply to it. A `security
definer` function is actively worse: it would return a total over lines the
reader cannot see, and the screen would print that total above the rows they
can. Aggregating in the statement that selects the lines makes the two the same
query's answer, so they cannot tell different stories.

The cost is that every reader writes `sum(amount_minor)`. That is accepted
while there is one reader. A second one is when this becomes a
`security_invoker` view — which preserves the property that matters, that the
sum is over exactly the rows the policy let through.

### A correction is a line that cancels a line, proven by a trigger

`folio_lines` is append-only. A reversal references the line it corrects,
carries the negation of its amount, and the original stays exactly as posted.

Two things make `reversal` a fact rather than a label. The amount is computed
by the database as `-original.amount_minor` from the row being cancelled, so it
never travels through the application; and a `before insert` trigger refuses a
reversal that does not cancel its line exactly. Without the second, a line
could name a 4,000.00 charge and cancel 4.00 of it, and the balance would still
be the sum of the lines and still be wrong.

A partial correction is an adjustment, which is a separate blueprint 5.9
workflow and is not built. A line is reversible once, by a unique index.

### Immutability is stated three times, because two of them say nothing to a superuser

An absent `UPDATE`/`DELETE` policy, a revoked grant, and a trigger. The first
two bind `ranza_app`. Neither binds the role that runs migrations — locally a
superuser, on the hosted database a role with `BYPASSRLS` — and `FORCE ROW
LEVEL SECURITY` does not bind a superuser either.

This is not a hypothetical. `audit.records` was append-only in the repository,
in its test, and in every database built from scratch, and was rewritable in
production, because the trigger was added to a migration that had already been
applied (see `20260916000700_audit_append_only_trigger`). The same table is now
the worked example for the same mechanism on the same kind of data.

None of it survives a determined administrator, who can drop the trigger. That
is an operational control — restricted access, retained backups — and not
something a constraint can do. What it guarantees is that no ordinary
statement, from any role, quietly rewrites a financial record.

### A closed Folio is enforced by the same trigger, not by the write policy

Refusing a line on a closed Folio needs to read another row, which a check
constraint cannot do. It could have been a clause in the `WITH CHECK` of the
insert policy, and that would have been the shorter diff.

It is a trigger for the reason above: a policy would have made "a closed Folio
accepts no new lines" true of the application and not of the database. The
insert policy is left carrying exactly what ADR 0012 says it should — the four
gates of blueprint 3.5 — and nothing else.

## Consequences

`ranza_app` can now insert rows it can never change, which is new. Every
refusal on this path therefore arrives as an exception rather than as an empty
result, except closing a Folio, where the `UPDATE` policy's `USING` still
refuses quietly by matching nothing. `closeFolio` reads "no row returned" as a
refusal for that reason.

`properties` gained a column owned by a different module's migration. That has
a precedent — `20260916001000_check_in` added `stays.reservation_id` — and the
same rule applies: the table still belongs to `@ranza/core`, and its CHANGELOG
records the arrival.

Opening a Folio is gated on `finance` while checking in is gated on
`front_desk`. An Organization holding one Entitlement and not the other checks
Guests in and keeps no account for them, so `openFolioWithin` returns null
rather than raising. Coupling the two would have let an unbought billing module
break the front desk, which is the wrong direction for a commercial gate to
fail.

Accounting is blueprint 5.10 and is not this. When it arrives, an operational
module supplies approved posting events through `packages/adapters/` —
`packages/platform/` may not name a Folio at all (blueprint 9.8), which
`scripts/dependency-boundaries.mjs` enforces by scanning source text rather
than imports.

Nothing here records the movement of money. Blueprint 5.9 is explicit that a
payment record is a record and that external payment processing is a separately
entitled integration, so there is no payment line type, no provider and no
pending state. Adding one later is a decision, not a gap to be filled in
passing.
