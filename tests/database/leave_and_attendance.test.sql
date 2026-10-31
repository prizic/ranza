-- Leave (izin) and the nightly roll call (yoklama) (RANZ-101, LA-S1-*).
--
-- Four claims:
--
--   the values     what a leave and a mark accept, and that one Resident is
--                  never away twice on one night.
--
--   the read       the roll call reads who is away; only `leave.grant` reads
--                  why. A housekeeper reads neither, and another
--                  Organization's manager reads nothing.
--
--   the write      only `attendance.take` calls the roll and only
--                  `leave.grant` gives, ends or cancels leave, at a Property
--                  that keeps attendance; a Resident is called only on a night
--                  of their Stay.
--
--   the history    nothing is deleted or rewritten: a mark is a revision, a
--                  leave is ended or cancelled, with who and when.
--
-- Rows in docs/features/leave-and-attendance/edge-cases.csv are named beside
-- the assertion that proves them. Each break below was applied inside a
-- rolled-back transaction, the altered object printed first, and the named
-- assertions seen red (the output of that run is in the commit message):
--   reasons readable with attendance.take      LA-S1-08 the roll call reads no reason
--   mark policy asking leave.grant             LA-S1-10 the warden calls the roll
--   leave insert policy without capability     LA-S1-19 a Property without attendance
--   mark stamp without the night check         LA-S1-11 a night to come
--   leave exclusion dropped                    LA-S1-03 away twice
--   append-only trigger on marks dropped       LA-S1-12 marks are never rewritten
--   the reason constraint trigger dropped      LA-S1-04 a leave without a reason
--   close rule dropping the begun test         LA-S1-06 cancelled after a night passed
begin;
select plan(63);

insert into public.users (id, email) values
  ('f8111111-1111-4111-8111-111111111111', 'la-owner@example.test'),
  ('f8222222-2222-4222-8222-222222222222', 'la-desk@example.test'),
  ('f8333333-3333-4333-8333-333333333333', 'la-warden@example.test'),
  ('f8444444-4444-4444-8444-444444444444', 'la-granter@example.test'),
  ('f8555555-5555-4555-8555-555555555555', 'la-housekeeper@example.test'),
  ('f8666666-6666-4666-8666-666666666666', 'la-outsider@example.test');

insert into public.organizations (id, name, status) values
  ('f8a11111-1111-4111-8111-111111111111', 'Attendance Organization', 'active'),
  ('f8a22222-2222-4222-8222-222222222222', 'Other Attendance Organization', 'active');

insert into public.properties (id, organization_id, name, operating_model) values
  ('f8b11111-1111-4111-8111-111111111111',
   'f8a11111-1111-4111-8111-111111111111', 'Attendance Yurt', 'dormitory'),
  ('f8b33333-3333-4333-8333-333333333333',
   'f8a11111-1111-4111-8111-111111111111', 'Attendance Hotel', 'hotel'),
  ('f8b22222-2222-4222-8222-222222222222',
   'f8a22222-2222-4222-8222-222222222222', 'Other Attendance Yurt', 'dormitory');

-- Two roles an Organization wrote: one that only calls the roll (a night
-- warden) and one that only gives leave. What makes the permission, and not
-- the name of a role, the thing asked.
insert into public.staff_roles
  (scope_id, key, organization_id, name, permissions) values
  ('f8a11111-1111-4111-8111-111111111111', 'warden',
   'f8a11111-1111-4111-8111-111111111111', 'Night warden',
   array['attendance.take']),
  ('f8a11111-1111-4111-8111-111111111111', 'granter',
   'f8a11111-1111-4111-8111-111111111111', 'Leave granter',
   array['leave.grant']);

