begin;

select plan(33);

select has_table('public', 'rooms', 'Rooms are migrated');
select has_table('public', 'beds', 'Beds are migrated');
select has_table('public', 'subscriptions', 'Subscriptions are migrated');
select has_table('public', 'subscription_billing_periods', 'Billing periods are migrated');
select has_view('public', 'branch_capacity_summary', 'Branch capacity summary is exposed');
select has_view('public', 'operator_capacity_summary', 'Operator capacity summary is exposed');
select row_security_active('public', 'rooms', 'Room RLS is enabled');
select row_security_active('public', 'beds', 'Bed RLS is enabled');
select row_security_active('public', 'subscriptions', 'Subscription RLS is enabled');
select row_security_active('public', 'subscription_billing_periods', 'Billing-period RLS is enabled');
select ok(
  not has_table_privilege('anon', 'public.rooms', 'select,insert,update,delete'),
  'anonymous users have no room privileges'
);
select ok(
  not has_table_privilege('authenticated', 'public.subscription_billing_periods', 'update,delete'),
  'authenticated users cannot update or delete billing snapshots'
);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
values
  ('11000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@capacity.test', ''),
  ('11000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager@capacity.test', ''),
  ('11000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff@capacity.test', ''),
  ('11000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@other.test', ''),
  ('11000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@capacity.test', '');

insert into public.profiles (id, display_name)
values
  ('11000000-0000-4000-8000-000000000001', 'Capacity Owner'),
  ('11000000-0000-4000-8000-000000000002', 'Capacity Manager'),
  ('11000000-0000-4000-8000-000000000003', 'Capacity Staff'),
  ('11000000-0000-4000-8000-000000000004', 'Other Owner');

insert into private.platform_memberships (auth_user_id, role)
values ('11000000-0000-4000-8000-000000000005', 'platform_admin');

insert into auth.sessions (id, user_id, created_at, updated_at)
values (
  '15000000-0000-4000-8000-000000000005',
  '11000000-0000-4000-8000-000000000005',
  now(),
  now()
);

insert into public.operators (id, name, status)
values
  ('21000000-0000-4000-8000-000000000001', 'Capacity Operator', 'active'),
  ('21000000-0000-4000-8000-000000000002', 'Other Capacity Operator', 'active');

insert into public.branches (id, operator_id, name, residence_classification)
values
  ('31000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Women Residence', 'female'),
  ('31000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000001', 'Men Residence', 'male'),
  ('31000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000002', 'Other Residence', 'mixed');

insert into public.operator_memberships (id, operator_id, auth_user_id, role, access_scope)
values
  ('41000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'owner', 'operator_wide'),
  ('41000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002', 'manager', 'assigned_branches'),
  ('41000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000003', 'branch_staff', 'assigned_branches'),
  ('41000000-0000-4000-8000-000000000004', '21000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000004', 'owner', 'operator_wide');

insert into public.branch_assignments (operator_id, membership_id, branch_id, role)
values
  ('21000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000001', 'manager'),
  ('21000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000003', '31000000-0000-4000-8000-000000000001', 'staff');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into public.rooms (id, operator_id, branch_id, label)
values
  ('51000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', ' A-101 '),
  ('51000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000002', 'B-201');

insert into public.beds (id, operator_id, branch_id, room_id, label, available)
values
  ('61000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', '1', true),
  ('61000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', '2', true),
  ('61000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000002', '1', false);

select results_eq(
  $$ select label from public.rooms where id = '51000000-0000-4000-8000-000000000001' $$,
  array['A-101'::text],
  'room labels are normalized'
);
select throws_ok(
  $$ insert into public.rooms (operator_id, branch_id, label) values ('21000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'a-101') $$,
  '23505', null, 'active room labels are unique within a Branch'
);
select throws_ok(
  $$ insert into public.beds (operator_id, branch_id, room_id, label) values ('21000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000003', '51000000-0000-4000-8000-000000000001', 'cross-tenant') $$,
  '23503', null, 'composite constraints deny cross-Operator room references'
);
select results_eq(
  $$ select billable_beds from public.operator_capacity_summary where operator_id = '21000000-0000-4000-8000-000000000001' $$,
  array[2],
  'available beds count whether occupied or vacant'
);

select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.rooms (operator_id, branch_id, label) values ('21000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'staff-room') $$,
  '42501', null, 'Branch Staff cannot mutate capacity'
);
select results_eq(
  $$ select count(*)::bigint from public.rooms where branch_id = '31000000-0000-4000-8000-000000000002' $$,
  array[0::bigint],
  'Branch Staff cannot read an unassigned Branch'
);

select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
update public.beds set available = false where id = '61000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select billable_beds from public.branch_capacity_summary where branch_id = '31000000-0000-4000-8000-000000000001' $$,
  array[1],
  'an assigned Manager can edit capacity in their Branch'
);
select results_eq(
  $$ update public.beds set available = true where id = '61000000-0000-4000-8000-000000000003' returning id $$,
  array[]::uuid[],
  'an assigned Manager cannot edit another Branch'
);

select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
update public.beds set available = true where id = '61000000-0000-4000-8000-000000000002';
reset role;
update public.branches set status = 'archived' where id = '31000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$ select billable_beds from public.operator_capacity_summary where operator_id = '21000000-0000-4000-8000-000000000001' $$,
  array[2],
  'archived Branch beds do not count as Billable Beds'
);
update public.rooms set status = 'archived' where id = '51000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select count(*)::bigint from public.beds where room_id = '51000000-0000-4000-8000-000000000001' and status = 'active' $$,
  array[0::bigint],
  'archiving a room archives its beds'
);
select results_eq(
  $$ select count(*)::bigint from public.audit_events where action in ('rooms.insert', 'rooms.update', 'beds.insert', 'beds.update') $$,
  array[10::bigint],
  'capacity changes are audited'
);

