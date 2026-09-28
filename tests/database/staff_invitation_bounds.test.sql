-- An invitation is bounded by its author's role and reach (SP-S1-39).
--
-- An invitation has no role and no reach of its own: it is the way to a
-- password for one membership, so it is bounded by the role and reach of that
-- membership, the way 20260916007000 bounds a Property assignment by whose it
-- is. Writing one for a superior with a token the author chose is an account
-- takeover the day a route sets a password from it.
--
-- Its own suite rather than a section of staff_and_permissions.test.sql, whose
-- fixtures are rewritten section by section: every row here is written for the
-- assertion that reads it.
--
-- Every refusal below was watched go red by restoring the policies
-- 20260916002200 wrote, which asked for staff.administer alone, and every clause
-- of the new ones was removed on its own and seen to turn its assertion red.

begin;

select plan(18);

-- How many rows a statement changed, or -1 when a policy refused it by raising.
-- A USING clause refuses by matching nothing, a WITH CHECK by raising, and a
-- raise here would abort the transaction and silence every assertion after it.
-- Invoker, so the statement runs as whoever is acting.
create function pg_temp.rows_changed(statement text) returns integer
language plpgsql as $$
declare
  changed integer;
begin
  execute statement;
  get diagnostics changed = row_count;
  return changed;
exception
  when insufficient_privilege then return -1;
end;
$$;

insert into public.users (id, email) values
  ('81111111-1111-4111-8111-111111111111', 'invite-owner@example.test'),
  ('82222222-2222-4222-8222-222222222222', 'invite-desk-admin@example.test'),
  ('82333333-3333-4333-8333-333333333333', 'invite-desk-peer@example.test'),
  -- Invitees without a live invitation, for the inserts.
  ('83111111-1111-4111-8111-111111111111', 'invite-new-manager@example.test'),
  ('83222222-2222-4222-8222-222222222222', 'invite-new-wide@example.test'),
  ('83333333-3333-4333-8333-333333333333', 'invite-new-elsewhere@example.test'),
  ('83444444-4444-4444-8444-444444444444', 'invite-new-within@example.test'),
  -- Invitees holding a live invitation, for the withdrawals.
  ('84111111-1111-4111-8111-111111111111', 'invite-open-manager@example.test'),
  ('84222222-2222-4222-8222-222222222222', 'invite-open-wide@example.test'),
  ('84333333-3333-4333-8333-333333333333', 'invite-open-elsewhere@example.test'),
  ('84444444-4444-4444-8444-444444444444', 'invite-open-within@example.test'),
  -- Revoked, within their role and reach.
  ('83555555-5555-4555-8555-555555555555', 'invite-new-revoked@example.test'),
  -- At a Property that is no longer active.
  ('83666666-6666-4666-8666-666666666666', 'invite-new-archived@example.test');

insert into public.organizations (id, name, status) values
  ('8a111111-1111-4111-8111-111111111111', 'Invitation Organization', 'active');

insert into public.properties (id, organization_id, name) values
  ('8b111111-1111-4111-8111-111111111111',
   '8a111111-1111-4111-8111-111111111111', 'Invitation Property One'),
  ('8b222222-2222-4222-8222-222222222222',
   '8a111111-1111-4111-8111-111111111111', 'Invitation Property Two');
-- Archived after its staff were assigned: out of accessible_property_ids() for
-- everybody, the Owner included.
insert into public.properties (id, organization_id, name, status) values
  ('8b333333-3333-4333-8333-333333333333',
   '8a111111-1111-4111-8111-111111111111', 'Invitation Property Three',
   'archived');

insert into public.subscriptions (organization_id, status) values
  ('8a111111-1111-4111-8111-111111111111', 'active');
insert into public.entitlements (organization_id, module_key) values
  ('8a111111-1111-4111-8111-111111111111', 'platform_core');
insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('8b111111-1111-4111-8111-111111111111',
   '8a111111-1111-4111-8111-111111111111', 'staff_administration', true),
  ('8b222222-2222-4222-8222-222222222222',
   '8a111111-1111-4111-8111-111111111111', 'staff_administration', true);

-- The Desk admin holds staff.administer and audit.read: enough to hand out the
-- Night auditor role, and not Manager.
insert into public.staff_roles
  (scope_id, key, organization_id, name, permissions) values
  ('8a111111-1111-4111-8111-111111111111', 'desk_admin',
   '8a111111-1111-4111-8111-111111111111', 'Desk admin',
   array['staff.administer', 'audit.read']),
  ('8a111111-1111-4111-8111-111111111111', 'night_auditor',
   '8a111111-1111-4111-8111-111111111111', 'Night auditor',
   array['audit.read']);

