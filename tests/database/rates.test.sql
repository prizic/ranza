-- What a night costs (ADR 0038, docs/features/rates).
--
-- Slice 1, the price list. Three claims, which fail in different ways:
--
--   the gate      a price is set, changed or cleared with rates.manage, reach
--                 to the Property and its commercial gates; it is read by
--                 whoever reaches the Property.
--
--   the columns   the caller names the Property, the type and the amount.
--                 The currency, who set it and when are the database's.
--
--   the currency  always the Property's at the moment of writing, so a price
--                 is never stated in money the Property does not trade in.
--
-- Rows in docs/features/rates/edge-cases.csv are named beside the assertion
-- that proves them. Each break below was applied, the altered object printed
-- first, and the named assertion seen red:
--   insert policy without rates.manage                 RT-S1-10
--   insert policy by reach alone, no commercial gates  RT-S1-14
--   currency granted to insert                         RT-S1-05, RT-S1-06
--   the stamp on insert only                           RT-S1-07
--   update policy without rates.manage                 RT-S1-10 (nor changed,
--                                                      nor cleared)
--   delete granted to ranza_app                        RT-S1-13 (never deleted)
--   read policy open to every row                      RT-S1-11
--   the stamp keeps a supplied price                   RT-S2-06 (overwritten)
--   the stamp ignores the Property's currency          RT-S2-04
--   the price-keeping trigger dropped                  RT-S2-06 (every role)
--   the currency lock counting Folios only             RT-S2-07
--   the currency lock counting cancelled bookings      RT-S2-07 (cancelled)
--   the Resident constraint dropped                    RT-S2-05 (without
--     the stamp). Dropped alone at first it turned nothing red: the stamp
--     never prices a Resident, so the constraint only binds without it.
begin;
select plan(39);

insert into public.users (id, email) values
  ('e1111111-1111-4111-8111-111111111111', 'rt-manager@example.test'),
  ('e2222222-2222-4222-8222-222222222222', 'rt-one-property@example.test'),
  ('e3333333-3333-4333-8333-333333333333', 'rt-desk@example.test'),
  ('e4444444-4444-4444-8444-444444444444', 'rt-outsider@example.test');

insert into public.organizations (id, name, status) values
  ('ea111111-1111-4111-8111-111111111111', 'Priced Organization', 'active'),
  ('ea222222-2222-4222-8222-222222222222', 'Priced Other Organization', 'active');

insert into public.properties (id, organization_id, name, currency) values
  ('eb111111-1111-4111-8111-111111111111',
   'ea111111-1111-4111-8111-111111111111', 'Priced Property', 'TRY'),
  ('eb222222-2222-4222-8222-222222222222',
   'ea111111-1111-4111-8111-111111111111', 'Second Property', 'TRY'),
  ('eb333333-3333-4333-8333-333333333333',
   'ea222222-2222-4222-8222-222222222222', 'Other Property', 'TRY');

-- A manager reaching everything; a manager reaching the first Property only;
-- a front desk, who does not hold rates.manage; a manager elsewhere.
insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('ea111111-1111-4111-8111-111111111111',
   'e1111111-1111-4111-8111-111111111111', 'manager', 'organization_wide'),
  ('ea111111-1111-4111-8111-111111111111',
   'e2222222-2222-4222-8222-222222222222', 'manager', 'assigned_properties'),
  ('ea111111-1111-4111-8111-111111111111',
   'e3333333-3333-4333-8333-333333333333', 'front_desk', 'organization_wide'),
  ('ea222222-2222-4222-8222-222222222222',
   'e4444444-4444-4444-8444-444444444444', 'manager', 'organization_wide');

insert into public.property_assignments (property_id, organization_id, user_id)
values ('eb111111-1111-4111-8111-111111111111',
        'ea111111-1111-4111-8111-111111111111',
        'e2222222-2222-4222-8222-222222222222');

