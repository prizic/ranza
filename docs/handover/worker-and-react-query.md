# The worker, and React Query

Two things arrive together because they are the same question asked twice: what
may live outside a request, and what may live outside the server.

The answer is the same both times. **Business logic stays in
`packages/ranza/*` and `packages/platform/*`. Authorization stays in Postgres.**
Neither NestJS nor TanStack Query is allowed to become a second place either one
is decided.

| Topic            | Decision                                                                                       | Recorded in                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| User-facing apps | Stay on Next.js. It is a thin shell: session, server funnel, render                            | ADR 0007                                                                             |
| Business logic   | `packages/ranza/*` and `packages/platform/*`, never in Next.js or NestJS code                  | blueprint 9.8                                                                        |
| Authorization    | Postgres — RLS, policies, grants. Never a NestJS guard or a UI condition                       | blueprint 7.1, [ADR 0012](../adr/0012-a-write-is-bounded-by-a-policy-not-a-check.md) |
| NestJS           | Only as `apps/worker`, a standalone application context. No HTTP, no controllers               | [ADR 0016](../adr/0016-a-long-running-process-is-a-worker-not-a-second-backend.md)   |
| Queue            | A Postgres outbox, polled. No Redis, no BullMQ without a new ADR                               | [ADR 0017](../adr/0017-cross-module-facts-travel-through-a-transactional-outbox.md)  |
| Worker identity  | `ranza_worker`, its own role and its own transaction-local context                             | [ADR 0018](../adr/0018-the-worker-has-its-own-role-and-its-own-context.md)           |
| React Query      | TanStack Query, scoped to live screens. The default stays Server Components and server actions | [ADR 0019](../adr/0019-a-live-screen-uses-tanstack-query-scoped-to-the-tenant.md)    |
| Sync or async    | Decided by whether the two facts may ever disagree                                             | [ADR 0020](../adr/0020-sync-inside-the-transaction-or-async-through-the-outbox.md)   |

Authority order is unchanged: blueprint, then ADRs, then a module or release
specification, then the active issue, then code. This file sits at the third
level, so where it disagrees with an ADR the ADR wins — and the disagreement is
a thing to surface, not to resolve quietly.

## Order of work, and where it stands

|       |                                                                                                                        |                                                                                                                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **0** | The check-in date rule and check-out error handling                                                                    | **done** — `20260916001300_check_in_on_the_day`                                                                                                                                      |
| **1** | ADRs 0016–0020, documents only                                                                                         | **done**                                                                                                                                                                             |
| **2** | `ranza_worker`, the worker context functions, the outbox tables and their policies                                     | **done** — `20260916001400_platform_outbox`, `packages/platform/outbox`                                                                                                              |
| **3** | `apps/worker`: composition root with role checks, dispatcher, no handlers                                              | **done** — `apps/worker`, boundary fixtures, `tests/integration/outbox.test.ts`                                                                                                      |
| **4** | The first handler                                                                                                      | **not built** — every candidate needs a blueprint 5.x workflow that does not exist. The four considered, and what each needs first, are in `apps/worker/src/outbox/subscriptions.ts` |
| **5** | Publishing from check-in and check-out, split per ADR 0020                                                             | **done** — `stay.checked_in` and `stay.checked_out`, in the transaction that produced each                                                                                           |
| **6** | The TanStack Query provider, key rules, boundary rules, the first live screen                                          | **done** — arrivals polls; `tests/unit/query-keys.test.ts`, `tests/unit/arrivals-route.test.ts`                                                                                      |
| later | Night audit, once something has a rate to charge · reservation overlap protection, once anything creates a Reservation |                                                                                                                                                                                      |

Each step: `pnpm check`, `pnpm db:test` and `pnpm test:integration` green, a
CHANGELOG entry for every package touched, and `pnpm check:docs` clean.

## What was already wrong, and what still is

Reproduced against `main` as `ranza_app` before any of this was built.

**Fixed.**

- _Check-in had no date rule._ A Reservation weeks out could be checked in,
  producing an `in_house` Stay with future dates; a second Guest could then take
  the same Unit tonight, because `stays_no_double_booking` sees two ranges that
  do not overlap. The Stay now starts on the day the Guest actually arrived.
- _`checkOut` swallowed every error_ with a bare `catch {}`, reporting constraint
  violations and lost connections to the front desk as "you cannot" and to the
  logs as nothing at all. Only `StayWriteError` is translated now.

**Still open, each needing its own slice.**

- _Overlapping confirmed Reservations are allowed._ Unreachable today — nothing
  creates a Reservation — and it needs protection before creation becomes a
  command. Overbooking is an unwritten policy, not an oversight.
- _There is no business date._ Decided in
  [ADR 0021](../adr/0021-a-business-date-is-the-day-a-property-is-working.md) and
  deliberately not built: one column and one function body, applied when
  something posts per night. Nothing does, because nothing has a rate — there is
  no rate plan, no tariff and no price column anywhere, so a night audit has
  nothing to charge.

**Closed since.**

