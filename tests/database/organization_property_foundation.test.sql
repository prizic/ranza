begin;
select plan(35);

-- ---------------------------------------------------------------------------
-- Fixtures: two Organizations that must never see each other.
-- ---------------------------------------------------------------------------
insert into public.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'owner-a@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'staff-a@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'owner-b@example.test');

insert into public.organizations (id, name, status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Organization A', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Organization B', 'active');

insert into public.properties (id, organization_id, name)
values
  ('a1111111-1111-4111-8111-111111111111',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Property A1'),
  ('a2222222-2222-4222-8222-222222222222',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Property A2'),
  ('b1111111-1111-4111-8111-111111111111',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Property B1');

-- Owner A reaches every Property; Staff A only assigned ones.
insert into public.organization_memberships
  (organization_id, user_id, role, access_scope)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', 'owner', 'organization_wide'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '22222222-2222-4222-8222-222222222222', 'front_desk', 'assigned_properties'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   '33333333-3333-4333-8333-333333333333', 'owner', 'organization_wide');

insert into public.property_assignments
  (property_id, organization_id, user_id)
values
  ('a1111111-1111-4111-8111-111111111111',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '22222222-2222-4222-8222-222222222222');

insert into public.subscriptions (organization_id, status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'active');

insert into public.entitlements (organization_id, module_key)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'guest_services');

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled)
values
  ('a1111111-1111-4111-8111-111111111111',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'announcements', true);

insert into public.auth_identities (user_id, issuer, subject)
values
  ('11111111-1111-4111-8111-111111111111', 'better-auth', 'ba_owner_a'),
  ('22222222-2222-4222-8222-222222222222', 'better-auth', 'ba_staff_a'),
  ('33333333-3333-4333-8333-333333333333', 'better-auth', 'ba_owner_b');

-- ---------------------------------------------------------------------------
-- Gate 5: row-level security, evaluated as the runtime role.
-- ---------------------------------------------------------------------------
set local role ranza_app;

-- No request context: null must deny rather than bypass.
select is_empty(
  'select id from public.properties',
  'without request context no Property is visible'
);
select is_empty(
  'select id from public.organizations',
  'without request context no Organization is visible'
);

select app.set_request_context('11111111-1111-4111-8111-111111111111');

-- Widened when Staff and permissions arrived: a roster is a list of people, and
-- users_read_self could show a Staff Member only themselves. Reach is still the
-- Organization — Owner B shares none, and is absent rather than hidden.
select set_eq(
  'select email from public.users',
  array['owner-a@example.test', 'staff-a@example.test'],
  'a user sees themselves and the colleagues they share an Organization with'
);
select set_eq(
  'select subject from public.auth_identities',
  array['ba_owner_a'],
  'a user sees only their own provider identities'
);

select set_eq(
  'select name from public.properties',
  array['Property A1', 'Property A2'],
  'an organization_wide owner sees every Property in their Organization'
);
select is_empty(
  $$select id from public.properties
    where id = 'b1111111-1111-4111-8111-111111111111'$$,
  'another Organization''s Property is invisible even when addressed directly'
);
select set_eq(
  'select name from public.organizations',
  array['Organization A'],
  'an owner sees only their own Organization'
);

select app.set_request_context('22222222-2222-4222-8222-222222222222');

select set_eq(
  'select name from public.properties',
  array['Property A1'],
  'assigned_properties staff see only their assigned Property'
);

select app.set_request_context('33333333-3333-4333-8333-333333333333');

select set_eq(
  'select name from public.properties',
  array['Property B1'],
  'Organization B sees only its own Property'
);

-- ---------------------------------------------------------------------------
-- Gates 1-4: each must deny on its own.
-- ---------------------------------------------------------------------------
select app.set_request_context('11111111-1111-4111-8111-111111111111');

select ok(
  app.can_use_capability(
    'a1111111-1111-4111-8111-111111111111', 'guest_services', 'announcements'),
  'all five gates open allows the capability'
);

select ok(
  not app.can_use_capability(
    'a1111111-1111-4111-8111-111111111111', 'guest_services', 'housekeeping'),
  'gate 3 denies a capability that is not enabled for the Property'
);

select ok(
  not app.can_use_capability(
    'a1111111-1111-4111-8111-111111111111', 'food_and_beverage', 'announcements'),
  'gate 2 denies a module the Organization is not entitled to'
);

select ok(
  not app.can_use_capability(
    'a2222222-2222-4222-8222-222222222222', 'guest_services', 'announcements'),
  'gate 3 denies a Property with no capability row'
);

select app.set_request_context('22222222-2222-4222-8222-222222222222');
select ok(
  not app.can_use_capability(
    'a2222222-2222-4222-8222-222222222222', 'guest_services', 'announcements'),
  'gate 4 denies a Property the Staff Member is not assigned to'
);

select app.set_request_context('33333333-3333-4333-8333-333333333333');
select ok(
  not app.can_use_capability(
    'a1111111-1111-4111-8111-111111111111', 'guest_services', 'announcements'),
  'gate 4 denies across Organizations'
);

reset role;

-- Gate 1 in isolation: suspend the Subscription, leave every other gate open.
update public.subscriptions set status = 'suspended'
where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

set local role ranza_app;
select app.set_request_context('11111111-1111-4111-8111-111111111111');
select ok(
  not app.can_use_capability(
    'a1111111-1111-4111-8111-111111111111', 'guest_services', 'announcements'),
  'gate 1 denies when the Subscription is suspended'
);
reset role;

-- ---------------------------------------------------------------------------
-- Which Subscription statuses admit (OA-S1-14, ADR 0040)
-- ---------------------------------------------------------------------------
-- Each of the five, asserted by name. past_due is the grace period: it admits,
-- and the Control Plane ends it by moving the Subscription to suspended.
-- Trialing had no assertion of its own before this — only the column default.
update public.subscriptions set status = 'trialing'
where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role ranza_app;
select app.set_request_context('11111111-1111-4111-8111-111111111111');
select ok(
  app.can_use_capability(
    'a1111111-1111-4111-8111-111111111111', 'guest_services', 'announcements'),
  'gate 1 admits a trialing Subscription');
reset role;

update public.subscriptions set status = 'active'
where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role ranza_app;
select app.set_request_context('11111111-1111-4111-8111-111111111111');
select ok(
  app.can_use_capability(
    'a1111111-1111-4111-8111-111111111111', 'guest_services', 'announcements'),
  'gate 1 admits an active Subscription');
reset role;

update public.subscriptions set status = 'past_due'
where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role ranza_app;
select app.set_request_context('11111111-1111-4111-8111-111111111111');
select ok(
  app.can_use_capability(
    'a1111111-1111-4111-8111-111111111111', 'guest_services', 'announcements'),
  'gate 1 admits a past_due Subscription: it is the grace period');
-- The three-gate helper the worker's writers call directly gives the same
-- answer, because it is the same statement.
select ok(
  app.capability_is_available(
    'a1111111-1111-4111-8111-111111111111', 'guest_services', 'announcements'),
  'and so does the three-gate helper the worker''s writers call');
reset role;

update public.subscriptions set status = 'suspended'
where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role ranza_app;
select app.set_request_context('11111111-1111-4111-8111-111111111111');
select ok(
  not app.can_use_capability(
    'a1111111-1111-4111-8111-111111111111', 'guest_services', 'announcements'),
  'gate 1 denies a suspended Subscription: the grace period is over');
reset role;

update public.subscriptions set status = 'cancelled'
where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role ranza_app;
select app.set_request_context('11111111-1111-4111-8111-111111111111');
select ok(
  not app.can_use_capability(
    'a1111111-1111-4111-8111-111111111111', 'guest_services', 'announcements'),
  'gate 1 denies a cancelled Subscription');
reset role;

update public.subscriptions set status = 'active'
where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

-- ---------------------------------------------------------------------------
-- An archived Property is out of everybody's reach (OA-S1-16, ADR 0040)
-- ---------------------------------------------------------------------------
-- Property A2 gets a front desk, a Unit, a booking and a Stay, so that the only
-- thing that changes between the two halves below is the archive. Owner A is
-- organization_wide: if anybody kept reach over an archived Property, it would
-- be them.
insert into public.entitlements (organization_id, module_key)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'front_office');
insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled)
values
  ('a2222222-2222-4222-8222-222222222222',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'front_desk', true);
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity)
values
  ('a2d11111-1111-4111-8111-111111111111', 'a2222222-2222-4222-8222-222222222222',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A2-101', 'room', 2),
  ('a2d22222-2222-4222-8222-222222222222', 'a2222222-2222-4222-8222-222222222222',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A2-102', 'room', 2);
insert into public.guests (id, organization_id, full_name)
values
  ('a2e11111-1111-4111-8111-111111111111',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Archived Guest');
insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id,
   stay_type, status, starts_on, ends_on)
values
  ('a2f11111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'a2222222-2222-4222-8222-222222222222', 'a2d11111-1111-4111-8111-111111111111',
   'a2e11111-1111-4111-8111-111111111111', 'guest', 'checked_in',
   app.property_today('a2222222-2222-4222-8222-222222222222'),
   app.property_today('a2222222-2222-4222-8222-222222222222') + 2);
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, reservation_id,
   stay_type, status, starts_on, ends_on)
values
  ('a2a11111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'a2222222-2222-4222-8222-222222222222', 'a2d11111-1111-4111-8111-111111111111',
   'a2f11111-1111-4111-8111-111111111111', 'guest', 'in_house',
   app.property_today('a2222222-2222-4222-8222-222222222222'),
   app.property_today('a2222222-2222-4222-8222-222222222222') + 2);

-- The control: while A2 is active the Owner reads all three and can book there.
-- Without it the refusals below would be satisfied by fixtures nobody reaches.
set local role ranza_app;
select app.set_request_context('11111111-1111-4111-8111-111111111111');
select is(
  (select count(*)::int from public.properties
    where id = 'a2222222-2222-4222-8222-222222222222')
  + (select count(*)::int from public.reservations
      where property_id = 'a2222222-2222-4222-8222-222222222222')
  + (select count(*)::int from public.stays
      where property_id = 'a2222222-2222-4222-8222-222222222222'),
  3,
  'an active Property''s record, booking and Stay are in the Owner''s reach');
select lives_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id, guest_id,
       stay_type, status, starts_on, ends_on)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a2222222-2222-4222-8222-222222222222',
            'a2d22222-2222-4222-8222-222222222222', 'a2e11111-1111-4111-8111-111111111111',
            'guest', 'confirmed',
            app.property_today('a2222222-2222-4222-8222-222222222222') + 10,
            app.property_today('a2222222-2222-4222-8222-222222222222') + 12)$$,
  'and the Owner can take a booking there');
