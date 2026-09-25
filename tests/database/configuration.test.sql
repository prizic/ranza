-- Configuring a Property and renaming its Organization (ADR 0036).
--
-- Three claims, which fail in different ways on purpose:
--
--   the gate      a change takes configuration.manage and reach to the row:
--                 the Property's, or every Property for the Organization's
--                 name; and the commercial gates, so a lapsed Subscription
--                 changes nothing.
--
--   the columns   the grant names four Property settings and the Organization's
--                 name; ownership, status and the stamp are not settable.
--
--   the currency  fixed by the first Folio, whoever asks and whatever they can
--                 see, and a Folio opens only in its Property's currency.
--
-- Rows in docs/features/configuration/edge-cases.csv are named beside the
-- assertion that proves them. Each break below was applied inside a rolled-back
-- transaction, the altered object printed first, and the named assertion seen
-- red:
--   properties policy without configuration.manage           CF-S1-12
--   properties policy with accessible_property_ids alone     CF-S1-15
--   organizations policy without organization-wide reach     CF-S2-02
--   update grant widened to status                           CF-S1-11
--   currency lock without its trigger                        CF-S1-04 (both)
--   the stamp as plain now()                                 CF-S1-18
--   the Folio guard dropped                                  CF-S1-20
--   the read flag without its reach gate                     another Organization
-- Two breaks turned nothing red, and ADR 0036 records which reason binds:
--   either WITH CHECK clause removed — the key columns are not granted, so a
--     row cannot be moved to where WITH CHECK alone would refuse it;
--   the currency lock made an invoker — a Folio is read by reach, and
--     configuring a Property needs reach, so nobody who may change a currency
--     has a Folio hidden from them today. The definer is kept so that
--     narrowing the Folio read policy later cannot quietly unfix a currency.
begin;
select plan(41);

insert into public.users (id, email) values
  ('c1111111-1111-4111-8111-111111111111', 'cf-manager@example.test'),
  ('c2222222-2222-4222-8222-222222222222', 'cf-one-property@example.test'),
  ('c3333333-3333-4333-8333-333333333333', 'cf-desk@example.test'),
  ('c4444444-4444-4444-8444-444444444444', 'cf-outsider@example.test');

insert into public.organizations (id, name, status) values
  ('ca111111-1111-4111-8111-111111111111', 'Configured Organization', 'active'),
  ('ca222222-2222-4222-8222-222222222222', 'Configured Other Organization', 'active');

-- The first Property has a Folio and so trades; the second has none yet.
insert into public.properties (id, organization_id, name, currency) values
  ('cb111111-1111-4111-8111-111111111111',
   'ca111111-1111-4111-8111-111111111111', 'Trading Property', 'TRY'),
  ('cb222222-2222-4222-8222-222222222222',
   'ca111111-1111-4111-8111-111111111111', 'New Property', 'TRY'),
  ('cb333333-3333-4333-8333-333333333333',
   'ca222222-2222-4222-8222-222222222222', 'Other Property', 'TRY');

-- A manager reaching everything; a manager reaching the first Property only;
-- a front desk, who does not hold configuration.manage; and a manager of
-- another Organization.
insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('ca111111-1111-4111-8111-111111111111',
   'c1111111-1111-4111-8111-111111111111', 'manager', 'organization_wide'),
  ('ca111111-1111-4111-8111-111111111111',
   'c2222222-2222-4222-8222-222222222222', 'manager', 'assigned_properties'),
  ('ca111111-1111-4111-8111-111111111111',
   'c3333333-3333-4333-8333-333333333333', 'front_desk', 'organization_wide'),
  ('ca222222-2222-4222-8222-222222222222',
   'c4444444-4444-4444-8444-444444444444', 'manager', 'organization_wide');

insert into public.property_assignments (property_id, organization_id, user_id)
values ('cb111111-1111-4111-8111-111111111111',
        'ca111111-1111-4111-8111-111111111111',
        'c2222222-2222-4222-8222-222222222222');

insert into public.subscriptions (organization_id, status) values
  ('ca111111-1111-4111-8111-111111111111', 'active'),
  ('ca222222-2222-4222-8222-222222222222', 'active');

insert into public.entitlements (organization_id, module_key) values
  ('ca111111-1111-4111-8111-111111111111', 'platform_core'),
  ('ca222222-2222-4222-8222-222222222222', 'platform_core');