insert into public.subscriptions (organization_id, status) values
  ('ea111111-1111-4111-8111-111111111111', 'active'),
  ('ea222222-2222-4222-8222-222222222222', 'active');

insert into public.entitlements (organization_id, module_key) values
  ('ea111111-1111-4111-8111-111111111111', 'platform_core'),
  ('ea222222-2222-4222-8222-222222222222', 'platform_core');

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('eb111111-1111-4111-8111-111111111111',
   'ea111111-1111-4111-8111-111111111111', 'configuration', true),
  ('eb222222-2222-4222-8222-222222222222',
   'ea111111-1111-4111-8111-111111111111', 'configuration', true),
  ('eb333333-3333-4333-8333-333333333333',
   'ea222222-2222-4222-8222-222222222222', 'configuration', true);

-- A price the other Organization already holds, to prove it stays unseen.
insert into public.property_rates
  (organization_id, property_id, unit_type, amount_minor)
values ('ea222222-2222-4222-8222-222222222222',
        'eb333333-3333-4333-8333-333333333333', 'room', 90000);

-- ---------------------------------------------------------------------------
-- The shape
-- ---------------------------------------------------------------------------

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'property_rates'
       and grantee = 'ranza_app' and privilege_type = 'INSERT'$$,
  array['organization_id', 'property_id', 'unit_type', 'amount_minor'],
  'RT-S1-05: a price names its Property, its type and its amount, and nothing else');

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'property_rates'
       and grantee = 'ranza_app' and privilege_type = 'UPDATE'$$,
  array['amount_minor'],
  'RT-S1-05: and only its amount changes afterwards');

select set_eq(
  $$select key from public.staff_roles
     where organization_id is null
       and 'rates.manage' = any (permissions)$$,
  array['owner', 'manager'],
  'RT-S1-08: Owner and Manager hold rates.manage, and no other shipped role');

-- ---------------------------------------------------------------------------
-- The manager reaching everything
-- ---------------------------------------------------------------------------

set local role ranza_app;
select app.set_request_context('e1111111-1111-4111-8111-111111111111');

select results_eq(
  $$ with priced as (
       insert into public.property_rates
         (organization_id, property_id, unit_type, amount_minor)
       values ('ea111111-1111-4111-8111-111111111111',
               'eb111111-1111-4111-8111-111111111111', 'room', 150000)
       returning currency::text, updated_by)
     select * from priced $$,
  $$ values ('TRY', 'e1111111-1111-4111-8111-111111111111'::uuid) $$,
  'RT-S1-01: a price is set, in the Property''s currency, and names who set it');

select throws_ok(
  $$ insert into public.property_rates
       (organization_id, property_id, unit_type, amount_minor, currency)
     values ('ea111111-1111-4111-8111-111111111111',
             'eb111111-1111-4111-8111-111111111111', 'bed', 5000, 'USD') $$,
  '42501', null, 'RT-S1-06: a caller cannot name the currency');

select throws_ok(
  $$ insert into public.property_rates
       (organization_id, property_id, unit_type, amount_minor)
     values ('ea111111-1111-4111-8111-111111111111',
             'eb111111-1111-4111-8111-111111111111', 'bed', 0) $$,
  '23514', null, 'RT-S1-04: a price of nothing is refused; clearing is how a type goes unpriced');

select throws_ok(
  $$ insert into public.property_rates
       (organization_id, property_id, unit_type, amount_minor)
     values ('ea111111-1111-4111-8111-111111111111',
             'eb111111-1111-4111-8111-111111111111', 'bed', 100000000001) $$,
  '23514', null, 'RT-S1-04: and so is one past the ceiling');

select throws_ok(
  $$ insert into public.property_rates
       (organization_id, property_id, unit_type, amount_minor)
     values ('ea111111-1111-4111-8111-111111111111',
             'eb111111-1111-4111-8111-111111111111', 'penthouse', 5000) $$,
  '23514', null, 'RT-S1-03: a kind of Unit that cannot exist has no price');

