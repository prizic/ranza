alter table public.audit_events drop constraint audit_events_actor_type_check;
alter table public.audit_events add constraint audit_events_actor_type_check
check (actor_type in ('prizic_staff', 'operator_staff', 'student', 'system'));

create table public.meal_days (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null,
  branch_id uuid not null,
  service_date date not null,
  deadline_at timestamptz not null,
  status text not null default 'published' check (status in ('published', 'locked')),
  published_by uuid not null references auth.users(id) on delete restrict,
  published_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (branch_id, operator_id) references public.branches(id, operator_id) on delete restrict,
  unique (id, operator_id, branch_id),
  unique (operator_id, branch_id, service_date)
);
create index meal_days_branch_date_idx on public.meal_days(operator_id, branch_id, service_date desc);

create table public.meal_offerings (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null,
  branch_id uuid not null,
  meal_day_id uuid not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner')),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (meal_day_id, operator_id, branch_id)
    references public.meal_days(id, operator_id, branch_id) on delete restrict,
  unique (id, meal_day_id, operator_id, branch_id),
  unique (meal_day_id, meal_type)
);
create index meal_offerings_day_idx on public.meal_offerings(operator_id, branch_id, meal_day_id);

create table public.meal_responses (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null,
  branch_id uuid not null,
  meal_day_id uuid not null,
  student_id uuid not null,
  submitted_at timestamptz not null default clock_timestamp(),
  version integer not null default 1 check (version > 0),
  foreign key (meal_day_id, operator_id, branch_id)
    references public.meal_days(id, operator_id, branch_id) on delete restrict,
  foreign key (student_id, operator_id)
    references public.students(id, operator_id) on delete restrict,
  unique (id, meal_day_id, operator_id, branch_id),
  unique (meal_day_id, student_id)
);
create index meal_responses_day_idx on public.meal_responses(operator_id, branch_id, meal_day_id, student_id);
create index meal_responses_student_idx on public.meal_responses(student_id, submitted_at desc);

create table public.meal_selections (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null,
  branch_id uuid not null,
  meal_day_id uuid not null,
  response_id uuid not null,
  offering_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (response_id, meal_day_id, operator_id, branch_id)
    references public.meal_responses(id, meal_day_id, operator_id, branch_id) on delete cascade,
  foreign key (offering_id, meal_day_id, operator_id, branch_id)
    references public.meal_offerings(id, meal_day_id, operator_id, branch_id) on delete restrict,
  unique (response_id, offering_id)
);
create index meal_selections_day_idx on public.meal_selections(operator_id, branch_id, meal_day_id);

alter table public.meal_days enable row level security;
alter table public.meal_offerings enable row level security;
alter table public.meal_responses enable row level security;
alter table public.meal_selections enable row level security;
revoke all on public.meal_days, public.meal_offerings, public.meal_responses, public.meal_selections from anon, authenticated;
grant select on public.meal_days, public.meal_offerings, public.meal_responses, public.meal_selections to authenticated;

create policy "Authorized Branch users read Meal Days" on public.meal_days for select to authenticated using (
  private.has_active_branch_access(operator_id, branch_id)
  or private.is_active_student_in_branch(operator_id, branch_id)
);
create policy "Authorized Branch users read Meal Offerings" on public.meal_offerings for select to authenticated using (
  private.has_active_branch_access(operator_id, branch_id)
  or private.is_active_student_in_branch(operator_id, branch_id)
);
create policy "Staff read Branch responses and Students read own response" on public.meal_responses for select to authenticated using (
  private.has_active_branch_access(operator_id, branch_id)
  or student_id = private.current_student_id()
);
create policy "Staff read Branch selections and Students read own selections" on public.meal_selections for select to authenticated using (
  private.has_active_branch_access(operator_id, branch_id)
  or exists (
    select 1 from public.meal_responses response
    where response.id = response_id and response.student_id = private.current_student_id()
  )
);

create function private.guard_meal_day_immutable()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.operator_id <> old.operator_id or new.branch_id <> old.branch_id
    or new.service_date <> old.service_date or new.deadline_at <> old.deadline_at
    or new.published_by <> old.published_by or new.published_at <> old.published_at then
    raise exception 'Published Meal Day identity and deadline are immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;
create trigger guard_meal_day_immutable before update on public.meal_days
for each row execute function private.guard_meal_day_immutable();

