-- A Resident gets the Portal by invitation (RANZ-87, GP-S2-*, GP-S3-*, ADR 0060).
--
-- Four claims:
--
--   the table     a link is stored as a digest and nothing else, the runtime
--                 role cannot read the digest or write the table, and the
--                 indexes allow one live link per Guest and one Guest per
--                 account within an Organization.
--
--   the desk      only a holder of guests.invite_to_portal, at a Property that
--                 has the Portal on, invites or withdraws; a new link withdraws
--                 the old; a Guest with a login is not invited again; each act
--                 is audited without the token, the digest or an address.
--
--   the accept    a link works once, for an account that is signed in, and
--                 gives exactly that Guest's own Stays in their Organization to
--                 that account; used, withdrawn, expired and unknown links are
--                 told apart; an account belongs to one Guest of an Organization.
--
--   the follow    a Stay made after acceptance has the Guest's login already.
--
-- Rows in docs/features/guest-portal/edge-cases.csv are named beside the
-- assertion that proves them. Each break below was applied inside a rolled-back
-- transaction, the altered object printed first, and the named assertions seen
-- red (the break list is in the commit that added this file).
begin;
select plan(62);

insert into public.users (id, email) values
  ('ea111111-1111-4111-8111-111111111111', 'gpi-manager@example.test'),
  ('ea222222-2222-4222-8222-222222222222', 'gpi-desk@example.test'),
  ('ea333333-3333-4333-8333-333333333333', 'gpi-housekeeper@example.test'),
  ('ea444444-4444-4444-8444-444444444444', 'gpi-outsider@example.test'),
  ('ea555555-5555-4555-8555-555555555555', 'gpi-booker@example.test'),
  ('ea666666-6666-4666-8666-666666666666', 'gpi-no-portal-manager@example.test'),
  ('ea777777-7777-4777-8777-777777777777', 'gpi-no-desk-manager@example.test'),
  ('eaa00000-0000-4000-8000-000000000001', 'gpi-student-one@example.test'),
  ('eaa00000-0000-4000-8000-000000000002', 'gpi-student-two@example.test'),
  ('eaa00000-0000-4000-8000-000000000003', 'gpi-student-three@example.test');

insert into public.organizations (id, name, status) values
  ('eaa11111-1111-4111-8111-111111111111', 'Portal Organization', 'active'),
  ('eaa22222-2222-4222-8222-222222222222', 'Other Portal Organization', 'active'),
  ('eaa33333-3333-4333-8333-333333333333', 'Portal Off Organization', 'active'),
  ('eaa44444-4444-4444-8444-444444444444', 'No Desk Organization', 'active');

insert into public.properties (id, organization_id, name) values
  ('eab11111-1111-4111-8111-111111111111',
   'eaa11111-1111-4111-8111-111111111111', 'Portal Yurt'),
  ('eab22222-2222-4222-8222-222222222222',
   'eaa22222-2222-4222-8222-222222222222', 'Other Portal Yurt'),
  ('eab33333-3333-4333-8333-333333333333',
   'eaa33333-3333-4333-8333-333333333333', 'Portal Off Yurt'),
  ('eab44444-4444-4444-8444-444444444444',
   'eaa44444-4444-4444-8444-444444444444', 'No Desk Yurt');

-- A role an Organization wrote that may take a booking and nothing else: what
-- makes the permission, and not the name of a role, the thing asked.
insert into public.staff_roles
  (scope_id, key, organization_id, name, permissions) values
  ('eaa11111-1111-4111-8111-111111111111', 'booker',
   'eaa11111-1111-4111-8111-111111111111', 'Booker',
   array['front_desk.book']);