-- No finance capability: a Folio is read by reach alone, so the finance
-- capability decides nothing here.
insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('cb111111-1111-4111-8111-111111111111',
   'ca111111-1111-4111-8111-111111111111', 'configuration', true),
  ('cb222222-2222-4222-8222-222222222222',
   'ca111111-1111-4111-8111-111111111111', 'configuration', true),
  ('cb333333-3333-4333-8333-333333333333',
   'ca222222-2222-4222-8222-222222222222', 'configuration', true);

insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity) values
  ('cc111111-1111-4111-8111-111111111111',
   'cb111111-1111-4111-8111-111111111111',
   'ca111111-1111-4111-8111-111111111111', 'CF-101', 'room', 2);

insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, stay_type, status,
   starts_on, ends_on)
select 'cd111111-1111-4111-8111-111111111111',
       'ca111111-1111-4111-8111-111111111111',
       'cb111111-1111-4111-8111-111111111111',
       'cc111111-1111-4111-8111-111111111111', 'guest', 'in_house',
       app.property_today('cb111111-1111-4111-8111-111111111111'),
       app.property_today('cb111111-1111-4111-8111-111111111111') + 2;

insert into public.folios (organization_id, property_id, stay_id, currency)
values ('ca111111-1111-4111-8111-111111111111',
        'cb111111-1111-4111-8111-111111111111',
        'cd111111-1111-4111-8111-111111111111', 'TRY');

-- ---------------------------------------------------------------------------
-- The shape
-- ---------------------------------------------------------------------------

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'properties'
       and grantee = 'ranza_app' and privilege_type = 'UPDATE'$$,
  array['name', 'timezone', 'currency', 'business_date_cutoff'],
  'CF-S1-11: a Property update may change its four settings and nothing else');

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'organizations'
       and grantee = 'ranza_app' and privilege_type = 'UPDATE'$$,
  array['name'],
  'CF-S2-03: an Organization update may change its name and nothing else');

select set_eq(
  $$select key from public.staff_roles
     where organization_id is null
       and 'configuration.manage' = any (permissions)$$,
  array['owner', 'manager'],
  'CF-S1-19: Owner and Manager hold configuration.manage, and no other shipped role');

-- A tripwire, not a restatement. Close-the-day (RANZ-26) adds a trigger on
-- properties that takes an advisory lock and raises RZ001. Merged beside this
-- feature it needs two changes in @ranza/core — map RZ001 to a refusal, and
-- take that advisory lock first so a save and a check-in lock in one order —
-- or a timezone change crashes the page and a save can deadlock a check-in
-- (ADR 0036, Consequences). A new trigger here is the moment to make them.
select set_eq(
  $$select tgname::text from pg_catalog.pg_trigger
     where tgrelid = 'public.properties'::regclass and not tgisinternal$$,
  array['properties_stamped', 'properties_currency_is_fixed'],
  'a new trigger on properties: read ADR 0036 § Consequences before accepting it');

select updated_at as stamp_before from public.properties
 where id = 'cb222222-2222-4222-8222-222222222222' \gset

-- ---------------------------------------------------------------------------
-- The manager reaching everything
-- ---------------------------------------------------------------------------

set local role ranza_app;
select app.set_request_context('c1111111-1111-4111-8111-111111111111');

select results_eq(
  $$ with changed as (
       update public.properties set name = 'Kordon Otel'
        where id = 'cb222222-2222-4222-8222-222222222222'
       returning name)
     select name from changed $$,
  $$ values ('Kordon Otel') $$,
  'CF-S1-01: a Property is renamed');

select throws_ok(
  $$ update public.properties set name = '   '
      where id = 'cb222222-2222-4222-8222-222222222222' $$,
  '23514', null, 'CF-S1-02: a name of spaces is refused');

select throws_ok(
  $$ update public.properties set name = 'K'
      where id = 'cb222222-2222-4222-8222-222222222222' $$,
  '23514', null, 'CF-S1-02: a name of one character is refused');

select throws_ok(
  $$ update public.properties set name = repeat('K', 121)
      where id = 'cb222222-2222-4222-8222-222222222222' $$,
  '23514', null, 'CF-S1-02: a name of 121 characters is refused');

select lives_ok(
  $$ update public.properties set name = repeat('K', 120)
      where id = 'cb222222-2222-4222-8222-222222222222' $$,
  'CF-S1-02: and 120 is allowed, so the bound is where the row says');

select throws_ok(
  $$ update public.properties set currency = 'eur'
      where id = 'cb222222-2222-4222-8222-222222222222' $$,
  '23514', null, 'CF-S1-05: a currency is three capital letters');

