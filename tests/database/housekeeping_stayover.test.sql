-- Cleaning a room somebody is staying in (RANZ-83, ADR 0063).
--
-- Three claims, and they fail in different ways on purpose:
--
--   the schedule  which occupied rooms are due, under each cadence, and which
--                 are not whatever the cadence says: a dirty room (turnover's
--                 work), a blocked one, one everybody leaves today.
--
--   the gate      who may set the schedule, who may record a clean and take
--                 it back, which Unit may be cleaned, and that the date and
--                 the actor are the database's to say.
--
--   the border    a room that is due a stayover clean is not dirty, is still
--                 ready to let, and a hotel's turnover reads the same as it
--                 did: nothing here reaches housekeeping_unit_status.
--
-- Rows in docs/features/housekeeping/edge-cases.csv are named beside the
-- assertion that proves them. Each break below was applied inside a rolled-back
-- transaction, the altered object printed first, and the named assertion seen
-- red (the run is recorded in docs/evidence/housekeeping/stayover-sabotage.txt):
--   the weekly formula off by one day                      HK-S4-01 weekly
--   the function listing a dirty room                      HK-S4-06
--   the function listing a room everyone leaves today      HK-S4-07
--   the function listing a room out of service             HK-S4-06 out of service
--   the function ignoring the last clean                   HK-S4-05 cleaned
--   insert policy without the permission                   HK-S4-08 permission
--   insert policy without the capability                   HK-S4-08 capability
--   insert policy accepting a bed under a room             HK-S4-09
--   update policy without the same-day limit               HK-S4-14
--   update policy without the permission                   HK-S4-13
--   insert grant widened to cleaned_on                     HK-S4-11
--   settings insert policy without accommodation.configure HK-S4-04
--   settings shape check dropped                           HK-S4-03
--   a delete grant added                                   HK-S4-12
-- One break stays green, and says which reason binds: taking the permission out
-- of the update policy's USING alone changes nothing, because its WITH CHECK
-- asks the same question of the row afterwards and subsumes it. Both clauses
-- carry it so neither depends on the other being there.
begin;
select plan(49);

insert into public.users (id, email) values
  ('61111111-1111-4111-8111-111111111111', 'so-manager@example.test'),
  ('62222222-2222-4222-8222-222222222222', 'so-desk@example.test'),
  ('63333333-3333-4333-8333-333333333333', 'so-finance@example.test'),
  ('64444444-4444-4444-8444-444444444444', 'so-outsider@example.test'),
  ('65555555-5555-4555-8555-555555555555', 'so-one-property@example.test');

insert into public.organizations (id, name, status) values
  ('6a111111-1111-4111-8111-111111111111', 'Stayover Organization', 'active'),
  ('6a222222-2222-4222-8222-222222222222', 'Stayover Other Organization', 'active');

insert into public.properties (id, organization_id, name) values
  ('6b111111-1111-4111-8111-111111111111',
   '6a111111-1111-4111-8111-111111111111', 'Stayover First Property'),
  ('6b222222-2222-4222-8222-222222222222',
   '6a111111-1111-4111-8111-111111111111', 'Stayover No Housekeeping'),
  ('6b333333-3333-4333-8333-333333333333',
   '6a222222-2222-4222-8222-222222222222', 'Stayover Other Property');

insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('6a111111-1111-4111-8111-111111111111',
   '61111111-1111-4111-8111-111111111111', 'manager', 'organization_wide'),
  ('6a111111-1111-4111-8111-111111111111',
   '62222222-2222-4222-8222-222222222222', 'front_desk', 'organization_wide'),
  ('6a111111-1111-4111-8111-111111111111',
   '63333333-3333-4333-8333-333333333333', 'finance', 'organization_wide'),
  ('6a111111-1111-4111-8111-111111111111',
   '65555555-5555-4555-8555-555555555555', 'manager', 'assigned_properties'),
  ('6a222222-2222-4222-8222-222222222222',
   '64444444-4444-4444-8444-444444444444', 'manager', 'organization_wide');