select throws_ok(
  $$ insert into public.property_rates
       (organization_id, property_id, unit_type, amount_minor)
     values ('ea111111-1111-4111-8111-111111111111',
             'eb111111-1111-4111-8111-111111111111', 'room', 120000) $$,
  '23505', null, 'RT-S1-02: one price per type at a Property');

select throws_ok(
  $$ update public.property_rates set unit_type = 'suite'
      where property_id = 'eb111111-1111-4111-8111-111111111111' $$,
  '42501', null, 'RT-S1-05: a price is not moved to another type');

select throws_ok(
  $$ update public.property_rates set updated_by = null
      where property_id = 'eb111111-1111-4111-8111-111111111111' $$,
  '42501', null, 'RT-S1-05: nor told who set it');

select is(
  (select count(*)::int from public.property_rates
    where property_id = 'eb333333-3333-4333-8333-333333333333'),
  0, 'RT-S1-11: another Organization''s prices are not seen');

select throws_ok(
  $$ insert into public.property_rates
       (organization_id, property_id, unit_type, amount_minor)
     values ('ea222222-2222-4222-8222-222222222222',
             'eb333333-3333-4333-8333-333333333333', 'bed', 5000) $$,
  '42501', null, 'RT-S1-11: nor set');

-- ---------------------------------------------------------------------------
-- The front desk
-- ---------------------------------------------------------------------------

select app.set_request_context('e3333333-3333-4333-8333-333333333333');

select is(
  (select amount_minor from public.property_rates
    where property_id = 'eb111111-1111-4111-8111-111111111111'
      and unit_type = 'room'),
  150000::bigint, 'RT-S1-09: the front desk reads the price it quotes');

select throws_ok(
  $$ insert into public.property_rates
       (organization_id, property_id, unit_type, amount_minor)
     values ('ea111111-1111-4111-8111-111111111111',
             'eb111111-1111-4111-8111-111111111111', 'suite', 400000) $$,
  '42501', null, 'RT-S1-10: without rates.manage a price is not set');

select results_eq(
  $$ with changed as (
       update public.property_rates set amount_minor = 1
        where property_id = 'eb111111-1111-4111-8111-111111111111'
       returning 1)
     select count(*)::int from changed $$,
  $$ values (0) $$,
  'RT-S1-10: nor changed');

select results_eq(
  $$ with cleared as (
       update public.property_rates set amount_minor = null
        where property_id = 'eb111111-1111-4111-8111-111111111111'
       returning 1)
     select count(*)::int from cleared $$,
  $$ values (0) $$,
  'RT-S1-10: nor cleared');

-- ---------------------------------------------------------------------------
-- The manager reaching one Property
-- ---------------------------------------------------------------------------

select app.set_request_context('e2222222-2222-4222-8222-222222222222');

select throws_ok(
  $$ insert into public.property_rates
       (organization_id, property_id, unit_type, amount_minor)
     values ('ea111111-1111-4111-8111-111111111111',
             'eb222222-2222-4222-8222-222222222222', 'room', 100000) $$,
  '42501', null, 'RT-S1-12: a Property out of reach is not priced');

select lives_ok(
  $$ insert into public.property_rates
       (organization_id, property_id, unit_type, amount_minor)
     values ('ea111111-1111-4111-8111-111111111111',
             'eb111111-1111-4111-8111-111111111111', 'bed', 45000) $$,
  'RT-S1-12: while the one in reach is');

-- ---------------------------------------------------------------------------
-- A stale price, made current by being set again
-- ---------------------------------------------------------------------------

set local role none;
update public.properties set currency = 'EUR'
 where id = 'eb111111-1111-4111-8111-111111111111';

select is(
  (select currency::text from public.property_rates
    where property_id = 'eb111111-1111-4111-8111-111111111111'
      and unit_type = 'room'),
  'TRY', 'RT-S1-07: a currency change leaves the price in the old currency, stale');

