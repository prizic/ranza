begin;

select plan(15);

select has_table('public', 'operators', 'Operators are migrated');
select has_table('public', 'branches', 'Branches are migrated');
select has_table('public', 'audit_events', 'Audit events are migrated');
select has_table('private', 'platform_memberships', 'Platform memberships stay private');
select row_security_active('public', 'operators', 'Operator RLS is enabled');
select row_security_active('public', 'branches', 'Branch RLS is enabled');
select row_security_active('public', 'audit_events', 'Audit RLS is enabled');
select ok(
  not has_table_privilege('anon', 'public.operators', 'select,insert,update,delete'),
  'anonymous users have no Operator privileges'
);
select ok(
  not has_table_privilege('anon', 'public.branches', 'select,insert,update,delete'),
  'anonymous users have no Branch privileges'
);
select ok(
  not has_table_privilege('authenticated', 'public.audit_events', 'insert,update,delete'),
  'audit events are append-only to authenticated callers'
);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@prizic.test', ''),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider@example.test', '');

insert into private.platform_memberships (auth_user_id, role, status)
values ('11111111-1111-4111-8111-111111111111', 'platform_admin', 'active');

insert into public.operators (id, name, status, default_locale, archived_at)
values (
  '33333333-3333-4333-8333-333333333333',
  'Kuzey Yurtları',
  'active',
  'tr',
  null
);

insert into public.branches (
  id, operator_id, name, status, timezone, default_locale, residence_classification
) values (
  '44444444-4444-4444-8444-444444444444',
  '33333333-3333-4333-8333-333333333333',
  'Kadın Öğrenci Yurdu',
  'active',
  'Europe/Istanbul',
  'tr',
  'female'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}',
  true
);
select results_eq(
  $$ select count(*)::bigint from public.operators $$,
  array[0::bigint],
  'a non-platform user cannot read Operators'
);
select throws_ok(
  $$ insert into public.operators (name) values ('Manipulated Operator') $$,
  '42501',
  null,
  'a non-platform user cannot create Operators'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',
  true
);
select results_eq(
  $$ select name from public.operators where id = '33333333-3333-4333-8333-333333333333' $$,
  array['Kuzey Yurtları'::text],
  'an active Platform Admin can read Operators'
);
select results_eq(
  $$ select count(*)::bigint from public.audit_events where operator_id = '33333333-3333-4333-8333-333333333333' $$,
  array[2::bigint],
  'Operator and Branch creation both create audit events'
);
select throws_ok(
  $$ delete from public.operators where id = '33333333-3333-4333-8333-333333333333' $$,
  '42501',
  null,
  'production lifecycle deletion is unavailable'
);

select * from finish();
rollback;