-- The manager reaching one Property is assigned to the one without housekeeping.
insert into public.property_assignments (property_id, organization_id, user_id)
values ('6b222222-2222-4222-8222-222222222222',
        '6a111111-1111-4111-8111-111111111111',
        '65555555-5555-4555-8555-555555555555');

insert into public.subscriptions (organization_id, status) values
  ('6a111111-1111-4111-8111-111111111111', 'active'),
  ('6a222222-2222-4222-8222-222222222222', 'active');

insert into public.entitlements (organization_id, module_key) values
  ('6a111111-1111-4111-8111-111111111111', 'housekeeping'),
  ('6a222222-2222-4222-8222-222222222222', 'housekeeping');

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('6b111111-1111-4111-8111-111111111111',
   '6a111111-1111-4111-8111-111111111111', 'housekeeping', true),
  ('6b333333-3333-4333-8333-333333333333',
   '6a222222-2222-4222-8222-222222222222', 'housekeeping', true);

-- Rooms at the first Property, each named for what it proves:
--   S-1 arrived yesterday          S-2 arrived today          S-3 three days ago
--   S-4 ten days ago               S-5 dirty                  S-6 out of service
--   S-7 everyone leaves today      S-8 two beds               S-9 marked clean today
--   S-0 nobody in it
-- and a room at the Property without housekeeping.
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity, building, floor)
values
  ('6c000000-0000-4000-8000-000000000000', '6b111111-1111-4111-8111-111111111111',
   '6a111111-1111-4111-8111-111111111111', 'S-0', 'room', 2, 'Blok A', 1),
  ('6c100000-0000-4000-8000-000000000000', '6b111111-1111-4111-8111-111111111111',
   '6a111111-1111-4111-8111-111111111111', 'S-1', 'room', 2, 'Blok A', 1),
  ('6c200000-0000-4000-8000-000000000000', '6b111111-1111-4111-8111-111111111111',
   '6a111111-1111-4111-8111-111111111111', 'S-2', 'room', 2, 'Blok A', 2),
  ('6c300000-0000-4000-8000-000000000000', '6b111111-1111-4111-8111-111111111111',
   '6a111111-1111-4111-8111-111111111111', 'S-3', 'room', 2, 'Blok B', 1),
  ('6c400000-0000-4000-8000-000000000000', '6b111111-1111-4111-8111-111111111111',
   '6a111111-1111-4111-8111-111111111111', 'S-4', 'room', 2, 'Blok B', 1),
  ('6c500000-0000-4000-8000-000000000000', '6b111111-1111-4111-8111-111111111111',
   '6a111111-1111-4111-8111-111111111111', 'S-5', 'room', 2, 'Blok B', 2),
  ('6c600000-0000-4000-8000-000000000000', '6b111111-1111-4111-8111-111111111111',
   '6a111111-1111-4111-8111-111111111111', 'S-6', 'room', 2, 'Blok B', 2),
  ('6c700000-0000-4000-8000-000000000000', '6b111111-1111-4111-8111-111111111111',
   '6a111111-1111-4111-8111-111111111111', 'S-7', 'room', 2, 'Blok B', 2),
  ('6c800000-0000-4000-8000-000000000000', '6b111111-1111-4111-8111-111111111111',
   '6a111111-1111-4111-8111-111111111111', 'S-8', 'room', 2, 'Blok A', 2),
  ('6c900000-0000-4000-8000-000000000000', '6b111111-1111-4111-8111-111111111111',
   '6a111111-1111-4111-8111-111111111111', 'S-9', 'room', 2, 'Blok A', 1),
  ('6cb00000-0000-4000-8000-000000000000', '6b222222-2222-4222-8222-222222222222',
   '6a111111-1111-4111-8111-111111111111', 'S-X', 'room', 2, null, null),
  ('6cc00000-0000-4000-8000-000000000000', '6b333333-3333-4333-8333-333333333333',
   '6a222222-2222-4222-8222-222222222222', 'S-O', 'room', 2, null, null);

