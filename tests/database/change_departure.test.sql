-- Changing an in-house Guest's departure (ADR 0039, docs/features/amend-booking,
-- slice 2).
--
-- app.change_departure() extends, shortens, or gives an open-ended Stay an
-- end, and moves its booking's departure with it. What it leans on rather
-- than restates: app.unit_holds_one_occupancy refuses an extension into a
-- night another booking holds, and app.room_nights_due counts a night in
-- house whatever the planned end, so no night already charged moves.
--
-- Rows in docs/features/amend-booking/edge-cases.csv are named beside the
-- assertion that proves them; the breaks applied, each seen red, are listed in
-- docs/evidence/amend-booking/README.md.
begin;
select plan(20);

insert into public.users (id, email) values
  ('ac010000-0000-4000-8000-000000000001', 'ac-desk@example.test'),
  ('ac010000-0000-4000-8000-000000000002', 'ac-check-in-only@example.test');
insert into public.organizations (id, name, status) values
  ('ac0a0000-0000-4000-8000-00000000000a', 'Departure Organization', 'active');
insert into public.properties (id, organization_id, name, currency) values
  ('ac0b0000-0000-4000-8000-000000000001', 'ac0a0000-0000-4000-8000-00000000000a', 'Departure Property', 'TRY'),
  ('ac0b0000-0000-4000-8000-000000000002', 'ac0a0000-0000-4000-8000-00000000000a', 'Departure Property Without A Desk', 'TRY');
insert into public.subscriptions (organization_id, status) values ('ac0a0000-0000-4000-8000-00000000000a', 'active');
insert into public.entitlements (organization_id, module_key) values ('ac0a0000-0000-4000-8000-00000000000a', 'front_office');
insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('ac0b0000-0000-4000-8000-000000000001', 'ac0a0000-0000-4000-8000-00000000000a', 'front_desk', true);
insert into public.staff_roles (scope_id, key, organization_id, name, permissions) values
  ('ac0a0000-0000-4000-8000-00000000000a', 'ac_check_in', 'ac0a0000-0000-4000-8000-00000000000a', 'Check-in and out', array['front_desk.check_in', 'front_desk.check_out']);
insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('ac0a0000-0000-4000-8000-00000000000a', 'ac010000-0000-4000-8000-000000000001', 'front_desk', 'organization_wide');
insert into public.organization_memberships
  (organization_id, user_id, role, role_scope_id, access_scope) values
  ('ac0a0000-0000-4000-8000-00000000000a', 'ac010000-0000-4000-8000-000000000002', 'ac_check_in', 'ac0a0000-0000-4000-8000-00000000000a', 'organization_wide');
insert into public.guests (id, organization_id, full_name) values
  ('ac0d0000-0000-4000-8000-000000000001', 'ac0a0000-0000-4000-8000-00000000000a', 'Departure Guest');
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity) values
  ('ac0c0000-0000-4000-8000-000000000101', 'ac0b0000-0000-4000-8000-000000000001', 'ac0a0000-0000-4000-8000-00000000000a', 'AC-101', 'room', 2),
  ('ac0c0000-0000-4000-8000-000000000102', 'ac0b0000-0000-4000-8000-000000000001', 'ac0a0000-0000-4000-8000-00000000000a', 'AC-102', 'room', 2),
  ('ac0c0000-0000-4000-8000-000000000103', 'ac0b0000-0000-4000-8000-000000000001', 'ac0a0000-0000-4000-8000-00000000000a', 'AC-103', 'room', 2),
  ('ac0c0000-0000-4000-8000-000000000104', 'ac0b0000-0000-4000-8000-000000000001', 'ac0a0000-0000-4000-8000-00000000000a', 'AC-104', 'room', 2),
  ('ac0c0000-0000-4000-8000-000000000201', 'ac0b0000-0000-4000-8000-000000000002', 'ac0a0000-0000-4000-8000-00000000000a', 'AC-201', 'room', 2);