insert into public.organization_memberships
  (organization_id, user_id, role, role_scope_id, access_scope) values
  ('f8a11111-1111-4111-8111-111111111111', 'f8111111-1111-4111-8111-111111111111',
   'owner', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('f8a11111-1111-4111-8111-111111111111', 'f8222222-2222-4222-8222-222222222222',
   'front_desk', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('f8a11111-1111-4111-8111-111111111111', 'f8333333-3333-4333-8333-333333333333',
   'warden', 'f8a11111-1111-4111-8111-111111111111', 'organization_wide'),
  ('f8a11111-1111-4111-8111-111111111111', 'f8444444-4444-4444-8444-444444444444',
   'granter', 'f8a11111-1111-4111-8111-111111111111', 'organization_wide'),
  ('f8a11111-1111-4111-8111-111111111111', 'f8555555-5555-4555-8555-555555555555',
   'housekeeping', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('f8a22222-2222-4222-8222-222222222222', 'f8666666-6666-4666-8666-666666666666',
   'manager', '00000000-0000-0000-0000-000000000000', 'organization_wide');

insert into public.subscriptions (organization_id, status) values
  ('f8a11111-1111-4111-8111-111111111111', 'active'),
  ('f8a22222-2222-4222-8222-222222222222', 'active');

insert into public.entitlements (organization_id, module_key) values
  ('f8a11111-1111-4111-8111-111111111111', 'front_office'),
  ('f8a22222-2222-4222-8222-222222222222', 'front_office');

-- The yurt keeps attendance; the hotel of the same Organization does not.
insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('f8b11111-1111-4111-8111-111111111111',
   'f8a11111-1111-4111-8111-111111111111', 'front_desk', true),
  ('f8b11111-1111-4111-8111-111111111111',
   'f8a11111-1111-4111-8111-111111111111', 'attendance', true),
  ('f8b33333-3333-4333-8333-333333333333',
   'f8a11111-1111-4111-8111-111111111111', 'front_desk', true),
  ('f8b22222-2222-4222-8222-222222222222',
   'f8a22222-2222-4222-8222-222222222222', 'front_desk', true),
  ('f8b22222-2222-4222-8222-222222222222',
   'f8a22222-2222-4222-8222-222222222222', 'attendance', true);

insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity) values
  ('f8c00000-0000-4000-8000-000000000001',
   'f8b11111-1111-4111-8111-111111111111', 'f8a11111-1111-4111-8111-111111111111', 'L-101', 'room', 1),
  ('f8c00000-0000-4000-8000-000000000002',
   'f8b11111-1111-4111-8111-111111111111', 'f8a11111-1111-4111-8111-111111111111', 'L-102', 'room', 1),
  ('f8c00000-0000-4000-8000-000000000003',
   'f8b11111-1111-4111-8111-111111111111', 'f8a11111-1111-4111-8111-111111111111', 'L-103', 'room', 1),
  ('f8c00000-0000-4000-8000-000000000004',
   'f8b11111-1111-4111-8111-111111111111', 'f8a11111-1111-4111-8111-111111111111', 'L-104', 'room', 1),
  ('f8c00000-0000-4000-8000-000000000005',
   'f8b11111-1111-4111-8111-111111111111', 'f8a11111-1111-4111-8111-111111111111', 'L-105', 'room', 1),
  ('f8c00000-0000-4000-8000-000000000006',
   'f8b11111-1111-4111-8111-111111111111', 'f8a11111-1111-4111-8111-111111111111', 'L-106', 'room', 1),
  ('f8c00000-0000-4000-8000-000000000007',
   'f8b11111-1111-4111-8111-111111111111', 'f8a11111-1111-4111-8111-111111111111', 'L-107', 'room', 1),
  ('f8c00000-0000-4000-8000-000000000008',
   'f8b33333-3333-4333-8333-333333333333', 'f8a11111-1111-4111-8111-111111111111', 'H-101', 'room', 1),
  ('f8c00000-0000-4000-8000-000000000009',
   'f8b22222-2222-4222-8222-222222222222', 'f8a22222-2222-4222-8222-222222222222', 'O-101', 'room', 1);

-- Four Residents in house since five nights ago, a Guest in house, a Resident
-- who left two nights ago, one who has not yet arrived, one at the hotel
-- without attendance, and one in another Organization. Dates are the
-- Property's own today, never a fixed day.
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, stay_type, status,
   starts_on, ends_on)
select stay.id, stay.organization_id, stay.property_id, stay.unit,
       stay.stay_type, stay.status,
       app.property_today(stay.property_id) + stay.starts_offset,
       case when stay.ends_offset is null then null
            else app.property_today(stay.property_id) + stay.ends_offset
       end
  from (values
    ('f8d00000-0000-4000-8000-000000000001'::uuid,
     'f8a11111-1111-4111-8111-111111111111'::uuid,
     'f8b11111-1111-4111-8111-111111111111'::uuid,
     'f8c00000-0000-4000-8000-000000000001'::uuid, 'resident', 'in_house', -5, null::int),
    ('f8d00000-0000-4000-8000-000000000002',
     'f8a11111-1111-4111-8111-111111111111',
     'f8b11111-1111-4111-8111-111111111111',
     'f8c00000-0000-4000-8000-000000000002', 'resident', 'in_house', -5, null),
    ('f8d00000-0000-4000-8000-000000000003',
     'f8a11111-1111-4111-8111-111111111111',
     'f8b11111-1111-4111-8111-111111111111',
     'f8c00000-0000-4000-8000-000000000003', 'resident', 'in_house', -5, null),
    ('f8d00000-0000-4000-8000-000000000004',
     'f8a11111-1111-4111-8111-111111111111',
     'f8b11111-1111-4111-8111-111111111111',
     'f8c00000-0000-4000-8000-000000000004', 'resident', 'in_house', -5, null),
    ('f8d00000-0000-4000-8000-000000000005',
     'f8a11111-1111-4111-8111-111111111111',
     'f8b11111-1111-4111-8111-111111111111',
     'f8c00000-0000-4000-8000-000000000005', 'guest', 'in_house', -2, 3),
    ('f8d00000-0000-4000-8000-000000000007',
     'f8a11111-1111-4111-8111-111111111111',
     'f8b11111-1111-4111-8111-111111111111',
     'f8c00000-0000-4000-8000-000000000007', 'resident', 'reserved', 3, 60),
    ('f8d00000-0000-4000-8000-000000000008',
     'f8a11111-1111-4111-8111-111111111111',
     'f8b33333-3333-4333-8333-333333333333',
     'f8c00000-0000-4000-8000-000000000008', 'resident', 'in_house', -5, null),
    ('f8d00000-0000-4000-8000-000000000009',
     'f8a22222-2222-4222-8222-222222222222',
     'f8b22222-2222-4222-8222-222222222222',
     'f8c00000-0000-4000-8000-000000000009', 'resident', 'in_house', -5, null)
  ) as stay (id, organization_id, property_id, unit, stay_type, status,
             starts_offset, ends_offset);

-- The one who left two nights ago: in house first, then departed.
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, stay_type, status,
   starts_on, ends_on)
