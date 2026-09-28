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
begin;
select plan(25);

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
