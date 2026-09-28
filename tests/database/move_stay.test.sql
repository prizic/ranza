-- Moving an in-house Guest to another Unit (ADR 0039, docs/features/amend-booking,
-- slice 3).
--
-- app.move_stay() changes the Unit of a Stay and its booking from tonight;
-- the Stay, its Folio and its price go with the Guest. Whether the new Unit
-- may take them is decided by what decides it at check-in — in service, let
-- whole, nobody booked or in house — and readiness by the command. The room
-- left reads dirty at once, and the worker marks it so on the board.
--
-- Rows in docs/features/amend-booking/edge-cases.csv are named beside the
-- assertion that proves them; the breaks applied, each seen red, are listed in
-- docs/evidence/amend-booking/README.md.
begin;
select plan(49);

insert into public.users (id, email) values
  ('ad010000-0000-4000-8000-000000000001', 'ad-desk@example.test'),
  ('ad010000-0000-4000-8000-000000000002', 'ad-check-in-only@example.test');
insert into public.organizations (id, name, status) values
  ('ad0a0000-0000-4000-8000-00000000000a', 'Move Organization', 'active'),
  ('ad0a0000-0000-4000-8000-00000000000b', 'Move Other Organization', 'active'),
  ('ad0a0000-0000-4000-8000-00000000000c', 'Move Lapsed Organization', 'active');
insert into public.properties (id, organization_id, name, currency) values
  ('ad0b0000-0000-4000-8000-000000000001', 'ad0a0000-0000-4000-8000-00000000000a', 'Move Property', 'TRY'),
  ('ad0b0000-0000-4000-8000-000000000002', 'ad0a0000-0000-4000-8000-00000000000a', 'Move Property Without A Desk', 'TRY'),
  ('ad0b0000-0000-4000-8000-000000000003', 'ad0a0000-0000-4000-8000-00000000000b', 'Move Other Property', 'TRY'),
  ('ad0b0000-0000-4000-8000-000000000004', 'ad0a0000-0000-4000-8000-00000000000c', 'Move Lapsed Property', 'TRY');
-- ORG3's Subscription has lapsed; the desk is a member there as well.
insert into public.subscriptions (organization_id, status) values
  ('ad0a0000-0000-4000-8000-00000000000a', 'active'), ('ad0a0000-0000-4000-8000-00000000000b', 'active'), ('ad0a0000-0000-4000-8000-00000000000c', 'suspended');
insert into public.entitlements (organization_id, module_key) values
  ('ad0a0000-0000-4000-8000-00000000000a', 'front_office'), ('ad0a0000-0000-4000-8000-00000000000a', 'housekeeping'),
  ('ad0a0000-0000-4000-8000-00000000000b', 'front_office'), ('ad0a0000-0000-4000-8000-00000000000c', 'front_office');
insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('ad0b0000-0000-4000-8000-000000000001', 'ad0a0000-0000-4000-8000-00000000000a', 'front_desk', true),
  ('ad0b0000-0000-4000-8000-000000000001', 'ad0a0000-0000-4000-8000-00000000000a', 'housekeeping', true),
  ('ad0b0000-0000-4000-8000-000000000002', 'ad0a0000-0000-4000-8000-00000000000a', 'housekeeping', true),
  ('ad0b0000-0000-4000-8000-000000000003', 'ad0a0000-0000-4000-8000-00000000000b', 'front_desk', true),
  ('ad0b0000-0000-4000-8000-000000000004', 'ad0a0000-0000-4000-8000-00000000000c', 'front_desk', true);
insert into public.staff_roles (scope_id, key, organization_id, name, permissions) values
  ('ad0a0000-0000-4000-8000-00000000000a', 'ad_check_in', 'ad0a0000-0000-4000-8000-00000000000a', 'Check-in only', array['front_desk.check_in']);
insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('ad0a0000-0000-4000-8000-00000000000a', 'ad010000-0000-4000-8000-000000000001', 'front_desk', 'organization_wide'),
  ('ad0a0000-0000-4000-8000-00000000000c', 'ad010000-0000-4000-8000-000000000001', 'front_desk', 'organization_wide');
insert into public.organization_memberships
  (organization_id, user_id, role, role_scope_id, access_scope) values
  ('ad0a0000-0000-4000-8000-00000000000a', 'ad010000-0000-4000-8000-000000000002', 'ad_check_in', 'ad0a0000-0000-4000-8000-00000000000a', 'organization_wide');
insert into public.guests (id, organization_id, full_name) values
  ('ad0d0000-0000-4000-8000-000000000001', 'ad0a0000-0000-4000-8000-00000000000a', 'Move Guest'),
  ('ad0d0000-0000-4000-8000-000000000002', 'ad0a0000-0000-4000-8000-00000000000b', 'Other Guest'),
  ('ad0d0000-0000-4000-8000-000000000003', 'ad0a0000-0000-4000-8000-00000000000c', 'Lapsed Guest');

