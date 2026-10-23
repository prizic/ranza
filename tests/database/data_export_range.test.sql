-- An export can be cut to a range of days, and its file is named for what it
-- holds (EXP-S1-50 .. EXP-S1-56, RANZ-74, ADR 0043).
--
-- What is asserted is the cut and the places it must not reach:
--
--   - the range is part of the request: the runtime role may name it, nothing
--     may rewrite it afterwards, and a range the database cannot hold (backwards,
--     a zone that is no zone, days with no clock) is refused when it is made;
--   - the three readers of dated rows return exactly the rows whose days meet the
--     range, both ends included, and the audit log's days are the range's clock's
--     days and not UTC's. Each reader is compared with the same export asked
--     without a range, so a cut that removed nothing is red;
--   - the two readers of lists, guests and rooms, are never cut;
--   - the helper that reads the range is executable by nobody who could ask it;
--   - the file's name is the Organization, what is in it, the range and the day.
--
-- Checked by breaking each in turn in the live database, the change printed
-- before the result was believed, and restored. Each went red on the assertion
-- named for it:
--   the reservations reader ignoring the last day     EXP-S1-52 (the booking that starts on it)
--   the reservations reader ignoring the first day    EXP-S1-52 (the booking that ends on it)
--   the folio reader cutting on business_date alone   EXP-S1-53 (a hand-typed line has none)
--   the audit reader cutting on UTC days              EXP-S1-54
--   the guests reader cut by the range                EXP-S1-55
--   the range left out of the rewrite refusal         EXP-S1-51
begin;
select plan(27);

-- ---------------------------------------------------------------------------
-- The world: one Organization, one Property on Istanbul's clock
-- ---------------------------------------------------------------------------

insert into public.users (id, email) values
  ('ee100000-0000-4000-8000-000000000001', 'range-owner@example.test');

insert into public.organizations (id, name, status) values
  ('ee0a0000-0000-4000-8000-00000000000a', 'Range Hotel Örnek', 'active'),
  ('ee0b0000-0000-4000-8000-00000000000b', 'فندق', 'active');

insert into public.subscriptions (organization_id, status) values
  ('ee0a0000-0000-4000-8000-00000000000a', 'active');

insert into public.entitlements (organization_id, module_key) values
  ('ee0a0000-0000-4000-8000-00000000000a', 'front_office'),
  ('ee0a0000-0000-4000-8000-00000000000a', 'billing_folios');

insert into public.properties (id, organization_id, name, status, timezone) values
  ('ee200000-0000-4000-8000-000000000001', 'ee0a0000-0000-4000-8000-00000000000a',
   'Range P1', 'active', 'Europe/Istanbul');

insert into public.property_capabilities (property_id, organization_id, capability_key, enabled) values
  ('ee200000-0000-4000-8000-000000000001', 'ee0a0000-0000-4000-8000-00000000000a', 'front_desk', true),
  ('ee200000-0000-4000-8000-000000000001', 'ee0a0000-0000-4000-8000-00000000000a', 'finance', true);

insert into public.organization_memberships
  (organization_id, user_id, role, role_scope_id, access_scope, status) values
  ('ee0a0000-0000-4000-8000-00000000000a', 'ee100000-0000-4000-8000-000000000001', 'owner',
   '00000000-0000-0000-0000-000000000000', 'organization_wide', 'active');

insert into public.guests (id, organization_id, full_name, email) values
  ('ee400000-0000-4000-8000-000000000001', 'ee0a0000-0000-4000-8000-00000000000a', 'Range Guest One', 'one@example.test'),
  ('ee400000-0000-4000-8000-000000000002', 'ee0a0000-0000-4000-8000-00000000000a', 'Range Guest Two', null);

insert into public.accommodation_units (id, property_id, organization_id, name, unit_type, capacity)
select ('ee3000' || lpad(n::text, 2, '0') || '-0000-4000-8000-000000000001')::uuid,
       'ee200000-0000-4000-8000-000000000001', 'ee0a0000-0000-4000-8000-00000000000a',
       'RNG-' || n, 'room', 2
  from generate_series(1, 9) as n;

-- The range is 20 to 10 days before the Property's today, both included: a room
-- night is charged only for a day that has ended.
create temp table clock as
  select app.property_today('ee200000-0000-4000-8000-000000000001') as today;
grant select on clock to public;

