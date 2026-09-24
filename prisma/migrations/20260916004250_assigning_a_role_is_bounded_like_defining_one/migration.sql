-- Assigning a role is bounded the way defining one is (SP-S1-34).
--
-- Defining a role has had a ceiling since 20260916002400: an author may only
-- put into a role what their own role holds, because otherwise defining a role
-- is privilege escalation with extra steps (SP-S3-01). Assigning one had no
-- ceiling at all. The membership policies asked only for staff.administer, so
-- an Owner could author a role holding nothing but staff.administer, and
-- whoever held it could make themselves Owner, or invite somebody else as one.
-- The ceiling on definition was real and could be walked around in one step.
--
-- The same ceiling now applies to the role a membership is left holding: its
-- permissions must be within `app.organization_permissions()`, what the acting
-- Staff Member holds in that Organization. The role is found by the row's own
-- key and scope, which covers both kinds — a shipped role's scope is the nil
-- uuid, an Organization's own role's scope is the Organization — and a pair
-- that names no role reads as nothing, which fails the check rather than
-- passing it.
--
-- The shipped Owner holds the whole catalogue, so an Owner may still assign any
-- role. The shipped Manager holds the same set today, so a Manager may too;
-- both follow from the permissions, not from the key, and a Manager given less
-- would be bounded by less.
--
-- Revoking is never blocked, on the reasoning of SP-S1-21: taking reach away
-- must not depend on what the actor holds any more than on money. A demotion is
-- not exempt: the ceiling is asked of the role a membership is left holding,
-- and handing somebody a role the actor may not hand out is refused whichever
-- way it moves them. An administrator who may not grant a role may still revoke
-- whoever holds it, and may not undo that revoke, which hands the role back. So
-- revoking the only holder of the whole catalogue leaves nobody who can hand it
-- out again; SP-S1-34 records that as open.
--
-- The last-administrator trigger and the role-is-held trigger are untouched;
-- this only narrows who may write the row.
--
-- The role is looked up with its columns qualified by the membership table's
-- name: `staff_roles` has an `organization_id` of its own, and an unqualified
-- one inside the subquery would bind to the role rather than the membership.

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
  );

drop policy memberships_changed_by_an_administrator
  on public.organization_memberships;

create policy memberships_changed_by_an_administrator
  on public.organization_memberships for update
  using (app.has_organization_permission(organization_id, 'staff.administer'))
  with check (
    app.has_organization_permission(organization_id, 'staff.administer')
    and (status = 'revoked'
         or (app.can_use_capability_in_organization(
               organization_id, 'platform_core', 'staff_administration')
             and (select assigned.permissions
                    from public.staff_roles as assigned
                   where assigned.scope_id = organization_memberships.role_scope_id
                     and assigned.key = organization_memberships.role)
                 <@ app.organization_permissions(organization_id)))
  );
