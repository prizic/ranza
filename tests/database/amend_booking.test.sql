-- Amending a booking that has not arrived (ADR 0039, docs/features/amend-booking,
-- slice 1).
--
-- Three claims, which fail in different ways:
--
--   the gate      a booking changes only through app.amend_reservation(), for
--                 a caller holding front_desk.amend within the front desk's
--                 gates; ranza_app's own update grants are what they were.
--
--   the rules     the new nights and Unit are refused by the constraints and
--                 triggers that refuse a booking taken there, plus the ones
--                 only the command can state: not before today, not onto a
--                 room out of service, not a finished booking.
--
--   the record    every change is one append-only revision, and only a new
--                 kind of Unit is a new price.
--
-- The races — two changes to one booking, two moves between the same rooms —
-- need two sessions and are in tests/integration/amend-booking.test.ts.
--
-- Rows in docs/features/amend-booking/edge-cases.csv are named beside the
-- assertion that proves them. Each break listed in
-- goals/2026-09-28-amend-booking/progress.md was applied, the altered object
-- printed first, and the named assertion seen red.
begin;
select plan(45);

insert into public.users (id, email) values
  ('ab010000-0000-4000-8000-000000000001', 'ab-desk@example.test'),
  ('ab010000-0000-4000-8000-000000000002', 'ab-check-in-only@example.test'),
  ('ab010000-0000-4000-8000-000000000003', 'ab-outsider@example.test');

insert into public.organizations (id, name, status) values
  ('ab0a0000-0000-4000-8000-00000000000a', 'Amend Organization', 'active'),
  ('ab0a0000-0000-4000-8000-00000000000b', 'Amend Other Organization', 'active');

-- The second Property has no front desk, which is the commercial gate.
insert into public.properties (id, organization_id, name, currency) values
  ('ab0b0000-0000-4000-8000-000000000001', 'ab0a0000-0000-4000-8000-00000000000a', 'Amend Property', 'TRY'),
  ('ab0b0000-0000-4000-8000-000000000002', 'ab0a0000-0000-4000-8000-00000000000a', 'Amend Property Without A Desk', 'TRY'),
  ('ab0b0000-0000-4000-8000-000000000003', 'ab0a0000-0000-4000-8000-00000000000b', 'Amend Other Property', 'TRY');

insert into public.subscriptions (organization_id, status) values
  ('ab0a0000-0000-4000-8000-00000000000a', 'active'), ('ab0a0000-0000-4000-8000-00000000000b', 'active');
insert into public.entitlements (organization_id, module_key) values
  ('ab0a0000-0000-4000-8000-00000000000a', 'front_office'), ('ab0a0000-0000-4000-8000-00000000000b', 'front_office');
insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('ab0b0000-0000-4000-8000-000000000001', 'ab0a0000-0000-4000-8000-00000000000a', 'front_desk', true),
  ('ab0b0000-0000-4000-8000-000000000003', 'ab0a0000-0000-4000-8000-00000000000b', 'front_desk', true);

insert into public.staff_roles (scope_id, key, organization_id, name, permissions) values
  ('ab0a0000-0000-4000-8000-00000000000a', 'ab_check_in', 'ab0a0000-0000-4000-8000-00000000000a', 'Check-in only', array['front_desk.check_in']);

insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('ab0a0000-0000-4000-8000-00000000000a', 'ab010000-0000-4000-8000-000000000001', 'front_desk', 'organization_wide'),
  ('ab0a0000-0000-4000-8000-00000000000b', 'ab010000-0000-4000-8000-000000000003', 'front_desk', 'organization_wide');
insert into public.organization_memberships
  (organization_id, user_id, role, role_scope_id, access_scope) values
  ('ab0a0000-0000-4000-8000-00000000000a', 'ab010000-0000-4000-8000-000000000002', 'ab_check_in', 'ab0a0000-0000-4000-8000-00000000000a', 'organization_wide');

