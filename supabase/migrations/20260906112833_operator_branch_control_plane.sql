create table private.platform_memberships (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete restrict,
  role text not null check (role in ('platform_admin', 'platform_support')),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'archived')),
  mfa_required boolean not null default false,
  mfa_enrolled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table private.platform_memberships is
  'Prizic platform authorization, intentionally separate from customer Operator memberships.';

alter table private.platform_memberships enable row level security;
revoke all on table private.platform_memberships from anon, authenticated;
grant select on table private.platform_memberships to authenticated;
grant usage on schema private to authenticated;

create policy "Platform members can inspect their own access"
on private.platform_memberships for select
to authenticated
using ((select auth.uid()) = auth_user_id);

create function private.is_platform_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from private.platform_memberships as membership
    where membership.auth_user_id = (select auth.uid())
      and membership.role = 'platform_admin'
      and membership.status = 'active'
      and (
        not membership.mfa_required
        or coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
      )
  );
$$;

revoke all on function private.is_platform_admin() from public, anon;
grant execute on function private.is_platform_admin() to authenticated;

create function private.is_valid_timezone(value text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from pg_catalog.pg_timezone_names where name = value
  );
$$;

revoke all on function private.is_valid_timezone(text) from public, anon;
grant execute on function private.is_valid_timezone(text) to authenticated;

create view public.platform_access
with (security_invoker = true)
as
select
  auth_user_id,
  role,
  status,
  mfa_required,
  mfa_enrolled_at
from private.platform_memberships
where auth_user_id = (select auth.uid());

revoke all on table public.platform_access from anon, authenticated;
grant select on table public.platform_access to authenticated;

create table public.operators (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'suspended', 'archived')),
  default_locale text not null default 'tr'
    check (default_locale in ('tr', 'en', 'ar')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operators_archive_time_consistent check (
    (status = 'archived' and archived_at is not null)
    or (status <> 'archived' and archived_at is null)
  ),
  unique (id, status)
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  status text not null default 'active'
    check (status in ('active', 'archived')),
  timezone text not null default 'Europe/Istanbul'
    check (private.is_valid_timezone(timezone)),
  default_locale text not null default 'tr'
    check (default_locale in ('tr', 'en', 'ar')),
  residence_classification text not null
    check (residence_classification in ('male', 'female', 'mixed', 'other')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branches_archive_time_consistent check (
    (status = 'archived' and archived_at is not null)
    or (status = 'active' and archived_at is null)
  ),
  unique (id, operator_id)
);

create unique index branches_active_name_per_operator_idx
on public.branches (operator_id, lower(name))
where status = 'active';
create index branches_operator_status_idx
on public.branches (operator_id, status, created_at);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators (id) on delete restrict,
  branch_id uuid,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_type text not null check (actor_type in ('prizic_staff', 'system')),
  action text not null,
  target_type text not null,
  target_id uuid not null,
  before_summary jsonb,
  after_summary jsonb,
  correlation_id text not null check (char_length(correlation_id) between 8 and 128),
  occurred_at timestamptz not null default now(),
  foreign key (branch_id, operator_id)
    references public.branches (id, operator_id) on delete restrict
);

create index audit_events_operator_time_idx
on public.audit_events (operator_id, occurred_at desc);
create index audit_events_branch_time_idx
on public.audit_events (operator_id, branch_id, occurred_at desc);
create index audit_events_actor_time_idx
on public.audit_events (actor_user_id, occurred_at desc);

alter table public.operators enable row level security;
alter table public.branches enable row level security;
alter table public.audit_events enable row level security;

revoke all on table public.operators, public.branches, public.audit_events
from anon, authenticated;
grant select, insert on table public.operators, public.branches to authenticated;
grant update (status) on table public.operators, public.branches to authenticated;
grant select on table public.audit_events to authenticated;

create policy "Platform Admins read Operators"
on public.operators for select to authenticated
using ((select private.is_platform_admin()));
create policy "Platform Admins create Operators"
on public.operators for insert to authenticated
with check (
  (select private.is_platform_admin())
  and status = 'pending'
  and archived_at is null
);
create policy "Platform Admins update Operators"
on public.operators for update to authenticated
using ((select private.is_platform_admin()))
with check ((select private.is_platform_admin()));

