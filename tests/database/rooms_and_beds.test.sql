-- Rooms and beds are added and blocked from the Workspace (RANZ-27).
--
-- Three claims, and they fail in different ways on purpose:
--
--   the gate       adding a Unit and blocking one are bounded by a policy
--                  carrying all five gates (ADR 0012, ADR 0026), and the
--                  permission is the one a front desk role does not hold. A
--                  policy bounds rows; a column grant bounds what an update
--                  may touch, which is the whole of why a Staff Member who may
--                  block a bed may not rename it.
--
--   the reason     a blocked Unit says why and an available one has nothing to
--                  say — both directions, as one check constraint.
--
--   the occupant   a Unit somebody is in cannot be blocked, a room let by the
--                  bed is blocked bed by bed, and a Stay in house cannot begin
--                  on a blocked Unit. All three are triggers because all three
--                  are cross-row, and all three bind every role.
--
-- Rows in docs/features/rooms-and-beds/edge-cases.csv are named beside the
-- assertion that proves them. Every assertion below was checked by breaking
-- the thing it asserts and confirming it went red.
begin;
select plan(42);

insert into public.users (id, email) values
  ('71111111-1111-4111-8111-111111111111', 'rooms-manager@example.test'),
  ('72222222-2222-4222-8222-222222222222', 'rooms-desk@example.test'),
  ('73333333-3333-4333-8333-333333333333', 'rooms-outsider@example.test'),
  ('74444444-4444-4444-8444-444444444444', 'rooms-lapsed@example.test'),
  ('75555555-5555-4555-8555-555555555555', 'rooms-one-property@example.test');

insert into public.organizations (id, name, status) values
  ('7a111111-1111-4111-8111-111111111111', 'Rooms Organization', 'active'),
  ('7a222222-2222-4222-8222-222222222222', 'Rooms Other Organization', 'active'),
  ('7a333333-3333-4333-8333-333333333333', 'Rooms Lapsed Organization', 'active');

insert into public.properties (id, organization_id, name) values
  ('7b111111-1111-4111-8111-111111111111',
   '7a111111-1111-4111-8111-111111111111', 'Rooms Property'),
  ('7b444444-4444-4444-8444-444444444444',
   '7a111111-1111-4111-8111-111111111111', 'Rooms Second Property'),
  ('7b222222-2222-4222-8222-222222222222',
   '7a222222-2222-4222-8222-222222222222', 'Rooms Other Property'),
  ('7b333333-3333-4333-8333-333333333333',
   '7a333333-3333-4333-8333-333333333333', 'Rooms Lapsed Property');

-- A manager, who holds accommodation.configure since 20260916002900; a front
-- desk, who does not; a manager of another Organization; a manager of an
-- Organization whose Subscription lapsed; and a manager who reaches one of the
-- two Properties and not the other.
insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('7a111111-1111-4111-8111-111111111111',
   '71111111-1111-4111-8111-111111111111', 'manager', 'organization_wide'),
  ('7a111111-1111-4111-8111-111111111111',
   '72222222-2222-4222-8222-222222222222', 'front_desk', 'organization_wide'),
  ('7a222222-2222-4222-8222-222222222222',
   '73333333-3333-4333-8333-333333333333', 'manager', 'organization_wide'),
  ('7a333333-3333-4333-8333-333333333333',
   '74444444-4444-4444-8444-444444444444', 'manager', 'organization_wide'),
  ('7a111111-1111-4111-8111-111111111111',
   '75555555-5555-4555-8555-555555555555', 'manager', 'assigned_properties');

insert into public.property_assignments
  (property_id, organization_id, user_id) values
  ('7b111111-1111-4111-8111-111111111111',
   '7a111111-1111-4111-8111-111111111111',
   '75555555-5555-4555-8555-555555555555');

insert into public.subscriptions (organization_id, status) values
  ('7a111111-1111-4111-8111-111111111111', 'active'),
  ('7a222222-2222-4222-8222-222222222222', 'active'),
  ('7a333333-3333-4333-8333-333333333333', 'past_due');

