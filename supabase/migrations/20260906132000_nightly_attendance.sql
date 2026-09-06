alter table public.audit_events drop constraint audit_events_actor_type_check;
alter table public.audit_events add constraint audit_events_actor_type_check
check (actor_type in ('prizic_staff','operator_staff','student','system'));

create table public.attendance_schedules (
  operator_id uuid not null,
  branch_id uuid not null,
  cutoff_minute integer not null default 1320 check (cutoff_minute between 0 and 1439),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (branch_id),
  foreign key (branch_id,operator_id) references public.branches(id,operator_id) on delete restrict
);

create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null,
  branch_id uuid not null,
  service_date date not null,
  cutoff_at timestamptz not null,
  status text not null default 'open' check (status in ('open','finalized')),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (branch_id,operator_id) references public.branches(id,operator_id) on delete restrict,
  unique (id,operator_id,branch_id),
  unique (branch_id,service_date)
);

create table public.attendance_responses (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null,
  branch_id uuid not null,
  session_id uuid not null,
  student_id uuid not null,
  declaration text not null check (declaration in ('staying','away')),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (session_id,operator_id,branch_id) references public.attendance_sessions(id,operator_id,branch_id) on delete restrict,
  foreign key (student_id,operator_id) references public.students(id,operator_id) on delete restrict,
  unique (session_id,student_id)
);

create index attendance_sessions_branch_status_idx
on public.attendance_sessions(operator_id,branch_id,status,service_date desc);
create index attendance_responses_board_idx
on public.attendance_responses(operator_id,branch_id,session_id,updated_at desc);
create index attendance_responses_student_idx
on public.attendance_responses(student_id,session_id);

alter table public.attendance_schedules enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_responses enable row level security;
revoke all on public.attendance_schedules,public.attendance_sessions,public.attendance_responses from anon,authenticated;
grant select on public.attendance_schedules,public.attendance_sessions,public.attendance_responses to authenticated;

