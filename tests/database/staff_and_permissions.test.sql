-- Staff and permissions, slice 1: the roster and reach.
--
-- The subject of these writes is authorization itself, which makes the usual
-- argument for a policy sharper than usual: a rule the application enforces and
-- the database does not is a rule somebody can route around by reaching the
-- table another way, and the table they would be reaching is the one that says
-- who may do what.
--
-- Every assertion below was checked by breaking the thing it asserts — dropping
-- each write policy, dropping the composite foreign key to staff_roles,
-- dropping the trigger, dropping each column grant, and replacing the
-- commercial gate with `true` — and confirming it went red.
--
-- SP-S1-13 (two administrators demoting each other at once) is absent on
-- purpose: it needs two sessions and pgTAP has one. It lives in
-- tests/integration/staff.test.ts, which can open two connections.
begin;
select plan(60);

insert into public.users (id, email) values
  ('61111111-1111-4111-8111-111111111111', 'staff-owner-a@example.test'),
  ('62222222-2222-4222-8222-222222222222', 'staff-second-a@example.test'),
  ('63333333-3333-4333-8333-333333333333', 'staff-desk-a@example.test'),
  ('64444444-4444-4444-8444-444444444444', 'staff-owner-b@example.test'),
  ('65555555-5555-4555-8555-555555555555', 'staff-owner-lapsed@example.test'),
  -- Reaches everything Organization A has and holds no command at all. The
  -- whole of slice 2 is the difference between this person and the front desk.
  ('66666666-6666-4666-8666-666666666666', 'staff-housekeeping@example.test');

insert into public.organizations (id, name, status) values
  ('6a111111-1111-4111-8111-111111111111', 'Staff Organization A', 'active'),
  ('6a222222-2222-4222-8222-222222222222', 'Staff Organization B', 'active'),
  ('6a333333-3333-4333-8333-333333333333', 'Staff Organization Lapsed', 'active');

insert into public.properties (id, organization_id, name) values
  ('6b111111-1111-4111-8111-111111111111',
   '6a111111-1111-4111-8111-111111111111', 'Staff Property A1'),
  ('6b222222-2222-4222-8222-222222222222',
   '6a222222-2222-4222-8222-222222222222', 'Staff Property B1'),
  ('6b333333-3333-4333-8333-333333333333',
   '6a333333-3333-4333-8333-333333333333', 'Staff Property L1');

insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('6a111111-1111-4111-8111-111111111111',
   '61111111-1111-4111-8111-111111111111', 'owner', 'organization_wide'),
  ('6a111111-1111-4111-8111-111111111111',
   '62222222-2222-4222-8222-222222222222', 'owner', 'organization_wide'),
  ('6a111111-1111-4111-8111-111111111111',
   '63333333-3333-4333-8333-333333333333', 'front_desk', 'organization_wide'),
  ('6a222222-2222-4222-8222-222222222222',
   '64444444-4444-4444-8444-444444444444', 'owner', 'organization_wide'),
  ('6a333333-3333-4333-8333-333333333333',
   '65555555-5555-4555-8555-555555555555', 'owner', 'organization_wide'),
  ('6a111111-1111-4111-8111-111111111111',
   '66666666-6666-4666-8666-666666666666', 'housekeeping', 'organization_wide');

-- Organization Lapsed has everything except a Subscription that is paid for.
insert into public.subscriptions (organization_id, status) values
  ('6a111111-1111-4111-8111-111111111111', 'active'),
  ('6a222222-2222-4222-8222-222222222222', 'active'),
  ('6a333333-3333-4333-8333-333333333333', 'past_due');

insert into public.entitlements (organization_id, module_key) values
  ('6a111111-1111-4111-8111-111111111111', 'front_office'),
  ('6a111111-1111-4111-8111-111111111111', 'platform_core'),
  ('6a222222-2222-4222-8222-222222222222', 'platform_core'),
  ('6a333333-3333-4333-8333-333333333333', 'platform_core');

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('6b111111-1111-4111-8111-111111111111',
   '6a111111-1111-4111-8111-111111111111', 'staff_administration', true),
  ('6b111111-1111-4111-8111-111111111111',
   '6a111111-1111-4111-8111-111111111111', 'front_desk', true),
  ('6b222222-2222-4222-8222-222222222222',
   '6a222222-2222-4222-8222-222222222222', 'staff_administration', true),
  ('6b333333-3333-4333-8333-333333333333',
   '6a333333-3333-4333-8333-333333333333', 'staff_administration', true);