insert into public.entitlements (organization_id, module_key) values
  ('7a111111-1111-4111-8111-111111111111', 'front_office'),
  ('7a222222-2222-4222-8222-222222222222', 'front_office'),
  ('7a333333-3333-4333-8333-333333333333', 'front_office');

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('7b111111-1111-4111-8111-111111111111',
   '7a111111-1111-4111-8111-111111111111', 'front_desk', true),
  ('7b444444-4444-4444-8444-444444444444',
   '7a111111-1111-4111-8111-111111111111', 'front_desk', true),
  ('7b222222-2222-4222-8222-222222222222',
   '7a222222-2222-4222-8222-222222222222', 'front_desk', true),
  ('7b333333-3333-4333-8333-333333333333',
   '7a333333-3333-4333-8333-333333333333', 'front_desk', true);

insert into public.guests (id, organization_id, full_name) values
  ('7e111111-1111-4111-8111-111111111111',
   '7a111111-1111-4111-8111-111111111111', 'Rooms Guest');

-- A room somebody is in, a room let by the bed with two beds, an empty room to
-- block, a room with a Guest arriving today, and one at the second Property.
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity, building, floor)
values
  ('7c111111-1111-4111-8111-111111111111',
   '7b111111-1111-4111-8111-111111111111',
   '7a111111-1111-4111-8111-111111111111', 'RB-101', 'room', 2, 'Block A', 1),
  ('7c222222-2222-4222-8222-222222222222',
   '7b111111-1111-4111-8111-111111111111',
   '7a111111-1111-4111-8111-111111111111', 'RB-102', 'room', 2, 'Block A', 1),
  ('7c333333-3333-4333-8333-333333333333',
   '7b111111-1111-4111-8111-111111111111',
   '7a111111-1111-4111-8111-111111111111', 'RB-103', 'room', 2, 'Block A', 1),
  ('7c555555-5555-4555-8555-555555555555',
   '7b111111-1111-4111-8111-111111111111',
   '7a111111-1111-4111-8111-111111111111', 'RB-104', 'room', 2, 'Block A', 1),
  ('7c666666-6666-4666-8666-666666666666',
   '7b444444-4444-4444-8444-444444444444',
   '7a111111-1111-4111-8111-111111111111', 'RB-201', 'room', 2, null, null);

insert into public.accommodation_units
  (id, property_id, organization_id, parent_id, parent_unit_type,
   name, unit_type, capacity)
values
  ('7c2a2222-2222-4222-8222-222222222222',
   '7b111111-1111-4111-8111-111111111111',
   '7a111111-1111-4111-8111-111111111111',
   '7c222222-2222-4222-8222-222222222222', 'room', 'A', 'bed', 1),
  ('7c2b2222-2222-4222-8222-222222222222',
   '7b111111-1111-4111-8111-111111111111',
   '7a111111-1111-4111-8111-111111111111',
   '7c222222-2222-4222-8222-222222222222', 'room', 'B', 'bed', 1);

insert into public.stays
  (organization_id, property_id, accommodation_unit_id,
   stay_type, status, starts_on, ends_on)
values
  ('7a111111-1111-4111-8111-111111111111',
   '7b111111-1111-4111-8111-111111111111',
   '7c111111-1111-4111-8111-111111111111',
   'guest', 'in_house', date '2026-09-01', null);

insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id,
   guest_id, stay_type, status, starts_on, ends_on)
values
  ('7f111111-1111-4111-8111-111111111111',
   '7a111111-1111-4111-8111-111111111111',
   '7b111111-1111-4111-8111-111111111111',
   '7c555555-5555-4555-8555-555555555555',
   '7e111111-1111-4111-8111-111111111111',
   'guest', 'confirmed',
   app.property_today('7b111111-1111-4111-8111-111111111111'),
   app.property_today('7b111111-1111-4111-8111-111111111111') + 2);

-- ---------------------------------------------------------------------------
-- The catalogue
-- ---------------------------------------------------------------------------

select ok(
  exists (select 1 from public.staff_permissions
           where key = 'accommodation.configure' and module_key = 'front_office'),
  'accommodation.configure is in the catalogue, under the front office');