insert into public.organization_memberships
  (organization_id, user_id, role, role_scope_id, access_scope) values
  ('eaa11111-1111-4111-8111-111111111111', 'ea111111-1111-4111-8111-111111111111',
   'manager', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('eaa11111-1111-4111-8111-111111111111', 'ea222222-2222-4222-8222-222222222222',
   'front_desk', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('eaa11111-1111-4111-8111-111111111111', 'ea333333-3333-4333-8333-333333333333',
   'housekeeping', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('eaa22222-2222-4222-8222-222222222222', 'ea444444-4444-4444-8444-444444444444',
   'manager', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('eaa11111-1111-4111-8111-111111111111', 'ea555555-5555-4555-8555-555555555555',
   'booker', 'eaa11111-1111-4111-8111-111111111111', 'organization_wide'),
  ('eaa33333-3333-4333-8333-333333333333', 'ea666666-6666-4666-8666-666666666666',
   'manager', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('eaa44444-4444-4444-8444-444444444444', 'ea777777-7777-4777-8777-777777777777',
   'manager', '00000000-0000-0000-0000-000000000000', 'organization_wide');

insert into public.subscriptions (organization_id, status) values
  ('eaa11111-1111-4111-8111-111111111111', 'active'),
  ('eaa22222-2222-4222-8222-222222222222', 'active'),
  ('eaa33333-3333-4333-8333-333333333333', 'active'),
  ('eaa44444-4444-4444-8444-444444444444', 'active');

insert into public.entitlements (organization_id, module_key) values
  ('eaa11111-1111-4111-8111-111111111111', 'front_office'),
  ('eaa22222-2222-4222-8222-222222222222', 'front_office'),
  ('eaa33333-3333-4333-8333-333333333333', 'front_office'),
  ('eaa44444-4444-4444-8444-444444444444', 'front_office');

-- The third Organization has a front desk and no Portal; the fourth a Portal and
-- no front desk.
insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('eab11111-1111-4111-8111-111111111111',
   'eaa11111-1111-4111-8111-111111111111', 'front_desk', true),
  ('eab11111-1111-4111-8111-111111111111',
   'eaa11111-1111-4111-8111-111111111111', 'portal_stay_overview', true),
  ('eab22222-2222-4222-8222-222222222222',
   'eaa22222-2222-4222-8222-222222222222', 'front_desk', true),
  ('eab22222-2222-4222-8222-222222222222',
   'eaa22222-2222-4222-8222-222222222222', 'portal_stay_overview', true),
  ('eab33333-3333-4333-8333-333333333333',
   'eaa33333-3333-4333-8333-333333333333', 'front_desk', true),
  ('eab44444-4444-4444-8444-444444444444',
   'eaa44444-4444-4444-8444-444444444444', 'portal_stay_overview', true);

-- Two rooms let by the bed, a room let whole, and a room in the other
-- Organization.
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity) values
  ('eac00000-0000-4000-8000-000000000001', 'eab11111-1111-4111-8111-111111111111',
   'eaa11111-1111-4111-8111-111111111111', 'P-101', 'room', 3),
  ('eac00000-0000-4000-8000-000000000002', 'eab11111-1111-4111-8111-111111111111',
   'eaa11111-1111-4111-8111-111111111111', 'P-102', 'room', 2),
  ('eac00000-0000-4000-8000-000000000003', 'eab11111-1111-4111-8111-111111111111',
   'eaa11111-1111-4111-8111-111111111111', 'P-103', 'room', 1),
  ('eac00000-0000-4000-8000-000000000004', 'eab22222-2222-4222-8222-222222222222',
   'eaa22222-2222-4222-8222-222222222222', 'Q-101', 'room', 1);

insert into public.accommodation_units
  (id, property_id, organization_id, parent_id, parent_unit_type, name,
   unit_type, capacity) values
  ('eac00000-0000-4000-8000-000000000011', 'eab11111-1111-4111-8111-111111111111',
   'eaa11111-1111-4111-8111-111111111111', 'eac00000-0000-4000-8000-000000000001',
   'room', 'A', 'bed', 1),
  ('eac00000-0000-4000-8000-000000000012', 'eab11111-1111-4111-8111-111111111111',
   'eaa11111-1111-4111-8111-111111111111', 'eac00000-0000-4000-8000-000000000001',
   'room', 'B', 'bed', 1),
  ('eac00000-0000-4000-8000-000000000013', 'eab11111-1111-4111-8111-111111111111',
   'eaa11111-1111-4111-8111-111111111111', 'eac00000-0000-4000-8000-000000000001',
   'room', 'C', 'bed', 1),
  ('eac00000-0000-4000-8000-000000000021', 'eab11111-1111-4111-8111-111111111111',
   'eaa11111-1111-4111-8111-111111111111', 'eac00000-0000-4000-8000-000000000002',
   'room', 'A', 'bed', 1),
  ('eac00000-0000-4000-8000-000000000022', 'eab11111-1111-4111-8111-111111111111',
   'eaa11111-1111-4111-8111-111111111111', 'eac00000-0000-4000-8000-000000000002',
   'room', 'B', 'bed', 1);

insert into public.guests (id, organization_id, full_name) values
  ('ead00000-0000-4000-8000-000000000001',
   'eaa11111-1111-4111-8111-111111111111', 'Zeynep Öğrenci'),
  ('ead00000-0000-4000-8000-000000000002',
   'eaa11111-1111-4111-8111-111111111111', 'Can Öğrenci'),
  ('ead00000-0000-4000-8000-000000000003',
   'eaa22222-2222-4222-8222-222222222222', 'Another Organization''s Guest'),
  ('ead00000-0000-4000-8000-000000000004',
   'eaa33333-3333-4333-8333-333333333333', 'A Guest of a Portal-less Organization'),
  ('ead00000-0000-4000-8000-000000000005',
   'eaa11111-1111-4111-8111-111111111111', 'Elif Öğrenci'),
  ('ead00000-0000-4000-8000-000000000006',
   'eaa44444-4444-4444-8444-444444444444', 'A Guest of a desk-less Organization');

create temporary table today as
  select app.property_today('eab11111-1111-4111-8111-111111111111') as day;

-- Zeynep (one): in house on a bed; a later booking with a Stay still reserved;
-- and a Stay withdrawn by an undone check-in, which is cancelled.
-- Can (two): in house on a bed; and two finished Stays that a hand already gave
-- to another account, so that "held by another account" is not the count of
-- Stays just linked.
-- A walk-in has a Stay and no booking, so no Guest.
insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id,
   stay_type, status, starts_on, ends_on)
select r.id, 'eaa11111-1111-4111-8111-111111111111',
       'eab11111-1111-4111-8111-111111111111', r.unit, r.guest,
       'resident', r.status, today.day + r.from_day, today.day + r.to_day
  from today, (values
    ('eae00000-0000-4000-8000-000000000001'::uuid, 'eac00000-0000-4000-8000-000000000011'::uuid,
     'ead00000-0000-4000-8000-000000000001'::uuid, 'checked_in', 0, 60),
    ('eae00000-0000-4000-8000-000000000002', 'eac00000-0000-4000-8000-000000000012',
     'ead00000-0000-4000-8000-000000000001', 'confirmed', 90, 150),
    ('eae00000-0000-4000-8000-000000000003', 'eac00000-0000-4000-8000-000000000021',
     'ead00000-0000-4000-8000-000000000001', 'confirmed', 0, 10),
    ('eae00000-0000-4000-8000-000000000004', 'eac00000-0000-4000-8000-000000000022',
     'ead00000-0000-4000-8000-000000000002', 'checked_in', 0, 60),
    ('eae00000-0000-4000-8000-000000000005', 'eac00000-0000-4000-8000-000000000013',
     'ead00000-0000-4000-8000-000000000002', 'checked_out', -100, -50),
    ('eae00000-0000-4000-8000-000000000011', 'eac00000-0000-4000-8000-000000000013',
     'ead00000-0000-4000-8000-000000000002', 'checked_out', -200, -150)
  ) as r(id, unit, guest, status, from_day, to_day);

insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, reservation_id,
   user_id, stay_type, status, starts_on, ends_on)
select s.id, 'eaa11111-1111-4111-8111-111111111111',
       'eab11111-1111-4111-8111-111111111111', s.unit, s.reservation, s.login,
       'resident', s.status, today.day + s.from_day, today.day + s.to_day
  from today, (values
    ('eaf00000-0000-4000-8000-000000000001'::uuid, 'eac00000-0000-4000-8000-000000000011'::uuid,
     'eae00000-0000-4000-8000-000000000001'::uuid, null::uuid, 'in_house', 0, 60),
    ('eaf00000-0000-4000-8000-000000000002', 'eac00000-0000-4000-8000-000000000012',
     'eae00000-0000-4000-8000-000000000002', null, 'reserved', 90, 150),
    ('eaf00000-0000-4000-8000-000000000003', 'eac00000-0000-4000-8000-000000000021',
     'eae00000-0000-4000-8000-000000000003', null, 'cancelled', 0, 10),
    ('eaf00000-0000-4000-8000-000000000004', 'eac00000-0000-4000-8000-000000000022',
     'eae00000-0000-4000-8000-000000000004', null, 'in_house', 0, 60),
    ('eaf00000-0000-4000-8000-000000000005', 'eac00000-0000-4000-8000-000000000013',
     'eae00000-0000-4000-8000-000000000005', 'eaa00000-0000-4000-8000-000000000003', 'departed', -100, -50),
    ('eaf00000-0000-4000-8000-000000000010', 'eac00000-0000-4000-8000-000000000013',
     'eae00000-0000-4000-8000-000000000011', 'eaa00000-0000-4000-8000-000000000003', 'departed', -200, -150),
    ('eaf00000-0000-4000-8000-000000000006', 'eac00000-0000-4000-8000-000000000003',
     null, null, 'in_house', 0, 60)
  ) as s(id, unit, reservation, login, status, from_day, to_day);

-- A Guest of the other Organization with a Stay of their own.
insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id,
   stay_type, status, starts_on, ends_on)
select 'eae00000-0000-4000-8000-000000000006',
       'eaa22222-2222-4222-8222-222222222222',
       'eab22222-2222-4222-8222-222222222222',
       'eac00000-0000-4000-8000-000000000004',
       'ead00000-0000-4000-8000-000000000003',
       'resident', 'checked_in', day, day + 60
  from today;
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, reservation_id,
   stay_type, status, starts_on, ends_on)
