-- Data Export and Scheduled Exports (Blueprint Phase 1, EXP-S1-*)
begin;
select plan(13);

insert into public.users (id, email) values
  ('81111111-1111-4111-8111-111111111111', 'export-manager@example.test'),
  ('82222222-2222-4222-8222-222222222222', 'export-viewer@example.test'),
  ('83333333-3333-4333-8333-333333333333', 'export-noperm@example.test'),
  ('84444444-4444-4444-8444-444444444444', 'export-otherorg@example.test');

insert into public.organizations (id, name, status) values
  ('8a111111-1111-4111-8111-111111111111', 'Export Org 1', 'active'),
  ('8a222222-2222-4222-8222-222222222222', 'Export Org 2', 'active');

insert into public.subscriptions (organization_id, status) values
  ('8a111111-1111-4111-8111-111111111111', 'active'),
  ('8a222222-2222-4222-8222-222222222222', 'active');

insert into public.entitlements (organization_id, module_key, status) values
  ('8a111111-1111-4111-8111-111111111111', 'platform_core', 'active'),
  ('8a222222-2222-4222-8222-222222222222', 'platform_core', 'active');

insert into public.properties (id, organization_id, name) values
  ('8b111111-1111-4111-8111-111111111111', '8a111111-1111-4111-8111-111111111111', 'Export Main Property'),
  ('8b222222-2222-4222-8222-222222222222', '8a222222-2222-4222-8222-222222222222', 'Export Org 2 Property');

-- Staff Roles & Permissions
insert into public.staff_roles (id, scope_id, organization_id, key, name, permissions) values
  ('8d111111-1111-4111-8111-111111111111', '8a111111-1111-4111-8111-111111111111', '8a111111-1111-4111-8111-111111111111', 'export_admin', 'Export Admin',
   array['data_export.read', 'data_export.create']),
  ('8d222222-2222-4222-8222-222222222222', '8a111111-1111-4111-8111-111111111111', '8a111111-1111-4111-8111-111111111111', 'export_reader', 'Export Reader',
   array['data_export.read']),
  ('8d333333-3333-4333-8333-333333333333', '8a111111-1111-4111-8111-111111111111', '8a111111-1111-4111-8111-111111111111', 'export_none', 'Export None',
   array[]::text[]);

insert into public.organization_memberships (organization_id, user_id, role, role_scope_id, access_scope) values
  ('8a111111-1111-4111-8111-111111111111', '81111111-1111-4111-8111-111111111111', 'export_admin', '8a111111-1111-4111-8111-111111111111', 'organization_wide'),
  ('8a111111-1111-4111-8111-111111111111', '82222222-2222-4222-8222-222222222222', 'export_reader', '8a111111-1111-4111-8111-111111111111', 'organization_wide'),
  ('8a111111-1111-4111-8111-111111111111', '83333333-3333-4333-8333-333333333333', 'export_none', '8a111111-1111-4111-8111-111111111111', 'organization_wide'),
  ('8a222222-2222-4222-8222-222222222222', '84444444-4444-4444-8444-444444444444', 'owner', '00000000-0000-0000-0000-000000000000', 'organization_wide');

-- Switch to application role
set local role ranza_app;

-- 1. EXP-S1-01: Manager with data_export.create creates an on-demand data_exports record
select app.set_request_context('81111111-1111-4111-8111-111111111111');

insert into public.data_exports (
  id, organization_id, requester_id, requester_name, status, resource_types, format, trigger_type
) values (
  '8e111111-1111-4111-8111-111111111111',
  '8a111111-1111-4111-8111-111111111111',
  '81111111-1111-4111-8111-111111111111',
  'Export Admin',
  'pending',
  array['residents_guests', 'reservations_stays'],
  'csv',
  'on_demand'
);

select results_eq(
  $$ select status, format, resource_types from public.data_exports where id = '8e111111-1111-4111-8111-111111111111' $$,
  $$ values ('pending', 'csv', array['residents_guests', 'reservations_stays']) $$,
  'EXP-S1-01: manager can create an on-demand export record'
);

