-- platform/outbox — a fact that happened, for somebody else to react to.
--
-- Owned by packages/platform/outbox (ADR 0008), and reusable, so it knows
-- nothing about what it carries: an event type is a dotted string the publisher
-- chooses, a payload is opaque jsonb, and organization_id is an opaque scope the
-- module never learns the meaning of. Exactly like audit.records, and for the
-- same reason — blueprint 9.8 forbids a platform module from even naming a
-- Property or a Folio.
--
-- Why a table at all: there is no arrangement of two systems that makes "the
-- Reservation was checked in" and "the confirmation was sent" atomic. There is
-- one arrangement that makes them the same write, which is this
-- (ADR 0017). Publish after the commit and a crash in between loses the message
-- with nothing recording that it was owed; publish before and a rollback sends a
-- message about something that did not happen.
--
-- This migration also creates ranza_worker and its context (ADR 0018). The two
-- arrive together because neither is any use alone: a queue nothing may read is
-- inert, and a role with nothing to read is a credential nobody needs.
--
-- No Prisma-generated section. A module that owns a schema reaches it with raw
-- SQL through its injected client, so prisma/schema.prisma models none of this.

-- ---------------------------------------------------------------------------
-- The worker's identity
-- ---------------------------------------------------------------------------

-- Not a service account in `users`. That was the obvious alternative and it is
-- the dangerous one: a user id with memberships in every Organization reaches
-- every Organization's data through the ordinary Staff policies, and the audit
-- trail then says a person did it.
--
-- LOGIN without a password, like ranza_app: each environment supplies its own
-- credential out of band. Deliberately not a superuser, no BYPASSRLS, and not an
-- owner — the worker's composition root asks pg_roles at boot and refuses to
-- start if any of that has become untrue, because a connection URL cannot say it.
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'ranza_worker') then
    create role ranza_worker login;
  end if;
end
$$;

comment on role ranza_worker is
  'The background worker. Reaches tenant rows through app.set_worker_context(), never through app.set_request_context(): it has no identity to impersonate and must not acquire one.';

-- ---------------------------------------------------------------------------
-- Worker context, which is not request context
-- ---------------------------------------------------------------------------

-- Transaction-local, for the same reason app.set_request_context() is: a pooled
-- connection must not leak one job's scope into the next.
--
-- `job` is set rather than returned because nothing reads it yet. It is there so
-- that a transaction stuck for two minutes can be identified from
-- pg_stat_activity without guessing which handler it belongs to.
create function app.set_worker_context(target_organization_id uuid, job text)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if target_organization_id is null then
    raise exception 'worker context requires an organization'
      using errcode = '22004';
  end if;
  if job is null or btrim(job) = '' then
    raise exception 'worker context requires the name of the job setting it'
      using errcode = '22004';
  end if;
  perform set_config('app.worker_organization_id', target_organization_id::text, true);
  perform set_config('app.worker_job', btrim(job), true);
end;
$$;

create function app.worker_organization_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(current_setting('app.worker_organization_id', true), '')::uuid;
$$;

comment on function app.worker_organization_id() is
  'The Organization a worker transaction is scoped to, or null when none was set. Null must deny, never widen.';

-- EXECUTE is granted to PUBLIC by default, so without this revoke the whole
-- separation below would be decorative: ranza_app could set worker scope for any
-- Organization and read straight past its own policies. The two roles are named
-- explicitly as well as PUBLIC, because a grant added later to either of them
-- should read as the deliberate act it would be.
revoke execute on function app.set_worker_context(uuid, text) from public;
revoke execute on function app.set_worker_context(uuid, text) from ranza_app;
revoke execute on function app.set_worker_context(uuid, text) from ranza_auth;
revoke execute on function app.worker_organization_id() from public;

grant usage on schema app to ranza_worker;
grant execute on function app.set_worker_context(uuid, text) to ranza_worker;
grant execute on function app.worker_organization_id() to ranza_worker;

-- And the other direction, which turned out not to be free. The worker must not
-- be able to become a Staff Member: an action it took would then be attributed
-- to somebody, and it would reach every row that person reaches.
--
-- Revoking from ranza_worker alone does nothing, because it never held a grant —
-- PostgreSQL grants EXECUTE on a new function to PUBLIC, so every role has it by
-- default and `revoke` from one of them removes a privilege that was not there.
-- 20260916000100 granted it explicitly to ranza_app and left the PUBLIC default
-- in place, so the explicit grant was decorative. It stops being so here; the
-- grant below is what ranza_app now actually holds it by.
--
-- Found by asserting the refusal in pgTAP and watching the assertion fail.
revoke execute on function app.set_request_context(uuid) from public;
grant execute on function app.set_request_context(uuid) to ranza_app;

-- ---------------------------------------------------------------------------
-- The queue
-- ---------------------------------------------------------------------------

create schema outbox;

comment on schema outbox is
  'Owned by packages/platform/outbox. Facts published inside a business transaction, delivered afterwards at least once.';