-- 101-104 and 108 rooms, 105 let by the bed (1051, 1052), 106 out of service,
-- 107 a suite; 201 at the Property without a desk.
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity, status, parent_id) values
  ('ad0c0000-0000-4000-8000-000000000101', 'ad0b0000-0000-4000-8000-000000000001', 'ad0a0000-0000-4000-8000-00000000000a', 'AD-101', 'room', 2, 'available', null),
  ('ad0c0000-0000-4000-8000-000000000102', 'ad0b0000-0000-4000-8000-000000000001', 'ad0a0000-0000-4000-8000-00000000000a', 'AD-102', 'room', 2, 'available', null),
  ('ad0c0000-0000-4000-8000-000000000103', 'ad0b0000-0000-4000-8000-000000000001', 'ad0a0000-0000-4000-8000-00000000000a', 'AD-103', 'room', 2, 'available', null),
  ('ad0c0000-0000-4000-8000-000000000104', 'ad0b0000-0000-4000-8000-000000000001', 'ad0a0000-0000-4000-8000-00000000000a', 'AD-104', 'room', 2, 'available', null),
  ('ad0c0000-0000-4000-8000-000000000105', 'ad0b0000-0000-4000-8000-000000000001', 'ad0a0000-0000-4000-8000-00000000000a', 'AD-105', 'room', 2, 'available', null),
  ('ad0c0000-0000-4000-8000-000000000106', 'ad0b0000-0000-4000-8000-000000000001', 'ad0a0000-0000-4000-8000-00000000000a', 'AD-106', 'room', 2, 'out_of_service', null),
  ('ad0c0000-0000-4000-8000-000000000107', 'ad0b0000-0000-4000-8000-000000000001', 'ad0a0000-0000-4000-8000-00000000000a', 'AD-107', 'suite', 4, 'available', null),
  ('ad0c0000-0000-4000-8000-000000000108', 'ad0b0000-0000-4000-8000-000000000001', 'ad0a0000-0000-4000-8000-00000000000a', 'AD-108', 'room', 2, 'available', null),
  ('ad0c0000-0000-4000-8000-000000000109', 'ad0b0000-0000-4000-8000-000000000001', 'ad0a0000-0000-4000-8000-00000000000a', 'AD-109', 'room', 2, 'available', null),
  ('ad0c0000-0000-4000-8000-000000000110', 'ad0b0000-0000-4000-8000-000000000001', 'ad0a0000-0000-4000-8000-00000000000a', 'AD-110', 'room', 2, 'available', null),
  ('ad0c0000-0000-4000-8000-000000000111', 'ad0b0000-0000-4000-8000-000000000001', 'ad0a0000-0000-4000-8000-00000000000a', 'AD-111', 'room', 2, 'available', null),
  ('ad0c0000-0000-4000-8000-000000000301', 'ad0b0000-0000-4000-8000-000000000003', 'ad0a0000-0000-4000-8000-00000000000b', 'AD-301', 'room', 2, 'available', null),
  ('ad0c0000-0000-4000-8000-000000000302', 'ad0b0000-0000-4000-8000-000000000003', 'ad0a0000-0000-4000-8000-00000000000b', 'AD-302', 'room', 2, 'available', null),
  ('ad0c0000-0000-4000-8000-000000000401', 'ad0b0000-0000-4000-8000-000000000004', 'ad0a0000-0000-4000-8000-00000000000c', 'AD-401', 'room', 2, 'available', null),
  ('ad0c0000-0000-4000-8000-000000000402', 'ad0b0000-0000-4000-8000-000000000004', 'ad0a0000-0000-4000-8000-00000000000c', 'AD-402', 'room', 2, 'available', null),
  ('ad0c0000-0000-4000-8000-000000000201', 'ad0b0000-0000-4000-8000-000000000002', 'ad0a0000-0000-4000-8000-00000000000a', 'AD-201', 'room', 2, 'available', null);
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity, status, parent_id) values
  ('ad0c0000-0000-4000-8000-000000001051', 'ad0b0000-0000-4000-8000-000000000001', 'ad0a0000-0000-4000-8000-00000000000a', 'AD-105-A', 'bed', 1, 'available', 'ad0c0000-0000-4000-8000-000000000105'),
  ('ad0c0000-0000-4000-8000-000000001052', 'ad0b0000-0000-4000-8000-000000000001', 'ad0a0000-0000-4000-8000-00000000000a', 'AD-105-B', 'bed', 1, 'available', 'ad0c0000-0000-4000-8000-000000000105'),
  ('ad0c0000-0000-4000-8000-000000001053', 'ad0b0000-0000-4000-8000-000000000001', 'ad0a0000-0000-4000-8000-00000000000a', 'AD-105-C', 'bed', 1, 'available', 'ad0c0000-0000-4000-8000-000000000105');

-- 108 is waiting to be cleaned.
insert into public.housekeeping_unit_status
  (accommodation_unit_id, property_id, organization_id, status)
values ('ad0c0000-0000-4000-8000-000000000108', 'ad0b0000-0000-4000-8000-000000000001', 'ad0a0000-0000-4000-8000-00000000000a', 'dirty');

insert into public.property_rates (organization_id, property_id, unit_type, amount_minor) values
  ('ad0a0000-0000-4000-8000-00000000000a', 'ad0b0000-0000-4000-8000-000000000001', 'room', 150000), ('ad0a0000-0000-4000-8000-00000000000a', 'ad0b0000-0000-4000-8000-000000000001', 'suite', 300000);