select set_eq(
  $$select key from public.staff_roles
     where organization_id is null
       and 'accommodation.configure' = any (permissions)$$,
  array['owner', 'manager'],
  'owner and manager hold it and front desk, housekeeping and finance do not');

-- ---------------------------------------------------------------------------
-- What the table refuses regardless of who is asking
-- ---------------------------------------------------------------------------

-- RB-S2-04. The composite foreign key: a Unit in another Organization's
-- Property is unrepresentable for every role, including this one.
select throws_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, name, unit_type, capacity)
    values ('7b111111-1111-4111-8111-111111111111',
            '7a222222-2222-4222-8222-222222222222', 'RB-307', 'room', 2)$$,
  '23503', NULL,
  'a Unit naming one Organization and another''s Property is unrepresentable');

-- RB-S3-02, both directions.
select throws_ok(
  $$update public.accommodation_units set status = 'blocked'
     where id = '7c333333-3333-4333-8333-333333333333'$$,
  '23514', NULL,
  'a Unit cannot be blocked without a reason');

select throws_ok(
  $$update public.accommodation_units
       set status = 'blocked', status_reason = 'ab'
     where id = '7c333333-3333-4333-8333-333333333333'$$,
  '23514', NULL,
  'nor with one under three characters');

select throws_ok(
  $$update public.accommodation_units
       set status_reason = 'a reason with nothing to explain'
     where id = '7c333333-3333-4333-8333-333333333333'$$,
  '23514', NULL,
  'and an available Unit carries no reason');

-- RB-S3-03. Owner rights and still refused: the trigger binds every role.
select throws_ok(
  $$update public.accommodation_units
       set status = 'blocked', status_reason = 'mattress being replaced'
     where id = '7c111111-1111-4111-8111-111111111111'$$,
  '55000', 'somebody is in that Accommodation Unit',
  'a Unit somebody is in cannot be blocked, by anybody');

-- RB-S3-04.
select throws_ok(
  $$update public.accommodation_units
       set status = 'blocked', status_reason = 'the whole room'
     where id = '7c222222-2222-4222-8222-222222222222'$$,
  '55000', 'that Accommodation Unit is let by the bed; block the bed',
  'a room let by the bed is blocked bed by bed');

-- RB-S3-06, as the owner. The Reservation on RB-104 arrives today; blocked
-- first as the owner, then the Stay that check-in would open is refused.
update public.accommodation_units
   set status = 'blocked', status_reason = 'window will not close'
 where id = '7c555555-5555-4555-8555-555555555555';

select throws_ok(
  $$insert into public.stays
      (organization_id, property_id, accommodation_unit_id, reservation_id,
       stay_type, status, starts_on, ends_on)
    values ('7a111111-1111-4111-8111-111111111111',
            '7b111111-1111-4111-8111-111111111111',
            '7c555555-5555-4555-8555-555555555555',
            '7f111111-1111-4111-8111-111111111111',
            'guest', 'in_house',
            app.property_today('7b111111-1111-4111-8111-111111111111'),
            app.property_today('7b111111-1111-4111-8111-111111111111') + 2)$$,
  '55000', 'that Accommodation Unit is not in service',
  'a Stay in house cannot begin on a blocked Unit, for every role');

-- The same door for out of service, which a maintenance request writes
-- (ADR 0032). By way of available: a Unit is blocked or taken out of order
-- from available, never straight from one to the other (MT-S2-08).
update public.accommodation_units
   set status = 'available', status_reason = null
 where id = '7c555555-5555-4555-8555-555555555555';

update public.accommodation_units
   set status = 'out_of_service'
 where id = '7c555555-5555-4555-8555-555555555555';

select throws_ok(
  $$insert into public.stays
      (organization_id, property_id, accommodation_unit_id, reservation_id,
       stay_type, status, starts_on, ends_on)
    values ('7a111111-1111-4111-8111-111111111111',
            '7b111111-1111-4111-8111-111111111111',
            '7c555555-5555-4555-8555-555555555555',
            '7f111111-1111-4111-8111-111111111111',
            'guest', 'in_house',
            app.property_today('7b111111-1111-4111-8111-111111111111'),
            app.property_today('7b111111-1111-4111-8111-111111111111') + 2)$$,
  '55000', 'that Accommodation Unit is not in service',
  'nor on one out of service');