-- 1  101, in house since two days ago, leaving in two.
-- 2  101, a confirmed booking from four days out: the night an extension meets.
-- 3  102, a Resident in house with no end.
-- 4  103, a Guest who should have left yesterday.
-- 5  104, departed yesterday.
insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id,
   stay_type, status, starts_on, ends_on) values
  ('ac0e0000-0000-4000-8000-000000000001', 'ac0a0000-0000-4000-8000-00000000000a', 'ac0b0000-0000-4000-8000-000000000001', 'ac0c0000-0000-4000-8000-000000000101', 'ac0d0000-0000-4000-8000-000000000001', 'guest', 'checked_in', app.property_today('ac0b0000-0000-4000-8000-000000000001') - 2, app.property_today('ac0b0000-0000-4000-8000-000000000001') + 2),
  ('ac0e0000-0000-4000-8000-000000000002', 'ac0a0000-0000-4000-8000-00000000000a', 'ac0b0000-0000-4000-8000-000000000001', 'ac0c0000-0000-4000-8000-000000000101', 'ac0d0000-0000-4000-8000-000000000001', 'guest', 'confirmed', app.property_today('ac0b0000-0000-4000-8000-000000000001') + 4, app.property_today('ac0b0000-0000-4000-8000-000000000001') + 6),
  ('ac0e0000-0000-4000-8000-000000000003', 'ac0a0000-0000-4000-8000-00000000000a', 'ac0b0000-0000-4000-8000-000000000001', 'ac0c0000-0000-4000-8000-000000000102', 'ac0d0000-0000-4000-8000-000000000001', 'resident', 'checked_in', app.property_today('ac0b0000-0000-4000-8000-000000000001') - 30, null),
  ('ac0e0000-0000-4000-8000-000000000004', 'ac0a0000-0000-4000-8000-00000000000a', 'ac0b0000-0000-4000-8000-000000000001', 'ac0c0000-0000-4000-8000-000000000103', 'ac0d0000-0000-4000-8000-000000000001', 'guest', 'checked_in', app.property_today('ac0b0000-0000-4000-8000-000000000001') - 3, app.property_today('ac0b0000-0000-4000-8000-000000000001') - 1),
  ('ac0e0000-0000-4000-8000-000000000005', 'ac0a0000-0000-4000-8000-00000000000a', 'ac0b0000-0000-4000-8000-000000000001', 'ac0c0000-0000-4000-8000-000000000104', 'ac0d0000-0000-4000-8000-000000000001', 'guest', 'checked_out', app.property_today('ac0b0000-0000-4000-8000-000000000001') - 3, app.property_today('ac0b0000-0000-4000-8000-000000000001') - 1),
  ('ac0e0000-0000-4000-8000-000000000006', 'ac0a0000-0000-4000-8000-00000000000a', 'ac0b0000-0000-4000-8000-000000000002', 'ac0c0000-0000-4000-8000-000000000201', 'ac0d0000-0000-4000-8000-000000000001', 'guest', 'checked_in', app.property_today('ac0b0000-0000-4000-8000-000000000001') - 1, app.property_today('ac0b0000-0000-4000-8000-000000000001') + 2);
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, reservation_id,
   stay_type, status, starts_on, ends_on) values
  ('ac0f0000-0000-4000-8000-000000000001', 'ac0a0000-0000-4000-8000-00000000000a', 'ac0b0000-0000-4000-8000-000000000001', 'ac0c0000-0000-4000-8000-000000000101', 'ac0e0000-0000-4000-8000-000000000001', 'guest', 'in_house', app.property_today('ac0b0000-0000-4000-8000-000000000001') - 2, app.property_today('ac0b0000-0000-4000-8000-000000000001') + 2),
  ('ac0f0000-0000-4000-8000-000000000003', 'ac0a0000-0000-4000-8000-00000000000a', 'ac0b0000-0000-4000-8000-000000000001', 'ac0c0000-0000-4000-8000-000000000102', 'ac0e0000-0000-4000-8000-000000000003', 'resident', 'in_house', app.property_today('ac0b0000-0000-4000-8000-000000000001') - 30, null),
  ('ac0f0000-0000-4000-8000-000000000004', 'ac0a0000-0000-4000-8000-00000000000a', 'ac0b0000-0000-4000-8000-000000000001', 'ac0c0000-0000-4000-8000-000000000103', 'ac0e0000-0000-4000-8000-000000000004', 'guest', 'in_house', app.property_today('ac0b0000-0000-4000-8000-000000000001') - 3, app.property_today('ac0b0000-0000-4000-8000-000000000001') - 1),
  ('ac0f0000-0000-4000-8000-000000000005', 'ac0a0000-0000-4000-8000-00000000000a', 'ac0b0000-0000-4000-8000-000000000001', 'ac0c0000-0000-4000-8000-000000000104', 'ac0e0000-0000-4000-8000-000000000005', 'guest', 'departed', app.property_today('ac0b0000-0000-4000-8000-000000000001') - 3, app.property_today('ac0b0000-0000-4000-8000-000000000001') - 1),
  ('ac0f0000-0000-4000-8000-000000000006', 'ac0a0000-0000-4000-8000-00000000000a', 'ac0b0000-0000-4000-8000-000000000002', 'ac0c0000-0000-4000-8000-000000000201', 'ac0e0000-0000-4000-8000-000000000006', 'guest', 'in_house', app.property_today('ac0b0000-0000-4000-8000-000000000001') - 1, app.property_today('ac0b0000-0000-4000-8000-000000000001') + 2);

