-- Which gender a room admits (RANZ-110, RB-S5-*, ADR 0057).
--
-- Three claims:
--
--   the values     a room admits female, male or anyone; a bed has no answer
--                  of its own; a Guest's gender is female, male or unrecorded.
--
--   the refusal    a booking or a Stay in a room that does not admit its Guest
--                  is refused, RZ005, whoever writes it — a Guest with no
--                  gender recorded included — and a bed answers as its room.
--
--   the change     re-gendering a room, or correcting a Guest's gender, is
--                  refused (RZ006) while it would leave somebody booked or in
--                  house in a room that no longer admits them; finished,
--                  cancelled and stale bookings hold nothing. Only
--                  app.set_room_admits changes a room's answer, and only for
--                  whoever may configure rooms.
--
-- Rows in docs/features/rooms-and-beds/edge-cases.csv are named beside the
-- assertion that proves them. Each break below was applied inside a rolled-back
-- transaction, the altered object printed first, and the named assertions seen
-- red:
--   app.room_admits returns true                 RB-S5-04, -05, -06, -07
--   reservations_room_admits_the_guest dropped   RB-S5-04, -05, -06, -07 amend
--   stays_room_admits_the_guest dropped          RB-S5-07 check-in, move
--   accommodation_units_keep_whom_they_admit
--     dropped                                    RB-S5-08
--   guests_keep_their_rooms dropped              RB-S5-10
--   set_room_admits without the permission check RB-S5-13 front desk
--   update (admits) granted to ranza_app         RB-S5-13 direct update
begin;
select plan(31);

insert into public.users (id, email) values
  ('f6111111-1111-4111-8111-111111111111', 'rg-manager@example.test'),
  ('f6222222-2222-4222-8222-222222222222', 'rg-desk@example.test'),
  ('f6333333-3333-4333-8333-333333333333', 'rg-outsider@example.test');

insert into public.organizations (id, name, status) values
  ('f6a11111-1111-4111-8111-111111111111', 'Gendered Organization', 'active'),
  ('f6a22222-2222-4222-8222-222222222222', 'Other Gendered Organization', 'active');

insert into public.properties (id, organization_id, name) values
  ('f6b11111-1111-4111-8111-111111111111',
   'f6a11111-1111-4111-8111-111111111111', 'Gendered Yurt');

insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('f6a11111-1111-4111-8111-111111111111',
   'f6111111-1111-4111-8111-111111111111', 'manager', 'organization_wide'),
  ('f6a11111-1111-4111-8111-111111111111',
   'f6222222-2222-4222-8222-222222222222', 'front_desk', 'organization_wide'),
  ('f6a22222-2222-4222-8222-222222222222',
   'f6333333-3333-4333-8333-333333333333', 'manager', 'organization_wide');

insert into public.subscriptions (organization_id, status) values
  ('f6a11111-1111-4111-8111-111111111111', 'active'),
  ('f6a22222-2222-4222-8222-222222222222', 'active');

insert into public.entitlements (organization_id, module_key) values
  ('f6a11111-1111-4111-8111-111111111111', 'front_office'),
  ('f6a22222-2222-4222-8222-222222222222', 'front_office');

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('f6b11111-1111-4111-8111-111111111111',
   'f6a11111-1111-4111-8111-111111111111', 'front_desk', true);

