-- Preserve the Student identifier at cutoff so transfers never rewrite history.
alter table public.attendance_snapshot_students add column student_access_id text;
alter table public.attendance_snapshot_students disable trigger attendance_snapshot_students_immutable;
update public.attendance_snapshot_students roster
set student_access_id=student.access_id
from public.students student where student.id=roster.student_id;
alter table public.attendance_snapshot_students enable trigger attendance_snapshot_students_immutable;
alter table public.attendance_snapshot_students alter column student_access_id set not null;

create function private.fill_attendance_snapshot_student_access_id()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  select student.access_id into new.student_access_id
  from public.students student where student.id=new.student_id and student.operator_id=new.operator_id;
  return new;
end;
$$;
create trigger attendance_snapshot_student_access_id before insert on public.attendance_snapshot_students
for each row execute function private.fill_attendance_snapshot_student_access_id();

create table public.attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.attendance_snapshots(id) on delete restrict,
  session_id uuid not null,
  operator_id uuid not null,
  branch_id uuid not null,
  student_id uuid not null,
  before_status text not null check(before_status in ('staying','away','unconfirmed')),
  after_status text not null check(after_status in ('staying','away','unconfirmed')),
  reason text not null check(char_length(btrim(reason)) between 4 and 500),
  corrected_by uuid not null references auth.users(id) on delete restrict,
  corrected_at timestamptz not null default clock_timestamp(),
  correlation_id text not null check(char_length(correlation_id) between 8 and 160),
  foreign key(session_id,operator_id,branch_id) references public.attendance_sessions(id,operator_id,branch_id) on delete restrict,
  foreign key(snapshot_id,student_id) references public.attendance_snapshot_students(snapshot_id,student_id) on delete restrict,
  check(before_status<>after_status)
);

create table public.attendance_reopens (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.attendance_snapshots(id) on delete restrict,
  session_id uuid not null,
  operator_id uuid not null,
  branch_id uuid not null,
  reason text not null check(char_length(btrim(reason)) between 4 and 500),
  reopened_by uuid not null references auth.users(id) on delete restrict,
  reopened_at timestamptz not null default clock_timestamp(),
  correlation_id text not null check(char_length(correlation_id) between 8 and 160),
  foreign key(session_id,operator_id,branch_id) references public.attendance_sessions(id,operator_id,branch_id) on delete restrict
);

create index attendance_corrections_latest_idx
on public.attendance_corrections(snapshot_id,student_id,corrected_at desc,id desc);
create index attendance_reopens_session_idx
on public.attendance_reopens(session_id,reopened_at desc);

alter table public.attendance_corrections enable row level security;
alter table public.attendance_reopens enable row level security;
revoke all on public.attendance_corrections,public.attendance_reopens from anon,authenticated;
grant select on public.attendance_corrections,public.attendance_reopens to authenticated;
create policy "Authorized staff read Attendance Corrections" on public.attendance_corrections
for select to authenticated using(private.has_active_branch_access(operator_id,branch_id));
create policy "Authorized staff read Attendance Reopens" on public.attendance_reopens
for select to authenticated using(private.has_active_branch_access(operator_id,branch_id));

create function private.reject_attendance_exception_mutation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'Final Attendance exceptions are append-only' using errcode='55000'; end;
$$;
create trigger attendance_corrections_immutable before update or delete on public.attendance_corrections
for each row execute function private.reject_attendance_exception_mutation();
create trigger attendance_reopens_immutable before update or delete on public.attendance_reopens
for each row execute function private.reject_attendance_exception_mutation();

create function private.correct_attendance(
  target_session_id uuid,target_student_id uuid,new_status text,correction_reason text
) returns uuid language plpgsql security definer set search_path='' as $$
declare snapshot public.attendance_snapshots%rowtype; roster public.attendance_snapshot_students%rowtype;
  prior_status text; correction_id uuid; correlation text:=private.current_correlation_id();
