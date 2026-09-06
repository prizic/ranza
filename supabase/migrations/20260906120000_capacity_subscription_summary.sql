create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null,
  branch_id uuid not null,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  status text not null default 'active' check (status in ('active', 'archived')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rooms_archive_time_consistent check (
    (status = 'active' and archived_at is null)
    or (status = 'archived' and archived_at is not null)
  ),
  foreign key (branch_id, operator_id)
    references public.branches (id, operator_id) on delete restrict,
  unique (id, operator_id, branch_id)
);

create unique index rooms_active_label_per_branch_idx
on public.rooms (operator_id, branch_id, lower(label))
where status = 'active';
create index rooms_branch_status_idx
on public.rooms (operator_id, branch_id, status, created_at);

create table public.beds (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null,
  branch_id uuid not null,
  room_id uuid not null,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  available boolean not null default true,
  status text not null default 'active' check (status in ('active', 'archived')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beds_archive_time_consistent check (
    (status = 'active' and archived_at is null)
    or (status = 'archived' and archived_at is not null)
  ),
  foreign key (room_id, operator_id, branch_id)
    references public.rooms (id, operator_id, branch_id) on delete restrict,
  unique (id, operator_id, branch_id)
);

create unique index beds_active_label_per_room_idx
on public.beds (operator_id, branch_id, room_id, lower(label))
where status = 'active';
create index beds_branch_status_idx
on public.beds (operator_id, branch_id, status, available, created_at);
create index beds_room_status_idx
on public.beds (room_id, status, created_at);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators (id) on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'past_due', 'suspended', 'ended')),
  is_current boolean not null default true,
  starts_on date not null,
  ends_on date,
  pricing_reference text not null check (char_length(btrim(pricing_reference)) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_date_range_check check (ends_on is null or ends_on >= starts_on),
  constraint subscriptions_current_lifecycle_check check (
    (is_current and status <> 'ended' and ends_on is null)
    or (not is_current)
  ),
  unique (id, operator_id)
);

create unique index subscriptions_one_current_per_operator_idx
on public.subscriptions (operator_id)
where is_current;
create index subscriptions_operator_history_idx
on public.subscriptions (operator_id, starts_on desc);

create table public.subscription_billing_periods (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null,
  subscription_id uuid not null,
  period_start date not null,
  period_end date not null,
  billable_beds_snapshot integer not null check (billable_beds_snapshot >= 0),
  branch_breakdown jsonb not null,
  external_invoice_reference text not null
    check (char_length(btrim(external_invoice_reference)) between 1 and 160),
  created_at timestamptz not null default now(),
  constraint subscription_billing_periods_range_check check (period_end >= period_start),
  constraint subscription_billing_periods_breakdown_check check (
    jsonb_typeof(branch_breakdown) = 'array'
  ),
  foreign key (subscription_id, operator_id)
    references public.subscriptions (id, operator_id) on delete restrict,
  unique (subscription_id, period_start, period_end),
  unique (operator_id, external_invoice_reference)
);

create index subscription_billing_periods_operator_period_idx
on public.subscription_billing_periods (operator_id, period_end desc, period_start desc);

alter table public.rooms enable row level security;
alter table public.beds enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_billing_periods enable row level security;

revoke all on table public.rooms, public.beds, public.subscriptions,
  public.subscription_billing_periods from anon, authenticated;
grant select, insert on table public.rooms, public.beds to authenticated;
grant update (label, status) on table public.rooms to authenticated;
grant update (label, available, status) on table public.beds to authenticated;
grant select on table public.subscriptions, public.subscription_billing_periods to authenticated;
grant insert on table public.subscriptions, public.subscription_billing_periods to authenticated;
grant update (status, is_current, ends_on, pricing_reference) on table public.subscriptions to authenticated;

