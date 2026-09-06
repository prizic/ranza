create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 120),
  preferred_locale text not null default 'tr'
    check (preferred_locale in ('tr', 'en', 'ar')),
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.operator_memberships (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators (id) on delete restrict,
  auth_user_id uuid not null references auth.users (id) on delete restrict,
  role text not null check (role in ('owner', 'manager', 'branch_staff')),
  access_scope text not null check (access_scope in ('operator_wide', 'assigned_branches')),
  status text not null default 'active'
    check (status in ('active', 'revoked', 'archived')),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operator_memberships_role_scope_check check (
    (role = 'owner' and access_scope = 'operator_wide')
    or (role = 'manager')
    or (role = 'branch_staff' and access_scope = 'assigned_branches')
  ),
  constraint operator_memberships_revocation_time_check check (
    (status = 'active' and revoked_at is null)
    or (status <> 'active' and revoked_at is not null)
  ),
  unique (operator_id, auth_user_id),
  unique (id, operator_id)
);

create table public.branch_assignments (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null,
  membership_id uuid not null,
  branch_id uuid not null,
  role text not null check (role in ('manager', 'staff')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branch_assignments_revocation_time_check check (
    (status = 'active' and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
  ),
  foreign key (membership_id, operator_id)
    references public.operator_memberships (id, operator_id) on delete restrict,
  foreign key (branch_id, operator_id)
    references public.branches (id, operator_id) on delete restrict,
  unique (membership_id, branch_id)
);

create index operator_memberships_auth_status_idx
on public.operator_memberships (auth_user_id, status, operator_id);
create index operator_memberships_operator_role_status_idx
on public.operator_memberships (operator_id, role, status);
create index branch_assignments_membership_status_idx
on public.branch_assignments (membership_id, status, branch_id);
create index branch_assignments_branch_status_idx
on public.branch_assignments (operator_id, branch_id, status);

create table private.session_revocation_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  error_reference text
);

create unique index session_revocation_requests_one_pending_idx
on private.session_revocation_requests (auth_user_id)
where status in ('pending', 'processing');

alter table public.profiles enable row level security;
alter table public.operator_memberships enable row level security;
alter table public.branch_assignments enable row level security;
alter table private.session_revocation_requests enable row level security;

revoke all on table public.profiles, public.operator_memberships, public.branch_assignments
from anon, authenticated;
revoke all on table private.session_revocation_requests from anon, authenticated;
grant select on table public.profiles, public.operator_memberships, public.branch_assignments
to authenticated;
grant insert on table public.operator_memberships, public.branch_assignments
to authenticated;
grant update (role, access_scope, status) on table public.operator_memberships
to authenticated;
grant update (role, status) on table public.branch_assignments
to authenticated;
grant update (display_name, preferred_locale) on table public.profiles
to authenticated;

-- Membership changes take effect on the next request before the asynchronous
-- Auth session revocation worker runs.
create function private.has_pending_session_revocation(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.session_revocation_requests as request
    where request.auth_user_id = target_user_id
      and request.status in ('pending', 'processing')
  );
$$;
revoke all on function private.has_pending_session_revocation(uuid) from public, anon;
grant execute on function private.has_pending_session_revocation(uuid) to authenticated;

create function private.has_active_operator_access(target_operator_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.operator_memberships as membership
    join public.operators as operator on operator.id = membership.operator_id
    where membership.auth_user_id = (select auth.uid())
      and membership.operator_id = target_operator_id
      and membership.status = 'active'
      and operator.status = 'active'
  )
  and not private.has_pending_session_revocation((select auth.uid()));
$$;

create function private.has_active_branch_access(
  target_operator_id uuid,
  target_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.operator_memberships as membership
    join public.operators as operator on operator.id = membership.operator_id
    join public.branches as branch
      on branch.operator_id = membership.operator_id
     and branch.id = target_branch_id
    where membership.auth_user_id = (select auth.uid())
      and membership.operator_id = target_operator_id
      and membership.status = 'active'
      and operator.status = 'active'
      and branch.status = 'active'
      and (
        (
          membership.access_scope = 'operator_wide'
          and membership.role in ('owner', 'manager')
        )
        or exists (
          select 1
          from public.branch_assignments as assignment
          where assignment.membership_id = membership.id
            and assignment.operator_id = target_operator_id
            and assignment.branch_id = target_branch_id
            and assignment.status = 'active'
        )
      )
  )
  and not private.has_pending_session_revocation((select auth.uid()));
$$;

create function private.is_operator_owner(target_operator_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.operator_memberships as membership
    join public.operators as operator on operator.id = membership.operator_id
    where membership.auth_user_id = (select auth.uid())
      and membership.operator_id = target_operator_id
      and membership.role = 'owner'
      and membership.access_scope = 'operator_wide'
      and membership.status = 'active'
      and operator.status = 'active'
  )
  and not private.has_pending_session_revocation((select auth.uid()));
$$;

create function private.is_own_membership(target_membership_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.operator_memberships as membership
    where membership.id = target_membership_id
      and membership.auth_user_id = (select auth.uid())
  );
$$;

revoke all on function private.has_active_operator_access(uuid) from public, anon;
revoke all on function private.has_active_branch_access(uuid, uuid) from public, anon;
revoke all on function private.is_operator_owner(uuid) from public, anon;
revoke all on function private.is_own_membership(uuid) from public, anon;
grant execute on function private.has_active_operator_access(uuid) to authenticated;
grant execute on function private.has_active_branch_access(uuid, uuid) to authenticated;
grant execute on function private.is_operator_owner(uuid) to authenticated;
grant execute on function private.is_own_membership(uuid) to authenticated;

create policy "Staff read their own profile"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);
create policy "Staff update their own profile"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id and status = 'active');