reset role;

-- Rows the acting Staff Member changed by extending A2's Stay. A refusal is
-- returned as -1 rather than raised, so that if the archive stopped hiding the
-- row this assertion fails on its own instead of aborting every one after it.
create function pg_temp.stays_extended_at_archived_property() returns int
language plpgsql as $$
declare changed int;
begin
  update public.stays set ends_on = ends_on + 1
   where id = 'a2a11111-1111-4111-8111-111111111111';
  get diagnostics changed = row_count;
  return changed;
exception when insufficient_privilege then
  return -1;
end $$;

update public.properties set status = 'archived'
where id = 'a2222222-2222-4222-8222-222222222222';

set local role ranza_app;
select app.set_request_context('11111111-1111-4111-8111-111111111111');
select is_empty(
  $$select id from public.properties
     where id = 'a2222222-2222-4222-8222-222222222222'$$,
  'an archived Property is out of an organization_wide Owner''s reach');
select is_empty(
  $$select id from public.reservations
     where property_id = 'a2222222-2222-4222-8222-222222222222'$$,
  'and so are its bookings');
select is_empty(
  $$select id from public.stays
     where property_id = 'a2222222-2222-4222-8222-222222222222'$$,
  'and its Stays');
select throws_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id, guest_id,
       stay_type, status, starts_on, ends_on)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a2222222-2222-4222-8222-222222222222',
            'a2d22222-2222-4222-8222-222222222222', 'a2e11111-1111-4111-8111-111111111111',
            'guest', 'confirmed',
            app.property_today('a2222222-2222-4222-8222-222222222222') + 20,
            app.property_today('a2222222-2222-4222-8222-222222222222') + 22)$$,
  '42501', NULL,
  'the Owner cannot take a booking at an archived Property');