insert into public.accommodation_units
  (id, property_id, organization_id, parent_id, parent_unit_type,
   name, unit_type, capacity)
values
  ('6c8a0000-0000-4000-8000-000000000000', '6b111111-1111-4111-8111-111111111111',
   '6a111111-1111-4111-8111-111111111111',
   '6c800000-0000-4000-8000-000000000000', 'room', 'A', 'bed', 1),
  ('6c8b0000-0000-4000-8000-000000000000', '6b111111-1111-4111-8111-111111111111',
   '6a111111-1111-4111-8111-111111111111',
   '6c800000-0000-4000-8000-000000000000', 'room', 'B', 'bed', 1);

-- Who is in which room. Dates are relative to the Property's own today, never
-- fixed, so the suite does not rot on the calendar.
insert into public.stays
  (organization_id, property_id, accommodation_unit_id, stay_type, status,
   starts_on, ends_on)
select '6a111111-1111-4111-8111-111111111111', property_id::uuid, unit_id::uuid,
       'guest', 'in_house',
       app.property_today(property_id::uuid) - ago,
       app.property_today(property_id::uuid) + ahead
from (values
  ('6b111111-1111-4111-8111-111111111111', '6c100000-0000-4000-8000-000000000000', 1, 30),
  ('6b111111-1111-4111-8111-111111111111', '6c200000-0000-4000-8000-000000000000', 0, 30),
  ('6b111111-1111-4111-8111-111111111111', '6c300000-0000-4000-8000-000000000000', 3, 30),
  ('6b111111-1111-4111-8111-111111111111', '6c400000-0000-4000-8000-000000000000', 10, 30),
  ('6b111111-1111-4111-8111-111111111111', '6c500000-0000-4000-8000-000000000000', 5, 30),
  ('6b111111-1111-4111-8111-111111111111', '6c600000-0000-4000-8000-000000000000', 5, 30),
  ('6b111111-1111-4111-8111-111111111111', '6c700000-0000-4000-8000-000000000000', 5, 0),
  ('6b111111-1111-4111-8111-111111111111', '6c8a0000-0000-4000-8000-000000000000', 5, 30),
  ('6b111111-1111-4111-8111-111111111111', '6c8b0000-0000-4000-8000-000000000000', 2, 30),
  ('6b111111-1111-4111-8111-111111111111', '6c900000-0000-4000-8000-000000000000', 5, 30),
  ('6b222222-2222-4222-8222-222222222222', '6cb00000-0000-4000-8000-000000000000', 5, 30)
) as stay (property_id, unit_id, ago, ahead);

-- S-6 is taken out of service after its occupant arrived: a leak found while
-- somebody lives there. (Blocking a room somebody is in is refused, taking it
-- out of order for repair is not.)
update public.accommodation_units
   set status = 'out_of_service'
 where id = '6c600000-0000-4000-8000-000000000000';

-- S-5 is dirty: turnover's work. S-9 was marked clean today.
insert into public.housekeeping_unit_status
  (accommodation_unit_id, property_id, organization_id, status)
values
  ('6c500000-0000-4000-8000-000000000000', '6b111111-1111-4111-8111-111111111111',
   '6a111111-1111-4111-8111-111111111111', 'dirty'),
  ('6c900000-0000-4000-8000-000000000000', '6b111111-1111-4111-8111-111111111111',
   '6a111111-1111-4111-8111-111111111111', 'clean');

-- ---------------------------------------------------------------------------
-- The schedule (HK-S4-01)
-- ---------------------------------------------------------------------------

-- Every day. S-1 arrived yesterday (due today), S-3 and S-4 and S-8 are older,
-- S-2 arrived today. The rest are excluded for their own reasons below.
select set_eq(
  $$select name from public.accommodation_units
     where id in (select holder_id from app.housekeeping_stayover_rooms(
       '6b111111-1111-4111-8111-111111111111', 'every_n_days', 1, null))$$,
  array['S-1', 'S-3', 'S-4', 'S-8'],
  'HK-S4-01: every day, a room somebody arrived in before today is due, and one they arrived in today is not');