-- Something to book, and somebody to book it for.
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity) values
  ('6c111111-1111-4111-8111-111111111111',
   '6b111111-1111-4111-8111-111111111111',
   '6a111111-1111-4111-8111-111111111111', 'SA1-101', 'room', 2);

insert into public.guests (id, organization_id, full_name) values
  ('6d111111-1111-4111-8111-111111111111',
   '6a111111-1111-4111-8111-111111111111', 'Sevgi Soysal');

-- An Organization's own role, so "another Organization's role" has something to
-- be (SP-S1-10).
insert into public.staff_roles (scope_id, key, organization_id, name, permissions)
values ('6a222222-2222-4222-8222-222222222222', 'night_manager',
        '6a222222-2222-4222-8222-222222222222', 'Night manager',
        array['staff.administer']);

-- ---------------------------------------------------------------------------
-- What the table refuses regardless of who is asking
-- ---------------------------------------------------------------------------

-- SP-S1-03. Not a uniqueness convenience: it is what makes re-inviting somebody
-- reuse their row rather than create a second person with the same face.
select throws_ok(
  $$insert into public.organization_memberships
      (organization_id, user_id, role) values
      ('6a111111-1111-4111-8111-111111111111',
       '61111111-1111-4111-8111-111111111111', 'front_desk')$$,
  '23505', NULL,
  'one person has one membership per Organization');

-- SP-S1-10. Two constraints together: the check bounds which scope may be
-- named, and the foreign key proves the role lives in the scope named. Naming
-- Organization B's scope from a membership of Organization A fails the check.
select throws_ok(
  $$update public.organization_memberships
       set role = 'night_manager',
           role_scope_id = '6a222222-2222-4222-8222-222222222222'
     where organization_id = '6a111111-1111-4111-8111-111111111111'
       and user_id = '63333333-3333-4333-8333-333333333333'$$,
  '23514', NULL,
  'a membership cannot name another Organization''s role scope');

-- And lying about the scope instead fails the foreign key, which is why one
-- constraint would not have been enough.
select throws_ok(
  $$update public.organization_memberships
       set role = 'night_manager',
           role_scope_id = '6a111111-1111-4111-8111-111111111111'
     where organization_id = '6a111111-1111-4111-8111-111111111111'
       and user_id = '63333333-3333-4333-8333-333333333333'$$,
  '23503', NULL,
  'a membership cannot claim a role its Organization never authored');

-- SP-S1-17.
select throws_ok(
  $$insert into public.property_assignments
      (property_id, organization_id, user_id) values
      ('6b222222-2222-4222-8222-222222222222',
       '6a111111-1111-4111-8111-111111111111',
       '63333333-3333-4333-8333-333333333333')$$,
  '23503', NULL,
  'an assignment cannot name a Property of another Organization');

-- SP-S3-03.
select throws_ok(
  $$insert into public.staff_roles (scope_id, key, organization_id, name)
    values ('6a111111-1111-4111-8111-111111111111', 'blank',
            '6a111111-1111-4111-8111-111111111111', '   ')$$,
  '23514', NULL,
  'a role without a name is unrepresentable');

-- SP-S3-04.
select throws_ok(
  $$insert into public.staff_roles (scope_id, key, organization_id, name)
    values ('6a222222-2222-4222-8222-222222222222', 'night_manager_2',
            '6a222222-2222-4222-8222-222222222222', 'Night manager')$$,
  '23505', NULL,
  'a role name is unique within its Organization');

-- SP-S3-06. There is no path that retires a shipped role, including this one.
select throws_ok(
  $$update public.staff_roles set status = 'retired'
     where organization_id is null and key = 'finance'$$,
  '23514', NULL,
  'a role Ranza ships is never retired');

-- A revoked membership carries the moment it was revoked, because the undo
-- window is measured from it and an optional column would make the window
-- optional (SP-S1-22).
select throws_ok(
  $$update public.organization_memberships set status = 'revoked'
     where organization_id = '6a111111-1111-4111-8111-111111111111'
       and user_id = '63333333-3333-4333-8333-333333333333'$$,
  '23514', NULL,
  'a membership cannot be revoked without recording when');