create policy "Staff read visible memberships"
on public.operator_memberships for select to authenticated
using (
  auth_user_id = (select auth.uid())
  or (select private.is_operator_owner(operator_id))
);
create policy "Owners create memberships"
on public.operator_memberships for insert to authenticated
with check ((select private.is_operator_owner(operator_id)));
create policy "Owners update memberships"
on public.operator_memberships for update to authenticated
using ((select private.is_operator_owner(operator_id)))
with check ((select private.is_operator_owner(operator_id)));

create policy "Staff read visible Branch assignments"
on public.branch_assignments for select to authenticated
using (
  (select private.is_own_membership(membership_id))
  or (select private.is_operator_owner(operator_id))
);
create policy "Owners create Branch assignments"
on public.branch_assignments for insert to authenticated
with check ((select private.is_operator_owner(operator_id)));
create policy "Owners update Branch assignments"
on public.branch_assignments for update to authenticated
using ((select private.is_operator_owner(operator_id)))
with check ((select private.is_operator_owner(operator_id)));

create policy "Active staff read their Operator"
on public.operators for select to authenticated
using ((select private.has_active_operator_access(id)));
create policy "Active staff read authorized Branches"
on public.branches for select to authenticated
using ((select private.has_active_branch_access(operator_id, id)));

create function private.staff_capabilities(operator_role text)
returns table (capability text)
language sql
immutable
security invoker
set search_path = ''
as $$
  select unnest(
    case operator_role
      when 'owner' then array[
        'branch.read', 'branch.manage', 'staff.manage', 'roster.manage',
        'workflow.manage', 'finance.manage', 'operator.export'
      ]::text[]
      when 'manager' then array[
        'branch.read', 'branch.manage', 'roster.manage', 'workflow.manage'
      ]::text[]
      when 'branch_staff' then array[
        'branch.read', 'workflow.read', 'workflow.update'
      ]::text[]
      else array[]::text[]
    end
  );
$$;

revoke all on function private.staff_capabilities(text) from public, anon;
grant execute on function private.staff_capabilities(text) to authenticated;

create view public.staff_branch_access
with (security_invoker = true)
as
select
  membership.auth_user_id,
  membership.operator_id,
  membership.id as membership_id,
  membership.role as operator_role,
  branch.id as branch_id,
  branch.name as branch_name,
  branch.timezone,
  branch.default_locale,
  capability.capability
from public.operator_memberships as membership
join public.branches as branch
  on branch.operator_id = membership.operator_id
left join public.branch_assignments as assignment
  on assignment.membership_id = membership.id
 and assignment.branch_id = branch.id
 and assignment.status = 'active'
cross join lateral private.staff_capabilities(membership.role) as capability
where membership.auth_user_id = (select auth.uid())
  and membership.status = 'active'
  and branch.status = 'active'
  and (
    (
      membership.access_scope = 'operator_wide'
      and membership.role in ('owner', 'manager')
    )
    or assignment.id is not null
  );

revoke all on table public.staff_branch_access from anon, authenticated;
grant select on table public.staff_branch_access to authenticated;

alter table public.audit_events drop constraint audit_events_actor_type_check;
alter table public.audit_events add constraint audit_events_actor_type_check
check (actor_type in ('prizic_staff', 'operator_staff', 'system'));

create function private.prepare_staff_access_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if new.status <> 'active' then
      new.revoked_at := coalesce(old.revoked_at, now());
    else
      new.revoked_at := null;
    end if;
  end if;
  return new;
end;
$$;

create function private.queue_membership_session_revocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'active' and new.status <> 'active' then
    insert into private.session_revocation_requests (auth_user_id, reason)
    values (new.auth_user_id, 'operator_membership.' || new.status)
    on conflict (auth_user_id) where status in ('pending', 'processing') do nothing;
  end if;
  return new;
end;
$$;

create function private.audit_staff_access_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_operator_id uuid := new.operator_id;
  event_branch_id uuid;
  event_target_type text;
begin
  if tg_table_name = 'operator_memberships' then
    event_branch_id := null;
    event_target_type := 'operator_membership';
  else
    event_branch_id := new.branch_id;
    event_target_type := 'branch_assignment';
  end if;

  insert into public.audit_events (
    operator_id, branch_id, actor_user_id, actor_type, action,
    target_type, target_id, before_summary, after_summary, correlation_id
  ) values (
    event_operator_id,
    event_branch_id,
    auth.uid(),
    case when auth.uid() is null then 'system' else 'operator_staff' end,
    case when tg_op = 'INSERT' then event_target_type || '.created' else event_target_type || '.changed' end,
    event_target_type,
    new.id,
    case when tg_op = 'UPDATE' then jsonb_build_object('role', old.role, 'status', old.status) end,
    jsonb_build_object('role', new.role, 'status', new.status),
    private.current_correlation_id()
  );
  return new;
end;
$$;

revoke all on function private.prepare_staff_access_mutation() from public, anon, authenticated;
revoke all on function private.queue_membership_session_revocation() from public, anon, authenticated;
revoke all on function private.audit_staff_access_mutation() from public, anon, authenticated;

create trigger operator_memberships_prepare_mutation
before update on public.operator_memberships
for each row execute function private.prepare_staff_access_mutation();
create trigger branch_assignments_prepare_mutation
before update on public.branch_assignments
for each row execute function private.prepare_staff_access_mutation();
create trigger operator_memberships_queue_session_revocation
after update of status on public.operator_memberships
for each row execute function private.queue_membership_session_revocation();
create trigger operator_memberships_audit
after insert or update on public.operator_memberships
for each row execute function private.audit_staff_access_mutation();
create trigger branch_assignments_audit
after insert or update on public.branch_assignments
for each row execute function private.audit_staff_access_mutation();