-- Every 3 days. S-3 arrived exactly three days ago, S-1 only one.
select set_eq(
  $$select name from public.accommodation_units
     where id in (select holder_id from app.housekeeping_stayover_rooms(
       '6b111111-1111-4111-8111-111111111111', 'every_n_days', 3, null))$$,
  array['S-3', 'S-4', 'S-8'],
  'HK-S4-01: every three days, only rooms whose cycle began three or more days ago are due');

-- Weekly, on today's weekday. That weekday comes round today for every room whose
-- cycle began before today; one that began today waits a week; and one that
-- began ten days ago was due the weekday a week ago, so it is overdue and stays
-- due until it is cleaned.
select set_eq(
  $$select name from public.accommodation_units
     where id in (select holder_id from app.housekeeping_stayover_rooms(
       '6b111111-1111-4111-8111-111111111111', 'weekly',
       null, extract(isodow from app.property_today(
         '6b111111-1111-4111-8111-111111111111'))::integer))$$,
  array['S-1', 'S-3', 'S-4', 'S-8'],
  'HK-S4-01 weekly: a room is due on the schedule''s weekday after its cycle began, and stays due until it is cleaned');

select is(
  (select due_on from app.housekeeping_stayover_rooms(
     '6b111111-1111-4111-8111-111111111111', 'weekly', null,
     extract(isodow from app.property_today(
       '6b111111-1111-4111-8111-111111111111'))::integer)
    where holder_id = '6c400000-0000-4000-8000-000000000000'),
  app.property_today('6b111111-1111-4111-8111-111111111111') - 7,
  'HK-S4-01 weekly: a room ten days in fell due the weekday a week ago, and is overdue');

-- Weekly, on the weekday after today's: that weekday has not come round for
-- anyone who arrived in the last few days, and last came round six days ago for
-- the room ten days in, which has not been cleaned since.
select set_eq(
  $$select name from public.accommodation_units
     where id in (select holder_id from app.housekeeping_stayover_rooms(
       '6b111111-1111-4111-8111-111111111111', 'weekly', null,
       (extract(isodow from app.property_today(
          '6b111111-1111-4111-8111-111111111111'))::integer % 7) + 1))$$,
  array['S-4'],
  'HK-S4-01 weekly: tomorrow''s weekday leaves rooms that arrived in the last few days not yet due');

select is_empty(
  $$select 1 from app.housekeeping_stayover_rooms(
      '6b111111-1111-4111-8111-111111111111', 'none', null, null)$$,
  'HK-S4-02: a Property that cleans rooms in use never has any due');

select is_empty(
  $$select 1 from app.housekeeping_stayover_rooms(
      '6b111111-1111-4111-8111-111111111111', 'every_n_days', 0, null)
    union all
    select 1 from app.housekeeping_stayover_rooms(
      '6b111111-1111-4111-8111-111111111111', 'weekly', null, 8)
    union all
    select 1 from app.housekeeping_stayover_rooms(
      '6b111111-1111-4111-8111-111111111111', 'monthly', null, null)$$,
  'HK-S4-03: a schedule the table would not store lists nothing rather than guessing');

-- ---------------------------------------------------------------------------
-- What is never listed (HK-S4-06, HK-S4-07)
-- ---------------------------------------------------------------------------

select is_empty(
  $$select 1 from app.housekeeping_stayover_rooms(
      '6b111111-1111-4111-8111-111111111111', 'every_n_days', 1, null)
     where holder_id = '6c500000-0000-4000-8000-000000000000'$$,
  'HK-S4-06: a dirty room is turnover''s work and is not listed');

select is_empty(
  $$select 1 from app.housekeeping_stayover_rooms(
      '6b111111-1111-4111-8111-111111111111', 'every_n_days', 1, null)
     where holder_id = '6c600000-0000-4000-8000-000000000000'$$,
  'HK-S4-06: a room out of service is not listed');