values
  ('f8d00000-0000-4000-8000-000000000006',
   'f8a11111-1111-4111-8111-111111111111',
   'f8b11111-1111-4111-8111-111111111111',
   'f8c00000-0000-4000-8000-000000000006', 'resident', 'in_house',
   app.property_today('f8b11111-1111-4111-8111-111111111111') - 10, null);
update public.stays
   set status = 'departed',
       ends_on = app.property_today('f8b11111-1111-4111-8111-111111111111') - 2
 where id = 'f8d00000-0000-4000-8000-000000000006';

-- ---------------------------------------------------------------------------
-- The catalogue, the shipped roles, and what the runtime role is given
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select key, module_key from public.staff_permissions
      where key in ('attendance.take', 'leave.grant') order by key $$,
  $$ values ('attendance.take'::text, 'front_office'::text),
            ('leave.grant', 'front_office') $$,
  'LA-S1-22: attendance.take and leave.grant are in the catalogue, under Front Office');

select results_eq(
  $$ select key from public.staff_roles
      where organization_id is null
        and 'attendance.take' = any (permissions)
        and 'leave.grant' = any (permissions)
      order by key $$,
  $$ values ('front_desk'::text), ('manager'), ('owner') $$,
  'LA-S1-22: the shipped Owner, Manager and Front desk hold both');

select is_empty(
  $$ select key from public.staff_roles
      where organization_id is null
        and key in ('housekeeping', 'finance')
        and ('attendance.take' = any (permissions)
             or 'leave.grant' = any (permissions)) $$,
  'LA-S1-22: housekeeping and finance hold neither');

