create table public.meal_snapshots (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null,
  branch_id uuid not null,
  meal_day_id uuid not null,
  version integer not null default 1 check (version=1),
  eligible_students integer not null check (eligible_students>=0),
  responded integer not null check (responded>=0),
  zero_meal integer not null check (zero_meal>=0),
  unconfirmed integer not null check (unconfirmed>=0),
  offering_totals jsonb not null check (jsonb_typeof(offering_totals)='object'),
  finalized_at timestamptz not null default clock_timestamp(),
  correlation_id text not null check (char_length(correlation_id) between 8 and 160),
  foreign key (meal_day_id,operator_id,branch_id) references public.meal_days(id,operator_id,branch_id) on delete restrict,
  unique(meal_day_id),unique(id,meal_day_id,operator_id,branch_id),
  check (responded+unconfirmed=eligible_students and zero_meal<=responded)
);

create table public.meal_snapshot_students (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null,
  meal_day_id uuid not null,
  operator_id uuid not null,
  branch_id uuid not null,
  student_id uuid not null,
  student_access_id text not null,
  student_name text not null,
  response_status text not null check(response_status in ('selected','zero_meal','unconfirmed')),
  selected_meals text[] not null default array[]::text[] check(selected_meals <@ array['breakfast','lunch','dinner']),
  submitted_at timestamptz,
  foreign key(snapshot_id,meal_day_id,operator_id,branch_id)
    references public.meal_snapshots(id,meal_day_id,operator_id,branch_id) on delete restrict,
  foreign key(student_id,operator_id) references public.students(id,operator_id) on delete restrict,
  unique(snapshot_id,student_id)
);
create index meal_snapshot_students_day_idx on public.meal_snapshot_students(operator_id,branch_id,meal_day_id,student_name);

create table public.meal_corrections (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null,
  meal_day_id uuid not null,
  operator_id uuid not null,
  branch_id uuid not null,
  student_id uuid not null,
  before_meals text[] not null check(before_meals <@ array['breakfast','lunch','dinner']),
  after_meals text[] not null check(after_meals <@ array['breakfast','lunch','dinner']),
  reason text not null check(char_length(btrim(reason)) between 4 and 500),
  corrected_by uuid not null references auth.users(id) on delete restrict,
  corrected_at timestamptz not null default clock_timestamp(),
  correlation_id text not null check(char_length(correlation_id) between 8 and 160),
  foreign key(snapshot_id,meal_day_id,operator_id,branch_id)
    references public.meal_snapshots(id,meal_day_id,operator_id,branch_id) on delete restrict,
  foreign key(snapshot_id,student_id) references public.meal_snapshot_students(snapshot_id,student_id) on delete restrict
);
create index meal_corrections_latest_idx on public.meal_corrections(snapshot_id,student_id,corrected_at desc,id desc);

alter table public.background_job_runs
  add column target_id uuid,
  add column finished_at timestamptz,
  add column result_summary jsonb not null default '{}' check(jsonb_typeof(result_summary)='object');
create index background_job_runs_status_idx on public.background_job_runs(status,started_at desc);
create index background_job_runs_branch_idx on public.background_job_runs(operator_id,branch_id,started_at desc);

alter table public.meal_snapshots enable row level security;
alter table public.meal_snapshot_students enable row level security;
alter table public.meal_corrections enable row level security;
alter table public.background_job_runs enable row level security;
revoke all on public.meal_snapshots,public.meal_snapshot_students,public.meal_corrections,public.background_job_runs from anon,authenticated;
grant select on public.meal_snapshots,public.meal_snapshot_students,public.meal_corrections,public.background_job_runs to authenticated;

create policy "Authorized staff read Meal Snapshots" on public.meal_snapshots for select to authenticated
using(private.has_active_branch_access(operator_id,branch_id));
create policy "Authorized staff read Meal Snapshot Students" on public.meal_snapshot_students for select to authenticated
using(private.has_active_branch_access(operator_id,branch_id));
create policy "Authorized staff read Meal Corrections" on public.meal_corrections for select to authenticated
using(private.has_active_branch_access(operator_id,branch_id));
create policy "Authorized operators and Platform Admins read Job Runs" on public.background_job_runs for select to authenticated
using(private.is_platform_admin() or (branch_id is not null and private.has_active_branch_access(operator_id,branch_id)));

