alter table public.operator_lifecycle_runs drop constraint operator_lifecycle_runs_status_check;
alter table public.operator_lifecycle_runs add constraint operator_lifecycle_runs_status_check
check(status in ('planned','queued','running','succeeded','failed','exhausted'));
alter table public.operator_lifecycle_runs
  add column claimed_at timestamptz,
  add column next_attempt_at timestamptz,
  add column worker_correlation_id text,
  add column result_summary jsonb not null default '{}' check(jsonb_typeof(result_summary)='object');
create index operator_lifecycle_runs_worker_queue_idx
on public.operator_lifecycle_runs(status,next_attempt_at,requested_at)
where status in ('queued','failed');

create function private.process_operator_lifecycle_run(target_run_id uuid,target_correlation_id text)
returns table(claimed boolean,run_id uuid,run_status text,attempt integer)
language plpgsql security definer set search_path='' as $$
declare
  target public.operator_lifecycle_runs%rowtype;
  lifecycle public.operator_data_lifecycle%rowtype;
  policy public.operator_lifecycle_policies%rowtype;
  target_operator public.operators%rowtype;
  next_attempt integer;
  affected_students integer:=0;
  affected_memberships integer:=0;
  affected_secrets integer:=0;
  error_state text;
  student_user_ids uuid[];