select 'eaf00000-0000-4000-8000-000000000007',
       'eaa22222-2222-4222-8222-222222222222',
       'eab22222-2222-4222-8222-222222222222',
       'eac00000-0000-4000-8000-000000000004',
       'eae00000-0000-4000-8000-000000000006',
       'resident', 'in_house', day, day + 60
  from today;

-- ---------------------------------------------------------------------------
-- A permission of its own
-- ---------------------------------------------------------------------------

select is(
  (select module_key from public.staff_permissions
    where key = 'guests.invite_to_portal'),
  'front_office',
  'GP-S2-01: guests.invite_to_portal is in the catalogue');

select results_eq(
  $$ select key from public.staff_roles
      where organization_id is null
        and 'guests.invite_to_portal' = any (permissions)
      order by key $$,
  $$ values ('front_desk'::text), ('manager'), ('owner') $$,
  'GP-S2-01: the shipped Owner, Manager and Front desk hold it, and nobody else');

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.guest_portal_invitations
       (organization_id, guest_id, token_hash, expires_at, invited_by)
     values ('eaa11111-1111-4111-8111-111111111111',
             'ead00000-0000-4000-8000-000000000005',
             'a-plain-token-and-not-a-digest', now() + interval '14 days',
             'ea222222-2222-4222-8222-222222222222') $$,
  '23514', null,
  'GP-S2-03: only a digest can be stored, so a token cannot be');