set local role ranza_app;
select app.set_request_context('e1111111-1111-4111-8111-111111111111');

select results_eq(
  $$ with changed as (
       update public.property_rates set amount_minor = 5000
        where property_id = 'eb111111-1111-4111-8111-111111111111'
          and unit_type = 'room'
       returning currency::text)
     select * from changed $$,
  $$ values ('EUR') $$,
  'RT-S1-07: and setting it again states it in the Property''s currency');

select results_eq(
  $$ with cleared as (
       update public.property_rates set amount_minor = null
        where property_id = 'eb111111-1111-4111-8111-111111111111'
          and unit_type = 'bed'
       returning amount_minor)
     select count(*)::int from cleared where amount_minor is null $$,
  $$ values (1) $$,
  'RT-S1-13: a price is cleared to no amount, and that type is unpriced');

select throws_ok(
  $$ delete from public.property_rates
      where property_id = 'eb111111-1111-4111-8111-111111111111' $$,
  '42501', null, 'RT-S1-13: and never deleted, even by whoever may set it');

-- ---------------------------------------------------------------------------
-- Slice 2: a booking carries its price
-- ---------------------------------------------------------------------------

-- The first Property now trades in EUR with a room price of 50.00 EUR and the
-- bed price cleared. The second trades in TRY; it is priced here as the owner.
set local role none;
insert into public.entitlements (organization_id, module_key) values
  ('ea111111-1111-4111-8111-111111111111', 'front_office');
insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('eb111111-1111-4111-8111-111111111111',
   'ea111111-1111-4111-8111-111111111111', 'front_desk', true),
  ('eb222222-2222-4222-8222-222222222222',
   'ea111111-1111-4111-8111-111111111111', 'front_desk', true);
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity) values
  ('ec111111-1111-4111-8111-111111111111', 'eb111111-1111-4111-8111-111111111111',
   'ea111111-1111-4111-8111-111111111111', 'RT-101', 'room', 2),
  ('ec222222-2222-4222-8222-222222222222', 'eb111111-1111-4111-8111-111111111111',
   'ea111111-1111-4111-8111-111111111111', 'RT-B1', 'bed', 1),
  ('ec333333-3333-4333-8333-333333333333', 'eb111111-1111-4111-8111-111111111111',
   'ea111111-1111-4111-8111-111111111111', 'RT-102', 'room', 2),
  ('ec444444-4444-4444-8444-444444444444', 'eb222222-2222-4222-8222-222222222222',
   'ea111111-1111-4111-8111-111111111111', 'RT-201', 'room', 2);
insert into public.guests (id, organization_id, full_name) values
  ('ed111111-1111-4111-8111-111111111111',
   'ea111111-1111-4111-8111-111111111111', 'Priced Guest');
insert into public.property_rates
  (organization_id, property_id, unit_type, amount_minor)
values ('ea111111-1111-4111-8111-111111111111',
        'eb222222-2222-4222-8222-222222222222', 'room', 7000);

select app.property_today('eb111111-1111-4111-8111-111111111111') as today \gset

set local role ranza_app;
select app.set_request_context('e1111111-1111-4111-8111-111111111111');

select results_eq(
  format($$ with booked as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       values ('ea111111-1111-4111-8111-111111111111',
               'eb111111-1111-4111-8111-111111111111',
               'ec111111-1111-4111-8111-111111111111',
               'ed111111-1111-4111-8111-111111111111',
               'guest', 'confirmed', %L::date + 1, %L::date + 3)
       returning nightly_rate_minor, rate_currency::text)
     select * from booked $$, :'today', :'today'),
  $$ values (5000::bigint, 'EUR') $$,
  'RT-S2-01: a Guest booking is stamped with the price of its Unit''s kind');

