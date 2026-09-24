-- Checking rooms after cleaning: an Organization default and a Property
-- override (RANZ-28 slice 3).
--
-- Three claims, and they fail in different ways on purpose:
--
--   the meaning    inspection changes what ready means and nothing a room
--                  holds; a Property's override beats the default, and "use
--                  the default" follows it.
--
--   the shape      one default per Organization, by a partial unique index,
--                  because null is not equal to null in one over both columns.
--
--   the gate       changing a setting takes accommodation.configure, and the
--                  default takes reach to every Property it governs.
--
-- Rows in docs/features/housekeeping/edge-cases.csv are named beside the
-- assertion that proves them. Each break below was applied inside a rolled-back
-- transaction, the altered object printed first, and the named assertion seen
-- red:
--   update policy without organization-wide reach        HK-S3-05 default
--   insert policy without accommodation.configure        HK-S3-07
--   insert policy with capability_is_available (no reach) HK-S3-05 override
--   the default's partial index made a total one          HK-S3-04
--   inspection_required ignoring the override             HK-S3-02
--   unit_is_ready ignoring inspection                     HK-S3-01
--   the read policy opened to everybody                   the other Organization
--   insert policy without organization-wide reach         HK-S3-05 at insert
--   unit_is_ready treating no row as ready                HK-S3-11
begin;
select plan(22);

insert into public.users (id, email) values
  ('91111111-1111-4111-8111-111111111111', 'hki-manager@example.test'),
  ('92222222-2222-4222-8222-222222222222', 'hki-one-property@example.test'),
  ('93333333-3333-4333-8333-333333333333', 'hki-desk@example.test'),
  ('94444444-4444-4444-8444-444444444444', 'hki-outsider@example.test');

insert into public.organizations (id, name, status) values
  ('9a111111-1111-4111-8111-111111111111', 'Inspection Organization', 'active'),
  ('9a222222-2222-4222-8222-222222222222', 'Inspection Other Organization', 'active');

insert into public.properties (id, organization_id, name) values
  ('9b111111-1111-4111-8111-111111111111',
   '9a111111-1111-4111-8111-111111111111', 'Inspection First Property'),
  ('9b222222-2222-4222-8222-222222222222',
   '9a111111-1111-4111-8111-111111111111', 'Inspection Second Property');

-- A manager reaching everything; a manager reaching the first Property only;
-- a front desk, who does not hold accommodation.configure; and a manager of
-- another Organization.
insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('9a111111-1111-4111-8111-111111111111',
   '91111111-1111-4111-8111-111111111111', 'manager', 'organization_wide'),
  ('9a111111-1111-4111-8111-111111111111',
   '92222222-2222-4222-8222-222222222222', 'manager', 'assigned_properties'),
  ('9a111111-1111-4111-8111-111111111111',
   '93333333-3333-4333-8333-333333333333', 'front_desk', 'organization_wide'),
  ('9a222222-2222-4222-8222-222222222222',
   '94444444-4444-4444-8444-444444444444', 'manager', 'organization_wide');

insert into public.property_assignments (property_id, organization_id, user_id)
values ('9b111111-1111-4111-8111-111111111111',
        '9a111111-1111-4111-8111-111111111111',
        '92222222-2222-4222-8222-222222222222');

insert into public.subscriptions (organization_id, status) values
  ('9a111111-1111-4111-8111-111111111111', 'active'),
  ('9a222222-2222-4222-8222-222222222222', 'active');

insert into public.entitlements (organization_id, module_key) values
  ('9a111111-1111-4111-8111-111111111111', 'housekeeping'),
  ('9a222222-2222-4222-8222-222222222222', 'housekeeping');

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('9b111111-1111-4111-8111-111111111111',
   '9a111111-1111-4111-8111-111111111111', 'housekeeping', true),
  ('9b222222-2222-4222-8222-222222222222',
   '9a111111-1111-4111-8111-111111111111', 'housekeeping', true);