insert into public.guests (id, organization_id, full_name) values
  ('ab0d0000-0000-4000-8000-000000000001', 'ab0a0000-0000-4000-8000-00000000000a', 'Amend Guest'),
  ('ab0d0000-0000-4000-8000-000000000002', 'ab0a0000-0000-4000-8000-00000000000b', 'Other Guest');

-- 101-104 rooms, 105 a room let by the bed with 1051 under it, 106 out of
-- service, 107 a suite; 201 at the Property without a desk; 301 elsewhere.
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity, status, parent_id) values
  ('ab0c0000-0000-4000-8000-000000000101', 'ab0b0000-0000-4000-8000-000000000001', 'ab0a0000-0000-4000-8000-00000000000a', 'AB-101', 'room', 2, 'available', null),
  ('ab0c0000-0000-4000-8000-000000000102', 'ab0b0000-0000-4000-8000-000000000001', 'ab0a0000-0000-4000-8000-00000000000a', 'AB-102', 'room', 2, 'available', null),
  ('ab0c0000-0000-4000-8000-000000000103', 'ab0b0000-0000-4000-8000-000000000001', 'ab0a0000-0000-4000-8000-00000000000a', 'AB-103', 'room', 2, 'available', null),
  ('ab0c0000-0000-4000-8000-000000000104', 'ab0b0000-0000-4000-8000-000000000001', 'ab0a0000-0000-4000-8000-00000000000a', 'AB-104', 'room', 2, 'available', null),
  ('ab0c0000-0000-4000-8000-000000000105', 'ab0b0000-0000-4000-8000-000000000001', 'ab0a0000-0000-4000-8000-00000000000a', 'AB-105', 'room', 2, 'available', null),
  ('ab0c0000-0000-4000-8000-000000000106', 'ab0b0000-0000-4000-8000-000000000001', 'ab0a0000-0000-4000-8000-00000000000a', 'AB-106', 'room', 2, 'out_of_service', null),
  ('ab0c0000-0000-4000-8000-000000000107', 'ab0b0000-0000-4000-8000-000000000001', 'ab0a0000-0000-4000-8000-00000000000a', 'AB-107', 'suite', 4, 'available', null),
  ('ab0c0000-0000-4000-8000-000000000201', 'ab0b0000-0000-4000-8000-000000000002', 'ab0a0000-0000-4000-8000-00000000000a', 'AB-201', 'room', 2, 'available', null),
  ('ab0c0000-0000-4000-8000-000000000301', 'ab0b0000-0000-4000-8000-000000000003', 'ab0a0000-0000-4000-8000-00000000000b', 'AB-301', 'room', 2, 'available', null);
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity, status, parent_id) values
  ('ab0c0000-0000-4000-8000-000000001051', 'ab0b0000-0000-4000-8000-000000000001', 'ab0a0000-0000-4000-8000-00000000000a', 'AB-105-A', 'bed', 1, 'available', 'ab0c0000-0000-4000-8000-000000000105');

insert into public.property_rates (organization_id, property_id, unit_type, amount_minor) values
  ('ab0a0000-0000-4000-8000-00000000000a', 'ab0b0000-0000-4000-8000-000000000001', 'room', 150000),
  ('ab0a0000-0000-4000-8000-00000000000a', 'ab0b0000-0000-4000-8000-000000000001', 'suite', 300000);

-- Bookings are taken as the desk would take them, so the stamp prices them:
-- it reads the caller's reach, and the owner connection has none of its own.
select app.set_request_context('ab010000-0000-4000-8000-000000000001');