-- Taken as the desk takes them, so the stamp prices the Guest's booking.
select app.set_request_context('ad010000-0000-4000-8000-000000000001');

-- 1  101, the Guest who moves, in house since two days ago for two more.
-- 2  103, a booking arriving tonight.
-- 3  104, somebody else in house.
-- 4  bed 1051, a Guest in a bed.
-- 5  201, in house at the Property without a desk.
-- 6  104, a Stay that departed before 3 arrived.
insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id,
   stay_type, status, starts_on, ends_on) values
  ('ad0e0000-0000-4000-8000-000000000001', 'ad0a0000-0000-4000-8000-00000000000a', 'ad0b0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000000101', 'ad0d0000-0000-4000-8000-000000000001', 'guest', 'checked_in', app.property_today('ad0b0000-0000-4000-8000-000000000001') - 2, app.property_today('ad0b0000-0000-4000-8000-000000000001') + 2),
  ('ad0e0000-0000-4000-8000-000000000002', 'ad0a0000-0000-4000-8000-00000000000a', 'ad0b0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000000103', 'ad0d0000-0000-4000-8000-000000000001', 'guest', 'confirmed', app.property_today('ad0b0000-0000-4000-8000-000000000001'), app.property_today('ad0b0000-0000-4000-8000-000000000001') + 1),
  ('ad0e0000-0000-4000-8000-000000000003', 'ad0a0000-0000-4000-8000-00000000000a', 'ad0b0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000000104', 'ad0d0000-0000-4000-8000-000000000001', 'guest', 'checked_in', app.property_today('ad0b0000-0000-4000-8000-000000000001') - 1, app.property_today('ad0b0000-0000-4000-8000-000000000001') + 3),
  ('ad0e0000-0000-4000-8000-000000000004', 'ad0a0000-0000-4000-8000-00000000000a', 'ad0b0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000001051', 'ad0d0000-0000-4000-8000-000000000001', 'guest', 'checked_in', app.property_today('ad0b0000-0000-4000-8000-000000000001') - 1, app.property_today('ad0b0000-0000-4000-8000-000000000001') + 3),
  ('ad0e0000-0000-4000-8000-000000000005', 'ad0a0000-0000-4000-8000-00000000000a', 'ad0b0000-0000-4000-8000-000000000002', 'ad0c0000-0000-4000-8000-000000000201', 'ad0d0000-0000-4000-8000-000000000001', 'guest', 'checked_in', app.property_today('ad0b0000-0000-4000-8000-000000000001') - 1, app.property_today('ad0b0000-0000-4000-8000-000000000001') + 3),
  ('ad0e0000-0000-4000-8000-000000000006', 'ad0a0000-0000-4000-8000-00000000000a', 'ad0b0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000000104', 'ad0d0000-0000-4000-8000-000000000001', 'guest', 'checked_out', app.property_today('ad0b0000-0000-4000-8000-000000000001') - 5, app.property_today('ad0b0000-0000-4000-8000-000000000001') - 3),
  ('ad0e0000-0000-4000-8000-000000000007', 'ad0a0000-0000-4000-8000-00000000000a', 'ad0b0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000000109', 'ad0d0000-0000-4000-8000-000000000001', 'guest', 'checked_in', app.property_today('ad0b0000-0000-4000-8000-000000000001') - 3, app.property_today('ad0b0000-0000-4000-8000-000000000001') - 1),
  ('ad0e0000-0000-4000-8000-000000000008', 'ad0a0000-0000-4000-8000-00000000000b', 'ad0b0000-0000-4000-8000-000000000003', 'ad0c0000-0000-4000-8000-000000000301', 'ad0d0000-0000-4000-8000-000000000002', 'guest', 'checked_in', app.property_today('ad0b0000-0000-4000-8000-000000000001') - 1, app.property_today('ad0b0000-0000-4000-8000-000000000001') + 3),
  ('ad0e0000-0000-4000-8000-000000000009', 'ad0a0000-0000-4000-8000-00000000000c', 'ad0b0000-0000-4000-8000-000000000004', 'ad0c0000-0000-4000-8000-000000000401', 'ad0d0000-0000-4000-8000-000000000003', 'guest', 'checked_in', app.property_today('ad0b0000-0000-4000-8000-000000000001') - 1, app.property_today('ad0b0000-0000-4000-8000-000000000001') + 3),
  ('ad0e0000-0000-4000-8000-000000000010', 'ad0a0000-0000-4000-8000-00000000000a', 'ad0b0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000001053', 'ad0d0000-0000-4000-8000-000000000001', 'guest', 'checked_in', app.property_today('ad0b0000-0000-4000-8000-000000000001') - 1, app.property_today('ad0b0000-0000-4000-8000-000000000001') + 3);
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, reservation_id,
   stay_type, status, starts_on, ends_on) values
  ('ad0f0000-0000-4000-8000-000000000001', 'ad0a0000-0000-4000-8000-00000000000a', 'ad0b0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000000101', 'ad0e0000-0000-4000-8000-000000000001', 'guest', 'in_house', app.property_today('ad0b0000-0000-4000-8000-000000000001') - 2, app.property_today('ad0b0000-0000-4000-8000-000000000001') + 2),
  ('ad0f0000-0000-4000-8000-000000000003', 'ad0a0000-0000-4000-8000-00000000000a', 'ad0b0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000000104', 'ad0e0000-0000-4000-8000-000000000003', 'guest', 'in_house', app.property_today('ad0b0000-0000-4000-8000-000000000001') - 1, app.property_today('ad0b0000-0000-4000-8000-000000000001') + 3),
  ('ad0f0000-0000-4000-8000-000000000004', 'ad0a0000-0000-4000-8000-00000000000a', 'ad0b0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000001051', 'ad0e0000-0000-4000-8000-000000000004', 'guest', 'in_house', app.property_today('ad0b0000-0000-4000-8000-000000000001') - 1, app.property_today('ad0b0000-0000-4000-8000-000000000001') + 3),
  ('ad0f0000-0000-4000-8000-000000000005', 'ad0a0000-0000-4000-8000-00000000000a', 'ad0b0000-0000-4000-8000-000000000002', 'ad0c0000-0000-4000-8000-000000000201', 'ad0e0000-0000-4000-8000-000000000005', 'guest', 'in_house', app.property_today('ad0b0000-0000-4000-8000-000000000001') - 1, app.property_today('ad0b0000-0000-4000-8000-000000000001') + 3),
  ('ad0f0000-0000-4000-8000-000000000006', 'ad0a0000-0000-4000-8000-00000000000a', 'ad0b0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000000104', 'ad0e0000-0000-4000-8000-000000000006', 'guest', 'departed', app.property_today('ad0b0000-0000-4000-8000-000000000001') - 5, app.property_today('ad0b0000-0000-4000-8000-000000000001') - 3),
  ('ad0f0000-0000-4000-8000-000000000007', 'ad0a0000-0000-4000-8000-00000000000a', 'ad0b0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000000109', 'ad0e0000-0000-4000-8000-000000000007', 'guest', 'in_house', app.property_today('ad0b0000-0000-4000-8000-000000000001') - 3, app.property_today('ad0b0000-0000-4000-8000-000000000001') - 1),
  ('ad0f0000-0000-4000-8000-000000000008', 'ad0a0000-0000-4000-8000-00000000000b', 'ad0b0000-0000-4000-8000-000000000003', 'ad0c0000-0000-4000-8000-000000000301', 'ad0e0000-0000-4000-8000-000000000008', 'guest', 'in_house', app.property_today('ad0b0000-0000-4000-8000-000000000001') - 1, app.property_today('ad0b0000-0000-4000-8000-000000000001') + 3),
  ('ad0f0000-0000-4000-8000-000000000009', 'ad0a0000-0000-4000-8000-00000000000c', 'ad0b0000-0000-4000-8000-000000000004', 'ad0c0000-0000-4000-8000-000000000401', 'ad0e0000-0000-4000-8000-000000000009', 'guest', 'in_house', app.property_today('ad0b0000-0000-4000-8000-000000000001') - 1, app.property_today('ad0b0000-0000-4000-8000-000000000001') + 3),
  ('ad0f0000-0000-4000-8000-000000000010', 'ad0a0000-0000-4000-8000-00000000000a', 'ad0b0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000001053', 'ad0e0000-0000-4000-8000-000000000010', 'guest', 'in_house', app.property_today('ad0b0000-0000-4000-8000-000000000001') - 1, app.property_today('ad0b0000-0000-4000-8000-000000000001') + 3);