-- Restored, so the manager's block below is the first the row sees.
update public.accommodation_units
   set status = 'available', status_reason = null
 where id = '7c555555-5555-4555-8555-555555555555';

-- ---------------------------------------------------------------------------
-- The runtime role with nobody acting
-- ---------------------------------------------------------------------------

set local role ranza_app;

select throws_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, name, unit_type, capacity)
    values ('7b111111-1111-4111-8111-111111111111',
            '7a111111-1111-4111-8111-111111111111', 'RB-301', 'room', 2)$$,
  '42501', NULL,
  'without a request context nobody adds a Unit');

-- ---------------------------------------------------------------------------
-- A manager, holding accommodation.configure
-- ---------------------------------------------------------------------------

select app.set_request_context('71111111-1111-4111-8111-111111111111');

-- RB-S2-01.
select lives_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, name, unit_type, capacity, building, floor)
    values ('7b111111-1111-4111-8111-111111111111',
            '7a111111-1111-4111-8111-111111111111',
            'RB-301', 'room', 2, 'Block A', 3)$$,
  'a manager adds a room to a Property they reach');

-- RB-S2-02.
select lives_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, parent_id, parent_unit_type,
       name, unit_type, capacity)
    values ('7b111111-1111-4111-8111-111111111111',
            '7a111111-1111-4111-8111-111111111111',
            '7c222222-2222-4222-8222-222222222222', 'room', 'C', 'bed', 1)$$,
  'and a bed under a room let by the bed');

-- RB-S2-06.
select throws_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, name, unit_type, capacity)
    values ('7b111111-1111-4111-8111-111111111111',
            '7a111111-1111-4111-8111-111111111111', 'RB-101', 'room', 2)$$,
  '23505', NULL,
  'a room name already at the Property is refused by the index, not by a check');

-- RB-S2-10. The grant is a column list; these are not on it.
select throws_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, name, unit_type, capacity, status,
       status_reason)
    values ('7b111111-1111-4111-8111-111111111111',
            '7a111111-1111-4111-8111-111111111111',
            'RB-302', 'room', 2, 'blocked', 'born blocked')$$,
  '42501', NULL,
  'a Unit cannot be born blocked');

select throws_ok(
  $$insert into public.accommodation_units
      (id, property_id, organization_id, name, unit_type, capacity)
    values ('7c777777-7777-4777-8777-777777777777',
            '7b111111-1111-4111-8111-111111111111',
            '7a111111-1111-4111-8111-111111111111', 'RB-303', 'room', 2)$$,
  '42501', NULL,
  'nor with an id of the caller''s choosing');

-- RB-S3-01.
select lives_ok(
  $$update public.accommodation_units
       set status = 'blocked', status_reason = 'mattress being replaced',
           updated_at = now()
     where id = '7c333333-3333-4333-8333-333333333333'$$,
  'a manager blocks an empty room with a reason');

select is(
  (select status_reason from public.accommodation_units
    where id = '7c333333-3333-4333-8333-333333333333'),
  'mattress being replaced',
  'and the reason is on the Unit');

-- RB-S3-05, then RB-S3-06 again, this time as the runtime role: the manager
-- also holds front_desk.check_in, so the policy would have let the Stay in.
select lives_ok(
  $$update public.accommodation_units
       set status = 'blocked', status_reason = 'window will not close',
           updated_at = now()
     where id = '7c555555-5555-4555-8555-555555555555'$$,
  'a Unit with a booking arriving later can still be blocked');