select results_eq(
  format($$ with booked as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       values ('ea111111-1111-4111-8111-111111111111',
               'eb111111-1111-4111-8111-111111111111',
               'ec222222-2222-4222-8222-222222222222',
               'ed111111-1111-4111-8111-111111111111',
               'guest', 'confirmed', %L::date + 1, %L::date + 3)
       returning nightly_rate_minor)
     select count(*)::int from booked where nightly_rate_minor is null $$,
     :'today', :'today'),
  $$ values (1) $$,
  'RT-S2-03: a kind with no price is booked unpriced, not refused');

select results_eq(
  format($$ with booked as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       values ('ea111111-1111-4111-8111-111111111111',
               'eb111111-1111-4111-8111-111111111111',
               'ec333333-3333-4333-8333-333333333333',
               'ed111111-1111-4111-8111-111111111111',
               'resident', 'confirmed', %L::date + 1, null)
       returning nightly_rate_minor)
     select count(*)::int from booked where nightly_rate_minor is null $$,
     :'today'),
  $$ values (1) $$,
  'RT-S2-05: a Resident is never priced by the night');

select throws_ok(
  format($$ insert into public.reservations
       (organization_id, property_id, accommodation_unit_id, guest_id,
        stay_type, status, starts_on, ends_on, nightly_rate_minor, rate_currency)
     values ('ea111111-1111-4111-8111-111111111111',
             'eb111111-1111-4111-8111-111111111111',
             'ec333333-3333-4333-8333-333333333333',
             'ed111111-1111-4111-8111-111111111111',
             'guest', 'confirmed', %L::date + 20, %L::date + 21, 1, 'EUR') $$,
     :'today', :'today'),
  '42501', null, 'RT-S2-06: a caller cannot name a booking''s price');

select throws_ok(
  $$ update public.reservations set nightly_rate_minor = 1
      where accommodation_unit_id = 'ec111111-1111-4111-8111-111111111111' $$,
  '42501', null, 'RT-S2-06: nor change it');

-- The price list moves; the booking does not.
update public.property_rates set amount_minor = 9900
 where property_id = 'eb111111-1111-4111-8111-111111111111'
   and unit_type = 'room';

select is(
  (select nightly_rate_minor from public.reservations
    where accommodation_unit_id = 'ec111111-1111-4111-8111-111111111111'),
  5000::bigint, 'RT-S2-02: a booking keeps the price it was taken at');

select ok(
  app.property_currency_is_fixed('eb111111-1111-4111-8111-111111111111'),
  'RT-S2-07: the screen is told a priced booking fixes the currency');

set local role none;

select throws_ok(
  $$ update public.reservations set nightly_rate_minor = 1
      where accommodation_unit_id = 'ec111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'RT-S2-06: and a role that bypasses every policy cannot change it either');

select results_eq(
  format($$ with booked as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on, nightly_rate_minor, rate_currency)
       values ('ea111111-1111-4111-8111-111111111111',
               'eb111111-1111-4111-8111-111111111111',
               'ec111111-1111-4111-8111-111111111111',
               'ed111111-1111-4111-8111-111111111111',
               'guest', 'confirmed', %L::date + 30, %L::date + 31, 1, 'EUR')
       returning nightly_rate_minor)
     select * from booked $$,
     :'today', :'today'),
  $$ values (9900::bigint) $$,
  'RT-S2-06: whatever such a role supplies is overwritten by the price list, not kept');

select throws_ok(
  $$ update public.properties set currency = 'USD'
      where id = 'eb111111-1111-4111-8111-111111111111' $$,
  '55000', null, 'RT-S2-07: a priced booking fixes the currency, for every role');

