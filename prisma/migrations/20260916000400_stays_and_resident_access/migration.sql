-- The Stay, and the second way into the database it opens.
--
-- A Stay connects a Guest or Resident to an Accommodation Unit for a period
-- (blueprint 2 and 5.3). That much is an ordinary Property-scoped table. What
-- is not ordinary is who it lets in.
--
-- Every policy written so far grants access through organization_memberships or
-- property_assignments: the reader is Staff. A Resident has neither and never
-- will. So this migration adds a second access path through the same tables —
-- same app.current_user_id(), different rows — rather than widening the Staff
-- policies to let a non-Staff reader through. ADR 0008 explains why that
-- distinction is load-bearing and what every later module must assume.
--
-- ADR 0001: Prisma generated the table below; everything beneath it is
-- hand-written in this same file because Prisma models none of it.

-- CreateTable
CREATE TABLE "stays" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "accommodation_unit_id" UUID NOT NULL,
    "user_id" UUID,
    "stay_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stays_property_idx" ON "stays"("property_id");

-- AddForeignKey
ALTER TABLE "stays" ADD CONSTRAINT "stays_property_id_organization_id_fkey" FOREIGN KEY ("property_id", "organization_id") REFERENCES "properties"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stays" ADD CONSTRAINT "stays_accommodation_unit_id_property_id_organization_id_fkey" FOREIGN KEY ("accommodation_unit_id", "property_id", "organization_id") REFERENCES "accommodation_units"("id", "property_id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stays" ADD CONSTRAINT "stays_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------
-- Hand-written from here down
-- ---------------------------------------------------------------------------

comment on column public.stays.user_id is
  'The Ranza user whose Stay this is, and what the Resident access path resolves against (ADR 0008). Null for a Stay whose occupant has never signed in.';

alter table public.stays
  add constraint stays_stay_type_check
    check (stay_type in ('guest', 'resident')),
  add constraint stays_status_check
    check (status in ('reserved', 'in_house', 'departed', 'cancelled')),
  add constraint stays_period_check
    check (ends_on is null or ends_on >= starts_on);

-- Open-ended on purpose: a Resident's accommodation often has no agreed end
-- date, and inventing one would be a business rule this module has no mandate
-- to make up.
comment on column public.stays.ends_on is
  'Null means open-ended, which is normal for long-term residence.';

-- Partial, because the Resident access path only ever asks about a Stay that is
-- current. Prisma cannot express a partial index, so it lives only here.
create index stays_user_idx on public.stays (user_id)
  where status in ('reserved', 'in_house');

-- ---------------------------------------------------------------------------
-- Gates 1-3, extracted
-- ---------------------------------------------------------------------------

