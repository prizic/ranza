-- Only the server credential gateway can inspect hashes, reservations or rate buckets.
-- Stable non-secret IDs are shorter than UUIDs and grouped for dictation. Existing IDs remain valid.
alter table public.students alter column access_id set default
  ('rz-' || substr(gen_random_uuid()::text,1,8) || '-' || substr(gen_random_uuid()::text,1,8));
create table private.student_credentials (
  student_id uuid primary key references public.students(id) on delete restrict,
  auth_user_id uuid not null unique default gen_random_uuid(),
  auth_identifier text not null unique default (gen_random_uuid()::text || '@students.ranza.invalid'),
  activation_hash text not null check (activation_hash ~ '^scrypt-v1\$[a-f0-9]{32}\$[a-f0-9]{64}$'),
  activation_expires_at timestamptz not null,
  activation_used_at timestamptz,
  activation_claim uuid,
  activated_at timestamptz,
  pin_version text not null default 'pin-v1' check (pin_version='pin-v1'),
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  issued_at timestamptz not null default clock_timestamp()
);
create table private.student_credential_rate_limits (
  kind text not null check (kind in ('network','credential')),
  key_hash text not null check (key_hash ~ '^[a-f0-9]{64}$'),
  window_start timestamptz not null,
  attempts integer not null,
  primary key(kind,key_hash)
);
alter table private.student_credentials enable row level security;
alter table private.student_credential_rate_limits enable row level security;
revoke all on private.student_credentials,private.student_credential_rate_limits from public,anon,authenticated;