insert into public.organization_memberships
  (organization_id, user_id, role, role_scope_id, access_scope) values
  ('8a111111-1111-4111-8111-111111111111',
   '81111111-1111-4111-8111-111111111111', 'owner',
   '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('8a111111-1111-4111-8111-111111111111',
   '82222222-2222-4222-8222-222222222222', 'desk_admin',
   '8a111111-1111-4111-8111-111111111111', 'assigned_properties'),
  ('8a111111-1111-4111-8111-111111111111',
   '82333333-3333-4333-8333-333333333333', 'desk_admin',
   '8a111111-1111-4111-8111-111111111111', 'assigned_properties'),
  -- Above the Desk admin in role.
  ('8a111111-1111-4111-8111-111111111111',
   '83111111-1111-4111-8111-111111111111', 'manager',
   '00000000-0000-0000-0000-000000000000', 'assigned_properties'),
  ('8a111111-1111-4111-8111-111111111111',
   '84111111-1111-4111-8111-111111111111', 'manager',
   '00000000-0000-0000-0000-000000000000', 'assigned_properties'),
  -- Above them in reach.
  ('8a111111-1111-4111-8111-111111111111',
   '83222222-2222-4222-8222-222222222222', 'night_auditor',
   '8a111111-1111-4111-8111-111111111111', 'organization_wide'),
  ('8a111111-1111-4111-8111-111111111111',
   '84222222-2222-4222-8222-222222222222', 'night_auditor',
   '8a111111-1111-4111-8111-111111111111', 'organization_wide'),
  -- Within their role, at a Property they do not reach.
  ('8a111111-1111-4111-8111-111111111111',
   '83333333-3333-4333-8333-333333333333', 'night_auditor',
   '8a111111-1111-4111-8111-111111111111', 'assigned_properties'),
  ('8a111111-1111-4111-8111-111111111111',
   '84333333-3333-4333-8333-333333333333', 'night_auditor',
   '8a111111-1111-4111-8111-111111111111', 'assigned_properties'),
  -- Within their role and their reach.
  ('8a111111-1111-4111-8111-111111111111',
   '83444444-4444-4444-8444-444444444444', 'night_auditor',
   '8a111111-1111-4111-8111-111111111111', 'assigned_properties'),
  ('8a111111-1111-4111-8111-111111111111',
   '84444444-4444-4444-8444-444444444444', 'night_auditor',
   '8a111111-1111-4111-8111-111111111111', 'assigned_properties'),
  ('8a111111-1111-4111-8111-111111111111',
   '83666666-6666-4666-8666-666666666666', 'night_auditor',
   '8a111111-1111-4111-8111-111111111111', 'assigned_properties');

insert into public.organization_memberships
  (organization_id, user_id, role, role_scope_id, access_scope, status,
   revoked_at) values
  ('8a111111-1111-4111-8111-111111111111',
   '83555555-5555-4555-8555-555555555555', 'night_auditor',
   '8a111111-1111-4111-8111-111111111111', 'assigned_properties', 'revoked',
   now());

-- The Desk admins reach Property One only.
insert into public.property_assignments
  (property_id, organization_id, user_id, status) values
  ('8b111111-1111-4111-8111-111111111111',
   '8a111111-1111-4111-8111-111111111111',
   '82222222-2222-4222-8222-222222222222', 'active'),
  ('8b111111-1111-4111-8111-111111111111',
   '8a111111-1111-4111-8111-111111111111',
   '82333333-3333-4333-8333-333333333333', 'active'),
  ('8b111111-1111-4111-8111-111111111111',
   '8a111111-1111-4111-8111-111111111111',
   '83111111-1111-4111-8111-111111111111', 'active'),
  ('8b111111-1111-4111-8111-111111111111',
   '8a111111-1111-4111-8111-111111111111',
   '84111111-1111-4111-8111-111111111111', 'active'),
  ('8b222222-2222-4222-8222-222222222222',
   '8a111111-1111-4111-8111-111111111111',
   '83333333-3333-4333-8333-333333333333', 'active'),
  ('8b222222-2222-4222-8222-222222222222',
   '8a111111-1111-4111-8111-111111111111',
   '84333333-3333-4333-8333-333333333333', 'active'),
  ('8b111111-1111-4111-8111-111111111111',
   '8a111111-1111-4111-8111-111111111111',
   '83444444-4444-4444-8444-444444444444', 'active'),
  ('8b111111-1111-4111-8111-111111111111',
   '8a111111-1111-4111-8111-111111111111',
   '84444444-4444-4444-8444-444444444444', 'active'),
  ('8b333333-3333-4333-8333-333333333333',
   '8a111111-1111-4111-8111-111111111111',
   '83666666-6666-4666-8666-666666666666', 'active');