-- 1  101, in five days for three nights: the one amended most.
-- 2  104, the nights 1 is moved onto.
-- 3  102, in ten days: moved to a suite and back.
-- 4  103, cancelled.
-- 5  103, checked in, with a Guest in house until the day after tomorrow.
-- 6  102, arrived yesterday and nobody came.
-- 7  201, at the Property without a desk.
-- 8  301, in the other Organization.
insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id,
   stay_type, status, starts_on, ends_on) values
  ('ab0e0000-0000-4000-8000-000000000001', 'ab0a0000-0000-4000-8000-00000000000a', 'ab0b0000-0000-4000-8000-000000000001', 'ab0c0000-0000-4000-8000-000000000101', 'ab0d0000-0000-4000-8000-000000000001', 'guest', 'confirmed', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 5, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 8),
  ('ab0e0000-0000-4000-8000-000000000002', 'ab0a0000-0000-4000-8000-00000000000a', 'ab0b0000-0000-4000-8000-000000000001', 'ab0c0000-0000-4000-8000-000000000104', 'ab0d0000-0000-4000-8000-000000000001', 'guest', 'confirmed', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 6, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 8),
  ('ab0e0000-0000-4000-8000-000000000003', 'ab0a0000-0000-4000-8000-00000000000a', 'ab0b0000-0000-4000-8000-000000000001', 'ab0c0000-0000-4000-8000-000000000102', 'ab0d0000-0000-4000-8000-000000000001', 'guest', 'confirmed', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 10, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 12),
  ('ab0e0000-0000-4000-8000-000000000004', 'ab0a0000-0000-4000-8000-00000000000a', 'ab0b0000-0000-4000-8000-000000000001', 'ab0c0000-0000-4000-8000-000000000103', 'ab0d0000-0000-4000-8000-000000000001', 'guest', 'cancelled', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 20, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 21),
  ('ab0e0000-0000-4000-8000-000000000005', 'ab0a0000-0000-4000-8000-00000000000a', 'ab0b0000-0000-4000-8000-000000000001', 'ab0c0000-0000-4000-8000-000000000103', 'ab0d0000-0000-4000-8000-000000000001', 'guest', 'checked_in', app.property_today('ab0b0000-0000-4000-8000-000000000001') - 1, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 2),
  ('ab0e0000-0000-4000-8000-000000000006', 'ab0a0000-0000-4000-8000-00000000000a', 'ab0b0000-0000-4000-8000-000000000001', 'ab0c0000-0000-4000-8000-000000000102', 'ab0d0000-0000-4000-8000-000000000001', 'guest', 'confirmed', app.property_today('ab0b0000-0000-4000-8000-000000000001') - 1, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 1),
  ('ab0e0000-0000-4000-8000-000000000007', 'ab0a0000-0000-4000-8000-00000000000a', 'ab0b0000-0000-4000-8000-000000000002', 'ab0c0000-0000-4000-8000-000000000201', 'ab0d0000-0000-4000-8000-000000000001', 'guest', 'confirmed', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 5, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 6),
  ('ab0e0000-0000-4000-8000-000000000008', 'ab0a0000-0000-4000-8000-00000000000b', 'ab0b0000-0000-4000-8000-000000000003', 'ab0c0000-0000-4000-8000-000000000301', 'ab0d0000-0000-4000-8000-000000000002', 'guest', 'confirmed', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 5, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 6);

insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, reservation_id,
   stay_type, status, starts_on, ends_on) values
  ('ab0f0000-0000-4000-8000-000000000005', 'ab0a0000-0000-4000-8000-00000000000a', 'ab0b0000-0000-4000-8000-000000000001', 'ab0c0000-0000-4000-8000-000000000103', 'ab0e0000-0000-4000-8000-000000000005', 'guest', 'in_house', app.property_today('ab0b0000-0000-4000-8000-000000000001') - 1, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 2);

-- Rooms cost more now than when booking 1 was taken.
update public.property_rates set amount_minor = 175000
 where property_id = 'ab0b0000-0000-4000-8000-000000000001' and unit_type = 'room';

select app.set_request_context(null);

-- ---------------------------------------------------------------------------
-- The shape
-- ---------------------------------------------------------------------------

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'reservations'
       and grantee = 'ranza_app' and privilege_type = 'UPDATE'$$,
  array['status', 'updated_at'],
  'AB-S1-23: ranza_app still updates a booking''s status and nothing else');

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'stays'
       and grantee = 'ranza_app' and privilege_type = 'UPDATE'$$,
  array['status', 'ends_on', 'updated_at'],
  'AB-S1-23: and a Stay''s status and end, as check-out needs');

