# 0022. A mistaken check-in is reversed, not deleted

Status: Accepted
Date: 2026-09-16

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

The Reservation cannot be checked in twice into the same Stay: the unique index
on `(reservation_id, property_id, organization_id)` means the second check-in
creates a _second_ Stay row, and the first one — cancelled — is still there. That
is the property that makes this a reversal rather than an edit: the count of
Stays against a Reservation is the count of times somebody checked it in.

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

No screen offers this yet. It is reachable through the module, deliberately: a
front desk needs a confirmation step and a reason field, and that is an interface
decision (ADR 0013) rather than something to bolt onto the arrivals table.