select is_empty(
  $$ select column_name from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'guest_portal_invitations'
        and grantee = 'ranza_app' and column_name = 'token_hash' $$,
  'GP-S2-03: the runtime role is granted no way to read the digest');

select is_empty(
  $$ select privilege_type from information_schema.table_privileges
      where table_schema = 'public' and table_name = 'guest_portal_invitations'
        and grantee = 'ranza_app' and privilege_type <> 'SELECT' $$,
  'GP-S2-03: nor to write the table, which the functions alone do');

select ok(
  (select relforcerowsecurity from pg_catalog.pg_class
    where oid = 'public.guest_portal_invitations'::regclass),
  'GP-S2-10: the table forces its policies on its owner too');

select throws_ok(
  $$ insert into public.guest_portal_invitations
       (organization_id, guest_id, token_hash, status, expires_at, invited_by,
        accepted_at)
     values ('eaa11111-1111-4111-8111-111111111111',
             'ead00000-0000-4000-8000-000000000005',
             repeat('a', 64), 'accepted', now() + interval '1 day',
             'ea222222-2222-4222-8222-222222222222', now()) $$,
  '23514', null,
  'GP-S3-03: a link cannot be marked used by nobody');

select lives_ok(
  $$ insert into public.guest_portal_invitations
       (organization_id, guest_id, token_hash, expires_at, invited_by)
     values ('eaa11111-1111-4111-8111-111111111111',
             'ead00000-0000-4000-8000-000000000005',
             repeat('b', 64), now() + interval '1 day',
             'ea222222-2222-4222-8222-222222222222') $$,
  'GP-S2-05: a Guest has a live link');

select throws_ok(
  $$ insert into public.guest_portal_invitations
       (organization_id, guest_id, token_hash, expires_at, invited_by)
     values ('eaa11111-1111-4111-8111-111111111111',
             'ead00000-0000-4000-8000-000000000005',
             repeat('c', 64), now() + interval '1 day',
             'ea222222-2222-4222-8222-222222222222') $$,
  '23505', null,
  'GP-S2-05: and cannot have a second, whoever writes it');

delete from public.guest_portal_invitations
 where guest_id = 'ead00000-0000-4000-8000-000000000005';

select lives_ok(
  $$ insert into public.guest_portal_invitations
       (organization_id, guest_id, token_hash, status, expires_at, invited_by,
        accepted_by, accepted_at)
     values ('eaa11111-1111-4111-8111-111111111111',
             'ead00000-0000-4000-8000-000000000005',
             repeat('d', 64), 'accepted', now() + interval '1 day',
             'ea222222-2222-4222-8222-222222222222',
             'eaa00000-0000-4000-8000-000000000003', now()) $$,
  'GP-S3-07: an account is linked to a Guest');