select throws_ok(
  $$ update public.properties set timezone = 'Mars/Olympus'
      where id = 'cb222222-2222-4222-8222-222222222222' $$,
  '23514', null, 'CF-S1-07: a timezone Postgres does not know is refused');

select throws_ok(
  $$ update public.properties set business_date_cutoff = time '02:00'
      where id = 'cb222222-2222-4222-8222-222222222222' $$,
  '23514', null, 'CF-S1-09: a cutoff before 03:00 is refused');

select throws_ok(
  $$ update public.properties set business_date_cutoff = time '12:00'
      where id = 'cb222222-2222-4222-8222-222222222222' $$,
  '23514', null, 'CF-S1-09: a cutoff at noon or later is refused');

select throws_ok(
  $$ update public.properties
        set organization_id = 'ca222222-2222-4222-8222-222222222222'
      where id = 'cb222222-2222-4222-8222-222222222222' $$,
  '42501', null, 'CF-S1-11: a Property cannot be moved to another Organization');

select throws_ok(
  $$ update public.properties set status = 'archived'
      where id = 'cb222222-2222-4222-8222-222222222222' $$,
  '42501', null, 'CF-S1-11: nor retired by a settings change');

select throws_ok(
  $$ update public.properties set updated_at = now() - interval '1 day'
      where id = 'cb222222-2222-4222-8222-222222222222' $$,
  '42501', null, 'CF-S1-18: nor told when it changed');

select ok(
  (select updated_at from public.properties
    where id = 'cb222222-2222-4222-8222-222222222222') > :'stamp_before'::timestamptz,
  'CF-S1-18: the database stamps the change');

select lives_ok(
  $$ update public.properties set currency = 'EUR'
      where id = 'cb222222-2222-4222-8222-222222222222' $$,
  'CF-S1-03: a Property no Folio was opened in changes currency');

select throws_ok(
  $$ update public.properties set currency = 'EUR'
      where id = 'cb111111-1111-4111-8111-111111111111' $$,
  '55000', null,
  'CF-S1-04: the currency is fixed by the first Folio');

select lives_ok(
  $$ update public.properties set name = 'Trading Property Renamed', currency = 'TRY'
      where id = 'cb111111-1111-4111-8111-111111111111' $$,
  'CF-S1-04: a trading Property is still renamed by a form that sends its currency back');

select ok(
  app.property_currency_is_fixed('cb111111-1111-4111-8111-111111111111')
  and not app.property_currency_is_fixed('cb222222-2222-4222-8222-222222222222'),
  'CF-S1-04: the screen can tell which currency is fixed before anybody tries');

select throws_ok(
  $$ insert into public.folios (organization_id, property_id, stay_id, currency)
     values ('ca111111-1111-4111-8111-111111111111',
             'cb111111-1111-4111-8111-111111111111',
             'cd111111-1111-4111-8111-111111111111', 'EUR') $$,
  '23514', null,
  'CF-S1-20: a Folio opens only in its Property''s currency');

select lives_ok(
  $$ update public.properties set timezone = 'Asia/Dubai'
      where id = 'cb222222-2222-4222-8222-222222222222' $$,
  'CF-S1-06: a Property timezone is changed');

select is(
  app.property_today('cb222222-2222-4222-8222-222222222222'),
  app.business_date(now(), 'Asia/Dubai', time '04:00'),
  'CF-S1-06: and today is read by the new clock at once');

select lives_ok(
  $$ update public.properties set business_date_cutoff = time '06:00'
      where id = 'cb222222-2222-4222-8222-222222222222' $$,
  'CF-S1-08: a business day cutoff is changed');

select is(
  app.property_today('cb222222-2222-4222-8222-222222222222'),
  app.business_date(now(), 'Asia/Dubai', time '06:00'),
  'CF-S1-08: and today is read with it');

select results_eq(
  $$ with changed as (
       update public.organizations set name = 'Kordon Hotels'
        where id = 'ca111111-1111-4111-8111-111111111111'
       returning name)
     select name from changed $$,
  $$ values ('Kordon Hotels') $$,
  'CF-S2-01: the Organization is renamed by a manager reaching every Property');

select throws_ok(
  $$ update public.organizations set name = 'K'
      where id = 'ca111111-1111-4111-8111-111111111111' $$,
  '23514', null, 'CF-S2-04: an Organization name of one character is refused');