create function private.can_manage_branch_capacity(
  target_operator_id uuid,
  target_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin() or exists (
    select 1
    from public.operator_memberships as membership
    join public.operators as operator on operator.id = membership.operator_id
    join public.branches as branch
      on branch.id = target_branch_id
     and branch.operator_id = target_operator_id
    where membership.auth_user_id = (select auth.uid())
      and membership.operator_id = target_operator_id
      and membership.status = 'active'
      and operator.status = 'active'
      and branch.status = 'active'
      and (
        (membership.role in ('owner', 'manager') and membership.access_scope = 'operator_wide')
        or exists (
          select 1
          from public.branch_assignments as assignment
          where assignment.membership_id = membership.id
            and assignment.operator_id = target_operator_id
            and assignment.branch_id = target_branch_id
            and assignment.role = 'manager'
            and assignment.status = 'active'
        )
      )
  );
$$;

revoke all on function private.can_manage_branch_capacity(uuid, uuid) from public, anon;
grant execute on function private.can_manage_branch_capacity(uuid, uuid) to authenticated;

create policy "Authorized staff read Rooms"
on public.rooms for select to authenticated
using (
  (select private.is_platform_admin())
  or (select private.has_active_branch_access(operator_id, branch_id))
);
create policy "Authorized staff create Rooms"
on public.rooms for insert to authenticated
with check (
  status = 'active'
  and archived_at is null
  and (select private.can_manage_branch_capacity(operator_id, branch_id))
);
create policy "Authorized staff update Rooms"
on public.rooms for update to authenticated
using ((select private.can_manage_branch_capacity(operator_id, branch_id)))
with check ((select private.can_manage_branch_capacity(operator_id, branch_id)));

create policy "Authorized staff read Beds"
on public.beds for select to authenticated
using (
  (select private.is_platform_admin())
  or (select private.has_active_branch_access(operator_id, branch_id))
);
create policy "Authorized staff create Beds"
on public.beds for insert to authenticated
with check (
  status = 'active'
  and archived_at is null
  and (select private.can_manage_branch_capacity(operator_id, branch_id))
);
create policy "Authorized staff update Beds"
on public.beds for update to authenticated
using ((select private.can_manage_branch_capacity(operator_id, branch_id)))
with check ((select private.can_manage_branch_capacity(operator_id, branch_id)));

create policy "Owners and Platform Admins read Subscriptions"
on public.subscriptions for select to authenticated
using (
  (select private.is_platform_admin())
  or (select private.is_operator_owner(operator_id))
);
create policy "Platform Admins create Subscriptions"
on public.subscriptions for insert to authenticated
with check ((select private.is_platform_admin()));
create policy "Platform Admins update Subscriptions"
on public.subscriptions for update to authenticated
using ((select private.is_platform_admin()))
with check ((select private.is_platform_admin()));

create policy "Owners and Platform Admins read Billing Periods"
on public.subscription_billing_periods for select to authenticated
using (
  (select private.is_platform_admin())
  or (select private.is_operator_owner(operator_id))
);
create policy "Platform Admins create Billing Periods"
on public.subscription_billing_periods for insert to authenticated
with check ((select private.is_platform_admin()));

create function private.prepare_capacity_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.label := btrim(new.label);
  new.updated_at := now();
  if new.status = 'archived' then
    new.archived_at := coalesce(old.archived_at, now());
  else
    new.archived_at := null;
  end if;
  return new;
end;
$$;

create function private.archive_room_beds()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'active' and new.status = 'archived' then
    update public.beds
    set status = 'archived'
    where room_id = new.id and status = 'active';
  end if;
  return new;
end;
$$;

create function private.audit_capacity_or_commercial_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_branch_id uuid;
  event_action text;
  safe_before jsonb;
  safe_after jsonb;
begin
  event_branch_id := case when tg_table_name in ('rooms', 'beds') then new.branch_id else null end;
  event_action := tg_table_name || '.' || lower(tg_op);
  if tg_table_name = 'rooms' then
    safe_before := case when tg_op = 'UPDATE' then jsonb_build_object('label', old.label, 'status', old.status) end;
    safe_after := jsonb_build_object('label', new.label, 'status', new.status);
  elsif tg_table_name = 'beds' then
    safe_before := case when tg_op = 'UPDATE' then jsonb_build_object('label', old.label, 'available', old.available, 'status', old.status) end;
    safe_after := jsonb_build_object('label', new.label, 'available', new.available, 'status', new.status);
  elsif tg_table_name = 'subscriptions' then
    safe_before := case when tg_op = 'UPDATE' then jsonb_build_object('status', old.status, 'is_current', old.is_current, 'pricing_reference', old.pricing_reference) end;
    safe_after := jsonb_build_object('status', new.status, 'is_current', new.is_current, 'pricing_reference', new.pricing_reference);
  else
    safe_before := null;
    safe_after := jsonb_build_object(
      'period_start', new.period_start,
      'period_end', new.period_end,
      'billable_beds_snapshot', new.billable_beds_snapshot,
      'branch_breakdown', new.branch_breakdown,
      'external_invoice_reference', new.external_invoice_reference
    );
  end if;

  insert into public.audit_events (
    operator_id, branch_id, actor_user_id, actor_type, action,
    target_type, target_id, before_summary, after_summary, correlation_id
  ) values (
    new.operator_id,
    event_branch_id,
    auth.uid(),
    case
      when auth.uid() is null then 'system'
      when private.is_platform_admin() then 'prizic_staff'
      else 'operator_staff'
    end,
    event_action,
    tg_table_name,
    new.id,
    safe_before,
    safe_after,
    private.current_correlation_id()
  );
  return new;
end;
$$;

create function private.guard_billing_period_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'billing period snapshots are immutable' using errcode = '55000';
end;
$$;

create function private.validate_billing_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  breakdown_total integer;
  duplicate_branches boolean;
begin
  select coalesce(sum((entry ->> 'billableBeds')::integer), 0),
    count(*) <> count(distinct entry ->> 'branchId')
  into breakdown_total, duplicate_branches
  from jsonb_array_elements(new.branch_breakdown) as entry;

  if exists (
    select 1 from jsonb_array_elements(new.branch_breakdown) as entry
    where jsonb_typeof(entry) <> 'object'
      or not (entry ? 'branchId' and entry ? 'branchName' and entry ? 'billableBeds')
      or (entry ->> 'billableBeds')::integer < 0
  ) then
    raise exception 'invalid billing Branch breakdown' using errcode = '23514';
  end if;
  if duplicate_branches or breakdown_total <> new.billable_beds_snapshot then
    raise exception 'billing snapshot total must match its unique Branch breakdown' using errcode = '23514';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(new.branch_breakdown) as entry
    left join public.branches as branch
      on branch.id = (entry ->> 'branchId')::uuid
     and branch.operator_id = new.operator_id
    where branch.id is null
  ) then
    raise exception 'billing snapshot Branch must belong to the Operator' using errcode = '23514';
  end if;
  return new;
