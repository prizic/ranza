-- A bed's price follows its room (RANZ-111, ADR 0038 amended, docs/features/rates).
--
-- Three claims, which fail in different ways:
--
--   the shape     a price for a bed may name the size of its room; no other
--                 kind may, and a size is named when the price is written and
--                 never changed.
--
--   the choice    a bed takes the price for its room's size when that size has
--                 an amount, and the price for any room otherwise. A cleared
--                 size is passed over. A stale one prices nothing and hands
--                 its beds to nobody. Hotel prices are the kind's alone.
--
--   the moment    the price is stamped when the booking is taken, and again
--                 only when a booking still to come is moved to another class
--                 of price.
--
-- Rows in docs/features/rates/edge-cases.csv are named beside the assertion
-- that proves them. Each break below was applied inside a rolled-back
-- transaction, the altered object printed first, and the named assertion seen
-- red:
--   rate_for_unit ignores the size                  RT-S4-01, RT-S4-12, RT-S4-08
--   rate_for_unit prefers the general row           RT-S4-01, RT-S4-12
--   rate_for_unit keeps a cleared size              RT-S4-05 (the suite stops
--                                                   on reservations_price_is_a_pair,
--                                                   which is a second line of defence)
--   rate_for_unit hands a stale size to the         RT-S4-10
--     general row
--   rate_for_unit ignores the kind                  RT-S4-06, RT-S4-05
--   rate_for_unit ignores the Property named        RT-S4-12
--   room_capacity check dropped                     RT-S4-03, RT-S4-06
--   sized unique index dropped                      RT-S4-02
--   general unique index dropped                    RT-S4-02
--   update (room_capacity) granted                  RT-S4-11
--   insert (room_capacity) revoked                  RT-S4-11, RT-S4-01
--   insert policy without rates.manage, and by any  RT-S4-11 (front desk)
--     member
--   read policy open to every row                   RT-S4-11 (not read)
--   the stamp trigger dropped                       RT-S4-01, RT-S4-04, RT-S4-06
--   the move compares kinds only                    RT-S4-08, RT-S4-09
--   the move without the rates.manage check         RT-S4-09
--   the move never re-prices                        RT-S4-08, RT-S4-09
begin;
select plan(33);

insert into public.users (id, email) values
  ('f7111111-1111-4111-8111-111111111111', 'bp-manager@example.test'),
  ('f7222222-2222-4222-8222-222222222222', 'bp-desk@example.test'),
  ('f7333333-3333-4333-8333-333333333333', 'bp-outsider@example.test');

insert into public.organizations (id, name, status) values
  ('f7a11111-1111-4111-8111-111111111111', 'Sized Organization', 'active'),
  ('f7a22222-2222-4222-8222-222222222222', 'Other Sized Organization', 'active');

insert into public.properties (id, organization_id, name, currency) values
  ('f7b11111-1111-4111-8111-111111111111',
   'f7a11111-1111-4111-8111-111111111111', 'Sized Yurt', 'TRY'),
  ('f7b22222-2222-4222-8222-222222222222',
   'f7a11111-1111-4111-8111-111111111111', 'Stale Yurt', 'TRY'),
  ('f7b33333-3333-4333-8333-333333333333',
   'f7a22222-2222-4222-8222-222222222222', 'Other Yurt', 'TRY');

insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('f7a11111-1111-4111-8111-111111111111',
   'f7111111-1111-4111-8111-111111111111', 'manager', 'organization_wide'),
  ('f7a11111-1111-4111-8111-111111111111',
   'f7222222-2222-4222-8222-222222222222', 'front_desk', 'organization_wide'),
  ('f7a22222-2222-4222-8222-222222222222',
   'f7333333-3333-4333-8333-333333333333', 'manager', 'organization_wide');

insert into public.subscriptions (organization_id, status) values
  ('f7a11111-1111-4111-8111-111111111111', 'active'),
  ('f7a22222-2222-4222-8222-222222222222', 'active');

