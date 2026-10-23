-- An Organization registers a webhook, and its failures are visible (RANZ-46, ADR 0045).
--
-- ON THE NUMBER. 011200 to 011299 belong to the integrations lane.
--
-- 20260916010000 shipped the vocabulary of an integration (a card, a status, a
-- failed-operations view) and no integration: nothing in it ever called an
-- external system, its Retry flipped a row to `resolved` without sending
-- anything, and its two worker-facing functions tested `current_user =
-- 'ranza_worker'` inside SECURITY DEFINER, where current_user is the owner, so
-- their worker branch could not run. This migration replaces all of it with one
-- real integration: an outbound webhook (blueprint 13 Phase 5, "Public APIs,
-- webhooks"). The Organization registers an HTTPS URL, chooses events, and the
-- worker posts them signed. Why this one and not KBS, e-Arsiv or WhatsApp is in
-- ADR 0045: it is the only one the blueprint specifies and that needs no
-- contract or credential nobody has given us.
--
-- What goes, and why it is safe to go:
--
--   public.integrations   A per-Property card whose `status` nothing maintained
--                         and whose `config` was plaintext, writable JSON
--                         readable by everyone with integrations.view. Its only
--                         writers were the seed script's fabricated "connected"
--                         POS, KBS, GIB and WhatsApp rows and a module method no
--                         screen called. An endpoint is Organization-wide, so it
--                         is not a row of a Property-scoped table.
--   failed_operations     .integration_id (pointed at the table above) and
--                         .payload (raw, and a place for a guest's data to land).
--                         The delivery row holds the body; the failure holds none.
--   the two definers      record_integration_failure() and the one-argument
--                         resolve_failed_operation(): neither gate was complete
--                         (no reach, no commercial gate), the category was
--                         hard-coded, and an integration was matched by its
--                         display name.
--
-- failed_operations itself is kept, rows and all: it is operational history
-- and "never delete" applies. Its writers change: ranza_app can no longer write
-- it at all, and the worker and the three commands below do, through functions
-- that ask the gates.
--
-- The shape of the rest is ADR 0027's: the worker holds no grant on any of these
-- tables. It claims due deliveries, reads the signing secret of the one it is
-- sending, and records the outcome, each through a function that names
-- app.worker_organization_id() first. The signing secret lives in a table no
-- application role can read.
--
-- Four things a review of the first draft of this migration found, and where
-- each is answered:
--
--   * what is sent is built from the reservation, stay or folio line an event
--     names, never from the event's payload, which any member of the
--     Organization can write (app.webhook_event_source);
--   * every command writes its own audit record and refuses a missing reason
--     inside the function, so the screen and the module are not the only
--     things standing between a caller and either (app.record_webhook_audit);
--   * an endpoint has one delivery on the wire at a time, and an attempt can
--     only be recorded by the lease it was given (claim_webhook_delivery,
--     record_webhook_attempt);
--   * a failure from before this migration, which has no delivery, can still be
--     closed.

-- ---------------------------------------------------------------------------
-- What goes
-- ---------------------------------------------------------------------------

drop function app.record_integration_failure(uuid, text, text, text, text, jsonb);
drop function app.resolve_failed_operation(uuid);

drop policy failed_operations_read_accessible_property on public.failed_operations;
drop policy failed_operations_insert_manage on public.failed_operations;
drop policy failed_operations_update_manage on public.failed_operations;

-- Stated as an end state: a table-level revoke takes the column-level grants
-- of 20260916010000 with it.
revoke insert, update on public.failed_operations from ranza_app;

-- DropForeignKey
ALTER TABLE "failed_operations" DROP CONSTRAINT "failed_operations_integration_id_fkey";

-- AlterTable
ALTER TABLE "failed_operations" DROP COLUMN "integration_id",
DROP COLUMN "payload",
ADD COLUMN     "closed_at" TIMESTAMPTZ(6),
ADD COLUMN     "closed_by" UUID,
ADD COLUMN     "closed_reason" TEXT,
ADD COLUMN     "delivery_id" UUID,
ADD COLUMN     "endpoint_id" UUID,
ADD COLUMN     "next_attempt_at" TIMESTAMPTZ(6);

-- DropTable
DROP TABLE "integrations";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "event_types" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(6),

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoint_secrets" (
    "endpoint_id" UUID NOT NULL,
    "secret" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_endpoint_secrets_pkey" PRIMARY KEY ("endpoint_id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "endpoint_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "event_id" UUID,
    "event_type" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6),
    "claimed_until" TIMESTAMPTZ(6),
    "lease_id" UUID,
    "last_attempt_at" TIMESTAMPTZ(6),
    "last_status_code" INTEGER,
    "last_failure" TEXT,
    "last_response_excerpt" TEXT,
    "last_duration_ms" INTEGER,
    "delivered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "webhook_endpoints_organization_idx" ON "webhook_endpoints"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_endpoints_id_organization_id_key" ON "webhook_endpoints"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_endpoints_one_active_url" ON "webhook_endpoints"("organization_id", "url") WHERE status = 'active';

-- CreateIndex
CREATE INDEX "webhook_deliveries_endpoint_status_idx" ON "webhook_deliveries"("endpoint_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_id_organization_id_key" ON "webhook_deliveries"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_one_per_event_key" ON "webhook_deliveries"("endpoint_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "failed_operations_one_per_delivery_key" ON "failed_operations"("delivery_id", "organization_id");

-- AddForeignKey
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "webhook_endpoint_secrets" ADD CONSTRAINT "webhook_endpoint_secrets_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_organization_id_fkey" FOREIGN KEY ("endpoint_id", "organization_id") REFERENCES "webhook_endpoints"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_property_id_organization_id_fkey" FOREIGN KEY ("property_id", "organization_id") REFERENCES "properties"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "failed_operations" ADD CONSTRAINT "failed_operations_endpoint_id_organization_id_fkey" FOREIGN KEY ("endpoint_id", "organization_id") REFERENCES "webhook_endpoints"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "failed_operations" ADD CONSTRAINT "failed_operations_delivery_id_organization_id_fkey" FOREIGN KEY ("delivery_id", "organization_id") REFERENCES "webhook_deliveries"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "failed_operations" ADD CONSTRAINT "failed_operations_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------
-- What an event is allowed to carry out of the building
-- ---------------------------------------------------------------------------

-- The only events an endpoint can subscribe to, and for each the only keys of
-- its outbox payload a body may carry. A catalogue in the database rather than a
-- list in the module, for the reason ADR 0025 gives for permissions: the check
-- constraint below and the worker's enqueue read the same list, so a second
-- copy cannot disagree with the first.
--
-- Ids, dates, amounts and enum values, as the outbox payload contract already
-- says. Nothing a Guest or a Staff Member typed: `folio.line_posted` publishes
-- the line's `description` and this list leaves it out, and the value filter
-- below is the second line of defence for a key that is listed.
create function app.webhook_event_keys(target_event_type text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case target_event_type
    when 'reservation.created' then
      array['reservationId', 'propertyId', 'accommodationUnitId']
    when 'reservation.cancelled' then
      array['reservationId', 'propertyId', 'accommodationUnitId']
    when 'reservation.no_show' then
      array['reservationId', 'propertyId', 'accommodationUnitId']
    when 'stay.checked_in' then
      array['stayId', 'reservationId', 'propertyId', 'accommodationUnitId', 'folioId']
    when 'stay.checked_out' then
      array['stayId', 'accommodationUnitId', 'departedOn', 'folioId', 'folioClosed']
    when 'folio.line_posted' then
      array['lineId', 'propertyId', 'folioId', 'lineType', 'amountMinor',
            'currency', 'paymentMethod', 'reversesLineId', 'source']
  end
$$;

comment on function app.webhook_event_keys(text) is
  'The subscribable outbox events and, for each, the payload keys a webhook body may carry. Null for an event that cannot be subscribed to.';

create function app.webhook_events_known(target_event_types text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not exists (
           select 1 from unnest(target_event_types) as listed(event_type)
            where app.webhook_event_keys(listed.event_type) is null)
     and (select count(distinct listed.event_type) from unnest(target_event_types) as listed(event_type))
         = coalesce(cardinality(target_event_types), 0)
$$;

-- The data of a body: the listed keys, and of those only values that are
-- numbers, booleans, null, or a short token of letters, digits and `_ . : -`
-- (a uuid, a date, a currency, an enum). A sentence has spaces and does not
-- pass.
create function app.webhook_event_data(target_event_type text, event_payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(pair.key, pair.value), '{}'::jsonb)
    from jsonb_each(case when jsonb_typeof(event_payload) = 'object'
                         then event_payload else '{}'::jsonb end) as pair
   where pair.key = any (coalesce(app.webhook_event_keys(target_event_type), array[]::text[]))
     and (jsonb_typeof(pair.value) in ('number', 'boolean', 'null')
          or (jsonb_typeof(pair.value) = 'string'
              and (pair.value #>> '{}') ~ '^[A-Za-z0-9_.:-]{1,64}$'))
$$;

-- How long after the Nth failed attempt the next one is made, and null once the
-- schedule is spent: six attempts in all, the last about fifteen hours after
-- the first. Bounded on purpose: an endpoint that has been down for a day is
-- told to a person (the failure stays on the Integrations screen) and not
-- retried for ever.
create function app.webhook_retry_delay(attempts_made integer)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case attempts_made
    when 1 then interval '1 minute'
    when 2 then interval '5 minutes'
    when 3 then interval '30 minutes'
    when 4 then interval '2 hours'
    when 5 then interval '12 hours'
  end
$$;

-- ---------------------------------------------------------------------------
-- Constraints
-- ---------------------------------------------------------------------------

alter table public.webhook_endpoints
  add constraint webhook_endpoints_name_check
    check (char_length(btrim(name)) between 1 and 80),
  -- https, with no user information and a host. The one other shape is a
  -- loopback http URL, which exists so the worker's own test suites can run a
  -- receiver on this machine; the worker refuses it unless it was started with
  -- the test allowance, and the module refuses it at registration. The
  -- constraint says what a URL looks like, not whether it may be called (ADR 0045).
  add constraint webhook_endpoints_url_check
    check (char_length(url) <= 2048
           and (url ~ '^https://[^\s/?#@]+([/?#][^\s]*)?$'
                or url ~ '^http://(127\.0\.0\.1|localhost)(:[0-9]{1,5})?([/?#][^\s]*)?$')),
  add constraint webhook_endpoints_events_check
    check (event_types is not null
           and cardinality(event_types) between 1 and 6
           and app.webhook_events_known(event_types)),
  add constraint webhook_endpoints_status_check
    check (status in ('active', 'removed')),
  add constraint webhook_endpoints_removal_check
    check ((status = 'removed') = (removed_at is not null));

alter table public.webhook_endpoint_secrets
  add constraint webhook_endpoint_secrets_length_check
    check (char_length(secret) >= 32);

alter table public.webhook_deliveries
  add constraint webhook_deliveries_status_check
    check (status in ('pending', 'retrying', 'delivered', 'failed', 'cancelled')),
  add constraint webhook_deliveries_event_type_check
    check (event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  -- A delivery is an outbox event or a test, never neither: the unique key on
  -- (endpoint, event) is what makes the same event one delivery, and a test has
  -- no event to key on.
  add constraint webhook_deliveries_test_has_no_event_check
    check ((event_id is null) = (event_type = 'webhook.test')),
  add constraint webhook_deliveries_body_check
    check (jsonb_typeof(body) = 'object'),
  add constraint webhook_deliveries_attempts_check
    check (attempts >= 0),
  add constraint webhook_deliveries_schedule_check
    check ((status in ('pending', 'retrying')) = (next_attempt_at is not null)),
  add constraint webhook_deliveries_delivered_check
    check ((status = 'delivered') = (delivered_at is not null)),
  add constraint webhook_deliveries_failure_check
    check (last_failure is null
           or last_failure in ('http_error', 'timeout', 'connection_failed',
                               'tls_failed', 'blocked_address', 'invalid_target',
                               'redirect_refused', 'source_mismatch')),
  -- A lease is held for as long as the delivery is claimed and no longer.
  add constraint webhook_deliveries_lease_check
    check ((claimed_until is null) = (lease_id is null)),
  add constraint webhook_deliveries_status_code_check
    check (last_status_code is null or last_status_code between 100 and 599),
  add constraint webhook_deliveries_excerpt_check
    check (last_response_excerpt is null or char_length(last_response_excerpt) <= 200),
  add constraint webhook_deliveries_duration_check
    check (last_duration_ms is null or last_duration_ms >= 0);

create index webhook_deliveries_due_idx
  on public.webhook_deliveries (next_attempt_at)
  where status in ('pending', 'retrying');

alter table public.failed_operations
  drop constraint failed_operations_status_check,
  drop constraint failed_operations_attempts_check,
  add constraint failed_operations_status_check
    check (status in ('failed', 'retrying', 'resolved', 'cancelled')),
  -- A row from before this migration has no delivery and no endpoint, and a
  -- person can still close it: the check is not VALID so it is not tested
  -- against what is there, and it lets such a row be updated only into a
  -- closed state, which is all that can be done to it. Every row written from
  -- now on belongs to a delivery, because nothing but the functions below
  -- writes one.
  add constraint failed_operations_has_a_delivery_check
    check ((delivery_id is not null and endpoint_id is not null)
           or closed_at is not null) not valid,
  add constraint failed_operations_closure_check
    check (delivery_id is null
           or (status in ('resolved', 'cancelled')) = (closed_at is not null)),
  -- A delivery that was never sent (its event did not match its source) has
  -- made no attempt.
  add constraint failed_operations_attempts_check
    check (attempts >= 0),
  add constraint failed_operations_closed_reason_check
    check (closed_reason is null or char_length(btrim(closed_reason)) between 3 and 500);

comment on table public.webhook_endpoints is
  'A URL an Organization has asked Ranza to post chosen events to. Written by app.create_webhook_endpoint() and app.remove_webhook_endpoint() only (ADR 0045).';
comment on table public.webhook_endpoint_secrets is
  'The key a delivery is signed with. No application role holds a grant here; app.webhook_delivery_secret() hands it to the worker for the delivery it is sending.';
comment on column public.webhook_endpoint_secrets.secret is
  'Generated by Ranza, shown once to the person who registered the endpoint, and never readable by ranza_app afterwards.';
comment on table public.webhook_deliveries is
  'One event owed to one endpoint. Keyed by (endpoint, outbox event) so redelivery of the same event is the same row. Retried on app.webhook_retry_delay(); the worker reaches it through functions only.';
comment on column public.webhook_deliveries.body is
  'The JSON that is sent, frozen when the delivery is queued so that every attempt sends the same bytes. ranza_app has no column grant on it.';
comment on table public.failed_operations is
  'What an operator is shown when a delivery to an external system has not arrived: one row per delivery, from its first failed attempt until it is delivered, cancelled or resolved by a person. Written by functions only (ADR 0045).';

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.webhook_endpoints enable row level security;
alter table public.webhook_endpoints force row level security;
alter table public.webhook_endpoint_secrets enable row level security;
alter table public.webhook_endpoint_secrets force row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.webhook_deliveries force row level security;

-- Reading is integrations.view (or manage) behind the commercial gates, and not
-- behind whole-Organization reach: the list of endpoints says where the
-- Organization sends data, and a Manager of one Property is entitled to know
-- that. Changing it is a different matter and is the functions' (ADR 0012).
create policy webhook_endpoints_read_app
  on public.webhook_endpoints for select
  to ranza_app
  using (
    organization_id in (select app.accessible_organization_ids())
    and (
      app.has_organization_permission(organization_id, 'integrations.view')
      or app.has_organization_permission(organization_id, 'integrations.manage')
    )
    and app.can_use_capability_in_organization(
          organization_id, 'platform_core', 'integrations')
  );

-- A delivery has a Property, so reading one needs the reach to it.
create policy webhook_deliveries_read_app
  on public.webhook_deliveries for select
  to ranza_app
  using (
    organization_id in (select app.accessible_organization_ids())
    and property_id in (select app.accessible_property_ids())
    and (
      app.has_organization_permission(organization_id, 'integrations.view')
      or app.has_organization_permission(organization_id, 'integrations.manage')
    )
    and app.can_use_capability(property_id, 'platform_core', 'integrations')
  );

-- A failure is read like a delivery: it carries the same Property. The
-- commercial gate is new here; 20260916010000 asked it of writes only.
create policy failed_operations_read_app
  on public.failed_operations for select
  to ranza_app
  using (
    organization_id in (select app.accessible_organization_ids())
    and property_id in (select app.accessible_property_ids())
    and (
      app.has_organization_permission(organization_id, 'integrations.view')
      or app.has_organization_permission(organization_id, 'integrations.manage')
    )
    and app.can_use_capability(property_id, 'platform_core', 'integrations')
  );

-- No policy for any role on the secrets, and no policy that lets ranza_app
-- write any of the three tables: every write is a function below.
revoke all on public.webhook_endpoints, public.webhook_endpoint_secrets,
  public.webhook_deliveries from public, ranza_app, ranza_auth, ranza_worker;

-- Not `url`: the address can carry a token in its query string, and what a
-- reader may see of it depends on whether they manage endpoints, which a column
-- grant cannot say. app.webhook_endpoint_urls() answers that question.
grant select (id, organization_id, name, event_types, status, created_by,
              created_at, updated_at, removed_at)
  on public.webhook_endpoints to ranza_app;

-- Everything but the body. The body is what was sent to a third party, frozen;
-- a screen needs the outcome of sending it and not a second copy of it.
grant select (id, organization_id, endpoint_id, property_id, event_id, event_type,
              status, attempts, next_attempt_at, last_attempt_at, last_status_code,
              last_failure, last_response_excerpt, last_duration_ms, delivered_at,
              created_at, updated_at)
  on public.webhook_deliveries to ranza_app;

-- ---------------------------------------------------------------------------
-- The gates the commands below ask
-- ---------------------------------------------------------------------------

-- Invokers, called from the definers further down and from nowhere else:
-- executable by the owner alone.

-- Changing where an Organization sends its data: all four of blueprint 3.5's
-- gates, with reach to the WHOLE Organization because an endpoint receives the
-- events of every Property (the ledger's reasoning, 20260916010600).
--
-- The membership conjunct is implied: has_organization_wide_reach() and
-- has_organization_permission() each need an active membership, so deleting it
-- fails no test. It stays because the other two are helpers that may one day be
-- reshaped, and a membership check that is only implied is one change from
-- missing. The other three each fail a test of their own when removed.
create function app.webhook_endpoints_are_managed_by_caller(target_organization_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select target_organization_id in (select app.accessible_organization_ids())
     and app.has_organization_wide_reach(target_organization_id)
     and app.has_organization_permission(target_organization_id, 'integrations.manage')
     and app.can_use_capability_in_organization(
           target_organization_id, 'platform_core', 'integrations')
$$;

-- Acting on one failure: the permission, and the commercial gates and reach of
-- the Property it belongs to.
--
-- Two conjuncts are implied by can_use_capability(), which includes the
-- caller's reach to the Property and so their membership: deleting either
-- fails no test, and the reach to a failure's Property is asserted through the
-- capability clause. They stay for the reason above.
create function app.failed_operation_is_managed_by_caller(
  target_organization_id uuid,
  target_property_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select target_organization_id in (select app.accessible_organization_ids())
     and target_property_id in (select app.accessible_property_ids())
     and app.has_organization_permission(target_organization_id, 'integrations.manage')
     and app.can_use_capability(target_property_id, 'platform_core', 'integrations')
$$;

revoke execute on function app.webhook_endpoints_are_managed_by_caller(uuid)
  from public, ranza_app, ranza_auth, ranza_worker;
revoke execute on function app.failed_operation_is_managed_by_caller(uuid, uuid)
  from public, ranza_app, ranza_auth, ranza_worker;

-- ---------------------------------------------------------------------------
-- The commands a Staff Member runs
-- ---------------------------------------------------------------------------

-- Every command below writes its own audit record, in the statement that makes
-- the change, so there is no state in which the change happened and the record
-- of who made it did not: the module that calls these cannot forget it, and a
-- caller that is not the module cannot skip it. The actor is the signed-in
-- user, never an argument.
--
-- A helper and not a copy in each function, so the five columns an audit record
-- needs are spelled once. Invoker rights, executable by the owner alone: it is
-- only ever reached from the definers below, where the invoker is the owner.
create function app.record_webhook_audit(
  target_organization_id uuid,
  target_location_id uuid,
  audit_action text,
  audit_subject_type text,
  audit_subject_id uuid,
  audit_reason text,
  audit_context jsonb
)
returns void
language sql
volatile
set search_path = ''
as $$
  insert into audit.records
    (organization_id, location_id, actor_id, action, subject_type, subject_id,
     reason, context)
  values
    (target_organization_id, target_location_id, app.current_user_id(), audit_action,
     audit_subject_type, audit_subject_id, audit_reason, coalesce(audit_context, '{}'::jsonb))
$$;

revoke execute on function app.record_webhook_audit(uuid, uuid, text, text, uuid, text, jsonb)
  from public, ranza_app, ranza_auth, ranza_worker;

-- Why a person closed a failure: three to five hundred characters once the ends
-- are trimmed. Null is refused here, not left to the table's check, which
-- passes a null; the screen and the module refuse it too, and this is the one
-- that holds when they are not the caller.
create function app.webhook_closure_reason(candidate text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if candidate is null or char_length(btrim(candidate)) not between 3 and 500 then
    raise exception 'a reason of three to five hundred characters is required'
      using errcode = '23514';
  end if;
  return btrim(candidate);
end;
$$;

revoke execute on function app.webhook_closure_reason(text)
  from public, ranza_app, ranza_auth, ranza_worker;

-- The secret is generated by the caller and passed in, and that is deliberate:
-- the application shows it to the person once, so it has to hold it for that
-- long anyway, and generating it here would only add an extension to the
-- database. What matters is that this is the last place it is written and that
-- nothing readable by ranza_app stores it.
--
-- One refusal message for every gate, so a caller learns nothing about which of
-- them held them back.
--
-- The cap is counted under a lock on the Organization's endpoints: two people
-- registering their tenth endpoint at the same moment would otherwise each
-- count nine and both succeed.
create function app.create_webhook_endpoint(
  target_organization_id uuid,
  endpoint_name text,
  endpoint_url text,
  endpoint_events text[],
  endpoint_secret text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := app.current_user_id();
  created_id uuid;
begin
  if actor is null or not app.webhook_endpoints_are_managed_by_caller(target_organization_id) then
    raise exception 'registering a webhook needs integrations.manage with reach to the whole Organization'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('webhook_endpoints:' || target_organization_id::text, 0));

  if (select count(*) from public.webhook_endpoints as endpoint
       where endpoint.organization_id = target_organization_id
         and endpoint.status = 'active') >= 10 then
    raise exception 'an Organization registers at most ten webhook endpoints'
      using errcode = '54000';
  end if;

  if exists (select 1 from public.webhook_endpoints as endpoint
              where endpoint.organization_id = target_organization_id
                and endpoint.status = 'active'
                and endpoint.url = endpoint_url) then
    raise exception 'that address is already registered'
      using errcode = '23505';
  end if;

  insert into public.webhook_endpoints
    (organization_id, name, url, event_types, created_by)
  values
    (target_organization_id, btrim(endpoint_name), endpoint_url, endpoint_events, actor)
  returning id into created_id;

  insert into public.webhook_endpoint_secrets (endpoint_id, secret)
  values (created_id, endpoint_secret);

  -- The host and the events, and never the path or the query: a URL can carry
  -- a token in either.
  perform app.record_webhook_audit(
    target_organization_id, null, 'webhook_endpoint.registered', 'webhook_endpoint',
    created_id, null,
    jsonb_build_object(
      'host', substring(endpoint_url from '^https?://([^/?#:]+)'),
      'eventTypes', to_jsonb(endpoint_events)));

  return created_id;
end;
$$;

-- A removed endpoint keeps its row: its deliveries and failures are history.
-- It loses its secret, so nothing can be signed for it again, and what was
-- still on its way is cancelled with the name of the person who removed it.
create function app.remove_webhook_endpoint(target_endpoint_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := app.current_user_id();
  endpoint_organization uuid;
begin
  select endpoint.organization_id into endpoint_organization
    from public.webhook_endpoints as endpoint
   where endpoint.id = target_endpoint_id
     and endpoint.status = 'active'
     for update;

  if actor is null
     or endpoint_organization is null
     or not app.webhook_endpoints_are_managed_by_caller(endpoint_organization) then
    raise exception 'removing a webhook needs integrations.manage with reach to the whole Organization'
      using errcode = '42501';
  end if;

  update public.webhook_endpoints
     set status = 'removed', removed_at = now(), updated_at = now()
   where id = target_endpoint_id;

  delete from public.webhook_endpoint_secrets where endpoint_id = target_endpoint_id;

  update public.webhook_deliveries
     set status = 'cancelled', next_attempt_at = null, claimed_until = null,
         lease_id = null, updated_at = now()
   where endpoint_id = target_endpoint_id
     and status in ('pending', 'retrying');

  update public.failed_operations
     set status = 'cancelled', next_attempt_at = null, closed_by = actor,
         closed_at = now(), closed_reason = 'endpoint removed', updated_at = now()
   where endpoint_id = target_endpoint_id
     and status in ('failed', 'retrying');

  perform app.record_webhook_audit(
    endpoint_organization, null, 'webhook_endpoint.removed', 'webhook_endpoint',
    target_endpoint_id, null, null);

  return true;
end;
$$;

-- A test event is a delivery with no outbox event behind it. It is filed at a
-- Property, the one the person is working in, because a failure has to appear
-- somewhere on the Integrations screen and that screen is read by Property.
-- One at a time: an endpoint that is slow to answer is not given a queue of
-- test events by a button that was pressed three times.
create function app.send_webhook_test(target_endpoint_id uuid, target_property_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := app.current_user_id();
  endpoint_organization uuid;
  delivery_id uuid := gen_random_uuid();
begin
  select endpoint.organization_id into endpoint_organization
    from public.webhook_endpoints as endpoint
   where endpoint.id = target_endpoint_id
     and endpoint.status = 'active'
     for update;

  if actor is null
     or endpoint_organization is null
     or not app.webhook_endpoints_are_managed_by_caller(endpoint_organization) then
    raise exception 'sending a test event needs integrations.manage with reach to the whole Organization'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.properties as property
                  where property.id = target_property_id
                    and property.organization_id = endpoint_organization) then
    raise exception 'that Property is not this Organization''s'
      using errcode = '22023';
  end if;

  if exists (select 1 from public.webhook_deliveries as delivery
              where delivery.endpoint_id = target_endpoint_id
                and delivery.event_type = 'webhook.test'
                and delivery.status in ('pending', 'retrying')) then
    raise exception 'a test event is already on its way to this endpoint'
      using errcode = '55000';
  end if;

  insert into public.webhook_deliveries
    (id, organization_id, endpoint_id, property_id, event_id, event_type, body, next_attempt_at)
  values (
    delivery_id, endpoint_organization, target_endpoint_id, target_property_id,
    null, 'webhook.test',
    jsonb_build_object(
      'id', delivery_id,
      'type', 'webhook.test',
      'occurredAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'organizationId', endpoint_organization,
      'propertyId', target_property_id,
      'data', '{}'::jsonb),
    now());

  perform app.record_webhook_audit(
    endpoint_organization, target_property_id, 'webhook_endpoint.test_sent',
    'webhook_endpoint', target_endpoint_id, null, null);

  return delivery_id;
end;
$$;

-- Retry is a delivery put back in the queue, due now. It does not touch the
-- failure's attempts or resolve it: the worker's next attempt does both, and
-- only a delivery that arrives resolves anything.
--
-- Not for a failure that has no delivery (one from before this migration has
-- nothing to send), and not for one whose event did not match its source: its
-- body is empty by design, and sending it again would be sending nothing.
create function app.retry_failed_operation(target_operation_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := app.current_user_id();
  operation record;
begin
  select failure.id, failure.organization_id, failure.property_id,
         failure.delivery_id, failure.status, failure.error
    into operation
    from public.failed_operations as failure
   where failure.id = target_operation_id
     for update;

  if actor is null
     or not found
     or not app.failed_operation_is_managed_by_caller(
              operation.organization_id, operation.property_id) then
    raise exception 'retrying a failed operation needs integrations.manage at its Property'
      using errcode = '42501';
  end if;

  if operation.delivery_id is null
     or operation.status not in ('failed', 'retrying')
     or operation.error = 'source_mismatch' then
    raise exception 'that failure cannot be sent again'
      using errcode = '22023';
  end if;

  update public.webhook_deliveries as delivery
     set status = 'retrying', next_attempt_at = now(), updated_at = now()
   where delivery.id = operation.delivery_id
     and delivery.status in ('retrying', 'failed')
     and exists (select 1 from public.webhook_endpoints as endpoint
                  where endpoint.id = delivery.endpoint_id and endpoint.status = 'active');

  if not found then
    raise exception 'that endpoint no longer takes deliveries'
      using errcode = '22023';
  end if;

  update public.failed_operations
     set status = 'retrying', next_attempt_at = now(), updated_at = now()
   where id = operation.id;

  perform app.record_webhook_audit(
    operation.organization_id, operation.property_id, 'failed_operation.retried',
    'failed_operation', operation.id, null, null);

  return 'retrying';
end;
$$;

-- A person stops a delivery that is still being retried. Whoever did, and why,
-- stays on the failure. A failure from before this migration has no delivery to
-- stop and can be closed all the same, because it is the one thing a person can
-- still do with it.
create function app.cancel_failed_operation(target_operation_id uuid, cancel_reason text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := app.current_user_id();
  operation record;
  stated_reason text;
begin
  select failure.id, failure.organization_id, failure.property_id,
         failure.delivery_id, failure.status
    into operation
    from public.failed_operations as failure
   where failure.id = target_operation_id
     for update;

  if actor is null
     or not found
     or not app.failed_operation_is_managed_by_caller(
              operation.organization_id, operation.property_id) then
    raise exception 'cancelling a failed operation needs integrations.manage at its Property'
      using errcode = '42501';
  end if;

  stated_reason := app.webhook_closure_reason(cancel_reason);

  if operation.status <> 'retrying' then
    raise exception 'only a delivery that is still being retried can be cancelled'
      using errcode = '22023';
  end if;

  update public.webhook_deliveries
     set status = 'cancelled', next_attempt_at = null, claimed_until = null,
         lease_id = null, updated_at = now()
   where id = operation.delivery_id
     and status in ('pending', 'retrying');

  update public.failed_operations
     set status = 'cancelled', next_attempt_at = null, closed_by = actor,
         closed_at = now(), closed_reason = stated_reason, updated_at = now()
   where id = operation.id;

  perform app.record_webhook_audit(
    operation.organization_id, operation.property_id, 'failed_operation.cancelled',
    'failed_operation', operation.id, stated_reason, null);

  return 'cancelled';
end;
$$;

-- A person accepts that a delivery which has run out of attempts is not going
-- to arrive, because they dealt with it another way. The delivery stays
-- `failed` (it did fail); the failure stops being asked about. A failure from
-- before this migration is closed the same way, whichever of its two old states
-- it was in.
create function app.resolve_failed_operation(target_operation_id uuid, resolve_reason text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := app.current_user_id();
  operation record;
  stated_reason text;
begin
  select failure.id, failure.organization_id, failure.property_id,
         failure.delivery_id, failure.status
    into operation
    from public.failed_operations as failure
   where failure.id = target_operation_id
     for update;

  if actor is null
     or not found
     or not app.failed_operation_is_managed_by_caller(
              operation.organization_id, operation.property_id) then
    raise exception 'resolving a failed operation needs integrations.manage at its Property'
      using errcode = '42501';
  end if;

  stated_reason := app.webhook_closure_reason(resolve_reason);

  if operation.status <> 'failed'
     and not (operation.delivery_id is null and operation.status = 'retrying') then
    raise exception 'only a delivery that has stopped being retried can be marked resolved'
      using errcode = '22023';
  end if;

  update public.failed_operations
     set status = 'resolved', next_attempt_at = null, closed_by = actor,
         closed_at = now(), closed_reason = stated_reason, updated_at = now()
   where id = operation.id;

  perform app.record_webhook_audit(
    operation.organization_id, operation.property_id, 'failed_operation.resolved',
    'failed_operation', operation.id, stated_reason, null);

  return 'resolved';
end;
$$;

-- The address of each endpoint, as the caller is entitled to read it. A URL can
-- carry a token in its query string (and a Staff Member who may only view the
-- list has no use for it), so the full address is the managers', and everyone
-- else reads it up to the `?` with a flag that says something was cut. The
-- column itself has no grant for ranza_app: a masked address that could be read
-- unmasked through the table would be a label and not a boundary.
create function app.webhook_endpoint_urls(target_organization_id uuid)
returns table (endpoint_id uuid, url text, url_masked boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with caller as (
    select app.webhook_endpoints_are_managed_by_caller(target_organization_id) as manages
  )
  select endpoint.id,
         case when caller.manages then endpoint.url
              else regexp_replace(endpoint.url, '[?#].*$', '') end,
         (not caller.manages) and endpoint.url ~ '[?#]'
    from public.webhook_endpoints as endpoint
    cross join caller
   where endpoint.organization_id = target_organization_id
     and endpoint.status = 'active'
     and target_organization_id in (select app.accessible_organization_ids())
     and (app.has_organization_permission(target_organization_id, 'integrations.view')
          or app.has_organization_permission(target_organization_id, 'integrations.manage'))
     and app.can_use_capability_in_organization(
           target_organization_id, 'platform_core', 'integrations')
$$;

revoke execute on function app.create_webhook_endpoint(uuid, text, text, text[], text)
  from public, ranza_auth, ranza_worker;
revoke execute on function app.remove_webhook_endpoint(uuid)
  from public, ranza_auth, ranza_worker;
revoke execute on function app.send_webhook_test(uuid, uuid)
  from public, ranza_auth, ranza_worker;
revoke execute on function app.retry_failed_operation(uuid)
  from public, ranza_auth, ranza_worker;
revoke execute on function app.cancel_failed_operation(uuid, text)
  from public, ranza_auth, ranza_worker;
revoke execute on function app.resolve_failed_operation(uuid, text)
  from public, ranza_auth, ranza_worker;
revoke execute on function app.webhook_endpoint_urls(uuid)
  from public, ranza_auth, ranza_worker;
grant execute on function app.create_webhook_endpoint(uuid, text, text, text[], text) to ranza_app;
grant execute on function app.remove_webhook_endpoint(uuid) to ranza_app;
grant execute on function app.send_webhook_test(uuid, uuid) to ranza_app;
grant execute on function app.retry_failed_operation(uuid) to ranza_app;
grant execute on function app.cancel_failed_operation(uuid, text) to ranza_app;
grant execute on function app.resolve_failed_operation(uuid, text) to ranza_app;
grant execute on function app.webhook_endpoint_urls(uuid) to ranza_app;

-- ---------------------------------------------------------------------------
-- The worker's half
-- ---------------------------------------------------------------------------

-- What an event is about, read from the row it is about and not from what the
-- event says.
--
-- The payload of an outbox event is writable by any member of the Organization
-- (events_publish_own_scope), so it is a claim and never evidence. What goes
-- out is built here from the reservation, the stay or the folio line the event
-- names; the payload supplies only the id of that row and the identifiers it
-- asserts around it, and those are compared with the row. No row, a row in
-- another Organization, a row that is not in the state the event type says, or
-- an identifier that disagrees with the row: no result, and the caller records
-- that the event was not sent.
--
-- The identifiers compared are the ones that cannot change after the event is
-- published (a Property, the Stay a Folio belongs to, a line's type). A Unit a
-- Reservation sits in can be moved, so it is sent as it is now and not
-- compared, or an event handled after a room move would be refused for being
-- right.
create function app.webhook_uuid(candidate text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then candidate::uuid
  end
$$;

-- Whether every identifier the event asserted is the one the row has. A key
-- the event does not carry, or carries as null, asserts nothing.
create function app.webhook_claims_agree(claimed jsonb, actual jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not exists (
    select 1
      from jsonb_each_text(actual) as fact
     where claimed ->> fact.key is not null
       and claimed ->> fact.key is distinct from fact.value)
$$;

create function app.webhook_event_source(
  source_organization_id uuid,
  source_event_type text,
  source_payload jsonb
)
returns table (source_property_id uuid, source_data jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claimed jsonb := case when jsonb_typeof(source_payload) = 'object'
                        then source_payload else '{}'::jsonb end;
begin
  if source_event_type in ('reservation.created', 'reservation.cancelled', 'reservation.no_show') then
    return query
    select reservation.property_id,
           jsonb_build_object(
             'reservationId', reservation.id,
             'propertyId', reservation.property_id,
             'accommodationUnitId', reservation.accommodation_unit_id)
      from public.reservations as reservation
     where reservation.id = app.webhook_uuid(claimed ->> 'reservationId')
       and reservation.organization_id = source_organization_id
       and (source_event_type = 'reservation.created'
            or reservation.status = case source_event_type
                 when 'reservation.cancelled' then 'cancelled' else 'no_show' end)
       and app.webhook_claims_agree(claimed,
             jsonb_build_object('propertyId', reservation.property_id));

  elsif source_event_type = 'stay.checked_in' then
    return query
    select stay.property_id,
           jsonb_build_object(
             'stayId', stay.id,
             'reservationId', stay.reservation_id,
             'propertyId', stay.property_id,
             'accommodationUnitId', stay.accommodation_unit_id,
             'folioId', folio.id)
      from public.stays as stay
      left join public.folios as folio
        on folio.stay_id = stay.id and folio.organization_id = stay.organization_id
     where stay.id = app.webhook_uuid(claimed ->> 'stayId')
       and stay.organization_id = source_organization_id
       and stay.status in ('in_house', 'departed')
       and app.webhook_claims_agree(claimed,
             jsonb_build_object('propertyId', stay.property_id,
                                'reservationId', stay.reservation_id));

  elsif source_event_type = 'stay.checked_out' then
    return query
    select stay.property_id,
           jsonb_build_object(
             'stayId', stay.id,
             'accommodationUnitId', stay.accommodation_unit_id,
             'departedOn', to_char(stay.ends_on, 'YYYY-MM-DD'),
             'folioId', folio.id,
             'folioClosed', coalesce(folio.status = 'closed', false))
      from public.stays as stay
      left join public.folios as folio
        on folio.stay_id = stay.id and folio.organization_id = stay.organization_id
     where stay.id = app.webhook_uuid(claimed ->> 'stayId')
       and stay.organization_id = source_organization_id
       and stay.status = 'departed'
       and app.webhook_claims_agree(claimed,
             jsonb_build_object('departedOn', to_char(stay.ends_on, 'YYYY-MM-DD'),
                                'folioId', folio.id));

  elsif source_event_type = 'folio.line_posted' then
    return query
    select line.property_id,
           jsonb_build_object(
             'lineId', line.id,
             'propertyId', line.property_id,
             'folioId', line.folio_id,
             'lineType', line.line_type,
             'amountMinor', line.amount_minor,
             'currency', folio.currency::text,
             'paymentMethod', line.payment_method,
             'reversesLineId', line.reverses_line_id,
             'source', line.source)
      from public.folio_lines as line
      join public.folios as folio
        on folio.id = line.folio_id and folio.organization_id = line.organization_id
     where line.id = app.webhook_uuid(claimed ->> 'lineId')
       and line.organization_id = source_organization_id
       and app.webhook_claims_agree(claimed,
             jsonb_build_object('propertyId', line.property_id,
                                'folioId', line.folio_id,
                                'lineType', line.line_type));
  end if;
end;
$$;

revoke execute on function app.webhook_uuid(text)
  from public, ranza_app, ranza_auth, ranza_worker;
revoke execute on function app.webhook_claims_agree(jsonb, jsonb)
  from public, ranza_app, ranza_auth, ranza_worker;
revoke execute on function app.webhook_event_source(uuid, text, jsonb)
  from public, ranza_app, ranza_auth, ranza_worker;

-- Called by a handler inside the dispatcher's transaction, with the delivery
-- record, so the deliveries it queues and the record that it queued them commit
-- or roll back together (ADR 0017). It takes the event, not the payload, and
-- what it queues is built from the row the event is about
-- (app.webhook_event_source), through the key and value filter above as a
-- second line of defence.
--
-- An event whose source does not check out is not sent. Each endpoint that
-- would have received it gets a delivery that is already `failed` with the
-- reason `source_mismatch` and an empty body, and the failure an operator is
-- shown, so a forged or tampered event is a line on the screen and a row in the
-- table and never a request to a third party. It is filed at the Property the
-- event named when that is one of the Organization's, and otherwise at its
-- oldest Property, because a failure has to be somewhere a person looks.
--
-- Returns how many deliveries were queued and how many were refused. An event
-- nothing subscribes to queues nothing and says so.
create function app.enqueue_webhook_deliveries(target_event_id uuid)
returns table (queued_count integer, refused_count integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  acting_organization uuid := app.worker_organization_id();
  source_event record;
  built record;
  filing_property uuid;
  queued integer;
  refused integer;
begin
  if acting_organization is null then
    raise exception 'queueing webhook deliveries requires a worker context'
      using errcode = '42501';
  end if;

  select e.organization_id, e.event_type, e.payload, e.occurred_at
    into source_event
    from outbox.events as e
   where e.id = target_event_id;

  if not found then
    raise exception 'there is no outbox event %', target_event_id
      using errcode = 'P0002';
  end if;

  if source_event.organization_id <> acting_organization then
    raise exception 'that event belongs to another Organization'
      using errcode = '42501';
  end if;

  if app.webhook_event_keys(source_event.event_type) is null
     or not exists (select 1 from public.webhook_endpoints as endpoint
                     where endpoint.organization_id = acting_organization
                       and endpoint.status = 'active'
                       and source_event.event_type = any (endpoint.event_types)) then
    return query select 0, 0;
    return;
  end if;

  select origin.source_property_id, origin.source_data
    into built
    from app.webhook_event_source(
           acting_organization, source_event.event_type, source_event.payload) as origin;

  if not found then
    select property.id
      into filing_property
      from public.properties as property
     where property.organization_id = acting_organization
     order by coalesce(property.id = app.webhook_uuid(source_event.payload ->> 'propertyId'), false) desc,
              property.created_at, property.id
     limit 1;

    if filing_property is null then
      raise exception 'event % has no source and the Organization has no Property to file it at', target_event_id
        using errcode = '22023';
    end if;

    insert into public.webhook_deliveries
      (organization_id, endpoint_id, property_id, event_id, event_type, body,
       status, last_failure, last_attempt_at)
    select acting_organization, endpoint.id, filing_property, target_event_id,
           source_event.event_type, '{}'::jsonb, 'failed', 'source_mismatch', now()
      from public.webhook_endpoints as endpoint
     where endpoint.organization_id = acting_organization
       and endpoint.status = 'active'
       and source_event.event_type = any (endpoint.event_types)
    on conflict (endpoint_id, event_id) do nothing;

    get diagnostics refused = row_count;

    insert into public.failed_operations
      (organization_id, property_id, endpoint_id, delivery_id, integration_name,
       operation, error, status, attempts, last_attempt_at)
    select acting_organization, delivery.property_id, delivery.endpoint_id, delivery.id,
           endpoint.name, delivery.event_type, 'source_mismatch', 'failed', 0, now()
      from public.webhook_deliveries as delivery
      join public.webhook_endpoints as endpoint on endpoint.id = delivery.endpoint_id
     where delivery.organization_id = acting_organization
       and delivery.event_id = target_event_id
       and delivery.last_failure = 'source_mismatch'
    on conflict (delivery_id, organization_id) do nothing;

    return query select 0, refused;
    return;
  end if;

  insert into public.webhook_deliveries
    (organization_id, endpoint_id, property_id, event_id, event_type, body, next_attempt_at)
  select
    acting_organization, endpoint.id, built.source_property_id, target_event_id,
    source_event.event_type,
    jsonb_build_object(
      'id', target_event_id,
      'type', source_event.event_type,
      'occurredAt', to_char(source_event.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'organizationId', acting_organization,
      'propertyId', built.source_property_id,
      'data', app.webhook_event_data(source_event.event_type, built.source_data)),
    now()
    from public.webhook_endpoints as endpoint
   where endpoint.organization_id = acting_organization
     and endpoint.status = 'active'
     and source_event.event_type = any (endpoint.event_types)
  on conflict (endpoint_id, event_id) do nothing;

  get diagnostics queued = row_count;
  return query select queued, 0;
end;
$$;

-- Which deliveries are due, across every Organization, and nothing else: ids.
-- Like the export and close-the-day lists it needs no Organization context,
-- because finding out which Organizations have work is what it is for (ADR
-- 0018); it writes nothing and returns neither a target nor a body. The worker
-- then sets context per delivery and claims it.
--
-- At most one per endpoint, and the oldest: an endpoint receives its deliveries
-- one at a time, in the order they were queued, and none while another is on
-- the wire. A delivery that is waiting for its next retry does not hold the
-- ones behind it back; an endpoint that has been down for a day is not given a
-- day of silence about everything else (ADR 0045).
create function app.due_webhook_deliveries(batch_size integer)
returns table (delivery_id uuid, organization_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select oldest.id, oldest.organization_id
    from (
      select distinct on (delivery.endpoint_id)
             delivery.id, delivery.organization_id, delivery.next_attempt_at
        from public.webhook_deliveries as delivery
        join public.webhook_endpoints as endpoint
          on endpoint.id = delivery.endpoint_id and endpoint.status = 'active'
       where delivery.status in ('pending', 'retrying')
         and delivery.next_attempt_at <= now()
         and (delivery.claimed_until is null or delivery.claimed_until < now())
         and not exists (select 1 from public.webhook_deliveries as other
                          where other.endpoint_id = delivery.endpoint_id
                            and other.claimed_until > now())
       order by delivery.endpoint_id, delivery.created_at, delivery.id
    ) as oldest
   order by oldest.next_attempt_at
   limit least(greatest(batch_size, 1), 50)
$$;

-- Takes the lease on one due delivery, in its own Organization's context, for
-- five minutes, and returns what is needed to send it: the target, the frozen
-- body, the number of the attempt about to be made, and the lease. No row when
-- another replica holds it, or holds another delivery of the same endpoint, or
-- it is no longer due. Never the secret.
--
-- The endpoint's row is locked before the lease is looked for, and the check
-- for a lease on a sibling delivery is made in a statement that starts after
-- the lock is held: two replicas claiming two deliveries of one endpoint at the
-- same moment would otherwise each find the other's lease not yet committed
-- and both send. `no key update` so the deliveries being inserted against the
-- endpoint (a foreign key takes `key share`) are not held up.
--
-- The lease is a token and not a time. The worker presents it to read the
-- secret and to record the outcome, and a delivery that has been leased again
-- since has a different one, so an attempt that outlived its lease cannot write
-- over the one that replaced it.
create function app.claim_webhook_delivery(target_delivery_id uuid)
returns table (
  url text,
  event_id uuid,
  event_type text,
  body jsonb,
  attempt integer,
  lease_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  acting_organization uuid := app.worker_organization_id();
  due_endpoint uuid;
begin
  if acting_organization is null then
    raise exception 'claiming a webhook delivery requires a worker context'
      using errcode = '42501';
  end if;

  select delivery.endpoint_id
    into due_endpoint
    from public.webhook_deliveries as delivery
    join public.webhook_endpoints as endpoint
      on endpoint.id = delivery.endpoint_id and endpoint.status = 'active'
   where delivery.id = target_delivery_id
     and delivery.organization_id = acting_organization
     and delivery.status in ('pending', 'retrying')
     and delivery.next_attempt_at <= now()
     and (delivery.claimed_until is null or delivery.claimed_until < now());

  if due_endpoint is null then
    return;
  end if;

  perform 1
     from public.webhook_endpoints as endpoint
    where endpoint.id = due_endpoint
      for no key update skip locked;

  if not found then
    return;
  end if;

  return query
  with ready as (
    select delivery.id
      from public.webhook_deliveries as delivery
     where delivery.id = target_delivery_id
       and delivery.organization_id = acting_organization
       and delivery.status in ('pending', 'retrying')
       and delivery.next_attempt_at <= now()
       and (delivery.claimed_until is null or delivery.claimed_until < now())
       and not exists (select 1 from public.webhook_deliveries as other
                        where other.endpoint_id = delivery.endpoint_id
                          and other.id <> delivery.id
                          and other.claimed_until > now())
       for update of delivery skip locked
  ),
  claimed as (
    update public.webhook_deliveries as leased
       set claimed_until = now() + interval '5 minutes',
           lease_id = gen_random_uuid(),
           updated_at = now()
      from ready
     where leased.id = ready.id
    returning leased.endpoint_id, leased.event_id, leased.event_type,
              leased.body, leased.attempts, leased.lease_id
  )
  select endpoint.url, claimed.event_id, claimed.event_type, claimed.body,
         claimed.attempts + 1, claimed.lease_id
    from claimed
    join public.webhook_endpoints as endpoint on endpoint.id = claimed.endpoint_id;
end;
$$;

-- The key the delivery being sent is signed with, to the worker, for a delivery
-- it holds the lease on in its own Organization and no other. Null for any
-- other: an endpoint removed while the worker was on its way here is an
-- ordinary event, not a fault, and the delivery has been cancelled.
create function app.webhook_delivery_secret(target_delivery_id uuid, target_lease_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  acting_organization uuid := app.worker_organization_id();
  signing_secret text;
begin
  if acting_organization is null then
    raise exception 'reading a signing secret requires a worker context'
      using errcode = '42501';
  end if;

  select signing_key.secret
    into signing_secret
    from public.webhook_deliveries as delivery
    join public.webhook_endpoint_secrets as signing_key on signing_key.endpoint_id = delivery.endpoint_id
   where delivery.id = target_delivery_id
     and delivery.organization_id = acting_organization
     and delivery.status in ('pending', 'retrying')
     and delivery.lease_id = target_lease_id
     and delivery.claimed_until > now();

  return signing_secret;
end;
$$;

-- The outcome of one attempt, and the whole of the state machine: delivered,
-- retried on app.webhook_retry_delay(), or failed for good. A failure that is
-- not delivered is written to failed_operations here, in the same transaction,
-- so a delivery cannot be failing without the screen saying so. Returns the
-- delivery's new status, or null when the attempt no longer counts: the
-- delivery was closed (cancelled by a person, say) while it was in flight, or
-- it has been leased again since this attempt's lease was taken. Neither is an
-- error; the newer state is the truth.
--
-- `failure` is a code from a fixed list and `response_excerpt` is at most 200
-- characters the receiver sent back; neither is ever the exception text of the
-- worker.
create function app.record_webhook_attempt(
  target_delivery_id uuid,
  target_lease_id uuid,
  attempt_outcome text,
  response_status integer,
  failure_code text,
  response_excerpt text,
  duration_milliseconds integer
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  acting_organization uuid := app.worker_organization_id();
  current_delivery record;
  attempt_number integer;
  delay interval;
  next_status text;
begin
  if acting_organization is null then
    raise exception 'recording a delivery requires a worker context'
      using errcode = '42501';
  end if;

  if attempt_outcome not in ('delivered', 'retryable', 'permanent') then
    raise exception 'an attempt is delivered, retryable or permanent, not %', attempt_outcome
      using errcode = '22023';
  end if;

  if attempt_outcome <> 'delivered' and failure_code is null then
    raise exception 'an attempt that did not arrive names why'
      using errcode = '22023';
  end if;

  select delivery.id, delivery.property_id, delivery.endpoint_id,
         delivery.event_type, delivery.attempts
    into current_delivery
    from public.webhook_deliveries as delivery
   where delivery.id = target_delivery_id
     and delivery.organization_id = acting_organization
     and delivery.status in ('pending', 'retrying')
     and delivery.lease_id = target_lease_id
     for update;

  if not found then
    return null;
  end if;

  attempt_number := current_delivery.attempts + 1;
  delay := case when attempt_outcome = 'retryable'
                then app.webhook_retry_delay(attempt_number) end;
  next_status := case
    when attempt_outcome = 'delivered' then 'delivered'
    when attempt_outcome = 'retryable' and delay is not null then 'retrying'
    else 'failed'
  end;

  update public.webhook_deliveries
     set status = next_status,
         attempts = attempt_number,
         next_attempt_at = case when next_status = 'retrying' then now() + delay end,
         claimed_until = null,
         lease_id = null,
         last_attempt_at = now(),
         last_status_code = response_status,
         last_failure = case when next_status = 'delivered' then null else failure_code end,
         last_response_excerpt = left(response_excerpt, 200),
         last_duration_ms = duration_milliseconds,
         delivered_at = case when next_status = 'delivered' then now() end,
         updated_at = now()
   where id = current_delivery.id;

  if next_status = 'delivered' then
    update public.failed_operations
       set status = 'resolved', next_attempt_at = null, attempts = attempt_number,
           closed_at = now(), closed_reason = 'delivered', last_attempt_at = now(),
           updated_at = now()
     where delivery_id = current_delivery.id
       and organization_id = acting_organization
       and status in ('failed', 'retrying');
  else
    insert into public.failed_operations
      (organization_id, property_id, endpoint_id, delivery_id, integration_name,
       operation, error, status, attempts, next_attempt_at, last_attempt_at)
    select acting_organization, current_delivery.property_id, current_delivery.endpoint_id,
           current_delivery.id, endpoint.name, current_delivery.event_type,
           failure_code, next_status, attempt_number,
           case when next_status = 'retrying' then now() + delay end, now()
      from public.webhook_endpoints as endpoint
     where endpoint.id = current_delivery.endpoint_id
    on conflict (delivery_id, organization_id) do update
      set status = excluded.status,
          error = excluded.error,
          attempts = excluded.attempts,
          next_attempt_at = excluded.next_attempt_at,
          last_attempt_at = excluded.last_attempt_at,
          updated_at = now()
      where public.failed_operations.status in ('failed', 'retrying');
  end if;

  return next_status;
end;
$$;

revoke execute on function app.enqueue_webhook_deliveries(uuid)
  from public, ranza_app, ranza_auth;
revoke execute on function app.due_webhook_deliveries(integer)
  from public, ranza_app, ranza_auth;
revoke execute on function app.claim_webhook_delivery(uuid)
  from public, ranza_app, ranza_auth;
revoke execute on function app.webhook_delivery_secret(uuid, uuid)
  from public, ranza_app, ranza_auth;
revoke execute on function app.record_webhook_attempt(uuid, uuid, text, integer, text, text, integer)
  from public, ranza_app, ranza_auth;
grant execute on function app.enqueue_webhook_deliveries(uuid) to ranza_worker;
grant execute on function app.due_webhook_deliveries(integer) to ranza_worker;
grant execute on function app.claim_webhook_delivery(uuid) to ranza_worker;
grant execute on function app.webhook_delivery_secret(uuid, uuid) to ranza_worker;
grant execute on function app.record_webhook_attempt(uuid, uuid, text, integer, text, text, integer)
  to ranza_worker;