create function private.can_manage_attendance(target_operator_id uuid,target_branch_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.has_active_branch_access(target_operator_id,target_branch_id)
  and exists (
    select 1 from public.operator_memberships membership
    where membership.operator_id=target_operator_id
      and membership.auth_user_id=(select auth.uid())
      and membership.status='active'
      and membership.role in ('owner','manager')
  );
$$;

create policy "Scoped attendance schedule read" on public.attendance_schedules
for select to authenticated using (
  private.has_active_branch_access(operator_id,branch_id)
  or private.is_active_student_in_branch(operator_id,branch_id)
);
create policy "Scoped attendance session read" on public.attendance_sessions
for select to authenticated using (
  private.has_active_branch_access(operator_id,branch_id)
  or private.is_active_student_in_branch(operator_id,branch_id)
);
create policy "Scoped attendance response read" on public.attendance_responses
for select to authenticated using (
  student_id=(select private.current_student_id())
  or private.has_active_branch_access(operator_id,branch_id)
);

create function private.keep_attendance_session_cutoff()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.operator_id<>old.operator_id or new.branch_id<>old.branch_id
    or new.service_date<>old.service_date or new.cutoff_at<>old.cutoff_at then
    raise exception 'Attendance Session identity and cutoff are immutable' using errcode='22023';
  end if;
  return new;
end;
$$;
create trigger attendance_session_cutoff_immutable before update on public.attendance_sessions
for each row execute function private.keep_attendance_session_cutoff();

create function public.configure_attendance_schedule(
  target_branch_id uuid,branch_timezone text,nightly_cutoff_minute integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare target_branch public.branches%rowtype;
begin
  select * into target_branch from public.branches where id=target_branch_id for update;
  if target_branch.id is null or not private.can_manage_attendance(target_branch.operator_id,target_branch.id) then
    raise exception 'Attendance configuration denied' using errcode='42501';
  end if;
  if not private.capability_enabled(target_branch.operator_id,'attendance',target_branch.id) then
    raise exception 'Attendance capability unavailable' using errcode='42501';
  end if;
  if not private.is_valid_timezone(branch_timezone)
    or nightly_cutoff_minute is null or nightly_cutoff_minute not between 0 and 1439 then
    raise exception 'Unsupported Attendance schedule' using errcode='22023';
  end if;
  update public.branches set timezone=branch_timezone,updated_at=clock_timestamp() where id=target_branch.id;
  insert into public.attendance_schedules(operator_id,branch_id,cutoff_minute)
  values(target_branch.operator_id,target_branch.id,nightly_cutoff_minute)
  on conflict(branch_id) do update set cutoff_minute=excluded.cutoff_minute,updated_at=clock_timestamp();
  insert into public.audit_events(operator_id,branch_id,actor_user_id,actor_type,action,target_type,target_id,after_summary,correlation_id)
  values(target_branch.operator_id,target_branch.id,auth.uid(),'operator_staff','attendance.schedule_configured','branch',target_branch.id,
    jsonb_build_object('timezone',branch_timezone,'cutoff_minute',nightly_cutoff_minute),private.current_correlation_id());
  return jsonb_build_object('branch_id',target_branch.id,'timezone',branch_timezone,'cutoff_minute',nightly_cutoff_minute);
end;
$$;

create function public.ensure_attendance_session(target_branch_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare target_branch public.branches%rowtype; local_date date; cutoff_minute integer; result_id uuid;
begin
  select * into target_branch from public.branches where id=target_branch_id and status='active';
  if target_branch.id is null or not (
    private.has_active_branch_access(target_branch.operator_id,target_branch.id)
    or private.is_active_student_in_branch(target_branch.operator_id,target_branch.id)
  ) then raise exception 'Attendance access denied' using errcode='42501'; end if;
  if not private.capability_enabled(target_branch.operator_id,'attendance',target_branch.id) then
    raise exception 'Attendance capability unavailable' using errcode='42501';
  end if;
  local_date := (clock_timestamp() at time zone target_branch.timezone)::date;
  select schedule.cutoff_minute into cutoff_minute from public.attendance_schedules schedule where schedule.branch_id=target_branch.id;
  if cutoff_minute is null then
    cutoff_minute := coalesce((private.capability_state(target_branch.operator_id,'attendance',target_branch.id)->'values'->>'cutoffMinute')::integer,1320);
  end if;
  insert into public.attendance_sessions(operator_id,branch_id,service_date,cutoff_at)
  values(target_branch.operator_id,target_branch.id,local_date,
    (local_date::timestamp + make_interval(mins=>cutoff_minute)) at time zone target_branch.timezone)
  on conflict(branch_id,service_date) do nothing;
  select id into result_id from public.attendance_sessions where branch_id=target_branch.id and service_date=local_date;
  return result_id;
end;
$$;

create function public.submit_attendance_declaration(target_session_id uuid,requested_declaration text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target_session public.attendance_sessions%rowtype; target_student uuid; saved public.attendance_responses%rowtype;
begin
  if requested_declaration not in ('staying','away') or requested_declaration is null then
    raise exception 'Unsupported Attendance declaration' using errcode='22023';
  end if;
  select * into target_session from public.attendance_sessions where id=target_session_id for update;
  target_student := private.current_student_id();
  if target_session.id is null or target_student is null
    or not private.is_active_student_in_branch(target_session.operator_id,target_session.branch_id)
    or not private.capability_enabled(target_session.operator_id,'attendance',target_session.branch_id) then
    raise exception 'Attendance submission denied' using errcode='42501';
  end if;
  if target_session.status<>'open' or clock_timestamp()>=target_session.cutoff_at then
    raise exception 'Attendance cutoff has passed' using errcode='P0001';
  end if;
  insert into public.attendance_responses(operator_id,branch_id,session_id,student_id,declaration)
  values(target_session.operator_id,target_session.branch_id,target_session.id,target_student,requested_declaration)
  on conflict(session_id,student_id) do update set declaration=excluded.declaration,
    version=attendance_responses.version+1,updated_at=clock_timestamp()
  returning * into saved;
  return jsonb_build_object('session_id',saved.session_id,'declaration',saved.declaration,
    'version',saved.version,'updated_at',saved.updated_at,'cutoff_at',target_session.cutoff_at);
end;
$$;

create function public.student_attendance_context(target_session_id uuid)
returns table(
  student_id uuid,student_name text,student_access_id text,branch_id uuid,branch_name text,
  branch_timezone text,service_date date,cutoff_at timestamptz,declaration text,last_updated_at timestamptz
) language plpgsql stable security definer set search_path='' as $$
declare own_student uuid;
begin
  own_student:=private.current_student_id();
  if own_student is null then raise exception 'Student attendance access denied' using errcode='42501'; end if;
  return query select student.id,student.display_name,student.access_id,branch.id,branch.name,branch.timezone,
    session.service_date,session.cutoff_at,response.declaration,response.updated_at
  from public.students student
  join public.student_branch_history history on history.student_id=student.id and history.ended_at is null
  join public.branches branch on branch.id=history.branch_id and branch.operator_id=history.operator_id
  join public.attendance_sessions session on session.id=target_session_id and session.branch_id=branch.id
  left join public.attendance_responses response on response.session_id=session.id and response.student_id=student.id
  where student.id=own_student and student.status='active';
end;
$$;

create function public.attendance_board(target_session_id uuid)
returns table(
  student_id uuid,student_name text,status text,last_updated_at timestamptz,
  staying_total bigint,away_total bigint,unconfirmed_total bigint,response_percentage integer
) language plpgsql stable security definer set search_path='' as $$
declare target_session public.attendance_sessions%rowtype;
begin
  select * into target_session from public.attendance_sessions where id=target_session_id;
  if target_session.id is null or not private.has_active_branch_access(target_session.operator_id,target_session.branch_id)
    or not private.capability_enabled(target_session.operator_id,'attendance',target_session.branch_id) then
    raise exception 'Attendance board access denied' using errcode='42501';
  end if;
  return query with eligible as (
    select student.id,student.display_name,response.declaration,response.updated_at
    from public.students student
    join public.student_branch_history history on history.student_id=student.id
      and history.operator_id=target_session.operator_id and history.branch_id=target_session.branch_id
      and history.started_at<=target_session.cutoff_at
      and (history.ended_at is null or history.ended_at>target_session.cutoff_at)
    left join public.attendance_responses response on response.session_id=target_session.id and response.student_id=student.id
    where student.status='active'
  ), totals as (
    select count(*) filter(where declaration='staying') staying,
      count(*) filter(where declaration='away') away,
      count(*) filter(where declaration is null) unconfirmed,count(*) total from eligible
  ) select eligible.id,eligible.display_name,coalesce(eligible.declaration,'unconfirmed'),eligible.updated_at,
    totals.staying,totals.away,totals.unconfirmed,
    case when totals.total=0 then 0 else round(((totals.staying+totals.away)::numeric/totals.total)*100)::integer end
  from eligible cross join totals order by eligible.display_name,eligible.id;
end;
$$;

revoke all on function private.can_manage_attendance(uuid,uuid),private.keep_attendance_session_cutoff(),
  public.configure_attendance_schedule(uuid,text,integer),public.ensure_attendance_session(uuid),
  public.submit_attendance_declaration(uuid,text),public.student_attendance_context(uuid),public.attendance_board(uuid)
from public,anon;
grant execute on function private.can_manage_attendance(uuid,uuid),public.configure_attendance_schedule(uuid,text,integer),
  public.ensure_attendance_session(uuid),public.submit_attendance_declaration(uuid,text),
  public.student_attendance_context(uuid),public.attendance_board(uuid) to authenticated;
