-- Maintenance: equipment, the service plan, and what a repair cost (RANZ-33
-- slices 3 to 5).
--
-- Three claims:
--
--   equipment   an item is somewhere at its own Property, bounded, never
--               serviced in the future, written only with
--               maintenance.equipment, and retired rather than deleted.
--
--   work orders a service is of an item, and an item has one open at a time.
--
--   money       a cost is whole and not negative; a damage charge is linked
--               only by somebody who may post charges, only to a Folio of a
--               Stay in the request's room, and by whoever the database says.
--
-- Rows in docs/features/maintenance/edge-cases.csv are named beside the
-- assertion that proves them. Each break below was applied inside a rolled-back
-- transaction, the altered object printed first, and the named assertions seen
-- red:
--   equipment insert policy without the permission     MT-S3-08
--   the somewhere check dropped                        MT-S3-02
--   the stamping trigger without the future check      MT-S3-03
--   the one-open-work-order index made total           MT-S4-03
--   the charge insert policy without finance.post_charge  MT-S5-05
--   the charge trigger without the room check          MT-S5-07
--   the service recorded by an invoker, not a definer   MT-S4-04, technician
--   the charge trigger without the line check          MT-S5-03
--   the retired-equipment trigger dropped               MT-S3-06
--   the service definer without its caller check       MT-S4-04, the desk
begin;
select plan(30);

insert into public.users (id, email) values
  ('a1111111-1111-4111-8111-111111111111', 'mtm-manager@example.test'),
  ('a2222222-2222-4222-8222-222222222222', 'mtm-desk@example.test'),
  ('a3333333-3333-4333-8333-333333333333', 'mtm-finance@example.test'),
  ('a4444444-4444-4444-8444-444444444444', 'mtm-technician@example.test');

insert into public.organizations (id, name, status) values
  ('aa111111-1111-4111-8111-111111111111', 'Maintenance Money Organization', 'active');

insert into public.properties (id, organization_id, name) values
  ('ab111111-1111-4111-8111-111111111111',
   'aa111111-1111-4111-8111-111111111111', 'Maintenance Money Property'),
  ('ab222222-2222-4222-8222-222222222222',
   'aa111111-1111-4111-8111-111111111111', 'Maintenance Money Other Property');

-- Works the board and does not keep the register: a role of the
-- Organization's own, since every shipped role that manages also keeps it.
insert into public.staff_roles (scope_id, key, organization_id, name, permissions)
values ('aa111111-1111-4111-8111-111111111111', 'technician',
        'aa111111-1111-4111-8111-111111111111', 'Technician',
        array['maintenance.report', 'maintenance.manage']);

