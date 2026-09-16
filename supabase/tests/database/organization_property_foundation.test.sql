begin;
select plan(14);

-- ---------------------------------------------------------------------------
-- Fixtures: two Organizations that must never see each other.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email)
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
   '22222222-2222-4222-8222-222222222222', 'staff', 'assigned_properties'),
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

select * from finish();
rollback;
