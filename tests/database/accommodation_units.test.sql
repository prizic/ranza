-- Accommodation Units: the invariants the table itself must hold, and who may
-- read a Unit through the Staff access path.
--
-- The Resident access path reaches the same table from a completely different
-- direction and is covered by resident_access_path.test.sql.
begin;
select plan(7);

insert into public.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'unit-owner-a@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'unit-staff-a@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'unit-owner-b@example.test');

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

insert into public.accommodation_units
  (property_id, organization_id, name, unit_type, capacity)
values
  ('a1111111-1111-4111-8111-111111111111',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A1-101', 'room', 2),
  ('a2222222-2222-4222-8222-222222222222',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A2-201', 'bed', 1),
  ('b1111111-1111-4111-8111-111111111111',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B1-301', 'suite', 4);

insert into public.organization_memberships
  (organization_id, user_id, role, access_scope)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', 'owner', 'organization_wide'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '22222222-2222-4222-8222-222222222222', 'staff', 'assigned_properties');

insert into public.property_assignments
  (property_id, organization_id, user_id)
values
  ('a1111111-1111-4111-8111-111111111111',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '22222222-2222-4222-8222-222222222222');

-- ---------------------------------------------------------------------------
-- Invariants of the table itself
-- ---------------------------------------------------------------------------

-- Blueprint 7.1: a Property-scoped row must be constrained to a Property that
-- belongs to its Organization. The composite foreign key is what makes the
-- mismatch unrepresentable rather than merely discouraged.
select throws_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, name, unit_type)
    values ('b1111111-1111-4111-8111-111111111111',
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Stolen', 'room')$$,
  '23503',
  null,
  'a Unit cannot be attached to another Organization''s Property'
);

select throws_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, name, unit_type)
    values ('a1111111-1111-4111-8111-111111111111',
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Odd', 'houseboat')$$,
  '23514',
  null,
  'an unsupported unit type is rejected'
);

select throws_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, name, unit_type, capacity)
    values ('a1111111-1111-4111-8111-111111111111',
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Empty', 'room', 0)$$,
  '23514',
  null,
  'a Unit that sleeps nobody is rejected'
);

-- ---------------------------------------------------------------------------
-- Gate 5, evaluated as the runtime role
-- ---------------------------------------------------------------------------
set local role ranza_app;

select is_empty(
  'select id from public.accommodation_units',
  'without request context no Accommodation Unit is visible'
);

select app.set_request_context('11111111-1111-4111-8111-111111111111');
select set_eq(
  'select name from public.accommodation_units',
  array['A1-101', 'A2-201'],
  'an organization_wide owner sees every Unit in their Organization'
);
select is_empty(
  $$select id from public.accommodation_units where name = 'B1-301'$$,
  'another Organization''s Unit is invisible even when addressed directly'
);

select app.set_request_context('22222222-2222-4222-8222-222222222222');
select set_eq(
  'select name from public.accommodation_units',
  array['A1-101'],
  'assigned_properties staff see Units only in their assigned Property'
);

reset role;

select * from finish();
rollback;
