-- A bed is a Unit under a room (ADR 0025).
--
-- Three claims, and they fail in different ways on purpose:
--
--   the shape      only a bed may have a parent and only a room may be one — and
--                  a bed need not have one at all, because a dormitory is beds
--                  without rooms (ADR 0004). A check constraint says the first
--                  half; the composite foreign key proves the second, because a
--                  check can only read the row it is on and the parent's type
--                  lives on another one.
--
--   sellability    a Unit is sellable when it has no children. Both halves are
--                  cross-row, so both are triggers: a booking may not name a
--                  Unit with children, and a Unit somebody is in may not be
--                  divided underneath them. The second is the one that is easy
--                  to forget, and without it the first is a rule you walk
--                  around by dividing the room after the booking.
--
--   naming         a room's name is unique in its Property and a bed's is
--                  unique in its room. `parent_id` is null for a room and null
--                  is not equal to null in a unique index, so the obvious
--                  three-column version stops constraining rooms entirely —
--                  which is why the room case is asserted here rather than
--                  assumed.
--
-- Every assertion below was checked by breaking the thing it asserts and
-- confirming it went red.
begin;
select plan(22);

insert into public.users (id, email) values
  ('51111111-1111-4111-8111-111111111111', 'unit-staff@example.test');

insert into public.organizations (id, name, status) values
  ('5a111111-1111-4111-8111-111111111111', 'Unit Organization', 'active'),
  ('5b111111-1111-4111-8111-111111111111', 'Unit Other Organization', 'active');

insert into public.properties (id, organization_id, name) values
  ('5c111111-1111-4111-8111-111111111111',
   '5a111111-1111-4111-8111-111111111111', 'Unit Property'),
  ('5c222222-2222-4222-8222-222222222222',
   '5b111111-1111-4111-8111-111111111111', 'Unit Other Property');

insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('5a111111-1111-4111-8111-111111111111',
   '51111111-1111-4111-8111-111111111111', 'manager', 'organization_wide');

insert into public.subscriptions (organization_id, status) values
  ('5a111111-1111-4111-8111-111111111111', 'active');
insert into public.entitlements (organization_id, module_key) values
  ('5a111111-1111-4111-8111-111111111111', 'front_office');
insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('5c111111-1111-4111-8111-111111111111',
   '5a111111-1111-4111-8111-111111111111', 'front_desk', true);

insert into public.guests (id, organization_id, full_name) values
  ('5e111111-1111-4111-8111-111111111111',
   '5a111111-1111-4111-8111-111111111111', 'Unit Guest');

-- A shared room that will be divided into beds, a whole room that will not,
-- one in another Organization, and two the booking assertions use.
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity, building, floor)
values
  ('5d111111-1111-4111-8111-111111111111',
   '5c111111-1111-4111-8111-111111111111',
   '5a111111-1111-4111-8111-111111111111', 'U-101', 'room', 4, 'Block A', 1),
  ('5d222222-2222-4222-8222-222222222222',
   '5c111111-1111-4111-8111-111111111111',
   '5a111111-1111-4111-8111-111111111111', 'U-102', 'room', 2, 'Block A', 1),
  ('5d333333-3333-4333-8333-333333333333',
   '5c222222-2222-4222-8222-222222222222',
   '5b111111-1111-4111-8111-111111111111', 'X-201', 'room', 2, null, null),
  ('5d444444-4444-4444-8444-444444444444',
   '5c111111-1111-4111-8111-111111111111',
   '5a111111-1111-4111-8111-111111111111', 'U-103', 'room', 2, null, 2),
  ('5d555555-5555-4555-8555-555555555555',
   '5c111111-1111-4111-8111-111111111111',
   '5a111111-1111-4111-8111-111111111111', 'U-104', 'room', 2, null, 2);

-- ---------------------------------------------------------------------------
-- The shape
-- ---------------------------------------------------------------------------

select lives_ok(
  $$insert into public.accommodation_units
      (id, property_id, organization_id, parent_id, parent_unit_type,
       name, unit_type, capacity)
    values ('5d1a1111-1111-4111-8111-111111111111',
            '5c111111-1111-4111-8111-111111111111',
            '5a111111-1111-4111-8111-111111111111',
            '5d111111-1111-4111-8111-111111111111', 'room',
            'A', 'bed', 1)$$,
  'a bed goes under a room');

select throws_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, parent_id, parent_unit_type,
       name, unit_type, capacity)
    values ('5c111111-1111-4111-8111-111111111111',
            '5a111111-1111-4111-8111-111111111111',
            '5d111111-1111-4111-8111-111111111111', 'room',
            'B', 'bed', 2)$$,
  '23514', NULL,
  'a bed sleeps one');

