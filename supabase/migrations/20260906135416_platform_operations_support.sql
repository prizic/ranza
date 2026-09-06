-- Platform identities always require MFA, including direct Data API access.
alter table private.platform_memberships alter column mfa_required set default true;
update private.platform_memberships set mfa_required=true;
alter table private.platform_memberships add constraint platform_mfa_required check(mfa_required);
create function private.is_platform_staff() returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and coalesce(auth.jwt()->>'aal','')='aal2'
    and exists(select 1 from private.platform_memberships where auth_user_id=auth.uid() and status='active')
    and not exists(select 1 from public.operator_memberships where auth_user_id=auth.uid())
    and exists(select 1 from auth.sessions where user_id=auth.uid() and id=nullif(auth.jwt()->>'session_id','')::uuid
      and (not_after is null or not_after>statement_timestamp()));
$$;
create or replace function private.is_platform_admin() returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_platform_staff() and exists(select 1 from private.platform_memberships where auth_user_id=auth.uid() and role='platform_admin');
$$;
revoke all on function private.is_platform_staff() from public,anon;
grant execute on function private.is_platform_staff() to authenticated;
create function private.prevent_mixed_platform_identity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (tg_table_name='platform_memberships' and exists(select 1 from public.operator_memberships where auth_user_id=new.auth_user_id))
    or (tg_table_name='operator_memberships' and exists(select 1 from private.platform_memberships where auth_user_id=new.auth_user_id)) then
    raise exception 'Platform and Operator identities must be separate' using errcode='23514'; end if;
  return new;
end;
$$;
revoke all on function private.prevent_mixed_platform_identity() from public,anon,authenticated;
create trigger platform_identity_separation before insert or update of auth_user_id on private.platform_memberships for each row execute function private.prevent_mixed_platform_identity();
create trigger operator_identity_separation before insert or update of auth_user_id on public.operator_memberships for each row execute function private.prevent_mixed_platform_identity();

create table private.support_contexts (
  id uuid primary key default gen_random_uuid(), operator_id uuid not null references public.operators(id),
  actor_user_id uuid not null references auth.users(id),reason text not null check(char_length(btrim(reason)) between 10 and 500),
  started_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,revoked_at timestamptz,
  check(expires_at>started_at and expires_at<=started_at+interval '1 hour')
);
create index support_context_actor_idx on private.support_contexts(actor_user_id,expires_at);
alter table private.support_contexts enable row level security;
revoke all on private.support_contexts from public,anon,authenticated;
grant select on private.support_contexts to authenticated;
create policy own_support_contexts on private.support_contexts for select to authenticated using(private.is_platform_staff() and actor_user_id=auth.uid());
create view public.support_contexts with(security_invoker=true) as select id,operator_id,actor_user_id,reason,started_at,expires_at,revoked_at from private.support_contexts;
grant select on public.support_contexts to authenticated;
alter table public.audit_events add column support_context_id uuid references private.support_contexts(id),add column reason text;
create index audit_events_action_target_time_idx on public.audit_events(operator_id,action,target_id,occurred_at desc);