select set_eq(
  $$select privilege_type::text from information_schema.table_privileges
     where table_schema = 'public' and table_name = 'reservation_changes'
       and grantee = 'ranza_app'$$,
  array['SELECT'],
  'AB-S1-24: ranza_app reads the revisions and writes none of them');

select set_eq(
  $$select key from public.staff_roles
     where organization_id is null and 'front_desk.amend' = any (permissions)$$,
  array['owner', 'manager', 'front_desk'],
  'AB-S1-21: Owner, Manager and Front Desk hold front_desk.amend; Finance and Housekeeping do not');

select is(
  (select nightly_rate_minor from public.reservations where id = 'ab0e0000-0000-4000-8000-000000000001'),
  150000::bigint,
  'the fixture: booking 1 was taken at the price of the day');

-- ---------------------------------------------------------------------------
-- The desk
-- ---------------------------------------------------------------------------

set local role ranza_app;
select app.set_request_context('ab010000-0000-4000-8000-000000000001');

select results_eq(
  $$select current_unit_id, current_rate_minor, current_rate_currency
      from app.amend_reservation('ab0e0000-0000-4000-8000-000000000001', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 6, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 9, 'ab0c0000-0000-4000-8000-000000000101', 0, 'the Guest asked')$$,
  $$values ('ab0c0000-0000-4000-8000-000000000101'::uuid, '150000', 'TRY')$$,
  'AB-S1-01, AB-S1-04: a booking moves to other nights and keeps the price it was taken at, though rooms now cost more');

select results_eq(
  $$select kind, stay_id, business_date, from_starts_on, to_starts_on, from_ends_on, to_ends_on,
           from_unit_id, to_unit_id, from_rate_minor, to_rate_minor, note, changed_by
      from public.reservation_changes where reservation_id = 'ab0e0000-0000-4000-8000-000000000001'$$,
  $$values ('amended', null::uuid, app.property_today('ab0b0000-0000-4000-8000-000000000001'), app.property_today('ab0b0000-0000-4000-8000-000000000001') + 5, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 6, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 8, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 9,
            'ab0c0000-0000-4000-8000-000000000101'::uuid, 'ab0c0000-0000-4000-8000-000000000101'::uuid, 150000::bigint, 150000::bigint,
            'the Guest asked', 'ab010000-0000-4000-8000-000000000001'::uuid)$$,
  'AB-S1-24: and a revision records what it was, what it became, the business day, the note and who');

select throws_ok(
  $$select * from app.amend_reservation('ab0e0000-0000-4000-8000-000000000001', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 7, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 9, 'ab0c0000-0000-4000-8000-000000000101', 0, null)$$,
  'RZ003', null,
  'AB-S1-19: a change made against a version that no longer exists is refused');

select results_eq(
  $$select current_unit_id, current_rate_minor from app.amend_reservation('ab0e0000-0000-4000-8000-000000000001', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 6, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 9, 'ab0c0000-0000-4000-8000-000000000102', 1, null)$$,
  $$values ('ab0c0000-0000-4000-8000-000000000102'::uuid, '150000')$$,
  'AB-S1-02: moved to another room it holds the same nights at the same price');

select throws_ok(
  $$select * from app.amend_reservation('ab0e0000-0000-4000-8000-000000000001', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 6, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 9, 'ab0c0000-0000-4000-8000-000000000104', 2, null)$$,
  '23P01', null,
  'AB-S1-05: nights another booking holds are refused');

select throws_ok(
  $$select * from app.amend_reservation('ab0e0000-0000-4000-8000-000000000001', app.property_today('ab0b0000-0000-4000-8000-000000000001'), app.property_today('ab0b0000-0000-4000-8000-000000000001') + 1, 'ab0c0000-0000-4000-8000-000000000103', 2, null)$$,
  '55006', null,
  'AB-S1-06: so are nights a Guest in house is staying for');