select throws_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, parent_id, parent_unit_type,
       name, unit_type)
    values ('5c111111-1111-4111-8111-111111111111',
            '5a111111-1111-4111-8111-111111111111',
            '5d111111-1111-4111-8111-111111111111', 'room',
            'U-105', 'room')$$,
  '23514', NULL,
  'only a bed may have a parent');

-- A bed may have a parent; it does not have to. A Property whose Units are beds
-- with no rooms above them is a dormitory, which ADR 0004 calls a configuration
-- rather than a different product. The first version of this constraint
-- required the room, and the accommodation_units suite caught it — it has had a
-- parentless bed in its fixtures since that table was written.
select lives_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, name, unit_type)
    values ('5c111111-1111-4111-8111-111111111111',
            '5a111111-1111-4111-8111-111111111111',
            'B', 'bed')$$,
  'a bed with no room above it is a dormitory, not an error');

-- Claiming the parent is a bed is refused by the check; claiming it is a room
-- when it is not is refused by the foreign key. Two different clauses, so two
-- assertions rather than one that would pass either way.
select throws_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, parent_id, parent_unit_type,
       name, unit_type)
    values ('5c111111-1111-4111-8111-111111111111',
            '5a111111-1111-4111-8111-111111111111',
            '5d1a1111-1111-4111-8111-111111111111', 'bed',
            'A2', 'bed')$$,
  '23514', NULL,
  'a bed cannot admit its parent is a bed');

select throws_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, parent_id, parent_unit_type,
       name, unit_type)
    values ('5c111111-1111-4111-8111-111111111111',
            '5a111111-1111-4111-8111-111111111111',
            '5d1a1111-1111-4111-8111-111111111111', 'room',
            'A3', 'bed')$$,
  '23503', NULL,
  'and cannot claim a bed is a room: the foreign key reads the parent''s own type');

select throws_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, parent_id, parent_unit_type,
       name, unit_type)
    values ('5c111111-1111-4111-8111-111111111111',
            '5a111111-1111-4111-8111-111111111111',
            '5d333333-3333-4333-8333-333333333333', 'room',
            'A4', 'bed')$$,
  '23503', NULL,
  'a bed cannot hang off another Organization''s room');

-- The tree is two deep by construction, so a cycle has nowhere to form: the
-- only row that may have a parent is a bed, and no bed may be one.
select is(
  (select count(*)::int from public.accommodation_units as child
     join public.accommodation_units as parent on parent.id = child.parent_id
    where parent.parent_id is not null),
  0,
  'nothing is a grandchild, so the tree cannot close on itself');

-- ---------------------------------------------------------------------------
-- Naming
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, parent_id, parent_unit_type,
       name, unit_type)
    values ('5c111111-1111-4111-8111-111111111111',
            '5a111111-1111-4111-8111-111111111111',
            '5d111111-1111-4111-8111-111111111111', 'room',
            'A', 'bed')$$,
  '23505', NULL,
  'two beds in one room cannot share a name');

select lives_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, parent_id, parent_unit_type,
       name, unit_type)
    values ('5c111111-1111-4111-8111-111111111111',
            '5a111111-1111-4111-8111-111111111111',
            '5d222222-2222-4222-8222-222222222222', 'room',
            'A', 'bed')$$,
  'but bed A in another room is a different bed');

-- The one the null in a partial index would have taken out silently.
select throws_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, name, unit_type)
    values ('5c111111-1111-4111-8111-111111111111',
            '5a111111-1111-4111-8111-111111111111',
            'U-101', 'room')$$,
  '23505', NULL,
  'and a room name is still unique in its Property');

select is(
  (select count(*)::int from pg_index
    where indexrelid = 'accommodation_units_property_id_name_key'::regclass
      and indpred is not null),
  1,
  'the room index is partial, which is what makes the bed index possible');

-- ---------------------------------------------------------------------------
-- A Unit is sellable when it has no children
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_id, stay_type, status, starts_on, ends_on)
    values ('5a111111-1111-4111-8111-111111111111',
            '5c111111-1111-4111-8111-111111111111',
            '5d111111-1111-4111-8111-111111111111',
            '5e111111-1111-4111-8111-111111111111',
            'guest', 'confirmed', date '2026-12-01', date '2026-12-04')$$,
  '55000', NULL,
  'a room that is let by the bed cannot be booked as a whole');