create function private.issue_student_activation(target_student_id uuid,code_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.students%rowtype; b public.student_branch_history%rowtype;
begin
  select * into s from public.students where id=target_student_id for update;
  select * into b from public.student_branch_history where student_id=s.id and ended_at is null;
  if auth.uid() is null or s.id is null or s.status<>'active' or s.auth_user_id is not null
    or not private.can_manage_student_branch(s.operator_id,b.branch_id) then
    raise exception 'Credential issue denied' using errcode='42501';
  end if;
  if exists(select 1 from private.student_credentials where student_id=s.id and activation_claim is not null) then
    raise exception 'Credential issue denied' using errcode='42501';
  end if;
  insert into private.student_credentials(student_id,activation_hash,activation_expires_at)
  values(s.id,code_hash,clock_timestamp()+interval '24 hours')
  on conflict(student_id) do update set activation_hash=excluded.activation_hash,
    activation_expires_at=excluded.activation_expires_at,activation_used_at=null,
    failed_attempts=0,locked_until=null,issued_at=clock_timestamp();
  insert into public.audit_events(operator_id,branch_id,actor_user_id,actor_type,action,target_type,target_id,after_summary,correlation_id)
  values(s.operator_id,b.branch_id,auth.uid(),'operator_staff','student.credential_issued','student',s.id,
    jsonb_build_object('expires_in_hours',24),private.current_correlation_id());
  return jsonb_build_object('access_id',s.access_id,'expires_at',(select activation_expires_at from private.student_credentials where student_id=s.id));
end;
$$;
revoke all on function private.issue_student_activation(uuid,text) from public,anon;
grant execute on function private.issue_student_activation(uuid,text) to authenticated;
create function public.issue_student_activation(target_student_id uuid,code_hash text)
returns jsonb language sql security invoker set search_path='' as $$
  select private.issue_student_activation(target_student_id,code_hash);
$$;
revoke all on function public.issue_student_activation(uuid,text) from public,anon;
grant execute on function public.issue_student_activation(uuid,text) to authenticated;

-- Counts ALL attempts before hashing or lookup; independent rows serialize concurrent requests.
create function public.student_credential_attempt(credential_key text,network_key text)
returns boolean language plpgsql security definer set search_path='' as $$
declare credential_count integer; network_count integer;
begin
  insert into private.student_credential_rate_limits(kind,key_hash,window_start,attempts)
  values('network',network_key,clock_timestamp(),1)
  on conflict(kind,key_hash) do update set
    attempts=case when student_credential_rate_limits.window_start<clock_timestamp()-interval '15 minutes' then 1 else student_credential_rate_limits.attempts+1 end,
    window_start=case when student_credential_rate_limits.window_start<clock_timestamp()-interval '15 minutes' then clock_timestamp() else student_credential_rate_limits.window_start end
  returning attempts into network_count;
  insert into private.student_credential_rate_limits(kind,key_hash,window_start,attempts)
  values('credential',credential_key,clock_timestamp(),1)
  on conflict(kind,key_hash) do update set
    attempts=case when student_credential_rate_limits.window_start<clock_timestamp()-interval '15 minutes' then 1 else student_credential_rate_limits.attempts+1 end,
    window_start=case when student_credential_rate_limits.window_start<clock_timestamp()-interval '15 minutes' then clock_timestamp() else student_credential_rate_limits.window_start end
  returning attempts into credential_count;
  return network_count<=100 and credential_count<=10;
end;
$$;

create function public.student_activation_lookup(student_access_id text)
returns jsonb language sql security definer set search_path='' as $$
  select jsonb_build_object('student_id',s.id,'activation_hash',c.activation_hash)
  from private.student_credentials c join public.students s on s.id=c.student_id
  join public.operators o on o.id=s.operator_id
  join public.student_branch_history h on h.student_id=s.id and h.ended_at is null
  join public.branches b on b.id=h.branch_id
  where s.access_id=student_access_id and s.status='active' and o.status='active' and b.status='active'
  and h.started_at<=clock_timestamp() and s.auth_user_id is null and c.activated_at is null
  and c.activation_used_at is null and c.activation_expires_at>clock_timestamp()
  and (c.locked_until is null or c.locked_until<=clock_timestamp());
$$;

create function public.student_activation_failure(student_access_id text)
returns void language plpgsql security definer set search_path='' as $$
begin
  update private.student_credentials c set failed_attempts=case when c.locked_until<=clock_timestamp() then 1 else c.failed_attempts+1 end,
    locked_until=case when c.locked_until<=clock_timestamp() then null when c.failed_attempts+1>=5 then clock_timestamp()+interval '15 minutes' else c.locked_until end
  from public.students s where s.id=c.student_id and s.access_id=student_access_id;
end;
$$;

create function public.claim_student_activation(target_student_id uuid,expected_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.student_credentials%rowtype; s public.students%rowtype;
begin
  -- Same order as issuance prevents issue/consume races.
  select * into s from public.students where id=target_student_id for update;
  if s.auth_user_id is not null or public.student_activation_lookup(s.access_id) is null then return null; end if;
  update private.student_credentials set activation_used_at=clock_timestamp(),activation_claim=gen_random_uuid()
  where student_id=s.id and activation_hash=expected_hash and activation_used_at is null
  returning * into c;
  if c.student_id is null then return null; end if;
  return jsonb_build_object('student_id',c.student_id,'auth_user_id',c.auth_user_id,'auth_identifier',c.auth_identifier,'claim',c.activation_claim);
end;
$$;

create function public.finish_student_activation(target_student_id uuid,claim uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare c private.student_credentials%rowtype; s public.students%rowtype;
begin
  select * into s from public.students where id=target_student_id for update;
  select * into c from private.student_credentials where student_id=s.id for update;
  if c.activation_claim is distinct from claim or claim is null or c.activated_at is not null or s.status<>'active'
    or not exists(select 1 from public.operators o join public.student_branch_history h on h.operator_id=o.id and h.student_id=s.id and h.ended_at is null
      join public.branches b on b.id=h.branch_id where o.status='active' and b.status='active')
    or not exists(select 1 from auth.users u where u.id=c.auth_user_id and u.email=c.auth_identifier) then return false; end if;
  update public.students set auth_user_id=c.auth_user_id,updated_at=clock_timestamp() where id=s.id and auth_user_id is null;
  if not found then return false; end if;
  update private.student_credentials set activated_at=clock_timestamp(),activation_claim=null,failed_attempts=0,locked_until=null where student_id=s.id;
  insert into public.audit_events(operator_id,actor_user_id,actor_type,action,target_type,target_id,after_summary,correlation_id)
  values(s.operator_id,c.auth_user_id,'student','student.activated','student',s.id,'{}'::jsonb,private.current_correlation_id());
  return true;
end;
$$;

-- A handled upstream failure leaves the code consumed, but permits staff to reissue.
-- A process crash leaves its claim locked for explicit operator reconciliation, never unsafe replay.
create function public.abandon_student_activation(target_student_id uuid,claim uuid)
returns void language sql security definer set search_path='' as $$
  update private.student_credentials set activation_claim=null
  where student_id=target_student_id and activation_claim=claim and activated_at is null;
$$;

revoke all on function public.student_credential_attempt(text,text),public.student_activation_lookup(text),
  public.student_activation_failure(text),public.claim_student_activation(uuid,text),
  public.finish_student_activation(uuid,uuid),public.abandon_student_activation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.student_credential_attempt(text,text),public.student_activation_lookup(text),
  public.student_activation_failure(text),public.claim_student_activation(uuid,text),
  public.finish_student_activation(uuid,uuid),public.abandon_student_activation(uuid,uuid) to service_role;
