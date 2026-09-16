-- The Resident access path: a second way into the same tables (ADR 0008).
--
-- A Resident holds no organization_membership and no property_assignment, so
-- every policy written before this one denies them. These assertions pin down
-- exactly which rows the new policies open and, just as importantly, which they
-- leave shut — the Portal must never expose staff controls (blueprint 4.3).
--
-- The Staff direction over the same tables is covered by
-- accommodation_units.test.sql and organization_property_foundation.test.sql.
begin;
select plan(27);

insert into public.users (id, email) values
  ('d1111111-1111-4111-8111-111111111111', 'resident-one@example.test'),
  ('d2222222-2222-4222-8222-222222222222', 'resident-two@example.test'),
  ('d3333333-3333-4333-8333-333333333333', 'resident-three@example.test'),
  ('d4444444-4444-4444-8444-444444444444', 'resident-four@example.test'),
  ('e1111111-1111-4111-8111-111111111111', 'staff-one@example.test');

insert into public.organizations (id, name, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Organization A', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Organization B', 'active');

insert into public.properties (id, organization_id, name) values
  ('a1111111-1111-4111-8111-111111111111',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Property A1'),
  ('b1111111-1111-4111-8111-111111111111',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Property B1');

insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity) values
  ('c1111111-1111-4111-8111-111111111111',
   'a1111111-1111-4111-8111-111111111111',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A1-101', 'room', 2),
  ('c2222222-2222-4222-8222-222222222222',
   'a1111111-1111-4111-8111-111111111111',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A1-102', 'bed', 1),
  ('c3333333-3333-4333-8333-333333333333',
   'b1111111-1111-4111-8111-111111111111',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B1-201', 'suite', 4);

insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'e1111111-1111-4111-8111-111111111111', 'manager', 'organization_wide');

insert into public.subscriptions (organization_id, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'active');

insert into public.entitlements (organization_id, module_key) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'front_office'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'front_office');

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('a1111111-1111-4111-8111-111111111111',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'portal_stay_overview', true),
  ('b1111111-1111-4111-8111-111111111111',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'portal_stay_overview', true);

insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, user_id,
   stay_type, status, starts_on, ends_on) values
  ('f1111111-1111-4111-8111-111111111111',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'a1111111-1111-4111-8111-111111111111',
   'c1111111-1111-4111-8111-111111111111',
   'd1111111-1111-4111-8111-111111111111',
   'resident', 'in_house', date '2026-09-01', null),
  ('f2222222-2222-4222-8222-222222222222',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'a1111111-1111-4111-8111-111111111111',
   'c2222222-2222-4222-8222-222222222222',
   'd2222222-2222-4222-8222-222222222222',
   'resident', 'in_house', date '2026-09-05', null),
  ('f3333333-3333-4333-8333-333333333333',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'b1111111-1111-4111-8111-111111111111',
   'c3333333-3333-4333-8333-333333333333',
   'd3333333-3333-4333-8333-333333333333',
   'guest', 'reserved', date '2026-10-01', date '2026-10-04'),
  ('f4444444-4444-4444-8444-444444444444',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'a1111111-1111-4111-8111-111111111111',
   'c1111111-1111-4111-8111-111111111111',
   'd4444444-4444-4444-8444-444444444444',
   'guest', 'departed', date '2026-08-01', date '2026-08-04');

set local role ranza_app;

select is_empty('select id from public.stays',
  'without request context no Stay is visible');
select is_empty('select id from public.accommodation_units',
  'without request context no Accommodation Unit is visible');

select app.set_request_context('d1111111-1111-4111-8111-111111111111');

select set_eq(
  'select id::text from public.stays',
  array['f1111111-1111-4111-8111-111111111111'],
  'a Resident sees their own Stay and no other');
select is_empty(
  $$select id from public.stays
    where id = 'f2222222-2222-4222-8222-222222222222'$$,
  'another Resident''s Stay is invisible even when addressed directly');
select is_empty(
  $$select id from public.stays
    where id = 'f3333333-3333-4333-8333-333333333333'$$,
  'a Stay in another Organization is invisible even when addressed directly');
select set_eq('select name from public.properties', array['Property A1'],
  'a Resident reaches only the Property of their own Stay');
select set_eq('select name from public.accommodation_units', array['A1-101'],
  'a Resident reaches only the Accommodation Unit of their own Stay');
select is_empty('select id from public.organizations',
  'a Resident reaches no Organization');
select is_empty('select id from public.organization_memberships',
  'a Resident cannot read organization_memberships');
select is_empty('select id from public.property_assignments',
  'a Resident cannot read property_assignments');
select is_empty('select id from public.entitlements',
  'a Resident cannot read entitlements');
select is_empty('select id from public.subscriptions',
  'a Resident cannot read subscriptions');
select is_empty('select id from public.property_capabilities',
  'a Resident cannot read property_capabilities');

select ok(app.resident_can_use_capability(
    'a1111111-1111-4111-8111-111111111111',
    'front_office', 'portal_stay_overview'),
  'every gate open allows the Resident capability');
select ok(not app.resident_can_use_capability(
    'a1111111-1111-4111-8111-111111111111',
    'guest_services', 'portal_stay_overview'),
  'gate 2 denies a module the Organization is not entitled to');
select ok(not app.resident_can_use_capability(
    'a1111111-1111-4111-8111-111111111111',
    'front_office', 'portal_meal_choices'),
  'gate 3 denies a capability the Property has not enabled');
select ok(not app.resident_can_use_capability(
    'b1111111-1111-4111-8111-111111111111',
    'front_office', 'portal_stay_overview'),
  'gate 4 denies a Property the Resident has no Stay in');
select ok(not app.can_use_capability(
    'a1111111-1111-4111-8111-111111111111',
    'front_office', 'portal_stay_overview'),
  'the Staff gate stays shut for a Resident: a Stay is not a membership');

select app.set_request_context('d4444444-4444-4444-8444-444444444444');

select set_eq(
  'select id::text from public.stays',
  array['f4444444-4444-4444-8444-444444444444'],
  'a departed Resident still sees their own Stay record');
select is_empty('select id from public.properties',
  'a departed Stay reaches no Property');
select is_empty('select id from public.accommodation_units',
  'a departed Stay reaches no Accommodation Unit');
select ok(not app.resident_can_use_capability(
    'a1111111-1111-4111-8111-111111111111',
    'front_office', 'portal_stay_overview'),
  'a departed Stay opens no Resident capability');

select app.set_request_context('e1111111-1111-4111-8111-111111111111');

select set_eq(
  'select id::text from public.stays order by id',
  array['f1111111-1111-4111-8111-111111111111',
        'f2222222-2222-4222-8222-222222222222',
        'f4444444-4444-4444-8444-444444444444'],
  'a Staff Member sees every Stay in a Property they reach');
select set_eq(
  'select name from public.accommodation_units',
  array['A1-101', 'A1-102'],
  'a Staff Member sees every Accommodation Unit in a Property they reach');
select ok(not app.resident_can_use_capability(
    'a1111111-1111-4111-8111-111111111111',
    'front_office', 'portal_stay_overview'),
  'the Resident gate stays shut for a Staff Member: a membership is not a Stay');
select ok(app.can_use_capability(
    'a1111111-1111-4111-8111-111111111111',
    'front_office', 'portal_stay_overview'),
  'the Staff gate still opens after gates 1-3 were extracted');

reset role;

update public.subscriptions set status = 'suspended'
where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

set local role ranza_app;
select app.set_request_context('d1111111-1111-4111-8111-111111111111');
select ok(not app.resident_can_use_capability(
    'a1111111-1111-4111-8111-111111111111',
    'front_office', 'portal_stay_overview'),
  'gate 1 denies the Resident when the Subscription is suspended');
reset role;

select * from finish();
rollback;