select is_empty(
  $$select 1 from app.housekeeping_stayover_rooms(
      '6b111111-1111-4111-8111-111111111111', 'every_n_days', 1, null)
     where holder_id = '6c700000-0000-4000-8000-000000000000'$$,
  'HK-S4-07: a room everyone in it leaves today is about to be turnover and is not listed');

select is_empty(
  $$select 1 from app.housekeeping_stayover_rooms(
      '6b111111-1111-4111-8111-111111111111', 'every_n_days', 1, null)
     where holder_id = '6c900000-0000-4000-8000-000000000000'$$,
  'HK-S4-05: a room marked clean today starts its cycle again and is not due');

select is_empty(
  $$select 1 from app.housekeeping_stayover_rooms(
      '6b111111-1111-4111-8111-111111111111', 'every_n_days', 1, null)
     where holder_id = '6c000000-0000-4000-8000-000000000000'$$,
  'HK-S4-05: a room nobody is in is not listed');

-- A bed is cleaned with its room: two beds are one room with two people, and the
-- cycle began with whoever arrived first.
select results_eq(
  $$select occupants, arrived_on from app.housekeeping_stayover_rooms(
      '6b111111-1111-4111-8111-111111111111', 'every_n_days', 1, null)
     where holder_id = '6c800000-0000-4000-8000-000000000000'$$,
  $$select 2, app.property_today('6b111111-1111-4111-8111-111111111111') - 5$$,
  'HK-S4-09: a room let by the bed is one line, counting both people, from the first arrival');

-- ---------------------------------------------------------------------------
-- The border: stayover touches no status (HK-S4-05)
-- ---------------------------------------------------------------------------

select ok(app.unit_is_ready('6c100000-0000-4000-8000-000000000000'),
  'HK-S4-05: a room due a stayover clean is still ready as far as housekeeping goes');

select is(
  (select status from app.unit_housekeeping_state('6c100000-0000-4000-8000-000000000000')),
  'clean',
  'HK-S4-05: and it reads clean, not dirty');

select ok(not app.unit_is_ready('6c500000-0000-4000-8000-000000000000'),
  'HK-S4-05: turnover is unchanged, a dirty room is still not ready');

select ok(app.unit_is_ready('6c8b0000-0000-4000-8000-000000000000'),
  'HK-S4-05: a bed beside one that is due is ready to be let: nothing about stayover blocks its check-in');

-- ---------------------------------------------------------------------------
-- The shape of the grants
-- ---------------------------------------------------------------------------

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema='public' and table_name='housekeeping_stayover_cleanings'
       and grantee='ranza_app' and privilege_type='INSERT'$$,
  array['accommodation_unit_id', 'property_id', 'organization_id'],
  'HK-S4-11: a press names the room; the date and who pressed are stamped');

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema='public' and table_name='housekeeping_stayover_cleanings'
       and grantee='ranza_app' and privilege_type='UPDATE'$$,
  array['undone_at'],
  'HK-S4-13: an update says that the press is taken back and nothing else');

select is_empty(
  $$select table_name::text from information_schema.table_privileges
     where table_schema='public'
       and table_name in ('housekeeping_stayover_cleanings', 'housekeeping_stayover_settings')
       and grantee='ranza_app' and privilege_type='DELETE'$$,
  'HK-S4-12: neither table can be deleted from: a press is undone and a schedule is cleared');

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema='public' and table_name='housekeeping_stayover_settings'
       and grantee='ranza_app' and privilege_type='INSERT'$$,
  array['property_id', 'organization_id', 'cadence', 'every_days', 'weekday'],
  'HK-S4-04: a schedule names its Property and its cadence');

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema='public' and table_name='housekeeping_stayover_settings'
       and grantee='ranza_app' and privilege_type='UPDATE'$$,
  array['cadence', 'every_days', 'weekday'],
  'HK-S4-04: an update changes the cadence and not whose it is');