-- Bookings, by where they sit against that range (days before today):
--   1 inside (18-16)             2 before (29-27)         3 after (3-1)
--   4 ends on the first day (24-20)   5 starts on the last day (10-8)
--   6 one day after it (9-7)          7 open-ended, began before (28, no end)
--   8 one day short of it (24-21)
insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id, stay_type,
   status, starts_on, ends_on)
select ('ee6000' || lpad(r.n::text, 2, '0') || '-0000-4000-8000-000000000001')::uuid,
       'ee0a0000-0000-4000-8000-00000000000a', 'ee200000-0000-4000-8000-000000000001',
       ('ee3000' || lpad(r.n::text, 2, '0') || '-0000-4000-8000-000000000001')::uuid,
       'ee400000-0000-4000-8000-000000000001',
       case when r.n = 7 then 'resident' else 'guest' end, 'confirmed',
       clock.today + r.starts, case when r.n = 7 then null else clock.today + r.ends end
  from clock,
       (values (1, -18, -16), (2, -29, -27), (3, -3, -1), (4, -24, -20), (5, -10, -8),
               (6, -9, -7), (7, -28, 0), (8, -24, -21)) as r(n, starts, ends);

-- A walk-in with no booking behind it: one inside, one outside.
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, user_id, stay_type,
   status, starts_on, ends_on)
select w.id::uuid, 'ee0a0000-0000-4000-8000-00000000000a', 'ee200000-0000-4000-8000-000000000001',
       w.unit::uuid, null, 'guest', 'reserved', clock.today + w.starts, clock.today + w.ends
  from clock,
       (values ('ee700000-0000-4000-8000-000000000001', 'ee300009-0000-4000-8000-000000000001', -15, -14),
               ('ee700000-0000-4000-8000-000000000002', 'ee300009-0000-4000-8000-000000000001', -5, -4))
         as w(id, unit, starts, ends);

-- One Folio with a room night inside the range, one outside, and two lines
-- typed in by hand (no business date): one posted inside, one outside, by the
-- Property's clock.
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, user_id, stay_type,
   status, starts_on, ends_on)
select 'ee700000-0000-4000-8000-000000000003', 'ee0a0000-0000-4000-8000-00000000000a',
       'ee200000-0000-4000-8000-000000000001', 'ee300008-0000-4000-8000-000000000001',
       null, 'guest', 'reserved', clock.today + 50, clock.today + 51
  from clock;

insert into public.folios (id, organization_id, property_id, stay_id, currency) values
  ('ee800000-0000-4000-8000-000000000001', 'ee0a0000-0000-4000-8000-00000000000a',
   'ee200000-0000-4000-8000-000000000001', 'ee700000-0000-4000-8000-000000000003', 'TRY');

insert into public.folio_lines
  (id, organization_id, property_id, folio_id, line_type, description, amount_minor,
   source, business_date, posted_at)
select l.id::uuid, 'ee0a0000-0000-4000-8000-00000000000a', 'ee200000-0000-4000-8000-000000000001',
       'ee800000-0000-4000-8000-000000000001', 'charge', l.description, 1000,
       l.source, case when l.source is null then null else clock.today + l.day end,
       case when l.source is null
            then (clock.today + l.day)::timestamp at time zone 'Europe/Istanbul' + interval '2 hours'
            else now() end
  from clock,
       (values ('ee900000-0000-4000-8000-000000000001', 'Room night inside', 'room_night', -15),
               ('ee900000-0000-4000-8000-000000000002', 'Room night outside', 'room_night', -5),
               ('ee900000-0000-4000-8000-000000000003', 'Typed in, inside', null, -14),
               ('ee900000-0000-4000-8000-000000000004', 'Typed in, outside', null, -3))
         as l(id, description, source, day);

