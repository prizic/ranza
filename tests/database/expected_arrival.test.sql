-- The time a Guest expects to arrive (docs/features/front-desk, RANZ-23).
--
-- Two claims, which fail in different ways:
--
--   the grant    the time is set when a booking is taken, by whoever may book,
--                and changed afterwards only through
--                app.change_expected_arrival(), for a caller holding
--                front_desk.amend within the front desk's gates. ranza_app has
--                no update grant on the column, so a check-in or booking holder
--                cannot reach it any other way.
--
--   the record   every change is one append-only revision that says what the
--                time was and what it became, and nothing else about the
--                booking moves.
--
-- Rows in docs/features/front-desk/edge-cases.csv (FD-S6-*) are named beside
-- the assertion that proves them. The races — a time saved against a booking
-- somebody else just changed — need two sessions and are in
-- tests/integration/expected-arrival.test.ts.
begin;
select plan(30);

insert into public.users (id, email) values
  ('ea010000-0000-4000-8000-000000000001', 'ea-desk@example.test'),
  ('ea010000-0000-4000-8000-000000000002', 'ea-booker-only@example.test'),
  ('ea010000-0000-4000-8000-000000000003', 'ea-housekeeper@example.test'),
  ('ea010000-0000-4000-8000-000000000004', 'ea-outsider@example.test');

insert into public.organizations (id, name, status) values
  ('ea0a0000-0000-4000-8000-00000000000a', 'Arrival Organization', 'active'),
  ('ea0a0000-0000-4000-8000-00000000000b', 'Arrival Other Organization', 'active');

-- The second Property has no front desk, which is the commercial gate.
insert into public.properties (id, organization_id, name, currency) values
  ('ea0b0000-0000-4000-8000-000000000001', 'ea0a0000-0000-4000-8000-00000000000a', 'Arrival Property', 'TRY'),
  ('ea0b0000-0000-4000-8000-000000000002', 'ea0a0000-0000-4000-8000-00000000000a', 'Arrival Property Without A Desk', 'TRY'),
  ('ea0b0000-0000-4000-8000-000000000003', 'ea0a0000-0000-4000-8000-00000000000b', 'Arrival Other Property', 'TRY');

insert into public.subscriptions (organization_id, status) values
  ('ea0a0000-0000-4000-8000-00000000000a', 'active'), ('ea0a0000-0000-4000-8000-00000000000b', 'active');
insert into public.entitlements (organization_id, module_key) values
  ('ea0a0000-0000-4000-8000-00000000000a', 'front_office'), ('ea0a0000-0000-4000-8000-00000000000b', 'front_office');
insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('ea0b0000-0000-4000-8000-000000000001', 'ea0a0000-0000-4000-8000-00000000000a', 'front_desk', true),
  ('ea0b0000-0000-4000-8000-000000000003', 'ea0a0000-0000-4000-8000-00000000000b', 'front_desk', true);

-- Books and checks in, but does not amend.
insert into public.staff_roles (scope_id, key, organization_id, name, permissions) values
  ('ea0a0000-0000-4000-8000-00000000000a', 'ea_booker', 'ea0a0000-0000-4000-8000-00000000000a', 'Books only', array['front_desk.book', 'front_desk.check_in']);

insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('ea0a0000-0000-4000-8000-00000000000a', 'ea010000-0000-4000-8000-000000000001', 'front_desk', 'organization_wide'),
  ('ea0a0000-0000-4000-8000-00000000000a', 'ea010000-0000-4000-8000-000000000003', 'housekeeping', 'organization_wide'),
  ('ea0a0000-0000-4000-8000-00000000000b', 'ea010000-0000-4000-8000-000000000004', 'front_desk', 'organization_wide');
insert into public.organization_memberships
  (organization_id, user_id, role, role_scope_id, access_scope) values
  ('ea0a0000-0000-4000-8000-00000000000a', 'ea010000-0000-4000-8000-000000000002', 'ea_booker', 'ea0a0000-0000-4000-8000-00000000000a', 'organization_wide');

insert into public.guests (id, organization_id, full_name) values
  ('ea0d0000-0000-4000-8000-000000000001', 'ea0a0000-0000-4000-8000-00000000000a', 'Arrival Guest'),
  ('ea0d0000-0000-4000-8000-000000000002', 'ea0a0000-0000-4000-8000-00000000000b', 'Other Guest');

insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity, status, parent_id) values
  ('ea0c0000-0000-4000-8000-000000000101', 'ea0b0000-0000-4000-8000-000000000001', 'ea0a0000-0000-4000-8000-00000000000a', 'EA-101', 'room', 2, 'available', null),
  ('ea0c0000-0000-4000-8000-000000000102', 'ea0b0000-0000-4000-8000-000000000001', 'ea0a0000-0000-4000-8000-00000000000a', 'EA-102', 'room', 2, 'available', null),
  ('ea0c0000-0000-4000-8000-000000000103', 'ea0b0000-0000-4000-8000-000000000001', 'ea0a0000-0000-4000-8000-00000000000a', 'EA-103', 'room', 2, 'available', null),
  ('ea0c0000-0000-4000-8000-000000000201', 'ea0b0000-0000-4000-8000-000000000002', 'ea0a0000-0000-4000-8000-00000000000a', 'EA-201', 'room', 2, 'available', null),
  ('ea0c0000-0000-4000-8000-000000000301', 'ea0b0000-0000-4000-8000-000000000003', 'ea0a0000-0000-4000-8000-00000000000b', 'EA-301', 'room', 2, 'available', null);

-- Taken as the desk would take them, so the price stamp, which reads the
-- caller's reach, has one.
select app.set_request_context('ea010000-0000-4000-8000-000000000001');

-- 1  101, in five days: the booking whose time is set, changed and cleared.
-- 2  102, in five days, taken with a time of 14:30.
-- 3  103, cancelled.
-- 4  201, at the Property without a desk.
-- 5  301, in the other Organization.
insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id,
   stay_type, status, starts_on, ends_on, expected_arrival_time) values
  ('ea0e0000-0000-4000-8000-000000000001', 'ea0a0000-0000-4000-8000-00000000000a', 'ea0b0000-0000-4000-8000-000000000001', 'ea0c0000-0000-4000-8000-000000000101', 'ea0d0000-0000-4000-8000-000000000001', 'guest', 'confirmed', app.property_today('ea0b0000-0000-4000-8000-000000000001') + 5, app.property_today('ea0b0000-0000-4000-8000-000000000001') + 8, null),
  ('ea0e0000-0000-4000-8000-000000000002', 'ea0a0000-0000-4000-8000-00000000000a', 'ea0b0000-0000-4000-8000-000000000001', 'ea0c0000-0000-4000-8000-000000000102', 'ea0d0000-0000-4000-8000-000000000001', 'guest', 'confirmed', app.property_today('ea0b0000-0000-4000-8000-000000000001') + 5, app.property_today('ea0b0000-0000-4000-8000-000000000001') + 7, '14:30'),
  ('ea0e0000-0000-4000-8000-000000000003', 'ea0a0000-0000-4000-8000-00000000000a', 'ea0b0000-0000-4000-8000-000000000001', 'ea0c0000-0000-4000-8000-000000000103', 'ea0d0000-0000-4000-8000-000000000001', 'guest', 'cancelled', app.property_today('ea0b0000-0000-4000-8000-000000000001') + 20, app.property_today('ea0b0000-0000-4000-8000-000000000001') + 21, null),
  ('ea0e0000-0000-4000-8000-000000000004', 'ea0a0000-0000-4000-8000-00000000000a', 'ea0b0000-0000-4000-8000-000000000002', 'ea0c0000-0000-4000-8000-000000000201', 'ea0d0000-0000-4000-8000-000000000001', 'guest', 'confirmed', app.property_today('ea0b0000-0000-4000-8000-000000000001') + 5, app.property_today('ea0b0000-0000-4000-8000-000000000001') + 6, null),
  ('ea0e0000-0000-4000-8000-000000000005', 'ea0a0000-0000-4000-8000-00000000000b', 'ea0b0000-0000-4000-8000-000000000003', 'ea0c0000-0000-4000-8000-000000000301', 'ea0d0000-0000-4000-8000-000000000002', 'guest', 'confirmed', app.property_today('ea0b0000-0000-4000-8000-000000000001') + 5, app.property_today('ea0b0000-0000-4000-8000-000000000001') + 6, null);

select app.set_request_context(null);

