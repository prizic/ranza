begin;

select plan(19);

select has_table('public', 'profiles', 'Staff profiles are migrated');
select has_table('public', 'operator_memberships', 'Operator memberships are migrated');
select has_table('public', 'branch_assignments', 'Branch assignments are migrated');
select has_view('public', 'staff_branch_access', 'Effective Branch access is exposed safely');
select row_security_active('public', 'profiles', 'Profile RLS is enabled');
select row_security_active('public', 'operator_memberships', 'Membership RLS is enabled');
select row_security_active('public', 'branch_assignments', 'Assignment RLS is enabled');
select ok(
  not has_table_privilege('anon', 'public.operator_memberships', 'select,insert,update,delete'),
  'anonymous users have no staff membership privileges'
);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@north.test', ''),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager@north.test', ''),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff@north.test', ''),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'revoked@north.test', ''),
  ('10000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@south.test', '');

insert into public.profiles (id, display_name, preferred_locale)
values
  ('10000000-0000-4000-8000-000000000001', 'North Owner', 'tr'),
  ('10000000-0000-4000-8000-000000000002', 'North Manager', 'en'),
  ('10000000-0000-4000-8000-000000000003', 'North Staff', 'ar'),
  ('10000000-0000-4000-8000-000000000004', 'Revoked Staff', 'tr'),
  ('10000000-0000-4000-8000-000000000005', 'South Owner', 'tr');

insert into public.operators (id, name, status)
values
  ('20000000-0000-4000-8000-000000000001', 'North Operator', 'active'),
  ('20000000-0000-4000-8000-000000000002', 'South Operator', 'active');

insert into public.branches (id, operator_id, name, residence_classification)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'North Women', 'female'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'North Men', 'male'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'South Women', 'female');

insert into public.operator_memberships (id, operator_id, auth_user_id, role, access_scope)
values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner', 'operator_wide'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'manager', 'assigned_branches'),
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'branch_staff', 'assigned_branches'),
  ('40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'branch_staff', 'assigned_branches'),
  ('40000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000005', 'owner', 'operator_wide');

insert into public.branch_assignments (operator_id, membership_id, branch_id, role)
values
  ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'manager'),
  ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000002', 'staff'),
  ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001', 'staff');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$ select name from public.branches order by name $$,
  array['North Men'::text, 'North Women'::text],
  'an Owner reads every active Branch in their Operator'
);
select results_eq(
  $$ select capability from public.staff_branch_access where branch_id = '30000000-0000-4000-8000-000000000002' and capability = 'staff.manage' $$,
  array['staff.manage'::text],
  'an Owner resolves the staff-management capability'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select results_eq(
  $$ select name from public.branches $$,
  array['North Women'::text],
  'an assigned Manager reads only the assigned Branch'
);
select results_eq(
  $$ select capability from public.staff_branch_access where capability = 'roster.manage' $$,
  array['roster.manage'::text],
  'an assigned Manager resolves management capability for that Branch'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select results_eq(
  $$ select name from public.branches $$,
  array['North Men'::text],
  'Branch Staff reads only their assigned Branch'
);
select results_eq(
  $$ select count(*)::bigint from public.branches where operator_id = '20000000-0000-4000-8000-000000000002' $$,
  array[0::bigint],
  'cross-Operator copied URLs resolve no Branch rows'
);
select results_eq(
  $$ select count(*)::bigint from public.branches where id = '30000000-0000-4000-8000-000000000001' $$,
  array[0::bigint],
  'cross-Branch copied URLs resolve no Branch rows'
);

reset role;
update public.operator_memberships
set status = 'revoked'
where id = '40000000-0000-4000-8000-000000000004';
select results_eq(
  $$ select count(*)::bigint from private.session_revocation_requests where auth_user_id = '10000000-0000-4000-8000-000000000004' $$,
  array[1::bigint],
  'revoking a membership queues global session revocation'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select results_eq(
  $$ select count(*)::bigint from public.branches $$,
  array[0::bigint],
  'a revoked staff membership immediately loses data access'
);
select results_eq(
  $$ select count(*)::bigint from public.operator_memberships $$,
  array[1::bigint],
  'revoked staff can inspect only their own inactive membership'
);

set local role anon;
select throws_ok(
  $$ select * from public.staff_branch_access $$,
  '42501',
  null,
  'anonymous users cannot inspect staff access'
);

select * from finish();
rollback;