select is(
  pg_temp.stays_extended_at_archived_property(), 0,
  'nor change a Stay there: the row is not in reach to be updated');
select ok(
  not app.can_use_capability(
    'a2222222-2222-4222-8222-222222222222', 'front_office', 'front_desk'),
  'and no capability is available there, whatever the Property turned on');
reset role;

-- ---------------------------------------------------------------------------
-- A Staff Member of two Organizations (OA-S1-19)
-- ---------------------------------------------------------------------------
-- Front desk at A, assigned to A1 only; Owner at B, organization_wide. Reach is
-- the union of the two memberships, and neither widens the other: being
-- organization_wide at B does not make A2 visible.
insert into public.users (id, email)
values ('44444444-4444-4444-8444-444444444444', 'two-organizations@example.test');
insert into public.organization_memberships
  (organization_id, user_id, role, access_scope)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '44444444-4444-4444-8444-444444444444', 'front_desk', 'assigned_properties'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   '44444444-4444-4444-8444-444444444444', 'owner', 'organization_wide');
insert into public.property_assignments (property_id, organization_id, user_id)
values
  ('a1111111-1111-4111-8111-111111111111',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '44444444-4444-4444-8444-444444444444');
update public.properties set status = 'active'
where id = 'a2222222-2222-4222-8222-222222222222';
insert into public.entitlements (organization_id, module_key)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'guest_services');
insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled)
values
  ('b1111111-1111-4111-8111-111111111111',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'announcements', true);