select throws_ok(
  $$insert into public.stays
      (organization_id, property_id, accommodation_unit_id,
       stay_type, status, starts_on, ends_on)
    values ('5a111111-1111-4111-8111-111111111111',
            '5c111111-1111-4111-8111-111111111111',
            '5d111111-1111-4111-8111-111111111111',
            'guest', 'in_house', date '2026-12-01', date '2026-12-04')$$,
  '55000', NULL,
  'and nobody can be put in it either');

select lives_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_id, stay_type, status, starts_on, ends_on)
    values ('5a111111-1111-4111-8111-111111111111',
            '5c111111-1111-4111-8111-111111111111',
            '5d1a1111-1111-4111-8111-111111111111',
            '5e111111-1111-4111-8111-111111111111',
            'guest', 'confirmed', date '2026-12-01', date '2026-12-04')$$,
  'the bed inside it can be');

-- The other direction. Without this the rule above is one you walk around by
-- dividing the room after the booking rather than before it.
insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id,
   guest_id, stay_type, status, starts_on, ends_on)
values ('5f111111-1111-4111-8111-111111111111',
        '5a111111-1111-4111-8111-111111111111',
        '5c111111-1111-4111-8111-111111111111',
        '5d444444-4444-4444-8444-444444444444',
        '5e111111-1111-4111-8111-111111111111',
        'guest', 'confirmed', date '2026-12-01', date '2026-12-04');

select throws_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, parent_id, parent_unit_type,
       name, unit_type)
    values ('5c111111-1111-4111-8111-111111111111',
            '5a111111-1111-4111-8111-111111111111',
            '5d444444-4444-4444-8444-444444444444', 'room',
            'A', 'bed')$$,
  '55000', NULL,
  'a room somebody has booked cannot be divided underneath them');

insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id,
   stay_type, status, starts_on, ends_on)
values ('5f222222-2222-4222-8222-222222222222',
        '5a111111-1111-4111-8111-111111111111',
        '5c111111-1111-4111-8111-111111111111',
        '5d555555-5555-4555-8555-555555555555',
        'guest', 'in_house', date '2026-09-01', null);

select throws_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, parent_id, parent_unit_type,
       name, unit_type)
    values ('5c111111-1111-4111-8111-111111111111',
            '5a111111-1111-4111-8111-111111111111',
            '5d555555-5555-4555-8555-555555555555', 'room',
            'A', 'bed')$$,
  '55000', NULL,
  'nor one somebody is in');

-- Cancelling releases it, like every other partial rule here: the row keeps its
-- dates and stops holding anything (blueprint 7.4).
update public.reservations set status = 'cancelled'
 where id = '5f111111-1111-4111-8111-111111111111';

select lives_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, parent_id, parent_unit_type,
       name, unit_type)
    values ('5c111111-1111-4111-8111-111111111111',
            '5a111111-1111-4111-8111-111111111111',
            '5d444444-4444-4444-8444-444444444444', 'room',
            'A', 'bed')$$,
  'a cancelled booking releases the room to be divided');

-- ---------------------------------------------------------------------------
-- Where a Unit is
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, name, unit_type, floor)
    values ('5c111111-1111-4111-8111-111111111111',
            '5a111111-1111-4111-8111-111111111111',
            'U-900', 'room', 900)$$,
  '23514', NULL,
  'a floor is a floor, not a number somebody typed');

-- ---------------------------------------------------------------------------
-- And the runtime role still only reaches its own
-- ---------------------------------------------------------------------------

set local role ranza_app;
select app.set_request_context('51111111-1111-4111-8111-111111111111');

select set_eq(
  $$select name from public.accommodation_units
     where parent_id = '5d111111-1111-4111-8111-111111111111'$$,
  array['A'],
  'a Staff Member reads the beds in a room they reach');

select is_empty(
  $$select id from public.accommodation_units
     where organization_id = '5b111111-1111-4111-8111-111111111111'$$,
  'and none of another Organization''s');

-- The fixture's Staff Member is a manager, and a shipped manager holds
-- accommodation.configure since 20260916002900. Who may NOT add a Unit — no
-- permission, no reach, a lapsed Subscription — is rooms_and_beds.test.sql's
-- job; this only says the door the insert policy opened is the one it meant to.
select lives_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, parent_id, parent_unit_type,
       name, unit_type)
    values ('5c111111-1111-4111-8111-111111111111',
            '5a111111-1111-4111-8111-111111111111',
            '5d222222-2222-4222-8222-222222222222', 'room',
            'Z', 'bed')$$,
  'and can create one: dividing a room is the Rooms screen''s workflow (RANZ-27)');

reset role;

select * from finish();
rollback;