insert into public.entitlements (organization_id, module_key) values
  ('f7a11111-1111-4111-8111-111111111111', 'platform_core'),
  ('f7a11111-1111-4111-8111-111111111111', 'front_office'),
  ('f7a22222-2222-4222-8222-222222222222', 'platform_core'),
  ('f7a22222-2222-4222-8222-222222222222', 'front_office');

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('f7b11111-1111-4111-8111-111111111111',
   'f7a11111-1111-4111-8111-111111111111', 'configuration', true),
  ('f7b11111-1111-4111-8111-111111111111',
   'f7a11111-1111-4111-8111-111111111111', 'front_desk', true),
  ('f7b22222-2222-4222-8222-222222222222',
   'f7a11111-1111-4111-8111-111111111111', 'configuration', true),
  ('f7b22222-2222-4222-8222-222222222222',
   'f7a11111-1111-4111-8111-111111111111', 'front_desk', true),
  ('f7b33333-3333-4333-8333-333333333333',
   'f7a22222-2222-4222-8222-222222222222', 'configuration', true),
  ('f7b33333-3333-4333-8333-333333333333',
   'f7a22222-2222-4222-8222-222222222222', 'front_desk', true);

-- A yurt: a single, two rooms of four, a room of three, a bed with no room,
-- and the three kinds a hotel sells. The stale yurt has a room of four.
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity) values
  ('f7c00000-0000-4000-8000-000000000001', 'f7b11111-1111-4111-8111-111111111111',
   'f7a11111-1111-4111-8111-111111111111', 'Y-101', 'room', 1),
  ('f7c00000-0000-4000-8000-000000000002', 'f7b11111-1111-4111-8111-111111111111',
   'f7a11111-1111-4111-8111-111111111111', 'Y-201', 'room', 4),
  ('f7c00000-0000-4000-8000-000000000003', 'f7b11111-1111-4111-8111-111111111111',
   'f7a11111-1111-4111-8111-111111111111', 'Y-202', 'room', 4),
  ('f7c00000-0000-4000-8000-000000000004', 'f7b11111-1111-4111-8111-111111111111',
   'f7a11111-1111-4111-8111-111111111111', 'Y-301', 'room', 3),
  ('f7c00000-0000-4000-8000-000000000005', 'f7b11111-1111-4111-8111-111111111111',
   'f7a11111-1111-4111-8111-111111111111', 'Y-STANDALONE', 'bed', 1),
  ('f7c00000-0000-4000-8000-000000000006', 'f7b11111-1111-4111-8111-111111111111',
   'f7a11111-1111-4111-8111-111111111111', 'H-1', 'room', 2),
  ('f7c00000-0000-4000-8000-000000000007', 'f7b11111-1111-4111-8111-111111111111',
   'f7a11111-1111-4111-8111-111111111111', 'AP-1', 'apartment', 4),
  ('f7c00000-0000-4000-8000-000000000008', 'f7b11111-1111-4111-8111-111111111111',
   'f7a11111-1111-4111-8111-111111111111', 'SU-1', 'suite', 2),
  ('f7c00000-0000-4000-8000-000000000009', 'f7b22222-2222-4222-8222-222222222222',
   'f7a11111-1111-4111-8111-111111111111', 'S-201', 'room', 4),
  ('f7c00000-0000-4000-8000-000000000010', 'f7b33333-3333-4333-8333-333333333333',
   'f7a22222-2222-4222-8222-222222222222', 'O-201', 'room', 4);

insert into public.accommodation_units
  (id, property_id, organization_id, parent_id, parent_unit_type, name,
   unit_type, capacity)