begin
  if char_length(btrim(coalesce(target_correlation_id,''))) not between 8 and 128 then
    raise exception 'Invalid lifecycle correlation reference' using errcode='22023';
  end if;
  select * into target from public.operator_lifecycle_runs run
  where run.id=target_run_id and not run.is_dry_run and run.status in ('queued','failed')
    and run.attempt_count<3 and (run.next_attempt_at is null or run.next_attempt_at<=clock_timestamp())
  for update skip locked;
  if target.id is null then
    return query select false,target_run_id,null::text,0;
    return;
  end if;
  next_attempt:=target.attempt_count+1;
  update public.operator_lifecycle_runs set status='running',attempt_count=next_attempt,
    claimed_at=clock_timestamp(),next_attempt_at=null,worker_correlation_id=btrim(target_correlation_id),error_reference=null
  where id=target.id;

  begin
    select * into target_operator from public.operators where id=target.operator_id for update;
    select * into lifecycle from public.operator_data_lifecycle where operator_id=target.operator_id for update;
    select * into policy from public.operator_lifecycle_policies where operator_id=target.operator_id for share;
    if target_operator.id is null or target_operator.status<>'archived' or policy.operator_id is null
      or policy.version<>target.policy_version then
      raise exception 'Lifecycle target or approved policy changed' using errcode='55000';
    end if;
    if target.action='anonymize' then
      if lifecycle.state not in ('anonymization_scheduled','anonymized')
        or lifecycle.anonymize_after is null or lifecycle.anonymize_after>clock_timestamp() then
        raise exception 'Anonymization retention period has not elapsed' using errcode='55000';
      end if;
      if lifecycle.state<>'anonymized' then
        select coalesce(array_agg(auth_user_id),array[]::uuid[]) into student_user_ids
        from public.students where operator_id=target.operator_id and auth_user_id is not null;
        update public.students set status='inactive',updated_at=clock_timestamp()
        where operator_id=target.operator_id and status='active';
        update public.students set display_name='Anonymized Student '||substr(id::text,1,8),
          access_id='anon-'||id::text,external_reference=null,auth_user_id=null,updated_at=clock_timestamp()
        where operator_id=target.operator_id;
        get diagnostics affected_students=row_count;
        delete from private.student_credentials credential using public.students student
        where credential.student_id=student.id and student.operator_id=target.operator_id;
        get diagnostics affected_secrets=row_count;
        update auth.users set email=id::text||'@anonymized.ranza.invalid',phone=null,
          raw_user_meta_data='{}'::jsonb,raw_app_meta_data='{}'::jsonb,updated_at=clock_timestamp()
        where id=any(student_user_ids);
        update public.operator_memberships set status='archived',revoked_at=coalesce(revoked_at,clock_timestamp()),updated_at=clock_timestamp()
        where operator_id=target.operator_id and status<>'archived';
        get diagnostics affected_memberships=row_count;
        update public.operator_data_lifecycle set state='anonymized',updated_at=clock_timestamp()
        where operator_id=target.operator_id;
      end if;
    elsif target.action='delete' then
      if lifecycle.state not in ('deletion_scheduled','deleted') or lifecycle.delete_after is null
        or lifecycle.delete_after>clock_timestamp() then
        raise exception 'Deletion retention period has not elapsed' using errcode='55000';
      end if;
      if not exists(select 1 from public.operator_lifecycle_runs prior
        where prior.operator_id=target.operator_id and prior.action='anonymize' and prior.status='succeeded') then
        raise exception 'Deletion requires completed anonymization' using errcode='55000';
      end if;
      if lifecycle.state<>'deleted' then
        delete from private.wifi_public_tokens token using public.branches branch
        where token.branch_id=branch.id and branch.operator_id=target.operator_id;
        delete from public.wifi_access where operator_id=target.operator_id;
        get diagnostics affected_secrets=row_count;
        update public.operator_data_lifecycle set state='deleted',updated_at=clock_timestamp()
        where operator_id=target.operator_id;
      end if;
    else
      raise exception 'Unsupported lifecycle action' using errcode='22023';
    end if;

    update public.operator_lifecycle_runs set status='succeeded',finished_at=clock_timestamp(),
      result_summary=jsonb_build_object('action',target.action,'students',affected_students,
        'memberships',affected_memberships,'secrets',affected_secrets,'tombstones_retained',true)
    where id=target.id;
    insert into public.audit_events(operator_id,actor_type,action,target_type,target_id,after_summary,correlation_id)
    values(target.operator_id,'system','operator_lifecycle.'||target.action||'_completed','operator_lifecycle_run',target.id,
      jsonb_build_object('attempt',next_attempt,'students',affected_students,'memberships',affected_memberships,
        'secrets',affected_secrets,'tombstones_retained',true),btrim(target_correlation_id));
    return query select true,target.id,'succeeded'::text,next_attempt;
  exception when others then
    error_state:=sqlstate;
    update public.operator_lifecycle_runs set status=case when next_attempt>=3 then 'exhausted' else 'failed' end,
      finished_at=clock_timestamp(),next_attempt_at=case when next_attempt>=3 then null else clock_timestamp()+
        case next_attempt when 1 then interval '1 minute' else interval '5 minutes' end end,
      error_reference='LIFECYCLE-'||target.id::text||'-'||error_state,
      result_summary=jsonb_build_object('action',target.action,'retryable',next_attempt<3,'sqlstate',error_state)
    where id=target.id;
    insert into public.audit_events(operator_id,actor_type,action,target_type,target_id,after_summary,correlation_id)
    values(target.operator_id,'system','operator_lifecycle.execution_failed','operator_lifecycle_run',target.id,
      jsonb_build_object('action',target.action,'attempt',next_attempt,'retryable',next_attempt<3,'error_reference','LIFECYCLE-'||target.id::text||'-'||error_state),
      btrim(target_correlation_id));
    return query select true,target.id,case when next_attempt>=3 then 'exhausted' else 'failed' end,next_attempt;
  end;
end;$$;

create function public.process_operator_lifecycle_run(target_run_id uuid,target_correlation_id text)
returns table(claimed boolean,run_id uuid,run_status text,attempt integer)
language sql security invoker set search_path='' as $$
  select * from private.process_operator_lifecycle_run(target_run_id,target_correlation_id);
$$;
revoke all on function private.process_operator_lifecycle_run(uuid,text),public.process_operator_lifecycle_run(uuid,text)
from public,anon,authenticated;
grant execute on function private.process_operator_lifecycle_run(uuid,text),public.process_operator_lifecycle_run(uuid,text)
to service_role;