select is_empty(
  $$ select tables.name, verb
       from unnest(array['attendance_marks', 'attendance_leaves',
                         'attendance_leave_reasons', 'attendance_settings'])
              as tables (name),
            unnest(array['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as verb
      where has_table_privilege('ranza_app', 'public.' || tables.name, verb) $$,
  'LA-S1-23: the runtime role is granted no delete, truncate, reference or trigger anywhere');

select results_eq(
  $$ select tables.name
       from unnest(array['attendance_marks', 'attendance_leaves',
                         'attendance_leave_reasons', 'attendance_settings'])
              as tables (name)
      where has_any_column_privilege('ranza_app', 'public.' || tables.name, 'UPDATE')
      order by 1 $$,
  $$ values ('attendance_leaves'::text), ('attendance_settings') $$,
  'LA-S1-23: and may update a leave and the curfew only: a mark and a reason are written once');

select is_empty(
  $$ select table_name from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('ranza_worker', 'ranza_auth', 'public')
        and table_name like 'attendance\_%' $$,
  'LA-S1-23: nobody else is granted the tables');

select is_empty(
  $$ select relname from pg_catalog.pg_class
      where relname in ('attendance_marks', 'attendance_leaves',
                        'attendance_leave_reasons', 'attendance_settings')
        and relnamespace = 'public'::regnamespace
        and not (relrowsecurity and relforcerowsecurity) $$,
  'LA-S1-23: every table forces its policies on its owner too');

select is(
  (select count(*)::int from public.property_capabilities
    where capability_key = 'attendance' and enabled
      and property_id = 'f8b11111-1111-4111-8111-111111111111'),
  1,
  'LA-S1-19: the capability is a row of the Property');

-- ---------------------------------------------------------------------------
-- The curfew, as a pure rule
-- ---------------------------------------------------------------------------

select is(
  app.curfew_has_passed('2026-11-02', '23:00', '04:00', 'Europe/Istanbul',
                        '2026-11-02 19:59:59+00'),
  false,
  'LA-S1-17: at 22:59:59 local the 23:00 curfew has not passed');

select is(
  app.curfew_has_passed('2026-11-02', '23:00', '04:00', 'Europe/Istanbul',
                        '2026-11-02 20:00:00+00'),
  true,
  'LA-S1-17: at 23:00 local it has');

select is(
  app.curfew_has_passed('2026-11-02', '00:30', '04:00', 'Europe/Istanbul',
                        '2026-11-02 21:29:59+00'),
  false,
  'LA-S1-17: a curfew earlier than the cutoff belongs to the next calendar day, 00:30 on the 3rd');

select is(
  app.curfew_has_passed('2026-11-02', '00:30', '04:00', 'Europe/Istanbul',
                        '2026-11-02 21:30:00+00'),
  true,
  'LA-S1-17: and has passed at 00:30 on the 3rd');

select is(
  app.curfew_has_passed('2026-11-02', null, '04:00', 'Europe/Istanbul',
                        '2030-01-01 00:00:00+00'),
  false,
  'LA-S1-17: no curfew has never passed');

-- ---------------------------------------------------------------------------
-- Leave, as the people who give it
-- ---------------------------------------------------------------------------

set local role ranza_app;

select app.set_request_context('f8222222-2222-4222-8222-222222222222');

select lives_ok(
  $$ with leave as (
       insert into public.attendance_leaves
         (organization_id, property_id, stay_id, from_night, to_night)
       values ('f8a11111-1111-4111-8111-111111111111',
               'f8b11111-1111-4111-8111-111111111111',
               'f8d00000-0000-4000-8000-000000000001',
               app.property_today('f8b11111-1111-4111-8111-111111111111') + 2,
               app.property_today('f8b11111-1111-4111-8111-111111111111') + 4)
       returning id)
     insert into public.attendance_leave_reasons
       (leave_id, organization_id, property_id, reason)
     select id, 'f8a11111-1111-4111-8111-111111111111',
            'f8b11111-1111-4111-8111-111111111111', 'Family wedding in Konya'
       from leave $$,
  'LA-S1-01: a front desk gives a Resident leave for three nights with a reason');

select results_eq(
  $$ select granted_by, status, planned_to_night = to_night
       from public.attendance_leaves
      where stay_id = 'f8d00000-0000-4000-8000-000000000001' $$,
  $$ values ('f8222222-2222-4222-8222-222222222222'::uuid, 'granted'::text, true) $$,
  'LA-S1-01: who granted it and its status are the database''s, and what was planned is what was granted');

select throws_ok(
  $$ insert into public.attendance_leaves
       (organization_id, property_id, stay_id, from_night, to_night)
     values ('f8a11111-1111-4111-8111-111111111111',
             'f8b11111-1111-4111-8111-111111111111',
             'f8d00000-0000-4000-8000-000000000002',
             app.property_today('f8b11111-1111-4111-8111-111111111111') + 6,
             app.property_today('f8b11111-1111-4111-8111-111111111111') + 6);
     set constraints all immediate $$,
  'RZL03', null,
  'LA-S1-04: a leave cannot commit without a reason');

select throws_ok(
  $$ insert into public.attendance_leaves
       (organization_id, property_id, stay_id, from_night, to_night)
     values ('f8a11111-1111-4111-8111-111111111111',
             'f8b11111-1111-4111-8111-111111111111',
             'f8d00000-0000-4000-8000-000000000005',
             app.property_today('f8b11111-1111-4111-8111-111111111111') + 1,
             app.property_today('f8b11111-1111-4111-8111-111111111111') + 1) $$,
  'RZL01', null,
  'LA-S1-02: a Guest''s stay is not given leave, only a Resident''s');

select throws_ok(
  $$ insert into public.attendance_leaves
       (organization_id, property_id, stay_id, from_night, to_night)
     values ('f8a11111-1111-4111-8111-111111111111',
             'f8b11111-1111-4111-8111-111111111111',
             'f8d00000-0000-4000-8000-000000000006',
             app.property_today('f8b11111-1111-4111-8111-111111111111') + 1,
             app.property_today('f8b11111-1111-4111-8111-111111111111') + 1) $$,
  'RZL01', null,
  'LA-S1-02: nor a Resident who has left');

select throws_ok(
  $$ insert into public.attendance_leaves
       (organization_id, property_id, stay_id, from_night, to_night)
     values ('f8a11111-1111-4111-8111-111111111111',
             'f8b11111-1111-4111-8111-111111111111',
             'f8d00000-0000-4000-8000-000000000007',
             app.property_today('f8b11111-1111-4111-8111-111111111111') + 1,
             app.property_today('f8b11111-1111-4111-8111-111111111111') + 1) $$,
  'RZL01', null,
  'LA-S1-02: nor for nights before the Stay begins');

select lives_ok(
  $$ with leave as (
       insert into public.attendance_leaves
         (organization_id, property_id, stay_id, from_night, to_night)
       values ('f8a11111-1111-4111-8111-111111111111',
               'f8b11111-1111-4111-8111-111111111111',
               'f8d00000-0000-4000-8000-000000000007',
               app.property_today('f8b11111-1111-4111-8111-111111111111') + 3,
               app.property_today('f8b11111-1111-4111-8111-111111111111') + 3)
       returning id)
     insert into public.attendance_leave_reasons
       (leave_id, organization_id, property_id, reason)
     select id, 'f8a11111-1111-4111-8111-111111111111',
            'f8b11111-1111-4111-8111-111111111111', 'Before arrival'
       from leave $$,
  'LA-S1-02: a Resident who has yet to arrive is given leave from the day the Stay begins');

select throws_ok(
  $$ insert into public.attendance_leaves
       (organization_id, property_id, stay_id, from_night, to_night)
     values ('f8a11111-1111-4111-8111-111111111111',
             'f8b11111-1111-4111-8111-111111111111',
             'f8d00000-0000-4000-8000-000000000001',
             app.property_today('f8b11111-1111-4111-8111-111111111111') + 4,
             app.property_today('f8b11111-1111-4111-8111-111111111111') + 6) $$,
  '23P01', null,
  'LA-S1-03: one Resident is not away twice on one night');

select throws_ok(
  $$ insert into public.attendance_leaves
       (organization_id, property_id, stay_id, from_night, to_night)
     values ('f8a11111-1111-4111-8111-111111111111',
             'f8b11111-1111-4111-8111-111111111111',
             'f8d00000-0000-4000-8000-000000000002',
             app.property_today('f8b11111-1111-4111-8111-111111111111') + 5,
             app.property_today('f8b11111-1111-4111-8111-111111111111') + 4) $$,
  '23514', null,
  'LA-S1-01: the last night is not before the first');

select throws_ok(
  $$ insert into public.attendance_leave_reasons
       (leave_id, organization_id, property_id, reason)
     select id, organization_id, property_id, ' x'
       from public.attendance_leaves
      where stay_id = 'f8d00000-0000-4000-8000-000000000007' $$,
  '23514', null,
  'LA-S1-04: a reason is trimmed and at least two characters');

-- Cancelled while no night of it has passed: the nights are free again.
select lives_ok(
  $$ update public.attendance_leaves set status = 'cancelled'
      where stay_id = 'f8d00000-0000-4000-8000-000000000007' $$,
  'LA-S1-06: a leave none of whose nights has passed is cancelled');

select results_eq(
  $$ select status, closed_by, closed_at is not null
       from public.attendance_leaves
      where stay_id = 'f8d00000-0000-4000-8000-000000000007' $$,
  $$ values ('cancelled'::text, 'f8222222-2222-4222-8222-222222222222'::uuid, true) $$,
  'LA-S1-06: with who cancelled it and when, and it stays on the record');

select throws_ok(
  $$ update public.attendance_leaves set status = 'granted'
      where stay_id = 'f8d00000-0000-4000-8000-000000000007' $$,
  'RZL02', null,
  'LA-S1-05: a closed leave is not reopened');

select throws_ok(
  $$ delete from public.attendance_leaves $$,
  '42501', null,
  'LA-S1-05: a leave is never deleted');

-- A leave that began three nights ago and runs on.
select lives_ok(
  $$ with leave as (
       insert into public.attendance_leaves
         (organization_id, property_id, stay_id, from_night, to_night)
       values ('f8a11111-1111-4111-8111-111111111111',
               'f8b11111-1111-4111-8111-111111111111',
               'f8d00000-0000-4000-8000-000000000002',
               app.property_today('f8b11111-1111-4111-8111-111111111111') - 3,
               app.property_today('f8b11111-1111-4111-8111-111111111111') + 2)
       returning id)
     insert into public.attendance_leave_reasons
       (leave_id, organization_id, property_id, reason)
     select id, 'f8a11111-1111-4111-8111-111111111111',
            'f8b11111-1111-4111-8111-111111111111', 'Exam week at home'
       from leave $$,
  'LA-S1-01: leave may begin before today, for a desk recording it late');

select throws_ok(
  $$ update public.attendance_leaves set status = 'cancelled'
      where stay_id = 'f8d00000-0000-4000-8000-000000000002' $$,
  'RZL02', null,
  'LA-S1-06: a leave with a night already passed is not cancelled, it is ended');

select throws_ok(
  $$ update public.attendance_leaves
        set status = 'ended',
            to_night = app.property_today('f8b11111-1111-4111-8111-111111111111') + 3
      where stay_id = 'f8d00000-0000-4000-8000-000000000002' $$,
  'RZL02', null,
  'LA-S1-06: ending cannot make a leave longer');

select lives_ok(
  $$ update public.attendance_leaves
        set status = 'ended',
            to_night = app.property_today('f8b11111-1111-4111-8111-111111111111') - 1
      where stay_id = 'f8d00000-0000-4000-8000-000000000002' $$,
  'LA-S1-06: a begun leave is ended at the last night spent away');

select results_eq(
  $$ select status, to_night < planned_to_night, closed_by
       from public.attendance_leaves
      where stay_id = 'f8d00000-0000-4000-8000-000000000002' $$,
  $$ values ('ended'::text, true, 'f8222222-2222-4222-8222-222222222222'::uuid) $$,
  'LA-S1-06: shorter than it was planned, with who ended it');

-- ---------------------------------------------------------------------------
-- The roll
-- ---------------------------------------------------------------------------

select app.set_request_context('f8333333-3333-4333-8333-333333333333');

select lives_ok(
  $$ insert into public.attendance_marks
       (organization_id, property_id, stay_id, night, status)
     values ('f8a11111-1111-4111-8111-111111111111',
             'f8b11111-1111-4111-8111-111111111111',
             'f8d00000-0000-4000-8000-000000000003',
             app.property_today('f8b11111-1111-4111-8111-111111111111'), 'absent') $$,
  'LA-S1-09: a night warden marks a Resident absent');

select lives_ok(
  $$ insert into public.attendance_marks
       (organization_id, property_id, stay_id, night, status)
     values ('f8a11111-1111-4111-8111-111111111111',
             'f8b11111-1111-4111-8111-111111111111',
             'f8d00000-0000-4000-8000-000000000003',
             app.property_today('f8b11111-1111-4111-8111-111111111111'), 'present') $$,
  'LA-S1-09: and corrects it');

select results_eq(
  $$ select status, marked_by from public.attendance_marks
      where stay_id = 'f8d00000-0000-4000-8000-000000000003'
      order by id $$,
  $$ values ('absent'::text, 'f8333333-3333-4333-8333-333333333333'::uuid),
            ('present', 'f8333333-3333-4333-8333-333333333333') $$,
  'LA-S1-09: both stay, in order, each with who made it: the later is current');

select throws_ok(
  $$ insert into public.attendance_marks
       (organization_id, property_id, stay_id, night, status)
     values ('f8a11111-1111-4111-8111-111111111111',
             'f8b11111-1111-4111-8111-111111111111',
             'f8d00000-0000-4000-8000-000000000003',
             app.property_today('f8b11111-1111-4111-8111-111111111111') + 1, 'present') $$,
  'RZA01', null,
  'LA-S1-11: nobody is called for a night still to come');

select throws_ok(
  $$ insert into public.attendance_marks
       (organization_id, property_id, stay_id, night, status)
     values ('f8a11111-1111-4111-8111-111111111111',
             'f8b11111-1111-4111-8111-111111111111',
             'f8d00000-0000-4000-8000-000000000003',
             app.property_today('f8b11111-1111-4111-8111-111111111111') - 6, 'present') $$,
  'RZA01', null,
  'LA-S1-11: nor for a night before the Stay began');

select throws_ok(
  $$ insert into public.attendance_marks
       (organization_id, property_id, stay_id, night, status)
     values ('f8a11111-1111-4111-8111-111111111111',
             'f8b11111-1111-4111-8111-111111111111',
             'f8d00000-0000-4000-8000-000000000005',
             app.property_today('f8b11111-1111-4111-8111-111111111111'), 'present') $$,
  'RZA01', null,
  'LA-S1-11: nor a Guest, only a Resident');

select throws_ok(
  $$ insert into public.attendance_marks
       (organization_id, property_id, stay_id, night, status)
     values ('f8a11111-1111-4111-8111-111111111111',
             'f8b11111-1111-4111-8111-111111111111',
             'f8d00000-0000-4000-8000-000000000006',
             app.property_today('f8b11111-1111-4111-8111-111111111111') - 1, 'present') $$,
  'RZA01', null,
  'LA-S1-11: nor on a night after the Resident left');

select lives_ok(
  $$ insert into public.attendance_marks
       (organization_id, property_id, stay_id, night, status)
     values ('f8a11111-1111-4111-8111-111111111111',
             'f8b11111-1111-4111-8111-111111111111',
             'f8d00000-0000-4000-8000-000000000006',
             app.property_today('f8b11111-1111-4111-8111-111111111111') - 3, 'present') $$,
  'LA-S1-11: but on a night of the Stay they have since left, a late roll call is still one');

select throws_ok(
  $$ update public.attendance_marks set status = 'absent' $$,
  '42501', null,
  'LA-S1-12: a mark is never rewritten');

select throws_ok(
  $$ delete from public.attendance_marks $$,
  '42501', null,
  'LA-S1-12: nor deleted');

-- The warden reads who is away and not why.
select results_eq(
  $$ select count(*)::int from public.attendance_leaves $$,
  $$ values (3) $$,
  'LA-S1-08: the roll call reads who is away, all of it, cancelled and ended too');

select is_empty(
  $$ select 1 from public.attendance_leave_reasons $$,
  'LA-S1-08: and reads no reason');

select throws_ok(
  $$ insert into public.attendance_leaves
       (organization_id, property_id, stay_id, from_night, to_night)
     values ('f8a11111-1111-4111-8111-111111111111',
             'f8b11111-1111-4111-8111-111111111111',
             'f8d00000-0000-4000-8000-000000000004',
             app.property_today('f8b11111-1111-4111-8111-111111111111') + 1,
             app.property_today('f8b11111-1111-4111-8111-111111111111') + 1) $$,
  '42501', null,
  'LA-S1-07: a warden who may call the roll may not give leave');

select throws_ok(
  $$ insert into public.attendance_settings (property_id, organization_id, curfew_time)
     values ('f8b11111-1111-4111-8111-111111111111',
             'f8a11111-1111-4111-8111-111111111111', '22:00') $$,
  '42501', null,
  'LA-S1-18: nor set the curfew, which asks configuration.manage');

-- The leave granter reads the reasons and the marks, and writes no mark.
select app.set_request_context('f8444444-4444-4444-8444-444444444444');

select is(
  (select count(*)::int from public.attendance_leave_reasons),
  3,
  'LA-S1-08: whoever gives leave reads why');

select is(
  (select count(*)::int from public.attendance_marks
    where stay_id = 'f8d00000-0000-4000-8000-000000000003'),
  2,
  'LA-S1-10: and reads the marks, to see the roll beside the leave');

select throws_ok(
  $$ insert into public.attendance_marks
       (organization_id, property_id, stay_id, night, status)
     values ('f8a11111-1111-4111-8111-111111111111',
             'f8b11111-1111-4111-8111-111111111111',
             'f8d00000-0000-4000-8000-000000000004',
             app.property_today('f8b11111-1111-4111-8111-111111111111'), 'present') $$,
  '42501', null,
  'LA-S1-10: but may not call the roll');

-- The owner may set the curfew; a housekeeper and an outsider read nothing.
select app.set_request_context('f8111111-1111-4111-8111-111111111111');

select lives_ok(
  $$ insert into public.attendance_settings (property_id, organization_id, curfew_time)
     values ('f8b11111-1111-4111-8111-111111111111',
             'f8a11111-1111-4111-8111-111111111111', '23:30') $$,
  'LA-S1-18: whoever holds configuration.manage sets the curfew');

select results_eq(
  $$ select curfew_time::text, updated_by from public.attendance_settings $$,
  $$ values ('23:30:00'::text, 'f8111111-1111-4111-8111-111111111111'::uuid) $$,
  'LA-S1-18: stamped with who set it');

select app.set_request_context('f8555555-5555-4555-8555-555555555555');

select is_empty(
  $$ select 1 from public.attendance_leaves
     union all select 1 from public.attendance_marks
     union all select 1 from public.attendance_leave_reasons $$,
  'LA-S1-08: a housekeeper reads no leave, no roll, no reason');

select is(
  (select count(*)::int from public.attendance_settings),
  1,
  'LA-S1-17: the curfew itself is no secret, read by whoever reaches the Property');

select throws_ok(
  $$ insert into public.attendance_marks
       (organization_id, property_id, stay_id, night, status)
     values ('f8a11111-1111-4111-8111-111111111111',
             'f8b11111-1111-4111-8111-111111111111',
             'f8d00000-0000-4000-8000-000000000004',
             app.property_today('f8b11111-1111-4111-8111-111111111111'), 'present') $$,
  '42501', null,
  'LA-S1-10: and a housekeeper calls no roll');

select app.set_request_context('f8666666-6666-4666-8666-666666666666');

select is_empty(
  $$ select 1 from public.attendance_leaves
     union all select 1 from public.attendance_marks
     union all select 1 from public.attendance_leave_reasons
     union all select 1 from public.attendance_settings $$,
  'LA-S1-24: another Organization''s manager reads nothing of this one');

select throws_ok(
  $$ insert into public.attendance_marks
       (organization_id, property_id, stay_id, night, status)
     values ('f8a11111-1111-4111-8111-111111111111',
             'f8b11111-1111-4111-8111-111111111111',
             'f8d00000-0000-4000-8000-000000000004',
             app.property_today('f8b11111-1111-4111-8111-111111111111'), 'present') $$,
  'RZA01', null,
  'LA-S1-24: and writes nothing to it, the Resident not being found by someone who does not reach them');

-- A Property that does not keep attendance: the desk holds the permission and
-- is still refused, because the capability is the Property's.
select app.set_request_context('f8222222-2222-4222-8222-222222222222');

select throws_ok(
  $$ insert into public.attendance_marks
       (organization_id, property_id, stay_id, night, status)
     values ('f8a11111-1111-4111-8111-111111111111',
             'f8b33333-3333-4333-8333-333333333333',
             'f8d00000-0000-4000-8000-000000000008',
             app.property_today('f8b33333-3333-4333-8333-333333333333'), 'present') $$,
  '42501', null,
  'LA-S1-19: a Property without the attendance capability takes no roll');

select throws_ok(
  $$ insert into public.attendance_leaves
       (organization_id, property_id, stay_id, from_night, to_night)
     values ('f8a11111-1111-4111-8111-111111111111',
             'f8b33333-3333-4333-8333-333333333333',
             'f8d00000-0000-4000-8000-000000000008',
             app.property_today('f8b33333-3333-4333-8333-333333333333') + 1,
             app.property_today('f8b33333-3333-4333-8333-333333333333') + 1) $$,
  '42501', null,
  'LA-S1-19: and gives no leave');

-- A stay of another Organization is not found, so it is refused like the rest.
select throws_ok(
  $$ insert into public.attendance_marks
       (organization_id, property_id, stay_id, night, status)
     values ('f8a11111-1111-4111-8111-111111111111',
             'f8b11111-1111-4111-8111-111111111111',
             'f8d00000-0000-4000-8000-000000000009',
             app.property_today('f8b11111-1111-4111-8111-111111111111'), 'present') $$,
  'RZA01', null,
  'LA-S1-24: a Resident of another Organization cannot be named in this one''s roll');

set local role none;

-- Not even the role that owns the tables rewrites history: a grant says
-- nothing to it, so these are the triggers' own assertions.
select throws_ok(
  $$ update public.attendance_marks set status = 'absent' $$,
  '42501', null,
  'LA-S1-12: a mark is not rewritten by the owner either');

select throws_ok(
  $$ delete from public.attendance_marks $$,
  '42501', null,
  'LA-S1-12: nor deleted by the owner');

select throws_ok(
  $$ update public.attendance_leave_reasons set reason = 'Changed my mind' $$,
  '42501', null,
  'LA-S1-05: a reason is what was said, not rewritten by the owner');

select throws_ok(
  $$ delete from public.attendance_leaves $$,
  '42501', null,
  'LA-S1-05: a leave is not deleted by the owner');

select * from finish();
rollback;
