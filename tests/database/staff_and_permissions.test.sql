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
select plan(35);

insert into public.users (id, email) values
  ('61111111-1111-4111-8111-111111111111', 'staff-owner-a@example.test'),
  ('62222222-2222-4222-8222-222222222222', 'staff-second-a@example.test'),
  ('63333333-3333-4333-8333-333333333333', 'staff-desk-a@example.test'),
  ('64444444-4444-4444-8444-444444444444', 'staff-owner-b@example.test'),
  ('65555555-5555-4555-8555-555555555555', 'staff-owner-lapsed@example.test');

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
   '65555555-5555-4555-8555-555555555555', 'owner', 'organization_wide');

-- Organization Lapsed has everything except a Subscription that is paid for.
insert into public.subscriptions (organization_id, status) values
  ('6a111111-1111-4111-8111-111111111111', 'active'),
  ('6a222222-2222-4222-8222-222222222222', 'active'),
  ('6a333333-3333-4333-8333-333333333333', 'past_due');

insert into public.entitlements (organization_id, module_key) values
  ('6a111111-1111-4111-8111-111111111111', 'platform_core'),
  ('6a222222-2222-4222-8222-222222222222', 'platform_core'),
  ('6a333333-3333-4333-8333-333333333333', 'platform_core');

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('6b111111-1111-4111-8111-111111111111',
   '6a111111-1111-4111-8111-111111111111', 'staff_administration', true),
  ('6b222222-2222-4222-8222-222222222222',
   '6a222222-2222-4222-8222-222222222222', 'staff_administration', true),
  ('6b333333-3333-4333-8333-333333333333',
   '6a333333-3333-4333-8333-333333333333', 'staff_administration', true);

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
        'staff-desk-a@example.test'],
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

set local role ranza;
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

select finish();
rollback;