-- A women's room; a men's room let by the bed; a room for anyone; an empty
-- women's room to re-gender; a women's room whose only booking was
-- cancelled; a room for anyone whose only booking went stale.
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity, admits)
values
  ('f6c00000-0000-4000-8000-000000000001', 'f6b11111-1111-4111-8111-111111111111',
   'f6a11111-1111-4111-8111-111111111111', 'W-101', 'room', 2, 'female'),
  ('f6c00000-0000-4000-8000-000000000002', 'f6b11111-1111-4111-8111-111111111111',
   'f6a11111-1111-4111-8111-111111111111', 'M-201', 'room', 2, 'male'),
  ('f6c00000-0000-4000-8000-000000000003', 'f6b11111-1111-4111-8111-111111111111',
   'f6a11111-1111-4111-8111-111111111111', 'A-301', 'room', 2, null),
  ('f6c00000-0000-4000-8000-000000000004', 'f6b11111-1111-4111-8111-111111111111',
   'f6a11111-1111-4111-8111-111111111111', 'W-102', 'room', 2, 'female'),
  ('f6c00000-0000-4000-8000-000000000005', 'f6b11111-1111-4111-8111-111111111111',
   'f6a11111-1111-4111-8111-111111111111', 'W-103', 'room', 2, 'female'),
  ('f6c00000-0000-4000-8000-000000000006', 'f6b11111-1111-4111-8111-111111111111',
   'f6a11111-1111-4111-8111-111111111111', 'A-302', 'room', 2, null);

insert into public.accommodation_units
  (id, property_id, organization_id, parent_id, parent_unit_type, name,
   unit_type, capacity)
values
  ('f6c00000-0000-4000-8000-000000000021', 'f6b11111-1111-4111-8111-111111111111',
   'f6a11111-1111-4111-8111-111111111111', 'f6c00000-0000-4000-8000-000000000002',
   'room', 'A', 'bed', 1),
  ('f6c00000-0000-4000-8000-000000000022', 'f6b11111-1111-4111-8111-111111111111',
   'f6a11111-1111-4111-8111-111111111111', 'f6c00000-0000-4000-8000-000000000002',
   'room', 'B', 'bed', 1);

insert into public.guests (id, organization_id, full_name, gender) values
  ('f6d00000-0000-4000-8000-000000000001',
   'f6a11111-1111-4111-8111-111111111111', 'Ayşe Kaya', 'female'),
  ('f6d00000-0000-4000-8000-000000000002',
   'f6a11111-1111-4111-8111-111111111111', 'Mehmet Demir', 'male'),
  ('f6d00000-0000-4000-8000-000000000003',
   'f6a11111-1111-4111-8111-111111111111', 'Deniz Unrecorded', null),
  ('f6d00000-0000-4000-8000-000000000004',
   'f6a11111-1111-4111-8111-111111111111', 'Elif Yıldız', 'female');

-- Every booking below is a Resident's, open-ended from the Property's own
-- today, unless it says otherwise.
create temporary table today as
  select app.property_today('f6b11111-1111-4111-8111-111111111111') as day;

-- ---------------------------------------------------------------------------
-- The values
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ update public.accommodation_units set admits = 'mixed'
      where id = 'f6c00000-0000-4000-8000-000000000003' $$,
  '23514', null, 'RB-S5-01: a room admits female, male or anyone, nothing else');

select throws_ok(
  $$ update public.accommodation_units set admits = 'female'
      where id = 'f6c00000-0000-4000-8000-000000000021' $$,
  '23514', null, 'RB-S5-01: a bed has no answer of its own; it is its room''s');

select throws_ok(
  $$ update public.guests set gender = 'unknown'
      where id = 'f6d00000-0000-4000-8000-000000000003' $$,
  '23514', null, 'RB-S5-01: a Guest''s gender is female, male or not recorded');

-- ---------------------------------------------------------------------------
-- The refusal
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ insert into public.reservations
       (id, organization_id, property_id, accommodation_unit_id, guest_id,
        stay_type, status, starts_on, ends_on)
     select 'f6e00000-0000-4000-8000-000000000001',
            'f6a11111-1111-4111-8111-111111111111',
            'f6b11111-1111-4111-8111-111111111111',
            'f6c00000-0000-4000-8000-000000000003',
            'f6d00000-0000-4000-8000-000000000003',
            'resident', 'confirmed', day, null
       from today $$,
  'RB-S5-02: a room for anyone admits a Guest whose gender nobody recorded');