select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal2","session_id":"15000000-0000-4000-8000-000000000005"}', true);
insert into public.subscriptions (
  id, operator_id, status, starts_on, pricing_reference
) values (
  '71000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'active', '2026-09-01', 'FOUNDING-2026'
);
select throws_ok(
  $$ insert into public.subscriptions (operator_id, starts_on, pricing_reference) values ('21000000-0000-4000-8000-000000000001', '2026-10-01', 'DUPLICATE') $$,
  '23505', null, 'an Operator has at most one current Subscription'
);

insert into public.subscription_billing_periods (
  id, operator_id, subscription_id, period_start, period_end,
  billable_beds_snapshot, branch_breakdown, external_invoice_reference
) values (
  '81000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  '2026-09-01', '2026-09-30', 2,
  '[{"branchId":"31000000-0000-4000-8000-000000000001","branchName":"Women Residence","billableBeds":2},{"branchId":"31000000-0000-4000-8000-000000000002","branchName":"Men Residence","billableBeds":0}]',
  'EXT-INV-001'
);
select throws_ok(
  $$ insert into public.subscription_billing_periods (operator_id, subscription_id, period_start, period_end, billable_beds_snapshot, branch_breakdown, external_invoice_reference) values ('21000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', '2026-10-01', '2026-10-31', 9, '[{"branchId":"31000000-0000-4000-8000-000000000001","branchName":"Women Residence","billableBeds":2}]', 'EXT-INV-BAD') $$,
  '23514', null, 'snapshot total must match the Branch breakdown'
);
select throws_ok(
  $$ update public.subscription_billing_periods set billable_beds_snapshot = 99 where id = '81000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'billing snapshots cannot be updated through authenticated grants'
);
select throws_ok(
  $$ delete from public.subscription_billing_periods where id = '81000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'billing snapshots cannot be deleted through authenticated grants'
);

reset role;
select throws_ok(
  $$ update public.subscription_billing_periods set billable_beds_snapshot = 99 where id = '81000000-0000-4000-8000-000000000001' $$,
  '55000', 'billing period snapshots are immutable', 'snapshot trigger also prevents privileged mutation'
);
select results_eq(
  $$ select billable_beds_snapshot from public.subscription_billing_periods where id = '81000000-0000-4000-8000-000000000001' $$,
  array[2],
  'the stored billing snapshot remains unchanged after live capacity changes'
);
select results_eq(
  $$ select count(*)::bigint from public.audit_events where target_id in ('71000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001') $$,
  array[2::bigint],
  'Subscription and billing-period creation are audited'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select results_eq(
  $$ select count(*)::bigint from public.subscriptions where operator_id = '21000000-0000-4000-8000-000000000001' $$,
  array[0::bigint],
  'another Operator Owner cannot read the Subscription'
);
select results_eq(
  $$ select count(*)::bigint from public.subscription_billing_periods where operator_id = '21000000-0000-4000-8000-000000000001' $$,
  array[0::bigint],
  'another Operator Owner cannot read billing periods'
);

set local role anon;
select throws_ok(
  $$ select * from public.operator_capacity_summary $$,
  '42501', null, 'anonymous users cannot read capacity summaries'
);

select * from finish();
rollback;