create function private.guard_immutable_meal_history()
returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'Final Meal history is append-only and immutable' using errcode='55000'; end;
$$;
create trigger meal_snapshots_immutable before update or delete on public.meal_snapshots for each row execute function private.guard_immutable_meal_history();
create trigger meal_snapshot_students_immutable before update or delete on public.meal_snapshot_students for each row execute function private.guard_immutable_meal_history();
create trigger meal_corrections_immutable before update or delete on public.meal_corrections for each row execute function private.guard_immutable_meal_history();

create function private.finalize_meal_day(target_meal_day_id uuid,target_correlation_id text)
returns uuid language plpgsql security definer set search_path='' as $$
declare day public.meal_days%rowtype;snapshot_id uuid;eligible_count integer;responded_count integer;zero_count integer;
  breakfast_count integer;lunch_count integer;dinner_count integer;
begin
  select * into day from public.meal_days where id=target_meal_day_id for update;
  if day.id is null then raise exception 'Meal Day not found' using errcode='P0002'; end if;
  select id into snapshot_id from public.meal_snapshots where meal_day_id=day.id;
  if snapshot_id is not null then return snapshot_id; end if;
  if day.deadline_at>clock_timestamp() then raise exception 'Meal Day is not due' using errcode='55000'; end if;
  with eligible as (
    select student.id,response.id response_id,
      coalesce(array_agg(offering.meal_type order by offering.meal_type) filter(where offering.meal_type is not null),array[]::text[]) selected
    from public.students student join public.student_branch_history history on history.student_id=student.id
      and history.operator_id=day.operator_id and history.branch_id=day.branch_id
      and history.started_at<=day.deadline_at and (history.ended_at is null or history.ended_at>day.deadline_at)
    left join public.meal_responses response on response.meal_day_id=day.id and response.student_id=student.id and response.submitted_at<=day.deadline_at
    left join public.meal_selections selection on selection.response_id=response.id
    left join public.meal_offerings offering on offering.id=selection.offering_id
    where student.status='active' group by student.id,response.id
  ) select count(*),count(*) filter(where response_id is not null),count(*) filter(where response_id is not null and cardinality(selected)=0),
    count(*) filter(where 'breakfast'=any(selected)),count(*) filter(where 'lunch'=any(selected)),count(*) filter(where 'dinner'=any(selected))
  into eligible_count,responded_count,zero_count,breakfast_count,lunch_count,dinner_count from eligible;
  insert into public.meal_snapshots(operator_id,branch_id,meal_day_id,eligible_students,responded,zero_meal,unconfirmed,offering_totals,correlation_id)
  values(day.operator_id,day.branch_id,day.id,eligible_count,responded_count,zero_count,eligible_count-responded_count,
    jsonb_build_object('breakfast',breakfast_count,'lunch',lunch_count,'dinner',dinner_count),target_correlation_id)
  returning id into snapshot_id;
  insert into public.meal_snapshot_students(snapshot_id,meal_day_id,operator_id,branch_id,student_id,student_access_id,student_name,response_status,selected_meals,submitted_at)
  select snapshot_id,day.id,day.operator_id,day.branch_id,student.id,student.access_id,student.display_name,
    case when response.id is null then 'unconfirmed' when count(offering.id)=0 then 'zero_meal' else 'selected' end,
    coalesce(array_agg(offering.meal_type order by offering.meal_type) filter(where offering.meal_type is not null),array[]::text[]),response.submitted_at
  from public.students student join public.student_branch_history history on history.student_id=student.id
    and history.operator_id=day.operator_id and history.branch_id=day.branch_id
    and history.started_at<=day.deadline_at and (history.ended_at is null or history.ended_at>day.deadline_at)
  left join public.meal_responses response on response.meal_day_id=day.id and response.student_id=student.id and response.submitted_at<=day.deadline_at
  left join public.meal_selections selection on selection.response_id=response.id
  left join public.meal_offerings offering on offering.id=selection.offering_id
  where student.status='active' group by student.id,response.id;
  update public.meal_days set status='locked' where id=day.id;
  insert into public.audit_events(operator_id,branch_id,actor_type,action,target_type,target_id,after_summary,correlation_id)
  values(day.operator_id,day.branch_id,'system','meal_day.finalized','meal_snapshot',snapshot_id,
    jsonb_build_object('eligible_students',eligible_count,'responded',responded_count,'zero_meal',zero_count,'offering_totals',jsonb_build_object('breakfast',breakfast_count,'lunch',lunch_count,'dinner',dinner_count)),target_correlation_id);
  return snapshot_id;