select ids.bed, room.property_id, room.organization_id, room.id, 'room',
       ids.letter, 'bed', 1
  from (values
    ('f7c00000-0000-4000-8000-000000000101'::uuid, 'f7c00000-0000-4000-8000-000000000001'::uuid, 'A'),
    ('f7c00000-0000-4000-8000-000000000102', 'f7c00000-0000-4000-8000-000000000002', 'A'),
    ('f7c00000-0000-4000-8000-000000000103', 'f7c00000-0000-4000-8000-000000000002', 'B'),
    ('f7c00000-0000-4000-8000-000000000104', 'f7c00000-0000-4000-8000-000000000003', 'A'),
    ('f7c00000-0000-4000-8000-000000000105', 'f7c00000-0000-4000-8000-000000000003', 'B'),
    ('f7c00000-0000-4000-8000-000000000106', 'f7c00000-0000-4000-8000-000000000004', 'A'),
    ('f7c00000-0000-4000-8000-000000000107', 'f7c00000-0000-4000-8000-000000000009', 'A'),
    ('f7c00000-0000-4000-8000-000000000108', 'f7c00000-0000-4000-8000-000000000010', 'A')
  ) as ids (bed, room, letter)
  join public.accommodation_units as room on room.id = ids.room;

insert into public.guests (id, organization_id, full_name) values
  ('f7d00000-0000-4000-8000-000000000001',
   'f7a11111-1111-4111-8111-111111111111', 'Sized Guest');

select app.property_today('f7b11111-1111-4111-8111-111111111111') as today \gset

-- ---------------------------------------------------------------------------
-- The shape
-- ---------------------------------------------------------------------------

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'property_rates'
       and grantee = 'ranza_app' and privilege_type = 'INSERT'$$,
  array['organization_id', 'property_id', 'unit_type', 'room_capacity',
        'amount_minor'],
  'RT-S4-11: a size is named when the price is written, with the type and the amount');

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'property_rates'
       and grantee = 'ranza_app' and privilege_type = 'UPDATE'$$,
  array['amount_minor'],
  'RT-S4-11: and never changed afterwards; only the amount is');

set local role ranza_app;
select app.set_request_context('f7111111-1111-4111-8111-111111111111');

select lives_ok(
  $$ insert into public.property_rates
       (organization_id, property_id, unit_type, room_capacity, amount_minor)
     values
       ('f7a11111-1111-4111-8111-111111111111',
        'f7b11111-1111-4111-8111-111111111111', 'bed', null, 3000),
       ('f7a11111-1111-4111-8111-111111111111',
        'f7b11111-1111-4111-8111-111111111111', 'bed', 1, 9000),
       ('f7a11111-1111-4111-8111-111111111111',
        'f7b11111-1111-4111-8111-111111111111', 'bed', 4, 4000),
       ('f7a11111-1111-4111-8111-111111111111',
        'f7b11111-1111-4111-8111-111111111111', 'room', null, 15000),
       ('f7a11111-1111-4111-8111-111111111111',
        'f7b11111-1111-4111-8111-111111111111', 'apartment', null, 20000),
       ('f7a11111-1111-4111-8111-111111111111',
        'f7b11111-1111-4111-8111-111111111111', 'suite', null, 30000) $$,
  'RT-S4-01: a Manager prices beds in any room, in a room of one and in a room of four');

select throws_ok(
  $$ insert into public.property_rates
       (organization_id, property_id, unit_type, room_capacity, amount_minor)
     values ('f7a11111-1111-4111-8111-111111111111',
             'f7b11111-1111-4111-8111-111111111111', 'bed', 4, 4100) $$,
  '23505', null, 'RT-S4-02: one price per size at a Property');

select throws_ok(
  $$ insert into public.property_rates
       (organization_id, property_id, unit_type, room_capacity, amount_minor)
     values ('f7a11111-1111-4111-8111-111111111111',
             'f7b11111-1111-4111-8111-111111111111', 'bed', null, 3100) $$,
  '23505', null, 'RT-S4-02: and one general price, which a size beside it does not make two');

select throws_ok(
  $$ insert into public.property_rates
       (organization_id, property_id, unit_type, room_capacity, amount_minor)
     values ('f7a11111-1111-4111-8111-111111111111',
             'f7b22222-2222-4222-8222-222222222222', 'room', 2, 15000) $$,
  '23514', null, 'RT-S4-03: only a bed is priced by its room''s size; a room is not');

select throws_ok(
  $$ insert into public.property_rates
       (organization_id, property_id, unit_type, room_capacity, amount_minor)
     values ('f7a11111-1111-4111-8111-111111111111',
             'f7b22222-2222-4222-8222-222222222222', 'suite', 2, 15000) $$,
  '23514', null, 'RT-S4-03: nor is a suite');