-- A clean room and an inspected room at the first Property, and a clean room
-- at the second.
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity)
values
  ('9c111111-1111-4111-8111-111111111111',
   '9b111111-1111-4111-8111-111111111111',
   '9a111111-1111-4111-8111-111111111111', 'IN-101', 'room', 2),
  ('9c222222-2222-4222-8222-222222222222',
   '9b111111-1111-4111-8111-111111111111',
   '9a111111-1111-4111-8111-111111111111', 'IN-102', 'room', 2),
  ('9c333333-3333-4333-8333-333333333333',
   '9b222222-2222-4222-8222-222222222222',
   '9a111111-1111-4111-8111-111111111111', 'IN-201', 'room', 2),
  -- Never marked: no status row at all.
  ('9c444444-4444-4444-8444-444444444444',
   '9b111111-1111-4111-8111-111111111111',
   '9a111111-1111-4111-8111-111111111111', 'IN-103', 'room', 2);

insert into public.housekeeping_unit_status
  (accommodation_unit_id, property_id, organization_id, status)
values
  ('9c111111-1111-4111-8111-111111111111',
   '9b111111-1111-4111-8111-111111111111',
   '9a111111-1111-4111-8111-111111111111', 'clean'),
  ('9c222222-2222-4222-8222-222222222222',
   '9b111111-1111-4111-8111-111111111111',
   '9a111111-1111-4111-8111-111111111111', 'inspected'),
  ('9c333333-3333-4333-8333-333333333333',
   '9b222222-2222-4222-8222-222222222222',
   '9a111111-1111-4111-8111-111111111111', 'clean');

-- ---------------------------------------------------------------------------
-- The shape, for every role
-- ---------------------------------------------------------------------------

select ok(app.unit_is_ready('9c111111-1111-4111-8111-111111111111'),
  'with no setting at all, inspection is off and a clean room is ready');

select throws_ok(
  $$ insert into public.housekeeping_settings (organization_id, inspect_after_cleaning)
     values ('9a111111-1111-4111-8111-111111111111', null) $$,
  '23514', null,
  'an Organization default says on or off; only an override may say "use the default"');

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema='public' and table_name='housekeeping_settings'
       and grantee='ranza_app' and privilege_type='INSERT'$$,
  array['organization_id', 'property_id', 'inspect_after_cleaning'],
  'an insert names whose setting it is and its value');

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema='public' and table_name='housekeeping_settings'
       and grantee='ranza_app' and privilege_type='UPDATE'$$,
  array['inspect_after_cleaning'],
  'an update changes the value and nothing else; the time is stamped');

-- ---------------------------------------------------------------------------
-- The gate
-- ---------------------------------------------------------------------------

set local role ranza_app;

-- Before any default exists, the manager reaching one Property tries to create
-- it: the insert policy, not the update policy, is what must refuse.
select app.set_request_context('92222222-2222-4222-8222-222222222222');

select throws_ok(
  $$ insert into public.housekeeping_settings (organization_id, inspect_after_cleaning)
     values ('9a111111-1111-4111-8111-111111111111', true) $$,
  '42501', null,
  'HK-S3-05: creating the default needs reach to every Property it governs');

-- The manager reaching everything sets the default on.
select app.set_request_context('91111111-1111-4111-8111-111111111111');

select lives_ok(
  $$ insert into public.housekeeping_settings (organization_id, inspect_after_cleaning)
     values ('9a111111-1111-4111-8111-111111111111', true) $$,
  'a manager reaching every Property sets the Organization default');

select ok(not app.unit_is_ready('9c111111-1111-4111-8111-111111111111'),
  'HK-S3-01: with inspection on, a clean room is not ready');

select ok(app.unit_is_ready('9c222222-2222-4222-8222-222222222222'),
  'HK-S3-01: and an inspected one is');

select ok(not app.unit_is_ready('9c444444-4444-4444-8444-444444444444'),
  'HK-S3-11: a room never marked is clean, and so waits for an inspection too');