select throws_ok(
  $$ insert into public.guest_portal_invitations
       (organization_id, guest_id, token_hash, status, expires_at, invited_by,
        accepted_by, accepted_at)
     values ('eaa11111-1111-4111-8111-111111111111',
             'ead00000-0000-4000-8000-000000000002',
             repeat('e', 64), 'accepted', now() + interval '1 day',
             'ea222222-2222-4222-8222-222222222222',
             'eaa00000-0000-4000-8000-000000000003', now()) $$,
  '23505', null,
  'GP-S3-07: and to no second Guest of the Organization, whatever the function says');

select throws_ok(
  $$ insert into public.guest_portal_invitations
       (organization_id, guest_id, token_hash, status, expires_at, invited_by,
        accepted_by, accepted_at)
     values ('eaa11111-1111-4111-8111-111111111111',
             'ead00000-0000-4000-8000-000000000005',
             repeat('f', 64), 'accepted', now() + interval '1 day',
             'ea222222-2222-4222-8222-222222222222',
             'eaa00000-0000-4000-8000-000000000002', now()) $$,
  '23505', null,
  'GP-S3-07: nor a Guest to two accounts, whatever the function says');

delete from public.guest_portal_invitations
 where guest_id = 'ead00000-0000-4000-8000-000000000005';

-- ---------------------------------------------------------------------------
-- The desk
-- ---------------------------------------------------------------------------

set local role ranza_app;

select app.set_request_context('ea222222-2222-4222-8222-222222222222');
select ok(
  app.may_invite_to_portal('ead00000-0000-4000-8000-000000000001'),
  'GP-S2-02: a front desk may invite a Guest of their Organization');

select lives_ok(
  $$ select app.invite_guest_to_portal(
       'ead00000-0000-4000-8000-000000000001', repeat('1', 64)) $$,
  'GP-S2-02: and does');

select is(
  (select count(*)::int from public.guest_portal_invitations
    where guest_id = 'ead00000-0000-4000-8000-000000000001'
      and status = 'pending'
      and expires_at - created_at = interval '14 days'),
  1, 'GP-S2-04: the link lasts fourteen days, set by the database');

select throws_ok(
  $$ select app.invite_guest_to_portal(
       'ead00000-0000-4000-8000-000000000001', 'plain-token') $$,
  '23514', null,
  'GP-S2-03: the function refuses a token that is not a digest');

select lives_ok(
  $$ select app.invite_guest_to_portal(
       'ead00000-0000-4000-8000-000000000001', repeat('2', 64)) $$,
  'GP-S2-05: a new invitation is made');

select is(
  (select count(*)::int from public.guest_portal_invitations
    where guest_id = 'ead00000-0000-4000-8000-000000000001'
      and status = 'revoked' and revoked_by = 'ea222222-2222-4222-8222-222222222222'),
  1, 'GP-S2-05: and withdraws the one before it in the same statement');

select is(
  (select count(*)::int from public.guest_portal_invitations
    where guest_id = 'ead00000-0000-4000-8000-000000000001'
      and status = 'pending'),
  1, 'GP-S2-05: so only one link is live');

select app.set_request_context('ea333333-3333-4333-8333-333333333333');
select throws_ok(
  $$ select app.invite_guest_to_portal(
       'ead00000-0000-4000-8000-000000000002', repeat('3', 64)) $$,
  '42501', null, 'GP-S2-02: a housekeeper may not invite');
select throws_ok(
  $$ select app.withdraw_portal_invitation('ead00000-0000-4000-8000-000000000001') $$,
  '42501', null, 'GP-S2-06: nor withdraw');

select app.set_request_context('ea555555-5555-4555-8555-555555555555');
select throws_ok(
  $$ select app.invite_guest_to_portal(
       'ead00000-0000-4000-8000-000000000002', repeat('3', 64)) $$,
  '42501', null,
  'GP-S2-02: a role that may book but lacks the permission may not');

select app.set_request_context('ea444444-4444-4444-8444-444444444444');
select throws_ok(
  $$ select app.invite_guest_to_portal(
       'ead00000-0000-4000-8000-000000000001', repeat('3', 64)) $$,
  '42501', null,
  'GP-S2-02: a manager of another Organization may not invite its Guest');

select app.set_request_context('ea666666-6666-4666-8666-666666666666');
select throws_ok(
  $$ select app.invite_guest_to_portal(
       'ead00000-0000-4000-8000-000000000004', repeat('3', 64)) $$,
  '42501', null,
  'GP-S2-09: nobody invites at an Organization whose Portal is off');

select app.set_request_context('ea777777-7777-4777-8777-777777777777');
select throws_ok(
  $$ select app.invite_guest_to_portal(
       'ead00000-0000-4000-8000-000000000006', repeat('3', 64)) $$,
  '42501', null,
  'GP-S2-09: nor where the Portal is on and the front desk is not');