-- Yesterday is closed with Guest 4 still in house past their departure: the
-- close lists them as an exception and does not wait for them (ADR 0034).
-- Inserted in replica mode, as business_day_close.test.sql does, because the
-- close's own stamp is not what is under test.
set local session_replication_role = replica;
insert into public.business_day_closes
  (organization_id, property_id, business_date, closed_by_job, reason)
values ('ac0a0000-0000-4000-8000-00000000000a', 'ac0b0000-0000-4000-8000-000000000001', app.property_today('ac0b0000-0000-4000-8000-000000000001') - 1, 'test.fixture', 'Guest 4 has not left');
set local session_replication_role = origin;

-- The nights Stay 1 has already spent, as the close counts them.
create temporary table spent as
  select business_date from app.room_nights_due('ac0b0000-0000-4000-8000-000000000001', app.property_today('ac0b0000-0000-4000-8000-000000000001') - 2, app.property_today('ac0b0000-0000-4000-8000-000000000001') - 1, 'ac0f0000-0000-4000-8000-000000000001');
grant select on spent to ranza_app;

select is((select count(*)::int from spent), 2,
  'the fixture: Stay 1 has spent two nights, so AB-S2-07 compares something');

set local role ranza_app;
select app.set_request_context('ac010000-0000-4000-8000-000000000001');

select results_eq(
  $$select change_reservation_id, change_unit_id from app.change_departure('ac0f0000-0000-4000-8000-000000000001', app.property_today('ac0b0000-0000-4000-8000-000000000001') + 3, 0, 'Staying a night more')$$,
  $$values ('ac0e0000-0000-4000-8000-000000000001'::uuid, 'ac0c0000-0000-4000-8000-000000000101'::uuid)$$,
  'AB-S2-01: an in-house Guest is extended');

select results_eq(
  $$select stay.ends_on, reservation.ends_on
      from public.stays as stay
      join public.reservations as reservation on reservation.id = stay.reservation_id
     where stay.id = 'ac0f0000-0000-4000-8000-000000000001'$$,
  $$values (app.property_today('ac0b0000-0000-4000-8000-000000000001') + 3, app.property_today('ac0b0000-0000-4000-8000-000000000001') + 3)$$,
  'AB-S2-08: the Stay and its booking end on the same day');

select results_eq(
  $$select kind, stay_id, from_ends_on, to_ends_on, from_unit_id, to_unit_id,
           from_rate_minor is not distinct from to_rate_minor, note, changed_by
      from public.reservation_changes where stay_id = 'ac0f0000-0000-4000-8000-000000000001'$$,
  $$values ('departure_changed', 'ac0f0000-0000-4000-8000-000000000001'::uuid, app.property_today('ac0b0000-0000-4000-8000-000000000001') + 2, app.property_today('ac0b0000-0000-4000-8000-000000000001') + 3,
            'ac0c0000-0000-4000-8000-000000000101'::uuid, 'ac0c0000-0000-4000-8000-000000000101'::uuid, true, 'Staying a night more', 'ac010000-0000-4000-8000-000000000001'::uuid)$$,
  'AB-S1-24: a revision records the departure before and after, and who');

select throws_ok(
  $$select * from app.change_departure('ac0f0000-0000-4000-8000-000000000001', app.property_today('ac0b0000-0000-4000-8000-000000000001') + 4, 0, null)$$,
  'RZ003', null,
  'AB-S1-19: a change against a version that no longer exists is refused');

