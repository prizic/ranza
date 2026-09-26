# 0022. A mistaken check-in is reversed, not deleted

Status: Accepted
Date: 2026-09-16
Amended: 2026-09-16 — the index this decision rests on was total, not partial,
so the mechanism described below did not work. Corrected in place below; the
decision itself is unchanged.
Amended: 2026-09-16 — withdrawing a check-in now closes the Folio it opened,
and a backfill closes the ones earlier withdrawals left behind.
Amended: 2026-09-17 — the Operator Workspace offers it, and the arrivals list
gained a second way onto it so that a late arrival's check-in can be reached.
Amended: 2026-09-24 — a check-in whose business day has been closed cannot be
withdrawn either: it would put an unarrived booking back into a finalized day
([ADR 0034](0034-a-business-day-closes-after-its-cutoff.md)).
`stays_keep_closed_days` refuses it with `RZ001`, and the desk is told so by
`CheckInDayClosedError`, apart from the charges refusal.

## Context

`checked_in` is terminal. A Reservation that has become a Stay has no way back,
and `packages/ranza/reservations/src/contracts.ts` says so rather than leaving it
to be discovered.

That is fine as a statement of what is built and untenable as a product. A front
desk checks in the wrong Guest — two people arriving together, two rows one line
apart in the list — and the Unit is now held by somebody who is not in it, the
right Guest cannot be checked into it, and nothing can undo either.

Three shapes were considered and two are wrong for reasons the repository has
already settled.

**Delete the Stay and put the Reservation back.** Never. Blueprint 7.4 and
AGENTS.md both forbid removing operational history, and a check-in that happened
and was undone is exactly the history somebody will need to explain later.

**Edit the Stay back to `reserved`.** This is the shape that looks harmless and
is not. A Stay that was `in_house` and is now `reserved` is indistinguishable
from one that was never checked in — the mistake becomes unobservable, and the
audit trail is the only evidence it happened, which makes the tables and the
trail disagree.

## Decision

### The Stay is cancelled and the Reservation is confirmed again

`stays.status` moves `in_house → cancelled`, which the check constraint already
allows and which frees the Unit, because `stays_no_double_booking` is partial on
status. The Stay keeps its dates and its `reservation_id`; it stays in the table
as the record of a check-in that was made and withdrawn.

`reservations.status` moves `checked_in → confirmed`, so the Reservation is
arrivable again and reappears on the arrivals list where somebody will deal with
it properly.

The second check-in creates a _second_ Stay row, and the first one — cancelled —
is still there. That is the property that makes this a reversal rather than an
edit: the count of Stays against a Reservation is the count of times somebody
checked it in.

