-- Staff and permissions, slice 3: an Organization defines its own roles.
--
-- Slice 1 made a role a set and slice 2 enumerated what may be in it. This is
-- the slice where somebody other than Ranza composes one — which is the slice
-- where getting it wrong is privilege escalation rather than a bad screen.

-- ---------------------------------------------------------------------------
-- What the author already holds
-- ---------------------------------------------------------------------------

-- The acting Staff Member's own permissions in one Organization, as a set.
--
-- `app.has_organization_permission()` answers one question at a time, which is
-- what a gate wants. Defining a role asks a different question — is this whole
-- set within mine — and asking it one permission at a time inside a policy
-- would mean a subquery per element.
create function app.organization_permissions(target_organization_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select role.permissions
       from public.organization_memberships as membership
       join public.staff_roles as role
         on role.scope_id = membership.role_scope_id
        and role.key = membership.role
      where membership.organization_id = target_organization_id
        and membership.user_id = app.current_user_id()
        and membership.status = 'active'
        and role.status = 'active'),
    '{}'::text[]);
$$;

comment on function app.organization_permissions(uuid) is
  'What the acting Staff Member may do in this Organization. The ceiling on '
  'what they may put in a role they define (SP-S3-01).';

grant execute on function app.organization_permissions(uuid) to ranza_app;

-- ---------------------------------------------------------------------------
-- Writing a role
-- ---------------------------------------------------------------------------

-- SP-S3-01 is the whole reason this is a policy rather than a form validation.
-- An author may only include permissions their own role holds; otherwise
-- defining a role is privilege escalation with extra steps, and the escalation
-- is permanent because the role outlives the person who wrote it.
--
-- The Owner role Ranza ships holds the whole catalogue, so nothing is
-- unreachable — an Organization can always express any role it wants, it just
-- cannot mint authority it was never given.
--
-- SP-S3-05 and SP-S3-06 need no clause of their own. A role Ranza ships has no
-- `organization_id`, and every condition below requires one that the acting
-- Staff Member reaches, so a shipped role is not a row these policies admit.
create policy staff_roles_defined_by_an_author
  on public.staff_roles for insert
  with check (
    organization_id in (select app.accessible_organization_ids())
    and scope_id = organization_id
    and app.has_organization_permission(organization_id, 'staff.define_roles')
    and app.can_use_capability_in_organization(
          organization_id, 'platform_core', 'staff_administration')
    and permissions <@ app.organization_permissions(organization_id)
  );

-- Retiring is not gated commercially, on the same reasoning as revoking: taking
-- away what somebody may do is never blocked by money (SP-S1-21). Editing and
-- reinstating are, because both hand reach out.
create policy staff_roles_changed_by_an_author
  on public.staff_roles for update
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'staff.define_roles')
  )
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'staff.define_roles')
    and permissions <@ app.organization_permissions(organization_id)
    and (status = 'retired'
         or app.can_use_capability_in_organization(
              organization_id, 'platform_core', 'staff_administration'))
  );

-- A policy bounds rows; a grant bounds columns (ADR 0012). The update policy
-- would admit a row that kept its Organization and changed its key — which
-- would silently repoint every membership holding it, because a membership
-- names a role by key. These grants are what makes that unreachable.
grant insert (scope_id, key, organization_id, name, permissions, status)
  on public.staff_roles to ranza_app;
grant update (name, permissions, status, updated_at)
  on public.staff_roles to ranza_app;

-- ---------------------------------------------------------------------------
-- A role somebody holds cannot be retired
-- ---------------------------------------------------------------------------

-- SP-S3-02. Moving three people to some other role automatically would decide
-- their permissions for them, silently, at the moment somebody was tidying up.
-- Refusing makes the actor reassign them first, where it is visible — the same
-- shape as the ON DELETE RESTRICT this schema uses everywhere else.
create function app.role_is_not_held()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  holders integer;
begin
  select count(*) into holders
  from public.organization_memberships as membership
  where membership.role_scope_id = old.scope_id
    and membership.role = old.key
    and membership.status = 'active';

  if holders > 0 then
    raise exception
      'this role is held by % Staff Member(s) and cannot be retired', holders
      using errcode = '55000';
  end if;

  return null;
end;
$$;

create constraint trigger staff_roles_retired_only_when_unheld
  after update on public.staff_roles
  deferrable initially immediate
  for each row
  when (old.status = 'active' and new.status = 'retired')
  execute function app.role_is_not_held();

-- And a retired role cannot be picked up again by the back door: a membership
-- may only name a role that is currently active. A membership written before a
-- role was retired keeps it, because SP-S3-02 is what stops that pair existing.
create function app.membership_role_is_active()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only a role that exists and is retired. A role that is not there at all is
  -- the foreign key's refusal to make, and saying "that role is retired" about
  -- a role nobody ever wrote would be both wrong and less informative.
  if exists (
    select 1 from public.staff_roles as role
    where role.scope_id = new.role_scope_id
      and role.key = new.role
      and role.status <> 'active'
  ) then
    raise exception 'that role is retired'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger organization_memberships_role_is_active
  before insert or update of role, role_scope_id
  on public.organization_memberships
  for each row
  execute function app.membership_role_is_active();

-- ---------------------------------------------------------------------------
-- A role is a subject an audit record can name
-- ---------------------------------------------------------------------------

-- `audit.records` takes an opaque uuid subject and nothing else — that opacity
-- is what makes the audit module reusable by a host it knows nothing about
-- (blueprint 9.8). A role is keyed by `(scope_id, key)`, which is the right key
-- for a membership to carry and is not a uuid.
--
-- So the role gets one. Not a primary key and not what anything references: the
-- composite stays, because it is what makes another Organization's role
-- unrepresentable. This is an identity for the one caller that needs a uuid,
-- and naming the Organization instead would have been an audit trail that
-- records the wrong subject.
alter table public.staff_roles
  add column id uuid not null default gen_random_uuid();

create unique index staff_roles_id_key on public.staff_roles (id);

grant insert (id) on public.staff_roles to ranza_app;