select throws_ok(
  $$select * from app.change_departure('ac0f0000-0000-4000-8000-000000000001', app.property_today('ac0b0000-0000-4000-8000-000000000001') + 5, 1, null)$$,
  '55006', null,
  'AB-S2-02: an extension into a night another booking holds is refused');

select lives_ok(
  $$select * from app.change_departure('ac0f0000-0000-4000-8000-000000000001', app.property_today('ac0b0000-0000-4000-8000-000000000001') + 1, 1, null)$$,
  'AB-S2-03: a stay is shortened to a later day');

select throws_ok(
  $$select * from app.change_departure('ac0f0000-0000-4000-8000-000000000001', app.property_today('ac0b0000-0000-4000-8000-000000000001'), 2, null)$$,
  '23514', 'a departure is tomorrow or later; leaving today is a check-out',
  'AB-S2-04: leaving today is a check-out, not a change');

select throws_ok(
  $$select * from app.change_departure('ac0f0000-0000-4000-8000-000000000001', app.property_today('ac0b0000-0000-4000-8000-000000000001') - 1, 2, null)$$,
  '23514', null,
  'AB-S2-04: and a night already slept is never taken back');

select throws_ok(
  $$select * from app.change_departure('ac0f0000-0000-4000-8000-000000000001', app.property_today('ac0b0000-0000-4000-8000-000000000001') + 1, 2, null)$$,
  '23514', 'that change changes nothing',
  'a change that changes nothing is not recorded as one');

select throws_ok(
  $$select * from app.change_departure('ac0f0000-0000-4000-8000-000000000001', null, 2, null)$$,
  '23514', 'a Guest''s Stay has a departure',
  'AB-S2-06: a Guest''s Stay keeps an end');

select results_eq(
  $$select business_date from app.room_nights_due('ac0b0000-0000-4000-8000-000000000001', app.property_today('ac0b0000-0000-4000-8000-000000000001') - 2, app.property_today('ac0b0000-0000-4000-8000-000000000001') - 1, 'ac0f0000-0000-4000-8000-000000000001')$$,
  $$select business_date from spent$$,
  'AB-S2-07: the nights already spent are the same nights after an extension and a shortening');

select lives_ok(
  $$select * from app.change_departure('ac0f0000-0000-4000-8000-000000000004', app.property_today('ac0b0000-0000-4000-8000-000000000001') + 1, 0, null)$$,
  'AB-S2-05, AB-S3-10: a Guest past their departure is extended to tomorrow, though that departure was on a day since closed');

select is(
  (select ends_on from public.stays where id = 'ac0f0000-0000-4000-8000-000000000004'),
  app.property_today('ac0b0000-0000-4000-8000-000000000001') + 1,
  'AB-S2-05: and is no longer overdue');

select lives_ok(
  $$select * from app.change_departure('ac0f0000-0000-4000-8000-000000000003', app.property_today('ac0b0000-0000-4000-8000-000000000001') + 10, 0, null)$$,
  'AB-S2-06: an open-ended Resident is given an end');

select lives_ok(
  $$select * from app.change_departure('ac0f0000-0000-4000-8000-000000000003', null, 1, null)$$,
  'AB-S2-06: and it is taken away again');

select throws_ok(
  $$select * from app.change_departure('ac0f0000-0000-4000-8000-000000000005', app.property_today('ac0b0000-0000-4000-8000-000000000001') + 2, 0, null)$$,
  '42501', null,
  'a departed Stay is not changed');

select throws_ok(
  $$select * from app.change_departure('ac0f0000-0000-4000-8000-000000000006', app.property_today('ac0b0000-0000-4000-8000-000000000001') + 3, 0, null)$$,
  '42501', null,
  'AB-S1-25: nor at a Property whose front desk is not enabled');

select app.set_request_context('ac010000-0000-4000-8000-000000000002');

select throws_ok(
  $$select * from app.change_departure('ac0f0000-0000-4000-8000-000000000001', app.property_today('ac0b0000-0000-4000-8000-000000000001') + 2, 2, null)$$,
  '42501', null,
  'AB-S1-22: without front_desk.amend no departure changes');

select throws_ok(
  $$update public.stays set ends_on = ends_on + 1 where id = 'ac0f0000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'AB-S1-23: nor through the end check-out may write, while the Guest is in house');

select * from finish();
rollback;
