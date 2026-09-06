begin;
select plan(25);
select has_table('public','student_balance_accounts','Balance Accounts are migrated');
select has_table('public','student_balance_entries','Balance Entries are migrated');
select has_view('public','student_balance_summary','remaining Balance view exists');
select has_view('public','branch_student_balance_summary','Branch Balance list exists');
select row_security_active('public','student_balance_accounts','Balance Account RLS is enabled');
select row_security_active('public','student_balance_entries','Balance Entry RLS is enabled');
select ok(not has_table_privilege('authenticated','public.student_balance_entries','insert,update,delete'),'entries mutate only through checked transactions');
select ok(not has_table_privilege('anon','public.student_balance_entries','select,insert,update,delete'),'anonymous users have no Balance access');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password) values
('13000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner@balance.test',''),
('13000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','student@balance.test',''),
('13000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','other@balance.test','');
insert into public.profiles(id,display_name) values ('13000000-0000-4000-8000-000000000001','Balance Owner');
insert into public.operators(id,name,status) values ('23000000-0000-4000-8000-000000000001','Balance Operator','active');
insert into public.branches(id,operator_id,name,residence_classification) values
('33000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','Balance Branch','mixed'),
('33000000-0000-4000-8000-000000000002','23000000-0000-4000-8000-000000000001','Other Branch','mixed');
insert into public.operator_memberships(id,operator_id,auth_user_id,role,access_scope) values
('43000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','owner','operator_wide');
insert into public.operator_entitlements(operator_id,capability_key,catalog_version,allowed_modes) values
('23000000-0000-4000-8000-000000000001','balance',1,array['standard']);
insert into public.students(id,operator_id,auth_user_id,display_name) values
('53000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000002','Balance Student'),
('53000000-0000-4000-8000-000000000002','23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000003','Other Student');
insert into public.student_branch_history(operator_id,student_id,branch_id) values
('23000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001'),
('23000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000002','33000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"13000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$ select public.post_balance_entry('23000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','TRY','charge',100,current_date,current_date-1,'September accommodation','balance-charge-001') $$,'finance staff post a Charge');
select lives_ok($$ select public.post_balance_entry('23000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','TRY','external_payment',-25,current_date,null,'Externally received partial payment','balance-payment-001') $$,'finance staff record a partial external payment');
select lives_ok($$ select public.post_balance_entry('23000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','TRY','credit',-5,current_date,null,'Welcome credit','balance-credit-001') $$,'finance staff post a Credit');
select lives_ok($$ select public.post_balance_entry('23000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','TRY','adjustment',-4.75,current_date,null,'Approved correction','balance-adjust-001') $$,'finance staff post a signed Adjustment');
select results_eq($$ select remaining_balance from public.student_balance_summary $$,array[65.25::numeric],'positive charges minus records and credits derive Remaining Balance');
select results_eq($$ select count(*)::bigint from public.student_balance_accounts $$,array[1::bigint],'one TRY Account is reused per Student');
select results_eq(
  $$ select public.post_balance_entry('23000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','TRY','charge',100,current_date,current_date-1,'September accommodation','balance-charge-001') $$,
  $$ select id from public.student_balance_entries where idempotency_key='balance-charge-001' $$,
  'an exact retry returns the same entry'
);
select results_eq($$ select count(*)::bigint from public.student_balance_entries $$,array[4::bigint],'an exact retry does not double-post');
select throws_ok($$ select public.post_balance_entry('23000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','TRY','charge',200,current_date,current_date-1,'Different charge','balance-charge-001') $$,'22023','Idempotency key was already used for another Balance entry','a reused key cannot change its payload');
select lives_ok($$ select public.reverse_balance_entry((select id from public.student_balance_entries where idempotency_key='balance-credit-001'),'Credit entered by mistake','balance-reversal-001') $$,'finance staff append an exact linked reversal');
select results_eq($$ select remaining_balance from public.student_balance_summary $$,array[70.25::numeric],'a reversal exactly offsets the original');
select throws_ok($$ select public.reverse_balance_entry((select id from public.student_balance_entries where idempotency_key='balance-credit-001'),'Second reversal','balance-reversal-002') $$,'23505','Balance entry already has a reversal','one original entry cannot be reversed twice');

select set_config('request.jwt.claims','{"sub":"13000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select results_eq($$ select remaining_balance from public.student_balance_summary $$,array[70.25::numeric],'a Student sees their own Remaining Balance');
select results_eq($$ select count(*)::bigint from public.student_balance_entries $$,array[5::bigint],'a Student sees only their own immutable history');
select set_config('request.jwt.claims','{"sub":"13000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select results_eq($$ select count(*)::bigint from public.student_balance_entries $$,array[0::bigint],'another Student cannot read Balance Entries');

reset role;
select throws_ok($$ update public.student_balance_entries set amount=999 $$,'55000','Balance entries are append-only','even privileged callers cannot edit posted entries');
select results_eq($$ select count(*)::bigint from public.audit_events where action in ('balance_entry.posted','balance_entry.reversed') $$,array[5::bigint],'new entries and reversals are audited once');
select * from finish();rollback;
