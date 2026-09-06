insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('operator-exports','operator-exports',false,52428800,array['application/json'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table public.operator_data_exports(
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'queued' check(status in ('queued','running','ready','failed','expired','deleted')),
  object_path text not null unique check(object_path=id::text||'.json'),
  manifest jsonb not null default '{"schema_version":1}' check(jsonb_typeof(manifest)='object'),
  encryption_mode text not null default 'platform_managed_at_rest' check(encryption_mode='platform_managed_at_rest'),
  attempt_count integer not null default 0 check(attempt_count>=0),
  error_reference text,
  requested_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  expires_at timestamptz not null,
  check(expires_at>requested_at),
  check((status='ready' and completed_at is not null) or status<>'ready')
);
create index operator_data_exports_queue_idx on public.operator_data_exports(status,requested_at);
create index operator_data_exports_operator_idx on public.operator_data_exports(operator_id,requested_at desc);

create table public.operator_lifecycle_policies(
  operator_id uuid primary key references public.operators(id) on delete restrict,
  version integer not null default 1 check(version>0),
  archive_retention_days integer not null check(archive_retention_days between 1 and 36500),
  anonymize_after_days integer not null check(anonymize_after_days between archive_retention_days and 36500),
  delete_after_days integer not null check(delete_after_days between anonymize_after_days and 36500),
  export_retention_hours integer not null default 24 check(export_retention_hours between 1 and 168),
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table public.operator_data_lifecycle(
  operator_id uuid primary key references public.operators(id) on delete restrict,
  state text not null check(state in ('active','suspended','archived','retained','anonymization_scheduled','anonymized','deletion_scheduled','deleted')),
  policy_version integer,
  retention_until timestamptz,
  anonymize_after timestamptz,
  delete_after timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);

create table public.operator_lifecycle_runs(
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators(id) on delete restrict,
  action text not null check(action in ('anonymize','delete')),
  policy_version integer not null check(policy_version>0),
  is_dry_run boolean not null default true,
  status text not null default 'planned' check(status in ('planned','queued','running','succeeded','failed')),
  manifest jsonb not null check(jsonb_typeof(manifest)='object'),
  requested_by uuid not null references auth.users(id) on delete restrict,
  idempotency_key text,
  attempt_count integer not null default 0 check(attempt_count>=0),
  error_reference text,
  requested_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  unique(operator_id,idempotency_key)
);

alter table public.operator_data_exports enable row level security;
alter table public.operator_lifecycle_policies enable row level security;
alter table public.operator_data_lifecycle enable row level security;
alter table public.operator_lifecycle_runs enable row level security;
revoke all on public.operator_data_exports,public.operator_lifecycle_policies,
  public.operator_data_lifecycle,public.operator_lifecycle_runs from anon,authenticated;
grant select on public.operator_data_exports,public.operator_lifecycle_policies,
  public.operator_data_lifecycle,public.operator_lifecycle_runs to authenticated;

create policy "Requesting Platform Admin reads Operator Exports" on public.operator_data_exports
for select to authenticated using(private.is_platform_admin() and requested_by=(select auth.uid()));
create policy "Platform Admin reads lifecycle policies" on public.operator_lifecycle_policies
for select to authenticated using(private.is_platform_admin());
create policy "Platform Admin reads lifecycle state" on public.operator_data_lifecycle
for select to authenticated using(private.is_platform_admin());
create policy "Requesting Platform Admin reads lifecycle runs" on public.operator_lifecycle_runs
for select to authenticated using(private.is_platform_admin() and requested_by=(select auth.uid()));
create policy "Requesting Platform Admin reads encrypted export objects" on storage.objects
for select to authenticated using(bucket_id='operator-exports' and private.is_platform_admin() and exists(
  select 1 from public.operator_data_exports export
  where export.object_path=storage.objects.name and export.requested_by=(select auth.uid())
    and export.status='ready' and export.expires_at>clock_timestamp()
));

create function private.request_operator_export(target_operator_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare export_id uuid:=gen_random_uuid();retention_hours integer;
begin
  if auth.uid() is null or not private.is_platform_admin()
    or not exists(select 1 from public.operators where id=target_operator_id) then
    raise exception 'Operator export denied' using errcode='42501';
  end if;
  select policy.export_retention_hours into retention_hours from public.operator_lifecycle_policies policy where policy.operator_id=target_operator_id;
  retention_hours:=coalesce(retention_hours,24);
  insert into public.operator_data_exports(id,operator_id,requested_by,object_path,expires_at)
  values(export_id,target_operator_id,auth.uid(),export_id::text||'.json',clock_timestamp()+make_interval(hours=>retention_hours));
  insert into public.audit_events(operator_id,actor_user_id,actor_type,action,target_type,target_id,after_summary,correlation_id)
  values(target_operator_id,auth.uid(),'prizic_staff','operator_export.requested','operator_export',export_id,
    jsonb_build_object('expires_in_hours',retention_hours),private.current_correlation_id());
  return export_id;
end;$$;
create function public.request_operator_export(target_operator_id uuid)
returns uuid language sql security invoker set search_path='' as $$select private.request_operator_export(target_operator_id);$$;

create function private.authorize_operator_export(target_export_id uuid,target_operator_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare export public.operator_data_exports%rowtype;
begin
  select * into export from public.operator_data_exports where id=target_export_id and operator_id=target_operator_id for share;
  if auth.uid() is null or not private.is_platform_admin() or export.id is null
    or export.requested_by<>auth.uid() or export.status<>'ready' or export.expires_at<=clock_timestamp() then
    raise exception 'Operator export download denied' using errcode='42501';
  end if;
  insert into public.audit_events(operator_id,actor_user_id,actor_type,action,target_type,target_id,after_summary,correlation_id)
  values(export.operator_id,auth.uid(),'prizic_staff','operator_export.download_authorized','operator_export',export.id,
    jsonb_build_object('expires_at',export.expires_at),private.current_correlation_id());
  return export.object_path;
end;$$;
create function public.authorize_operator_export(target_export_id uuid,target_operator_id uuid)
returns text language sql security invoker set search_path='' as $$select private.authorize_operator_export(target_export_id,target_operator_id);$$;

create function private.approve_operator_lifecycle_policy(target_operator_id uuid,archive_days integer,anonymize_days integer,delete_days integer,export_hours integer)
returns integer language plpgsql security definer set search_path='' as $$
declare policy_version integer;
begin
  if auth.uid() is null or not private.is_platform_admin() then raise exception 'Lifecycle policy denied' using errcode='42501';end if;
  insert into public.operator_lifecycle_policies(operator_id,version,archive_retention_days,anonymize_after_days,delete_after_days,export_retention_hours,approved_by)
  values(target_operator_id,1,archive_days,anonymize_days,delete_days,export_hours,auth.uid())
  on conflict(operator_id) do update set version=operator_lifecycle_policies.version+1,
    archive_retention_days=excluded.archive_retention_days,anonymize_after_days=excluded.anonymize_after_days,
    delete_after_days=excluded.delete_after_days,export_retention_hours=excluded.export_retention_hours,
    approved_by=auth.uid(),approved_at=clock_timestamp(),updated_at=clock_timestamp()
  returning version into policy_version;
  insert into public.audit_events(operator_id,actor_user_id,actor_type,action,target_type,target_id,after_summary,correlation_id)
  values(target_operator_id,auth.uid(),'prizic_staff','operator_lifecycle.policy_approved','operator',target_operator_id,
    jsonb_build_object('policy_version',policy_version,'archive_days',archive_days,'anonymize_days',anonymize_days,'delete_days',delete_days),private.current_correlation_id());
  return policy_version;
end;$$;
create function public.approve_operator_lifecycle_policy(target_operator_id uuid,archive_days integer,anonymize_days integer,delete_days integer,export_hours integer default 24)
returns integer language sql security invoker set search_path='' as $$select private.approve_operator_lifecycle_policy(target_operator_id,archive_days,anonymize_days,delete_days,export_hours);$$;

create function private.plan_operator_lifecycle(target_operator_id uuid,target_action text)
returns uuid language plpgsql security definer set search_path='' as $$
declare operator public.operators%rowtype;policy public.operator_lifecycle_policies%rowtype;run_id uuid;manifest jsonb;
begin
  select * into operator from public.operators where id=target_operator_id for share;
  select * into policy from public.operator_lifecycle_policies where operator_id=target_operator_id for share;
  if auth.uid() is null or not private.is_platform_admin() or operator.id is null or operator.status<>'archived'
    or policy.operator_id is null or target_action not in ('anonymize','delete') then
    raise exception 'Lifecycle dry run denied' using errcode='42501';
  end if;
  manifest:=jsonb_build_object('schemaVersion',1,'operatorId',operator.id,'action',target_action,'policyVersion',policy.version,
    'counts',jsonb_build_object(
      'branches',(select count(*) from public.branches where operator_id=operator.id),
      'students',(select count(*) from public.students where operator_id=operator.id),
      'audit',(select count(*) from public.audit_events where operator_id=operator.id)
    ));
  insert into public.operator_lifecycle_runs(operator_id,action,policy_version,manifest,requested_by)
  values(operator.id,target_action,policy.version,manifest,auth.uid()) returning id into run_id;
  insert into public.audit_events(operator_id,actor_user_id,actor_type,action,target_type,target_id,after_summary,correlation_id)
  values(operator.id,auth.uid(),'prizic_staff','operator_lifecycle.dry_run_created','operator_lifecycle_run',run_id,manifest,private.current_correlation_id());
  return run_id;
end;$$;
create function public.plan_operator_lifecycle(target_operator_id uuid,target_action text)
returns uuid language sql security invoker set search_path='' as $$select private.plan_operator_lifecycle(target_operator_id,target_action);$$;

create function private.execute_operator_lifecycle(target_run_id uuid,target_operator_id uuid,target_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare run public.operator_lifecycle_runs%rowtype;policy_version integer;
begin
  select * into run from public.operator_lifecycle_runs where id=target_run_id and operator_id=target_operator_id for update;
  select version into policy_version from public.operator_lifecycle_policies where operator_id=target_operator_id for share;
  if auth.uid() is null or not private.is_platform_admin() or run.id is null or not run.is_dry_run or run.status<>'planned'
    or run.requested_by<>auth.uid() or run.policy_version<>policy_version or char_length(btrim(coalesce(target_idempotency_key,'')))<8 then
    raise exception 'Lifecycle execution denied' using errcode='42501';
  end if;
  update public.operator_lifecycle_runs set is_dry_run=false,status='queued',idempotency_key=btrim(target_idempotency_key) where id=run.id;
  update public.operator_data_lifecycle set state=case when run.action='anonymize' then 'anonymization_scheduled' else 'deletion_scheduled' end,
    updated_at=clock_timestamp() where operator_id=run.operator_id;
  insert into public.audit_events(operator_id,actor_user_id,actor_type,action,target_type,target_id,after_summary,correlation_id)
  values(run.operator_id,auth.uid(),'prizic_staff','operator_lifecycle.execution_queued','operator_lifecycle_run',run.id,
    jsonb_build_object('action',run.action,'policy_version',run.policy_version),private.current_correlation_id());
  return run.id;
end;$$;
create function public.execute_operator_lifecycle(target_run_id uuid,target_operator_id uuid,target_idempotency_key text)
returns uuid language sql security invoker set search_path='' as $$select private.execute_operator_lifecycle(target_run_id,target_operator_id,target_idempotency_key);$$;

create function private.sync_operator_data_lifecycle()
returns trigger language plpgsql security definer set search_path='' as $$
declare policy public.operator_lifecycle_policies%rowtype;
begin
  select * into policy from public.operator_lifecycle_policies where operator_id=new.id;
  insert into public.operator_data_lifecycle(operator_id,state,policy_version,retention_until,anonymize_after,delete_after)
  values(new.id,case new.status when 'active' then 'active' when 'suspended' then 'suspended' else case when policy.operator_id is null then 'archived' else 'retained' end end,
    policy.version,
    case when new.status='archived' and policy.operator_id is not null then new.archived_at+make_interval(days=>policy.archive_retention_days) end,
    case when new.status='archived' and policy.operator_id is not null then new.archived_at+make_interval(days=>policy.anonymize_after_days) end,
    case when new.status='archived' and policy.operator_id is not null then new.archived_at+make_interval(days=>policy.delete_after_days) end)
  on conflict(operator_id) do update set state=excluded.state,policy_version=excluded.policy_version,
    retention_until=excluded.retention_until,anonymize_after=excluded.anonymize_after,delete_after=excluded.delete_after,updated_at=clock_timestamp();
  return new;
end;$$;
create trigger operators_sync_data_lifecycle after insert or update of status on public.operators
for each row execute function private.sync_operator_data_lifecycle();
insert into public.operator_data_lifecycle(operator_id,state)
select id,case status when 'active' then 'active' when 'suspended' then 'suspended' else 'archived' end from public.operators
on conflict(operator_id) do nothing;

revoke all on function private.request_operator_export(uuid),private.authorize_operator_export(uuid,uuid),
  private.approve_operator_lifecycle_policy(uuid,integer,integer,integer,integer),private.plan_operator_lifecycle(uuid,text),
  private.execute_operator_lifecycle(uuid,uuid,text),private.sync_operator_data_lifecycle(),
  public.request_operator_export(uuid),public.authorize_operator_export(uuid,uuid),
  public.approve_operator_lifecycle_policy(uuid,integer,integer,integer,integer),public.plan_operator_lifecycle(uuid,text),
  public.execute_operator_lifecycle(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.request_operator_export(uuid),public.authorize_operator_export(uuid,uuid),
  public.approve_operator_lifecycle_policy(uuid,integer,integer,integer,integer),public.plan_operator_lifecycle(uuid,text),
  public.execute_operator_lifecycle(uuid,uuid,text) to authenticated;
