# @ranza/worker

Everything the product does that is not inside a request.

Today that is two things: draining `outbox.events`, and closing each Property's
business day once its cutoff has passed and nothing is left open (ADR 0034).
Retention and notification delivery will land here too, and the rules below are
what stop that turning into a second backend.

## Running it

```sh
pnpm --filter @ranza/worker build
pnpm --filter @ranza/worker start
```

It needs `WORKER_DATABASE_URL`, and refuses to start without it. It also refuses
to start when that URL is `DIRECT_URL` or `DATABASE_URL`, and when the role it
actually connected as turns out to be a superuser, to carry `BYPASSRLS`, or to
own — or be a member of the role that owns — a table in `public`. A connection
string cannot express any of that, so it is asked of `pg_roles` at boot rather
than trusted.

That check is not paranoia about configuration. A privileged connection does not
fail; it works, with every policy silently not applying, which is a failure this
repository has already had in production once and could not see.

## The rules

|                |                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------- |
| Bootstrap      | `NestFactory.createApplicationContext`. Never `create`, no controllers, no port              |
| Business rules | In `packages/ranza/*` and `packages/platform/*`. A handler maps one event to one module call |
| Authorization  | Row-level security. No `@UseGuards`, ever                                                    |
| Identity       | `app.set_worker_context()`. The worker is granted no execute on `app.set_request_context()`  |
| Connections    | `composition.ts` only — enforced, with a fixture that proves the rule fires                  |
| `@nestjs/*`    | `apps/worker/src/` only — likewise                                                           |

[ADR 0016](../../docs/adr/0016-a-long-running-process-is-a-worker-not-a-second-backend.md)
says why not listening is the only durable version of "this is not a second
backend", and
[ADR 0018](../../docs/adr/0018-the-worker-has-its-own-role-and-its-own-context.md)
says why the worker has no identity to impersonate.

## Layout

```text
src/
  main.ts                 the standalone context, and shutdown hooks
  worker.module.ts        scheduling, and the job modules
  composition.ts          the only file that reads env or opens a connection
  composition.module.ts   provides the composition once, to every job module
  tokens.ts               the composition's injection token
  business-day/
    business-day.module.ts   wiring
    business-day.closer.ts   when to close due days: every minute. Not how:
                             that is @ranza/business-day and two functions
    tokens.ts                injection token
  outbox/
    outbox.module.ts      wiring — every provider returns something already built
    outbox.dispatcher.ts  when to run. Not how: that is @ranza/platform-outbox
    subscriptions.ts      event type to handler. Empty, deliberately
    tokens.ts             injection tokens
```

`subscriptions.ts` being empty is the point of the first landing. The lease, the
idempotency and the retry schedule are worth proving on their own; a handler in
the same change would be the thing everyone read, and the machinery underneath
it would be taken on trust.

## Adding a job

1. Decide it is actually asynchronous —
   [ADR 0020](../../docs/adr/0020-sync-inside-the-transaction-or-async-through-the-outbox.md)
   has the two questions. A slow transaction is a performance problem, not an
   argument for an event.
2. Publish with `publishWithin(tx, …)` in the transaction that produced the fact.
3. Add a subscription whose `handle` calls one module `...Within(tx, …)`
   function. Name the consumer once and never rename it: `outbox.deliveries` is
   keyed on that name.
4. Grant `ranza_worker` exactly the tables and columns that handler writes, with
   its own policy scoped `to ranza_worker` carrying the commercial gates. The
   default for the worker on a new table is nothing at all, which is the friction
   that makes step 4 deliberate.
5. Make the handler idempotent beyond the delivery table. Delivery is at least
   once; a charge posted by a job needs a unique source key, not an assumption.

## Shutdown

`SIGTERM` stops it claiming and lets the current pass finish. Without that, every
deploy kills a pass mid-flight and each claimed event waits out its full lease
before another worker may take it.