create function private.publish_meal_day(
  target_operator_id uuid,
  target_branch_id uuid,
  target_service_date date,
  target_deadline_at timestamptz,
  offered_meals text[]
) returns uuid language plpgsql security definer set search_path = '' as $$
declare day_id uuid; branch_timezone text;
begin
  if auth.uid() is null
    or not private.can_manage_student_branch(target_operator_id, target_branch_id) then
    raise exception 'Meal publication denied' using errcode = '42501';
  end if;
  perform 1 from public.operator_entitlements entitlement
  where entitlement.operator_id = target_operator_id and entitlement.capability_key = 'meals'
  for share;
  if not found or not private.capability_enabled(target_operator_id, 'meals', target_branch_id) then
    raise exception 'Meal publication denied' using errcode = '42501';
  end if;
  select timezone into branch_timezone from public.branches
  where id = target_branch_id and operator_id = target_operator_id and status = 'active';
  if branch_timezone is null or target_deadline_at <= clock_timestamp()
    or target_service_date < (clock_timestamp() at time zone branch_timezone)::date then
    raise exception 'Meal Day deadline or service date is invalid' using errcode = '22023';
  end if;
  if coalesce(cardinality(offered_meals), 0) = 0
    or exists(select 1 from unnest(offered_meals) meal where meal not in ('breakfast','lunch','dinner'))
    or cardinality(offered_meals) <> (select count(distinct meal) from unnest(offered_meals) meal) then
    raise exception 'Offered meals must be a unique non-empty supported set' using errcode = '22023';
  end if;
  insert into public.meal_days(operator_id, branch_id, service_date, deadline_at, published_by)
  values(target_operator_id, target_branch_id, target_service_date, target_deadline_at, auth.uid())
  returning id into day_id;
  insert into public.meal_offerings(operator_id, branch_id, meal_day_id, meal_type)
  select target_operator_id, target_branch_id, day_id, meal from unnest(offered_meals) meal;
  insert into public.audit_events(operator_id, branch_id, actor_user_id, actor_type, action, target_type, target_id, after_summary, correlation_id)
  values(target_operator_id, target_branch_id, auth.uid(), 'operator_staff', 'meal_day.published', 'meal_day', day_id,
    jsonb_build_object('service_date', target_service_date, 'deadline_at', target_deadline_at, 'offerings', offered_meals), private.current_correlation_id());
  return day_id;
end;
$$;

create function public.publish_meal_day(
  target_operator_id uuid,
  target_branch_id uuid,
  target_service_date date,
  target_deadline_at timestamptz,
  offered_meals text[]
) returns uuid language sql security invoker set search_path = '' as $$
  select private.publish_meal_day(target_operator_id, target_branch_id, target_service_date, target_deadline_at, offered_meals);
$$;