select lives_ok(
  $$ insert into public.reservations
       (id, organization_id, property_id, accommodation_unit_id, guest_id,
        stay_type, status, starts_on, ends_on)
     select 'f6e00000-0000-4000-8000-000000000002',
            'f6a11111-1111-4111-8111-111111111111',
            'f6b11111-1111-4111-8111-111111111111',
            'f6c00000-0000-4000-8000-000000000001',
            'f6d00000-0000-4000-8000-000000000001',
            'resident', 'confirmed', day, null
       from today $$,
  'RB-S5-03: a women''s room admits a woman');

select throws_ok(
  $$ insert into public.reservations
       (organization_id, property_id, accommodation_unit_id, guest_id,
        stay_type, status, starts_on, ends_on)
     select 'f6a11111-1111-4111-8111-111111111111',
            'f6b11111-1111-4111-8111-111111111111',
            'f6c00000-0000-4000-8000-000000000004',
            'f6d00000-0000-4000-8000-000000000002',
            'resident', 'confirmed', day, null
       from today $$,
  'RZ005', null, 'RB-S5-04: a women''s room refuses a man');

select throws_ok(
  $$ insert into public.reservations
       (organization_id, property_id, accommodation_unit_id, guest_id,
        stay_type, status, starts_on, ends_on)
     select 'f6a11111-1111-4111-8111-111111111111',
            'f6b11111-1111-4111-8111-111111111111',
            'f6c00000-0000-4000-8000-000000000004',
            'f6d00000-0000-4000-8000-000000000002',
            'resident', 'requested', day, null
       from today $$,
  'RZ005', null, 'RB-S5-04: and refuses him as a request, before anybody confirms it');

select throws_ok(
  $$ insert into public.reservations
       (organization_id, property_id, accommodation_unit_id, guest_id,
        stay_type, status, starts_on, ends_on)
     select 'f6a11111-1111-4111-8111-111111111111',
            'f6b11111-1111-4111-8111-111111111111',
            'f6c00000-0000-4000-8000-000000000004',
            'f6d00000-0000-4000-8000-000000000003',
            'resident', 'confirmed', day, null
       from today $$,
  'RZ005', null, 'RB-S5-05: a gendered room refuses a Guest whose gender is not recorded');

select throws_ok(
  $$ insert into public.reservations
       (organization_id, property_id, accommodation_unit_id, guest_id,
        stay_type, status, starts_on, ends_on)
     select 'f6a11111-1111-4111-8111-111111111111',
            'f6b11111-1111-4111-8111-111111111111',
            'f6c00000-0000-4000-8000-000000000021',
            'f6d00000-0000-4000-8000-000000000004',
            'resident', 'confirmed', day, null
       from today $$,
  'RZ005', null, 'RB-S5-06: a bed in a men''s room refuses a woman, as its room would');

select lives_ok(
  $$ insert into public.reservations
       (id, organization_id, property_id, accommodation_unit_id, guest_id,
        stay_type, status, starts_on, ends_on)
     select 'f6e00000-0000-4000-8000-000000000003',
            'f6a11111-1111-4111-8111-111111111111',
            'f6b11111-1111-4111-8111-111111111111',
            'f6c00000-0000-4000-8000-000000000021',
            'f6d00000-0000-4000-8000-000000000002',
            'resident', 'confirmed', day, null
       from today $$,
  'RB-S5-06: and admits a man');

-- Elif, booked into a room for anyone next month, and then moved.
insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id,
   stay_type, status, starts_on, ends_on)
select 'f6e00000-0000-4000-8000-000000000004',
       'f6a11111-1111-4111-8111-111111111111',
       'f6b11111-1111-4111-8111-111111111111',
       'f6c00000-0000-4000-8000-000000000006',
       'f6d00000-0000-4000-8000-000000000004',
       'resident', 'confirmed', day + 30, day + 33
  from today;

select throws_ok(
  $$ update public.reservations
        set accommodation_unit_id = 'f6c00000-0000-4000-8000-000000000022'
      where id = 'f6e00000-0000-4000-8000-000000000004' $$,
  'RZ005', null, 'RB-S5-07 amend: a booking moved to a bed in a men''s room is refused for a woman');