-- Blueprint 3.5 gate 4 asks whether "the Staff Member or portal user has
-- permission for the action". Those are two different questions with two
-- different answers, but gates 1-3 — Subscription, Entitlement, Property
-- capability — are identical for both. Extracting them is what stops the Staff
-- and Resident paths from drifting apart: a Subscription suspended for Staff is
-- suspended for the Portal, because it is the same statement.
create function app.capability_is_available(
  target_property_id uuid,
  target_module_key text,
  target_capability_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- gate 1: the Organization holds an active Subscription
    exists (
      select 1
      from public.properties as property
      join public.subscriptions as subscription
        on subscription.organization_id = property.organization_id
      where property.id = target_property_id
        and subscription.status in ('trialing', 'active')
    )
    -- gate 2: the Subscription includes the Entitlement
    and exists (
      select 1
      from public.properties as property
      join public.entitlements as entitlement
        on entitlement.organization_id = property.organization_id
      where property.id = target_property_id
        and entitlement.module_key = target_module_key
        and entitlement.status = 'active'
    )
    -- gate 3: the capability is enabled for this Property
    and exists (
      select 1
      from public.property_capabilities as capability
      where capability.property_id = target_property_id
        and capability.capability_key = target_capability_key
        and capability.enabled
    );
$$;

comment on function app.capability_is_available(uuid, text, text) is
  'Gates 1-3 of blueprint 3.5: what the Organization bought and the Property '
  'turned on. Says nothing about who is asking.';

-- Unchanged in behaviour: gates 1-3 now come from the function above, and
-- gate 4 is still Staff reach. Argument names are preserved because Postgres
-- refuses to rename an input parameter in a replacement.
create or replace function app.can_use_capability(
  target_property_id uuid,
  target_module_key text,
  target_capability_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.capability_is_available(
           target_property_id, target_module_key, target_capability_key)
     and target_property_id in (select app.accessible_property_ids());
$$;

-- ---------------------------------------------------------------------------
-- The Resident access path (ADR 0008)
-- ---------------------------------------------------------------------------

-- security definer for the same reason as app.accessible_property_ids(): a
-- policy must be able to consult these rows without the reader holding read
-- access to them. A Resident can never select from public.stays freely — this
-- function is the only thing that does it on their behalf.
--
-- Only a current Stay grants reach. A departed Resident keeps their own Stay
-- record, which is theirs, but stops reaching the Property around it.
create function app.resident_stay_property_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct stay.property_id
  from public.stays as stay
  where stay.user_id = app.current_user_id()
    and stay.status in ('reserved', 'in_house');
$$;

create function app.resident_stay_accommodation_unit_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select stay.accommodation_unit_id
  from public.stays as stay
  where stay.user_id = app.current_user_id()
    and stay.status in ('reserved', 'in_house');
$$;

-- The Portal's equivalent of app.can_use_capability(): the same commercial
-- gates, a different answer to "who is asking".
--
-- Deliberately not a branch inside can_use_capability(). Two callers with two
-- authorization models sharing one function is how a widening to help one of
-- them quietly reaches the other.
create function app.resident_can_use_capability(
  target_property_id uuid,
  target_module_key text,
  target_capability_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.capability_is_available(
           target_property_id, target_module_key, target_capability_key)
     -- gate 4, for a Resident: a current Stay in this Property. Never a
     -- membership, never an assignment.
     and target_property_id in (select app.resident_stay_property_ids());
$$;

comment on function app.resident_can_use_capability(uuid, text, text) is
  'Gates 1-4 for a Guest or Resident in the Portal. A Staff membership grants '
  'nothing here, and a Stay grants nothing in app.can_use_capability().';

-- ---------------------------------------------------------------------------
-- Row-level security (gate 5)
-- ---------------------------------------------------------------------------

alter table public.stays enable row level security;
alter table public.stays force row level security;

-- Staff reach a Stay the way they reach everything else: through the Property.
create policy stays_read_accessible_property
  on public.stays for select
  using (property_id in (select app.accessible_property_ids()));

-- A Resident reaches their own Stay and nothing else. Null user_id never
-- matches, and neither does a null acting user, so both directions fail closed.
create policy stays_read_own
  on public.stays for select
  using (user_id = app.current_user_id());

-- The Property and the Unit around that Stay, and no others. These are separate
-- policies rather than additions to the Staff ones so that widening Staff reach
-- can never widen the Portal, and the reverse.
create policy properties_read_own_stay
  on public.properties for select
  using (id in (select app.resident_stay_property_ids()));

create policy accommodation_units_read_own_stay
  on public.accommodation_units for select
  using (id in (select app.resident_stay_accommodation_unit_ids()));

-- Nothing is added for organizations, organization_memberships,
-- property_assignments, subscriptions or entitlements. A Resident is not a
-- member of the Organization and must not learn its shape; the commercial gates
-- are answered for them by the security-definer function above, which needs no
-- grant of its own. This absence is asserted, not assumed — see
-- tests/database/resident_access_path.test.sql.

-- ---------------------------------------------------------------------------
-- Runtime role
-- ---------------------------------------------------------------------------

grant select on public.stays to ranza_app;

grant execute on function
  app.capability_is_available(uuid, text, text),
  app.resident_stay_property_ids(),
  app.resident_stay_accommodation_unit_ids(),
  app.resident_can_use_capability(uuid, text, text)
to ranza_app;