create table outbox.events (
  id uuid primary key default gen_random_uuid(),

  -- Opaque tenancy scope, with no foreign key, exactly as audit.records has
  -- none. A reusable module cannot reference a host's table without learning
  -- what that table means.
  organization_id uuid not null,

  -- Dotted and lower case, e.g. 'stay.checked_in'. Constrained so the vocabulary
  -- stays queryable rather than drifting into free text — the same rule
  -- audit.records applies to `action`, for the same reason.
  event_type text not null
    check (event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),

  -- Ids and facts. Never personal data: this is the one table a single process
  -- reads across every Organization, so it is the one place where a leak would
  -- not be bounded by tenancy. A handler that needs more reads it under that
  -- Organization's own context.
  payload jsonb not null default '{}'::jsonb,

  occurred_at timestamptz not null default now(),

  -- When the dispatcher may next try. Moves forward on failure; that is the
  -- whole of the backoff.
  available_at timestamptz not null default now(),

  -- A lease, not a lock. Holding the row lock for the length of a handler would
  -- pin a connection across a slow HTTP call, and a pooled deployment runs out
  -- of connections while appearing to be idle. A worker that dies holding a
  -- claim releases it by this expiring rather than by anybody noticing.
  claimed_until timestamptz,

  attempts integer not null default 0 check (attempts >= 0),
  last_error text,

  -- Delivered to every consumer that wanted it.
  published_at timestamptz,
  -- Gave up. Not deleted: nothing in this schema deletes history (blueprint 7.4),
  -- and a dead letter is the only evidence of what went wrong.
  dead_at timestamptz,

  constraint events_outcome_check
    check (published_at is null or dead_at is null)
);

-- Partial on exactly the predicate the dispatcher claims with, so a queue with a
-- million delivered rows costs the same to poll as an empty one.
create index events_ready_idx
  on outbox.events (available_at, occurred_at)
  where published_at is null and dead_at is null;

create index events_scope_idx
  on outbox.events (organization_id, occurred_at desc);

comment on table outbox.events is
  'Written by the same transaction as the fact it describes, so the two cannot disagree. Read afterwards by the worker (ADR 0017).';

-- Delivery is at least once. Exactly-once does not exist across a process
-- boundary, and a system that assumes it is correct until the first crash
-- between "the handler finished" and "the handler was marked done".
--
-- This row is inserted by the handler's own transaction, so the two commit or
-- roll back together: a crash mid-handler leaves no delivery row and the event
-- is simply claimed again.
create table outbox.deliveries (
  consumer text not null
    check (consumer ~ '^[a-z][a-z0-9_]*\.[a-zA-Z][a-zA-Z0-9_]*$'),
  event_id uuid not null references outbox.events(id) on delete restrict,

  -- Repeated from the event so a delivery can be read without joining, which
  -- matters because the join would be across the one cross-Organization read.
  organization_id uuid not null,

  delivered_at timestamptz not null default now(),

  primary key (consumer, event_id)
);

comment on table outbox.deliveries is
  'One row per consumer per event. The primary key is what makes a redelivered event a no-op rather than a second side effect. A consumer is never renamed: this table is keyed on the name.';

-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------

alter table outbox.events enable row level security;
alter table outbox.events force row level security;
alter table outbox.deliveries enable row level security;
alter table outbox.deliveries force row level security;

-- A request publishes and cannot read the queue. There is no SELECT policy and
-- no select grant, so the one cross-Organization read below exists in exactly
-- one process rather than in two.
create policy events_publish_own_scope
  on outbox.events for insert
  to ranza_app
  with check (organization_id in (select app.accessible_organization_ids()));

-- The documented exception (ADR 0018). The dispatcher must find out which
-- Organizations have pending work before it can set context for one, which is a
-- chicken-and-egg that "every tenant query goes through a context" has no answer
-- to. The alternatives were worse: a poll per tenant per second, or a registry
-- table that is the same cross-Organization read with an extra hop.
--
-- What makes it acceptable is the narrowing, and the narrowing is the grants
-- below, not this policy: two tables, and update on the dispatch columns only.
-- Row-level security cannot express "only these columns", which is the same
-- division of labour as folios_update_finance.
create policy events_dispatch_worker
  on outbox.events for select
  to ranza_worker
  using (true);

create policy events_claim_worker
  on outbox.events for update
  to ranza_worker
  using (true)
  with check (true);

-- Deliveries are scoped, because by the time one is written the handler is
-- already inside app.set_worker_context() and there is no reason to leave it.
create policy deliveries_read_worker
  on outbox.deliveries for select
  to ranza_worker
  using (organization_id = app.worker_organization_id());

create policy deliveries_record_worker
  on outbox.deliveries for insert
  to ranza_worker
  with check (organization_id = app.worker_organization_id());

-- There is deliberately no UPDATE or DELETE policy on outbox.deliveries. A
-- delivery that can be withdrawn is not a record of anything.

grant usage on schema outbox to ranza_app;
grant insert on outbox.events to ranza_app;
revoke select, update, delete on outbox.events from ranza_app;
revoke all on outbox.deliveries from ranza_app;

grant usage on schema outbox to ranza_worker;
grant select on outbox.events to ranza_worker;
-- A policy bounds rows; a grant bounds columns (ADR 0012, amended). Without
-- this, a worker that may mark an event delivered could equally rewrite its
-- payload or move it to another Organization — by a statement that never
-- mentions either.
grant update (available_at, claimed_until, attempts, last_error, published_at, dead_at)
  on outbox.events to ranza_worker;
grant select, insert on outbox.deliveries to ranza_worker;
revoke delete on outbox.events from ranza_worker;
revoke update, delete on outbox.deliveries from ranza_worker;

-- The credential role has no business here, stated rather than assumed.
revoke all on schema outbox from ranza_auth;