-- ---------------------------------------------------------------------------
-- The runtime role with nobody acting
-- ---------------------------------------------------------------------------

set local role ranza_app;

select is_empty(
  'select id from public.organization_memberships',
  'without a request context no membership is readable');

select is_empty(
  'select scope_id from public.staff_roles where organization_id is not null',
  'without a request context no authored role is readable');

select throws_ok(
  $$insert into public.organization_memberships
      (organization_id, user_id, role) values
      ('6a111111-1111-4111-8111-111111111111',
       '64444444-4444-4444-8444-444444444444', 'front_desk')$$,
  '42501', NULL,
  'without a request context nobody can be added to a roster');

-- ---------------------------------------------------------------------------
-- An administrator of Organization A
-- ---------------------------------------------------------------------------

select app.set_request_context('61111111-1111-4111-8111-111111111111');

-- SP-S1-20. The point of the whole slice: a roster is the Organization's, not a
-- private view of one row. Revoked memberships included, because a roster that
-- hid them would make the undo window invisible.
select set_eq(
  $$select account.email from public.organization_memberships as membership
      join public.users as account on account.id = membership.user_id$$,
  array['staff-owner-a@example.test', 'staff-second-a@example.test',
        'staff-desk-a@example.test', 'staff-housekeeping@example.test'],
  'a Staff Member sees their own Organization''s roster and no other');

-- SP-S2-03, SP-S3-07. Shipped roles are shared; Organization B's is absent, and
-- absent is indistinguishable from never having existed.
select set_eq(
  'select key from public.staff_roles',
  array['owner', 'manager', 'front_desk', 'housekeeping', 'finance'],
  'the role grid shows the shipped roles and this Organization''s own');

select lives_ok(
  $$insert into public.organization_memberships
      (organization_id, user_id, role, access_scope) values
      ('6a111111-1111-4111-8111-111111111111',
       '64444444-4444-4444-8444-444444444444', 'front_desk',
       'assigned_properties')$$,
  'an administrator adds somebody to their own Organization');

-- SP-S1-04. The row is entirely self-consistent: Organization B exists, the
-- user exists, the role is one Ranza ships. Only the policy stops it.
select throws_ok(
  $$insert into public.organization_memberships
      (organization_id, user_id, role) values
      ('6a222222-2222-4222-8222-222222222222',
       '63333333-3333-4333-8333-333333333333', 'front_desk')$$,
  '42501', NULL,
  'an administrator cannot add somebody to an Organization they do not reach');

select lives_ok(
  $$insert into public.property_assignments
      (property_id, organization_id, user_id) values
      ('6b111111-1111-4111-8111-111111111111',
       '6a111111-1111-4111-8111-111111111111',
       '64444444-4444-4444-8444-444444444444')$$,
  'an administrator gives somebody a Property to work at');

-- A policy bounds rows; a grant bounds columns (ADR 0012). The update policy
-- would happily let this row through — it is the same Organization before and
-- after the WITH CHECK is evaluated. Only the column grant stops a membership
-- being handed to a different person.
select throws_ok(
  $$update public.organization_memberships
       set user_id = '65555555-5555-4555-8555-555555555555'
     where organization_id = '6a111111-1111-4111-8111-111111111111'
       and user_id = '64444444-4444-4444-8444-444444444444'$$,
  '42501', NULL,
  'a membership cannot be handed to a different person');

select throws_ok(
  $$update public.organization_memberships
       set organization_id = '6a222222-2222-4222-8222-222222222222'
     where organization_id = '6a111111-1111-4111-8111-111111111111'
       and user_id = '64444444-4444-4444-8444-444444444444'$$,
  '42501', NULL,
  'a membership cannot be moved to another Organization');

select throws_ok(
  $$delete from public.organization_memberships
     where organization_id = '6a111111-1111-4111-8111-111111111111'
       and user_id = '64444444-4444-4444-8444-444444444444'$$,
  '42501', NULL,
  'a membership is revoked, never deleted');

-- SP-S1-12. Two administrators, so demoting one is allowed.
select lives_ok(
  $$update public.organization_memberships
       set role = 'front_desk', updated_at = now()
     where organization_id = '6a111111-1111-4111-8111-111111111111'
       and user_id = '62222222-2222-4222-8222-222222222222'$$,
  'an administrator may be demoted while another one remains');