select throws_ok(
  $$ insert into public.property_rates
       (organization_id, property_id, unit_type, room_capacity, amount_minor)
     values ('f7a11111-1111-4111-8111-111111111111',
             'f7b22222-2222-4222-8222-222222222222', 'bed', 0, 3000) $$,
  '23514', null, 'RT-S4-03: a room of no beds is no size');

select throws_ok(
  $$ insert into public.property_rates
       (organization_id, property_id, unit_type, room_capacity, amount_minor)
     values ('f7a11111-1111-4111-8111-111111111111',
             'f7b22222-2222-4222-8222-222222222222', 'bed', 65, 3000) $$,
  '23514', null, 'RT-S4-03: nor is one past the most a Unit sleeps');

select throws_ok(
  $$ update public.property_rates set room_capacity = 2
      where property_id = 'f7b11111-1111-4111-8111-111111111111'
        and unit_type = 'bed' and room_capacity = 4 $$,
  '42501', null, 'RT-S4-11: a price is not moved to another size; one is cleared and the other set');

-- A front desk reaches the Property and holds no rates.manage.
select app.set_request_context('f7222222-2222-4222-8222-222222222222');

select throws_ok(
  $$ insert into public.property_rates
       (organization_id, property_id, unit_type, room_capacity, amount_minor)
     values ('f7a11111-1111-4111-8111-111111111111',
             'f7b11111-1111-4111-8111-111111111111', 'bed', 3, 3500) $$,
  '42501', null, 'RT-S4-11: the front desk does not price a size');

select app.set_request_context('f7333333-3333-4333-8333-333333333333');

select throws_ok(
  $$ insert into public.property_rates
       (organization_id, property_id, unit_type, room_capacity, amount_minor)
     values ('f7a11111-1111-4111-8111-111111111111',
             'f7b11111-1111-4111-8111-111111111111', 'bed', 3, 3500) $$,
  '42501', null, 'RT-S4-11: nor does a Manager of another Organization');

select is(
  (select count(*)::int from public.property_rates
    where property_id = 'f7b11111-1111-4111-8111-111111111111'),
  0, 'RT-S4-11: nor read this Property''s prices');

select is(
  (select count(*)::int from app.rate_for_unit(
     'f7c00000-0000-4000-8000-000000000102',
     'f7b11111-1111-4111-8111-111111111111')),
  0, 'RT-S4-12: and a Unit in a Property out of reach answers nothing');

select is(
  (select count(*)::int from app.rate_for_unit(
     'f7c00000-0000-4000-8000-000000000108',
     'f7b11111-1111-4111-8111-111111111111')),
  0, 'RT-S4-12: nor does a Unit asked about under another Property''s name');

-- ---------------------------------------------------------------------------
-- The choice
-- ---------------------------------------------------------------------------

select app.set_request_context('f7111111-1111-4111-8111-111111111111');

select results_eq(
  format($$ with booked as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       values
         ('f7a11111-1111-4111-8111-111111111111',
          'f7b11111-1111-4111-8111-111111111111',
          'f7c00000-0000-4000-8000-000000000101',
          'f7d00000-0000-4000-8000-000000000001',
          'guest', 'confirmed', %L::date + 1, %L::date + 3),
         ('f7a11111-1111-4111-8111-111111111111',
          'f7b11111-1111-4111-8111-111111111111',
          'f7c00000-0000-4000-8000-000000000102',
          'f7d00000-0000-4000-8000-000000000001',
          'guest', 'confirmed', %L::date + 1, %L::date + 3)
       returning accommodation_unit_id, nightly_rate_minor, rate_currency::text)
     select nightly_rate_minor, rate_currency from booked
      order by accommodation_unit_id $$, :'today', :'today', :'today', :'today'),
  $$ values (9000::bigint, 'TRY'), (4000::bigint, 'TRY') $$,
  'RT-S4-01: a booking in a single and one in a four-bed room are priced differently');