-- The days before yesterday are closed, as they are at any Property that has
-- been open a while: the Guest who moves arrived on a day since closed.
-- Yesterday is left open for the withdrawal below, which would otherwise be
-- refused for the closed day before it could be refused for the move.
set local session_replication_role = replica;
insert into public.business_day_closes
  (organization_id, property_id, business_date, closed_by_job)
select 'ad0a0000-0000-4000-8000-00000000000a', 'ad0b0000-0000-4000-8000-000000000001', app.property_today('ad0b0000-0000-4000-8000-000000000001') - n, 'test.fixture' from generate_series(2, 3) as n;
set local session_replication_role = origin;

select app.set_request_context(null);

create temporary table spent as
  select business_date from app.room_nights_due('ad0b0000-0000-4000-8000-000000000001', app.property_today('ad0b0000-0000-4000-8000-000000000001') - 2, app.property_today('ad0b0000-0000-4000-8000-000000000001') - 1, 'ad0f0000-0000-4000-8000-000000000001');
grant select on spent to ranza_app;

select is((select count(*)::int from spent), 2,
  'the fixture: the Guest has spent two nights, so AB-S3-06 compares something');
select is((select nightly_rate_minor from public.reservations where id = 'ad0e0000-0000-4000-8000-000000000001'),
  150000::bigint, 'the fixture: the Guest''s booking was taken at the room price');

set local role ranza_app;
select app.set_request_context('ad010000-0000-4000-8000-000000000001');