-- 2. EXP-S1-02: Manager creates an export schedule
insert into public.export_schedules (
  id, organization_id, created_by, name, frequency, next_run_at, resource_types, format, status
) values (
  '8f111111-1111-4111-8111-111111111111',
  '8a111111-1111-4111-8111-111111111111',
  '81111111-1111-4111-8111-111111111111',
  'Weekly Finance Export',
  'weekly',
  now() - interval '1 hour',
  array['folios_payments'],
  'json',
  'active'
);

select results_eq(
  $$ select name, frequency, status, format from public.export_schedules where id = '8f111111-1111-4111-8111-111111111111' $$,
  $$ values ('Weekly Finance Export', 'weekly', 'active', 'json') $$,
  'EXP-S1-02: manager can create an export schedule'
);

-- 3. EXP-S1-03: Reader with data_export.read can read exports and schedules
select app.set_request_context('82222222-2222-4222-8222-222222222222');

select results_eq(
  $$ select count(*)::int from public.data_exports where organization_id = '8a111111-1111-4111-8111-111111111111' $$,
  $$ values (1) $$,
  'EXP-S1-03a: reader with data_export.read can see org data_exports'
);

select results_eq(
  $$ select count(*)::int from public.export_schedules where organization_id = '8a111111-1111-4111-8111-111111111111' $$,
  $$ values (1) $$,
  'EXP-S1-03b: reader with data_export.read can see org export_schedules'
);

-- 4. EXP-S1-04: User without data_export.read sees 0 rows
select app.set_request_context('83333333-3333-4333-8333-333333333333');

select results_eq(
  $$ select count(*)::int from public.data_exports where organization_id = '8a111111-1111-4111-8111-111111111111' $$,
  $$ values (0) $$,
  'EXP-S1-04a: user without permission sees 0 data_exports'
);

select results_eq(
  $$ select count(*)::int from public.export_schedules where organization_id = '8a111111-1111-4111-8111-111111111111' $$,
  $$ values (0) $$,
  'EXP-S1-04b: user without permission sees 0 export_schedules'
);

-- 5. EXP-S1-05: User from Org 2 cannot see Org 1 records
select app.set_request_context('84444444-4444-4444-8444-444444444444');

select results_eq(
  $$ select count(*)::int from public.data_exports where organization_id = '8a111111-1111-4111-8111-111111111111' $$,
  $$ values (0) $$,
  'EXP-S1-05a: tenant isolation hides other org data_exports'
);

select results_eq(
  $$ select count(*)::int from public.export_schedules where organization_id = '8a111111-1111-4111-8111-111111111111' $$,
  $$ values (0) $$,
  'EXP-S1-05b: tenant isolation hides other org export_schedules'
);

-- 6. EXP-S1-06: Direct hard DELETE is refused by grant
select app.set_request_context('81111111-1111-4111-8111-111111111111');

select throws_ok(
  $$ delete from public.data_exports where id = '8e111111-1111-4111-8111-111111111111' $$,
  '42501',
  NULL,
  'EXP-S1-06a: hard delete on data_exports is refused by grant'
);

select throws_ok(
  $$ delete from public.export_schedules where id = '8f111111-1111-4111-8111-111111111111' $$,
  '42501',
  NULL,
  'EXP-S1-06b: hard delete on export_schedules is refused by grant'
);

-- 7. EXP-S1-07: Worker role processes exports
set local role ranza_worker;

select results_eq(
  $$ select count(*)::int from app.pending_data_exports() where export_id = '8e111111-1111-4111-8111-111111111111' $$,
  $$ values (1) $$,
  'EXP-S1-07a: worker can find pending data exports via security definer'
);

select results_eq(
  $$ select count(*)::int from app.export_schedules_due() where schedule_id = '8f111111-1111-4111-8111-111111111111' $$,
  $$ values (1) $$,
  'EXP-S1-07b: worker can find due export schedules via security definer'
);

select app.set_worker_context('8a111111-1111-4111-8111-111111111111', 'data_export');

update public.data_exports set
  status = 'ready',
  file_size_bytes = 1024,
  file_name = 'export-8e111111.csv',
  completed_at = now()
where id = '8e111111-1111-4111-8111-111111111111';

select results_eq(
  $$ select status, file_name, file_size_bytes from public.data_exports where id = '8e111111-1111-4111-8111-111111111111' $$,
  $$ values ('ready', 'export-8e111111.csv', 1024::bigint) $$,
  'EXP-S1-07c: worker can update data_exports to ready'
);

rollback;