select results_eq(
  $$ select class, amount, currency from
       (select rate_class as class, amount_minor as amount, currency
          from app.rate_for_unit('f7c00000-0000-4000-8000-000000000102',
                                 'f7b11111-1111-4111-8111-111111111111')) as asked $$,
  $$ values ('bed:4', 4000::bigint, 'TRY') $$,
  'RT-S4-12: the quote is asked the same way as the stamp, and names the class');

select results_eq(
  format($$ with booked as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       values
         ('f7a11111-1111-4111-8111-111111111111',
          'f7b11111-1111-4111-8111-111111111111',
          'f7c00000-0000-4000-8000-000000000106',
          'f7d00000-0000-4000-8000-000000000001',
          'guest', 'confirmed', %L::date + 1, %L::date + 3),
         ('f7a11111-1111-4111-8111-111111111111',
          'f7b11111-1111-4111-8111-111111111111',
          'f7c00000-0000-4000-8000-000000000005',
          'f7d00000-0000-4000-8000-000000000001',
          'guest', 'confirmed', %L::date + 1, %L::date + 3)
       returning nightly_rate_minor)
     select nightly_rate_minor from booked $$, :'today', :'today', :'today', :'today'),
  $$ values (3000::bigint), (3000::bigint) $$,
  'RT-S4-04: a size with no price of its own takes the general bed price, and so does a bed with no room');

select results_eq(
  format($$ with booked as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       values
         ('f7a11111-1111-4111-8111-111111111111',
          'f7b11111-1111-4111-8111-111111111111',
          'f7c00000-0000-4000-8000-000000000006',
          'f7d00000-0000-4000-8000-000000000001',
          'guest', 'confirmed', %L::date + 1, %L::date + 3),
         ('f7a11111-1111-4111-8111-111111111111',
          'f7b11111-1111-4111-8111-111111111111',
          'f7c00000-0000-4000-8000-000000000007',
          'f7d00000-0000-4000-8000-000000000001',
          'guest', 'confirmed', %L::date + 1, %L::date + 3),
         ('f7a11111-1111-4111-8111-111111111111',
          'f7b11111-1111-4111-8111-111111111111',
          'f7c00000-0000-4000-8000-000000000008',
          'f7d00000-0000-4000-8000-000000000001',
          'guest', 'confirmed', %L::date + 1, %L::date + 3)
       returning accommodation_unit_id, nightly_rate_minor)
     select nightly_rate_minor from booked order by accommodation_unit_id $$,
     :'today', :'today', :'today', :'today', :'today', :'today'),
  $$ values (15000::bigint), (20000::bigint), (30000::bigint) $$,
  'RT-S4-06: a room, an apartment and a suite keep their own kind''s price whatever sizes beds have');

select is(
  (select count(*)::int from public.property_rates
    where unit_type <> 'bed' and room_capacity is not null),
  0, 'RT-S4-06: and no price of any other kind than a bed carries a size');

-- The size moves; the bookings do not.
update public.property_rates set amount_minor = 4500
 where property_id = 'f7b11111-1111-4111-8111-111111111111'
   and unit_type = 'bed' and room_capacity = 4;

select is(
  (select nightly_rate_minor from public.reservations
    where accommodation_unit_id = 'f7c00000-0000-4000-8000-000000000102'),
  4000::bigint, 'RT-S4-07: a price set later reaches nobody already booked');

select lives_ok(
  $$ insert into public.property_rates
       (organization_id, property_id, unit_type, room_capacity, amount_minor)
     values ('f7a11111-1111-4111-8111-111111111111',
             'f7b11111-1111-4111-8111-111111111111', 'bed', 3, 6000) $$,
  'RT-S4-07: a size nobody had priced is priced');

select results_eq(
  $$ select nightly_rate_minor from public.reservations
      where accommodation_unit_id = 'f7c00000-0000-4000-8000-000000000106' $$,
  $$ values (3000::bigint) $$,
  'RT-S4-07: and the booking taken a moment before it keeps the general price it was quoted');

