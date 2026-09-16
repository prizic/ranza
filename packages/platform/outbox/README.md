# @ranza/platform-outbox

A fact that happened, for somebody else to react to. A reusable module: it
carries an event without being able to say what one means.

## Why a table

There is no arrangement of two systems that makes "the thing happened" and "the
message was sent" atomic. Publish after the commit and a crash in between loses
the message with nothing recording that it was owed. Publish before it, and a
rollback announces something that did not happen.

There is one arrangement that makes them the same write, which is this. The
event is inserted by the transaction that did the work, so either both are there
or neither is; the worker reads the table afterwards and does the slow part.
[ADR 0017](../../../docs/adr/0017-cross-module-facts-travel-through-a-transactional-outbox.md)
has the reasoning, including what was rejected.

## Contract

```ts
await publishWithin(tx, {
  organizationId, // opaque tenancy scope
  eventType: "order.placed", // dotted, lower case, at least two parts
  payload: { orderId }, // identifiers and facts
});
```

There is no `publish()` that opens its own transaction, deliberately: a
convenience like that would make the wrong thing the easy thing.

An event type and a payload are opaque here. This module never learns what one
means — that translation is a host adapter's job, which is what lets it serve a
product with an entirely different vocabulary.

## What a payload may carry

Identifiers and facts. Not names, not contact details, not anything a handler
does not need.

`outbox.events` is the one table in this schema a single process reads across
every scope ([ADR 0018](../../../docs/adr/0018-the-worker-has-its-own-role-and-its-own-context.md)),
which makes it the one place where a leak would not be bounded by tenancy. A
handler that needs more reads it under that scope's own context.

## What holds

|                                                               | Stops                                             |
| ------------------------------------------------------------- | ------------------------------------------------- |
| No `SELECT` policy and no select grant for `ranza_app`        | a request reading the queue it publishes into     |
| `INSERT` policy scoped to `app.accessible_organization_ids()` | publishing into a scope the actor cannot reach    |
| Column-level `UPDATE` grant, six dispatch columns             | the worker rewriting a payload or moving an event |
| `primary key (consumer, event_id)` on deliveries              | a redelivered event running its handler twice     |
| No `DELETE` grant or policy anywhere                          | a dead letter being tidied away                   |

Asserted rather than reasoned about: `tests/database/platform_outbox.test.sql`,
run with `pnpm db:test`. Every assertion there was checked by breaking the thing
it asserts and watching it go red.

## Where the SQL lives

`prisma/migrations/20260916001400_platform_outbox`. A module owns a PostgreSQL
schema, not its own migration history
([ADR 0008](../../../docs/adr/0008-a-module-owns-a-schema-not-a-migration-history.md)) —
so the schema, its policies and its grants are one file there, authored with this
module and reviewed in the same diff.