select app.set_request_context('ea111111-1111-4111-8111-111111111111');
select throws_ok(
  $$ select app.invite_guest_to_portal(
       'ead00000-0000-4000-8000-0000000000ff', repeat('3', 64)) $$,
  '42501', null, 'GP-S2-02: a Guest who does not exist is the same refusal');

select is(
  (select count(*)::int from public.guest_portal_invitations),
  2, 'GP-S2-10: a manager reads the Organization''s invitations');

select app.set_request_context('ea333333-3333-4333-8333-333333333333');
select is(
  (select count(*)::int from public.guest_portal_invitations),
  0, 'GP-S2-10: a housekeeper reads none, which says who has a login');

select app.set_request_context('ea444444-4444-4444-8444-444444444444');
select is(
  (select count(*)::int from public.guest_portal_invitations),
  0, 'GP-S2-10: nor does another Organization''s manager');

-- Can (two) is invited, and the link is withdrawn by hand.
select app.set_request_context('ea222222-2222-4222-8222-222222222222');
select lives_ok(
  $$ select app.invite_guest_to_portal(
       'ead00000-0000-4000-8000-000000000002', repeat('4', 64)) $$,
  'GP-S2-02: Can is invited');

select isnt(
  (select app.withdraw_portal_invitation('ead00000-0000-4000-8000-000000000002')),
  null, 'GP-S2-06: the desk withdraws the live link and is told which');

select is(
  (select app.withdraw_portal_invitation('ead00000-0000-4000-8000-000000000002')),
  null, 'GP-S2-06: withdrawing again finds nothing to withdraw');

select lives_ok(
  $$ select app.invite_guest_to_portal(
       'ead00000-0000-4000-8000-000000000002', repeat('5', 64)) $$,
  'GP-S2-02: and Can is invited again');

-- ---------------------------------------------------------------------------
-- The audit
-- ---------------------------------------------------------------------------

set local role none;

select is(
  (select count(*)::int from audit.records
    where action = 'guest.portal_invited'
      and actor_id = 'ea222222-2222-4222-8222-222222222222'
      and subject_type = 'guest'
      and organization_id = 'eaa11111-1111-4111-8111-111111111111'),
  4, 'GP-S2-08: each invitation is audited, as the desk, naming the Guest');

select is(
  (select count(*)::int from audit.records
    where action = 'guest.portal_invitation_withdrawn'
      and subject_id = 'ead00000-0000-4000-8000-000000000002'),
  1, 'GP-S2-08: and the withdrawal');

select is_empty(
  $$ select 1 from audit.records
      where action like 'guest.portal_%'
        and (context::text ~* '(token|digest|hash|@|name)'
             or context::text ~ '[0-9a-f]{64}') $$,
  'GP-S2-08: no record carries a token, a digest, an address or a name');

-- ---------------------------------------------------------------------------
-- The student opens the link
-- ---------------------------------------------------------------------------

set local role ranza_app;

select set_config('app.user_id', '', true);
select throws_ok(
  $$ select app.accept_portal_invitation(repeat('2', 64)) $$,
  '42501', null, 'GP-S3-09: nobody accepts without being signed in');

select results_eq(
  $$ select state, organization_name, guest_name from app.portal_invitation_state(repeat('2', 64)) $$,
  $$ values ('pending'::text, 'Portal Organization'::text, 'Zeynep Öğrenci'::text) $$,
  'GP-S3-11: the holder of a link, not signed in, is told its state and whose it is');

select is_empty(
  $$ select 1 from app.portal_invitation_state(repeat('9', 64)) $$,
  'GP-S3-11: and a digest that matches nothing is told nothing');

select app.set_request_context('eaa00000-0000-4000-8000-000000000001');
select results_eq(
  $$ select outcome, linked_stays from app.accept_portal_invitation(repeat('9', 64)) $$,
  $$ values ('unknown'::text, 0) $$,
  'GP-S3-06: a link that never existed is unknown');

select results_eq(
  $$ select outcome, linked_stays from app.accept_portal_invitation(repeat('1', 64)) $$,
  $$ values ('revoked'::text, 0) $$,
  'GP-S3-05: a link that was replaced is withdrawn');

select results_eq(
  $$ select outcome, linked_stays from app.accept_portal_invitation(repeat('2', 64)) $$,
  $$ values ('accepted'::text, 2) $$,
  'GP-S3-01: the live link is accepted and links the Guest''s two current Stays');

set local role none;