-- ---------------------------------------------------------------------------
-- The schedule's gate (HK-S4-02 .. HK-S4-04)
-- ---------------------------------------------------------------------------

set local role ranza_app;

select app.set_request_context('62222222-2222-4222-8222-222222222222');

select throws_ok(
  $$ insert into public.housekeeping_stayover_settings
       (property_id, organization_id, cadence, weekday)
     values ('6b111111-1111-4111-8111-111111111111',
             '6a111111-1111-4111-8111-111111111111', 'weekly', 2) $$,
  '42501', null,
  'HK-S4-04: a front desk, who holds no accommodation.configure, cannot set the schedule');

select app.set_request_context('65555555-5555-4555-8555-555555555555');

select throws_ok(
  $$ insert into public.housekeeping_stayover_settings
       (property_id, organization_id, cadence, weekday)
     values ('6b111111-1111-4111-8111-111111111111',
             '6a111111-1111-4111-8111-111111111111', 'weekly', 2) $$,
  '42501', null,
  'HK-S4-04: a manager who does not reach the Property cannot set its schedule');

select app.set_request_context('64444444-4444-4444-8444-444444444444');

select throws_ok(
  $$ insert into public.housekeeping_stayover_settings
       (property_id, organization_id, cadence, weekday)
     values ('6b333333-3333-4333-8333-333333333333',
             '6a111111-1111-4111-8111-111111111111', 'weekly', 2) $$,
  '42501', null,
  'HK-S4-04: nor can a manager of another Organization');

select app.set_request_context('61111111-1111-4111-8111-111111111111');

select throws_ok(
  $$ insert into public.housekeeping_stayover_settings
       (property_id, organization_id, cadence, weekday)
     values ('6b222222-2222-4222-8222-222222222222',
             '6a111111-1111-4111-8111-111111111111', 'weekly', 2) $$,
  '42501', null,
  'HK-S4-04: nor at a Property that does not have housekeeping');

select lives_ok(
  $$ insert into public.housekeeping_stayover_settings
       (property_id, organization_id, cadence, weekday)
     values ('6b111111-1111-4111-8111-111111111111',
             '6a111111-1111-4111-8111-111111111111', 'weekly', 2) $$,
  'HK-S4-02: a manager sets a weekly schedule');