-- A cleared size is passed over.
update public.property_rates set amount_minor = null
 where property_id = 'f7b11111-1111-4111-8111-111111111111'
   and unit_type = 'bed' and room_capacity = 4;

select results_eq(
  format($$ with booked as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       values ('f7a11111-1111-4111-8111-111111111111',
               'f7b11111-1111-4111-8111-111111111111',
               'f7c00000-0000-4000-8000-000000000103',
               'f7d00000-0000-4000-8000-000000000001',
               'guest', 'confirmed', %L::date + 1, %L::date + 3)
       returning nightly_rate_minor)
     select nightly_rate_minor from booked $$, :'today', :'today'),
  $$ values (3000::bigint) $$,
  'RT-S4-05: a cleared size is passed over, and its beds take the general price');

update public.property_rates set amount_minor = null
 where property_id = 'f7b11111-1111-4111-8111-111111111111'
   and unit_type = 'bed' and room_capacity is null;

select results_eq(
  format($$ with booked as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       values
         ('f7a11111-1111-4111-8111-111111111111',
          'f7b11111-1111-4111-8111-111111111111',
          'f7c00000-0000-4000-8000-000000000104',
          'f7d00000-0000-4000-8000-000000000001',
          'guest', 'confirmed', %L::date + 1, %L::date + 3),
         ('f7a11111-1111-4111-8111-111111111111',
          'f7b11111-1111-4111-8111-111111111111',
          'f7c00000-0000-4000-8000-000000000105',
          'f7d00000-0000-4000-8000-000000000001',
          'guest', 'confirmed', %L::date + 5, %L::date + 6)
       returning accommodation_unit_id, nightly_rate_minor)
     select nightly_rate_minor from booked order by accommodation_unit_id $$,
     :'today', :'today', :'today', :'today'),
  $$ values (null::bigint), (null::bigint) $$,
  'RT-S4-05: with the general price cleared too, a size without one is booked unpriced, never refused');

select results_eq(
  format($$ with booked as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       values ('f7a11111-1111-4111-8111-111111111111',
               'f7b11111-1111-4111-8111-111111111111',
               'f7c00000-0000-4000-8000-000000000101',
               'f7d00000-0000-4000-8000-000000000001',
               'guest', 'confirmed', %L::date + 10, %L::date + 12)
       returning nightly_rate_minor)
     select nightly_rate_minor from booked $$, :'today', :'today'),
  $$ values (9000::bigint) $$,
  'RT-S4-05: and a size that is still priced keeps its price when the general one goes');

-- Priced again for what follows.
update public.property_rates set amount_minor = 3000
 where property_id = 'f7b11111-1111-4111-8111-111111111111'
   and unit_type = 'bed' and room_capacity is null;
update public.property_rates set amount_minor = 4000
 where property_id = 'f7b11111-1111-4111-8111-111111111111'
   and unit_type = 'bed' and room_capacity = 4;

-- ---------------------------------------------------------------------------
-- A stale size
-- ---------------------------------------------------------------------------

-- The stale yurt trades in TRY and has a general bed price and a price for
-- rooms of four, then changes currency (allowed: nothing there is priced or
-- billed yet). Both prices are stale. The general price is set again in EUR;
-- the size is left in TRY.
insert into public.property_rates
  (organization_id, property_id, unit_type, room_capacity, amount_minor)
values
  ('f7a11111-1111-4111-8111-111111111111',
   'f7b22222-2222-4222-8222-222222222222', 'bed', null, 3000),
  ('f7a11111-1111-4111-8111-111111111111',
   'f7b22222-2222-4222-8222-222222222222', 'bed', 4, 4000);

set local role none;
update public.properties set currency = 'EUR'
 where id = 'f7b22222-2222-4222-8222-222222222222';
set local role ranza_app;
select app.set_request_context('f7111111-1111-4111-8111-111111111111');
update public.property_rates set amount_minor = 80
 where property_id = 'f7b22222-2222-4222-8222-222222222222'
   and unit_type = 'bed' and room_capacity is null;