-- Audit records at the edges of April on Istanbul's clock (UTC+3): the first
-- two straddle midnight of the 1st, the last two midnight of the 30th. UTC days
-- would put the second and the third on the other side of their edges.
insert into audit.records
  (id, organization_id, location_id, actor_id, action, subject_type, subject_id, occurred_at) values
  ('eea00000-0000-4000-8000-000000000001', 'ee0a0000-0000-4000-8000-00000000000a', null,
   'ee100000-0000-4000-8000-000000000001', 'staff.invited', 'membership',
   'ee100000-0000-4000-8000-000000000001', timestamptz '2026-03-31 23:30+03'),
  ('eea00000-0000-4000-8000-000000000002', 'ee0a0000-0000-4000-8000-00000000000a', null,
   'ee100000-0000-4000-8000-000000000001', 'staff.invited', 'membership',
   'ee100000-0000-4000-8000-000000000001', timestamptz '2026-04-01 00:30+03'),
  ('eea00000-0000-4000-8000-000000000003', 'ee0a0000-0000-4000-8000-00000000000a', null,
   'ee100000-0000-4000-8000-000000000001', 'staff.invited', 'membership',
   'ee100000-0000-4000-8000-000000000001', timestamptz '2026-04-30 23:30+03'),
  ('eea00000-0000-4000-8000-000000000004', 'ee0a0000-0000-4000-8000-00000000000a', null,
   'ee100000-0000-4000-8000-000000000001', 'staff.invited', 'membership',
   'ee100000-0000-4000-8000-000000000001', timestamptz '2026-05-01 00:30+03');

-- Exports, inserted as the owner of the database so that what a reader does is
-- the thing under test (the request policy is under test in data_export.test.sql).
--   E1 the dated datasets, cut to days 20 to 10 before today
--   E2 the same datasets, whole
--   E3 the audit log, cut to April on Istanbul's clock
--   E4 guests and rooms, cut to the same days (which must not touch them)
--   E5 guests and rooms, whole
insert into public.data_exports
  (id, organization_id, requester_id, requester_name, resource_types, format,
   range_from, range_to, range_timezone)
select e.id::uuid, 'ee0a0000-0000-4000-8000-00000000000a', 'ee100000-0000-4000-8000-000000000001',
       'Owner', e.resources, 'csv', e.range_from, e.range_to, e.zone
  from clock,
       (values
         ('ee000000-0000-4000-8000-000000000001', array['reservations_stays', 'folios_payments'],
          (select today - 20 from clock), (select today - 10 from clock), 'Europe/Istanbul'),
         ('ee000000-0000-4000-8000-000000000002', array['reservations_stays', 'folios_payments'],
          null::date, null::date, null::text),
         ('ee000000-0000-4000-8000-000000000003', array['audit_log'],
          date '2026-04-01', date '2026-04-30', 'Europe/Istanbul'),
         ('ee000000-0000-4000-8000-000000000004', array['residents_guests', 'rooms_beds'],
          (select today - 20 from clock), (select today - 10 from clock), 'Europe/Istanbul'),
         ('ee000000-0000-4000-8000-000000000005', array['residents_guests', 'rooms_beds'],
          null::date, null::date, null::text)
       ) as e(id, resources, range_from, range_to, zone);

-- ---------------------------------------------------------------------------
-- What the request may say
-- ---------------------------------------------------------------------------

select set_eq(
  $$select column_name::text || ' ' || privilege_type
      from information_schema.column_privileges
     where grantee = 'ranza_app' and table_schema = 'public' and table_name = 'data_exports'
       and column_name in ('range_from', 'range_to', 'range_timezone')$$,
  $$values ('range_from INSERT'), ('range_from SELECT'), ('range_to INSERT'), ('range_to SELECT'),
           ('range_timezone INSERT'), ('range_timezone SELECT')$$,
  'EXP-S1-50: the runtime role names a range when it asks and reads it back, and may change it never');

select throws_ok(
  $$insert into public.data_exports
      (organization_id, requester_id, requester_name, resource_types, format,
       range_from, range_to, range_timezone)
    values ('ee0a0000-0000-4000-8000-00000000000a', 'ee100000-0000-4000-8000-000000000001',
            'Owner', array['audit_log'], 'csv', date '2026-04-30', date '2026-04-01', 'UTC')$$,
  '23514', null,
  'EXP-S1-50: a range that ends before it starts is refused when it is made');

select throws_ok(
  $$insert into public.data_exports
      (organization_id, requester_id, requester_name, resource_types, format, range_from)
    values ('ee0a0000-0000-4000-8000-00000000000a', 'ee100000-0000-4000-8000-000000000001',
            'Owner', array['audit_log'], 'csv', date '2026-04-01')$$,
  '23514', null,
  'EXP-S1-50: days without a clock to read them on are refused');

select throws_ok(
  $$insert into public.data_exports
      (organization_id, requester_id, requester_name, resource_types, format,
       range_from, range_timezone)
    values ('ee0a0000-0000-4000-8000-00000000000a', 'ee100000-0000-4000-8000-000000000001',
            'Owner', array['audit_log'], 'csv', date '2026-04-01', 'Mars/Olympus_Mons')$$,
  '23514', 'that is not a time zone',
  'EXP-S1-50: a clock that is no time zone is refused at the door and not on the worker''s day');

