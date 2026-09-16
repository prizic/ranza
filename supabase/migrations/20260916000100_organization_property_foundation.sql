-- Organization and Property foundation.
--
-- Blueprint 3.5 requires five independent gates: active Subscription, granted
-- Entitlement, capability enabled for the scope, Staff permission, and a
-- data-layer policy. This migration creates all five so none can be retrofitted
-- as an afterthought.
--
-- ADR 0001: Prisma issues queries under a role that RLS still applies to. The
-- acting user is published transaction-locally via app.set_request_context()
-- before any tenant-owned table is touched.

create schema if not exists app;
create schema if not exists private;

revoke all on schema private from public;
comment on schema app is
  'Request context and authorization helpers callable by the runtime role.';
comment on schema private is
  'Server-only data that must never be exposed through a data API.';

-- ---------------------------------------------------------------------------
-- Request context
-- ---------------------------------------------------------------------------

-- Transaction-local on purpose: a pooled connection must never leak one
-- request's identity into the next.
create function app.set_request_context(user_id uuid)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  select set_config('app.user_id', user_id::text, true);
$$;

create function app.current_user_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid;
$$;

comment on function app.current_user_id() is
  'Acting user, or null when no context was set. Null must deny, never bypass.';

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'suspended', 'archived')),
  default_locale text not null default 'tr'
    check (default_locale in ('tr', 'en', 'ar')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function private.is_valid_timezone(value text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = value);
$$;

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  status text not null default 'active'
    check (status in ('active', 'archived')),
  timezone text not null default 'Europe/Istanbul'
    check (private.is_valid_timezone(timezone)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets Property-scoped children carry organization_id and prove, by foreign
  -- key alone, that the pair belongs together.
  unique (id, organization_id)
);

create index properties_organization_idx
  on public.properties (organization_id);

-- ---------------------------------------------------------------------------
-- Identity and assignment (gate 4)
-- ---------------------------------------------------------------------------

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  role text not null
    check (role in ('owner', 'manager', 'staff')),
  access_scope text not null default 'assigned_properties'
    check (access_scope in ('organization_wide', 'assigned_properties')),
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_memberships_user_idx
  on public.organization_memberships (user_id)
  where status = 'active';

create table public.property_assignments (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null,
  organization_id uuid not null,
  user_id uuid not null references auth.users (id) on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  foreign key (property_id, organization_id)
    references public.properties (id, organization_id) on delete restrict,
  unique (property_id, user_id)
);

create index property_assignments_user_idx
  on public.property_assignments (user_id)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- Commercial gates (1, 2, 3)
-- ---------------------------------------------------------------------------

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique
    references public.organizations (id) on delete restrict,
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'suspended', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id) on delete restrict,
  module_key text not null check (module_key ~ '^[a-z][a-z0-9_.]{1,63}$'),
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  unique (organization_id, module_key)
);

create table public.property_capabilities (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null,
  organization_id uuid not null,
  capability_key text not null check (capability_key ~ '^[a-z][a-z0-9_.]{1,63}$'),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (property_id, organization_id)
    references public.properties (id, organization_id) on delete restrict,
  unique (property_id, capability_key)
);

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------

-- security definer so a policy can consult membership without the caller
-- needing read access to every membership row.
create function app.accessible_property_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select property.id
  from public.properties as property
  join public.organization_memberships as membership
    on membership.organization_id = property.organization_id
  where membership.user_id = app.current_user_id()
    and membership.status = 'active'
    and property.status = 'active'
    and (
      membership.access_scope = 'organization_wide'
      or exists (
        select 1
        from public.property_assignments as assignment
        where assignment.property_id = property.id
          and assignment.user_id = membership.user_id
          and assignment.status = 'active'
      )
    );
$$;

create function app.accessible_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select membership.organization_id
  from public.organization_memberships as membership
  where membership.user_id = app.current_user_id()
    and membership.status = 'active';
$$;

-- All five blueprint 3.5 gates in one place, each independently able to deny.
create function app.can_use_capability(
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
    )
    -- gate 4: the acting Staff Member reaches this Property
    and target_property_id in (select app.accessible_property_ids());
$$;

comment on function app.can_use_capability(uuid, text, text) is
  'Gates 1-4 of blueprint 3.5. Gate 5 is row-level security, enforced separately '
  'so that a defect here still cannot expose another Organization''s rows.';

-- ---------------------------------------------------------------------------
-- Row-level security (gate 5)
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.properties enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.property_assignments enable row level security;
alter table public.subscriptions enable row level security;
alter table public.entitlements enable row level security;
alter table public.property_capabilities enable row level security;

alter table public.organizations force row level security;
alter table public.properties force row level security;
alter table public.organization_memberships force row level security;
alter table public.property_assignments force row level security;
alter table public.subscriptions force row level security;
alter table public.entitlements force row level security;
alter table public.property_capabilities force row level security;

create policy organizations_read_own
  on public.organizations for select
  using (id in (select app.accessible_organization_ids()));

create policy properties_read_accessible
  on public.properties for select
  using (id in (select app.accessible_property_ids()));

create policy memberships_read_own
  on public.organization_memberships for select
  using (user_id = app.current_user_id());

create policy assignments_read_own
  on public.property_assignments for select
  using (user_id = app.current_user_id());

create policy subscriptions_read_own_organization
  on public.subscriptions for select
  using (organization_id in (select app.accessible_organization_ids()));

create policy entitlements_read_own_organization
  on public.entitlements for select
  using (organization_id in (select app.accessible_organization_ids()));

create policy capabilities_read_accessible_property
  on public.property_capabilities for select
  using (property_id in (select app.accessible_property_ids()));

-- ---------------------------------------------------------------------------
-- Runtime role
-- ---------------------------------------------------------------------------

-- Prisma connects as this role. It is deliberately not the owner and has no
-- BYPASSRLS, so forgetting to set request context denies rather than exposes.
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'ranza_app') then
    create role ranza_app nologin;
  end if;
end
$$;

grant usage on schema app, public to ranza_app;
grant select on
  public.organizations,
  public.properties,
  public.organization_memberships,
  public.property_assignments,
  public.subscriptions,
  public.entitlements,
  public.property_capabilities
to ranza_app;

grant execute on function
  app.set_request_context(uuid),
  app.current_user_id(),
  app.accessible_property_ids(),
  app.accessible_organization_ids(),
  app.can_use_capability(uuid, text, text)
to ranza_app;

revoke all on schema private from ranza_app;
