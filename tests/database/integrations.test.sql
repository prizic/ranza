-- Integrations and Failed Operations (Blueprint 5.15, 5.16, Phase 5, INT-S1-*)
begin;
select plan(13);

insert into public.users (id, email) values
  ('71111111-1111-4111-8111-111111111111', 'int-manager@example.test'),
  ('72222222-2222-4222-8222-222222222222', 'int-viewer@example.test'),
  ('73333333-3333-4333-8333-333333333333', 'int-noperm@example.test'),
  ('74444444-4444-4444-8444-444444444444', 'int-otherprop@example.test');

insert into public.organizations (id, name, status) values
  ('7a111111-1111-4111-8111-111111111111', 'Integrations Org', 'active'),
  ('7a222222-2222-4222-8222-222222222222', 'Other Org', 'active');

insert into public.subscriptions (organization_id, status) values
  ('7a111111-1111-4111-8111-111111111111', 'active'),
  ('7a222222-2222-4222-8222-222222222222', 'active');

insert into public.entitlements (organization_id, module_key, status) values
  ('7a111111-1111-4111-8111-111111111111', 'platform_core', 'active'),
  ('7a222222-2222-4222-8222-222222222222', 'platform_core', 'active');

insert into public.properties (id, organization_id, name) values
  ('7b111111-1111-4111-8111-111111111111', '7a111111-1111-4111-8111-111111111111', 'Main Property'),
  ('7b222222-2222-4222-8222-222222222222', '7a111111-1111-4111-8111-111111111111', 'Second Property'),
  ('7b333333-3333-4333-8333-333333333333', '7a222222-2222-4222-8222-222222222222', 'Other Org Property');

insert into public.property_capabilities (property_id, organization_id, capability_key, enabled) values
  ('7b111111-1111-4111-8111-111111111111', '7a111111-1111-4111-8111-111111111111', 'integrations', true),
  ('7b222222-2222-4222-8222-222222222222', '7a111111-1111-4111-8111-111111111111', 'integrations', true),
  ('7b333333-3333-4333-8333-333333333333', '7a222222-2222-4222-8222-222222222222', 'integrations', true);

-- Roles & Memberships
insert into public.staff_roles (id, scope_id, organization_id, key, name, permissions) values
  ('7d111111-1111-4111-8111-111111111111', '7a111111-1111-4111-8111-111111111111', '7a111111-1111-4111-8111-111111111111', 'int_manager', 'Manager',
   array['integrations.manage', 'integrations.view']),
  ('7d222222-2222-4222-8222-222222222222', '7a111111-1111-4111-8111-111111111111', '7a111111-1111-4111-8111-111111111111', 'int_viewer', 'Viewer',
   array['integrations.view']),
  ('7d333333-3333-4333-8333-333333333333', '7a111111-1111-4111-8111-111111111111', '7a111111-1111-4111-8111-111111111111', 'int_noperms', 'No Perms',
   array[]::text[]);

insert into public.organization_memberships (organization_id, user_id, role, role_scope_id, access_scope) values
  ('7a111111-1111-4111-8111-111111111111', '71111111-1111-4111-8111-111111111111', 'int_manager', '7a111111-1111-4111-8111-111111111111', 'assigned_properties'),
  ('7a111111-1111-4111-8111-111111111111', '72222222-2222-4222-8222-222222222222', 'int_viewer', '7a111111-1111-4111-8111-111111111111', 'assigned_properties'),
  ('7a111111-1111-4111-8111-111111111111', '73333333-3333-4333-8333-333333333333', 'int_noperms', '7a111111-1111-4111-8111-111111111111', 'assigned_properties'),
  ('7a111111-1111-4111-8111-111111111111', '74444444-4444-4444-8444-444444444444', 'int_manager', '7a111111-1111-4111-8111-111111111111', 'assigned_properties');

insert into public.property_assignments (property_id, organization_id, user_id) values
  ('7b111111-1111-4111-8111-111111111111', '7a111111-1111-4111-8111-111111111111', '71111111-1111-4111-8111-111111111111'),
  ('7b111111-1111-4111-8111-111111111111', '7a111111-1111-4111-8111-111111111111', '72222222-2222-4222-8222-222222222222'),
  ('7b111111-1111-4111-8111-111111111111', '7a111111-1111-4111-8111-111111111111', '73333333-3333-4333-8333-333333333333'),
  ('7b222222-2222-4222-8222-222222222222', '7a111111-1111-4111-8111-111111111111', '74444444-4444-4444-8444-444444444444');

-- Switch to application role
set local role ranza_app;

-- 1. INT-S1-10: Connect an integration as Manager
select app.set_request_context('71111111-1111-4111-8111-111111111111');

insert into public.integrations (
  property_id, organization_id, key, name, category, status, last_sync_at
) values (
  '7b111111-1111-4111-8111-111111111111', '7a111111-1111-4111-8111-111111111111',
  'channel_manager', 'Channel manager', 'Distribution', 'connected', now()
);

