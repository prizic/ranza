# 0017. Cross-module facts travel through a transactional outbox

Status: Accepted
Date: 2026-09-16

## Context

Check-in already does four things in one transaction: it moves the Reservation,
opens the Stay, opens the Folio and records the actor. They share one fate
because a Stay with no audit record, or a Reservation marked arrived with nobody
in a room, is worse than the check-in not happening.

What comes next does not fit that. A Guest who checks in should get a
confirmation message (blueprint 5.12). A channel manager should hear that the
Unit is gone (5.14). Neither can be inside the transaction: an SMTP timeout
would roll back a check-in that physically happened, and a front desk would
watch a spinner while somebody else's server thought about it.

Publishing after the commit — send the message once the transaction returns — is
the obvious alternative and is wrong for a reason that only shows up in
production. The process can die between the commit and the send. The message is
then never sent, nothing records that it was owed, and the only evidence is a
Guest who did not get one. The same gap in the other direction is worse: publish
first, then commit, and a notification goes out for a check-in that rolled back.

There is no arrangement of two systems that makes those two writes atomic. There
is one arrangement that makes them the _same_ write.

## Decision

### The event is written in the business transaction, to a table

`public.outbox_events`, inserted by the same transaction that moved the
Reservation. Either both are there or neither is, because it is one commit. The
worker then reads the table and does the slow thing afterwards.

This is the transactional outbox pattern and it is chosen for the property, not
the name: the only thing that has to be atomic is "the fact happened" and "the
fact was recorded as needing delivery", and a row in the same database makes
that free.

### Delivery is at least once, and handlers are idempotent

Exactly-once delivery does not exist across a process boundary. Pretending
otherwise produces a system that is correct until the first crash between
"handler finished" and "marked delivered".

So: at least once, stated plainly, and every handler must be safe to run twice.
Two mechanisms, and both are needed.

`outbox_deliveries (consumer, event_id)` with that primary key is the cheap one.
A handler's transaction inserts its delivery row first; `on conflict do nothing`
returning no row means this consumer already ran and the transaction stops. Since
the delivery row and the handler's writes commit together, a crash mid-handler
rolls back both and the event is simply claimed again.

That table alone is not enough, because it only defends against redelivery of
the _same_ event. A handler must also be idempotent against being asked twice
through different routes — which is why a Folio charge posted by a job carries a
source key the database makes unique, rather than trusting that nobody will ever
replay an event by hand.

### A claim is a lease, not a lock held open

The dispatcher claims a batch in a short transaction with `for update skip
locked` and sets `claimed_until = now() + 2 minutes`. Two workers running at once
therefore claim disjoint batches without coordinating, and a worker that dies
holding a claim releases it by the lease expiring rather than by anybody noticing.

Holding the row lock for the duration of the handler was the alternative. It is
simpler and it is wrong at the first slow HTTP call: the transaction stays open,
the connection is pinned, and a pooled deployment runs out of connections while
appearing to be idle.

### One transaction per event, because Prisma has no savepoints

Prisma's interactive transactions cannot nest, so a batch cannot be one
transaction with a savepoint per event — one failure would roll back the batch
including the events that succeeded. Each event gets its own transaction. A
failure rolls back exactly that event's writes and its delivery row.

The retry bookkeeping is then written by a _separate_ statement, outside the
rolled-back transaction, or it would roll back with it and the failure would
leave no trace. Backoff is exponential on `attempts`; after the cap the event is
marked `dead_at` and logged at error level. A dead letter is not deleted —
nothing in this repository deletes history (blueprint 7.4).

### A handler reads state; it never trusts the payload or the order

Two rules that only look like the same rule.

**The payload is a pointer.** `ranza_app` may insert any event type with any
payload into an Organization it can reach — that is what the insert policy
allows, and narrowing it would mean the platform module interpreting event
types it is supposed to know nothing about. So a handler takes the ids out of a
payload and loads the facts itself, inside its own transaction, under that
Organization's context. A payload that says an amount is a claim; a row that
says it is a fact.

**Order is not guaranteed, and is not worth guaranteeing.** Delivery is
at-least-once with exponential backoff, so a failed event is retried after
another has already gone through. Concretely: `stay.checked_in` fails once,
`stay.check_in_reversed` is published and delivered, then the retry of the first
succeeds — and a handler that applied them in the order it received them would
finish having applied a check-in that was withdrawn.

The fix is not a sequence number, a per-key queue or a delay. It is that a
handler re-reads the current state and decides from that. "Send the arrival
confirmation" becomes "if this Stay is still in house, send it" — which is also
what makes a redelivery harmless, so it is the same discipline the delivery
table already requires rather than a second one.

An ordering guarantee is available if something ever genuinely needs it — claim
by `(organization_id, ordering_key)` and refuse to advance past a failure — and
it costs throughput and head-of-line blocking. Nothing needs it, and a handler
written to the rule above never will.

### Consumer names are stable forever

`folio.onStayCheckedOut`, never renamed. The delivery table is keyed on the name,
so renaming a consumer redelivers every event it ever handled. This is a
constraint on refactoring and it is accepted deliberately: the alternative is a
consumer id nobody can read in a dead-letter query.

### An event carries ids and facts, not entities

The payload says what happened and which rows it happened to. It does not carry a
Guest's name, contact details or anything a handler does not need, because an
outbox row is readable by the worker across every Organization
([ADR 0018](0018-the-worker-has-its-own-role-and-its-own-context.md)) and is
therefore the one place in the schema where a leak would not be bounded by
tenancy. A handler that needs more reads it under that Organization's context.

## Consequences

Any module may publish, and the outbox table lives in `packages/platform/` beside
audit, because "a fact that happened, for somebody else to react to" is not a
hospitality concept. Blueprint 9.8 forbids a platform module from even naming a
Property or a Folio, which `scripts/dependency-boundaries.mjs` enforces by
scanning source text — so the event type is a string the publisher chooses and the
platform module never interprets.

A reader of `outbox_events` can see that something happened and when, but not
what it was about beyond the ids. That is deliberate and it makes debugging
slightly harder than a fat payload would.

Ordering is per-event, not global. Events are claimed `order by occurred_at`, but
two workers processing disjoint batches can finish out of order. Nothing yet
needs a total order; something that does will need a decision, not a bigger
`limit`.

There is no Redis and no BullMQ. Adding one is
[ADR 0016](0016-a-long-running-process-is-a-worker-not-a-second-backend.md)'s
explicit non-decision and would need its own.