end;
$$;
create function public.finalize_meal_day(target_meal_day_id uuid,target_correlation_id text)
returns uuid language sql security invoker set search_path='' as $$select private.finalize_meal_day(target_meal_day_id,target_correlation_id);$$;

create function private.correct_meal_selection(target_meal_day_id uuid,target_student_id uuid,selected_meals text[],correction_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare snapshot public.meal_snapshots%rowtype;student_row public.meal_snapshot_students%rowtype;before_selection text[];correction_id uuid;
begin
  select * into snapshot from public.meal_snapshots where meal_day_id=target_meal_day_id for share;
  if snapshot.id is null or not private.can_manage_student_branch(snapshot.operator_id,snapshot.branch_id) then
    raise exception 'Meal correction denied' using errcode='42501';
  end if;
  if not private.capability_enabled(snapshot.operator_id,'meals',snapshot.branch_id) then
    raise exception 'Meal correction denied' using errcode='42501';
  end if;
  if char_length(btrim(coalesce(correction_reason,'')))<4 then raise exception 'Correction reason is required' using errcode='22023';end if;
  selected_meals:=coalesce(selected_meals,array[]::text[]);
  if cardinality(selected_meals)<>(select count(distinct meal) from unnest(selected_meals) meal)
    or exists(select 1 from unnest(selected_meals) meal where not exists(
      select 1 from public.meal_offerings offering where offering.meal_day_id=target_meal_day_id and offering.meal_type=meal)) then
    raise exception 'Only published Meal Offerings may be selected' using errcode='22023';
  end if;
  select * into student_row from public.meal_snapshot_students where snapshot_id=snapshot.id and student_id=target_student_id;
  if student_row.id is null then raise exception 'Student was not eligible at cutoff' using errcode='22023';end if;
  select after_meals into before_selection from public.meal_corrections where snapshot_id=snapshot.id and student_id=target_student_id order by corrected_at desc,id desc limit 1;
  before_selection:=coalesce(before_selection,student_row.selected_meals);
  insert into public.meal_corrections(snapshot_id,meal_day_id,operator_id,branch_id,student_id,before_meals,after_meals,reason,corrected_by,correlation_id)
  values(snapshot.id,snapshot.meal_day_id,snapshot.operator_id,snapshot.branch_id,target_student_id,before_selection,selected_meals,btrim(correction_reason),auth.uid(),private.current_correlation_id()) returning id into correction_id;
  insert into public.audit_events(operator_id,branch_id,actor_user_id,actor_type,action,target_type,target_id,before_summary,after_summary,correlation_id)
  values(snapshot.operator_id,snapshot.branch_id,auth.uid(),'operator_staff','meal_selection.corrected','meal_correction',correction_id,
    jsonb_build_object('student_id',target_student_id,'selected_meals',before_selection),jsonb_build_object('student_id',target_student_id,'selected_meals',selected_meals,'reason',btrim(correction_reason)),private.current_correlation_id());
  return correction_id;
end;
$$;
create function public.correct_meal_selection(target_meal_day_id uuid,target_student_id uuid,selected_meals text[],correction_reason text)
returns uuid language sql security invoker set search_path='' as $$select private.correct_meal_selection(target_meal_day_id,target_student_id,selected_meals,correction_reason);$$;

create view public.meal_final_student_status with(security_invoker=true) as
select snapshot.operator_id,snapshot.branch_id,snapshot.meal_day_id,row.student_id,row.student_access_id,row.student_name,
  row.response_status as cutoff_response_status,row.selected_meals as cutoff_selected_meals,
  case when correction.id is null then row.response_status when cardinality(correction.after_meals)=0 then 'zero_meal' else 'selected' end as response_status,
  coalesce(correction.after_meals,row.selected_meals) as selected_meals,correction.id is not null as corrected,correction.reason as correction_reason
from public.meal_snapshots snapshot join public.meal_snapshot_students row on row.snapshot_id=snapshot.id
left join lateral(select item.id,item.after_meals,item.reason from public.meal_corrections item
  where item.snapshot_id=snapshot.id and item.student_id=row.student_id order by item.corrected_at desc,item.id desc limit 1) correction on true;

create view public.meal_final_totals with(security_invoker=true) as
select snapshot.operator_id,snapshot.branch_id,snapshot.meal_day_id,snapshot.eligible_students,snapshot.responded as cutoff_responded,
  snapshot.zero_meal as cutoff_zero_meal,snapshot.unconfirmed as cutoff_unconfirmed,snapshot.offering_totals as cutoff_offering_totals,
  count(*) filter(where status.response_status<>'unconfirmed')::integer as responded,
  count(*) filter(where status.response_status='zero_meal')::integer as zero_meal,
  count(*) filter(where status.response_status='unconfirmed')::integer as unconfirmed,
  jsonb_build_object('breakfast',count(*) filter(where 'breakfast'=any(status.selected_meals)),'lunch',count(*) filter(where 'lunch'=any(status.selected_meals)),'dinner',count(*) filter(where 'dinner'=any(status.selected_meals))) as offering_totals,
  count(*) filter(where status.corrected)::integer as corrections
from public.meal_snapshots snapshot join public.meal_final_student_status status on status.meal_day_id=snapshot.meal_day_id
group by snapshot.id,snapshot.operator_id,snapshot.branch_id,snapshot.meal_day_id,snapshot.eligible_students,snapshot.responded,snapshot.zero_meal,snapshot.unconfirmed,snapshot.offering_totals;

create function public.meal_export_rows(target_meal_day_id uuid)
returns table(student_access_id text,student_name text,response_status text,selected_meals text[],corrected boolean)
language plpgsql stable security definer set search_path='' as $$
declare snapshot public.meal_snapshots%rowtype;
begin
  select * into snapshot from public.meal_snapshots where meal_day_id=target_meal_day_id;
  if snapshot.id is null or not private.has_active_branch_access(snapshot.operator_id,snapshot.branch_id) then
    raise exception 'Meal export denied' using errcode='42501';
  end if;
  return query select status.student_access_id,status.student_name,status.response_status,status.selected_meals,status.corrected
  from public.meal_final_student_status status where status.meal_day_id=target_meal_day_id order by status.student_name,status.student_id;
end;
$$;

revoke all on function private.guard_immutable_meal_history(),private.finalize_meal_day(uuid,text),private.correct_meal_selection(uuid,uuid,text[],text),
  public.finalize_meal_day(uuid,text),public.correct_meal_selection(uuid,uuid,text[],text),public.meal_export_rows(uuid) from public,anon,authenticated;
grant execute on function public.finalize_meal_day(uuid,text) to service_role;
grant execute on function public.correct_meal_selection(uuid,uuid,text[],text),public.meal_export_rows(uuid) to authenticated;
grant execute on function private.finalize_meal_day(uuid,text) to service_role;
grant execute on function private.correct_meal_selection(uuid,uuid,text[],text) to authenticated;
revoke all on public.meal_final_student_status,public.meal_final_totals from anon,authenticated;
grant select on public.meal_final_student_status,public.meal_final_totals to authenticated;