create function private.require_support_context(context_id uuid,target_operator_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_platform_staff() then raise exception 'Platform access denied' using errcode='42501'; end if;
  perform 1 from private.support_contexts c where c.id=context_id
    and c.operator_id=target_operator_id and c.actor_user_id=auth.uid() and c.revoked_at is null and c.expires_at>clock_timestamp() for share;
  if not found then
    raise exception 'Active support context required' using errcode='42501'; end if;
end;
$$;
create function private.start_support_context(target_operator_id uuid,context_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare context_id uuid; started timestamptz:=clock_timestamp();
begin
  if not private.is_platform_staff() then raise exception 'Platform access denied' using errcode='42501'; end if;
  perform 1 from private.platform_memberships where auth_user_id=auth.uid() for update;
  update private.support_contexts set revoked_at=started where actor_user_id=auth.uid() and revoked_at is null;
  insert into private.support_contexts(operator_id,actor_user_id,reason,started_at,expires_at)
  values(target_operator_id,auth.uid(),btrim(context_reason),started,started+interval '30 minutes') returning id into context_id;
  insert into public.audit_events(operator_id,actor_user_id,actor_type,action,target_type,target_id,support_context_id,reason,after_summary,correlation_id)
  values(target_operator_id,auth.uid(),'prizic_staff','support.context_started','support_context',context_id,context_id,btrim(context_reason),jsonb_build_object('expires_at',started+interval '30 minutes'),private.current_correlation_id());
  return context_id;
end;
$$;
create function public.start_support_context(target_operator_id uuid,context_reason text) returns uuid
language sql security invoker set search_path='' as $$select private.start_support_context(target_operator_id,context_reason);$$;
create function private.revoke_support_context(context_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare target_operator uuid;
begin
  if not private.is_platform_staff() then raise exception 'Platform access denied' using errcode='42501'; end if;
  update private.support_contexts set revoked_at=clock_timestamp() where id=context_id and actor_user_id=auth.uid() returning operator_id into target_operator;
  if target_operator is null then raise exception 'Support context denied' using errcode='42501'; end if;
  insert into public.audit_events(operator_id,actor_user_id,actor_type,action,target_type,target_id,support_context_id,after_summary,correlation_id)
  values(target_operator,auth.uid(),'prizic_staff','support.context_revoked','support_context',context_id,context_id,'{}',private.current_correlation_id());
end;
$$;
create function public.revoke_support_context(context_id uuid) returns void
language sql security invoker set search_path='' as $$select private.revoke_support_context(context_id);$$;

-- This support override can only disable a capability. It cannot grant a paid
-- feature or edit customer records. Re-enabling follows the Admin entitlement UI.
create function private.support_disable_capability(context_id uuid,target_operator_id uuid,capability text,override_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare before_status text; target_id uuid;
begin
  perform private.require_support_context(context_id,target_operator_id);
  if override_reason is null or char_length(btrim(override_reason)) not between 10 and 500 then raise exception 'Override reason required' using errcode='22023'; end if;
  select id,status into target_id,before_status from public.operator_entitlements where operator_id=target_operator_id and capability_key=capability for update;
  perform private.require_support_context(context_id,target_operator_id);
  if target_id is null then raise exception 'Capability unavailable' using errcode='42501'; end if;
  update public.operator_entitlements set status='revoked' where id=target_id;
  insert into public.audit_events(operator_id,actor_user_id,actor_type,action,target_type,target_id,support_context_id,reason,before_summary,after_summary,correlation_id)
  values(target_operator_id,auth.uid(),'prizic_staff','support.capability_disabled','operator_entitlement',target_id,context_id,btrim(override_reason),
    jsonb_build_object('status',before_status),jsonb_build_object('status','revoked'),private.current_correlation_id());
end;
$$;
create function public.support_disable_capability(context_id uuid,target_operator_id uuid,capability text,override_reason text) returns void
language sql security invoker set search_path='' as $$select private.support_disable_capability(context_id,target_operator_id,capability,override_reason);$$;

create function private.redacted_audit_summary(value jsonb) returns jsonb
language sql immutable security invoker set search_path='' as $$
  select coalesce(jsonb_object_agg(key,item),'{}') from jsonb_each(coalesce(value,'{}')) t(key,item)
  where (key in ('status','mode') and item#>>'{}' in ('active','inactive','suspended','archived','granted','revoked','protected','public_qr','running','succeeded','failed','exhausted'))
    or (key in ('revision','count') and jsonb_typeof(item)='number');
$$;
create function private.search_platform_audit(context_id uuid,filters jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target_operator uuid; rows jsonb;
begin
  if not private.is_platform_staff() then raise exception 'Platform access denied' using errcode='42501'; end if;
  target_operator:=nullif(filters->>'operator','')::uuid;
  if not private.is_platform_admin() then perform private.require_support_context(context_id,target_operator); end if;
  select coalesce(jsonb_agg(to_jsonb(item)),'[]') into rows from (
    select id,operator_id,branch_id,actor_user_id,action,target_type,target_id,occurred_at,correlation_id,support_context_id,
      private.redacted_audit_summary(before_summary) as before_summary,private.redacted_audit_summary(after_summary) as after_summary
    from public.audit_events a where (target_operator is null or a.operator_id=target_operator)
      and (nullif(filters->>'branch','') is null or a.branch_id=(filters->>'branch')::uuid)
      and (nullif(filters->>'actor','') is null or a.actor_user_id=(filters->>'actor')::uuid)
      and (nullif(filters->>'action','') is null or a.action=filters->>'action')
      and (nullif(filters->>'target','') is null or a.target_id=(filters->>'target')::uuid)
      and (nullif(filters->>'from','') is null or a.occurred_at>=(filters->>'from')::timestamptz)
      and (nullif(filters->>'to','') is null or a.occurred_at<(filters->>'to')::timestamptz)
    order by occurred_at desc,id desc limit 200
  ) item;
  return rows;
end;
$$;
create function public.search_platform_audit(context_id uuid,filters jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.search_platform_audit(context_id,filters);$$;

create table private.operational_signals (
  component text primary key check(component in ('storefront','product_web','control_plane','database','scheduler','auth_gateway','exports')),
  status text not null check(status in ('ok','failed','unknown')),observed_at timestamptz not null default clock_timestamp()
);
alter table private.operational_signals enable row level security;
revoke all on private.operational_signals from public,anon,authenticated;
create function public.record_operational_signal(component text,signal_status text) returns void
language sql security definer set search_path='' as $$
  insert into private.operational_signals(component,status) values(component,signal_status)
  on conflict on constraint operational_signals_pkey do update set status=excluded.status,observed_at=clock_timestamp();
$$;
revoke all on function public.record_operational_signal(text,text) from public,anon,authenticated;
grant execute on function public.record_operational_signal(text,text) to service_role;
create function private.platform_health(context_id uuid,target_operator_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare jobs jsonb; signals jsonb;
begin
  if not private.is_platform_staff() then raise exception 'Platform access denied' using errcode='42501'; end if;
  if not private.is_platform_admin() then perform private.require_support_context(context_id,target_operator_id); end if;
  select coalesce(jsonb_agg(to_jsonb(item)),'[]') into jobs from (
    select id,operator_id,branch_id,job_key,coalesce(target_session_id,target_id) target_id,status,started_at,
      coalesce(completed_at,finished_at) completed_at,correlation_id
    from public.background_job_runs where (target_operator_id is null or operator_id=target_operator_id)
      and (status in ('failed','exhausted') or (status='running' and started_at<clock_timestamp()-interval '10 minutes'))
    order by started_at desc limit 100
  ) item;
  select coalesce(jsonb_agg(to_jsonb(s)),'[]') into signals from private.operational_signals s;
  return jsonb_build_object('signals',signals,'jobs',jobs,'database','ok',
    'attendance_due',(select count(*) from public.attendance_sessions a where cutoff_at<clock_timestamp() and not exists(select 1 from public.attendance_snapshots s where s.session_id=a.id) and (target_operator_id is null or a.operator_id=target_operator_id)),
    'meals_due',(select count(*) from public.meal_days where deadline_at<clock_timestamp() and status='published' and (target_operator_id is null or operator_id=target_operator_id)));
end;
$$;
create function public.platform_health(context_id uuid,target_operator_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.platform_health(context_id,target_operator_id);$$;

create table private.support_job_retries (
  job_id uuid primary key references public.background_job_runs(id),context_id uuid not null references private.support_contexts(id),
  result jsonb not null,created_at timestamptz not null default clock_timestamp()
);
alter table private.support_job_retries enable row level security;
revoke all on private.support_job_retries from public,anon,authenticated;
create function private.retry_platform_job(context_id uuid,target_job_id uuid,retry_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.background_job_runs%rowtype; result jsonb; snapshot uuid; correlation text:=private.current_correlation_id();
begin
  select * into job from public.background_job_runs where id=target_job_id for update;
  perform private.require_support_context(context_id,job.operator_id);
  if retry_reason is null or char_length(btrim(retry_reason)) not between 10 and 500 then raise exception 'Retry reason required' using errcode='22023'; end if;
  select r.result into result from private.support_job_retries r where r.job_id=job.id;
  if result is not null then return result; end if;
  if job.status not in ('failed','exhausted') and not (job.status='running' and job.started_at<clock_timestamp()-interval '10 minutes') then raise exception 'Job is not retryable' using errcode='55000'; end if;
  if job.target_session_id is not null and job.job_key like 'attendance.finalize:%' then
    result:=private.run_attendance_finalization(job.target_session_id,correlation,'staff_retry');
  elsif job.job_key='meal.finalize' and job.target_id is not null then
    begin
      snapshot:=private.finalize_meal_day(job.target_id,correlation);
      result:=jsonb_build_object('status','succeeded','snapshot_id',snapshot);
    exception when others then result:=jsonb_build_object('status','failed','correlation_id',correlation); end;
  else raise exception 'Unsupported safe retry' using errcode='42501'; end if;
  insert into private.support_job_retries(job_id,context_id,result) values(job.id,context_id,result);
  insert into public.audit_events(operator_id,branch_id,actor_user_id,actor_type,action,target_type,target_id,support_context_id,reason,before_summary,after_summary,correlation_id)
  values(job.operator_id,job.branch_id,auth.uid(),'prizic_staff','support.job_retried','background_job',job.id,context_id,btrim(retry_reason),
    jsonb_build_object('status',job.status),jsonb_build_object('status',result->>'status'),correlation);
  return result;
end;
$$;
create function public.retry_platform_job(context_id uuid,target_job_id uuid,retry_reason text) returns jsonb
language sql security invoker set search_path='' as $$select private.retry_platform_job(context_id,target_job_id,retry_reason);$$;

revoke all on function private.require_support_context(uuid,uuid),private.redacted_audit_summary(jsonb),private.start_support_context(uuid,text),public.start_support_context(uuid,text),private.revoke_support_context(uuid),public.revoke_support_context(uuid),private.support_disable_capability(uuid,uuid,text,text),public.support_disable_capability(uuid,uuid,text,text),private.search_platform_audit(uuid,jsonb),public.search_platform_audit(uuid,jsonb),private.platform_health(uuid,uuid),public.platform_health(uuid,uuid),private.retry_platform_job(uuid,uuid,text),public.retry_platform_job(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.start_support_context(uuid,text),public.start_support_context(uuid,text),private.revoke_support_context(uuid),public.revoke_support_context(uuid),private.support_disable_capability(uuid,uuid,text,text),public.support_disable_capability(uuid,uuid,text,text),private.search_platform_audit(uuid,jsonb),public.search_platform_audit(uuid,jsonb),private.platform_health(uuid,uuid),public.platform_health(uuid,uuid),private.retry_platform_job(uuid,uuid,text),public.retry_platform_job(uuid,uuid,text) to authenticated;