select results_eq(
  $$ select currency::text, room_capacity from public.property_rates
      where property_id = 'f7b22222-2222-4222-8222-222222222222'
      order by room_capacity nulls first $$,
  $$ values ('EUR', null::int), ('TRY', 4) $$,
  'RT-S4-10: the general price was restated in the Property''s currency and the size was not');

select results_eq(
  format($$ with booked as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       values ('f7a11111-1111-4111-8111-111111111111',
               'f7b22222-2222-4222-8222-222222222222',
               'f7c00000-0000-4000-8000-000000000107',
               'f7d00000-0000-4000-8000-000000000001',
               'guest', 'confirmed', %L::date + 1, %L::date + 3)
       returning nightly_rate_minor, rate_currency)
     select nightly_rate_minor, rate_currency from booked $$, :'today', :'today'),
  $$ values (null::bigint, null::char(3)) $$,
  'RT-S4-10: a stale size price prices nothing and hands its beds to nobody');

-- ---------------------------------------------------------------------------
-- The moment: a move to another class of price
-- ---------------------------------------------------------------------------

-- The bookings below are far enough ahead to share no night with another
-- booking of the same bed. A move is the booking's own update, made as the
-- owner role with the Staff Member named, which is what the amendment command
-- does for the caller.
set local role none;
select app.set_request_context('f7111111-1111-4111-8111-111111111111');

insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id,
   stay_type, status, starts_on, ends_on)
values ('f7e00000-0000-4000-8000-000000000001',
        'f7a11111-1111-4111-8111-111111111111',
        'f7b11111-1111-4111-8111-111111111111',
        'f7c00000-0000-4000-8000-000000000102',
        'f7d00000-0000-4000-8000-000000000001', 'guest', 'confirmed',
        :'today'::date + 40, :'today'::date + 42);

select is(
  (select nightly_rate_minor from public.reservations
    where id = 'f7e00000-0000-4000-8000-000000000001'),
  4000::bigint,
  'RT-S4-08: the booking to move is quoted its room''s price');

-- A room of four to another room of four: the same class of price, so what it
-- was quoted stays, even though the size's price has since moved.
update public.property_rates set amount_minor = 4400
 where property_id = 'f7b11111-1111-4111-8111-111111111111'
   and unit_type = 'bed' and room_capacity = 4;

update public.reservations
   set accommodation_unit_id = 'f7c00000-0000-4000-8000-000000000104'
 where id = 'f7e00000-0000-4000-8000-000000000001';

select is(
  (select nightly_rate_minor from public.reservations
    where id = 'f7e00000-0000-4000-8000-000000000001'),
  4000::bigint,
  'RT-S4-08: moved to another room of the same size, a booking keeps the price it was quoted');

-- The desk moves a booking to a dearer size, which the list decides, and is
-- refused a cheaper one, which a pricing decision is.
select app.set_request_context('f7222222-2222-4222-8222-222222222222');

update public.reservations
   set accommodation_unit_id = 'f7c00000-0000-4000-8000-000000000101'
 where id = 'f7e00000-0000-4000-8000-000000000001';

select is(
  (select nightly_rate_minor from public.reservations
    where id = 'f7e00000-0000-4000-8000-000000000001'),
  9000::bigint,
  'RT-S4-08: moved to a single, a booking takes the single''s price; the desk may move a Guest up');

select throws_ok(
  $$ update public.reservations
        set accommodation_unit_id = 'f7c00000-0000-4000-8000-000000000103'
      where id = 'f7e00000-0000-4000-8000-000000000001' $$,
  '42501', 'a lower price for this booking needs rates.manage',
  'RT-S4-09: the desk cannot move a booking to a size that costs less');

select app.set_request_context('f7111111-1111-4111-8111-111111111111');

update public.reservations
   set accommodation_unit_id = 'f7c00000-0000-4000-8000-000000000103'
 where id = 'f7e00000-0000-4000-8000-000000000001';

select is(
  (select nightly_rate_minor from public.reservations
    where id = 'f7e00000-0000-4000-8000-000000000001'),
  4400::bigint,
  'RT-S4-09: a Manager may, and the booking takes today''s price for the size');

select * from finish();
rollback;
