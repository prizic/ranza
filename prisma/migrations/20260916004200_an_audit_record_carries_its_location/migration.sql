-- An audit record carries where it happened, and reading the log is a
-- permission (ADR 0031).
--
-- Three things were wrong with the log as 20260916000300 left it, and each is a
-- clause of blueprint 7.4 or 3.6 rather than a preference:
--
--   1. A record carried no Property. 7.4 lists Property among what a sensitive
--      action records, and without it the read policy could only be
--      membership-wide: a Staff Member assigned to one hotel read every hotel's
--      check-ins, reversals and reasons.
--   2. Anybody with a membership could read everything the policy returned. The
--      permission gate (3.5 gate 4) was in front of every write and of no read.
--   3. Opening the log was a per-Property capability. Audit is a baseline right
--      no package selection removes (3.6), and a hosted Organization had no such
--      row, so the screen did not exist there at all.
--
-- The column is `location_id`, not `property_id`. The table belongs to
-- packages/platform/audit, which may not name a Property (blueprint 9.8); a
-- location is the host's to define. For Ranza it is a Property, and the
-- functions below are where that translation happens — the SQL counterpart of a
-- host adapter.
--
-- Records written before this migration keep a null location. Filling it in
-- would mean switching off the append-only trigger and rewriting history,
-- which is the one thing this table promises never happens. A null location
-- reads as "the whole Organization", so those records stay visible to
-- Organization-wide Staff Members and to whoever wrote them, and to nobody else.

alter table audit.records add column location_id uuid;

comment on column audit.records.location_id is
  'Where the action happened, as the host names it — a Property, for Ranza. '
  'Null for an action about the whole scope (a role, a membership) and for '
  'every record written before 20260916004200. Opaque to the audit module.';

-- The log reads newest first with `id` breaking ties, and pages by keyset on
-- that pair; the old index stopped at occurred_at, so every page past the first
-- sorted the tail. The location index serves the one-Property filter.
create index records_scope_order_idx
  on audit.records (organization_id, occurred_at desc, id desc);
create index records_scope_location_idx
  on audit.records (organization_id, location_id, occurred_at desc, id desc);
create index records_scope_action_idx
  on audit.records (organization_id, action, occurred_at desc, id desc);
drop index audit.records_scope_idx;

-- A policy bounds rows; a grant bounds columns (ADR 0012). The table-wide
-- insert grant let a caller supply `occurred_at` — or `id` — and so write a
-- record dated last month. The time a record carries is the time it was
-- written, and only the default may say what that is.
revoke insert on audit.records from ranza_app;
grant insert (organization_id, location_id, actor_id, action,
              subject_type, subject_id, reason, context)
  on audit.records to ranza_app;

-- ---------------------------------------------------------------------------
-- The host's side: which locations somebody reaches
-- ---------------------------------------------------------------------------