-- And now there is one, which is the case the trigger exists for. A row-level
-- policy could not have expressed this: it is a fact about the set.
select throws_ok(
  $$update public.organization_memberships
       set role = 'front_desk', updated_at = now()
     where organization_id = '6a111111-1111-4111-8111-111111111111'
       and user_id = '61111111-1111-4111-8111-111111111111'$$,
  '55000', 'an Organization must keep somebody who can add staff',
  'the last holder of staff authority cannot be demoted');

select throws_ok(
  $$update public.organization_memberships
       set status = 'revoked', revoked_at = now()
     where organization_id = '6a111111-1111-4111-8111-111111111111'
       and user_id = '61111111-1111-4111-8111-111111111111'$$,
  '55000', 'an Organization must keep somebody who can add staff',
  'the last holder of staff authority cannot be revoked');

-- ---------------------------------------------------------------------------
-- Somebody without staff authority
-- ---------------------------------------------------------------------------

select app.set_request_context('63333333-3333-4333-8333-333333333333');

select isnt_empty(
  'select id from public.organization_memberships',
  'a Staff Member without authority still reads the roster');

-- SP-S2-02 in miniature, a slice early: the permission is what is missing, not
-- the reach and not the money.
select throws_ok(
  $$insert into public.organization_memberships
      (organization_id, user_id, role) values
      ('6a111111-1111-4111-8111-111111111111',
       '65555555-5555-4555-8555-555555555555', 'front_desk')$$,
  '42501', NULL,
  'a Staff Member without staff authority cannot add a colleague');

-- Not a refusal but an absence, and the difference is worth knowing. An INSERT
-- that fails WITH CHECK raises; an UPDATE whose USING clause excludes the row
-- simply never sees it, so the statement succeeds having changed nothing. The
-- module reads that zero back and reports a refusal — which is why it counts
-- rows rather than waiting for an exception.
select lives_ok(
  $$update public.organization_memberships
       set role = 'owner', updated_at = now()
     where organization_id = '6a111111-1111-4111-8111-111111111111'
       and user_id = '63333333-3333-4333-8333-333333333333'$$,
  'a promotion by somebody without authority raises nothing');

select is(
  (select role from public.organization_memberships
    where user_id = '63333333-3333-4333-8333-333333333333'
      and organization_id = '6a111111-1111-4111-8111-111111111111'),
  'front_desk',
  'and changes nothing: a Staff Member cannot promote themselves');

-- ---------------------------------------------------------------------------
-- An Organization whose Subscription has lapsed
-- ---------------------------------------------------------------------------

select app.set_request_context('65555555-5555-4555-8555-555555555555');

-- SP-S1-05.
select throws_ok(
  $$insert into public.organization_memberships
      (organization_id, user_id, role) values
      ('6a333333-3333-4333-8333-333333333333',
       '63333333-3333-4333-8333-333333333333', 'front_desk')$$,
  '42501', NULL,
  'a lapsed Subscription invites nobody');

-- `none` rather than the owner's name. This used to say `set local role ranza`,
-- which is the local cluster's owner and does not exist on the hosted
-- database, so this suite could not run there at all — it errored out and
-- took every assertion after it with it. `none` returns to whichever role
-- connected, and that role bypasses policies in both environments: `ranza` is
-- the superuser locally, `postgres` carries BYPASSRLS on Supabase.
set local role none;
insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('6a333333-3333-4333-8333-333333333333',
   '63333333-3333-4333-8333-333333333333', 'front_desk', 'assigned_properties');
insert into public.property_assignments (property_id, organization_id, user_id)
values ('6b333333-3333-4333-8333-333333333333',
        '6a333333-3333-4333-8333-333333333333',
        '63333333-3333-4333-8333-333333333333');
set local role ranza_app;
select app.set_request_context('65555555-5555-4555-8555-555555555555');

-- SP-S1-21. The whole reason the commercial gate is written against the
-- resulting status rather than the statement: blocking a revoke because an
-- invoice is unpaid turns a billing problem into a security incident.
select lives_ok(
  $$update public.organization_memberships
       set status = 'revoked', revoked_at = now(), updated_at = now()
     where organization_id = '6a333333-3333-4333-8333-333333333333'
       and user_id = '63333333-3333-4333-8333-333333333333'$$,
  'a lapsed Subscription still revokes');