select is(
  (select count(*)::int from public.data_exports
    where id = 'ee000000-0000-4000-8000-000000000002'
      and range_from is null and range_to is null and range_timezone is null),
  1,
  'EXP-S1-50: a request that names no range holds none, and means every date');

select throws_ok(
  $$update public.data_exports set range_to = range_to + 1
     where id = 'ee000000-0000-4000-8000-000000000001'$$,
  '23514', 'what an export asked for, and who asked, is never rewritten',
  'EXP-S1-51: the range an export was asked for is never rewritten');

select throws_ok(
  $$update public.data_exports set range_timezone = 'UTC'
     where id = 'ee000000-0000-4000-8000-000000000001'$$,
  '23514', 'what an export asked for, and who asked, is never rewritten',
  'EXP-S1-51: nor is the clock its days were read on');

-- ---------------------------------------------------------------------------
-- The worker's readers
-- ---------------------------------------------------------------------------

select app.set_worker_context('ee0a0000-0000-4000-8000-00000000000a', 'data_export.test');
select count(*) from app.claim_data_export('ee000000-0000-4000-8000-000000000001');
select count(*) from app.claim_data_export('ee000000-0000-4000-8000-000000000002');
select count(*) from app.claim_data_export('ee000000-0000-4000-8000-000000000003');
select count(*) from app.claim_data_export('ee000000-0000-4000-8000-000000000004');
select count(*) from app.claim_data_export('ee000000-0000-4000-8000-000000000005');

set local role ranza_worker;

select set_eq(
  $$select reservation_id::text from app.export_reservations('ee000000-0000-4000-8000-000000000001')
     where reservation_id is not null$$,
  $$values ('ee600001-0000-4000-8000-000000000001'), ('ee600004-0000-4000-8000-000000000001'),
           ('ee600005-0000-4000-8000-000000000001'), ('ee600007-0000-4000-8000-000000000001')$$,
  'EXP-S1-52: a booking is in the range when any of its nights is: inside, ending on the first day, starting on the last, and open-ended from before');

select ok(
  not exists (select 1 from app.export_reservations('ee000000-0000-4000-8000-000000000001')
               where reservation_id in ('ee600002-0000-4000-8000-000000000001',
                                        'ee600003-0000-4000-8000-000000000001',
                                        'ee600006-0000-4000-8000-000000000001',
                                        'ee600008-0000-4000-8000-000000000001')),
  'EXP-S1-52: and a booking before it, after it, or one day short of either end is not');

select set_eq(
  $$select stay_id::text from app.export_reservations('ee000000-0000-4000-8000-000000000001')
     where reservation_id is null$$,
  $$values ('ee700000-0000-4000-8000-000000000001')$$,
  'EXP-S1-52: a Stay with no booking is cut by its own days');

select is(
  (select count(*)::int from app.export_reservations('ee000000-0000-4000-8000-000000000002')
    where reservation_id is not null or stay_id is not null),
  11,
  'EXP-S1-52: and asked without a range, the same export holds every booking and walk-in');

select set_eq(
  $$select line_id::text from app.export_folio_lines('ee000000-0000-4000-8000-000000000001')$$,
  $$values ('ee900000-0000-4000-8000-000000000001'), ('ee900000-0000-4000-8000-000000000003')$$,
  'EXP-S1-53: a folio line is in the range by its business date, or by the day it was posted when it has none');

select is(
  (select count(*)::int from app.export_folio_lines('ee000000-0000-4000-8000-000000000002')),
  4,
  'EXP-S1-53: and asked without a range, the Folio gives all four of its lines');

select set_eq(
  $$select id::text from app.export_audit_records('ee000000-0000-4000-8000-000000000003')$$,
  $$values ('eea00000-0000-4000-8000-000000000002'), ('eea00000-0000-4000-8000-000000000003')$$,
  'EXP-S1-54: the audit log is cut by the days of the range''s clock: April on Istanbul''s, not UTC''s');

select is(
  (select count(*)::int from app.export_guests('ee000000-0000-4000-8000-000000000004')),
  (select count(*)::int from app.export_guests('ee000000-0000-4000-8000-000000000005')),
  'EXP-S1-55: guests are a list and a range does not cut them');