select throws_ok(
  $$ update public.housekeeping_stayover_settings
        set cadence = 'weekly', weekday = 9
      where property_id = '6b111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'HK-S4-03: a weekday that does not exist is refused by the table');

select throws_ok(
  $$ update public.housekeeping_stayover_settings
        set cadence = 'weekly', every_days = 3
      where property_id = '6b111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'HK-S4-03: a weekly schedule that also names an interval is refused');

select throws_ok(
  $$ update public.housekeeping_stayover_settings
        set cadence = 'every_n_days', every_days = 15, weekday = null
      where property_id = '6b111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'HK-S4-03: an interval beyond a fortnight is refused');

select lives_ok(
  $$ update public.housekeeping_stayover_settings
        set cadence = null, every_days = null, weekday = null
      where property_id = '6b111111-1111-4111-8111-111111111111' $$,
  'HK-S4-02: going back to the default clears the cadence');

select throws_ok(
  $$ update public.housekeeping_stayover_settings
        set organization_id = '6a222222-2222-4222-8222-222222222222'
      where property_id = '6b111111-1111-4111-8111-111111111111' $$,
  '42501', null,
  'HK-S4-04: a schedule cannot be moved to another Organization');

-- ---------------------------------------------------------------------------
-- Recording a clean (HK-S4-08 .. HK-S4-14)
-- ---------------------------------------------------------------------------

select app.set_request_context('63333333-3333-4333-8333-333333333333');

select throws_ok(
  $$ insert into public.housekeeping_stayover_cleanings
       (accommodation_unit_id, property_id, organization_id)
     values ('6c100000-0000-4000-8000-000000000000',
             '6b111111-1111-4111-8111-111111111111',
             '6a111111-1111-4111-8111-111111111111') $$,
  '42501', null,
  'HK-S4-08: a role without housekeeping.update_status cannot record a clean');

select app.set_request_context('64444444-4444-4444-8444-444444444444');

select throws_ok(
  $$ insert into public.housekeeping_stayover_cleanings
       (accommodation_unit_id, property_id, organization_id)
     values ('6c100000-0000-4000-8000-000000000000',
             '6b111111-1111-4111-8111-111111111111',
             '6a111111-1111-4111-8111-111111111111') $$,
  '42501', null,
  'HK-S4-08: nor can somebody of another Organization');

select app.set_request_context('61111111-1111-4111-8111-111111111111');

select throws_ok(
  $$ insert into public.housekeeping_stayover_cleanings
       (accommodation_unit_id, property_id, organization_id)
     values ('6cb00000-0000-4000-8000-000000000000',
             '6b222222-2222-4222-8222-222222222222',
             '6a111111-1111-4111-8111-111111111111') $$,
  '42501', null,
  'HK-S4-08: nor can it be recorded at a Property without housekeeping');

select throws_ok(
  $$ insert into public.housekeeping_stayover_cleanings
       (accommodation_unit_id, property_id, organization_id)
     values ('6c8a0000-0000-4000-8000-000000000000',
             '6b111111-1111-4111-8111-111111111111',
             '6a111111-1111-4111-8111-111111111111') $$,
  '42501', null,
  'HK-S4-09: a bed under a room is cleaned with its room and is refused on its own');

select throws_ok(
  $$ insert into public.housekeeping_stayover_cleanings
       (accommodation_unit_id, property_id, organization_id, cleaned_on)
     values ('6c100000-0000-4000-8000-000000000000',
             '6b111111-1111-4111-8111-111111111111',
             '6a111111-1111-4111-8111-111111111111', current_date + 30) $$,
  '42501', null,
  'HK-S4-11: a press cannot name its own date, which would postpone the next clean');

select app.set_request_context('62222222-2222-4222-8222-222222222222');

select lives_ok(
  $$ insert into public.housekeeping_stayover_cleanings
       (accommodation_unit_id, property_id, organization_id)
     values ('6c100000-0000-4000-8000-000000000000',
             '6b111111-1111-4111-8111-111111111111',
             '6a111111-1111-4111-8111-111111111111') $$,
  'HK-S4-08: a front desk records a clean, which is how it is told');

select results_eq(
  $$select cleaned_on, cleaned_by from public.housekeeping_stayover_cleanings
     where accommodation_unit_id = '6c100000-0000-4000-8000-000000000000'$$,
  $$select app.property_today('6b111111-1111-4111-8111-111111111111'),
         '62222222-2222-4222-8222-222222222222'::uuid$$,
  'HK-S4-11: the date is the Property''s business date and the actor is the one acting');

select results_eq(
  $$ with again as (
       insert into public.housekeeping_stayover_cleanings
         (accommodation_unit_id, property_id, organization_id)
       values ('6c100000-0000-4000-8000-000000000000',
               '6b111111-1111-4111-8111-111111111111',
               '6a111111-1111-4111-8111-111111111111')
       on conflict (accommodation_unit_id, cleaned_on)
         where undone_at is null do nothing
       returning 1)
     select count(*)::int from again $$,
  $$ values (0) $$,
  'HK-S4-10: pressing twice records once');

select ok(
  (select cleaning_id is not null and due_on > app.property_today('6b111111-1111-4111-8111-111111111111')
     from app.housekeeping_stayover_rooms(
       '6b111111-1111-4111-8111-111111111111', 'every_n_days', 1, null)
    where holder_id = '6c100000-0000-4000-8000-000000000000'),
  'HK-S4-05: the room cleaned today is listed as done, no longer due, so the press can be seen and undone');

select throws_ok(
  $$ update public.housekeeping_stayover_cleanings set cleaned_by = null $$,
  '42501', null,
  'HK-S4-11: who pressed cannot be rewritten');

-- A press from yesterday cannot be taken back today. Written as the owner of the
-- table with the stamping trigger off, because the trigger would date it today
-- and an update would read as an undo; the trigger is back before anyone else
-- acts.
set local role none;
alter table public.housekeeping_stayover_cleanings
  disable trigger housekeeping_stayover_cleanings_stamped;
insert into public.housekeeping_stayover_cleanings
  (accommodation_unit_id, property_id, organization_id, cleaned_on, cleaned_by)
values ('6c300000-0000-4000-8000-000000000000',
        '6b111111-1111-4111-8111-111111111111',
        '6a111111-1111-4111-8111-111111111111',
        app.property_today('6b111111-1111-4111-8111-111111111111') - 1,
        '62222222-2222-4222-8222-222222222222');
alter table public.housekeeping_stayover_cleanings
  enable trigger housekeeping_stayover_cleanings_stamped;
set local role ranza_app;
select app.set_request_context('62222222-2222-4222-8222-222222222222');

-- Whether the refusal is a silent zero rows (the USING clause hides the row) or
-- an error (the WITH CHECK clause refuses it) is not the claim, and the two
-- never diverge: both clauses carry the same gates, so deleting one leaves the
-- other binding. The claim is that the press is still there afterwards.
do $$
begin
  update public.housekeeping_stayover_cleanings set undone_at = now()
   where accommodation_unit_id = '6c300000-0000-4000-8000-000000000000';
exception when insufficient_privilege then
  null;
end
$$;

select is(
  (select undone_at from public.housekeeping_stayover_cleanings
    where accommodation_unit_id = '6c300000-0000-4000-8000-000000000000'),
  null,
  'HK-S4-14: only a press made today can be taken back');

select app.set_request_context('63333333-3333-4333-8333-333333333333');

do $$
begin
  update public.housekeeping_stayover_cleanings set undone_at = now()
   where accommodation_unit_id = '6c100000-0000-4000-8000-000000000000';
exception when insufficient_privilege then
  null;
end
$$;

select is(
  (select undone_at from public.housekeeping_stayover_cleanings
    where accommodation_unit_id = '6c100000-0000-4000-8000-000000000000'),
  null,
  'HK-S4-13: a role without housekeeping.update_status cannot take a press back');

select app.set_request_context('62222222-2222-4222-8222-222222222222');

select results_eq(
  $$ with taken as (
       update public.housekeeping_stayover_cleanings set undone_at = now()
        where accommodation_unit_id = '6c100000-0000-4000-8000-000000000000'
       returning undone_by)
     select count(*)::int from taken $$,
  $$ values (1) $$,
  'HK-S4-13: the front desk takes today''s press back');

select results_eq(
  $$select undone_by, undone_at is not null from public.housekeeping_stayover_cleanings
     where accommodation_unit_id = '6c100000-0000-4000-8000-000000000000'$$,
  $$select '62222222-2222-4222-8222-222222222222'::uuid, true$$,
  'HK-S4-13: the row stays, stamped with who took it back');

select is(
  (select count(*)::int from app.housekeeping_stayover_rooms(
     '6b111111-1111-4111-8111-111111111111', 'every_n_days', 1, null)
    where holder_id = '6c100000-0000-4000-8000-000000000000' and cleaning_id is null),
  1,
  'HK-S4-13: and the room is due again');

select lives_ok(
  $$ insert into public.housekeeping_stayover_cleanings
       (accommodation_unit_id, property_id, organization_id)
     values ('6c100000-0000-4000-8000-000000000000',
             '6b111111-1111-4111-8111-111111111111',
             '6a111111-1111-4111-8111-111111111111') $$,
  'HK-S4-13: after an undo the room can be cleaned again the same day');

select throws_ok(
  $$ delete from public.housekeeping_stayover_cleanings $$,
  '42501', null,
  'HK-S4-12: a press is never deleted');

select * from finish();
rollback;
