create extension if not exists btree_gist with schema extensions;

create table public.students (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators(id) on delete restrict,
  access_id text not null unique default replace(gen_random_uuid()::text, '-', ''),
  auth_user_id uuid unique references auth.users(id) on delete restrict,
  external_reference text check (external_reference is null or char_length(btrim(external_reference)) between 1 and 120),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 120),
  preferred_locale text not null default 'tr' check (preferred_locale in ('tr','en','ar')),
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,operator_id),
  unique(operator_id,external_reference)
);
create table public.student_branch_history (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null,
  student_id uuid not null,
  branch_id uuid not null,
  started_at timestamptz not null default clock_timestamp(),
  ended_at timestamptz,
  foreign key(student_id,operator_id) references public.students(id,operator_id) on delete restrict,
  foreign key(branch_id,operator_id) references public.branches(id,operator_id) on delete restrict,
  check (ended_at is null or ended_at > started_at),
  exclude using gist (student_id with =, tstzrange(started_at,ended_at,'[)') with &&)
);
create index students_operator_status_idx on public.students(operator_id,status);
create index student_branch_history_current_idx on public.student_branch_history(operator_id,branch_id,student_id) where ended_at is null;
create index student_branch_history_student_idx on public.student_branch_history(student_id,started_at);
alter table public.students enable row level security;
alter table public.student_branch_history enable row level security;
revoke all on public.students,public.student_branch_history from anon,authenticated;
grant select on public.students,public.student_branch_history to authenticated;

-- These helpers consult live database membership, never stale JWT role metadata.
create function private.current_student_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select student.id from public.students student
  join public.operators operator on operator.id=student.operator_id
  join public.student_branch_history history on history.student_id=student.id and history.ended_at is null
  join public.branches branch on branch.id=history.branch_id
  where student.auth_user_id=(select auth.uid()) and student.status='active'
  and operator.status='active' and branch.status='active'
  and history.started_at<=statement_timestamp()
  and not private.has_pending_session_revocation((select auth.uid()));
$$;
create function private.is_active_student_in_branch(target_operator_id uuid,target_branch_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.student_branch_history history
    where history.student_id=private.current_student_id()
      and history.operator_id=target_operator_id and history.branch_id=target_branch_id
      and history.ended_at is null and history.started_at<=statement_timestamp());