begin
  select item.* into snapshot from public.attendance_snapshots item
  where item.session_id=target_session_id order by item.version desc limit 1 for share;
  if snapshot.id is null or not private.can_manage_attendance(snapshot.operator_id,snapshot.branch_id)
    or not private.capability_enabled(snapshot.operator_id,'attendance',snapshot.branch_id) then
    raise exception 'Attendance correction denied' using errcode='42501';
  end if;
  if new_status not in ('staying','away','unconfirmed') then
    raise exception 'Invalid Attendance status' using errcode='22023';
  end if;
  if char_length(btrim(coalesce(correction_reason,'')))<4 then
    raise exception 'Correction reason is required' using errcode='22023';
  end if;
  select item.* into roster from public.attendance_snapshot_students item
  where item.snapshot_id=snapshot.id and item.student_id=target_student_id;
  if roster.student_id is null then raise exception 'Student was not eligible at cutoff' using errcode='22023'; end if;
  select item.after_status into prior_status from public.attendance_corrections item
  where item.snapshot_id=snapshot.id and item.student_id=target_student_id
  order by item.corrected_at desc,item.id desc limit 1;
  prior_status:=coalesce(prior_status,roster.status);
  if prior_status=new_status then raise exception 'Attendance status is unchanged' using errcode='22023'; end if;
  insert into public.attendance_corrections(snapshot_id,session_id,operator_id,branch_id,student_id,before_status,after_status,reason,corrected_by,correlation_id)
  values(snapshot.id,snapshot.session_id,snapshot.operator_id,snapshot.branch_id,target_student_id,prior_status,new_status,btrim(correction_reason),auth.uid(),correlation)
  returning id into correction_id;
  insert into public.audit_events(operator_id,branch_id,actor_user_id,actor_type,action,target_type,target_id,before_summary,after_summary,correlation_id)
  values(snapshot.operator_id,snapshot.branch_id,auth.uid(),'operator_staff','attendance.corrected','attendance_correction',correction_id,
    jsonb_build_object('student_id',target_student_id,'status',prior_status),
    jsonb_build_object('student_id',target_student_id,'status',new_status,'reason',btrim(correction_reason)),correlation);
  return correction_id;
end;
$$;
create function public.correct_attendance(target_session_id uuid,target_student_id uuid,new_status text,correction_reason text)
returns uuid language sql security invoker set search_path='' as
$$select private.correct_attendance(target_session_id,target_student_id,new_status,correction_reason);$$;