insert into public.organization_memberships
  (organization_id, user_id, role, role_scope_id, access_scope) values
  ('aa111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111',
   'manager', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('aa111111-1111-4111-8111-111111111111', 'a2222222-2222-4222-8222-222222222222',
   'front_desk', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('aa111111-1111-4111-8111-111111111111', 'a3333333-3333-4333-8333-333333333333',
   'finance', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('aa111111-1111-4111-8111-111111111111', 'a4444444-4444-4444-8444-444444444444',
   'technician', 'aa111111-1111-4111-8111-111111111111', 'organization_wide');

insert into public.subscriptions (organization_id, status) values
  ('aa111111-1111-4111-8111-111111111111', 'active');

insert into public.entitlements (organization_id, module_key) values
  ('aa111111-1111-4111-8111-111111111111', 'maintenance'),
  ('aa111111-1111-4111-8111-111111111111', 'billing_folios');

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('ab111111-1111-4111-8111-111111111111', 'aa111111-1111-4111-8111-111111111111', 'maintenance', true),
  ('ab111111-1111-4111-8111-111111111111', 'aa111111-1111-4111-8111-111111111111', 'finance', true),
  ('ab222222-2222-4222-8222-222222222222', 'aa111111-1111-4111-8111-111111111111', 'maintenance', true);

-- Room 101, room 102 with bed A, and 201 at the other Property.
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity) values
  ('ac111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111',
   'aa111111-1111-4111-8111-111111111111', 'MTM-101', 'room', 2),
  ('ac222222-2222-4222-8222-222222222222', 'ab111111-1111-4111-8111-111111111111',
   'aa111111-1111-4111-8111-111111111111', 'MTM-102', 'room', 2),
  ('ac555555-5555-4555-8555-555555555555', 'ab222222-2222-4222-8222-222222222222',
   'aa111111-1111-4111-8111-111111111111', 'MTM-201', 'room', 2);

insert into public.accommodation_units
  (id, property_id, organization_id, parent_id, parent_unit_type, name, unit_type, capacity)
values
  ('ac2a2222-2222-4222-8222-222222222222', 'ab111111-1111-4111-8111-111111111111',
   'aa111111-1111-4111-8111-111111111111', 'ac222222-2222-4222-8222-222222222222',
   'room', 'A', 'bed', 1);

-- A Guest in bed A of 102, and one in 101, each with an open Folio and a line
-- to link a charge to.
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, stay_type, status, starts_on, ends_on)
values
  ('ad111111-1111-4111-8111-111111111111', 'aa111111-1111-4111-8111-111111111111',
   'ab111111-1111-4111-8111-111111111111', 'ac2a2222-2222-4222-8222-222222222222',
   'guest', 'in_house',
   app.property_today('ab111111-1111-4111-8111-111111111111') - 1,
   app.property_today('ab111111-1111-4111-8111-111111111111') + 1),
  ('ad222222-2222-4222-8222-222222222222', 'aa111111-1111-4111-8111-111111111111',
   'ab111111-1111-4111-8111-111111111111', 'ac111111-1111-4111-8111-111111111111',
   'guest', 'in_house',
   app.property_today('ab111111-1111-4111-8111-111111111111') - 1,
   app.property_today('ab111111-1111-4111-8111-111111111111') + 1);

insert into public.folios (id, organization_id, property_id, stay_id, currency) values
  ('ae111111-1111-4111-8111-111111111111', 'aa111111-1111-4111-8111-111111111111',
   'ab111111-1111-4111-8111-111111111111', 'ad111111-1111-4111-8111-111111111111', 'TRY'),
  ('ae222222-2222-4222-8222-222222222222', 'aa111111-1111-4111-8111-111111111111',
   'ab111111-1111-4111-8111-111111111111', 'ad222222-2222-4222-8222-222222222222', 'TRY');

insert into public.folio_lines
  (id, organization_id, property_id, folio_id, line_type, description, amount_minor)
values
  ('af111111-1111-4111-8111-111111111111', 'aa111111-1111-4111-8111-111111111111',
   'ab111111-1111-4111-8111-111111111111', 'ae111111-1111-4111-8111-111111111111',
   'charge', 'Damage: a broken lamp', 25000),
  ('af222222-2222-4222-8222-222222222222', 'aa111111-1111-4111-8111-111111111111',
   'ab111111-1111-4111-8111-111111111111', 'ae222222-2222-4222-8222-222222222222',
   'charge', 'Damage: somebody else''s room', 25000);

-- On the same Folio as the first: a night posted yesterday, and a reversal of
-- it posted now. Neither is a damage charge posted with its link.
insert into public.folio_lines
  (id, organization_id, property_id, folio_id, line_type, description,
   amount_minor, posted_at)
values
  ('af333333-3333-4333-8333-333333333333', 'aa111111-1111-4111-8111-111111111111',
   'ab111111-1111-4111-8111-111111111111', 'ae111111-1111-4111-8111-111111111111',
   'charge', 'Room night', 400000, now() - interval '1 day');
insert into public.folio_lines
  (id, organization_id, property_id, folio_id, line_type, description,
   amount_minor, reverses_line_id)
values
  ('af444444-4444-4444-8444-444444444444', 'aa111111-1111-4111-8111-111111111111',
   'ab111111-1111-4111-8111-111111111111', 'ae111111-1111-4111-8111-111111111111',
   'reversal', 'Room night, reversed', -400000, 'af333333-3333-4333-8333-333333333333');

-- ---------------------------------------------------------------------------
-- Equipment
-- ---------------------------------------------------------------------------

select set_eq(
  $$ select column_name::text from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'maintenance_equipment'
        and grantee = 'ranza_app' and privilege_type = 'UPDATE' $$,
  array['name', 'category', 'accommodation_unit_id', 'location',
        'service_interval_months', 'last_serviced_on', 'retired_at'],
  'MT-S3-05: an item changes what and where it is, never whose it is');

set local role ranza_app;
select app.set_request_context('a1111111-1111-4111-8111-111111111111');

select lives_ok(
  $$ insert into public.maintenance_equipment
       (organization_id, property_id, name, category, location, service_interval_months)
     values ('aa111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111',
             'Washing machines', 'Laundry', 'Laundry room', 6) $$,
  'MT-S3-01: a manager registers equipment at a named place');

select throws_ok(
  $$ insert into public.maintenance_equipment
       (organization_id, property_id, name, category)
     values ('aa111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111',
             'Nowhere', 'Plumbing') $$,
  '23514', null,
  'MT-S3-02: an item is somewhere');

select throws_ok(
  $$ insert into public.maintenance_equipment
       (organization_id, property_id, name, category, accommodation_unit_id, location)
     values ('aa111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111',
             'Both', 'Plumbing', 'ac111111-1111-4111-8111-111111111111', 'Roof') $$,
  '23514', null,
  'MT-S3-02: and in one place');

select throws_ok(
  $$ insert into public.maintenance_equipment
       (organization_id, property_id, name, category, accommodation_unit_id)
     values ('aa111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111',
             'Elsewhere', 'Plumbing', 'ac555555-5555-4555-8555-555555555555') $$,
  '23503', null,
  'MT-S3-02: an item''s Unit is at its own Property');

select throws_ok(
  $$ insert into public.maintenance_equipment
       (organization_id, property_id, name, category, location, service_interval_months)
     values ('aa111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111',
             'Too often', 'Plumbing', 'Roof', 0) $$,
  '23514', null,
  'MT-S3-03: an interval is at least a month');

select throws_ok(
  $$ insert into public.maintenance_equipment
       (organization_id, property_id, name, category, location, last_serviced_on)
     values ('aa111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111',
             'Tomorrow', 'Plumbing', 'Roof',
             app.property_today('ab111111-1111-4111-8111-111111111111') + 1) $$,
  '23514', 'equipment is not serviced in the future',
  'MT-S3-03: nor serviced in the future');

select lives_ok(
  $$ insert into public.maintenance_equipment
       (organization_id, property_id, name, category, location)
     values ('aa111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111',
             'Washing machines', 'Laundry', 'Basement') $$,
  'MT-S3-09: two items may share a name');

update public.maintenance_equipment set retired_at = '2000-01-01'
 where location = 'Basement';

select is(
  (select retired_at = now() from public.maintenance_equipment where location = 'Basement'),
  true,
  'MT-S3-06: retiring is stamped now, whatever the caller said');

-- The desk may report and may not keep the register.
select app.set_request_context('a2222222-2222-4222-8222-222222222222');

select throws_ok(
  $$ insert into public.maintenance_equipment
       (organization_id, property_id, name, category, location)
     values ('aa111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111',
             'Boiler', 'Heating', 'Roof') $$,
  '42501', null,
  'MT-S3-08: registering equipment without the permission is refused');

update public.maintenance_equipment set name = 'Renamed by the desk'
 where location = 'Laundry room';

select is(
  (select name from public.maintenance_equipment where location = 'Laundry room'),
  'Washing machines',
  'MT-S3-08: nor changing it');

-- ---------------------------------------------------------------------------
-- Requests about equipment, and work orders
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ insert into public.maintenance_requests
       (organization_id, property_id, title, equipment_id, priority)
     select 'aa111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111',
            'Machine two will not drain', id, 'urgent'
       from public.maintenance_equipment where location = 'Laundry room' $$,
  'MT-S3-07: a problem is reported about equipment with no room');