It did not, when this was written. The unique index on
`(reservation_id, property_id, organization_id)` was total, so the cancelled Stay
went on holding the Reservation and the second check-in was refused by the
database with `duplicate key value violates unique constraint` — this ADR
described a door that its own schema had bolted shut (issue #34). The index is
now partial, `where status <> 'cancelled'`, which is what makes the paragraph
above true: at most one Stay per Reservation is not cancelled, and the withdrawn
ones accumulate as the record of how many times somebody checked it in.

The lesson is worth more than the fix. This decision named the index it relied on
and still read as sound, because nobody asked the index what it actually said.
A pgTAP assertion now pins the predicate rather than the behaviour, so a
migration that makes it total again fails the suite instead of quietly restoring
the one-way door.

### The Folio it opened is closed with it

A check-in opens a Folio; withdrawing one closes it, in the same transaction as
everything else here. Not `closeFolio`, which opens its own transaction and so
could not see a withdrawal that has not committed — `closeEmptyFolioWithin(tx)`,
which shares the fate of the writes around it. `Empty` is in the name because it
takes no per-Stay lock and checks no balance — check-out needs one that does
both, and this is not it.

Left open it was never a way to lose money: `folio_lines_postable` refuses a
line on a cancelled Stay, so nothing could ever be posted. It was a row on the
Finance screen for a Guest who was never there, that nobody could act on and
nobody could close. Once a withdrawn Reservation could be checked in again, one
Reservation showed two of them.

The statement requires the Stay to be `cancelled`, which is what makes closing
it without reading its lines safe: `stays_withdrawal_is_free_of_charges` refuses
to cancel a Stay carrying charges, so a Folio reached through a cancelled Stay is
provably empty. A condition rather than a comment, so changing the withdrawal
rule breaks this loudly.

Check-ins withdrawn before this was true left their Folios open, and
`20260916001900_close_ghost_folios` closes them. It refuses rather than close
any that carry a line: money on a withdrawn Stay is a credit or a refund, and a
backfill does not get to decide which. That state should be unreachable, which
is exactly why a migration running against older databases does not assume it.

### A reason is required, and it is recorded

`reverseCheckIn` takes one and refuses without it. Blueprint 4.4 makes the caller
decide which actions require a reason, and withdrawing a record of somebody's
arrival is one. The audit record carries it, in the same transaction, like every
other write on this path.

### It is only available while it is still a mistake

The window closes the moment money exists. If anything has been posted to the
Stay's Folio, the check-in is no longer a slip to withdraw — it is a stay that
happened and needs a credit, an adjustment or a refund, each of which is a
blueprint 5.9 workflow with its own rules.

This is enforced by a trigger on `stays`, not by a check in the module, for the
reason `20260916001200_folios` gives for its own: a policy binds `ranza_app` and
says nothing to the role that runs migrations, and this is a claim about money.

The trigger is `security definer`, which the others on this path are not, and the
reason is a dependency rather than a fact about today.

`folio_lines_read_accessible_property` is reach-based: a Staff Member who can
reach the Property sees its lines whether or not they hold `finance`, because the
capability gate for a read lives in the query around it rather than in the policy
(ADR 0012). A `security invoker` check therefore works right now — and stops
working the moment that policy is narrowed, which a Portal read or a
finance-scoped one plausibly would. It would then find no rows, conclude nothing
had been charged, and allow the withdrawal silently, with no test failing,
because the tests run as somebody who can still see.

Established by experiment rather than by argument: the first version of this was
`security invoker` with exactly the reasoning above stated backwards, and it
passed. Narrowing the read policy to `app.can_use_capability(..., 'finance')` is
what showed the invoker version letting a charged Stay through while the definer
version refused.

It returns whether, never what: no row and no amount crosses the boundary.

### A cancelled Stay's Folio accepts nothing further

The same migration extends `folio_line_is_postable()`: a line may not be posted
to a Folio whose Stay is cancelled. Without it the reversal leaves an open Folio
attached to a Stay that did not happen, and it would still accept charges.

This is an invariant rather than a closure rule, which is the distinction ADR
0015 drew when it declined to invent folio closure: "a Folio whose Stay was
withdrawn accepts nothing" says what is representable, not when a Folio should
be closed or by whom.

### The two checks are made to see each other

The rule above and "a cancelled Stay's Folio accepts nothing" guard one
invariant from opposite sides, and each was written as an independent check.
Under READ COMMITTED that is not enough, and the gap is not subtle once seen:

```
A: insert folio_line   -- the Stay is not cancelled yet
B: cancel the Stay     -- there are no lines yet
B: commit
A: commit              -- a withdrawn Stay, carrying money
```

Neither transaction can see the other's uncommitted work, so both checks pass.
This is write skew, and it was reproduced on two connections before being
fixed — every assertion in `tests/database` passed while it was live, because
each of them runs one transaction at a time.

Both triggers now take the same transaction-scoped advisory lock, keyed on the
Stay, _before_ checking. Whichever arrives second waits for the first to commit
and then re-reads, so it sees the committed result and refuses.

An advisory lock rather than `select ... for update` on the Folio, because a row
lock requires UPDATE privilege on the table being locked and `ranza_app` holds
none on `folios` beyond the three columns the closure grant names — the lock
would have failed for exactly the role it most needs to bind.

`hashtext` narrows a uuid to an integer, so two Stays can share a lock. The cost
is that two unrelated withdrawals serialise briefly. It is never a wrong answer,
which is the only property this needs.

`SERIALIZABLE` was the alternative and was rejected: it would have to be set for
every transaction that touches either table, it turns a correctness bug into
retries the application must handle, and it makes an unrelated read on a busy
Folio a source of serialisation failures.

## Consequences

`ranza_app`'s `UPDATE` grant on `reservations` is narrowed to `(status,
updated_at)` in the same migration. It was every column, which meant the policy
that lets a Staff Member check a Reservation in equally let them rewrite its
dates, its Unit or its Organization by a statement that never mentions a
check-in. That is the hole the same migration closed on `stays` and `folios`
before it; `reservations` predates the rule and was missed.

`stays` needs no new grant: `(status, ends_on, updated_at)` already covers it,
which is the column-level grant doing what it was for.

`stay.check_in_reversed` is published, in the same transaction, like the
`stay.checked_in` it undoes. Nothing consumes either yet, so the dispatcher
marks each delivered and moves on — but the alternative was a queue where the
arrival is a fact and its withdrawal is not, and the first consumer of
`stay.checked_in` would then act on an arrival that had been taken back without
anything telling it. Publishing the correction is cheaper than remembering to
add it later.

### The arrivals list is where it is offered, and a Stay is a second way onto it

A screen offers this now: a row that is checked in carries the status badge it
always did and, beside it, a control that opens a dialog asking for the reason
this decision already required. Not a menu — a row still has one thing to do —
and not a confirmation without a field, which would be a speed bump rather than
the record blueprint 4.4 asks for. The dialog is the interface decision ADR 0013
holds, taken now rather than bolted onto the table.

Offering it needed the list to change, and the reason is worth keeping. The
arrivals list was built from the Reservation's planned dates, so a late arrival
— somebody due yesterday, checked in this morning — left the list the moment
they arrived: every clause that kept them on it required them not to be
`checked_in`. A mistake made at 09:00 was unreachable at 09:01, on the one
screen that exists to reach it. So a Stay that began today is a second way onto
the list, whatever the Reservation planned, and `Arrival` carries the Stay it
belongs to — because this decision withdraws a Stay and a row that names only a
Reservation cannot ask for one.

The window is still the Property's day. A check-in noticed tomorrow is not on
this screen and is not meant to be; the Reservation timeline (blueprint 18.6) is
where a Stay is reached after the day it began, and it is not built.