select results_eq(
  $$select previous_unit_id, current_unit_id from app.move_stay('ad0f0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000000102', 'fault', 'The shower leaks', 0)$$,
  $$values ('ad0c0000-0000-4000-8000-000000000101'::uuid, 'ad0c0000-0000-4000-8000-000000000102'::uuid)$$,
  'AB-S3-01, AB-S3-10: a Guest in house moves to another room, though they arrived on a day since closed');

select results_eq(
  $$select stay.accommodation_unit_id, reservation.accommodation_unit_id,
           reservation.nightly_rate_minor, stay.status
      from public.stays as stay
      join public.reservations as reservation on reservation.id = stay.reservation_id
     where stay.id = 'ad0f0000-0000-4000-8000-000000000001'$$,
  $$values ('ad0c0000-0000-4000-8000-000000000102'::uuid, 'ad0c0000-0000-4000-8000-000000000102'::uuid, 150000::bigint, 'in_house')$$,
  'AB-S3-01: the same Stay and booking, in the new room, at the same price');

select results_eq(
  $$select kind, stay_id, from_unit_id, to_unit_id, reason_kind, note, business_date, changed_by
      from public.reservation_changes where stay_id = 'ad0f0000-0000-4000-8000-000000000001'$$,
  $$values ('moved', 'ad0f0000-0000-4000-8000-000000000001'::uuid, 'ad0c0000-0000-4000-8000-000000000101'::uuid, 'ad0c0000-0000-4000-8000-000000000102'::uuid,
            'fault', 'The shower leaks', app.property_today('ad0b0000-0000-4000-8000-000000000001'), 'ad010000-0000-4000-8000-000000000001'::uuid)$$,
  'AB-S3-02, AB-S1-24: the move is a revision with its reason, the business day and who');

select is(
  (select status from app.unit_housekeeping_state('ad0c0000-0000-4000-8000-000000000101')),
  'dirty',
  'AB-S3-08: the room left reads dirty at once, before the worker has run');

select ok(not app.unit_is_ready('ad0c0000-0000-4000-8000-000000000101'),
  'AB-S3-08: and is not ready for the next Guest');

select throws_ok(
  $$select * from app.move_stay('ad0f0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000000101', 'fault', null, 0)$$,
  'RZ003', null,
  'AB-S3-09: a move against a version that no longer exists is refused');

select throws_ok(
  $$select * from app.move_stay('ad0f0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000000107', null, null, 1)$$,
  '23514', null,
  'AB-S3-02: a move says why');

select throws_ok(
  $$select * from app.move_stay('ad0f0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000000107', 'other', null, 1)$$,
  '23514', null,
  'AB-S3-02: and "other" says it in a note');

select throws_ok(
  $$select * from app.move_stay('ad0f0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000000103', 'guest_request', null, 1)$$,
  '55006', null,
  'AB-S3-04: a room a booking holds tonight is refused');

select throws_ok(
  $$select * from app.move_stay('ad0f0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000000104', 'guest_request', null, 1)$$,
  '23P01', null,
  'AB-S3-04: and a room somebody is in, by stays_no_double_booking as at check-in');

select throws_ok(
  $$select * from app.move_stay('ad0f0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000000106', 'guest_request', null, 1)$$,
  '55000', 'that Accommodation Unit is not in service',
  'a room out of service is refused, as at check-in');

select throws_ok(
  $$select * from app.move_stay('ad0f0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000000105', 'guest_request', null, 1)$$,
  '55000', 'that Accommodation Unit is let by the bed, not as a whole',
  'AB-S3-07: a room let by the bed is refused; its beds are Units');

select throws_ok(
  $$select * from app.move_stay('ad0f0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000000108', 'guest_request', null, 1)$$,
  'RZ002', 'that Accommodation Unit is not ready',
  'AB-S3-03: a room waiting to be cleaned is refused');

select throws_ok(
  $$select * from app.move_stay('ad0f0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000000102', 'guest_request', null, 1)$$,
  '23514', 'that change changes nothing',
  'a move to the room the Guest is in changes nothing');

select throws_ok(
  $$select * from app.move_stay('ad0f0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000000201', 'guest_request', null, 1)$$,
  '42501', null,
  'a Guest is not moved to another Property');

select results_eq(
  $$select accommodation_unit_id, starts_on, ends_on, is_last
      from app.stay_unit_segments('ad0f0000-0000-4000-8000-000000000001') order by starts_on, is_last$$,
  $$values ('ad0c0000-0000-4000-8000-000000000101'::uuid, app.property_today('ad0b0000-0000-4000-8000-000000000001') - 2, app.property_today('ad0b0000-0000-4000-8000-000000000001'), false),
           ('ad0c0000-0000-4000-8000-000000000102'::uuid, app.property_today('ad0b0000-0000-4000-8000-000000000001'), app.property_today('ad0b0000-0000-4000-8000-000000000001') + 2, true)$$,
  'AB-S3-06: the nights slept stay against 101, and from tonight the Guest is in 102');