-- The stamp never prices a Resident, so the constraint below it is unreachable
-- while the stamp stands: breaking only the constraint turned nothing red. The
-- two diverge when the stamp is gone, which is what this asserts — with the
-- stamp off inside this rolled-back transaction, the constraint still refuses.
-- Deferred checks on reservations are fired first: ALTER TABLE refuses a table
-- with trigger events still pending.
set constraints all immediate;
alter table public.reservations disable trigger reservations_priced_when_taken;
select throws_ok(
  format($$ insert into public.reservations
       (organization_id, property_id, accommodation_unit_id, guest_id,
        stay_type, status, starts_on, ends_on, nightly_rate_minor, rate_currency)
     values ('ea111111-1111-4111-8111-111111111111',
             'eb111111-1111-4111-8111-111111111111',
             'ec111111-1111-4111-8111-111111111111',
             'ed111111-1111-4111-8111-111111111111',
             'resident', 'confirmed', %L::date + 40, null, 5000, 'EUR') $$,
     :'today'),
  '23514', null,
  'RT-S2-05: a Resident priced by the night is refused even without the stamp');
alter table public.reservations enable trigger reservations_priced_when_taken;

-- The second Property: a priced booking fixes its currency until it is
-- cancelled; then a currency change makes its price stale, and the next
-- booking is unpriced.
set local role ranza_app;
select app.set_request_context('e1111111-1111-4111-8111-111111111111');

select results_eq(
  format($$ with booked as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       values ('ea111111-1111-4111-8111-111111111111',
               'eb222222-2222-4222-8222-222222222222',
               'ec444444-4444-4444-8444-444444444444',
               'ed111111-1111-4111-8111-111111111111',
               'guest', 'confirmed', %L::date + 1, %L::date + 2)
       returning nightly_rate_minor, rate_currency::text)
     select * from booked $$, :'today', :'today'),
  $$ values (7000::bigint, 'TRY') $$,
  'RT-S2-01: priced in the second Property''s own currency');

set local role none;
update public.reservations set status = 'cancelled'
 where accommodation_unit_id = 'ec444444-4444-4444-8444-444444444444';

select lives_ok(
  $$ update public.properties set currency = 'USD'
      where id = 'eb222222-2222-4222-8222-222222222222' $$,
  'RT-S2-07: a cancelled booking promises nothing, and fixes nothing');

set local role ranza_app;
select app.set_request_context('e1111111-1111-4111-8111-111111111111');

select results_eq(
  format($$ with booked as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       values ('ea111111-1111-4111-8111-111111111111',
               'eb222222-2222-4222-8222-222222222222',
               'ec444444-4444-4444-8444-444444444444',
               'ed111111-1111-4111-8111-111111111111',
               'guest', 'confirmed', %L::date + 5, %L::date + 6)
       returning nightly_rate_minor)
     select count(*)::int from booked where nightly_rate_minor is null $$,
     :'today', :'today'),
  $$ values (1) $$,
  'RT-S2-04: a price left in an old currency prices no booking');

set local role none;
update public.subscriptions set status = 'active'
 where organization_id = 'ea111111-1111-4111-8111-111111111111';

-- ---------------------------------------------------------------------------
-- A lapsed Subscription
-- ---------------------------------------------------------------------------

set local role none;
update public.subscriptions set status = 'suspended'
 where organization_id = 'ea111111-1111-4111-8111-111111111111';
set local role ranza_app;
select app.set_request_context('e1111111-1111-4111-8111-111111111111');

select throws_ok(
  $$ insert into public.property_rates
       (organization_id, property_id, unit_type, amount_minor)
     values ('ea111111-1111-4111-8111-111111111111',
             'eb111111-1111-4111-8111-111111111111', 'suite', 400000) $$,
  '42501', null, 'RT-S1-14: a lapsed Subscription sets no price');

select results_eq(
  $$ with changed as (
       update public.property_rates set amount_minor = 7000
        where property_id = 'eb111111-1111-4111-8111-111111111111'
       returning 1)
     select count(*)::int from changed $$,
  $$ values (0) $$,
  'RT-S1-14: and changes none');

select * from finish();
rollback;
