# 0018. The worker has its own role and its own context

Status: Accepted
Date: 2026-09-16

Amended: 2026-09-24 — a second cross-Organization read, for closing business
days ([ADR 0034](0034-a-business-day-closes-after-its-cutoff.md)): see "A second
exception, and it is a function" below.

## Context

`ranza_app` reaches tenant data by publishing an acting user —
`app.set_request_context(user_id)` — and every policy resolves through
`app.accessible_property_ids()`, which needs an `organization_membership`
(ADR 0007, ADR 0009). That is the correct shape for a request, because a request
has a person behind it.

A worker has nobody behind it. The night audit posts a room charge at 03:00 and
there is no Staff Member to attribute it to.

Two obvious answers are both wrong.

**Give the worker a service account.** A row in `users`, memberships in every
Organization, and `app.set_request_context(service_user_id)`. Everything works
immediately, which is the problem: there is now a user id that reaches every
Organization's data through the ordinary Staff policies, and the audit trail says
a person did it. If that account is ever reachable from a request — one bad
`userId` parameter — it is a cross-tenant read through the front door.

**Let the worker bypass RLS.** A `BYPASSRLS` role, or the owner. This repository
has already learned what that costs: the policies stay correct and stop applying,
and nothing looks wrong. AGENTS.md forbids it and this does not relitigate it.

## Decision

### `ranza_worker`: a fourth role, with `ranza_app`'s privileges and not its identity

Created in a migration with `login`, no password (each environment supplies its
own), no `BYPASSRLS`, not an owner, not a member of one. The worker's composition
root refuses to start if the role it actually connected as is a superuser, has
`BYPASSRLS`, or owns (or is a member of the owner of) any table in `public` — a
URL cannot express that, so it is asserted against `pg_roles` at boot rather than
assumed from configuration.

It also refuses to start when its URL equals `DIRECT_URL`, which is the one
privileged connection the repository does have and the one somebody reaches for
when a grant is missing.

### `app.set_worker_context(organization_id, job)`, and it is not the request context

Transaction-local, `security invoker`, `set search_path = ''`, and executable by
`ranza_worker` alone: `revoke execute from public, ranza_app, ranza_auth`.

The separation is the point. `ranza_app` cannot call it, so a request can never
acquire worker reach. `ranza_worker` is granted no execute on
`app.set_request_context`, so the worker can never impersonate a Staff Member —
which also means it cannot accidentally be attributed as one in the audit trail.

`app.worker_organization_id()` returns the transaction-local value or null, and
null denies. A handler that forgets to set context reaches nothing, in the same
way and for the same reason a request that forgets denies.

### Worker policies are separate, scoped `to ranza_worker`, and carry the commercial gates

A worker policy is `for insert to ranza_worker with check (...)`. It never widens
a Staff policy, for the same reason ADR 0009 keeps a Resident on their own
policies: a widened condition is one somebody has to reason about from two
directions at once, and the Staff ones are load-bearing.

The condition is **both** `organization_id = app.worker_organization_id()` and
`app.can_use_capability(property_id, <module>, <capability>)`.

The second half is not optional and this ADR is explicit about it, because a
worker policy scoped only by Organization was the obvious shape and it
contradicts ADR 0012. A write carries all four of blueprint 3.5's gates in its
policy precisely because it has no surrounding query to carry them — and an
Organization whose Subscription lapsed must stop accruing charges at 03:00 just
as it stops accruing them at the front desk. A job is not an exemption from the
commercial model; it is the thing most likely to keep running after somebody
stopped paying.

Grants are per table and per column, `update` narrowed to the columns a handler
actually writes, and no `DELETE` anywhere.

Existing Staff policies must keep denying `ranza_worker`, which they do because
`app.current_user_id()` is null under worker context. That is asserted rather
than assumed: it is exactly the kind of thing that stays true until somebody
writes a policy with `using (true)` for a reason that looked local.

### One exception, and it is the outbox

`ranza_worker` selects and updates `outbox_events` across Organizations. Nothing
else in this schema does, and AGENTS.md's rule that every tenant query goes
through `withOrganizationContext()` is otherwise absolute.

The dispatcher cannot obey it. It must find out which Organizations have pending
work _before_ it can set context for one, which is a chicken-and-egg the rule has
no answer to. The alternatives were worse: a per-Organization polling loop turns
one query into one query per tenant per second, and a registry of "Organizations
with pending events" is the same cross-Organization read with an extra table in
front of it.

So it is granted, narrowly, and the narrowing is what makes it acceptable:

- Two tables, not the schema. `outbox_events` and `outbox_deliveries`.
- `select` and `update` on the dispatch columns only — `available_at`,
  `claimed_until`, `attempts`, `last_error`, `published_at`, `dead_at`. Not
  `payload`, not `organization_id`, not `event_type`.
- Payloads carry ids and facts, never personal data
  ([ADR 0017](0017-cross-module-facts-travel-through-a-transactional-outbox.md)),
  so what crosses the boundary is "something happened to row X" and not who they
  are.
- The moment a handler touches anything else, it is inside
  `app.set_worker_context()` and bounded by one Organization like everything else.

`ranza_app` gets `insert` on `outbox_events` and nothing more: no select, no
update. A request publishes and cannot read the queue, which means the exception
above exists in exactly one process.

### A second exception, and it is a function

Closing a Property's business day at its cutoff has the dispatcher's
chicken-and-egg: the worker must learn which Properties have a day due before it
can set context for any of them. It is answered the same way — granted,
narrowly — and the narrowing is again what makes it acceptable:

- One function, `app.properties_due_for_close()`, and no table grant at all.
  `ranza_worker` holds nothing on `properties` or `business_day_closes`.
- It returns an Organization id, a Property id and a date. No name, no count,
  nothing about what is open at the Property.
- Execute is `ranza_worker`'s alone, revoked from `PUBLIC`, `ranza_app` and
  `ranza_auth`; the pgTAP suite reads `pg_proc.proacl` and pins the signature, so
  widening either is a red build rather than a quiet change.
- Closing a day is then `app.close_business_day_automatically()`, inside
  `app.set_worker_context()` for that Organization, which refuses a Property
  outside it — bounded by one Organization like everything else.

A third exception gets its own section and its own argument. "The worker already
reads across Organizations" is not one.

## Consequences

Four roles now: `ranza_app`, `ranza_auth`, `ranza_worker`, and the migration
owner. The runbook and `.env.example` gain a fourth credential, and an
environment that forgets to set the worker's password gets a worker that cannot
connect rather than one that connects as something else.

Every table a handler touches needs an explicit worker policy and an explicit
grant. That is deliberate friction: a new job cannot quietly acquire reach it was
not given, because the default for `ranza_worker` on any new table is nothing at
all.

The audit trail gains actions with no acting Staff Member. `recordWithin` takes
an actor; a worker-originated record names the job instead, and blueprint 4.4's
requirement that an action is attributable is satisfied by naming what did it
rather than inventing who did it.