select is(
  (select count(*)::int from app.export_units('ee000000-0000-4000-8000-000000000004')),
  (select count(*)::int from app.export_units('ee000000-0000-4000-8000-000000000005')),
  'EXP-S1-55: nor does it cut rooms');

select ok(
  (select count(*) from app.export_guests('ee000000-0000-4000-8000-000000000004')) = 2
  and (select count(*) from app.export_units('ee000000-0000-4000-8000-000000000004')) = 9,
  'EXP-S1-55: and that comparison compared something');

set local role none;

-- ---------------------------------------------------------------------------
-- Who may ask the helper
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('ranza_app', 'app.data_export_range(uuid)', 'execute')
  and not has_function_privilege('ranza_worker', 'app.data_export_range(uuid)', 'execute')
  and not has_function_privilege('ranza_auth', 'app.data_export_range(uuid)', 'execute')
  and not has_function_privilege('ranza_app', 'app.export_file_name(text, text[], text, date, date, date)', 'execute')
  and not has_function_privilege('ranza_worker', 'app.export_file_name(text, text[], text, date, date, date)', 'execute'),
  'EXP-S1-56: the range helper and the naming helper are called from the definers and from nowhere else');

-- ---------------------------------------------------------------------------
-- A file named for what it holds
-- ---------------------------------------------------------------------------

select is(
  app.export_file_name('Deniz Otelleri', array['reservations_stays', 'residents_guests'], 'csv',
                       null, null, date '2026-10-19'),
  'deniz-otelleri-guests-reservations-2026-10-19.csv',
  'EXP-S1-56: the name is the Organization, the datasets in the catalogue''s order and the day');

select is(
  app.export_file_name('Deniz Otelleri', array['folios_payments'], 'json',
                       date '2026-01-01', date '2026-03-31', date '2026-10-19'),
  'deniz-otelleri-folios-2026-01-01-to-2026-03-31-2026-10-19.json',
  'EXP-S1-56: a range is in the name, both ends');

select is(
  app.export_file_name('Deniz Otelleri', array['audit_log'], 'csv',
                       date '2026-01-01', null, date '2026-10-19'),
  'deniz-otelleri-audit-log-from-2026-01-01-2026-10-19.csv',
  'EXP-S1-56: and so is a range with one end');

select is(
  app.export_file_name('Deniz Otelleri', array['residents_guests', 'rooms_beds', 'audit_log'], 'csv',
                       null, null, date '2026-10-19'),
  'deniz-otelleri-data-2026-10-19.csv',
  'EXP-S1-56: three datasets or more are "data", because a name that long is no longer a name');

select is(
  app.export_file_name('فندق', array['rooms_beds'], 'csv', null, null, date '2026-10-19'),
  'ranza-rooms-2026-10-19.csv',
  'EXP-S1-56: an Organization named in a script with no Latin letters is "ranza"');

select is(
  app.export_file_name('  --Ünïcode & Co.!!  ', array['rooms_beds'], 'csv', null, null, date '2026-10-19'),
  'unicode-co-rooms-2026-10-19.csv',
  'EXP-S1-56: accents are folded and anything that is not a letter or digit is dropped, so the name is safe in a header');

select is(
  app.export_file_name(repeat('abc ', 30), array['rooms_beds'], 'csv', null, null, date '2026-10-19')
    ~ '^[a-z0-9-]{1,40}-rooms-2026-10-19\.csv$',
  true,
  'EXP-S1-56: a long Organization name is cut to forty characters');

-- The worker finishes an export and the name it gets is that one.
select app.set_worker_context('ee0a0000-0000-4000-8000-00000000000a', 'data_export.test');
set local role ranza_worker;
select app.complete_data_export('ee000000-0000-4000-8000-000000000001', 'x', '{}'::jsonb);
set local role none;

select is(
  (select file_name from public.data_exports where id = 'ee000000-0000-4000-8000-000000000001'),
  'range-hotel-ornek-reservations-folios-' ||
    (select (today - 20)::text from clock) || '-to-' || (select (today - 10)::text from clock) ||
    '-' || (now() at time zone 'utc')::date::text || '.csv',
  'EXP-S1-56: a finished export carries the name, the range and the day it was made on');

select is(
  (select file_name from public.data_exports where id = 'ee000000-0000-4000-8000-000000000001') ~ '^[A-Za-z0-9._-]+$',
  true,
  'EXP-S1-56: and a name with nothing in it that a header could not carry');

select finish();
rollback;