$$;
create function private.can_manage_student_branch(target_operator_id uuid,target_branch_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_active_branch_access(target_operator_id,target_branch_id)
  and exists (select 1 from public.operator_memberships membership
    where membership.operator_id=target_operator_id and membership.auth_user_id=(select auth.uid())
    and membership.status='active' and membership.role in ('owner','manager'));
$$;
create function private.can_read_student(target_student_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select target_student_id=private.current_student_id() or exists (
    select 1 from public.student_branch_history history
    where history.student_id=target_student_id and history.ended_at is null
    and private.has_active_branch_access(history.operator_id,history.branch_id));
$$;
revoke all on function private.current_student_id(),private.is_active_student_in_branch(uuid,uuid),private.can_manage_student_branch(uuid,uuid),private.can_read_student(uuid) from public,anon;
grant execute on function private.current_student_id(),private.is_active_student_in_branch(uuid,uuid),private.can_manage_student_branch(uuid,uuid),private.can_read_student(uuid) to authenticated;
create policy "Students and staff read permitted identities" on public.students for select to authenticated
using ((select private.can_read_student(id)));
create policy "Staff read their Branch history and Students read own history" on public.student_branch_history for select to authenticated
using ((select private.has_active_branch_access(operator_id,branch_id)) or student_id=(select private.current_student_id()));

-- Clients have no table-write grants. The narrow transactional API owns the
-- identity and assignment invariant and explicitly checks both transfer ends.
create function private.manage_student_roster(
  operation text,target_operator_id uuid,target_student_id uuid,target_branch_id uuid,
  student_name text,student_locale text,student_reference text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  student public.students%rowtype;
  assignment public.student_branch_history%rowtype;
  mutation_time timestamptz;
  event_action text;
  before_value jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Roster access denied' using errcode='42501'; end if;
  if operation not in ('create','edit','archive','reactivate','transfer') or operation is null then
    raise exception 'Unsupported roster operation' using errcode='22023';
  end if;
  if operation='create' then
    if not private.can_manage_student_branch(target_operator_id,target_branch_id) then
      raise exception 'Roster access denied' using errcode='42501';
    end if;
    insert into public.students(operator_id,display_name,preferred_locale,external_reference)
    values(target_operator_id,btrim(student_name),student_locale,nullif(btrim(student_reference),'')) returning * into student;
    insert into public.student_branch_history(operator_id,student_id,branch_id)
    values(target_operator_id,student.id,target_branch_id);
    event_action:='student.created';
  else
    select * into student from public.students where id=target_student_id and operator_id=target_operator_id for update;
    select * into assignment from public.student_branch_history where student_id=student.id and ended_at is null for update;
    if student.id is null or assignment.id is null or not private.can_manage_student_branch(target_operator_id,assignment.branch_id) then
      raise exception 'Roster access denied' using errcode='42501';
    end if;
    before_value:=jsonb_build_object('status',student.status,'branch_id',assignment.branch_id);
    if operation='transfer' then
      if not private.can_manage_student_branch(target_operator_id,target_branch_id) then
        raise exception 'Roster access denied' using errcode='42501';
      end if;
      if student.status<>'active' or target_branch_id=assignment.branch_id then
        raise exception 'An active Student and a different Branch are required' using errcode='22023';
      end if;
      mutation_time:=greatest(clock_timestamp(),assignment.started_at+interval '1 microsecond');
      update public.student_branch_history set ended_at=mutation_time where id=assignment.id;
      insert into public.student_branch_history(operator_id,student_id,branch_id,started_at)
      values(target_operator_id,student.id,target_branch_id,mutation_time);
      event_action:='student.transferred';
    elsif operation='edit' then
      update public.students set display_name=btrim(student_name),preferred_locale=student_locale,
        external_reference=nullif(btrim(student_reference),''),updated_at=clock_timestamp()
      where id=student.id returning * into student;
      event_action:='student.edited';
    else
      update public.students set status=case when operation='archive' then 'inactive' else 'active' end,
        updated_at=clock_timestamp() where id=student.id returning * into student;
      if operation='archive' and student.auth_user_id is not null then
        insert into private.session_revocation_requests(auth_user_id,reason)
        values(student.auth_user_id,'Student archived') on conflict (auth_user_id)
        where status in ('pending','processing') do nothing;
      end if;
      event_action:=case when operation='archive' then 'student.archived' else 'student.reactivated' end;
    end if;
  end if;
  insert into public.audit_events(operator_id,branch_id,actor_user_id,actor_type,action,target_type,target_id,before_summary,after_summary,correlation_id)
  values(target_operator_id,case when operation in ('create','transfer') then target_branch_id else assignment.branch_id end,
    auth.uid(),'operator_staff',event_action,'student',student.id,before_value,
    jsonb_build_object('status',student.status,'branch_id',case when operation in ('create','transfer') then target_branch_id else assignment.branch_id end),
    private.current_correlation_id());
  return student.id;
end;
$$;
revoke all on function private.manage_student_roster(text,uuid,uuid,uuid,text,text,text) from public,anon;
grant execute on function private.manage_student_roster(text,uuid,uuid,uuid,text,text,text) to authenticated;
create function public.manage_student_roster(
  operation text,target_operator_id uuid,target_student_id uuid default null,target_branch_id uuid default null,
  student_name text default null,student_locale text default 'tr',student_reference text default null
) returns uuid language sql security invoker set search_path = '' as $$
  select private.manage_student_roster(operation,target_operator_id,target_student_id,target_branch_id,student_name,student_locale,student_reference);
$$;
revoke all on function public.manage_student_roster(text,uuid,uuid,uuid,text,text,text) from public,anon;
grant execute on function public.manage_student_roster(text,uuid,uuid,uuid,text,text,text) to authenticated;
