-- Pending PIN changes cannot authorize data, even during Auth API races.
alter table private.student_credentials add column pin_ready boolean not null default true;

create or replace function private.current_student_id() returns uuid
language sql stable security definer set search_path='' as $$
  select s.id from public.students s
  join public.operators o on o.id=s.operator_id
  join public.student_branch_history h on h.student_id=s.id and h.ended_at is null
  join public.branches b on b.id=h.branch_id
  join private.student_credentials c on c.student_id=s.id and c.auth_user_id=s.auth_user_id
  join auth.sessions session on session.user_id=s.auth_user_id
    and session.id=nullif(auth.jwt()->>'session_id','')::uuid
  where s.auth_user_id=auth.uid() and s.status='active' and o.status='active' and b.status='active'
    and h.started_at<=statement_timestamp() and c.activated_at is not null and c.pin_ready
    and session.created_at>=c.activated_at and session.created_at>statement_timestamp()-interval '7 days'
    and (session.not_after is null or session.not_after>statement_timestamp())
    and not private.has_pending_session_revocation(auth.uid());
$$;

create function public.student_signin_lookup(student_access_id text) returns jsonb
language sql security definer set search_path='' as $$
  select jsonb_build_object('student_id',s.id,'auth_user_id',c.auth_user_id,'auth_identifier',c.auth_identifier)
  from public.students s join private.student_credentials c on c.student_id=s.id
  join public.operators o on o.id=s.operator_id
  join public.student_branch_history h on h.student_id=s.id and h.ended_at is null
  join public.branches b on b.id=h.branch_id
  where s.access_id=student_access_id and s.auth_user_id=c.auth_user_id and s.status='active'
  and o.status='active' and b.status='active' and h.started_at<=clock_timestamp()
  and c.activated_at is not null and c.pin_ready and (c.locked_until is null or c.locked_until<=clock_timestamp())
  and not private.has_pending_session_revocation(s.auth_user_id);
$$;
revoke all on function public.student_signin_lookup(text) from public,anon,authenticated;
grant execute on function public.student_signin_lookup(text) to service_role;

-- A locked credential does not extend its own deadline on every rejected retry.
create or replace function public.student_activation_failure(student_access_id text)
returns void language plpgsql security definer set search_path='' as $$
begin
  update private.student_credentials c set failed_attempts=case when c.locked_until<=clock_timestamp() then 1 else c.failed_attempts+1 end,
    locked_until=case when c.locked_until<=clock_timestamp() then null when c.failed_attempts+1>=5 then clock_timestamp()+interval '15 minutes' else c.locked_until end
  from public.students s where s.id=c.student_id and s.access_id=student_access_id
    and (c.locked_until is null or c.locked_until<=clock_timestamp());
end;
$$;