-- ---------------------------------------------------------------------------
-- The shape
-- ---------------------------------------------------------------------------

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'reservations'
       and grantee = 'ranza_app' and privilege_type = 'INSERT'$$,
  array['organization_id', 'property_id', 'accommodation_unit_id', 'guest_id',
        'stay_type', 'status', 'starts_on', 'ends_on', 'expected_arrival_time'],
  'FD-S6-01: ranza_app inserts a booking''s expected arrival with the nine columns a booking is taken with');

select is_empty(
  $$select column_name::text from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'reservations'
       and grantee = 'ranza_app' and privilege_type = 'UPDATE'
       and column_name = 'expected_arrival_time'$$,
  'FD-S6-02: and holds no update grant on it, so the time changes only through its command');

select is(
  (select count(*)::int from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'reservations'
      and grantee = 'ranza_app' and privilege_type = 'SELECT'
      and column_name = 'expected_arrival_time'),
  1,
  'FD-S6-03: every front-desk reader can read the time');

select is_empty(
  $$select grantee::text from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'reservations'
       and column_name = 'expected_arrival_time'
       and grantee in ('ranza_auth', 'ranza_worker', 'PUBLIC')$$,
  'FD-S6-02: no other runtime role is granted the column');

select set_eq(
  $$select r.rolname::text from pg_roles r
     where r.rolname in ('ranza_app', 'ranza_auth', 'ranza_worker')
       and has_function_privilege(r.oid, 'app.change_expected_arrival(uuid, time, integer, text)', 'execute')$$,
  array['ranza_app'],
  'FD-S6-02: the command is executable by the runtime role and by no other');

-- ---------------------------------------------------------------------------
-- Taking a booking with a time
-- ---------------------------------------------------------------------------

set local role ranza_app;
select app.set_request_context('ea010000-0000-4000-8000-000000000001');

select lives_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id, guest_id, stay_type, status, starts_on, ends_on, expected_arrival_time)
    values ('ea0a0000-0000-4000-8000-00000000000a', 'ea0b0000-0000-4000-8000-000000000001', 'ea0c0000-0000-4000-8000-000000000101', 'ea0d0000-0000-4000-8000-000000000001', 'guest', 'confirmed',
            app.property_today('ea0b0000-0000-4000-8000-000000000001') + 30, app.property_today('ea0b0000-0000-4000-8000-000000000001') + 32, '15:30')$$,
  'FD-S6-04: a desk that may book takes a booking with an expected arrival');

select is(
  (select expected_arrival_time::text from public.reservations
    where starts_on = app.property_today('ea0b0000-0000-4000-8000-000000000001') + 30),
  '15:30:00',
  'FD-S6-04: and the time is kept to the minute');

select lives_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id, guest_id, stay_type, status, starts_on, ends_on)
    values ('ea0a0000-0000-4000-8000-00000000000a', 'ea0b0000-0000-4000-8000-000000000001', 'ea0c0000-0000-4000-8000-000000000101', 'ea0d0000-0000-4000-8000-000000000001', 'guest', 'confirmed',
            app.property_today('ea0b0000-0000-4000-8000-000000000001') + 40, app.property_today('ea0b0000-0000-4000-8000-000000000001') + 41)$$,
  'FD-S6-05: and one without, which is the common case');

select is(
  (select expected_arrival_time from public.reservations
    where starts_on = app.property_today('ea0b0000-0000-4000-8000-000000000001') + 40),
  null::time,
  'FD-S6-05: reads as no time at all');

select app.set_request_context('ea010000-0000-4000-8000-000000000003');
select throws_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id, guest_id, stay_type, status, starts_on, ends_on, expected_arrival_time)
    values ('ea0a0000-0000-4000-8000-00000000000a', 'ea0b0000-0000-4000-8000-000000000001', 'ea0c0000-0000-4000-8000-000000000102', 'ea0d0000-0000-4000-8000-000000000001', 'guest', 'confirmed',
            app.property_today('ea0b0000-0000-4000-8000-000000000001') + 50, app.property_today('ea0b0000-0000-4000-8000-000000000001') + 51, '12:00')$$,
  '42501', null,
  'FD-S6-06: housekeeping cannot take a booking, with a time or without');

-- ---------------------------------------------------------------------------
-- Who changes it
-- ---------------------------------------------------------------------------

