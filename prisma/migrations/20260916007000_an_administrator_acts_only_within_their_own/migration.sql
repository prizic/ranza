-- An administrator acts only within their own role and their own reach
-- (SP-S1-34, SP-S1-36).
--
-- 20260916004250 bounded the role a membership is LEFT holding by what the
-- actor holds. It left two ways round that ceiling.
--
-- The first is the row being replaced. The update policy's USING asked only for
-- staff.administer, so a narrow administrator could revoke the Owner — and then
-- could not undo it, because undoing hands back a role above their own. With
-- nobody else holding the whole catalogue, the Organization could never assign
-- Owner again. The product owner decided on 2026-09-24 that an administrator
-- may not revoke or change a member whose current role exceeds their own
-- (#66). SP-S1-21's "revoking is never blocked" is about money, not privilege,
-- and still holds: the commercial gate stays off the revoke arm.
--
-- The second is reach, which had no ceiling at all (#67). An administrator whose
-- own reach was a set of assigned Properties could assign themselves another
-- Property, or set their own access_scope to organization_wide. Reach is now
-- bounded the way a role is: a Property is handed out only by somebody who
-- reaches it, and organization_wide only by somebody who holds it.
--
-- "Nobody acts on a superior" applies to reach as it does to roles. An
-- administrator of assigned Properties does not change or revoke an
-- organization-wide member: a Manager of one hotel could otherwise narrow an
-- organization-wide Owner to no Property at all, which fails every commercial
-- gate the Owner meets and cannot be undone by anybody who is not
-- organization-wide themselves. Within that, narrowing is never bounded by the
-- actor's reach: taking a Property away from somebody they may act on is
-- allowed whether or not they reach it.
--
-- A Property assignment is bounded by the role and reach of the person it
-- belongs to, as their membership is. Otherwise an administrator who may not
-- revoke a Manager could unassign every Property the Manager reaches, which is
-- a revoke in all but name — and every assignment change ends its holder's
-- sessions, so an administrator of one hotel could sign an organization-wide
-- colleague out at will. The holder's membership is read whatever its status,
-- because revoking ends the membership first and its assignments after.
--
-- Editing a role is the same route again: cutting down a role somebody holds
-- demotes every holder. An author may now edit only a role within their own,
-- as they may only hand out one.
--
-- Bounding reach this way creates a lock-out the old policies did not have:
-- the last organization-wide administrator revoking or narrowing themselves
-- left nobody who could grant organization_wide again, or undo it. So an
-- Organization that has an organization-wide holder of staff.administer keeps
-- one, the way it keeps somebody who can add staff at all (SP-S1-38).
--
-- Role lookups qualify their columns with the table's name, for the reason
-- 20260916004250 gives: staff_roles has an organization_id of its own. A pair
-- that names no role reads as null, which fails the check.

drop policy memberships_written_by_an_administrator
  on public.organization_memberships;

create policy memberships_written_by_an_administrator
  on public.organization_memberships for insert
  with check (
    app.has_organization_permission(organization_id, 'staff.administer')
    and app.can_use_capability_in_organization(
          organization_id, 'platform_core', 'staff_administration')
    and (select assigned.permissions
           from public.staff_roles as assigned
          where assigned.scope_id = organization_memberships.role_scope_id
            and assigned.key = organization_memberships.role)
        <@ app.organization_permissions(organization_id)
    and (access_scope = 'assigned_properties'
         or app.has_organization_wide_reach(organization_id))
  );

drop policy memberships_changed_by_an_administrator
  on public.organization_memberships;

-- USING reads the row as it is and WITH CHECK the row as it will be; both ask
-- the same two ceilings. A row USING refuses is not matched, and the staff
-- module reports a statement that matched nothing as a refusal. A revoke that
-- leaves the role and reach as they were passes WITH CHECK trivially; only the
-- commercial gate is lifted for it.
create policy memberships_changed_by_an_administrator
  on public.organization_memberships for update
  using (
    app.has_organization_permission(organization_id, 'staff.administer')
    and (select current_role_held.permissions
           from public.staff_roles as current_role_held
          where current_role_held.scope_id = organization_memberships.role_scope_id
            and current_role_held.key = organization_memberships.role)
        <@ app.organization_permissions(organization_id)
    and (access_scope = 'assigned_properties'
         or app.has_organization_wide_reach(organization_id))
  )
  with check (
    app.has_organization_permission(organization_id, 'staff.administer')
    and (select assigned.permissions
           from public.staff_roles as assigned
          where assigned.scope_id = organization_memberships.role_scope_id
            and assigned.key = organization_memberships.role)
        <@ app.organization_permissions(organization_id)
    and (access_scope = 'assigned_properties'
         or app.has_organization_wide_reach(organization_id))
    and (status = 'revoked'
         or app.can_use_capability_in_organization(
              organization_id, 'platform_core', 'staff_administration'))
  );

drop policy assignments_written_by_an_administrator
  on public.property_assignments;

create policy assignments_written_by_an_administrator
  on public.property_assignments for insert
  with check (
    app.has_organization_permission(organization_id, 'staff.administer')
    and app.can_use_capability_in_organization(
          organization_id, 'platform_core', 'staff_administration')
    and property_id in (select app.accessible_property_ids())
    and (select held.permissions
           from public.organization_memberships as holder
           join public.staff_roles as held
             on held.scope_id = holder.role_scope_id
            and held.key = holder.role
          where holder.organization_id = property_assignments.organization_id
            and holder.user_id = property_assignments.user_id)
        <@ app.organization_permissions(organization_id)
    and ((select holder.access_scope
            from public.organization_memberships as holder
           where holder.organization_id = property_assignments.organization_id
             and holder.user_id = property_assignments.user_id)
           = 'assigned_properties'
         or app.has_organization_wide_reach(organization_id))
  );

drop policy assignments_changed_by_an_administrator
  on public.property_assignments;

-- Taking a Property away is bounded by whose it is, not by whether the actor
-- reaches it. Giving one back is handing it out, and needs both.
create policy assignments_changed_by_an_administrator
  on public.property_assignments for update
  using (
    app.has_organization_permission(organization_id, 'staff.administer')
    and (select held.permissions
           from public.organization_memberships as holder
           join public.staff_roles as held
             on held.scope_id = holder.role_scope_id
            and held.key = holder.role
          where holder.organization_id = property_assignments.organization_id
            and holder.user_id = property_assignments.user_id)
        <@ app.organization_permissions(organization_id)
    and ((select holder.access_scope
            from public.organization_memberships as holder
           where holder.organization_id = property_assignments.organization_id
             and holder.user_id = property_assignments.user_id)
           = 'assigned_properties'
         or app.has_organization_wide_reach(organization_id))
  )
  with check (
    app.has_organization_permission(organization_id, 'staff.administer')
    and (status = 'revoked'
         or (app.can_use_capability_in_organization(
               organization_id, 'platform_core', 'staff_administration')
             and property_id in (select app.accessible_property_ids())))
  );

-- ---------------------------------------------------------------------------
-- An author edits only a role within their own (SP-S1-34)
-- ---------------------------------------------------------------------------

drop policy staff_roles_changed_by_an_author on public.staff_roles;

create policy staff_roles_changed_by_an_author
  on public.staff_roles for update
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'staff.define_roles')
    and permissions <@ app.organization_permissions(organization_id)
  )
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'staff.define_roles')
    and permissions <@ app.organization_permissions(organization_id)
    and (status = 'retired'
         or app.can_use_capability_in_organization(
              organization_id, 'platform_core', 'staff_administration'))
  );