select lives_ok(
  $$update public.property_assignments
       set status = 'revoked', revoked_at = now(), updated_at = now()
     where organization_id = '6a333333-3333-4333-8333-333333333333'
       and user_id = '63333333-3333-4333-8333-333333333333'$$,
  'a lapsed Subscription still takes a Property away');

-- And the other direction of the same policy: putting somebody back is a
-- reach change, so it is gated like every other one.
select throws_ok(
  $$update public.organization_memberships
       set status = 'active', revoked_at = null, updated_at = now()
     where organization_id = '6a333333-3333-4333-8333-333333333333'
       and user_id = '63333333-3333-4333-8333-333333333333'$$,
  '42501', NULL,
  'a lapsed Subscription cannot undo a revoke');

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------

select app.set_request_context('61111111-1111-4111-8111-111111111111');

select lives_ok(
  $$insert into public.staff_invitations
      (organization_id, user_id, token_hash, expires_at, invited_by)
    values ('6a111111-1111-4111-8111-111111111111',
            '64444444-4444-4444-8444-444444444444', 'digest-one',
            now() + interval '7 days',
            '61111111-1111-4111-8111-111111111111')$$,
  'an administrator writes an invitation');

-- SP-S1-16: several over time, at most one of them live.
select throws_ok(
  $$insert into public.staff_invitations
      (organization_id, user_id, token_hash, expires_at, invited_by)
    values ('6a111111-1111-4111-8111-111111111111',
            '64444444-4444-4444-8444-444444444444', 'digest-two',
            now() + interval '7 days',
            '61111111-1111-4111-8111-111111111111')$$,
  '23505', NULL,
  'a membership has at most one pending invitation');

-- The token is the authentication, so accepting runs without a request context
-- and reaches exactly the rows that digest names. A digest nobody holds is not
-- an error, it is no rows.
--
-- The context is cleared here rather than merely described. These three
-- assertions used to inherit whichever context the assertions above left set —
-- an administrator's — while claiming to run without one, and passed because
-- nothing looked. 20260916002800 made the claim load-bearing: with a context
-- set, the caller must be the invitee, and the administrator is not. The test
-- now runs the path the product runs.
select set_config('app.user_id', '', true);

select is_empty(
  $$select * from app.accept_staff_invitation('digest-nobody-holds')$$,
  'an unknown invitation token accepts nothing');

select is(
  (select user_id from app.accept_staff_invitation('digest-one')),
  '64444444-4444-4444-8444-444444444444'::uuid,
  'a live invitation token names the membership it belongs to');

select is_empty(
  $$select * from app.accept_staff_invitation('digest-one')$$,
  'an invitation is accepted once');

-- ---------------------------------------------------------------------------
-- The catalogue, and the fifth gate (slice 2)
-- ---------------------------------------------------------------------------

select app.set_request_context('61111111-1111-4111-8111-111111111111');

-- A role is a set drawn from the catalogue. Without this a permission is free
-- text, and a typo in a role editor is a role that silently grants nothing.
--
-- As the owner, because the trigger is what is under test and slice 1 granted
-- `ranza_app` no UPDATE on this table at all — writing a role is slice 3. A
-- refusal from a missing grant would look identical and prove nothing.
set local role none;
select throws_ok(
  $$update public.staff_roles
       set permissions = array['front_desk.book', 'front_desk.refund_everything']
     where scope_id = '6a222222-2222-4222-8222-222222222222'
       and key = 'night_manager'$$,
  '23514', NULL,
  'a role cannot hold a permission the catalogue does not have');
set local role ranza_app;
select app.set_request_context('61111111-1111-4111-8111-111111111111');

-- Ranza ships the catalogue. An Organization composing a role reads it and
-- never adds to it: a permission is a command that exists in a release.
select throws_ok(
  $$insert into public.staff_permissions (key, module_key)
    values ('front_desk.invent', 'front_office')$$,
  '42501', NULL,
  'an Organization cannot invent a permission');

-- SP-S2-02. Everything else about this Staff Member is open: the Subscription
-- is active, the Organization is entitled to Front Office, the Property has a
-- front desk, and they reach every Property in the Organization. The only thing
-- missing is that taking a booking is not their job — and the answer comes from
-- the database rather than from a screen declining to draw a button.
select app.set_request_context('66666666-6666-4666-8666-666666666666');

