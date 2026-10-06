-- Withdrawing is the only change ranza_app makes to an invitation (SP-S1-39).
--
-- 20260916008500 let an update write any status but pending, to any row it
-- reached. ranza_app may update status and accepted_at, so an administrator in
-- bounds could mark a live invitation accepted or expired with no commercial
-- gate, or rewrite an accepted one as withdrawn with accepted_at cleared —
-- history erased. The staff module writes one thing, pending to withdrawn;
-- accepting and expiring belong to the definer functions, which run as owner
-- and are not bound by this policy.
--
-- A new migration rather than an edit: 20260916008500 may already be applied
-- somewhere, and migrate deploy does not re-run a changed file.

drop policy invitations_changed_by_an_administrator
  on public.staff_invitations;

create policy invitations_changed_by_an_administrator
  on public.staff_invitations for update
  using (
    status = 'pending'
    and app.has_organization_permission(organization_id, 'staff.administer')
    and (select held.permissions
           from public.organization_memberships as invitee
           join public.staff_roles as held
             on held.scope_id = invitee.role_scope_id
            and held.key = invitee.role
          where invitee.organization_id = staff_invitations.organization_id
            and invitee.user_id = staff_invitations.user_id)
        <@ app.organization_permissions(organization_id)
    and ((select invitee.access_scope
            from public.organization_memberships as invitee
           where invitee.organization_id = staff_invitations.organization_id
             and invitee.user_id = staff_invitations.user_id)
           = 'assigned_properties'
         or app.has_organization_wide_reach(organization_id))
  )
  with check (status = 'withdrawn');
