# 0034. A business day closes after its cutoff, and a close is never rewritten

Status: Accepted
Date: 2026-09-24

## Context

A Property's business date rolls at its cutoff, by the clock
([ADR 0021](0021-a-business-date-is-the-day-a-property-is-working.md), applied in
`20260916003500`). Blueprint 6.4 asks for more than a date that rolls: a day is
_closed_ — what was left open is resolved or recorded, the close is auditable,
repeatable where safe and protected from duplicate posting — and blueprint 18.2
asks that a finalized day freeze its operational snapshot.

ADR 0021 already says the night audit "rolls the day this defines rather than
defining one of its own". That leaves the question it did not have to answer: a
front desk working the night shift at 02:00 with a 04:00 cutoff is still working
Tuesday. If it closes Tuesday then, what are the two hours until the clock rolls?

Three answers were weighed.

- **Today is the day after the last close** — `greatest(clock, last close + 1)`.
  It brings back the defect ADR 0021 was applied to fix: close at 00:15 and a
  Guest landing at 00:30 for last evening's one-night booking fails
  `ends_on > today` again. It also makes the product's one definition of today
  depend on a table that a click can move.
- **A closed day refuses writes.** It locks the desk out of the day it is still
  working until the cutoff, which can be as late as noon.
- **A day closes only after its cutoff.** The clock alone decides what today is.
  A close finalizes a day the clock has already ended.

Nothing in the product can charge for a night yet — there is no rate
(RANZ-31) — so the third step of the mockup's night audit, posting tonight's room
nights, is designed here and not built (`docs/features/close-the-day`, PRE-01).

## Decision

### A day closes only once the clock has ended it

`closeDay(property, D)` is refused while `D >= app.property_today(property)`.
The Close the day screen is a preparation view during the night shift: it lists
what is open so the desk can clear it, and says when the day can be closed.
`app.property_today()` is never moved by a close, so everything that already
reads it — arrivals, departures, check-in, the no-show rule — is unchanged.

That freezes the snapshot by construction. Every date the front desk writes is
`app.property_today()` or later: a check-in's arrival, a check-out's departure,
and a booking's first night. So a day before today receives no new dated write
except in two ways, and each is closed by a trigger:

- **A cutoff or time zone change** that would move today back onto a closed day
  is refused (`properties_keep_today_after_the_last_close`).
- **Withdrawing a check-in** dated on a closed day is refused
  (`stays_withdrawal_keeps_closed_days`): it would put an unarrived booking back
  into a day that is finalized.

### The close is one append-only row, stamped by the database

`public.business_day_closes` holds one row per Property and business date,
unique on the pair. The unique key is both the claim and the idempotency key: a
Staff Member and the worker closing the same day at the same moment make one
row, and the loser is told the day is already closed.

The closer supplies four columns — the Organization, the Property, the day and a
reason — by a column-level grant. Everything else is the database's. A
`security definer` trigger, `app.business_day_close_is_stamped()`, runs before
the insert and

1. checks its caller: a Staff Member must reach the Property with the front desk
   capability, and the worker must be in that Organization's context — so a
   Property in another Organization is refused before anything about it is read;
2. takes the Property's advisory lock, namespace 3 (1 is the Stay, 2 the Unit);
3. refuses a day that has not ended, and a day whose previous day is not
   closed — the first close at a Property is the day before today;
4. names the closer: the Staff Member, or the worker's job;
5. computes the snapshot — arrivals, departures, nights occupied, departed Guests
   whose Folio is still open — and the items left open.

It is a definer so the snapshot is the Property's and not the closer's: a
Folio the closer's policies no longer admit is still counted. Both paths end in
this one insert, so a manual close and an automatic one cannot record different
things.

Items left open are bookings whose first night was the day or earlier and which
are still `requested` or `confirmed`, and Guests in house whose departure was the
day or earlier. A close with any of them needs a reason, and records each of
them as an exception (`business_day_closes_exceptions_need_a_reason`). A
departed Guest whose Folio is still open is counted and never blocks, because
nothing in the product can take a payment yet (ADR 0030).

The row is append-only for every role, the owner included, by a statement
trigger, for the reasons ADR 0015 gives about `folio_lines`.

### Days close in order

A day waits for the day before it, so a stuck day holds back the days after it
and the screen names the backlog, oldest first. Nothing is skipped silently
(blueprint 6.4.4).

### States that are derived are not stored

Blueprint 18.2 names draft, finalized, corrected, reopened and superseded. Only
finalized is stored — a row exists. _Draft_ is "the cutoff has passed and there
is no row"; _superseded_ is "a later revision exists". A stored draft on an
append-only row could never leave that state. Reopening and correcting are
designed and deferred (CD-DEF-02, CD-DEF-03): each will write a revision beside
the close, never change it, and the unique key will gain the revision then.

### The worker closes a quiet day, and only a quiet one

`apps/worker` passes every 60 seconds. It asks one read-only definer,
`app.properties_due_for_close()`, for each Property's next due day, and closes it
through `app.close_business_day_automatically()`, which closes only when nothing
is open. That is the second cross-Organization read
[ADR 0018](0018-the-worker-has-its-own-role-and-its-own-context.md) is amended to
name. The job is named on the row; `audit.records` requires a person, so an
automatic close is not in the audit log (CD-DEF-05).

### Decisions delegated by the user, 2026-09-24

The grill's answers were given by the user as delegated decisions. Each can be
overturned, and each is a row in `docs/features/close-the-day/edge-cases.csv`.

1. A day closes only after its cutoff.
2. A close with items open needs a reason, and the items are recorded as
   exceptions.
3. The worker closes a day only when nothing is open,
4. and tries again every pass after the cutoff.
5. Days close in order; the first close is the day before today; the backlog is
   visible.
6. A `requested` booking whose night has come counts as open.
7. A departed Guest's open Folio is reported, never blocking.
8. `front_desk.close_day` is held by the owner, manager and front desk roles;
   reopening is designed as deferred rows.
9. The snapshot holds counts, no money.
10. Extending a Stay by a night is deferred to amending a booking.
11. The screen says nothing about Accounting, and never that a close cannot be
    undone.

## Consequences

The automatic close is rare until the desk has a way to extend a Stay: a Guest
staying past their departure is an open item, and only checking them out or a
Staff Member's reason clears it. The backlog makes that visible rather than
silent.

Room nights (s3) will make "tonight is posted" a precondition of the close and
give the snapshot totals. They need a rate, a business date on `folio_lines` and
a unique source key on a line (PRE-01, PRE-02). A charge dated by the business
date is what makes a close meaningful to Accounting; until then
`business_day.closed` is published and nothing consumes it (CD-DEF-04).

Changing a Property's cutoff is still SQL, and now refuses the one change that
would rewrite history.