select app.set_request_context('ea010000-0000-4000-8000-000000000002');

select lives_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id, guest_id, stay_type, status, starts_on, ends_on, expected_arrival_time)
    values ('ea0a0000-0000-4000-8000-00000000000a', 'ea0b0000-0000-4000-8000-000000000001', 'ea0c0000-0000-4000-8000-000000000102', 'ea0d0000-0000-4000-8000-000000000001', 'guest', 'confirmed',
            app.property_today('ea0b0000-0000-4000-8000-000000000001') + 60, app.property_today('ea0b0000-0000-4000-8000-000000000001') + 61, '09:00')$$,
  'FD-S6-07: a role that books without amending sets the time when taking the booking');

select throws_ok(
  $$update public.reservations set expected_arrival_time = '23:00'
     where id = 'ea0e0000-0000-4000-8000-000000000002'$$,
  '42501', null,
  'FD-S6-08: the same role cannot change it afterwards with a statement of its own');

select throws_ok(
  $$select * from app.change_expected_arrival('ea0e0000-0000-4000-8000-000000000002', '23:00', 0, null)$$,
  '42501', 'that booking cannot be changed',
  'FD-S6-08: nor through the command, which asks for front_desk.amend');

select app.set_request_context('ea010000-0000-4000-8000-000000000003');
select throws_ok(
  $$select * from app.change_expected_arrival('ea0e0000-0000-4000-8000-000000000002', '23:00', 0, null)$$,
  '42501', 'that booking cannot be changed',
  'FD-S6-09: housekeeping cannot change it');

select app.set_request_context('ea010000-0000-4000-8000-000000000004');
select throws_ok(
  $$select * from app.change_expected_arrival('ea0e0000-0000-4000-8000-000000000002', '23:00', 0, null)$$,
  '42501', 'that booking cannot be changed',
  'FD-S6-10: a desk in another Organization cannot reach the booking');

select app.set_request_context('ea010000-0000-4000-8000-000000000001');
select throws_ok(
  $$select * from app.change_expected_arrival('ea0e0000-0000-4000-8000-000000000004', '23:00', 0, null)$$,
  '42501', 'that booking cannot be changed',
  'FD-S6-10: nor can a desk at a Property that has no front desk');

select throws_ok(
  $$select * from app.change_expected_arrival('ea0e0000-0000-4000-8000-000000000003', '23:00', 0, null)$$,
  '42501', 'only a booking that has not arrived is changed this way',
  'FD-S6-11: a cancelled booking keeps the time it had');

-- ---------------------------------------------------------------------------
-- The desk changes it
-- ---------------------------------------------------------------------------

select results_eq(
  $$select change_organization_id, change_property_id
      from app.change_expected_arrival('ea0e0000-0000-4000-8000-000000000001', '16:00', 0, 'the Guest called')$$,
  $$values ('ea0a0000-0000-4000-8000-00000000000a'::uuid, 'ea0b0000-0000-4000-8000-000000000001'::uuid)$$,
  'FD-S6-12: a desk holding front_desk.amend sets the time of a booking that had none');

select results_eq(
  $$select expected_arrival_time, starts_on - app.property_today(property_id), ends_on - app.property_today(property_id), accommodation_unit_id
      from public.reservations where id = 'ea0e0000-0000-4000-8000-000000000001'$$,
  $$values ('16:00'::time, 5, 8, 'ea0c0000-0000-4000-8000-000000000101'::uuid)$$,
  'FD-S6-12: and the nights and the Unit stay exactly where they were');

select results_eq(
  $$select kind, stay_id, business_date, from_expected_arrival_time, to_expected_arrival_time,
           from_starts_on = to_starts_on, from_ends_on = to_ends_on, from_unit_id = to_unit_id,
           from_rate_minor is not distinct from to_rate_minor, note, changed_by
      from public.reservation_changes where reservation_id = 'ea0e0000-0000-4000-8000-000000000001'$$,
  $$values ('arrival_time_changed', null::uuid, app.property_today('ea0b0000-0000-4000-8000-000000000001'), null::time, '16:00'::time,
            true, true, true, true, 'the Guest called', 'ea010000-0000-4000-8000-000000000001'::uuid)$$,
  'FD-S6-13: it is one revision that says what the time was, what it became, the business day, the note and who');

