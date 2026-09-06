begin;
select plan(20);
select has_table('public','operator_data_exports','asynchronous Operator exports are migrated');
select has_table('public','operator_lifecycle_policies','approved lifecycle policies are explicit');
select has_table('public','operator_data_lifecycle','Operator retention state is explicit');
select has_table('public','operator_lifecycle_runs','destructive lifecycle runs are durable');
select row_security_active('public','operator_data_exports','Operator export RLS is enabled');
select ok(not has_table_privilege('anon','public.operator_data_exports','select,insert,update,delete'),'anonymous users cannot access exports');
select results_eq($$select public from storage.buckets where id='operator-exports'$$,array[false],'Operator archive bucket is private');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password) values
('14000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin1@lifecycle.test',''),
('14000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin2@lifecycle.test',''),
('14000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','outsider@lifecycle.test','');
insert into private.platform_memberships(auth_user_id,role,status) values
('14000000-0000-4000-8000-000000000001','platform_admin','active'),
('14000000-0000-4000-8000-000000000002','platform_admin','active');
insert into auth.sessions(id,user_id,created_at,updated_at) values
('15000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001',now(),now()),
('15000000-0000-4000-8000-000000000002','14000000-0000-4000-8000-000000000002',now(),now());
insert into public.operators(id,name,status) values
('24000000-0000-4000-8000-000000000001','Lifecycle Operator','active'),
('24000000-0000-4000-8000-000000000002','Other Operator','active');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"14000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.request_operator_export('24000000-0000-4000-8000-000000000001')$$,'42501','Operator export denied','non-platform caller cannot request an export');

select set_config('request.jwt.claims','{"sub":"14000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"15000000-0000-4000-8000-000000000001"}',true);
select lives_ok($$select public.request_operator_export('24000000-0000-4000-8000-000000000001')$$,'Platform Admin queues a scoped full export');
select results_eq($$select status from public.operator_data_exports$$,array['queued'::text],'new full export is asynchronous');
select results_eq($$select encryption_mode from public.operator_data_exports$$,array['platform_managed_at_rest'::text],'archive declares at-rest encryption');

select set_config('request.jwt.claims','{"sub":"14000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2","session_id":"15000000-0000-4000-8000-000000000002"}',true);
select results_eq($$select count(*)::bigint from public.operator_data_exports$$,array[0::bigint],'another Platform Admin cannot read the requesters export identifier');

select set_config('request.jwt.claims','{"sub":"14000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"15000000-0000-4000-8000-000000000001"}',true);
select lives_ok($$select public.approve_operator_lifecycle_policy('24000000-0000-4000-8000-000000000001',30,365,2555,24)$$,'approved configurable retention policy is recorded');
update public.operators set status='archived' where id='24000000-0000-4000-8000-000000000001';
select results_eq($$select state from public.operator_data_lifecycle where operator_id='24000000-0000-4000-8000-000000000001'$$,array['retained'::text],'archive moves data into an explicit retained lifecycle');
select lives_ok($$select public.plan_operator_lifecycle('24000000-0000-4000-8000-000000000001','anonymize')$$,'destructive operation first creates a dry-run manifest');
select results_eq($$select is_dry_run from public.operator_lifecycle_runs$$,array[true],'planned run cannot execute destructively');
select lives_ok($$select public.execute_operator_lifecycle((select id from public.operator_lifecycle_runs),'24000000-0000-4000-8000-000000000001','lifecycle-execution-001')$$,'authorized execution queues the exact dry-run target');
select results_eq($$select state from public.operator_data_lifecycle where operator_id='24000000-0000-4000-8000-000000000001'$$,array['anonymization_scheduled'::text],'approved execution has an explicit scheduled state');
select throws_ok($$select public.execute_operator_lifecycle((select id from public.operator_lifecycle_runs),'24000000-0000-4000-8000-000000000002','lifecycle-execution-002')$$,'42501','Lifecycle execution denied','manipulated Operator target is denied');
select ok((select count(*)>=4 from public.audit_events where operator_id='24000000-0000-4000-8000-000000000001' and action like 'operator_%'),'export, policy, dry run, and execution decisions are audited');
select * from finish();
rollback;