select lives_ok(
  $$ insert into public.maintenance_requests
       (organization_id, property_id, title, equipment_id, kind, priority)
     select 'aa111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111',
            'Service: washing machines', id, 'service', 'this_week'
       from public.maintenance_equipment where location = 'Laundry room' $$,
  'MT-S4-02: a work order is raised for an item');

select throws_ok(
  $$ insert into public.maintenance_requests
       (organization_id, property_id, title, equipment_id, kind, priority)
     select 'aa111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111',
            'Service: washing machines again', id, 'service', 'this_week'
       from public.maintenance_equipment where location = 'Laundry room' $$,
  '23505', null,
  'MT-S4-03: an item has one open work order');

select throws_ok(
  $$ insert into public.maintenance_requests
       (organization_id, property_id, title, accommodation_unit_id, kind, priority)
     values ('aa111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111',
             'Service: a room', 'ac111111-1111-4111-8111-111111111111', 'service', 'this_week') $$,
  '23514', null,
  'a service is of equipment');

select throws_ok(
  $$ insert into public.maintenance_requests
       (organization_id, property_id, title, equipment_id, priority)
     select 'aa111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111',
            'The old machine hums', id, 'can_wait'
       from public.maintenance_equipment where location = 'Basement' $$,
  '55000', 'a request is not raised against retired equipment',
  'MT-S3-06: a retired item takes no new request');

