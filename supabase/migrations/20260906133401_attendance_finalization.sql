create table public.attendance_snapshots (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null,
  branch_id uuid not null,
  session_id uuid not null,
  version integer not null default 1 check (version > 0),
  eligible_count integer not null check (eligible_count >= 0),
  staying_count integer not null check (staying_count >= 0),
  away_count integer not null check (away_count >= 0),
  unconfirmed_count integer not null check (unconfirmed_count >= 0),
  finalized_at timestamptz not null default clock_timestamp(),
  correlation_id text not null check (char_length(correlation_id) between 8 and 128),
  foreign key(session_id,operator_id,branch_id) references public.attendance_sessions(id,operator_id,branch_id) on delete restrict,
  unique(session_id,version),
  check (eligible_count=staying_count+away_count+unconfirmed_count)
);

create table public.attendance_snapshot_students (
  snapshot_id uuid not null references public.attendance_snapshots(id) on delete restrict,
  operator_id uuid not null,
  branch_id uuid not null,
  session_id uuid not null,
  student_id uuid not null,
  display_name text not null,
  status text not null check (status in ('staying','away','unconfirmed')),
  response_updated_at timestamptz,
  primary key(snapshot_id,student_id),
  foreign key(session_id,operator_id,branch_id) references public.attendance_sessions(id,operator_id,branch_id) on delete restrict,
  foreign key(student_id,operator_id) references public.students(id,operator_id) on delete restrict
);

create table public.background_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null check (char_length(job_key) between 8 and 200),
  attempt integer not null default 1 check (attempt > 0),
  operator_id uuid,
  branch_id uuid,
  target_session_id uuid references public.attendance_sessions(id) on delete restrict,
  status text not null check (status in ('running','succeeded','failed','exhausted')),
  source text not null default 'scheduler' check (source in ('scheduler','staff_retry')),
  correlation_id text not null check (char_length(correlation_id) between 8 and 128),
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  error_reference text,
  foreign key(branch_id,operator_id) references public.branches(id,operator_id) on delete restrict
);

create index attendance_snapshots_branch_date_idx
on public.attendance_snapshots(operator_id,branch_id,finalized_at desc);
create index attendance_snapshot_students_status_idx
on public.attendance_snapshot_students(snapshot_id,status,display_name);
create index background_job_runs_target_idx
on public.background_job_runs(target_session_id,started_at desc);
create index background_job_runs_failed_idx
on public.background_job_runs(status,started_at desc)
where status in ('failed','exhausted');
create unique index background_job_runs_attendance_attempt_unique
on public.background_job_runs(target_session_id,attempt)
where target_session_id is not null;

alter table public.attendance_snapshots enable row level security;
alter table public.attendance_snapshot_students enable row level security;
alter table public.background_job_runs enable row level security;
revoke all on public.attendance_snapshots,public.attendance_snapshot_students,public.background_job_runs from anon,authenticated;
grant select on public.attendance_snapshots,public.attendance_snapshot_students,public.background_job_runs to authenticated;

create policy "Authorized staff read Attendance Snapshots" on public.attendance_snapshots
for select to authenticated using (private.has_active_branch_access(operator_id,branch_id));
create policy "Authorized staff read Attendance Snapshot roster" on public.attendance_snapshot_students
for select to authenticated using (private.has_active_branch_access(operator_id,branch_id));
create policy "Authorized staff and platform admins read Attendance jobs" on public.background_job_runs
for select to authenticated using (
  private.is_platform_admin()
  or (operator_id is not null and branch_id is not null and private.has_active_branch_access(operator_id,branch_id))
);

create function private.reject_attendance_snapshot_mutation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  raise exception 'Attendance Snapshots are immutable' using errcode='22023';
end;
$$;
create trigger attendance_snapshots_immutable before update or delete on public.attendance_snapshots
for each row execute function private.reject_attendance_snapshot_mutation();
create trigger attendance_snapshot_students_immutable before update or delete on public.attendance_snapshot_students
for each row execute function private.reject_attendance_snapshot_mutation();

create function private.finalize_attendance_session(target_session_id uuid,requested_correlation_id text)
returns uuid language plpgsql security definer set search_path='' as $$
declare target_session public.attendance_sessions%rowtype; existing_snapshot uuid; created_snapshot uuid;
begin
  if char_length(requested_correlation_id) not between 8 and 128 then
    raise exception 'Invalid correlation reference' using errcode='22023';
  end if;
  select * into target_session from public.attendance_sessions where id=target_session_id for update;
  if target_session.id is null then raise exception 'Attendance Session not found' using errcode='P0002'; end if;
  select id into existing_snapshot from public.attendance_snapshots
    where session_id=target_session.id and version=1;
  if existing_snapshot is not null then return existing_snapshot; end if;
  if target_session.status<>'open' then
    raise exception 'Attendance Session has no Snapshot' using errcode='P0001';
  end if;
  if clock_timestamp()<target_session.cutoff_at then
    raise exception 'Attendance cutoff has not passed' using errcode='P0001';
  end if;

  with eligible as materialized (
    select student.id student_id,student.display_name,
      coalesce(response.declaration,'unconfirmed') status,response.updated_at response_updated_at
    from public.students student
    join public.student_branch_history history on history.student_id=student.id
      and history.operator_id=target_session.operator_id
      and history.branch_id=target_session.branch_id
      and history.started_at<=target_session.cutoff_at
      and (history.ended_at is null or history.ended_at>target_session.cutoff_at)
    left join public.attendance_responses response
      on response.session_id=target_session.id and response.student_id=student.id
      and response.updated_at<=target_session.cutoff_at
    where student.status='active'
  ), snapshot as (
    insert into public.attendance_snapshots(
      operator_id,branch_id,session_id,version,eligible_count,staying_count,away_count,
      unconfirmed_count,correlation_id
    ) select target_session.operator_id,target_session.branch_id,target_session.id,1,count(*)::integer,
      count(*) filter(where status='staying')::integer,count(*) filter(where status='away')::integer,
      count(*) filter(where status='unconfirmed')::integer,requested_correlation_id
    from eligible returning id
  ), roster as (
    insert into public.attendance_snapshot_students(
      snapshot_id,operator_id,branch_id,session_id,student_id,display_name,status,response_updated_at
    ) select snapshot.id,target_session.operator_id,target_session.branch_id,target_session.id,
      eligible.student_id,eligible.display_name,eligible.status,eligible.response_updated_at
    from eligible cross join snapshot returning snapshot_id
  ) select id into created_snapshot from snapshot;

  update public.attendance_sessions set status='finalized' where id=target_session.id;
  return created_snapshot;