select throws_ok(
  $$select * from app.amend_reservation('ab0e0000-0000-4000-8000-000000000001', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 6, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 9, 'ab0c0000-0000-4000-8000-000000000106', 2, null)$$,
  '55000', 'that Accommodation Unit is not in service',
  'AB-S1-15: a room out of service is refused');

select throws_ok(
  $$select * from app.amend_reservation('ab0e0000-0000-4000-8000-000000000001', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 6, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 9, 'ab0c0000-0000-4000-8000-000000000105', 2, null)$$,
  '55000', 'that Accommodation Unit is let by the bed, not as a whole',
  'AB-S1-16: and a room let by the bed');

select lives_ok(
  $$select * from app.amend_reservation('ab0e0000-0000-4000-8000-000000000001', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 6, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 9, 'ab0c0000-0000-4000-8000-000000001051', 2, null)$$,
  'AB-S1-16: while a bed under it can be chosen');

select throws_ok(
  $$select * from app.amend_reservation('ab0e0000-0000-4000-8000-000000000001', app.property_today('ab0b0000-0000-4000-8000-000000000001') - 1, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 9, 'ab0c0000-0000-4000-8000-000000001051', 3, null)$$,
  '23514', 'a booking cannot arrive before today',
  'AB-S1-10: an arrival is never moved into the past');

select throws_ok(
  $$select * from app.amend_reservation('ab0e0000-0000-4000-8000-000000000001', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 6, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 6, 'ab0c0000-0000-4000-8000-000000001051', 3, null)$$,
  '23514', null,
  'AB-S1-12: a changed booking still covers a night');

select throws_ok(
  $$select * from app.amend_reservation('ab0e0000-0000-4000-8000-000000000001', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 6, null, 'ab0c0000-0000-4000-8000-000000001051', 3, null)$$,
  '23514', 'a Guest booking has a departure',
  'AB-S1-12: and a Guest''s has a departure; only a Resident''s is open');

select throws_ok(
  $$select * from app.amend_reservation('ab0e0000-0000-4000-8000-000000000001', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 6, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 9, 'ab0c0000-0000-4000-8000-000000001051', 3, null)$$,
  '23514', 'that change changes nothing',
  'a change that changes nothing is not recorded as one');

select throws_ok(
  $$select * from app.amend_reservation('ab0e0000-0000-4000-8000-000000000006', app.property_today('ab0b0000-0000-4000-8000-000000000001') - 1, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 1, 'ab0c0000-0000-4000-8000-000000000102', 0, null)$$,
  '23514', 'a booking cannot arrive before today',
  'AB-S1-11: a booking whose arrival has passed keeps it only by being moved forward');

select lives_ok(
  $$select * from app.amend_reservation('ab0e0000-0000-4000-8000-000000000006', app.property_today('ab0b0000-0000-4000-8000-000000000001'), app.property_today('ab0b0000-0000-4000-8000-000000000001') + 1, 'ab0c0000-0000-4000-8000-000000000102', 0, null)$$,
  'AB-S1-11: to today, then');

select results_eq(
  $$select starts_on, status from public.reservations where id = 'ab0e0000-0000-4000-8000-000000000006'$$,
  $$values (app.property_today('ab0b0000-0000-4000-8000-000000000001'), 'confirmed')$$,
  'AB-S1-11: which is how a late arrival is checked in now; AB-S1-09 is in the integration suite');

select results_eq(
  $$select current_unit_id, current_rate_minor, current_rate_currency
      from app.amend_reservation('ab0e0000-0000-4000-8000-000000000003', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 10, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 12, 'ab0c0000-0000-4000-8000-000000000107', 0, null)$$,
  $$values ('ab0c0000-0000-4000-8000-000000000107'::uuid, '300000', 'TRY')$$,
  'AB-S1-03: moved to another kind of Unit, a booking takes today''s price for it');