select results_eq(
  $$ select id::text, user_id::text from public.stays
      where reservation_id in (
        select id from public.reservations
         where guest_id = 'ead00000-0000-4000-8000-000000000001')
        and user_id is not null
      order by id $$,
  $$ values ('eaf00000-0000-4000-8000-000000000001'::text, 'eaa00000-0000-4000-8000-000000000001'::text),
            ('eaf00000-0000-4000-8000-000000000002', 'eaa00000-0000-4000-8000-000000000001') $$,
  'GP-S3-01: the in-house Stay and the reserved one belong to the student');

select is(
  (select count(*)::int from public.stays
    where user_id is null
      and id in ('eaf00000-0000-4000-8000-000000000003',
                 'eaf00000-0000-4000-8000-000000000004',
                 'eaf00000-0000-4000-8000-000000000006',
                 'eaf00000-0000-4000-8000-000000000007')),
  4, 'GP-S3-01: a withdrawn check-in, another Guest''s Stay, a walk-in and another Organization''s Stay are nobody''s');

set local role ranza_app;

select app.set_request_context('eaa00000-0000-4000-8000-000000000002');
select results_eq(
  $$ select outcome from app.accept_portal_invitation(repeat('2', 64)) $$,
  $$ values ('used'::text) $$,
  'GP-S3-03: a link works once, for anybody after');

select results_eq(
  $$ select outcome from app.accept_portal_invitation(repeat('4', 64)) $$,
  $$ values ('revoked'::text) $$,
  'GP-S3-05: a link the desk withdrew by hand is withdrawn');

set local role none;
update public.guest_portal_invitations
   set created_at = now() - interval '20 days',
       expires_at = now() - interval '6 days'
 where token_hash = repeat('5', 64);
set local role ranza_app;

select app.set_request_context('eaa00000-0000-4000-8000-000000000002');
select results_eq(
  $$ select outcome from app.accept_portal_invitation(repeat('5', 64)) $$,
  $$ values ('expired'::text) $$,
  'GP-S3-04: a link whose fourteen days are over is expired');

select results_eq(
  $$ select state from app.portal_invitation_state(repeat('5', 64)) $$,
  $$ values ('expired'::text) $$,
  'GP-S3-04: and is read as expired by the page, with nothing having run');

set local role none;
select is(
  (select count(*)::int from public.stays
    where id in ('eaf00000-0000-4000-8000-000000000004',
                 'eaf00000-0000-4000-8000-000000000005')
      and user_id = 'eaa00000-0000-4000-8000-000000000002'),
  0, 'GP-S3-04: an expired link gave nothing to anyone');

-- A new link for Can, accepted by the student who is already Zeynep's.
set local role ranza_app;
select app.set_request_context('ea222222-2222-4222-8222-222222222222');
select lives_ok(
  $$ select app.invite_guest_to_portal(
       'ead00000-0000-4000-8000-000000000002', repeat('6', 64)) $$,
  'GP-S2-05: Can is invited a third time');

select app.set_request_context('eaa00000-0000-4000-8000-000000000001');
select results_eq(
  $$ select outcome, linked_stays from app.accept_portal_invitation(repeat('6', 64)) $$,
  $$ values ('another_guest'::text, 0) $$,
  'GP-S3-07: an account that is one Guest of the Organization cannot be a second');

select app.set_request_context('ea222222-2222-4222-8222-222222222222');
select throws_ok(
  $$ select app.invite_guest_to_portal(
       'ead00000-0000-4000-8000-000000000001', repeat('7', 64)) $$,
  '55000', null,
  'GP-S2-07: a Guest who has a login is not invited again');

select app.set_request_context('eaa00000-0000-4000-8000-000000000002');
select results_eq(
  $$ select outcome, linked_stays from app.accept_portal_invitation(repeat('6', 64)) $$,
  $$ values ('accepted'::text, 1) $$,
  'GP-S3-08: Can''s own student accepts and takes the one Stay nobody holds');

set local role none;

select results_eq(
  $$ select id::text, user_id::text from public.stays
      where id in ('eaf00000-0000-4000-8000-000000000004',
                   'eaf00000-0000-4000-8000-000000000005')
      order by id $$,
  $$ values ('eaf00000-0000-4000-8000-000000000004'::text, 'eaa00000-0000-4000-8000-000000000002'::text),
            ('eaf00000-0000-4000-8000-000000000005', 'eaa00000-0000-4000-8000-000000000003') $$,
  'GP-S3-08: a Stay that already names another account is left with it');

select results_eq(
  $$ select (context ->> 'linkedStays')::int, (context ->> 'heldByAnotherAccount')::int
       from audit.records
      where action = 'guest.portal_invitation_accepted'
        and subject_id = 'ead00000-0000-4000-8000-000000000002' $$,
  $$ values (1, 2) $$,
  'GP-S3-10: the audit record counts the Stays linked and the Stays left with another account');