insert into public.staff_invitations
  (organization_id, user_id, token_hash, expires_at, invited_by) values
  ('8a111111-1111-4111-8111-111111111111',
   '84111111-1111-4111-8111-111111111111', 'invite-bounds-open-manager',
   now() + interval '7 days', '81111111-1111-4111-8111-111111111111'),
  ('8a111111-1111-4111-8111-111111111111',
   '84222222-2222-4222-8222-222222222222', 'invite-bounds-open-wide',
   now() + interval '7 days', '81111111-1111-4111-8111-111111111111'),
  ('8a111111-1111-4111-8111-111111111111',
   '84333333-3333-4333-8333-333333333333', 'invite-bounds-open-elsewhere',
   now() + interval '7 days', '81111111-1111-4111-8111-111111111111'),
  ('8a111111-1111-4111-8111-111111111111',
   '84444444-4444-4444-8444-444444444444', 'invite-bounds-open-within',
   now() + interval '7 days', '81111111-1111-4111-8111-111111111111');


-- ---------------------------------------------------------------------------
-- An administrator of one Property, whose role holds less than Manager's
-- ---------------------------------------------------------------------------

set local role ranza_app;
select app.set_request_context('82222222-2222-4222-8222-222222222222');

select throws_ok(
  $$insert into public.staff_invitations
      (organization_id, user_id, token_hash, status, expires_at, invited_by)
    values ('8a111111-1111-4111-8111-111111111111',
            '83111111-1111-4111-8111-111111111111', 'chosen-for-a-manager',
            'pending', now() + interval '7 days',
            '82222222-2222-4222-8222-222222222222')$$,
  '42501', NULL,
  'an administrator cannot write an invitation for somebody whose role is above their own');

select throws_ok(
  $$insert into public.staff_invitations
      (organization_id, user_id, token_hash, status, expires_at, invited_by)
    values ('8a111111-1111-4111-8111-111111111111',
            '83222222-2222-4222-8222-222222222222', 'chosen-for-the-whole',
            'pending', now() + interval '7 days',
            '82222222-2222-4222-8222-222222222222')$$,
  '42501', NULL,
  'nor for somebody who reaches the whole Organization when they do not');

select throws_ok(
  $$insert into public.staff_invitations
      (organization_id, user_id, token_hash, status, expires_at, invited_by)
    values ('8a111111-1111-4111-8111-111111111111',
            '83333333-3333-4333-8333-333333333333', 'chosen-for-elsewhere',
            'pending', now() + interval '7 days',
            '82222222-2222-4222-8222-222222222222')$$,
  '42501', NULL,
  'nor for somebody who reaches a Property they do not');

-- invited_by is who the bound is about, so it is the person writing the row.
select throws_ok(
  $$insert into public.staff_invitations
      (organization_id, user_id, token_hash, status, expires_at, invited_by)
    values ('8a111111-1111-4111-8111-111111111111',
            '83444444-4444-4444-8444-444444444444', 'chosen-in-another-name',
            'pending', now() + interval '7 days',
            '81111111-1111-4111-8111-111111111111')$$,
  '42501', NULL,
  'nor write one in somebody else''s name');

-- A revoked member's assignments are revoked with them, so the Property clause
-- sees none; an undo by somebody wider would hand them back behind this token.
select throws_ok(
  $$insert into public.staff_invitations
      (organization_id, user_id, token_hash, status, expires_at, invited_by)
    values ('8a111111-1111-4111-8111-111111111111',
            '83555555-5555-4555-8555-555555555555', 'chosen-for-the-revoked',
            'pending', now() + interval '7 days',
            '82222222-2222-4222-8222-222222222222')$$,
  '42501', NULL,
  'nor for a member who has been revoked');

-- The same insert inside every bound succeeds, so the refusals above are the
-- bounds, and not the Subscription or the permission.
select lives_ok(
  $$insert into public.staff_invitations
      (organization_id, user_id, token_hash, status, expires_at, invited_by)
    values ('8a111111-1111-4111-8111-111111111111',
            '83444444-4444-4444-8444-444444444444', 'chosen-within',
            'pending', now() + interval '7 days',
            '82222222-2222-4222-8222-222222222222')$$,
  'an administrator writes an invitation for somebody within their role and reach');

select lives_ok(
  $$insert into public.staff_invitations
      (organization_id, user_id, token_hash, status, expires_at, invited_by)
    values ('8a111111-1111-4111-8111-111111111111',
            '82333333-3333-4333-8333-333333333333', 'chosen-for-a-peer',
            'pending', now() + interval '7 days',
            '82222222-2222-4222-8222-222222222222')$$,
  'and for a peer holding the same role and reach');