select results_eq(
  $$select current_rate_minor from app.amend_reservation('ab0e0000-0000-4000-8000-000000000003', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 11, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 12, 'ab0c0000-0000-4000-8000-000000000107', 1, null)$$,
  $$values ('300000')$$,
  'AB-S1-04: and keeps that one when only its dates change after');

select results_eq(
  $$select current_rate_minor from app.amend_reservation('ab0e0000-0000-4000-8000-000000000003', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 11, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 12, 'ab0c0000-0000-4000-8000-000000000104', 2, null)$$,
  $$values ('175000')$$,
  'AB-S1-03: moved back to a room, it is the room''s price today, not the one it had');

reset role;
update public.property_rates set amount_minor = null
 where property_id = 'ab0b0000-0000-4000-8000-000000000001' and unit_type = 'suite';
set local role ranza_app;

select results_eq(
  $$select current_rate_minor, current_rate_currency from app.amend_reservation('ab0e0000-0000-4000-8000-000000000003', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 11, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 12, 'ab0c0000-0000-4000-8000-000000000107', 3, null)$$,
  $$values (null::text, null::text)$$,
  'AB-S1-03: and a kind nobody has priced leaves it unpriced');

select bag_eq(
  $$select from_rate_minor, to_rate_minor from public.reservation_changes
     where reservation_id = 'ab0e0000-0000-4000-8000-000000000003'$$,
  $$values (150000::bigint, 300000::bigint), (300000::bigint, 300000::bigint),
           (300000::bigint, 175000::bigint), (175000::bigint, null::bigint)$$,
  'AB-S1-24: each revision records the price before and after');

select throws_ok(
  $$select * from app.amend_reservation('ab0e0000-0000-4000-8000-000000000005', app.property_today('ab0b0000-0000-4000-8000-000000000001'), app.property_today('ab0b0000-0000-4000-8000-000000000001') + 3, 'ab0c0000-0000-4000-8000-000000000103', 0, null)$$,
  '42501', null,
  'AB-S1-14: a booking already checked in is not changed this way');

select throws_ok(
  $$select * from app.amend_reservation('ab0e0000-0000-4000-8000-000000000004', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 20, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 22, 'ab0c0000-0000-4000-8000-000000000103', 0, null)$$,
  '42501', null,
  'AB-S1-13: nor a cancelled one');

select throws_ok(
  $$select * from app.amend_reservation('ab0e0000-0000-4000-8000-000000000001', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 6, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 9, 'ab0c0000-0000-4000-8000-000000000201', 3, null)$$,
  '42501', null,
  'a booking is not moved to a Unit at another Property');

select throws_ok(
  $$select * from app.amend_reservation('ab0e0000-0000-4000-8000-000000000007', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 6, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 7, 'ab0c0000-0000-4000-8000-000000000201', 0, null)$$,
  '42501', null,
  'AB-S1-25: nor changed at a Property whose front desk is not enabled');

select throws_ok(
  $$select * from app.amend_reservation('ab0e0000-0000-4000-8000-000000000008', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 6, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 7, 'ab0c0000-0000-4000-8000-000000000301', 0, null)$$,
  '42501', null,
  'AB-S1-25: nor in another Organization');