select results_eq(
  $$ select key, name, status from public.integrations where property_id = '7b111111-1111-4111-8111-111111111111' and key = 'channel_manager' $$,
  $$ values ('channel_manager', 'Channel manager', 'connected') $$,
  'INT-S1-10: connect integration writes connected row'
);

-- 2. INT-S1-01: Viewer with integrations.view can read integrations
select app.set_request_context('72222222-2222-4222-8222-222222222222');

select results_eq(
  $$ select count(*)::int from public.integrations where property_id = '7b111111-1111-4111-8111-111111111111' $$,
  $$ values (1) $$,
  'INT-S1-01: viewer with integrations.view can read integrations at their property'
);

-- 3. INT-S1-03: User without permissions cannot read integrations
select app.set_request_context('73333333-3333-4333-8333-333333333333');

select results_eq(
  $$ select count(*)::int from public.integrations where property_id = '7b111111-1111-4111-8111-111111111111' $$,
  $$ values (0) $$,
  'INT-S1-03: user without integrations permission sees 0 rows'
);

-- 4. INT-S1-02: User assigned to Property 2 cannot see Property 1 integrations
select app.set_request_context('74444444-4444-4444-8444-444444444444');

select results_eq(
  $$ select count(*)::int from public.integrations where property_id = '7b111111-1111-4111-8111-111111111111' $$,
  $$ values (0) $$,
  'INT-S1-02: staff member assigned to another property cannot see property 1 integrations'
);

-- 5. INT-S1-04 & INT-S1-05: Record integration failure via app function
select app.set_request_context('71111111-1111-4111-8111-111111111111');

select app.record_integration_failure(
  '7b111111-1111-4111-8111-111111111111',
  'channel_manager',
  'Channel manager',
  'Push availability, rooms 305, 306, 307',
  'Rate plan not mapped',
  '{"rooms": [305, 306, 307]}'::jsonb
);

select results_eq(
  $$ select status, detail from public.integrations where property_id = '7b111111-1111-4111-8111-111111111111' and key = 'channel_manager' $$,
  $$ values ('error', 'Rate plan not mapped') $$,
  'INT-S1-04: recording failure moves integration status to error with detail'
);

select results_eq(
  $$ select operation, error, status, attempts from public.failed_operations where property_id = '7b111111-1111-4111-8111-111111111111' and status = 'failed' $$,
  $$ values ('Push availability, rooms 305, 306, 307', 'Rate plan not mapped', 'failed', 1) $$,
  'INT-S1-05: failed operation records operation, error, attempts and status'
);

-- 6. INT-S1-06 & INT-S1-07: Viewer without manage permission cannot update/resolve failed operations
select app.set_request_context('72222222-2222-4222-8222-222222222222');

select throws_ok(
  $$ select app.resolve_failed_operation((select id from public.failed_operations where property_id = '7b111111-1111-4111-8111-111111111111' limit 1)) $$,
  '42501',
  NULL,
  'INT-S1-07: viewer without integrations.manage cannot resolve failed operations'
);

select results_eq(
  $$ with upd as (
       update public.failed_operations set status = 'resolved'
        where property_id = '7b111111-1111-4111-8111-111111111111'
       returning 1
     ) select count(*)::int from upd $$,
  $$ values (0) $$,
  'INT-S1-07b: direct update by viewer touches 0 rows'
);

-- 7. INT-S1-08: Successful resolve clears failure and restores connected status
select app.set_request_context('71111111-1111-4111-8111-111111111111');

select app.resolve_failed_operation(
  (select id from public.failed_operations where property_id = '7b111111-1111-4111-8111-111111111111' limit 1)
);

select results_eq(
  $$ select count(*)::int from public.failed_operations where property_id = '7b111111-1111-4111-8111-111111111111' and status = 'failed' $$,
  $$ values (0) $$,
  'INT-S1-08a: resolving operation marks it resolved so 0 failed remain'
);

select results_eq(
  $$ select status, detail from public.integrations where property_id = '7b111111-1111-4111-8111-111111111111' and key = 'channel_manager' $$,
  $$ values ('connected', null::text) $$,
  'INT-S1-08b: resolving all failures restores integration status to connected'
);

-- 8. INT-S1-11: Hard delete is denied
select throws_ok(
  $$ delete from public.integrations where property_id = '7b111111-1111-4111-8111-111111111111' $$,
  '42501',
  NULL,
  'INT-S1-11a: hard delete on integrations is refused by grant'
);

select throws_ok(
  $$ delete from public.failed_operations where property_id = '7b111111-1111-4111-8111-111111111111' $$,
  '42501',
  NULL,
  'INT-S1-11b: hard delete on failed_operations is refused by grant'
);

-- 9. Check worker role execution of record_integration_failure
set local role ranza_worker;
select app.set_worker_context('7a111111-1111-4111-8111-111111111111', 'outbox.channel_sync');

select ok(
  app.record_integration_failure(
    '7b111111-1111-4111-8111-111111111111',
    'door_locks',
    'Door locks',
    'Issue mobile key, room 101',
    'Device gateway timeout'
  ) is not null,
  'INT-S1-04b: ranza_worker can record integration failure via security definer function'
);

rollback;