select is(
  (select actor_id::text from audit.records
    where action = 'guest.portal_invitation_accepted'
      and subject_id = 'ead00000-0000-4000-8000-000000000002'),
  'eaa00000-0000-4000-8000-000000000002',
  'GP-S3-10: the actor of an acceptance is the student');

-- ---------------------------------------------------------------------------
-- A Stay made later follows its Guest
-- ---------------------------------------------------------------------------

insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id,
   stay_type, status, starts_on, ends_on)
select 'eae00000-0000-4000-8000-000000000008',
       'eaa11111-1111-4111-8111-111111111111',
       'eab11111-1111-4111-8111-111111111111',
       'eac00000-0000-4000-8000-000000000021',
       'ead00000-0000-4000-8000-000000000001',
       'resident', 'confirmed', day + 200, day + 260
  from today;

select lives_ok(
  $$ insert into public.stays
       (id, organization_id, property_id, accommodation_unit_id, reservation_id,
        stay_type, status, starts_on, ends_on)
     select 'eaf00000-0000-4000-8000-000000000008',
            'eaa11111-1111-4111-8111-111111111111',
            'eab11111-1111-4111-8111-111111111111',
            'eac00000-0000-4000-8000-000000000021',
            'eae00000-0000-4000-8000-000000000008',
            'resident', 'reserved', day + 200, day + 260
       from today $$,
  'GP-S3-02: a Stay is made for a Guest who already accepted');

select is(
  (select user_id::text from public.stays
    where id = 'eaf00000-0000-4000-8000-000000000008'),
  'eaa00000-0000-4000-8000-000000000001',
  'GP-S3-02: and has the student''s login from the moment it exists');

insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id,
   stay_type, status, starts_on, ends_on)
select 'eae00000-0000-4000-8000-000000000012',
       'eaa11111-1111-4111-8111-111111111111',
       'eab11111-1111-4111-8111-111111111111',
       'eac00000-0000-4000-8000-000000000021',
       'ead00000-0000-4000-8000-000000000001',
       'resident', 'confirmed', day + 500, day + 560
  from today;

insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, reservation_id,
   stay_type, status, starts_on, ends_on)
select 'eaf00000-0000-4000-8000-000000000012',
       'eaa11111-1111-4111-8111-111111111111',
       'eab11111-1111-4111-8111-111111111111',
       'eac00000-0000-4000-8000-000000000021',
       'eae00000-0000-4000-8000-000000000012',
       'resident', 'cancelled', day + 500, day + 560
  from today;

select is(
  (select user_id::text from public.stays
    where id = 'eaf00000-0000-4000-8000-000000000012'),
  null, 'GP-S3-02: a Stay that is already withdrawn is not given the login');

insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id,
   stay_type, status, starts_on, ends_on)
select 'eae00000-0000-4000-8000-000000000009',
       'eaa11111-1111-4111-8111-111111111111',
       'eab11111-1111-4111-8111-111111111111',
       'eac00000-0000-4000-8000-000000000013',
       'ead00000-0000-4000-8000-000000000005',
       'resident', 'confirmed', day + 300, day + 360
  from today;

select lives_ok(
  $$ insert into public.stays
       (id, organization_id, property_id, accommodation_unit_id, reservation_id,
        stay_type, status, starts_on, ends_on)
     select 'eaf00000-0000-4000-8000-000000000009',
            'eaa11111-1111-4111-8111-111111111111',
            'eab11111-1111-4111-8111-111111111111',
            'eac00000-0000-4000-8000-000000000013',
            'eae00000-0000-4000-8000-000000000009',
            'resident', 'reserved', day + 300, day + 360
       from today $$,
  'GP-S3-02: a Stay is made for a Guest with no login');

select is(
  (select user_id::text from public.stays
    where id = 'eaf00000-0000-4000-8000-000000000009'),
  null, 'GP-S3-02: and has none');

insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id,
   stay_type, status, starts_on, ends_on)
select 'eae00000-0000-4000-8000-000000000010',
       'eaa11111-1111-4111-8111-111111111111',
       'eab11111-1111-4111-8111-111111111111',
       'eac00000-0000-4000-8000-000000000013',
       'ead00000-0000-4000-8000-000000000005',
       'resident', 'confirmed', day + 400, day + 460
  from today;

update public.stays
   set reservation_id = 'eae00000-0000-4000-8000-000000000010'
 where id = 'eaf00000-0000-4000-8000-000000000008';

select is(
  (select user_id::text from public.stays
    where id = 'eaf00000-0000-4000-8000-000000000008'),
  null,
  'GP-S3-02: a Stay moved to another Guest''s booking does not keep the first Guest''s login');

select * from finish();
rollback;