select results_eq(
  $$select business_date from app.room_nights_due('ad0b0000-0000-4000-8000-000000000001', app.property_today('ad0b0000-0000-4000-8000-000000000001') - 2, app.property_today('ad0b0000-0000-4000-8000-000000000001') - 1, 'ad0f0000-0000-4000-8000-000000000001')$$,
  $$select business_date from spent$$,
  'AB-S3-06: the nights already spent are the same nights after the move');

select results_eq(
  $$select current_unit_id from app.move_stay('ad0f0000-0000-4000-8000-000000000003', 'ad0c0000-0000-4000-8000-000000000107', 'upgrade', null, 0)$$,
  $$values ('ad0c0000-0000-4000-8000-000000000107'::uuid)$$,
  'AB-S3-01: another Guest is moved to a suite');

select is(
  (select nightly_rate_minor from public.reservations where id = 'ad0e0000-0000-4000-8000-000000000003'),
  150000::bigint,
  'AB-S3-05: a move to another kind keeps the booked price');

select results_eq(
  $$select accommodation_unit_id, starts_on, is_last
      from app.stay_unit_segments('ad0f0000-0000-4000-8000-000000000003') order by starts_on, is_last$$,
  $$values ('ad0c0000-0000-4000-8000-000000000104'::uuid, app.property_today('ad0b0000-0000-4000-8000-000000000001') - 1, false), ('ad0c0000-0000-4000-8000-000000000107'::uuid, app.property_today('ad0b0000-0000-4000-8000-000000000001'), true)$$,
  'AB-S3-06: a Stay moved once is two stretches');

select lives_ok(
  $$select * from app.move_stay('ad0f0000-0000-4000-8000-000000000004', 'ad0c0000-0000-4000-8000-000000001052', 'guest_request', null, 0)$$,
  'AB-S3-07: a Guest in a bed moves to another bed like any other');

select isnt(
  (select status from app.unit_housekeeping_state('ad0c0000-0000-4000-8000-000000000105')),
  'dirty',
  'AB-S3-07: and a move between beds of one room leaves no room to clean');

select lives_ok(
  $$select * from app.move_stay('ad0f0000-0000-4000-8000-000000000010', 'ad0c0000-0000-4000-8000-000000000111', 'guest_request', null, 0)$$,
  'AB-S3-07: a Guest in a bed moves to a room');

select is(
  (select status from app.unit_housekeeping_state('ad0c0000-0000-4000-8000-000000000105')),
  'dirty',
  'AB-S3-07, AB-S3-08: and the room their bed is in reads dirty');

select throws_ok(
  $$select * from app.move_stay('ad0f0000-0000-4000-8000-000000000008', 'ad0c0000-0000-4000-8000-000000000302', 'guest_request', null, 0)$$,
  '42501', null,
  'AB-S1-25: a desk in another Organization moves nobody there');

select throws_ok(
  $$select * from app.move_stay('ad0f0000-0000-4000-8000-000000000009', 'ad0c0000-0000-4000-8000-000000000402', 'guest_request', null, 0)$$,
  '42501', null,
  'AB-S1-25: nor where the Subscription has lapsed, though a member');

select lives_ok(
  $$select * from app.move_stay('ad0f0000-0000-4000-8000-000000000007', 'ad0c0000-0000-4000-8000-000000000110', 'guest_request', null, 0)$$,
  'a Guest past their departure is moved like any other');

select results_eq(
  $$select accommodation_unit_id, starts_on, ends_on, is_last
      from app.stay_unit_segments('ad0f0000-0000-4000-8000-000000000007') order by is_last$$,
  $$values ('ad0c0000-0000-4000-8000-000000000109'::uuid, app.property_today('ad0b0000-0000-4000-8000-000000000001') - 3, app.property_today('ad0b0000-0000-4000-8000-000000000001'), false),
           ('ad0c0000-0000-4000-8000-000000000110'::uuid, app.property_today('ad0b0000-0000-4000-8000-000000000001'), app.property_today('ad0b0000-0000-4000-8000-000000000001') - 1, true)$$,
  'AB-S3-06: an overdue Guest''s nights stay in the room they slept in, and the one they are in now starts tonight');

select throws_ok(
  $$select * from app.move_stay('ad0f0000-0000-4000-8000-000000000005', 'ad0c0000-0000-4000-8000-000000000201', 'guest_request', null, 0)$$,
  '42501', null,
  'AB-S1-25: nor at a Property whose front desk is not enabled');

select throws_ok(
  $$select * from app.move_stay('ad0f0000-0000-4000-8000-000000000006', 'ad0c0000-0000-4000-8000-000000000102', 'guest_request', null, 0)$$,
  '42501', null,
  'a departed Stay is not moved');

select app.set_request_context('ad010000-0000-4000-8000-000000000002');

select throws_ok(
  $$select * from app.move_stay('ad0f0000-0000-4000-8000-000000000003', 'ad0c0000-0000-4000-8000-000000000102', 'guest_request', null, 0)$$,
  '42501', null,
  'AB-S1-22: without front_desk.amend no Guest is moved');

select throws_ok(
  $$update public.stays set accommodation_unit_id = 'ad0c0000-0000-4000-8000-000000000108' where id = 'ad0f0000-0000-4000-8000-000000000003'$$,
  '42501', null,
  'AB-S1-23: nor through any update the check-in policy allows');