select throws_ok(
  $$insert into public.stays
      (organization_id, property_id, accommodation_unit_id, reservation_id,
       stay_type, status, starts_on, ends_on)
    values ('7a111111-1111-4111-8111-111111111111',
            '7b111111-1111-4111-8111-111111111111',
            '7c555555-5555-4555-8555-555555555555',
            '7f111111-1111-4111-8111-111111111111',
            'guest', 'in_house',
            app.property_today('7b111111-1111-4111-8111-111111111111'),
            app.property_today('7b111111-1111-4111-8111-111111111111') + 2)$$,
  '55000', 'that Accommodation Unit is not in service',
  'and its Guest cannot be checked in while it is');

-- RB-S3-03, RB-S3-04 as the runtime role.
select throws_ok(
  $$update public.accommodation_units
       set status = 'blocked', status_reason = 'mattress being replaced',
           updated_at = now()
     where id = '7c111111-1111-4111-8111-111111111111'$$,
  '55000', 'somebody is in that Accommodation Unit',
  'a manager cannot block a Unit somebody is in');

select throws_ok(
  $$update public.accommodation_units
       set status = 'blocked', status_reason = 'the whole room',
           updated_at = now()
     where id = '7c222222-2222-4222-8222-222222222222'$$,
  '55000', 'that Accommodation Unit is let by the bed; block the bed',
  'nor a room let by the bed');

select lives_ok(
  $$update public.accommodation_units
       set status = 'blocked', status_reason = 'broken frame',
           updated_at = now()
     where id = '7c2a2222-2222-4222-8222-222222222222'$$,
  'but one of its beds, yes');

-- RB-S3-10. A policy bounds rows; a grant bounds columns. Every row here is
-- the manager's own Organization before and after, so only the grant refuses.
select throws_ok(
  $$update public.accommodation_units set name = 'RB-999'
     where id = '7c333333-3333-4333-8333-333333333333'$$,
  '42501', NULL,
  'a Unit cannot be renamed');

select throws_ok(
  $$update public.accommodation_units set capacity = 8
     where id = '7c333333-3333-4333-8333-333333333333'$$,
  '42501', NULL,
  'nor grown');

select throws_ok(
  $$update public.accommodation_units set floor = 9
     where id = '7c333333-3333-4333-8333-333333333333'$$,
  '42501', NULL,
  'nor moved to another floor');

select throws_ok(
  $$update public.accommodation_units
       set parent_id = '7c333333-3333-4333-8333-333333333333',
           parent_unit_type = 'room'
     where id = '7c2b2222-2222-4222-8222-222222222222'$$,
  '42501', NULL,
  'nor a bed moved to another room');

select throws_ok(
  $$update public.accommodation_units
       set property_id = '7b444444-4444-4444-8444-444444444444'
     where id = '7c333333-3333-4333-8333-333333333333'$$,
  '42501', NULL,
  'nor moved to another Property');

-- RB-S3-12.
select throws_ok(
  $$delete from public.accommodation_units
     where id = '7c333333-3333-4333-8333-333333333333'$$,
  '42501', NULL,
  'a Unit is never deleted');

-- RB-S3-08.
select lives_ok(
  $$update public.accommodation_units
       set status = 'available', status_reason = null, updated_at = now()
     where id = '7c333333-3333-4333-8333-333333333333'$$,
  'a manager unblocks it');

select is(
  (select status_reason from public.accommodation_units
    where id = '7c333333-3333-4333-8333-333333333333'),
  NULL,
  'and the reason goes with the block');

select throws_ok(
  $$update public.accommodation_units
       set status = 'available', updated_at = now()
     where id = '7c2a2222-2222-4222-8222-222222222222'$$,
  '23514', NULL,
  'an unblock that leaves the reason behind is refused');

-- After the unblock, the Stay the block refused goes through: the refusal was
-- the status and nothing else.
update public.accommodation_units
   set status = 'available', status_reason = null, updated_at = now()
 where id = '7c555555-5555-4555-8555-555555555555';

select lives_ok(
  $$insert into public.stays
      (organization_id, property_id, accommodation_unit_id, reservation_id,
       stay_type, status, starts_on, ends_on)
    values ('7a111111-1111-4111-8111-111111111111',
            '7b111111-1111-4111-8111-111111111111',
            '7c555555-5555-4555-8555-555555555555',
            '7f111111-1111-4111-8111-111111111111',
            'guest', 'in_house',
            app.property_today('7b111111-1111-4111-8111-111111111111'),
            app.property_today('7b111111-1111-4111-8111-111111111111') + 2)$$,
  'and once unblocked, the check-in goes through');