end;
$$;

create function private.run_attendance_finalization(
  target_session_id uuid,requested_correlation_id text,run_source text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare target_session public.attendance_sessions%rowtype; run_id uuid; attempt_number integer;
  started timestamptz:=clock_timestamp(); snapshot_id uuid; final_status text;
begin
  if run_source not in ('scheduler','staff_retry') then raise exception 'Invalid job source' using errcode='22023'; end if;
  select * into target_session from public.attendance_sessions where id=target_session_id for update;
  if target_session.id is null then raise exception 'Attendance Session not found' using errcode='P0002'; end if;
  select coalesce(max(attempt),0)+1 into attempt_number from public.background_job_runs
    where job_key='attendance.finalize:'||target_session.id;
  insert into public.background_job_runs(job_key,attempt,operator_id,branch_id,target_session_id,status,source,correlation_id)
  values('attendance.finalize:'||target_session.id,attempt_number,target_session.operator_id,target_session.branch_id,
    target_session.id,'running',run_source,requested_correlation_id) returning id into run_id;
  begin
    snapshot_id:=private.finalize_attendance_session(target_session.id,requested_correlation_id);
    final_status:='succeeded';
    update public.background_job_runs set status=final_status,completed_at=clock_timestamp(),
      duration_ms=greatest(0,round(extract(epoch from clock_timestamp()-started)*1000)::integer)
    where id=run_id;
  exception when others then
    final_status:=case when attempt_number>=3 then 'exhausted' else 'failed' end;
    update public.background_job_runs set status=final_status,completed_at=clock_timestamp(),
      duration_ms=greatest(0,round(extract(epoch from clock_timestamp()-started)*1000)::integer),
      error_reference=requested_correlation_id where id=run_id;
  end;
  return jsonb_build_object('run_id',run_id,'session_id',target_session.id,'snapshot_id',snapshot_id,
    'attempt',attempt_number,'status',final_status,'correlation_id',requested_correlation_id);
end;
$$;

create function public.finalize_due_attendance(requested_correlation_id text,maximum_sessions integer default 100)
returns jsonb language plpgsql security definer set search_path='' as $$
declare due record; result jsonb; attempted integer:=0; succeeded integer:=0; failed integer:=0;
begin
  if maximum_sessions not between 1 and 500 then raise exception 'Invalid batch size' using errcode='22023'; end if;
  for due in select id from public.attendance_sessions
    where status='open' and cutoff_at<=clock_timestamp() order by cutoff_at,id limit maximum_sessions
  loop
    result:=private.run_attendance_finalization(due.id,requested_correlation_id,'scheduler');
    attempted:=attempted+1;
    if result->>'status'='succeeded' then succeeded:=succeeded+1; else failed:=failed+1; end if;
  end loop;
  return jsonb_build_object('attempted',attempted,'succeeded',succeeded,'failed',failed,'correlation_id',requested_correlation_id);
end;
$$;

create function public.retry_attendance_finalization(target_session_id uuid,requested_correlation_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target_session public.attendance_sessions%rowtype;
begin
  select * into target_session from public.attendance_sessions where id=target_session_id;
  if target_session.id is null
    or not private.has_active_branch_access(target_session.operator_id,target_session.branch_id)
    or not private.capability_enabled(target_session.operator_id,'attendance',target_session.branch_id) then
    raise exception 'Attendance retry denied' using errcode='42501';
  end if;
  if target_session.cutoff_at>clock_timestamp() then raise exception 'Attendance cutoff has not passed' using errcode='P0001'; end if;
  return private.run_attendance_finalization(target_session.id,requested_correlation_id,'staff_retry');
end;
$$;

revoke all on function private.reject_attendance_snapshot_mutation(),private.finalize_attendance_session(uuid,text),
  private.run_attendance_finalization(uuid,text,text),public.finalize_due_attendance(text,integer),
  public.retry_attendance_finalization(uuid,text) from public,anon,authenticated;
grant execute on function public.finalize_due_attendance(text,integer) to service_role;
grant execute on function public.retry_attendance_finalization(uuid,text) to authenticated;
