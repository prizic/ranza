-- Owners use their existing Operator identity; platform access remains separate.
create policy "Requesting Owner reads own Operator exports" on public.operator_data_exports
for select to authenticated using(requested_by=(select auth.uid()) and private.is_operator_owner(operator_id));
create policy "Requesting Owner reads own ready export objects" on storage.objects
for select to authenticated using(bucket_id='operator-exports' and exists(
  select 1 from public.operator_data_exports e where e.object_path=storage.objects.name
  and e.requested_by=(select auth.uid()) and private.is_operator_owner(e.operator_id)
  and e.status='ready' and e.expires_at>clock_timestamp()
));

create or replace function private.request_operator_export(target_operator_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare export_id uuid:=gen_random_uuid();retention_hours integer;platform_actor boolean:=private.is_platform_admin();
begin
  if auth.uid() is null or not (platform_actor or private.is_operator_owner(target_operator_id))
    or not exists(select 1 from public.operators where id=target_operator_id) then
    raise exception 'Operator export denied' using errcode='42501';
  end if;
  select policy.export_retention_hours into retention_hours from public.operator_lifecycle_policies policy where policy.operator_id=target_operator_id;
  retention_hours:=coalesce(retention_hours,24);
  insert into public.operator_data_exports(id,operator_id,requested_by,object_path,expires_at)
  values(export_id,target_operator_id,auth.uid(),export_id::text||'.json',clock_timestamp()+make_interval(hours=>retention_hours));
  insert into public.audit_events(operator_id,actor_user_id,actor_type,action,target_type,target_id,after_summary,correlation_id)
  values(target_operator_id,auth.uid(),case when platform_actor then 'prizic_staff' else 'operator_staff' end,'operator_export.requested','operator_export',export_id,
    jsonb_build_object('expires_in_hours',retention_hours),private.current_correlation_id());
  return export_id;
end;$$;
create or replace function private.authorize_operator_export(target_export_id uuid,target_operator_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare export public.operator_data_exports%rowtype;platform_actor boolean:=private.is_platform_admin();
begin
  select * into export from public.operator_data_exports where id=target_export_id and operator_id=target_operator_id for share;
  if auth.uid() is null or not (platform_actor or private.is_operator_owner(target_operator_id)) or export.id is null
    or export.requested_by<>auth.uid() or export.status<>'ready' or export.expires_at<=clock_timestamp() then
    raise exception 'Operator export download denied' using errcode='42501';
  end if;
  insert into public.audit_events(operator_id,actor_user_id,actor_type,action,target_type,target_id,after_summary,correlation_id)
  values(export.operator_id,auth.uid(),case when platform_actor then 'prizic_staff' else 'operator_staff' end,'operator_export.download_authorized','operator_export',export.id,
    jsonb_build_object('expires_at',export.expires_at),private.current_correlation_id());
  return export.object_path;
end;$$;
-- The public invoker wrappers need execute on their guarded private counterparts.
grant execute on function private.request_operator_export(uuid),private.authorize_operator_export(uuid,uuid) to authenticated;

-- Successful results remain idempotent. A failed attempt can be retried after a
-- one-minute cooldown, at most three attempts per original source job.
alter table private.support_job_retries add column attempt_count integer not null default 1 check(attempt_count between 1 and 3),
  add column last_attempt_at timestamptz not null default clock_timestamp();
create function private.support_retry_available(result jsonb,attempt_count integer,last_attempt_at timestamptz,checked_at timestamptz)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(result->>'status'='failed' and attempt_count<3 and last_attempt_at<=checked_at-interval '1 minute',false);
$$;
revoke all on function private.support_retry_available(jsonb,integer,timestamptz,timestamptz) from public,anon,authenticated;

create or replace function private.retry_platform_job(context_id uuid,target_job_id uuid,retry_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.background_job_runs%rowtype; prior private.support_job_retries%rowtype; result jsonb;
  snapshot uuid;correlation text:=private.current_correlation_id();attempt integer;
begin
  select * into job from public.background_job_runs where id=target_job_id for update;
  perform private.require_support_context(context_id,job.operator_id);
  if retry_reason is null or char_length(btrim(retry_reason)) not between 10 and 500 then raise exception 'Retry reason required' using errcode='22023'; end if;
  select * into prior from private.support_job_retries r where r.job_id=job.id;
  if prior.job_id is not null and not private.support_retry_available(prior.result,prior.attempt_count,prior.last_attempt_at,clock_timestamp()) then return prior.result; end if;
  if job.status not in ('failed','exhausted') and not (job.status='running' and job.started_at<clock_timestamp()-interval '10 minutes') then raise exception 'Job is not retryable' using errcode='55000'; end if;
  attempt:=coalesce(prior.attempt_count,0)+1;
  if job.target_session_id is not null and job.job_key like 'attendance.finalize:%' then
    result:=private.run_attendance_finalization(job.target_session_id,correlation,'staff_retry');
  elsif job.job_key='meal.finalize' and job.target_id is not null then
    begin
      snapshot:=private.finalize_meal_day(job.target_id,correlation);
      result:=jsonb_build_object('status','succeeded','snapshot_id',snapshot);
    exception when others then result:=jsonb_build_object('status','failed','correlation_id',correlation); end;
  else raise exception 'Unsupported safe retry' using errcode='42501'; end if;
  result:=result||jsonb_build_object('support_attempt',attempt,'retry_exhausted',attempt>=3 and result->>'status'='failed');
  insert into private.support_job_retries(job_id,context_id,result,attempt_count,last_attempt_at)
  values(job.id,context_id,result,attempt,clock_timestamp())
  on conflict(job_id) do update set context_id=excluded.context_id,result=excluded.result,attempt_count=excluded.attempt_count,last_attempt_at=excluded.last_attempt_at;
  insert into public.audit_events(operator_id,branch_id,actor_user_id,actor_type,action,target_type,target_id,support_context_id,reason,before_summary,after_summary,correlation_id)
  values(job.operator_id,job.branch_id,auth.uid(),'prizic_staff','support.job_retried','background_job',job.id,context_id,btrim(retry_reason),
    jsonb_build_object('status',job.status),jsonb_build_object('status',result->>'status','count',attempt),correlation);
  return result;
end;
$$;