-- Every (Organization, Property) the acting user reaches, as a pair so the
-- policy can match both halves in one hashed lookup rather than calling a
-- function per row.
--
-- Deliberately not app.accessible_property_ids(): that one filters on
-- property.status = 'active', which is right for operating a hotel and wrong
-- for its history. An archived Property's records must stay readable to the
-- people who could reach it. Security definer because the memberships and
-- assignments it reads are policy-bound; it asks only about the caller, so it
-- has nobody else's question to answer and no side effect.
create function app.audit_reachable_locations()
returns table (organization_id uuid, location_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select property.organization_id, property.id
  from public.properties as property
  join public.organization_memberships as membership
    on membership.organization_id = property.organization_id
  where membership.user_id = app.current_user_id()
    and membership.status = 'active'
    and (
      membership.access_scope = 'organization_wide'
      or exists (
        select 1
        from public.property_assignments as assignment
        where assignment.property_id = property.id
          and assignment.user_id = membership.user_id
          and assignment.status = 'active'
      )
    );
$$;

comment on function app.audit_reachable_locations() is
  'The Properties the acting user reaches, including archived ones, as '
  '(organization_id, location_id) pairs for the audit.records read policy. '
  'Asks only about the caller.';

revoke execute on function app.audit_reachable_locations() from public;
grant execute on function app.audit_reachable_locations() to ranza_app;

-- The Organizations in which the acting user reaches everything. A record with
-- no location is about the whole Organization — a role defined, somebody
-- revoked — and belongs to the people whose reach is the whole Organization.
create function app.audit_whole_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select membership.organization_id
  from public.organization_memberships as membership
  where membership.user_id = app.current_user_id()
    and membership.status = 'active'
    and membership.access_scope = 'organization_wide';
$$;

comment on function app.audit_whole_organization_ids() is
  'Organizations in which the acting user''s reach is organization_wide. '
  'Asks only about the caller.';

revoke execute on function app.audit_whole_organization_ids() from public;
grant execute on function app.audit_whole_organization_ids() to ranza_app;

-- Whether a location belongs to the scope a record is written in. Integrity,
-- not reach: the module that acted has already been bounded by its own write
-- policy, and asking reach again here could refuse a write that policy
-- allowed. What must never happen is a record in Organization A naming a
-- Property of Organization B, and that is this question.
--
-- It checks its caller first (the rule of 20260916002700): an Organization the
-- caller does not belong to gets false, so it cannot be used to learn which
-- Property ids exist elsewhere.
create function app.audit_location_is_in_scope(
  target_organization_id uuid,
  target_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_organization_id in (select app.accessible_organization_ids())
     and exists (
       select 1
       from public.properties as property
       where property.id = target_location_id
         and property.organization_id = target_organization_id
     );
$$;

revoke execute on function app.audit_location_is_in_scope(uuid, uuid) from public;
grant execute on function app.audit_location_is_in_scope(uuid, uuid) to ranza_app;

-- The name and wall clock of each location the caller may read history for.
-- properties_read_accessible hides an archived Property, which is right for
-- operating one and would leave its records nameless and in the wrong
-- timezone here; widening that policy would widen every Property read in the
-- product, so the widening is contained to this one question. Bounded by
-- app.audit_reachable_locations(), so it names nothing the caller could not
-- already read a record about.
create function app.audit_location_names(candidates uuid[])
returns table (location_id uuid, name text, timezone text)
language sql
stable
security definer
set search_path = ''
as $$
  select property.id, property.name, property.timezone
  from public.properties as property
  where property.id = any (candidates)
    and property.id in (
      select reachable.location_id from app.audit_reachable_locations() as reachable
    );
$$;

revoke execute on function app.audit_location_names(uuid[]) from public;
grant execute on function app.audit_location_names(uuid[]) to ranza_app;

-- ---------------------------------------------------------------------------
-- Reading the log is a permission
-- ---------------------------------------------------------------------------

-- Platform Core's, because audit is (blueprint 5.1). Given to the two shipped
-- roles that run a Property, and appended rather than assigned: another branch
-- appends its own permissions to the same arrays, and an assignment would
-- silently take theirs away depending on which migration ran last.
--
-- Not given to Front desk, Housekeeping or Finance. An Organization that wants
-- a night auditor who reads the log composes a role with it (ADR 0026).
insert into public.staff_permissions (key, module_key)
values ('audit.read', 'platform_core')
on conflict (key) do nothing;

update public.staff_roles
   set permissions = array_append(permissions, 'audit.read'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager')
   and not ('audit.read' = any (permissions));

-- staff_roles is FORCE row level security and this migration brings no policy
-- for the update above. It works because the role that runs migrations is a
-- superuser locally and carries BYPASSRLS on Supabase; if either stopped being
-- true the update would match nothing and say nothing. So it is asserted.
do $$
begin
  if (select count(*) from public.staff_roles
       where organization_id is null
         and key in ('owner', 'manager')
         and 'audit.read' = any (permissions)) <> 2 then
    raise exception 'audit.read did not reach the shipped owner and manager roles';
  end if;
end
$$;

-- The Organizations in which the acting user may read the log. The permission
-- is part of the read policy rather than only an `if` in the host, because a
-- policy is the boundary here and a check beside it is not (ADR 0012): every
-- future reader of this table — a Folio's history, an export — inherits it
-- without having to remember it.
create function app.audit_reader_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select membership.organization_id
  from public.organization_memberships as membership
  join public.staff_roles as role
    on role.scope_id = membership.role_scope_id
   and role.key = membership.role
  where membership.user_id = app.current_user_id()
    and membership.status = 'active'
    and role.status = 'active'
    and 'audit.read' = any (role.permissions);
$$;

comment on function app.audit_reader_organization_ids() is
  'Organizations in which the acting user holds audit.read. Asks only about '
  'the caller.';

revoke execute on function app.audit_reader_organization_ids() from public;
grant execute on function app.audit_reader_organization_ids() to ranza_app;

-- ---------------------------------------------------------------------------
-- The policies
-- ---------------------------------------------------------------------------

drop policy records_read_own_scope on audit.records;

-- Three ways to reach a record, any one enough:
--
--   * You wrote it, in an Organization you still belong to. This is also what
--     keeps `insert … returning` working for a writer whose reach is one
--     Property and whose record has none — a returned row must pass the read
--     policy, and a writer must always be able to read back what it wrote.
--   * You hold audit.read there, it is about the whole Organization, and your
--     reach is the whole Organization.
--   * You hold audit.read there and it happened at a Property you reach.
--
-- Your own records need no permission: seeing what you yourself did is not
-- reading the Organization's log.
create policy records_read_by_reach
  on audit.records for select
  using (
    (
      actor_id = app.current_user_id()
      and organization_id in (select app.accessible_organization_ids())
    )
    or (
      organization_id in (select app.audit_reader_organization_ids())
      and (
        (
          location_id is null
          and organization_id in (select app.audit_whole_organization_ids())
        )
        or (organization_id, location_id) in (
          select reachable.organization_id, reachable.location_id
          from app.audit_reachable_locations() as reachable
        )
      )
    )
  );

drop policy records_append_own_scope on audit.records;

create policy records_append_own_scope
  on audit.records for insert
  with check (
    organization_id in (select app.accessible_organization_ids())
    and actor_id = app.current_user_id()
    and (
      location_id is null
      or app.audit_location_is_in_scope(organization_id, location_id)
    )
  );