-- The definer asks its own question (IG-12). Through ranza_app the request's
-- update policy refuses first and the two never disagree, so the check is
-- seen only from a role that bypasses the policy while naming a Staff Member
-- who does not work the board.
set local role none;
select app.set_request_context('a2222222-2222-4222-8222-222222222222');

select throws_ok(
  $$ update public.maintenance_requests set status = 'done'
      where title = 'Service: washing machines' $$,
  '42501', 'finishing a work order requires maintenance.manage',
  'MT-S4-04: the service is recorded only for somebody who works the board');

set local role ranza_app;

-- The first work order is done, by somebody who works the board and does not
-- keep the register. The service is recorded all the same; the next may be
-- raised.
select app.set_request_context('a4444444-4444-4444-8444-444444444444');
update public.maintenance_requests set status = 'done'
 where title = 'Service: washing machines';

select is(
  (select last_serviced_on from public.maintenance_equipment
    where location = 'Laundry room'),
  app.property_today('ab111111-1111-4111-8111-111111111111'),
  'MT-S4-04: a work order done records the service, without maintenance.equipment');

update public.maintenance_equipment set last_serviced_on = null
 where location = 'Laundry room';

select is(
  (select last_serviced_on from public.maintenance_equipment
    where location = 'Laundry room'),
  app.property_today('ab111111-1111-4111-8111-111111111111'),
  'MT-S3-08: and that is all it may write — the register itself is still refused');

select app.set_request_context('a1111111-1111-4111-8111-111111111111');

select lives_ok(
  $$ insert into public.maintenance_requests
       (organization_id, property_id, title, equipment_id, kind, priority)
     select 'aa111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111',
            'Service: washing machines, next time', id, 'service', 'this_week'
       from public.maintenance_equipment where location = 'Laundry room' $$,
  'MT-S4-03: once it is done, the next one is raised');

-- ---------------------------------------------------------------------------
-- What it cost
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ update public.maintenance_requests set cost_minor = -1
      where title = 'Machine two will not drain' $$,
  '23514', null,
  'MT-S5-02: a cost is not negative');

select lives_ok(
  $$ update public.maintenance_requests set cost_minor = 0, vendor = 'Boğaz Teknik'
      where title = 'Machine two will not drain' $$,
  'MT-S5-02: a repair may have cost nothing');