select throws_ok(
  $$ update public.reservations
        set guest_id = 'f6d00000-0000-4000-8000-000000000002'
      where id = 'f6e00000-0000-4000-8000-000000000002' $$,
  'RZ005', null, 'RB-S5-07 amend: a booking handed to a man is refused in a women''s room');

select throws_ok(
  $$ insert into public.stays
       (organization_id, property_id, accommodation_unit_id, reservation_id,
        stay_type, status, starts_on, ends_on)
     select 'f6a11111-1111-4111-8111-111111111111',
            'f6b11111-1111-4111-8111-111111111111',
            'f6c00000-0000-4000-8000-000000000004',
            'f6e00000-0000-4000-8000-000000000001',
            'resident', 'in_house', day, null
       from today $$,
  'RZ005', null, 'RB-S5-07 check-in: a Stay is refused in a room that does not admit its booking''s Guest');

-- Ayşe checks in to her women's room, and is then moved.
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, reservation_id,
   stay_type, status, starts_on, ends_on)
select 'f6f00000-0000-4000-8000-000000000001',
       'f6a11111-1111-4111-8111-111111111111',
       'f6b11111-1111-4111-8111-111111111111',
       'f6c00000-0000-4000-8000-000000000001',
       'f6e00000-0000-4000-8000-000000000002',
       'resident', 'in_house', day, null
  from today;
update public.reservations set status = 'checked_in'
 where id = 'f6e00000-0000-4000-8000-000000000002';

select throws_ok(
  $$ update public.stays
        set accommodation_unit_id = 'f6c00000-0000-4000-8000-000000000022'
      where id = 'f6f00000-0000-4000-8000-000000000001' $$,
  'RZ005', null, 'RB-S5-07 move: a woman in house is refused a move to a bed in a men''s room');

select lives_ok(
  $$ update public.stays
        set accommodation_unit_id = 'f6c00000-0000-4000-8000-000000000004'
      where id = 'f6f00000-0000-4000-8000-000000000001' $$,
  'RB-S5-07 move: and moved to another women''s room');

-- Her booking follows her, as app.move_stay moves both.
update public.reservations
   set accommodation_unit_id = 'f6c00000-0000-4000-8000-000000000004'
 where id = 'f6e00000-0000-4000-8000-000000000002';

-- ---------------------------------------------------------------------------
-- The change
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ update public.accommodation_units set admits = 'male'
      where id = 'f6c00000-0000-4000-8000-000000000004' $$,
  'RZ006', null, 'RB-S5-08: a room with a woman in house cannot be made a men''s room');

select throws_ok(
  $$ update public.accommodation_units set admits = 'female'
      where id = 'f6c00000-0000-4000-8000-000000000002' $$,
  'RZ006', null, 'RB-S5-08: nor a room with a man booked into one of its beds a women''s room');

select lives_ok(
  $$ update public.accommodation_units set admits = 'male'
      where id = 'f6c00000-0000-4000-8000-000000000001' $$,
  'RB-S5-09: a room emptied by a move is re-gendered freely');

select lives_ok(
  $$ update public.accommodation_units set admits = null
      where id = 'f6c00000-0000-4000-8000-000000000004' $$,
  'RB-S5-09: and a room somebody is in may always be opened to anyone');

update public.accommodation_units set admits = 'female'
 where id = 'f6c00000-0000-4000-8000-000000000004';

select throws_ok(
  $$ update public.guests set gender = 'male'
      where id = 'f6d00000-0000-4000-8000-000000000001' $$,
  'RZ006', null, 'RB-S5-10: a woman in house in a women''s room is not recorded as a man');

select throws_ok(
  $$ update public.guests set gender = null
      where id = 'f6d00000-0000-4000-8000-000000000001' $$,
  'RZ006', null, 'RB-S5-10: nor is her gender cleared, which the room would then refuse');

