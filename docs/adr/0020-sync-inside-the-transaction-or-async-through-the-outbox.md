# 0020. Sync inside the transaction, or async through the outbox

Status: Accepted
Date: 2026-09-16

## Context

A worker exists now
([ADR 0016](0016-a-long-running-process-is-a-worker-not-a-second-backend.md)) and
so does an outbox
([ADR 0017](0017-cross-module-facts-travel-through-a-transactional-outbox.md)).
Both are new, and new machinery attracts work that does not belong in it.

The pull is real and it is not stupid. Check-in already does four writes in one
transaction and each one added makes it longer. Moving one of them to an event
makes the check-in faster, makes the transaction smaller, and looks like good
decoupling.

It is also how an invariant becomes eventual. If opening the Folio moved out of
the check-in transaction, there would be a window — short, and long enough — in
which a Guest is in house with no account to charge. Every reader would need to
handle "a Stay whose Folio has not arrived yet", and the first one that forgot
would be a bug nobody could reproduce.

This decides which of the two a new reaction is, so that it is answered once
rather than per feature by whoever is writing it.

## Decision

### The question is whether the two facts may ever disagree

**Inside the transaction** when a state where only one of them is true is a state
nothing should be able to observe. The reaction is then not a reaction at all —
it is part of what happened, and it goes through a `...Within(tx, ...)` function
owned by the module that owns the table.

**Through the outbox** when the reaction may lag, may retry, and may fail
repeatedly without making the original wrong.

Two tests, and a candidate must pass both to be an event:

1. _Is there a window?_ Write out the sentence "for a few seconds, X happened but
   Y has not". If that sentence describes a broken system rather than a slow one,
   it is not an event.
2. _What does the tenth failure do?_ If a handler that fails ten times leaves the
   database in a state a person has to repair by hand, it belongs in the
   transaction. If it leaves a message unsent, it is an event.

### What this classifies today

| Reaction                                 | Where                                          | Why                                                                                            |
| ---------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| The audit record for an action           | transaction                                    | An action with no record is the thing blueprint 7.4 exists to prevent. Already `recordWithin`. |
| Opening the Folio at check-in            | transaction                                    | A Stay with no Folio is a Guest who cannot be charged. Already `openFolioWithin`.              |
| Moving the Reservation, opening the Stay | transaction                                    | One of them without the other is a room with two truths in it.                                 |
| Confirmation and departure notifications | outbox                                         | Late is fine. Unsent is visible and recoverable.                                               |
| Channel and integration updates (5.14)   | outbox                                         | Somebody else's server, somebody else's latency.                                               |
| Analytics and reporting projections      | outbox                                         | Nothing operational depends on the second they arrive.                                         |
| Posting the nightly room charge          | outbox, and it is a job rather than a reaction | Nothing happened that it is reacting to; a date arrived.                                       |

### The rule that is easy to get wrong

A slow transaction is a performance problem. Solve it by making the transaction
faster, not by making it incomplete. "The check-in takes 40ms and one of those is
the Folio" is not an argument for an event; it is an argument for an index.

The converse also holds. A reaction that was correctly made an event does not
become a candidate for the transaction because a test was awkward to write.

### An event is published in the transaction, always

Whichever side a reaction falls on, the _publishing_ of the event is a write in
the business transaction and never after it. That is the entire point of the
outbox and is not restated per feature.

## Consequences

The first handler will be a notification-shaped one, because that is what the
table above puts unambiguously on the async side. Nothing currently in the
product moves out of a transaction as a result of this decision — the worker
arrives with no existing behaviour changed, which is deliberate: a migration of
working synchronous code into a new asynchronous mechanism is how the mechanism
gets blamed for the bugs.

Folio charges posted by a job carry a unique source key, so that at-least-once
delivery cannot produce a second charge. That is ADR 0017's idempotency
requirement landing on a specific table, and it is why "make it an event" is not
free even when the answer is yes.

When a future reaction is genuinely ambiguous, the answer is to write the two
sentences in the tests above into the pull request and let them be read. An
ambiguity resolved in prose is cheaper than one resolved in production.