-- ---------------------------------------------------------------------------
-- An Organization with an organization-wide administrator keeps one (SP-S1-38)
-- ---------------------------------------------------------------------------

-- Whether an Organization has an active, organization-wide holder of
-- staff.administer. Asked by both triggers below after the change is made.
create function app.has_organization_wide_administrator(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships as membership
    join public.staff_roles as role
      on role.scope_id = membership.role_scope_id
     and role.key = membership.role
    where membership.organization_id = target_organization_id
      and membership.status = 'active'
      and membership.access_scope = 'organization_wide'
      and role.status = 'active'
      and 'staff.administer' = any (role.permissions)
  )
$$;

comment on function app.has_organization_wide_administrator(uuid) is
  'Whether an Organization has an active organization-wide holder of '
  'staff.administer — the one person who can grant organization_wide.';

revoke execute on function app.has_organization_wide_administrator(uuid) from public;

-- The membership trigger gains the second question. The first is unchanged:
-- somebody must still hold staff.administer. The second is asked only when the
-- row being replaced was an organization-wide administrator, so an
-- Organization that never had one is not frozen by it.
create or replace function app.organization_keeps_an_administrator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  was_administrator boolean;
begin
  select exists (
    select 1 from public.staff_roles as role
    where role.scope_id = old.role_scope_id
      and role.key = old.role
      and role.status = 'active'
      and 'staff.administer' = any (role.permissions)
  ) into was_administrator;

  if not was_administrator then
    return null;
  end if;

  perform 1
  from public.organization_memberships as membership
  where membership.organization_id = old.organization_id
  for update;

  if not exists (
    select 1
    from public.organization_memberships as membership
    join public.staff_roles as role
      on role.scope_id = membership.role_scope_id
     and role.key = membership.role
    where membership.organization_id = old.organization_id
      and membership.status = 'active'
      and role.status = 'active'
      and 'staff.administer' = any (role.permissions)
  ) then
    raise exception
      'an Organization must keep somebody who can add staff'
      using errcode = '55000';
  end if;

  if old.access_scope = 'organization_wide'
     and not app.has_organization_wide_administrator(old.organization_id) then
    raise exception
      'an Organization must keep somebody who can add staff at every Property'
      using errcode = '55000';
  end if;

  return null;