select throws_ok(
  $$ update public.organizations set status = 'suspended'
      where id = 'ca111111-1111-4111-8111-111111111111' $$,
  '42501', null, 'CF-S2-03: an Organization''s status is not a setting');

select throws_ok(
  $$ update public.organizations set default_locale = 'en'
      where id = 'ca111111-1111-4111-8111-111111111111' $$,
  '42501', null, 'CF-DEF-01: nor its default language, which nothing reads yet');

-- ---------------------------------------------------------------------------
-- The manager reaching the trading Property only
-- ---------------------------------------------------------------------------

select app.set_request_context('c2222222-2222-4222-8222-222222222222');

select results_eq(
  $$ with changed as (
       update public.properties set name = 'Not Theirs'
        where id = 'cb222222-2222-4222-8222-222222222222'
       returning 1)
     select count(*)::int from changed $$,
  $$ values (0) $$,
  'CF-S1-13: a Property out of reach is not configured');

select results_eq(
  $$ with changed as (
       update public.properties set name = 'Theirs Renamed'
        where id = 'cb111111-1111-4111-8111-111111111111'
       returning 1)
     select count(*)::int from changed $$,
  $$ values (1) $$,
  'CF-S1-13: while the Property they reach is');

select results_eq(
  $$ with changed as (
       update public.organizations set name = 'Their Hotels'
        where id = 'ca111111-1111-4111-8111-111111111111'
       returning 1)
     select count(*)::int from changed $$,
  $$ values (0) $$,
  'CF-S2-02: renaming the Organization needs reach to every Property');

-- ---------------------------------------------------------------------------
-- The front desk, and another Organization
-- ---------------------------------------------------------------------------

select app.set_request_context('c3333333-3333-4333-8333-333333333333');

select results_eq(
  $$ with changed as (
       update public.properties set name = 'Desk Renamed'
        where id = 'cb111111-1111-4111-8111-111111111111'
       returning 1)
     select count(*)::int from changed $$,
  $$ values (0) $$,
  'CF-S1-12: configuring a Property needs configuration.manage');

select results_eq(
  $$ with changed as (
       update public.organizations set name = 'Desk Hotels'
        where id = 'ca111111-1111-4111-8111-111111111111'
       returning 1)
     select count(*)::int from changed $$,
  $$ values (0) $$,
  'CF-S1-12: and so does renaming the Organization');

select app.set_request_context('c4444444-4444-4444-8444-444444444444');

select results_eq(
  $$ with changed as (
       update public.properties set name = 'Taken Over'
        where id = 'cb111111-1111-4111-8111-111111111111'
       returning 1)
     select count(*)::int from changed $$,
  $$ values (0) $$,
  'CF-S1-14: another Organization''s Property is not configured');

select ok(
  not app.property_currency_is_fixed('cb111111-1111-4111-8111-111111111111'),
  'the currency flag says nothing about another Organization''s books');

select lives_ok(
  $$ update public.properties set name = 'Other Property Renamed'
      where id = 'cb333333-3333-4333-8333-333333333333' $$,
  'while their own Property is');

-- ---------------------------------------------------------------------------
-- A lapsed Subscription, and a privileged role
-- ---------------------------------------------------------------------------

set local role none;
update public.subscriptions set status = 'suspended'
 where organization_id = 'ca111111-1111-4111-8111-111111111111';

set local role ranza_app;
select app.set_request_context('c1111111-1111-4111-8111-111111111111');

select results_eq(
  $$ with changed as (
       update public.properties set name = 'Lapsed Renamed'
        where id = 'cb222222-2222-4222-8222-222222222222'
       returning 1)
     select count(*)::int from changed $$,
  $$ values (0) $$,
  'CF-S1-15: a lapsed Subscription configures no Property');

select results_eq(
  $$ with changed as (
       update public.organizations set name = 'Lapsed Hotels'
        where id = 'ca111111-1111-4111-8111-111111111111'
       returning 1)
     select count(*)::int from changed $$,
  $$ values (0) $$,
  'CF-S1-15: and renames no Organization');

-- Whichever role connected: the superuser locally, postgres with BYPASSRLS on
-- Supabase. The lock is a trigger, so policies being bypassed does not bypass it.
set local role none;

select throws_ok(
  $$ update public.properties set currency = 'USD'
      where id = 'cb111111-1111-4111-8111-111111111111' $$,
  '55000', null,
  'CF-S1-04: the currency lock binds a role that bypasses every policy');

select * from finish();
rollback;
