-- A Property's operating model (ADR 0057, Proposed).
--
-- Two claims:
--
--   the setting   hotel by default, one of two values, changed by whoever may
--                 configure the Property and by nobody else.
--
--   the guard     nothing in the database decides anything by it. A policy, a
--                 function, a trigger's WHEN, a constraint or an index
--                 predicate that names the column would turn "what the screens
--                 call things" into a rule, and the dormitory into a second
--                 product. Read from the catalogue, so an absent object is no
--                 row rather than an error.
--
-- Rows in docs/features/configuration/edge-cases.csv are named beside the
-- assertion that proves them. Each break below was applied inside a rolled-back
-- transaction, the altered object printed first, and the named assertion seen
-- red:
--   a function whose body reads operating_model          CF-S4-05 functions
--   a policy whose USING names it                         CF-S4-05 policies
--   a trigger on stays WHEN it names the Property's model CF-S4-05 triggers
--   a partial index whose predicate names it              CF-S4-05 indexes
--   a check constraint on another column naming it        CF-S4-05 constraints
--   the update grant revoked                              CF-S4-02
begin;
select plan(13);

insert into public.users (id, email) values
  ('d1111111-1111-4111-8111-111111111111', 'om-manager@example.test'),
  ('d2222222-2222-4222-8222-222222222222', 'om-desk@example.test'),
  ('d3333333-3333-4333-8333-333333333333', 'om-outsider@example.test');

insert into public.organizations (id, name, status) values
  ('da111111-1111-4111-8111-111111111111', 'Modelled Organization', 'active'),
  ('da222222-2222-4222-8222-222222222222', 'Other Modelled Organization', 'active');

insert into public.properties (id, organization_id, name) values
  ('db111111-1111-4111-8111-111111111111',
   'da111111-1111-4111-8111-111111111111', 'Modelled Yurt');

insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('da111111-1111-4111-8111-111111111111',
   'd1111111-1111-4111-8111-111111111111', 'manager', 'organization_wide'),
  ('da111111-1111-4111-8111-111111111111',
   'd2222222-2222-4222-8222-222222222222', 'front_desk', 'organization_wide'),
  ('da222222-2222-4222-8222-222222222222',
   'd3333333-3333-4333-8333-333333333333', 'manager', 'organization_wide');

insert into public.subscriptions (organization_id, status) values
  ('da111111-1111-4111-8111-111111111111', 'active'),
  ('da222222-2222-4222-8222-222222222222', 'active');

insert into public.entitlements (organization_id, module_key) values
  ('da111111-1111-4111-8111-111111111111', 'platform_core'),
  ('da222222-2222-4222-8222-222222222222', 'platform_core');

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('db111111-1111-4111-8111-111111111111',
   'da111111-1111-4111-8111-111111111111', 'configuration', true);

-- ---------------------------------------------------------------------------
-- The setting
-- ---------------------------------------------------------------------------

select is(
  (select operating_model from public.properties
    where id = 'db111111-1111-4111-8111-111111111111'),
  'hotel',
  'CF-S4-01: a Property is a hotel until somebody says otherwise');

select throws_ok(
  $$ update public.properties set operating_model = 'hostel'
      where id = 'db111111-1111-4111-8111-111111111111' $$,
  '23514', null, 'CF-S4-01: a model other than hotel or dormitory is refused');

select ok(
  exists (
    select from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'properties'
       and column_name = 'operating_model'
       and grantee = 'ranza_app' and privilege_type = 'UPDATE'),
  'CF-S4-02: the runtime role may set the operating model');

-- ---------------------------------------------------------------------------
-- The guard
-- ---------------------------------------------------------------------------

select is_empty(
  $$ select schemaname || '.' || tablename || ' ' || policyname
       from pg_catalog.pg_policies
      where coalesce(qual, '') ~ 'operating_model'
         or coalesce(with_check, '') ~ 'operating_model' $$,
  'CF-S4-05 policies: no policy reads the operating model');

select is_empty(
  $$ select procedure.oid::regprocedure::text
       from pg_catalog.pg_proc as procedure
       join pg_catalog.pg_namespace as namespace
         on namespace.oid = procedure.pronamespace
      where namespace.nspname not in ('pg_catalog', 'information_schema')
        and procedure.prosrc ~ 'operating_model' $$,
  'CF-S4-05 functions: no function reads the operating model');

select is_empty(
  $$ select tgrelid::regclass::text || ' ' || tgname
       from pg_catalog.pg_trigger
      where not tgisinternal
        and pg_catalog.pg_get_triggerdef(oid) ~ 'operating_model' $$,
  'CF-S4-05 triggers: no trigger fires by the operating model');

select is_empty(
  $$ select conrelid::regclass::text || ' ' || conname
       from pg_catalog.pg_constraint
      where conname <> 'properties_operating_model_check'
        and pg_catalog.pg_get_constraintdef(oid) ~ 'operating_model' $$,
  'CF-S4-05 constraints: no constraint but its own value list names it');

select is_empty(
  $$ select schemaname || '.' || indexname
       from pg_catalog.pg_indexes
      where indexdef ~ 'operating_model' $$,
  'CF-S4-05 indexes: no index is built on or limited by the operating model');

select is_empty(
  $$ select schemaname || '.' || viewname
       from pg_catalog.pg_views
      where schemaname not in ('pg_catalog', 'information_schema')
        and definition ~ 'operating_model' $$,
  'CF-S4-05 views: no view selects by the operating model either');

-- ---------------------------------------------------------------------------
-- Who may change it
-- ---------------------------------------------------------------------------

-- Last, because these are the statements that raise rather than fail when a
-- grant is missing, and a raise aborts every assertion after it. The guard
-- above reads only the catalogue and cannot.
set local role ranza_app;

select app.set_request_context('d2222222-2222-4222-8222-222222222222');
select is_empty(
  $$ update public.properties set operating_model = 'dormitory'
      where id = 'db111111-1111-4111-8111-111111111111'
     returning id $$,
  'CF-S4-02: a front desk, without configuration.manage, changes no model');

select app.set_request_context('d3333333-3333-4333-8333-333333333333');
select is_empty(
  $$ update public.properties set operating_model = 'dormitory'
      where id = 'db111111-1111-4111-8111-111111111111'
     returning id $$,
  'CF-S4-02: a manager of another Organization changes no model');

select app.set_request_context('d1111111-1111-4111-8111-111111111111');
select results_eq(
  $$ update public.properties set operating_model = 'dormitory'
      where id = 'db111111-1111-4111-8111-111111111111'
     returning operating_model $$,
  $$ values ('dormitory') $$,
  'CF-S4-02: a manager who may configure the Property makes it a dormitory');

select results_eq(
  $$ update public.properties set operating_model = 'hotel'
      where id = 'db111111-1111-4111-8111-111111111111'
     returning operating_model $$,
  $$ values ('hotel') $$,
  'CF-S4-03: and back, with nothing else to undo');

set local role none;

select * from finish();
rollback;