create policy "Platform Admins read Branches"
on public.branches for select to authenticated
using ((select private.is_platform_admin()));
create policy "Platform Admins create Branches"
on public.branches for insert to authenticated
with check (
  (select private.is_platform_admin())
  and status = 'active'
  and archived_at is null
  and exists (
    select 1 from public.operators as parent
    where parent.id = operator_id and parent.status <> 'archived'
  )
);
create policy "Platform Admins update Branches"
on public.branches for update to authenticated
using ((select private.is_platform_admin()))
with check ((select private.is_platform_admin()));

create policy "Platform Admins read audit events"
on public.audit_events for select to authenticated
using ((select private.is_platform_admin()));

create function private.current_correlation_id()
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  headers jsonb;
  correlation text;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
    correlation := headers ->> 'x-correlation-id';
  exception when others then
    correlation := null;
  end;
  return coalesce(nullif(correlation, ''), gen_random_uuid()::text);
end;
$$;

revoke all on function private.current_correlation_id() from public, anon;
grant execute on function private.current_correlation_id() to authenticated;

create function private.guard_operator_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'archived' and new.status <> old.status then
    raise exception 'archived Operators cannot return to service' using errcode = '23514';
  end if;
  if old.status = 'pending' and new.status not in ('pending', 'active', 'suspended', 'archived') then
    raise exception 'invalid Operator lifecycle transition' using errcode = '23514';
  end if;
  if old.status = 'active' and new.status not in ('active', 'suspended', 'archived') then
    raise exception 'invalid Operator lifecycle transition' using errcode = '23514';
  end if;
  if old.status = 'suspended' and new.status not in ('suspended', 'active', 'archived') then
    raise exception 'invalid Operator lifecycle transition' using errcode = '23514';
  end if;
  new.archived_at := case when new.status = 'archived' then coalesce(old.archived_at, now()) else null end;
  new.updated_at := now();
  return new;
end;
$$;

create function private.guard_branch_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'archived' and new.status <> old.status then
    raise exception 'archived Branches cannot return to service' using errcode = '23514';
  end if;
  new.archived_at := case when new.status = 'archived' then coalesce(old.archived_at, now()) else null end;
  new.updated_at := now();
  return new;
end;
$$;

create function private.audit_lifecycle_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_operator_id uuid;
  target_branch_id uuid;
  event_action text;
  before_value jsonb;
  after_value jsonb;
begin
  if auth.uid() is not null and not private.is_platform_admin() then
    raise exception 'active Platform Admin access is required' using errcode = '42501';
  end if;

  if tg_table_name = 'operators' then
    target_operator_id := new.id;
    target_branch_id := null;
    event_action := case when tg_op = 'INSERT' then 'operator.created' else 'operator.status_changed' end;
    before_value := case when tg_op = 'UPDATE' then jsonb_build_object('status', old.status) end;
    after_value := jsonb_build_object('name', new.name, 'status', new.status, 'default_locale', new.default_locale);
  else
    target_operator_id := new.operator_id;
    target_branch_id := new.id;
    event_action := case when tg_op = 'INSERT' then 'branch.created' else 'branch.archived' end;
    before_value := case when tg_op = 'UPDATE' then jsonb_build_object('status', old.status) end;
    after_value := jsonb_build_object(
      'name', new.name,
      'status', new.status,
      'timezone', new.timezone,
      'default_locale', new.default_locale,
      'residence_classification', new.residence_classification
    );
  end if;

  insert into public.audit_events (
    operator_id,
    branch_id,
    actor_user_id,
    actor_type,
    action,
    target_type,
    target_id,
    before_summary,
    after_summary,
    correlation_id
  ) values (
    target_operator_id,
    target_branch_id,
    auth.uid(),
    case when auth.uid() is null then 'system' else 'prizic_staff' end,
    event_action,
    case when target_branch_id is null then 'operator' else 'branch' end,
    coalesce(target_branch_id, target_operator_id),
    before_value,
    after_value,
    private.current_correlation_id()
  );
  return new;
end;
$$;

revoke all on function private.guard_operator_lifecycle() from public, anon, authenticated;
revoke all on function private.guard_branch_lifecycle() from public, anon, authenticated;
revoke all on function private.audit_lifecycle_mutation() from public, anon, authenticated;

create trigger operators_guard_lifecycle
before update on public.operators
for each row execute function private.guard_operator_lifecycle();
create trigger branches_guard_lifecycle
before update on public.branches
for each row execute function private.guard_branch_lifecycle();
create trigger operators_audit_lifecycle
after insert or update on public.operators
for each row execute function private.audit_lifecycle_mutation();
create trigger branches_audit_lifecycle
after insert or update on public.branches
for each row execute function private.audit_lifecycle_mutation();