select throws_ok(
  $$insert into public.reservation_changes
      (organization_id, property_id, reservation_id, kind, business_date,
       from_starts_on, to_starts_on, from_unit_id, to_unit_id, changed_by)
    values ('ab0a0000-0000-4000-8000-00000000000a', 'ab0b0000-0000-4000-8000-000000000001', 'ab0e0000-0000-4000-8000-000000000001', 'amended', app.property_today('ab0b0000-0000-4000-8000-000000000001'), app.property_today('ab0b0000-0000-4000-8000-000000000001'), app.property_today('ab0b0000-0000-4000-8000-000000000001'),
            'ab0c0000-0000-4000-8000-000000000101', 'ab0c0000-0000-4000-8000-000000000101', 'ab010000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'AB-S1-24: nobody writes a revision but the command');

-- ---------------------------------------------------------------------------
-- A check-in holder without front_desk.amend
-- ---------------------------------------------------------------------------

select app.set_request_context('ab010000-0000-4000-8000-000000000002');

select throws_ok(
  $$select * from app.amend_reservation('ab0e0000-0000-4000-8000-000000000002', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 6, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 9, 'ab0c0000-0000-4000-8000-000000000104', 0, null)$$,
  '42501', null,
  'AB-S1-22: without front_desk.amend no booking changes');

select throws_ok(
  $$update public.reservations set starts_on = starts_on + 1 where id = 'ab0e0000-0000-4000-8000-000000000002'$$,
  '42501', null,
  'AB-S1-23: nor through the update the check-in policy allows');

select throws_ok(
  $$update public.reservations set accommodation_unit_id = 'ab0c0000-0000-4000-8000-000000000101' where id = 'ab0e0000-0000-4000-8000-000000000002'$$,
  '42501', null,
  'AB-S1-23: nor its Unit');

-- ---------------------------------------------------------------------------
-- The other Organization
-- ---------------------------------------------------------------------------

select app.set_request_context('ab010000-0000-4000-8000-000000000003');

select throws_ok(
  $$select * from app.amend_reservation('ab0e0000-0000-4000-8000-000000000001', app.property_today('ab0b0000-0000-4000-8000-000000000001') + 6, app.property_today('ab0b0000-0000-4000-8000-000000000001') + 9, 'ab0c0000-0000-4000-8000-000000001051', 3, null)$$,
  '42501', null,
  'AB-S1-25: a desk in another Organization changes nothing here');

select is(
  (select count(*)::int from public.reservation_changes where organization_id = 'ab0a0000-0000-4000-8000-00000000000a'),
  0,
  'and reads none of its revisions');

select app.set_request_context('ab010000-0000-4000-8000-000000000001');

select is(
  (select count(*)::int from public.reservation_changes where organization_id = 'ab0a0000-0000-4000-8000-00000000000a'),
  8,
  'while the desk reads every one');

-- ---------------------------------------------------------------------------
-- For every role
-- ---------------------------------------------------------------------------

reset role;
select app.set_request_context(null);

select throws_ok(
  $$update public.reservation_changes set note = 'rewritten' where reservation_id = 'ab0e0000-0000-4000-8000-000000000001'$$,
  '42501', 'reservation_changes is append-only',
  'AB-S1-24: a revision is never rewritten, by the owner either');

select throws_ok(
  $$delete from public.reservation_changes where reservation_id = 'ab0e0000-0000-4000-8000-000000000001'$$,
  '42501', 'reservation_changes is append-only',
  'AB-S1-24: nor deleted');

select throws_ok(
  $$truncate public.reservation_changes$$,
  '42501', 'reservation_changes is append-only',
  'AB-S1-24: nor emptied');

select throws_ok(
  $$update public.reservations set starts_on = starts_on + 1 where id = 'ab0e0000-0000-4000-8000-000000000004'$$,
  '23514', 'a finished reservations keeps its dates and Unit',
  'AB-S1-13: a cancelled booking keeps its dates for every role');

select throws_ok(
  $$update public.stays set status = 'departed' where id = 'ab0f0000-0000-4000-8000-000000000005';
    update public.stays set ends_on = ends_on + 3 where id = 'ab0f0000-0000-4000-8000-000000000005'$$,
  '23514', 'a finished stays keeps its dates and Unit',
  'AB-S1-13: and a departed Stay its departure, which ranza_app could once rewrite');

select throws_ok(
  $$update public.reservations set nightly_rate_minor = 1 where id = 'ab0e0000-0000-4000-8000-000000000001'$$,
  '23514', 'a booking keeps the price it was taken at',
  'AB-S1-04: a price is still never set directly');

select throws_ok(
  $$update public.reservations set accommodation_unit_id = 'ab0c0000-0000-4000-8000-000000000107' where id = 'ab0e0000-0000-4000-8000-000000000002'$$,
  '42501', 'that Property is not reachable',
  'a re-price without reach refuses rather than erase the agreed price');

select * from finish();
rollback;