set local role ranza_app;
select app.set_request_context('44444444-4444-4444-8444-444444444444');
select set_eq(
  'select name from public.properties',
  array['Property A1', 'Property B1'],
  'a Staff Member of two Organizations reads the union of both memberships');
select set_eq(
  'select name from public.organizations',
  array['Organization A', 'Organization B'],
  'and both Organizations');
select ok(
  app.can_use_capability(
    'a1111111-1111-4111-8111-111111111111', 'guest_services', 'announcements')
  and app.can_use_capability(
    'b1111111-1111-4111-8111-111111111111', 'guest_services', 'announcements'),
  'each Property''s capability is available while both Subscriptions are paid');
reset role;

-- B lapses. Each Property is gated by its own Organization's Subscription, so
-- B1 drops out and A1 does not.
update public.subscriptions set status = 'suspended'
where organization_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

set local role ranza_app;
select app.set_request_context('44444444-4444-4444-8444-444444444444');
select ok(
  not app.can_use_capability(
    'b1111111-1111-4111-8111-111111111111', 'guest_services', 'announcements'),
  'when B''s Subscription lapses, B''s Property drops out of capability reads');
select ok(
  app.can_use_capability(
    'a1111111-1111-4111-8111-111111111111', 'guest_services', 'announcements'),
  'while A''s stays, because nothing about B gates A');
reset role;

select * from finish();
rollback;