-- ---------------------------------------------------------------------------
-- The worker
-- ---------------------------------------------------------------------------

reset role;
select app.set_request_context(null);

create temporary table moved as
  select to_unit_id, id from public.reservation_changes
   where stay_id in ('ad0f0000-0000-4000-8000-000000000001', 'ad0f0000-0000-4000-8000-000000000004', 'ad0f0000-0000-4000-8000-000000000010') and kind = 'moved';

insert into outbox.events (id, organization_id, event_type, payload) values
  ('ad0e1000-0000-4000-8000-000000000001', 'ad0a0000-0000-4000-8000-00000000000a', 'stay.moved',
   jsonb_build_object('changeId', (select id from moved where to_unit_id = 'ad0c0000-0000-4000-8000-000000000102'))),
  ('ad0e1000-0000-4000-8000-000000000002', 'ad0a0000-0000-4000-8000-00000000000a', 'stay.moved',
   jsonb_build_object('changeId', (select id from moved where to_unit_id = 'ad0c0000-0000-4000-8000-000000001052'))),
  ('ad0e1000-0000-4000-8000-000000000003', 'ad0a0000-0000-4000-8000-00000000000a', 'stay.moved',
   jsonb_build_object('changeId', gen_random_uuid(), 'fromUnitId', 'ad0c0000-0000-4000-8000-000000000103')),
  ('ad0e1000-0000-4000-8000-000000000004', 'ad0a0000-0000-4000-8000-00000000000a', 'stay.checked_out',
   jsonb_build_object('changeId', (select id from moved where to_unit_id = 'ad0c0000-0000-4000-8000-000000000102'))),
  ('ad0e1000-0000-4000-8000-000000000005', 'ad0a0000-0000-4000-8000-00000000000b', 'stay.moved',
   jsonb_build_object('changeId', (select id from moved where to_unit_id = 'ad0c0000-0000-4000-8000-000000000102'))),
  ('ad0e1000-0000-4000-8000-000000000006', 'ad0a0000-0000-4000-8000-00000000000a', 'stay.moved',
   jsonb_build_object('changeId', (select id from moved where to_unit_id = 'ad0c0000-0000-4000-8000-000000000111')));

select set_config('app.user_id', '', true);
set local role ranza_worker;

select throws_ok(
  $$select app.mark_unit_dirty_after_move('ad0e1000-0000-4000-8000-000000000001')$$,
  '42501', 'marking a room dirty requires a worker context',
  'AB-S3-08: without a worker context the function refuses before reading anything');

select app.set_worker_context('ad0a0000-0000-4000-8000-00000000000a', 'housekeeping.markRoomDirtyOnMove');

select throws_ok(
  $$select app.mark_unit_dirty_after_move('ad0e1000-0000-4000-8000-000000000005')$$,
  '42501', 'that event belongs to another Organization',
  'AB-S3-08: an event of another Organization is refused');

select is(app.mark_unit_dirty_after_move('ad0e1000-0000-4000-8000-000000000004'), false,
  'AB-S3-08: an event that is not a move marks nothing');

select is(app.mark_unit_dirty_after_move('ad0e1000-0000-4000-8000-000000000003'), false,
  'AB-S3-08: a payload naming a room, and no move that happened, marks nothing');

select is(app.mark_unit_dirty_after_move('ad0e1000-0000-4000-8000-000000000002'), false,
  'AB-S3-07, AB-S3-08: a move between beds of one room marks nothing');

select is(app.mark_unit_dirty_after_move('ad0e1000-0000-4000-8000-000000000001'), true,
  'AB-S3-08: a move marks the room the Guest left');

select is(app.mark_unit_dirty_after_move('ad0e1000-0000-4000-8000-000000000001'), false,
  'AB-S3-08: the same move delivered again changes nothing');

select is(app.mark_unit_dirty_after_move('ad0e1000-0000-4000-8000-000000000006'), true,
  'AB-S3-07, AB-S3-08: a Guest moved from a bed to a room leaves the bed''s room to clean');

set local role none;

select results_eq(
  $$select unit.name, state.status
      from public.housekeeping_unit_status as state
      join public.accommodation_units as unit on unit.id = state.accommodation_unit_id
     where state.organization_id = 'ad0a0000-0000-4000-8000-00000000000a'
     order by unit.name$$,
  $$values ('AD-101'::text, 'dirty'::text), ('AD-105', 'dirty'), ('AD-108', 'dirty')$$,
  'AB-S3-08: 101 is dirty on the board; nothing else was marked, 103 least of all (104 was left too, but no event for it was delivered)');

-- ---------------------------------------------------------------------------
-- What readiness counts, and what it does not
-- ---------------------------------------------------------------------------

-- A move made two business days ago left 103 long enough since for it not to
-- count, as a departure then does not. Inserted as the owner, with its own
-- moment, because no command dates a move in the past.
insert into public.reservation_changes (
  organization_id, property_id, reservation_id, stay_id, kind, business_date,
  from_starts_on, to_starts_on, from_ends_on, to_ends_on,
  from_unit_id, to_unit_id, reason_kind, changed_by, changed_at)