-- ---------------------------------------------------------------------------
-- A damage charge
-- ---------------------------------------------------------------------------

insert into public.maintenance_requests
  (organization_id, property_id, title, accommodation_unit_id, priority)
values ('aa111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111',
        'A lamp was broken in 102', 'ac222222-2222-4222-8222-222222222222', 'this_week');

select set_eq(
  $$ select column_name::text from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'maintenance_request_charges'
        and grantee = 'ranza_app' and privilege_type = 'INSERT' $$,
  array['organization_id', 'property_id', 'request_id', 'folio_id', 'folio_line_id'],
  'a charge link names which request, Folio and line — never who, or when');

-- The desk holds finance.manage_folio and not finance.post_charge.
select app.set_request_context('a2222222-2222-4222-8222-222222222222');

select throws_ok(
  $$ insert into public.maintenance_request_charges
       (organization_id, property_id, request_id, folio_id, folio_line_id)
     select 'aa111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111',
            id, 'ae111111-1111-4111-8111-111111111111', 'af111111-1111-4111-8111-111111111111'
       from public.maintenance_requests where title = 'A lamp was broken in 102' $$,
  '42501', null,
  'MT-S5-05: linking a charge without finance.post_charge is refused');

select app.set_request_context('a3333333-3333-4333-8333-333333333333');

select throws_ok(
  $$ insert into public.maintenance_request_charges
       (organization_id, property_id, request_id, folio_id, folio_line_id)
     select 'aa111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111',
            id, 'ae222222-2222-4222-8222-222222222222', 'af222222-2222-4222-8222-222222222222'
       from public.maintenance_requests where title = 'A lamp was broken in 102' $$,
  '23514', 'a damage charge is on a Folio of a Stay in the request''s room',
  'MT-S5-07: a charge is for somebody who stayed in the request''s room');

select lives_ok(
  $$ insert into public.maintenance_request_charges
       (organization_id, property_id, request_id, folio_id, folio_line_id)
     select 'aa111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111',
            id, 'ae111111-1111-4111-8111-111111111111', 'af111111-1111-4111-8111-111111111111'
       from public.maintenance_requests where title = 'A lamp was broken in 102' $$,
  'MT-S5-03, MT-S5-07: finance links a charge on a bed in the request''s room');

select is(
  (select charged_by from public.maintenance_request_charges
    where folio_line_id = 'af111111-1111-4111-8111-111111111111'),
  'a3333333-3333-4333-8333-333333333333'::uuid,
  'who charged it is stamped by the database');

select throws_ok(
  $$ insert into public.maintenance_request_charges
       (organization_id, property_id, request_id, folio_id, folio_line_id)
     select 'aa111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111',
            id, 'ae111111-1111-4111-8111-111111111111', 'af111111-1111-4111-8111-111111111111'
       from public.maintenance_requests where title = 'A lamp was broken in 102' $$,
  '23505', null,
  'a line is charged for one request at most');

select throws_ok(
  $$ insert into public.maintenance_request_charges
       (organization_id, property_id, request_id, folio_id, folio_line_id)
     select 'aa111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111',
            id, 'ae111111-1111-4111-8111-111111111111', 'af333333-3333-4333-8333-333333333333'
       from public.maintenance_requests where title = 'A lamp was broken in 102' $$,
  '23514', 'a damage charge links the charge posted with it',
  'MT-S5-03: a night already on the Folio is not linked as damage');

select throws_ok(
  $$ insert into public.maintenance_request_charges
       (organization_id, property_id, request_id, folio_id, folio_line_id)
     select 'aa111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111',
            id, 'ae111111-1111-4111-8111-111111111111', 'af444444-4444-4444-8444-444444444444'
       from public.maintenance_requests where title = 'A lamp was broken in 102' $$,
  '23514', 'a damage charge links the charge posted with it',
  'MT-S5-03: nor is a reversal, though it was posted now');

select finish();
rollback;