select ok(
  app.can_use_capability(
    '6b111111-1111-4111-8111-111111111111', 'front_office', 'front_desk'),
  'all four of blueprint 3.5''s gates are open for this Staff Member');

select throws_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_id, stay_type, starts_on, ends_on)
    values ('6a111111-1111-4111-8111-111111111111',
            '6b111111-1111-4111-8111-111111111111',
            '6c111111-1111-4111-8111-111111111111',
            '6d111111-1111-4111-8111-111111111111', 'guest',
            current_date + 1, current_date + 3)$$,
  '42501', NULL,
  'and the fifth refuses anyway: taking a booking is not their job');

-- The same row, from somebody whose job it is. The gate is a permission and not
-- a mood: nothing else about these two differs.
select app.set_request_context('63333333-3333-4333-8333-333333333333');

select lives_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_id, stay_type, starts_on, ends_on)
    values ('6a111111-1111-4111-8111-111111111111',
            '6b111111-1111-4111-8111-111111111111',
            '6c111111-1111-4111-8111-111111111111',
            '6d111111-1111-4111-8111-111111111111', 'guest',
            current_date + 1, current_date + 3)$$,
  'a front desk takes the same booking');

-- ---------------------------------------------------------------------------
-- An Organization defines its own roles (slice 3)
-- ---------------------------------------------------------------------------

select app.set_request_context('61111111-1111-4111-8111-111111111111');

select lives_ok(
  $$insert into public.staff_roles
      (scope_id, key, organization_id, name, permissions, status)
    values ('6a111111-1111-4111-8111-111111111111', 'night_desk',
            '6a111111-1111-4111-8111-111111111111', 'Night desk',
            array['front_desk.check_in'], 'active')$$,
  'an Owner defines a role of their Organization''s own');

-- SP-S3-05 and SP-S3-06 need no clause of their own: a role Ranza ships has no
-- Organization, and every write policy requires one the actor reaches.
select throws_ok(
  $$insert into public.staff_roles
      (scope_id, key, organization_id, name, permissions)
    values ('00000000-0000-0000-0000-000000000000', 'concierge',
            null, 'Concierge', '{}')$$,
  '42501', NULL,
  'nobody adds to the roles Ranza ships');

select lives_ok(
  $$update public.staff_roles set name = 'Night reception', updated_at = now()
     where scope_id = '6a111111-1111-4111-8111-111111111111'
       and key = 'night_desk'$$,
  'and may rename their own');

-- A grant, not a policy. The update policy would admit this row happily — same
-- Organization before and after — and changing the key would silently repoint
-- every membership holding it, because a membership names a role by key.
select throws_ok(
  $$update public.staff_roles set key = 'night_desk_2'
     where scope_id = '6a111111-1111-4111-8111-111111111111'
       and key = 'night_desk'$$,
  '42501', NULL,
  'a role''s key cannot be changed out from under the memberships holding it');

-- SP-S3-01. The Front desk Staff Member holds staff.define_roles nowhere, so
-- the author here is the Owner — who holds the whole catalogue — and the test
-- is the other direction: a role whose author lacks one of the permissions in
-- it. Housekeeping holds nothing, which is the cleanest version of that.
set local role none;
update public.staff_roles
   set permissions = array['staff.define_roles', 'front_desk.check_in']
 where organization_id is null and key = 'housekeeping';
set local role ranza_app;
select app.set_request_context('66666666-6666-4666-8666-666666666666');

select lives_ok(
  $$insert into public.staff_roles
      (scope_id, key, organization_id, name, permissions)
    values ('6a111111-1111-4111-8111-111111111111', 'linen_lead',
            '6a111111-1111-4111-8111-111111111111', 'Linen lead',
            array['front_desk.check_in'])$$,
  'an author may define a role from the permissions they hold');

select throws_ok(
  $$insert into public.staff_roles
      (scope_id, key, organization_id, name, permissions)
    values ('6a111111-1111-4111-8111-111111111111', 'shadow_owner',
            '6a111111-1111-4111-8111-111111111111', 'Shadow owner',
            array['staff.administer'])$$,
  '42501', NULL,
  'and may not grant a permission their own role lacks');

-- SP-S3-02. Somebody holds it, so retiring is refused — and the refusal is the
-- point: moving them automatically would decide their permissions for them.
select app.set_request_context('61111111-1111-4111-8111-111111111111');

