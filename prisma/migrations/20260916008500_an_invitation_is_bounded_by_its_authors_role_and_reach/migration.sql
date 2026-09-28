-- An invitation is bounded by its author's role and reach (SP-S1-39).
--
-- 20260916007000 put two ceilings on memberships and assignments — nobody hands
-- out, or acts on, a role above their own or a reach wider than their own — and
-- left the invitation policies asking for staff.administer alone. So an
-- administrator of one hotel could write an invitation, with a token they chose,
-- for the organization-wide Owner, or withdraw the Owner's live one. Harmless
-- while accepting an invitation only records acceptance. The day a route sets a
-- password from one, writing it for a superior is an account takeover.
--
-- An invitation has no role and no reach of its own. It is the way to a
-- password for one membership, so it is bounded by that membership's, the way
-- 20260916007000 bounds a Property assignment by whose it is. The membership is
-- read whatever its status: revoking ends it first and withdraws its invitation
-- after (SP-S1-27).
--
-- The bound is asked when an invitation is written, not for as long as it is
-- live. A member promoted or given more reach after their invitation was
-- written leaves its author holding a link to somebody now above them; that is
-- SP-S1-41, and the route that one day sets a password from an invitation is
-- where it has to be answered.
--
-- Writing a live invitation is bounded five ways:
--   * its author is the person writing it. invited_by is who the bound is
--     about, and a row naming somebody else as its author records a decision
--     nobody made;
--   * the membership is active. A live link for a revoked membership has
--     nothing to open, and its assignments are revoked with it, so the Property
--     clause below would see none — and an undo of the revoke by somebody wider
--     would hand them all back behind a token the narrower author holds;
--   * the invitee's role holds nothing the author's does not (SP-S1-34);
--   * an organization-wide invitee is invited only by an organization-wide
--     author (SP-S1-36);
--   * every Property the invitee reaches, the author reaches too. A password
--     for somebody at a hotel the author does not run is reach the author was
--     not given. An organization-wide author reaches every Property by
--     definition, so the clause is not asked of them — a Property that is no
--     longer active is out of accessible_property_ids() and would otherwise
--     refuse the one person entitled to act there.
--
-- Withdrawing is bounded by role and organization-wide reach, and not by
-- Properties, exactly as revoking the membership is: taking something away is
-- narrowing, and 20260916007000 never bounds narrowing by the actor's reach.
--
-- An update never leaves a row pending. Reopening a withdrawn invitation would
-- revive a token only its original author holds — the plaintext went to them
-- and nobody else, and neither token_hash nor invited_by is a column ranza_app
-- may update — so a wider administrator reopening it for a member since
-- promoted would hand the narrower author a live link to somebody above them.
-- Nothing in the product reopens one: re-inviting writes a fresh row (SP-S1-16)
-- under the insert policy above, whose author is whoever writes it.
--
-- Role and organization-wide reach are asked by USING alone. They read only
-- organization_id and user_id, which ranza_app may not update (20260916002200's
-- column grants), so the row as it will be names the same membership as the
-- row as it is, and a copy in WITH CHECK could never refuse anything USING had
-- admitted.
--
-- The commercial gate stays where 20260916002200 put it: on the insert, and off
-- the update, because withdrawing travels with a revoke (SP-S1-21).
--
-- A refusal raises 42501 from WITH CHECK; a USING that excludes the row matches
-- nothing and raises nothing. The staff module does not count a withdrawal —
-- a revoke usually has no pending invitation to withdraw — so what keeps a
-- revoke from leaving a live link behind (SP-S1-27) is that this USING asks
-- exactly what the membership update's USING asks of the same person: a revoke
-- it would refuse is refused first, on the membership, and reported. The two
-- must change together.
--
-- No definer is needed: memberships and assignments are readable across the
-- Organization by anybody who reaches it (20260916002200), so these subqueries
-- see every row they ask about and cannot pass for want of one.

drop policy invitations_written_by_an_administrator
  on public.staff_invitations;

create policy invitations_written_by_an_administrator
  on public.staff_invitations for insert
  with check (
    app.has_organization_permission(organization_id, 'staff.administer')
    and app.can_use_capability_in_organization(
          organization_id, 'platform_core', 'staff_administration')
    and invited_by = app.current_user_id()
    and exists (
      select 1
        from public.organization_memberships as invitee
       where invitee.organization_id = staff_invitations.organization_id
         and invitee.user_id = staff_invitations.user_id
         and invitee.status = 'active')
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
    and (app.has_organization_wide_reach(organization_id)
         or not exists (
           select 1
             from public.property_assignments as reached
            where reached.organization_id = staff_invitations.organization_id
              and reached.user_id = staff_invitations.user_id
              and reached.status = 'active'
              and reached.property_id not in (select app.accessible_property_ids())))
  );

drop policy invitations_changed_by_an_administrator
  on public.staff_invitations;

create policy invitations_changed_by_an_administrator
  on public.staff_invitations for update
  using (
    app.has_organization_permission(organization_id, 'staff.administer')
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
  with check (
    app.has_organization_permission(organization_id, 'staff.administer')
    and status <> 'pending'
  );