select throws_ok(
  $$ update public.housekeeping_settings set updated_at = now() - interval '1 day'
      where organization_id = '9a111111-1111-4111-8111-111111111111' $$,
  '42501', null,
  'naming when a setting changed is refused');

select throws_ok(
  $$ update public.housekeeping_settings
        set property_id = '9b222222-2222-4222-8222-222222222222'
      where organization_id = '9a111111-1111-4111-8111-111111111111' $$,
  '42501', null,
  'a setting cannot be moved to another Property or Organization');

-- The manager reaching one Property.
select app.set_request_context('92222222-2222-4222-8222-222222222222');

select results_eq(
  $$ with changed as (
       update public.housekeeping_settings set inspect_after_cleaning = false
        where organization_id = '9a111111-1111-4111-8111-111111111111'
          and property_id is null
       returning 1)
     select count(*)::int from changed $$,
  $$ values (0) $$,
  'HK-S3-05: the default needs reach to every Property it governs');

select lives_ok(
  $$ insert into public.housekeeping_settings
       (organization_id, property_id, inspect_after_cleaning)
     values ('9a111111-1111-4111-8111-111111111111',
             '9b111111-1111-4111-8111-111111111111', false) $$,
  'HK-S3-05: and they may override the Property they reach');

select ok(app.unit_is_ready('9c111111-1111-4111-8111-111111111111'),
  'HK-S3-02: the override wins over the default');

select throws_ok(
  $$ insert into public.housekeeping_settings
       (organization_id, property_id, inspect_after_cleaning)
     values ('9a111111-1111-4111-8111-111111111111',
             '9b222222-2222-4222-8222-222222222222', false) $$,
  '42501', null,
  'HK-S3-05: but not a Property they do not reach');

-- The front desk, who reaches both and does not configure.
select app.set_request_context('93333333-3333-4333-8333-333333333333');

select throws_ok(
  $$ insert into public.housekeeping_settings
       (organization_id, property_id, inspect_after_cleaning)
     values ('9a111111-1111-4111-8111-111111111111',
             '9b222222-2222-4222-8222-222222222222', false) $$,
  '42501', null,
  'HK-S3-07: changing it needs accommodation.configure');

-- Back to the manager reaching everything: an override that says "use the
-- default" at the second Property.
select app.set_request_context('91111111-1111-4111-8111-111111111111');

select lives_ok(
  $$ insert into public.housekeeping_settings
       (organization_id, property_id, inspect_after_cleaning)
     values ('9a111111-1111-4111-8111-111111111111',
             '9b222222-2222-4222-8222-222222222222', null) $$,
  'an override may be "use the default"');

select ok(not app.unit_is_ready('9c333333-3333-4333-8333-333333333333'),
  'HK-S3-03: and then the default applies');

select throws_ok(
  $$ delete from public.housekeeping_settings $$,
  '42501', null,
  'a setting is reset, never removed');

-- Another Organization reads none of it.
select app.set_request_context('94444444-4444-4444-8444-444444444444');

select is_empty(
  $$ select 1 from public.housekeeping_settings
      where organization_id = '9a111111-1111-4111-8111-111111111111' $$,
  'another Organization''s settings are not visible');

-- ---------------------------------------------------------------------------
-- The meaning
-- ---------------------------------------------------------------------------

set local role none;

select throws_ok(
  $$ insert into public.housekeeping_settings (organization_id, inspect_after_cleaning)
     values ('9a111111-1111-4111-8111-111111111111', false) $$,
  '23505', null,
  'HK-S3-04: one default per Organization, even for a role no policy binds');

select results_eq(
  $$ select status from public.housekeeping_unit_status
      where organization_id = '9a111111-1111-4111-8111-111111111111'
      order by accommodation_unit_id $$,
  $$ values ('clean'::text), ('inspected'), ('clean') $$,
  'HK-S3-06: switching inspection on and overriding it rewrote no status');

reset role;
select finish();
rollback;