values ('ad0a0000-0000-4000-8000-00000000000a', 'ad0b0000-0000-4000-8000-000000000001', 'ad0e0000-0000-4000-8000-000000000003', 'ad0f0000-0000-4000-8000-000000000003', 'moved', app.property_today('ad0b0000-0000-4000-8000-000000000001') - 2,
        app.property_today('ad0b0000-0000-4000-8000-000000000001') - 1, app.property_today('ad0b0000-0000-4000-8000-000000000001') - 1, app.property_today('ad0b0000-0000-4000-8000-000000000001') + 3, app.property_today('ad0b0000-0000-4000-8000-000000000001') + 3, 'ad0c0000-0000-4000-8000-000000000103', 'ad0c0000-0000-4000-8000-000000000104',
        'guest_request', 'ad010000-0000-4000-8000-000000000001', now() - interval '2 days');

select isnt(
  (select status from app.unit_housekeeping_state('ad0c0000-0000-4000-8000-000000000103')),
  'dirty',
  'AB-S3-08: a move from before yesterday''s business day leaves no room to clean');

-- 101 was left today and marked dirty by the worker; housekeeping then cleans it.
update public.housekeeping_unit_status set status = 'clean'
 where accommodation_unit_id = 'ad0c0000-0000-4000-8000-000000000101';

select is(
  (select status from app.unit_housekeeping_state('ad0c0000-0000-4000-8000-000000000101')),
  'clean',
  'AB-S3-08: a room cleaned since the move reads clean');

select ok(app.unit_is_ready('ad0c0000-0000-4000-8000-000000000101'),
  'AB-S3-08: and is ready for the next Guest');

-- ---------------------------------------------------------------------------
-- A check-in is not withdrawn once the Guest has been moved
-- ---------------------------------------------------------------------------

select throws_ok(
  $$update public.stays set status = 'cancelled' where id = 'ad0f0000-0000-4000-8000-000000000010'$$,
  'RZ004', 'that Stay was moved and cannot be withdrawn',
  'AB-S3-11: a moved Guest''s check-in is corrected, not withdrawn, for every role');

-- ---------------------------------------------------------------------------
-- Damage is charged to the Guest who used the room
-- ---------------------------------------------------------------------------

-- A request on 101, which the Guest in the suite was moved out of, and one on
-- 103, which they never slept in; a Folio for their Stay, and a charge on it.
-- Written in replica mode: the request, the Folio and the line are fixtures;
-- the link is what is under test.
select app.set_request_context('ad010000-0000-4000-8000-000000000001');
set local session_replication_role = replica;
insert into public.maintenance_requests
  (id, organization_id, property_id, accommodation_unit_id, number, title, reported_by)
values ('ad0e2000-0000-4000-8000-000000000101', 'ad0a0000-0000-4000-8000-00000000000a', 'ad0b0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000000101', 9101, 'Shower leaks', 'ad010000-0000-4000-8000-000000000001'),
       ('ad0e2000-0000-4000-8000-000000000103', 'ad0a0000-0000-4000-8000-00000000000a', 'ad0b0000-0000-4000-8000-000000000001', 'ad0c0000-0000-4000-8000-000000000103', 9103, 'Tap drips', 'ad010000-0000-4000-8000-000000000001');
insert into public.folios (id, organization_id, property_id, stay_id, currency)
values ('ad0e3000-0000-4000-8000-000000000001', 'ad0a0000-0000-4000-8000-00000000000a', 'ad0b0000-0000-4000-8000-000000000001', 'ad0f0000-0000-4000-8000-000000000001', 'TRY');
insert into public.folio_lines
  (id, organization_id, property_id, folio_id, line_type, description, amount_minor)
values ('ad0e4000-0000-4000-8000-000000000001', 'ad0a0000-0000-4000-8000-00000000000a', 'ad0b0000-0000-4000-8000-000000000001',
        'ad0e3000-0000-4000-8000-000000000001', 'charge', 'Damage', 5000);
set local session_replication_role = origin;

select lives_ok(
  $$insert into public.maintenance_request_charges
      (organization_id, property_id, request_id, folio_id, folio_line_id, charged_by)
    values ('ad0a0000-0000-4000-8000-00000000000a', 'ad0b0000-0000-4000-8000-000000000001', 'ad0e2000-0000-4000-8000-000000000101',
            'ad0e3000-0000-4000-8000-000000000001',
            'ad0e4000-0000-4000-8000-000000000001', 'ad010000-0000-4000-8000-000000000001')$$,
  'a moved Guest is charged for damage to the room they left (MT-S5-07)');

select throws_ok(
  $$insert into public.maintenance_request_charges
      (organization_id, property_id, request_id, folio_id, folio_line_id, charged_by)
    values ('ad0a0000-0000-4000-8000-00000000000a', 'ad0b0000-0000-4000-8000-000000000001', 'ad0e2000-0000-4000-8000-000000000103',
            'ad0e3000-0000-4000-8000-000000000001',
            'ad0e4000-0000-4000-8000-000000000001', 'ad010000-0000-4000-8000-000000000001')$$,
  '23514', null,
  'and not for a room they never slept in');

select * from finish();
rollback;