select throws_ok(
  $$select * from app.change_expected_arrival('ea0e0000-0000-4000-8000-000000000001', '17:00', 0, null)$$,
  'RZ003', null,
  'FD-S6-14: a change made against a version that no longer exists is refused');

select throws_ok(
  $$select * from app.change_expected_arrival('ea0e0000-0000-4000-8000-000000000001', '16:00', 1, null)$$,
  '23514', 'that change changes nothing',
  'FD-S6-15: saving the time the booking already has changes nothing and is refused');

select results_eq(
  $$select change_organization_id from app.change_expected_arrival('ea0e0000-0000-4000-8000-000000000001', null, 1, null)$$,
  $$values ('ea0a0000-0000-4000-8000-00000000000a'::uuid)$$,
  'FD-S6-16: clearing the time is a change, and null is how it is said');

select results_eq(
  $$select expected_arrival_time, (select count(*)::int from public.reservation_changes where reservation_id = 'ea0e0000-0000-4000-8000-000000000001')
      from public.reservations where id = 'ea0e0000-0000-4000-8000-000000000001'$$,
  $$values (null::time, 2)$$,
  'FD-S6-16: leaving no time and two revisions');

-- ---------------------------------------------------------------------------
-- The record
-- ---------------------------------------------------------------------------

select app.set_request_context(null);
reset role;

select throws_ok(
  $$insert into public.reservation_changes
      (organization_id, property_id, reservation_id, kind, business_date, from_starts_on, to_starts_on, from_unit_id, to_unit_id,
       from_expected_arrival_time, to_expected_arrival_time, changed_by)
    values ('ea0a0000-0000-4000-8000-00000000000a', 'ea0b0000-0000-4000-8000-000000000001', 'ea0e0000-0000-4000-8000-000000000001', 'arrival_time_changed',
            current_date, current_date, current_date, 'ea0c0000-0000-4000-8000-000000000101', 'ea0c0000-0000-4000-8000-000000000101',
            '10:00', '10:00', 'ea010000-0000-4000-8000-000000000001')$$,
  '23514', null,
  'FD-S6-17: a revision of the time that changes nothing cannot be written, by any role');

select throws_ok(
  $$insert into public.reservation_changes
      (organization_id, property_id, reservation_id, kind, business_date, from_starts_on, to_starts_on, from_unit_id, to_unit_id,
       from_expected_arrival_time, to_expected_arrival_time, changed_by)
    values ('ea0a0000-0000-4000-8000-00000000000a', 'ea0b0000-0000-4000-8000-000000000001', 'ea0e0000-0000-4000-8000-000000000001', 'amended',
            current_date, current_date, current_date, 'ea0c0000-0000-4000-8000-000000000101', 'ea0c0000-0000-4000-8000-000000000101',
            '10:00', '11:00', 'ea010000-0000-4000-8000-000000000001')$$,
  '23514', null,
  'FD-S6-17: and a revision of the nights cannot carry a time');

select throws_ok(
  $$update public.reservation_changes set to_expected_arrival_time = '23:59' where reservation_id = 'ea0e0000-0000-4000-8000-000000000001'$$,
  '42501', 'reservation_changes is append-only',
  'FD-S6-13: a revision of the time is never rewritten, by the owner either');

select is(
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.reservation_changes'::regclass and conname = 'reservation_changes_stay_when_in_house'),
  'CHECK (((kind = ANY (ARRAY[''amended''::text, ''arrival_time_changed''::text])) = (stay_id IS NULL)))',
  'FD-S6-11: a revision of the time belongs to a booking that has not arrived, so it names no Stay');

select is(
  (select count(*)::int from public.reservation_changes
    where kind = 'arrival_time_changed' and reservation_id = 'ea0e0000-0000-4000-8000-000000000001'),
  2,
  'FD-S6-13: and two is all the suite wrote for the booking it changed');

-- The definer checks its caller before it reads anything it returns (IG-12 in
-- insert_grants.test.sql sweeps the same thing across every definer).
select matches(
  (select regexp_replace(prosrc, '--[^\n]*', '', 'g') from pg_proc where proname = 'change_expected_arrival'),
  'can_use_capability.*has_organization_permission.*front_desk\.amend',
  'FD-S6-08: the command names the gates and front_desk.amend before anything else');

select * from finish();
rollback;
