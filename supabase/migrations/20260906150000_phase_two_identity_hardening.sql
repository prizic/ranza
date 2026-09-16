-- Phase 2 hardening: keep credential generation behind the server gateway,
-- make activation claims recoverable after a worker interruption, correlate
-- operational events, and audit every terminal roster-import outcome.

alter table private.student_credentials
add column activation_claimed_at timestamptz;

-- Claims created by older code have no lease timestamp and cannot be proven
-- live. Release them so the same one-time code can be attempted again.
update private.student_credentials
set activation_claim = null,
    activation_used_at = null
where activation_claim is not null;

alter table private.student_credentials
add constraint student_credentials_claim_lease_check
check (
  (activation_claim is null and activation_claimed_at is null)
  or (activation_claim is not null and activation_claimed_at is not null)
);

create function private.issue_student_activation_service(
  actor_id uuid,
  target_student_id uuid,
  code_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_student public.students%rowtype;
  assignment public.student_branch_history%rowtype;
  target_credential private.student_credentials%rowtype;
begin
  select * into target_student
  from public.students
  where id = target_student_id
  for update;

  select * into assignment
  from public.student_branch_history
  where student_id = target_student.id and ended_at is null;

  if target_student.id is null
    or target_student.status <> 'active'
    or target_student.auth_user_id is not null
    or not private.actor_can_manage_roster(
      actor_id,
      target_student.operator_id,
      assignment.branch_id
    )
    or code_hash !~ '^scrypt-v1\$[a-f0-9]{32}\$[a-f0-9]{64}$'
  then
    raise exception 'Credential issue denied' using errcode = '42501';
  end if;

  select * into target_credential
  from private.student_credentials
  where student_id = target_student.id
  for update;

  if target_credential.activation_claim is not null
    and target_credential.activation_claimed_at > clock_timestamp() - interval '5 minutes'
  then
    raise exception 'Credential issue denied' using errcode = '42501';
  end if;

  insert into private.student_credentials (
    student_id,
    auth_user_id,
    auth_identifier,
    activation_hash,
    activation_expires_at,
    activation_used_at,
    activation_claim,
    activation_claimed_at,
    activated_at,
    pin_ready,
    failed_attempts,
    locked_until,
    issued_at
  ) values (
    target_student.id,
    gen_random_uuid(),
    target_student.id || '@students.ranza.invalid',
    code_hash,
    clock_timestamp() + interval '24 hours',
    null,
    null,
    null,
    null,
    false,
    0,
    null,
    clock_timestamp()
  )
  on conflict (student_id) do update
  set activation_hash = excluded.activation_hash,
      activation_expires_at = excluded.activation_expires_at,
      activation_used_at = null,
      activation_claim = null,
      activation_claimed_at = null,
      failed_attempts = 0,
      locked_until = null,
      issued_at = excluded.issued_at
  returning * into target_credential;

  insert into public.audit_events (
    operator_id,
    branch_id,
    actor_user_id,
    actor_type,
    action,
    target_type,
    target_id,
    after_summary,
    correlation_id
  ) values (
    target_student.operator_id,
    assignment.branch_id,
    actor_id,
    'operator_staff',
    'student.credential_issued',
    'student',
    target_student.id,
    jsonb_build_object('expires_in_hours', 24),
    private.current_correlation_id()
  );

  return jsonb_build_object('access_id', target_student.access_id);
end;
$$;

create function private.recover_student_credential_service(
  actor_id uuid,
  target_student_id uuid,
  code_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_student public.students%rowtype;
  assignment public.student_branch_history%rowtype;
  target_credential private.student_credentials%rowtype;
begin
  select * into target_student
  from public.students
  where id = target_student_id
  for update;

  select * into assignment
  from public.student_branch_history
  where student_id = target_student.id and ended_at is null;

  if target_student.id is null
    or target_student.status <> 'active'
    or target_student.auth_user_id is null
    or not private.actor_can_manage_roster(
      actor_id,
      target_student.operator_id,
      assignment.branch_id
    )
    or code_hash !~ '^scrypt-v1\$[a-f0-9]{32}\$[a-f0-9]{64}$'
  then
    raise exception 'Credential recovery denied' using errcode = '42501';
  end if;

  select * into target_credential
  from private.student_credentials
  where student_id = target_student.id
    and auth_user_id = target_student.auth_user_id
  for update;

  if target_credential.student_id is null
    or (
      target_credential.activation_claim is not null
      and target_credential.activation_claimed_at > clock_timestamp() - interval '5 minutes'
    )
  then
    raise exception 'Credential recovery denied' using errcode = '42501';
  end if;

  update private.student_credentials
  set activation_hash = code_hash,
      activation_expires_at = clock_timestamp() + interval '24 hours',
      activation_used_at = null,
      activation_claim = null,
      activation_claimed_at = null,
      activated_at = null,
      pin_ready = false,
      failed_attempts = 0,
      locked_until = null,
      issued_at = clock_timestamp()
  where student_id = target_student.id;

  perform private.revoke_student_sessions(target_student.auth_user_id);

  insert into public.audit_events (
    operator_id,
    branch_id,
    actor_user_id,
    actor_type,
    action,
    target_type,
    target_id,
    after_summary,
    correlation_id
  ) values (
    target_student.operator_id,
    assignment.branch_id,
    actor_id,
    'operator_staff',
    'student.credential_reset',
    'student',
    target_student.id,
    jsonb_build_object('expires_in_hours', 24, 'sessions_revoked', true),
    private.current_correlation_id()
  );

  return jsonb_build_object('access_id', target_student.access_id);
end;
$$;

create function public.issue_student_activation_service(
  actor_id uuid,
  target_student_id uuid,
  code_hash text
) returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.issue_student_activation_service(
    actor_id,
    target_student_id,
    code_hash
  );
$$;

create function public.recover_student_credential_service(
  actor_id uuid,
  target_student_id uuid,
  code_hash text
) returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.recover_student_credential_service(
    actor_id,
    target_student_id,
    code_hash
  );
$$;

revoke all on function public.issue_student_activation(uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.recover_student_credential(uuid, text)
from public, anon, authenticated, service_role;
revoke all on function private.issue_student_activation_service(uuid, uuid, text)
from public, anon, authenticated, service_role;
revoke all on function private.recover_student_credential_service(uuid, uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.issue_student_activation_service(uuid, uuid, text)
from public, anon, authenticated;
revoke all on function public.recover_student_credential_service(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.issue_student_activation_service(uuid, uuid, text)
to service_role;
grant execute on function public.recover_student_credential_service(uuid, uuid, text)
to service_role;

create or replace function public.student_activation_lookup(student_access_id text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'student_id', target_student.id,
    'activation_hash', credential.activation_hash
  )
  from private.student_credentials credential
  join public.students target_student on target_student.id = credential.student_id
  join public.operators operator on operator.id = target_student.operator_id
  join public.student_branch_history assignment
    on assignment.student_id = target_student.id and assignment.ended_at is null
  join public.branches branch on branch.id = assignment.branch_id
  where target_student.access_id = student_access_id
    and target_student.status = 'active'
    and operator.status = 'active'
    and branch.status = 'active'
    and assignment.started_at <= clock_timestamp()
    and (
      target_student.auth_user_id is null
      or target_student.auth_user_id = credential.auth_user_id
    )
    and credential.activated_at is null
    and (
      credential.activation_used_at is null
      or credential.activation_claimed_at <= clock_timestamp() - interval '5 minutes'
    )
    and credential.activation_expires_at > clock_timestamp()
    and (
      credential.locked_until is null
      or credential.locked_until <= clock_timestamp()
    );
$$;

create or replace function public.claim_student_activation(
  target_student_id uuid,
  expected_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_credential private.student_credentials%rowtype;
  target_student public.students%rowtype;
begin
  select * into target_student
  from public.students
  where id = target_student_id
  for update;

  if public.student_activation_lookup(target_student.access_id) is null then
    return null;
  end if;

  update private.student_credentials
  set activation_used_at = clock_timestamp(),
      activation_claim = gen_random_uuid(),
      activation_claimed_at = clock_timestamp(),
      pin_ready = false
  where student_id = target_student.id
    and activation_hash = expected_hash
    and (
      activation_used_at is null
      or activation_claimed_at <= clock_timestamp() - interval '5 minutes'
    )
  returning * into target_credential;

  if target_credential.student_id is null then return null; end if;

  return jsonb_build_object(
    'student_id', target_credential.student_id,
    'auth_user_id', target_credential.auth_user_id,
    'auth_identifier', target_credential.auth_identifier,
    'claim', target_credential.activation_claim
  );
end;
$$;

create or replace function public.finish_student_activation(
  target_student_id uuid,
  claim uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_credential private.student_credentials%rowtype;
  target_student public.students%rowtype;
begin
  select * into target_student
  from public.students
  where id = target_student_id
  for update;
  select * into target_credential
  from private.student_credentials
  where student_id = target_student.id
  for update;

  if claim is null
    or target_credential.activation_claim is distinct from claim
    or target_credential.activation_claimed_at <= clock_timestamp() - interval '5 minutes'
    or target_credential.activated_at is not null
    or target_student.status <> 'active'
    or (
      target_student.auth_user_id is not null
      and target_student.auth_user_id <> target_credential.auth_user_id
    )
    or not exists (
      select 1
      from public.operators operator
      join public.student_branch_history assignment
        on assignment.operator_id = operator.id
        and assignment.student_id = target_student.id
        and assignment.ended_at is null
      join public.branches branch on branch.id = assignment.branch_id
      where operator.status = 'active'
        and branch.status = 'active'
        and assignment.started_at <= clock_timestamp()
    )
    or not exists (
      select 1
      from auth.users auth_user
      where auth_user.id = target_credential.auth_user_id
        and auth_user.email = target_credential.auth_identifier
    )
  then
    return false;
  end if;

  update public.students
  set auth_user_id = target_credential.auth_user_id,
      updated_at = clock_timestamp()
  where id = target_student.id;
  return true;
end;
$$;

create or replace function public.confirm_student_pin(
  target_student_id uuid,
  claim uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_credential private.student_credentials%rowtype;
  target_student public.students%rowtype;
begin
  select * into target_student
  from public.students
  where id = target_student_id
  for update;
  select * into target_credential
  from private.student_credentials
  where student_id = target_student.id
  for update;

  if not public.finish_student_activation(target_student_id, claim) then
    return false;
  end if;

  perform private.revoke_student_sessions(target_credential.auth_user_id);
  update private.student_credentials
  set activated_at = clock_timestamp(),
      pin_ready = true,
      activation_claim = null,
      activation_claimed_at = null,
      failed_attempts = 0,
      locked_until = null
  where student_id = target_student.id;

  insert into public.audit_events (
    operator_id,
    actor_user_id,
    actor_type,
    action,
    target_type,
    target_id,
    after_summary,
    correlation_id
  ) values (
    target_student.operator_id,
    target_credential.auth_user_id,
    'student',
    'student.activated',
    'student',
    target_student.id,
    '{}'::jsonb,
    private.current_correlation_id()
  );
  return true;
end;
$$;

create or replace function public.abandon_student_activation(
  target_student_id uuid,
  claim uuid
) returns void
language sql
security definer
set search_path = ''
as $$
  update private.student_credentials
  set activation_claim = null,
      activation_claimed_at = null,
      activation_used_at = null
  where student_id = target_student_id
    and activation_claim = claim
    and activated_at is null;
$$;

create function private.student_home_context()
returns table (
  student_id uuid,
  display_name text,
  access_id text,
  preferred_locale text,
  operator_id uuid,
  branch_id uuid,
  branch_name text,
  branch_timezone text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_student.id,
    target_student.display_name,
    target_student.access_id,
    target_student.preferred_locale,
    target_student.operator_id,
    assignment.branch_id,
    branch.name,
    branch.timezone
  from public.students target_student
  join public.student_branch_history assignment
    on assignment.student_id = target_student.id and assignment.ended_at is null
  join public.branches branch on branch.id = assignment.branch_id
  where target_student.id = private.current_student_id()
    and assignment.started_at <= statement_timestamp();
$$;

create function public.student_home_context()
returns table (
  student_id uuid,
  display_name text,
  access_id text,
  preferred_locale text,
  operator_id uuid,
  branch_id uuid,
  branch_name text,
  branch_timezone text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.student_home_context();
$$;

revoke all on function private.student_home_context()
from public, anon, authenticated, service_role;
revoke all on function public.student_home_context()
from public, anon;
grant execute on function public.student_home_context()
to authenticated;

create or replace function private.confirm_student_roster_import(
  actor_id uuid,
  target_operator_id uuid,
  target_import_key text,
  selected_rows integer[]
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch private.roster_imports%rowtype;
  row record;
  student_id uuid;
  import_total integer := 0;
begin
  select * into batch
  from private.roster_imports
  where operator_id = target_operator_id and import_key = target_import_key
  for update;

  if batch.id is null
    or not private.actor_can_manage_roster(
      actor_id,
      batch.operator_id,
      batch.branch_id
    )
  then
    raise exception 'Roster import access denied' using errcode = '42501';
  end if;
  if batch.status = 'committed' then
    return private.roster_import_preview(batch.id);
  end if;
  if batch.status <> 'staged' then
    raise exception 'Roster import is not staged' using errcode = '22023';
  end if;

  selected_rows := coalesce(selected_rows, array[]::integer[]);
  if cardinality(selected_rows) = 0 then
    raise exception 'Select at least one valid row' using errcode = '22023';
  end if;
  if (
    select count(*)
    from private.roster_import_rows
    where import_id = batch.id and row_number = any(selected_rows)
  ) <> cardinality(selected_rows)
    or exists (
      select 1
      from private.roster_import_rows
      where import_id = batch.id
        and row_number = any(selected_rows)
        and cardinality(errors) > 0
    )
  then
    raise exception 'Selected rows include validation errors'
      using errcode = '22023';
  end if;

  update private.roster_imports set status = 'importing' where id = batch.id;
  begin
    for row in
      select *
      from private.roster_import_rows
      where import_id = batch.id and row_number = any(selected_rows)
      order by row_number
    loop
      insert into public.students (
        operator_id,
        external_reference,
        display_name,
        preferred_locale
      ) values (
        batch.operator_id,
        row.external_reference,
        row.display_name,
        row.preferred_locale
      ) returning id into student_id;
      insert into public.student_branch_history (
        operator_id,
        student_id,
        branch_id
      ) values (batch.operator_id, student_id, batch.branch_id);
      import_total := import_total + 1;
    end loop;
  exception when others then
    update private.roster_imports
    set status = 'failed',
        completed_at = clock_timestamp(),
        error_reference = private.current_correlation_id()
    where id = batch.id;
    insert into public.audit_events (
      operator_id,
      branch_id,
      actor_user_id,
      actor_type,
      action,
      target_type,
      target_id,
      after_summary,
      correlation_id
    ) values (
      batch.operator_id,
      batch.branch_id,
      actor_id,
      'operator_staff',
      'student.roster_import_failed',
      'roster_import',
      batch.id,
      jsonb_build_object('import_id', batch.id, 'row_count', batch.row_count),
      private.current_correlation_id()
    );
    return private.roster_import_preview(batch.id);
  end;

  update private.roster_imports
  set status = 'committed',
      imported_count = import_total,
      completed_at = clock_timestamp()
  where id = batch.id;
  insert into public.audit_events (
    operator_id,
    branch_id,
    actor_user_id,
    actor_type,
    action,
    target_type,
    target_id,
    after_summary,
    correlation_id
  ) values (
    batch.operator_id,
    batch.branch_id,
    actor_id,
    'operator_staff',
    'student.roster_imported',
    'roster_import',
    batch.id,
    jsonb_build_object(
      'import_id', batch.id,
      'imported_count', import_total,
      'row_count', batch.row_count
    ),
    private.current_correlation_id()
  );
  return private.roster_import_preview(batch.id);
end;
$$;

create or replace function private.cancel_student_roster_import(
  actor_id uuid,
  target_operator_id uuid,
  target_import_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch private.roster_imports%rowtype;
begin
  select * into batch
  from private.roster_imports
  where operator_id = target_operator_id and import_key = target_import_key
  for update;

  if batch.id is null
    or not private.actor_can_manage_roster(
      actor_id,
      batch.operator_id,
      batch.branch_id
    )
  then
    raise exception 'Roster import access denied' using errcode = '42501';
  end if;

  if batch.status = 'staged' then
    update private.roster_imports
    set status = 'cancelled', completed_at = clock_timestamp()
    where id = batch.id;
    insert into public.audit_events (
      operator_id,
      branch_id,
      actor_user_id,
      actor_type,
      action,
      target_type,
      target_id,
      after_summary,
      correlation_id
    ) values (
      batch.operator_id,
      batch.branch_id,
      actor_id,
      'operator_staff',
      'student.roster_import_cancelled',
      'roster_import',
      batch.id,
      jsonb_build_object('import_id', batch.id, 'row_count', batch.row_count),
      private.current_correlation_id()
    );
  end if;
  return private.roster_import_preview(batch.id);
end;
$$;