exception when invalid_text_representation then
  raise exception 'invalid billing Branch breakdown' using errcode = '23514';
end;
$$;

revoke all on function private.prepare_capacity_mutation() from public, anon, authenticated;
revoke all on function private.archive_room_beds() from public, anon, authenticated;
revoke all on function private.audit_capacity_or_commercial_mutation() from public, anon, authenticated;
revoke all on function private.guard_billing_period_immutable() from public, anon, authenticated;
revoke all on function private.validate_billing_snapshot() from public, anon, authenticated;

create trigger rooms_prepare_mutation
before insert or update on public.rooms
for each row execute function private.prepare_capacity_mutation();
create trigger beds_prepare_mutation
before insert or update on public.beds
for each row execute function private.prepare_capacity_mutation();
create trigger rooms_archive_beds
after update of status on public.rooms
for each row execute function private.archive_room_beds();
create trigger rooms_audit
after insert or update on public.rooms
for each row execute function private.audit_capacity_or_commercial_mutation();
create trigger beds_audit
after insert or update on public.beds
for each row execute function private.audit_capacity_or_commercial_mutation();
create trigger subscriptions_audit
after insert or update on public.subscriptions
for each row execute function private.audit_capacity_or_commercial_mutation();
create trigger subscription_billing_periods_validate
before insert on public.subscription_billing_periods
for each row execute function private.validate_billing_snapshot();
create trigger subscription_billing_periods_immutable
before update or delete on public.subscription_billing_periods
for each row execute function private.guard_billing_period_immutable();
create trigger subscription_billing_periods_audit
after insert on public.subscription_billing_periods
for each row execute function private.audit_capacity_or_commercial_mutation();

create view public.branch_capacity_summary
with (security_invoker = true)
as
select
  branch.operator_id,
  branch.id as branch_id,
  branch.name as branch_name,
  branch.status as branch_status,
  count(bed.id) filter (
    where branch.status = 'active'
      and bed.status = 'active'
      and bed.available
  )::integer as billable_beds
from public.branches as branch
left join public.beds as bed
  on bed.operator_id = branch.operator_id
 and bed.branch_id = branch.id
group by branch.operator_id, branch.id, branch.name, branch.status;

create view public.operator_capacity_summary
with (security_invoker = true)
as
select
  operator_id,
  coalesce(sum(billable_beds), 0)::integer as billable_beds,
  jsonb_agg(
    jsonb_build_object(
      'branchId', branch_id,
      'branchName', branch_name,
      'billableBeds', billable_beds
    ) order by branch_name, branch_id
  ) as branch_breakdown
from public.branch_capacity_summary
group by operator_id;

revoke all on table public.branch_capacity_summary, public.operator_capacity_summary
from anon, authenticated;
grant select on table public.branch_capacity_summary, public.operator_capacity_summary
to authenticated;