create function private.accept_student_session(target_student_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or private.current_student_id() is distinct from target_student_id then return false; end if;
  update private.student_credentials set failed_attempts=0,locked_until=null where student_id=target_student_id;
  return true;
end;
$$;
create function public.accept_student_session(target_student_id uuid) returns boolean
language sql security invoker set search_path='' as $$select private.accept_student_session(target_student_id);$$;
revoke all on function private.accept_student_session(uuid),public.accept_student_session(uuid) from public,anon;
grant execute on function private.accept_student_session(uuid),public.accept_student_session(uuid) to authenticated;

create function private.revoke_student_sessions(target_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  -- Sessions own their refresh tokens. RLS checks live session rows so issued
  -- JWTs cannot keep authorizing data after revocation.
  delete from auth.sessions where user_id=target_user_id;
  update private.session_revocation_requests set status='completed',completed_at=clock_timestamp()
  where auth_user_id=target_user_id and status in ('pending','processing','failed');
end;
$$;
revoke all on function private.revoke_student_sessions(uuid) from public,anon,authenticated;

create function private.sign_out_student_session() returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then return false; end if;
  if not exists(select 1 from public.students where auth_user_id=auth.uid()) then return false; end if;
  delete from auth.sessions where user_id=auth.uid() and id=nullif(auth.jwt()->>'session_id','')::uuid;
  return true;
end;
$$;
create function public.sign_out_student_session() returns boolean
language sql security invoker set search_path='' as $$select private.sign_out_student_session();$$;
revoke all on function private.sign_out_student_session(),public.sign_out_student_session() from public,anon;
grant execute on function private.sign_out_student_session(),public.sign_out_student_session() to authenticated;

create function private.recover_student_credential(target_student_id uuid,code_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.students%rowtype; b public.student_branch_history%rowtype;
begin
  select * into s from public.students where id=target_student_id for update;
  select * into b from public.student_branch_history where student_id=s.id and ended_at is null;
  if auth.uid() is null or s.id is null or s.status<>'active' or s.auth_user_id is null
    or not private.can_manage_student_branch(s.operator_id,b.branch_id) then
    raise exception 'Credential recovery denied' using errcode='42501';
  end if;
  -- Keep a claimed exchange isolated from a simultaneous staff reset.
  update private.student_credentials set activation_hash=code_hash,activation_expires_at=clock_timestamp()+interval '24 hours',
    activation_used_at=null,activated_at=null,pin_ready=false,failed_attempts=0,locked_until=null,issued_at=clock_timestamp()
  where student_id=s.id and activation_claim is null;
  if not found then raise exception 'Credential recovery denied' using errcode='42501'; end if;
  perform private.revoke_student_sessions(s.auth_user_id);
  insert into public.audit_events(operator_id,branch_id,actor_user_id,actor_type,action,target_type,target_id,after_summary,correlation_id)
  values(s.operator_id,b.branch_id,auth.uid(),'operator_staff','student.credential_reset','student',s.id,
    jsonb_build_object('expires_in_hours',24,'sessions_revoked',true),private.current_correlation_id());
  return jsonb_build_object('access_id',s.access_id);
end;
$$;
create function public.recover_student_credential(target_student_id uuid,code_hash text) returns jsonb
language sql security invoker set search_path='' as $$select private.recover_student_credential(target_student_id,code_hash);$$;
revoke all on function private.recover_student_credential(uuid,text),public.recover_student_credential(uuid,text) from public,anon;
grant execute on function private.recover_student_credential(uuid,text),public.recover_student_credential(uuid,text) to authenticated;

create or replace function public.student_activation_lookup(student_access_id text) returns jsonb
language sql security definer set search_path='' as $$
  select jsonb_build_object('student_id',s.id,'activation_hash',c.activation_hash)
  from private.student_credentials c join public.students s on s.id=c.student_id
  join public.operators o on o.id=s.operator_id
  join public.student_branch_history h on h.student_id=s.id and h.ended_at is null
  join public.branches b on b.id=h.branch_id
  where s.access_id=student_access_id and s.status='active' and o.status='active' and b.status='active'
  and h.started_at<=clock_timestamp() and (s.auth_user_id is null or s.auth_user_id=c.auth_user_id)
  and c.activated_at is null and c.activation_used_at is null and c.activation_expires_at>clock_timestamp()
  and (c.locked_until is null or c.locked_until<=clock_timestamp());
$$;
create or replace function public.claim_student_activation(target_student_id uuid,expected_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.student_credentials%rowtype; s public.students%rowtype;
begin
  select * into s from public.students where id=target_student_id for update;
  if public.student_activation_lookup(s.access_id) is null then return null; end if;
  update private.student_credentials set activation_used_at=clock_timestamp(),activation_claim=gen_random_uuid(),pin_ready=false
  where student_id=s.id and activation_hash=expected_hash and activation_used_at is null returning * into c;
  if c.student_id is null then return null; end if;
  return jsonb_build_object('student_id',c.student_id,'auth_user_id',c.auth_user_id,'auth_identifier',c.auth_identifier,'claim',c.activation_claim);
end;
$$;
create or replace function public.finish_student_activation(target_student_id uuid,claim uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare c private.student_credentials%rowtype; s public.students%rowtype;
begin
  select * into s from public.students where id=target_student_id for update;
  select * into c from private.student_credentials where student_id=s.id for update;
  if claim is null or c.activation_claim is distinct from claim or c.activated_at is not null or s.status<>'active'
    or (s.auth_user_id is not null and s.auth_user_id<>c.auth_user_id)
    or not exists(select 1 from public.operators o join public.student_branch_history h on h.operator_id=o.id and h.student_id=s.id and h.ended_at is null
      join public.branches b on b.id=h.branch_id where o.status='active' and b.status='active' and h.started_at<=clock_timestamp())
    or not exists(select 1 from auth.users u where u.id=c.auth_user_id and u.email=c.auth_identifier) then return false; end if;
  update public.students set auth_user_id=c.auth_user_id,updated_at=clock_timestamp() where id=s.id;
  return true;
end;
$$;
create function public.confirm_student_pin(target_student_id uuid,claim uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare c private.student_credentials%rowtype; s public.students%rowtype;
begin
  select * into s from public.students where id=target_student_id for update;
  select * into c from private.student_credentials where student_id=s.id for update;
  if not public.finish_student_activation(target_student_id,claim) then return false; end if;
  perform private.revoke_student_sessions(c.auth_user_id);
  update private.student_credentials set activated_at=clock_timestamp(),pin_ready=true,activation_claim=null,failed_attempts=0,locked_until=null where student_id=s.id;
  insert into public.audit_events(operator_id,actor_user_id,actor_type,action,target_type,target_id,after_summary,correlation_id)
  values(s.operator_id,c.auth_user_id,'student','student.activated','student',s.id,'{}'::jsonb,private.current_correlation_id());
  return true;
end;
$$;
revoke all on function public.confirm_student_pin(uuid,uuid) from public,anon,authenticated;
grant execute on function public.confirm_student_pin(uuid,uuid) to service_role;

create function private.revoke_inactive_student_sessions() returns trigger
language plpgsql security definer set search_path='' as $$
declare target_user_id uuid;
begin
  if new.status<>'active' and old.status='active' then
    if tg_table_name='students' then
      perform private.revoke_student_sessions(new.auth_user_id);
    else
      for target_user_id in select auth_user_id from public.students where operator_id=new.id and auth_user_id is not null loop
        perform private.revoke_student_sessions(target_user_id);
      end loop;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.revoke_inactive_student_sessions() from public,anon,authenticated;
create trigger students_revoke_sessions after update of status on public.students for each row execute function private.revoke_inactive_student_sessions();
create trigger operators_revoke_student_sessions after update of status on public.operators for each row execute function private.revoke_inactive_student_sessions();

-- Roster commands also enqueue a revocation after changing status. Drain Student
-- requests immediately so a later reactivation is not stuck behind a worker.
create function private.fulfil_student_revocation_request() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.students where auth_user_id=new.auth_user_id) then
    perform private.revoke_student_sessions(new.auth_user_id);
  end if;
  return new;
end;
$$;
revoke all on function private.fulfil_student_revocation_request() from public,anon,authenticated;
create trigger student_session_revocations_fulfilled after insert on private.session_revocation_requests
for each row execute function private.fulfil_student_revocation_request();