-- ---------------------------------------------------------------------------
-- A manager who reaches one Property and not the other (RB-S2-04, reach)
-- ---------------------------------------------------------------------------

select app.set_request_context('75555555-5555-4555-8555-555555555555');

select lives_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, name, unit_type, capacity)
    values ('7b111111-1111-4111-8111-111111111111',
            '7a111111-1111-4111-8111-111111111111', 'RB-304', 'room', 2)$$,
  'a manager assigned to a Property adds a room to it');

select throws_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, name, unit_type, capacity)
    values ('7b444444-4444-4444-8444-444444444444',
            '7a111111-1111-4111-8111-111111111111', 'RB-202', 'room', 2)$$,
  '42501', NULL,
  'and not to one of the same Organization they are not assigned to');

select is_empty(
  $$select id from public.accommodation_units
     where property_id = '7b444444-4444-4444-8444-444444444444'$$,
  'whose Units they cannot read either (RB-S1-02)');

-- ---------------------------------------------------------------------------
-- A front desk, reaching the Property without accommodation.configure
-- ---------------------------------------------------------------------------

select app.set_request_context('72222222-2222-4222-8222-222222222222');

select isnt_empty(
  $$select id from public.accommodation_units
     where property_id = '7b111111-1111-4111-8111-111111111111'$$,
  'a front desk reads the Units at their Property');

-- RB-S2-03.
select throws_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, name, unit_type, capacity)
    values ('7b111111-1111-4111-8111-111111111111',
            '7a111111-1111-4111-8111-111111111111', 'RB-305', 'room', 2)$$,
  '42501', NULL,
  'but cannot add one: the front desk role does not carry the permission');

-- RB-S3-09. Not an exception: an update whose row the policy's USING clause
-- hides touches nothing, which is indistinguishable from the Unit not being
-- there. The grant is the runtime role's, not the person's, so it has nothing
-- to say here; the policy is the whole of the refusal.
update public.accommodation_units
   set status = 'blocked', status_reason = 'mattress being replaced',
       updated_at = now()
 where id = '7c333333-3333-4333-8333-333333333333';

select is(
  (select status from public.accommodation_units
    where id = '7c333333-3333-4333-8333-333333333333'),
  'available',
  'nor block one: the update finds no row and the Unit is as it was');

-- ---------------------------------------------------------------------------
-- A manager of another Organization (RB-S2-04, Organization)
-- ---------------------------------------------------------------------------

select app.set_request_context('73333333-3333-4333-8333-333333333333');

select throws_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, name, unit_type, capacity)
    values ('7b111111-1111-4111-8111-111111111111',
            '7a111111-1111-4111-8111-111111111111', 'RB-306', 'room', 2)$$,
  '42501', NULL,
  'a manager elsewhere cannot add a Unit to this Organization');

-- Naming their own Organization on our Property: the policy refuses it
-- before the composite foreign key gets to say the pair is impossible. The key
-- is asserted as the owner, above, where it is what is reached.
select throws_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, name, unit_type, capacity)
    values ('7b111111-1111-4111-8111-111111111111',
            '7a222222-2222-4222-8222-222222222222', 'RB-307', 'room', 2)$$,
  '42501', NULL,
  'and a Unit naming their Organization with our Property is refused first by the policy');

-- ---------------------------------------------------------------------------
-- A manager whose Organization's Subscription lapsed (RB-S2-05)
-- ---------------------------------------------------------------------------

select app.set_request_context('74444444-4444-4444-8444-444444444444');

select throws_ok(
  $$insert into public.accommodation_units
      (property_id, organization_id, name, unit_type, capacity)
    values ('7b333333-3333-4333-8333-333333333333',
            '7a333333-3333-4333-8333-333333333333', 'RB-401', 'room', 2)$$,
  '42501', NULL,
  'a lapsed Subscription adds no Unit');

reset role;

select finish();
rollback;