set local role none;
update public.organization_memberships
   set role = 'night_desk',
       role_scope_id = '6a111111-1111-4111-8111-111111111111'
 where organization_id = '6a111111-1111-4111-8111-111111111111'
   and user_id = '63333333-3333-4333-8333-333333333333';
set local role ranza_app;
select app.set_request_context('61111111-1111-4111-8111-111111111111');

select throws_ok(
  $$update public.staff_roles set status = 'retired', updated_at = now()
     where scope_id = '6a111111-1111-4111-8111-111111111111'
       and key = 'night_desk'$$,
  '55000', NULL,
  'a role somebody holds cannot be retired');

select lives_ok(
  $$update public.staff_roles set status = 'retired', updated_at = now()
     where scope_id = '6a111111-1111-4111-8111-111111111111'
       and key = 'linen_lead'$$,
  'a role nobody holds is retired, and stays');

-- SP-S3-11 in the direction that matters: while it is retired, nobody may be
-- moved onto it. The row is still there, because it is the record of what
-- somebody used to be able to do.
select throws_ok(
  $$update public.organization_memberships
       set role = 'linen_lead',
           role_scope_id = '6a111111-1111-4111-8111-111111111111',
           updated_at = now()
     where organization_id = '6a111111-1111-4111-8111-111111111111'
       and user_id = '66666666-6666-4666-8666-666666666666'$$,
  '55000', NULL,
  'a retired role cannot be taken up again while it is retired');

-- ---------------------------------------------------------------------------
-- A definer asks the gates itself
-- ---------------------------------------------------------------------------
-- app.identify_staff_user was security definer, granted to ranza_app, and
-- checked nothing. It answered whether an address already had an account and
-- wrote a public.users row when it did not, both before the membership policy
-- ever spoke. These assert the fix from the catalogue and from behaviour, not
-- from the migration file.
--
-- Read from pg_proc rather than asked with has_function_privilege, which raises
-- on an absent function and would take the rest of this transaction with it.
--
-- oidvectortypes and not pg_get_function_identity_arguments: the latter carries
-- the parameter NAMES, so `= 'text'` never matched anything and the first
-- assertion reported 0 whether or not the old function was still there. It was
-- passing for a reason that had nothing to do with its name. Found by watching
-- assertion 51 fail on a database where the new function plainly existed.

select is(
  (select count(*)::int from pg_proc as p
     join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname = 'identify_staff_user'
      and oidvectortypes(p.proargtypes) = 'text'),
  0,
  'the version that took an address and asked nothing is gone, not shadowed');

select is(
  (select count(*)::int from pg_proc as p
     join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname = 'identify_staff_user'
      and oidvectortypes(p.proargtypes) = 'uuid, text'),
  1,
  'identifying an invitee now takes the Organization it is for');

-- Filtered by signature. Without that this returns a row per overload, and a
-- subquery returning two raises rather than fails — which aborts the
-- transaction and silences every assertion after it. Found by sabotage: adding
-- the old function back produced one red and then an ERROR that swallowed the
-- two behavioural assertions below.
select ok(
  (select p.prosecdef from pg_proc as p
     join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname = 'identify_staff_user'
      and oidvectortypes(p.proargtypes) = 'uuid, text'),
  'and is still security definer, which is why it has to ask');

set local role ranza_app;

-- Front desk. Holds no staff.administer, so the definer must refuse before it
-- either reveals whether the address is known or writes a row for it.
select app.set_request_context('63333333-3333-4333-8333-333333333333');

select throws_ok(
  $$select app.identify_staff_user(
      '6a111111-1111-4111-8111-111111111111',
      'oracle-probe@example.test')$$,
  '42501', NULL,
  'somebody without staff.administer is refused before the address is looked up');

-- The refusal is a raise, and a raise in plpgsql aborts before the select and
-- the insert below it, so the assertion above is also the assertion that
-- nothing was written.
--
-- There WAS a `count(*) from public.users` here saying so separately. It was
-- inert: public.users carries FORCE row-level security and
-- users_read_self_and_colleagues hides a brand-new row with no membership from
-- every role this suite can adopt, so it read 0 whether or not the row existed.
-- Found by removing the caller check and watching 53 go red while it stayed
-- green. Replaced by the case that actually distinguishes a refusal from a
-- function that refuses everybody.

select app.set_request_context('61111111-1111-4111-8111-111111111111');

