# 0016. A long-running process is a worker, not a second backend

Status: Accepted
Date: 2026-09-16

## Context

Everything the product does so far happens inside a request. A Staff Member
presses a button, Next.js resolves the session, a module runs one transaction,
the page re-renders. Nothing survives the response.

Three things already named in the blueprint do not fit that shape. A night audit
(5.9) runs at a time nobody is pressing anything. A notification (5.12) can be
sent a few seconds later and must be retried when the provider is down. An
integration (5.14) talks to somebody else's server, at their latency, and a front
desk must not wait for it.

`setInterval` in a Next.js process was the first idea and is wrong in a way that
is not obvious until it has happened: a Next.js server is horizontally scaled, so
the interval runs once per instance and the night audit posts the room charge
three times. Making it idempotent is possible; making every future job idempotent
against an unknown replica count is not a thing to build a product on.

So a second process. The question this decides is what that process is allowed to
be, because the failure mode is not technical — it is that a second process with
a framework in it becomes a second place to put business rules, and then a second
place where authorization is decided, and the schema stops being the boundary.

## Decision

### `apps/worker`, a NestJS standalone application context, with no HTTP

NestJS for dependency injection, lifecycle and scheduling, which are the three
things a long-running process needs and none of which is a business concern.
Bootstrapped with `NestFactory.createApplicationContext`, never
`NestFactory.create`: no controllers, no listener, no port.

That restriction is the whole of this decision. A worker that can serve HTTP is a
backend, and a backend is somewhere a route can be added, and a route is somewhere
authorization gets decided in a guard. Not listening is the only version of "do
not build a second API" that cannot be eroded by a reasonable-looking pull
request.

Nest classes wrap; they do not decide. A provider's `useFactory` returns a module
already built by the composition root, and a handler maps one event to one module
function call. `@nestjs/*` imports and decorators are allowed only under
`apps/worker/src/`, which `.dependency-cruiser.cjs` enforces so that "the domain
does not know about Nest" is a fact rather than a habit.

There are no `@UseGuards` and there will not be. Authorization is row-level
security, and a worker that checked permissions in a guard would be asserting
something the database is about to decide anyway — and would be believed when the
two disagreed.

### It is a separate application, not a script in the workspace

`apps/worker` rather than `scripts/`, because it is deployed, supervised,
restarted and observed like the workspace is, and because `apps/*` already has
the rules a deployable thing needs: no application imports another, packages are
reached through their public index, and nothing may import `apps/worker`.

### What may live there

A schedule, a claim, a handler that calls one module function, and shutdown.

Not: SQL against a module's tables, a rule about when a charge is owed, a
decision about who may do something, an HTTP endpoint, or a queue engine.

## Consequences

The repository gains a second runtime with its own composition root, its own
connection and its own deployment. That is a real cost, paid because the
alternative — a scheduled job inside a replicated web server — is a correctness
problem rather than a tidiness one.

Redis and BullMQ are not adopted. The queue is Postgres
([ADR 0017](0017-cross-module-facts-travel-through-a-transactional-outbox.md)),
because a second datastore would be a second thing to operate and a second place
a transaction cannot reach. Introducing one is a decision, not an implementation
detail.

The worker connects as its own role and never as `ranza_app`
([ADR 0018](0018-the-worker-has-its-own-role-and-its-own-context.md)).

Nothing about this makes the worker the place for background work "because it is
there". What belongs in a transaction stays in the transaction
([ADR 0020](0020-sync-inside-the-transaction-or-async-through-the-outbox.md)).