create function private.submit_meal_response(target_meal_day_id uuid, selected_meals text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare day public.meal_days%rowtype; student public.students%rowtype; current_branch_id uuid; saved_response_id uuid; response_version integer;
begin
  select * into day from public.meal_days where id = target_meal_day_id for update;
  select * into student from public.students where id = private.current_student_id() for share;
  select history.branch_id into current_branch_id
  from public.student_branch_history history
  where history.student_id = student.id and history.ended_at is null
    and history.started_at <= statement_timestamp()
  for share;
  if auth.uid() is null or day.id is null or student.id is null or student.status <> 'active'
    or student.operator_id <> day.operator_id or current_branch_id is distinct from day.branch_id then
    raise exception 'Meal response denied' using errcode = '42501';
  end if;
  perform 1 from public.operator_entitlements entitlement
  where entitlement.operator_id = day.operator_id and entitlement.capability_key = 'meals'
  for share;
  if not found or not private.capability_enabled(day.operator_id, 'meals', day.branch_id) then
    raise exception 'Meal response denied' using errcode = '42501';
  end if;
  if day.status <> 'published' or clock_timestamp() >= day.deadline_at then
    raise exception 'Meal response deadline has passed' using errcode = '55000';
  end if;
  selected_meals := coalesce(selected_meals, array[]::text[]);
  if cardinality(selected_meals) <> (select count(distinct meal) from unnest(selected_meals) meal)
    or exists(
      select 1 from unnest(selected_meals) selected
      where not exists(
        select 1 from public.meal_offerings offering
        where offering.meal_day_id = day.id and offering.meal_type = selected
      )
    ) then
    raise exception 'Only unique published Meal Offerings may be selected' using errcode = '22023';
  end if;
  insert into public.meal_responses(operator_id, branch_id, meal_day_id, student_id)
  values(day.operator_id, day.branch_id, day.id, student.id)
  on conflict(meal_day_id, student_id) do update set
    submitted_at = clock_timestamp(), version = meal_responses.version + 1
  returning id, version into saved_response_id, response_version;
  delete from public.meal_selections where response_id = saved_response_id;
  insert into public.meal_selections(operator_id, branch_id, meal_day_id, response_id, offering_id)
  select day.operator_id, day.branch_id, day.id, saved_response_id, offering.id
  from public.meal_offerings offering
  where offering.meal_day_id = day.id and offering.meal_type = any(selected_meals);
  insert into public.audit_events(operator_id, branch_id, actor_user_id, actor_type, action, target_type, target_id, after_summary, correlation_id)
  values(day.operator_id, day.branch_id, auth.uid(), 'student', 'meal_response.submitted', 'meal_response', saved_response_id,
    jsonb_build_object('selection_count', cardinality(selected_meals), 'version', response_version), private.current_correlation_id());
  return jsonb_build_object('responseId', saved_response_id, 'version', response_version, 'submittedAt', clock_timestamp());
end;
$$;

create function public.submit_meal_response(target_meal_day_id uuid, selected_meals text[] default array[]::text[])
returns jsonb language sql security invoker set search_path = '' as $$
  select private.submit_meal_response(target_meal_day_id, selected_meals);
$$;

revoke all on function private.guard_meal_day_immutable(),
  private.publish_meal_day(uuid,uuid,date,timestamptz,text[]),
  private.submit_meal_response(uuid,text[]),
  public.publish_meal_day(uuid,uuid,date,timestamptz,text[]),
  public.submit_meal_response(uuid,text[]) from public, anon, authenticated;
grant execute on function public.publish_meal_day(uuid,uuid,date,timestamptz,text[]),
  public.submit_meal_response(uuid,text[]) to authenticated;

create view public.meal_response_status with (security_invoker = true) as
select day.operator_id, day.branch_id, day.id as meal_day_id, student.id as student_id,
  student.display_name, response.submitted_at,
  case when response.id is null then 'unconfirmed'
    when count(selection.id) = 0 then 'zero_meal' else 'selected' end as response_status,
  coalesce(array_agg(offering.meal_type order by offering.meal_type)
    filter (where offering.meal_type is not null), array[]::text[]) as selected_meals
from public.meal_days day
join public.student_branch_history history on history.operator_id = day.operator_id and history.branch_id = day.branch_id
  and history.ended_at is null and history.started_at <= clock_timestamp()
join public.students student on student.id = history.student_id and student.status = 'active'
left join public.meal_responses response on response.meal_day_id = day.id and response.student_id = student.id
left join public.meal_selections selection on selection.response_id = response.id
left join public.meal_offerings offering on offering.id = selection.offering_id
group by day.operator_id, day.branch_id, day.id, student.id, student.display_name, response.id, response.submitted_at;

create view public.meal_day_live_totals with (security_invoker = true) as
select day.operator_id, day.branch_id, day.id as meal_day_id, day.service_date, day.deadline_at,
  count(*)::integer as eligible_students,
  count(*) filter (where status.response_status <> 'unconfirmed')::integer as responded,
  count(*) filter (where status.response_status = 'zero_meal')::integer as zero_meal,
  count(*) filter (where status.response_status = 'unconfirmed')::integer as unconfirmed,
  count(*) filter (where 'breakfast' = any(status.selected_meals))::integer as breakfast,
  count(*) filter (where 'lunch' = any(status.selected_meals))::integer as lunch,
  count(*) filter (where 'dinner' = any(status.selected_meals))::integer as dinner
from public.meal_days day join public.meal_response_status status on status.meal_day_id = day.id
group by day.operator_id, day.branch_id, day.id, day.service_date, day.deadline_at;

revoke all on public.meal_response_status, public.meal_day_live_totals from anon, authenticated;
grant select on public.meal_response_status, public.meal_day_live_totals to authenticated;