-- Elif's booking in W-103 is cancelled, and Mehmet's in A-302 is a Guest who
-- never came: its departure passed with nobody marking it.
insert into public.reservations
  (organization_id, property_id, accommodation_unit_id, guest_id,
   stay_type, status, starts_on, ends_on)
select 'f6a11111-1111-4111-8111-111111111111',
       'f6b11111-1111-4111-8111-111111111111',
       'f6c00000-0000-4000-8000-000000000005',
       'f6d00000-0000-4000-8000-000000000004',
       'guest', 'confirmed', day + 40, day + 42
  from today;
update public.reservations set status = 'cancelled'
 where accommodation_unit_id = 'f6c00000-0000-4000-8000-000000000005';
insert into public.reservations
  (organization_id, property_id, accommodation_unit_id, guest_id,
   stay_type, status, starts_on, ends_on)
select 'f6a11111-1111-4111-8111-111111111111',
       'f6b11111-1111-4111-8111-111111111111',
       'f6c00000-0000-4000-8000-000000000006',
       'f6d00000-0000-4000-8000-000000000002',
       'guest', 'confirmed', day - 10, day - 5
  from today;

select lives_ok(
  $$ update public.accommodation_units set admits = 'male'
      where id = 'f6c00000-0000-4000-8000-000000000005' $$,
  'RB-S5-11: a cancelled booking holds nothing against a re-gender');

select lives_ok(
  $$ update public.accommodation_units set admits = 'female'
      where id = 'f6c00000-0000-4000-8000-000000000006' $$,
  'RB-S5-11: nor does a booking whose departure passed with nobody arriving, beside a woman''s still to come');

select lives_ok(
  $$ update public.guests set gender = 'female'
      where id = 'f6d00000-0000-4000-8000-000000000003' $$,
  'RB-S5-12: recording a gender where none was is free while the room admits anyone');

-- ---------------------------------------------------------------------------
-- Who may change it
-- ---------------------------------------------------------------------------

select ok(
  not exists (
    select from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'accommodation_units'
       and column_name = 'admits'
       and grantee = 'ranza_app' and privilege_type = 'UPDATE'),
  'RB-S5-13: no grant changes a room''s gender; the maintenance policy would share it');

select ok(
  (select proacl::text from pg_catalog.pg_proc
    where oid = 'app.room_admits(uuid, uuid)'::regprocedure) !~ '(^|,)=X',
  'RB-S5-13: the question the triggers ask is nobody''s to call');

-- Last, because these are the statements that raise when a grant is missing,
-- and a raise aborts every assertion after it.
set local role ranza_app;

select app.set_request_context('f6222222-2222-4222-8222-222222222222');
select throws_ok(
  $$ select * from app.set_room_admits('f6c00000-0000-4000-8000-000000000005', 'female') $$,
  '42501', null, 'RB-S5-13: a front desk, without accommodation.configure, re-genders no room');

select app.set_request_context('f6333333-3333-4333-8333-333333333333');
select throws_ok(
  $$ select * from app.set_room_admits('f6c00000-0000-4000-8000-000000000005', 'female') $$,
  '42501', null, 'RB-S5-13: nor does a manager of another Organization');

select app.set_request_context('f6111111-1111-4111-8111-111111111111');
select results_eq(
  $$ select previous_admits from app.set_room_admits('f6c00000-0000-4000-8000-000000000005', 'female') $$,
  $$ values ('male'::text) $$,
  'RB-S5-13: a manager who may configure rooms re-genders one, and is told what it was');

select throws_ok(
  $$ select * from app.set_room_admits('f6c00000-0000-4000-8000-000000000021', 'male') $$,
  '42501', null, 'RB-S5-13: a bed is not given an answer of its own, by anybody');

select throws_ok(
  $$ update public.accommodation_units set admits = 'male'
      where id = 'f6c00000-0000-4000-8000-000000000005' $$,
  '42501', null, 'RB-S5-13: and not by updating the column, which nobody may');

set local role none;

select * from finish();
rollback;