create function private.reopen_attendance(target_session_id uuid,reopen_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare snapshot public.attendance_snapshots%rowtype; reopen_id uuid; correlation text:=private.current_correlation_id();
begin
  select item.* into snapshot from public.attendance_snapshots item
  where item.session_id=target_session_id order by item.version desc limit 1 for share;
  if snapshot.id is null or not private.can_manage_attendance(snapshot.operator_id,snapshot.branch_id)
    or not private.capability_enabled(snapshot.operator_id,'attendance',snapshot.branch_id) then
    raise exception 'Attendance reopen denied' using errcode='42501';
  end if;
  if char_length(btrim(coalesce(reopen_reason,'')))<4 then
    raise exception 'Reopen reason is required' using errcode='22023';
  end if;
  insert into public.attendance_reopens(snapshot_id,session_id,operator_id,branch_id,reason,reopened_by,correlation_id)
  values(snapshot.id,snapshot.session_id,snapshot.operator_id,snapshot.branch_id,btrim(reopen_reason),auth.uid(),correlation)
  returning id into reopen_id;
  insert into public.audit_events(operator_id,branch_id,actor_user_id,actor_type,action,target_type,target_id,before_summary,after_summary,correlation_id)
  values(snapshot.operator_id,snapshot.branch_id,auth.uid(),'operator_staff','attendance.reopened','attendance_reopen',reopen_id,
    jsonb_build_object('snapshot_id',snapshot.id,'version',snapshot.version),
    jsonb_build_object('snapshot_id',snapshot.id,'version',snapshot.version,'reason',btrim(reopen_reason)),correlation);
  return reopen_id;
end;
$$;
create function public.reopen_attendance(target_session_id uuid,reopen_reason text)
returns uuid language sql security invoker set search_path='' as
$$select private.reopen_attendance(target_session_id,reopen_reason);$$;

create view public.attendance_final_student_status with(security_invoker=true) as
select snapshot.id snapshot_id,snapshot.operator_id,snapshot.branch_id,snapshot.session_id,row.student_id,
  row.student_access_id,row.display_name student_name,row.status cutoff_status,
  coalesce(correction.after_status,row.status) effective_status,correction.id is not null corrected,
  correction.reason correction_reason,correction.corrected_at
from public.attendance_snapshots snapshot
join public.attendance_snapshot_students row on row.snapshot_id=snapshot.id
left join lateral(
  select item.id,item.after_status,item.reason,item.corrected_at from public.attendance_corrections item
  where item.snapshot_id=snapshot.id and item.student_id=row.student_id
  order by item.corrected_at desc,item.id desc limit 1
) correction on true;

create view public.attendance_final_totals with(security_invoker=true) as
select snapshot.id snapshot_id,snapshot.operator_id,snapshot.branch_id,snapshot.session_id,
  snapshot.eligible_count eligible_students,snapshot.staying_count cutoff_staying,
  snapshot.away_count cutoff_away,snapshot.unconfirmed_count cutoff_unconfirmed,
  count(*) filter(where status.effective_status='staying')::integer effective_staying,
  count(*) filter(where status.effective_status='away')::integer effective_away,
  count(*) filter(where status.effective_status='unconfirmed')::integer effective_unconfirmed,
  count(*) filter(where status.corrected)::integer corrected_students
from public.attendance_snapshots snapshot
join public.attendance_final_student_status status on status.snapshot_id=snapshot.id
group by snapshot.id;

create function public.attendance_export_rows(target_session_id uuid)
returns table(student_access_id text,student_name text,cutoff_status text,effective_status text,corrected boolean,correction_reason text)
language plpgsql stable security definer set search_path='' as $$
declare snapshot public.attendance_snapshots%rowtype;
begin
  select item.* into snapshot from public.attendance_snapshots item
  where item.session_id=target_session_id order by item.version desc limit 1;
  if snapshot.id is null or not private.has_active_branch_access(snapshot.operator_id,snapshot.branch_id) then
    raise exception 'Attendance export denied' using errcode='42501';
  end if;
  return query select status.student_access_id,status.student_name,status.cutoff_status,status.effective_status,status.corrected,status.correction_reason
  from public.attendance_final_student_status status where status.snapshot_id=snapshot.id
  order by status.student_name,status.student_id;
end;
$$;

create function public.attendance_export_totals(target_session_id uuid)
returns table(eligible_students integer,cutoff_staying integer,cutoff_away integer,cutoff_unconfirmed integer,
  effective_staying integer,effective_away integer,effective_unconfirmed integer,corrected_students integer)
language plpgsql stable security definer set search_path='' as $$
declare snapshot public.attendance_snapshots%rowtype;
begin
  select item.* into snapshot from public.attendance_snapshots item
  where item.session_id=target_session_id order by item.version desc limit 1;
  if snapshot.id is null or not private.has_active_branch_access(snapshot.operator_id,snapshot.branch_id) then
    raise exception 'Attendance export denied' using errcode='42501';
  end if;
  return query select totals.eligible_students,totals.cutoff_staying,totals.cutoff_away,totals.cutoff_unconfirmed,
    totals.effective_staying,totals.effective_away,totals.effective_unconfirmed,totals.corrected_students
  from public.attendance_final_totals totals where totals.snapshot_id=snapshot.id;
end;
$$;

revoke all on function private.fill_attendance_snapshot_student_access_id(),private.reject_attendance_exception_mutation(),
  private.correct_attendance(uuid,uuid,text,text),private.reopen_attendance(uuid,text),
  public.correct_attendance(uuid,uuid,text,text),public.reopen_attendance(uuid,text),
  public.attendance_export_rows(uuid),public.attendance_export_totals(uuid) from public,anon,authenticated;
grant execute on function private.correct_attendance(uuid,uuid,text,text),private.reopen_attendance(uuid,text),
  public.correct_attendance(uuid,uuid,text,text),public.reopen_attendance(uuid,text),
  public.attendance_export_rows(uuid),public.attendance_export_totals(uuid) to authenticated;
revoke all on public.attendance_final_student_status,public.attendance_final_totals from anon,authenticated;
grant select on public.attendance_final_student_status,public.attendance_final_totals to authenticated;