end;
$$;

drop trigger organization_memberships_keep_an_administrator
  on public.organization_memberships;

create constraint trigger organization_memberships_keep_an_administrator
  after update on public.organization_memberships
  deferrable initially immediate
  for each row
  when (old.status = 'active'
        and (new.status <> 'active'
             or new.role is distinct from old.role
             or new.role_scope_id is distinct from old.role_scope_id
             or new.access_scope is distinct from old.access_scope))
  execute function app.organization_keeps_an_administrator();

-- Editing or retiring a role can take the last organization-wide authority away
-- just as surely, when an organization-wide member holds it.
create or replace function app.role_change_keeps_an_administrator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected uuid;
begin
  if not exists (select 1 where 'staff.administer' = any (old.permissions)) then
    return null;
  end if;

  for affected in
    select distinct membership.organization_id
    from public.organization_memberships as membership
    where membership.role_scope_id = old.scope_id
      and membership.role = old.key
      and membership.status = 'active'
  loop
    perform 1
    from public.organization_memberships as membership
    where membership.organization_id = affected
    for update;

    if not exists (
      select 1
      from public.organization_memberships as membership
      join public.staff_roles as role
        on role.scope_id = membership.role_scope_id
       and role.key = membership.role
      where membership.organization_id = affected
        and membership.status = 'active'
        and role.status = 'active'
        and 'staff.administer' = any (role.permissions)
    ) then
      raise exception
        'an Organization must keep somebody who can add staff'
        using errcode = '55000';
    end if;

    if exists (
         select 1
         from public.organization_memberships as membership
         where membership.organization_id = affected
           and membership.role_scope_id = old.scope_id
           and membership.role = old.key
           and membership.status = 'active'
           and membership.access_scope = 'organization_wide')
       and not app.has_organization_wide_administrator(affected) then
      raise exception
        'an Organization must keep somebody who can add staff at every Property'
        using errcode = '55000';
    end if;
  end loop;

  return null;
end;
$$;