- _No reversal for a mistaken check-in._ `reverseCheckIn` cancels the Stay and
  confirms the Reservation again, refused once anything has been posted to the
  Folio ([ADR 0022](../adr/0022-a-mistaken-check-in-is-reversed-not-deleted.md)).
  No screen offers it yet: a front desk needs a confirmation step and a reason
  field, which is an interface decision rather than a button to add to a table.

Test fixtures for anything date-shaped are relative to the Property's own today.
Fixed dates are what made checking somebody in weeks early the normal case in
two suites that were otherwise asserting the right things.

## The worker

### Shape

```text
apps/worker/
  README.md                  what runs here, and the rules
  package.json               @ranza/worker
  src/
    main.ts                  NestFactory.createApplicationContext(WorkerModule)
    worker.module.ts         ScheduleModule and job modules, nothing else
    composition.ts           the only place that reads env or opens a connection
    outbox/
      outbox.module.ts
      outbox.dispatcher.ts   the interval loop
      subscriptions.ts       event type to handler
    jobs/                    later: night audit, retention
```

### Rules

- `NestFactory.createApplicationContext`, never `NestFactory.create`. No
  controllers, no listener, no port. See
  [ADR 0016](../adr/0016-a-long-running-process-is-a-worker-not-a-second-backend.md)
  for why not listening is the only durable version of "do not build a second
  API".
- `enableShutdownHooks()`. On shutdown, stop claiming and finish what is claimed.
- `@nestjs/schedule` for intervals. Exact version pins, like everything else.
- A Nest provider wraps a factory the composition root already built. It does not
  construct a module and it does not hold a rule.
- A handler maps one event to one module `...Within(tx, ...)` call.
- No `@UseGuards`. Authorization is the database's.
- `@nestjs/*` and decorators only under `apps/worker/src/`, enforced.

### Composition root

Mirrors `apps/operator-workspace/src/server/composition.ts`, with two refusals it
does not have:

- refuse to start when `WORKER_DATABASE_URL` equals `DIRECT_URL`;
- refuse to start when the role actually connected as is a superuser, has
  `BYPASSRLS`, or owns — or is a member of the owner of — any table in `public`.

A URL cannot express the second, so it is asked of `pg_roles` at boot. The worker
never uses `ranza_app` and is granted no execute on `app.set_request_context`, so
it cannot impersonate a Staff Member even by accident.

### Dispatcher

One transaction per event, because Prisma's interactive transactions have no
savepoints and a batch-wide rollback would undo the events that succeeded.

1. **Claim**, in a short transaction: ready events, `order by occurred_at`,
   `limit N`, `for update skip locked`, set `claimed_until = now() + 2 minutes`.
2. **Per event**, in its own transaction: set worker context, insert the delivery
   row `on conflict do nothing` and stop if it returns nothing, run the handler,
   mark `published_at` when every consumer has been delivered.
3. **On failure**: the transaction rolls back, including the delivery row. A
   separate statement — outside it, or it would roll back too — increments
   `attempts`, records `last_error`, sets the backoff and clears the claim. Past
   the cap, `dead_at` and an error-level log. Nothing is deleted.

Consumers are named stably (`folio.onStayCheckedOut`) and never renamed: the
delivery table is keyed on the name.

### Tests, each proven red first

pgTAP: `ranza_worker` without context reaches nothing; with Organization A's
context it cannot touch Organization B; `ranza_app` cannot execute
`app.set_worker_context`; `ranza_app` may insert an outbox event only for an
Organization it can reach and may not read the queue; the worker's column grants
refuse an update outside the dispatch columns.

Integration: the business write and the outbox insert commit or roll back
together; a redelivered event does not run its handler twice; a failing handler
rolls back its writes and retries later; two dispatchers never deliver one event
twice; startup refuses a superuser, a `BYPASSRLS` role, an owner, or `DIRECT_URL`.

## React Query

Where, and only where:

- **Yes** — screens that stay open and change underneath the user: housekeeping,
  the arrivals and departures command center, a room rack. Anything that needs
  polling or an optimistic update.
- **No** — everything else. Server Components and server actions.

The rules that matter are in
[ADR 0019](../adr/0019-a-live-screen-uses-tanstack-query-scoped-to-the-tenant.md)
and are not repeated here. The two with teeth: every cache key begins
`["ranza", userId, organizationId, propertyId]` and comes from a factory, and a
`QueryClient` is never shared across requests on the server.

Reads reach `src/server/` through a `GET` route handler; writes stay server
actions and invalidate the scoped key. Nothing is persisted to the browser.

## Never

- Business rules in a NestJS class, a route handler, a server action, or a
  component.
- Authorization in a guard, in cache code, or in a UI condition.
- Any runtime process connected as `DIRECT_URL`, an owner, a superuser, or a
  `BYPASSRLS` role.
- The worker calling `app.set_request_context`.
- Redis, BullMQ, a NestJS HTTP API, or client cache persistence, without an ADR.
- A `QueryClient` shared across server requests, or an unscoped cache key.
- A `DELETE` grant or policy.
- A green test treated as evidence before it has been watched go red with the
  rule it protects removed.