select isnt(
  (select app.identify_staff_user(
     '6a111111-1111-4111-8111-111111111111',
     'a-real-invitee@example.test')),
  NULL,
  'and an owner, who does hold it, gets an id back');

reset role;

-- ---------------------------------------------------------------------------
-- A definer that writes checks its caller — the other two (SP-S1-33, SP-S4-03)
-- ---------------------------------------------------------------------------
-- IG-12's sweep found these the moment chore/insert-grants merged:
-- app.end_sessions_for() and app.accept_staff_invitation() both write and
-- neither asked anything about who was calling. 20260916002700 fixed
-- app.identify_staff_user() and left these two. This is the rest of that rule.

-- Somebody this Organization has never had. Not one of the fixtures above:
-- by this point in the suite the invitation assertions have given owner B a
-- membership in Organization A, because SP-S1-01 writes it active at invite
-- time — so reusing them would have asserted nothing.
insert into public.users (id, email) values
  ('6e111111-1111-4111-8111-111111111111', 'staff-stranger@example.test');

insert into public.staff_invitations
  (id, organization_id, user_id, token_hash, status, expires_at, invited_by)
values
  ('6d111111-1111-4111-8111-111111111111',
   '6a111111-1111-4111-8111-111111111111',
   '63333333-3333-4333-8333-333333333333',
   'invitation-hash-one', 'pending', now() + interval '7 days',
   '61111111-1111-4111-8111-111111111111'),
  ('6d222222-2222-4222-8222-222222222222',
   '6a111111-1111-4111-8111-111111111111',
   '66666666-6666-4666-8666-666666666666',
   'invitation-hash-two', 'pending', now() + interval '7 days',
   '61111111-1111-4111-8111-111111111111');

-- app.end_sessions_for() is granted to ranza_worker alone, and that narrow
-- grant was the whole boundary. The check it can actually make is the worker
-- context: app.set_worker_context() is executable by ranza_worker and nobody
-- else, so a caller without one has not come through the dispatcher.
--
-- The membership half reads every status on purpose. A reach change is very
-- often a revocation, and requiring 'active' would make this stop applying in
-- exactly the case it exists for.

set local role ranza_worker;

select throws_ok(
  $$select app.end_sessions_for('63333333-3333-4333-8333-333333333333')$$,
  '42501', NULL,
  'ending somebody''s sessions outside a worker job is refused');

select app.set_worker_context('6a111111-1111-4111-8111-111111111111',
                              'staff.endSessionsOnReachChange');

select lives_ok(
  $$select app.end_sessions_for('63333333-3333-4333-8333-333333333333')$$,
  'and inside one, for somebody that Organization has, it runs');

select throws_ok(
  $$select app.end_sessions_for('6e111111-1111-4111-8111-111111111111')$$,
  '42501', NULL,
  'but not for somebody that Organization does not have, which is the whole '
  'risk of a uuid parameter on a definer');

select set_config('app.worker_organization_id', '', true);
select set_config('app.worker_job', '', true);
reset role;

-- app.accept_staff_invitation() is the weaker of the two and is written as
-- what it is. Accepting grants nothing: the membership is written active at
-- invite time (SP-S1-01) and acceptance only records that it happened
-- (SP-S1-07), so no hole closes here. What it adds is a tripwire. The flow
-- deliberately runs with no request context, and if one is ever set it must be
-- the invitee's.

set local role ranza_app;

select app.set_request_context('61111111-1111-4111-8111-111111111111');

select throws_ok(
  $$select * from app.accept_staff_invitation('invitation-hash-one')$$,
  '42501', NULL,
  'a signed-in caller cannot accept an invitation that is not theirs');

select app.set_request_context('63333333-3333-4333-8333-333333333333');

select lives_ok(
  $$select * from app.accept_staff_invitation('invitation-hash-one')$$,
  'the invitee themselves may, if they happen to be signed in');

-- And the arm the product actually uses. A guard that refused this would be
-- worse than the absence it replaced, so it is asserted rather than assumed:
-- a second invitation, no context at all, accepted.
select set_config('app.user_id', '', true);

select is(
  (select (app.accept_staff_invitation('invitation-hash-two')).user_id),
  '66666666-6666-4666-8666-666666666666'::uuid,
  'and with no context at all, which is how sign-up calls it, it still works');

reset role;

select finish();
rollback;