-- A superior's live invitation is not theirs to withdraw: USING does not match
-- it, so the statement changes nothing, and the module reads that as a refusal.
select is(
  pg_temp.rows_changed($$
    update public.staff_invitations
       set status = 'withdrawn', updated_at = now()
     where user_id = '84111111-1111-4111-8111-111111111111'
       and status = 'pending'$$),
  0,
  'an administrator cannot withdraw the invitation of somebody whose role is above their own');

select is(
  pg_temp.rows_changed($$
    update public.staff_invitations
       set status = 'withdrawn', updated_at = now()
     where user_id = '84222222-2222-4222-8222-222222222222'
       and status = 'pending'$$),
  0,
  'nor of somebody who reaches the whole Organization when they do not');

select is(
  pg_temp.rows_changed($$
    update public.staff_invitations
       set status = 'withdrawn', updated_at = now()
     where user_id = '84444444-4444-4444-8444-444444444444'
       and status = 'pending'$$),
  1,
  'an administrator withdraws the invitation of somebody within their role and reach');

-- Withdrawing is never bounded by the actor's Properties: taking something away
-- is narrowing, and narrowing is not bounded by reach (SP-S1-36), as revoking
-- this person is not.
select is(
  pg_temp.rows_changed($$
    update public.staff_invitations
       set status = 'withdrawn', updated_at = now()
     where user_id = '84333333-3333-4333-8333-333333333333'
       and status = 'pending'$$),
  1,
  'an administrator withdraws the invitation of somebody at a Property they do not reach');

-- Putting it back would revive a token only its author holds, so no update
-- leaves an invitation pending; re-inviting writes a fresh one.
select is(
  pg_temp.rows_changed($$
    update public.staff_invitations
       set status = 'pending', updated_at = now()
     where user_id = '84444444-4444-4444-8444-444444444444'
       and status = 'withdrawn'$$),
  -1,
  'an administrator does not reopen a withdrawn invitation');

-- ---------------------------------------------------------------------------
-- The Owner, who holds the whole catalogue and reaches the whole Organization
-- ---------------------------------------------------------------------------

select app.set_request_context('81111111-1111-4111-8111-111111111111');

select lives_ok(
  $$insert into public.staff_invitations
      (organization_id, user_id, token_hash, status, expires_at, invited_by)
    values ('8a111111-1111-4111-8111-111111111111',
            '83111111-1111-4111-8111-111111111111', 'owner-for-a-manager',
            'pending', now() + interval '7 days',
            '81111111-1111-4111-8111-111111111111')$$,
  'an administrator whose role and reach are wider writes an invitation for a Manager');

select lives_ok(
  $$insert into public.staff_invitations
      (organization_id, user_id, token_hash, status, expires_at, invited_by)
    values ('8a111111-1111-4111-8111-111111111111',
            '83222222-2222-4222-8222-222222222222', 'owner-for-the-whole',
            'pending', now() + interval '7 days',
            '81111111-1111-4111-8111-111111111111')$$,
  'and for somebody organization-wide');

select lives_ok(
  $$insert into public.staff_invitations
      (organization_id, user_id, token_hash, status, expires_at, invited_by)
    values ('8a111111-1111-4111-8111-111111111111',
            '83333333-3333-4333-8333-333333333333', 'owner-for-elsewhere',
            'pending', now() + interval '7 days',
            '81111111-1111-4111-8111-111111111111')$$,
  'and for somebody at any Property');

select is(
  pg_temp.rows_changed($$
    update public.staff_invitations
       set status = 'withdrawn', updated_at = now()
     where user_id in ('84111111-1111-4111-8111-111111111111',
                       '84222222-2222-4222-8222-222222222222')
       and status = 'pending'$$),
  2,
  'and withdraws the invitations the narrower administrator could not');

-- Not even somebody wider. Whoever reopens it, the token belongs to whoever
-- wrote it, and a wider administrator reopening a narrower one's invitation for
-- a member since promoted would hand the narrower one a live link to somebody
-- above them.
select is(
  pg_temp.rows_changed($$
    update public.staff_invitations
       set status = 'pending', updated_at = now()
     where user_id = '84333333-3333-4333-8333-333333333333'
       and status = 'withdrawn'$$),
  -1,
  'nor does an administrator whose role and reach are wider');

-- An organization-wide author reaches every Property by definition, including
-- one archived since, which accessible_property_ids() no longer lists.
select lives_ok(
  $$insert into public.staff_invitations
      (organization_id, user_id, token_hash, status, expires_at, invited_by)
    values ('8a111111-1111-4111-8111-111111111111',
            '83666666-6666-4666-8666-666666666666', 'owner-for-archived',
            'pending', now() + interval '7 days',
            '81111111-1111-4111-8111-111111111111')$$,
  'an organization-wide administrator invites somebody assigned to an archived Property');

reset role;

select finish();
rollback;
