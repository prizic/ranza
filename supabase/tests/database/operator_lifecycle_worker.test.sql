begin;
select plan(27);
select has_function('public','process_operator_lifecycle_run',array['uuid','text'],'lifecycle worker RPC exists');
select ok(not has_function_privilege('anon','public.process_operator_lifecycle_run(uuid,text)','execute'),'anonymous callers cannot execute lifecycle work');
select ok(not has_function_privilege('authenticated','public.process_operator_lifecycle_run(uuid,text)','execute'),'customer and Platform sessions cannot execute lifecycle work');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password) values
('15000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','worker-admin@ranza.invalid',''),
('15000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','student@example.test','');
insert into private.platform_memberships(auth_user_id,role,status)
values('15000000-0000-4000-8000-000000000001','platform_admin','active');
insert into public.operators(id,name,status) values
('25000000-0000-4000-8000-000000000001','Lifecycle Success Operator','active'),
('25000000-0000-4000-8000-000000000002','Lifecycle Retry Operator','active');
insert into public.branches(id,operator_id,name,residence_classification) values
('35000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000001','Lifecycle Branch','mixed');
insert into public.students(id,operator_id,access_id,auth_user_id,display_name) values
('45000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000001','lifecycle-student','15000000-0000-4000-8000-000000000002','Named Student');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"15000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.approve_operator_lifecycle_policy('25000000-0000-4000-8000-000000000001',1,1,1,24)$$,'success Operator receives an approved policy');
update public.operators set status='archived' where id='25000000-0000-4000-8000-000000000001';
select lives_ok($$select public.plan_operator_lifecycle('25000000-0000-4000-8000-000000000001','anonymize')$$,'anonymization dry run is created');
select lives_ok($$select public.execute_operator_lifecycle((select id from public.operator_lifecycle_runs where operator_id='25000000-0000-4000-8000-000000000001'),'25000000-0000-4000-8000-000000000001','worker-anonymize-001')$$,'anonymization is explicitly queued');
reset role;
update public.operator_data_lifecycle set anonymize_after=clock_timestamp()-interval '1 second' where operator_id='25000000-0000-4000-8000-000000000001';
set local role service_role;
select results_eq($$select run_status from public.process_operator_lifecycle_run((select id from public.operator_lifecycle_runs where idempotency_key='worker-anonymize-001'),'worker-test-anonymize-001')$$,array['succeeded'::text],'due anonymization executes');
reset role;
select results_eq($$select status from public.students where id='45000000-0000-4000-8000-000000000001'$$,array['inactive'::text],'anonymized Student is inactive');
select ok((select display_name like 'Anonymized Student %' and access_id like 'anon-%' and auth_user_id is null from public.students where id='45000000-0000-4000-8000-000000000001'),'Student identity is replaced by a stable tombstone');
select results_eq($$select email from auth.users where id='15000000-0000-4000-8000-000000000002'$$,array['15000000-0000-4000-8000-000000000002@anonymized.ranza.invalid'::text],'linked Auth identity is anonymized');
select results_eq($$select state from public.operator_data_lifecycle where operator_id='25000000-0000-4000-8000-000000000001'$$,array['anonymized'::text],'Operator data lifecycle records anonymization');
select results_eq($$select status||':'||attempt_count from public.operator_lifecycle_runs where idempotency_key='worker-anonymize-001'$$,array['succeeded:1'::text],'successful run records exactly one attempt');
set local role service_role;
select results_eq($$select claimed from public.process_operator_lifecycle_run((select id from public.operator_lifecycle_runs where idempotency_key='worker-anonymize-001'),'worker-test-anonymize-002')$$,array[false],'successful run is idempotent and cannot be claimed again');
reset role;
select results_eq($$select count(*)::bigint from public.audit_events where action='operator_lifecycle.anonymize_completed'$$,array[1::bigint],'anonymization completion is audited once');

set local role authenticated;
select lives_ok($$select public.plan_operator_lifecycle('25000000-0000-4000-8000-000000000001','delete')$$,'deletion dry run is created after anonymization');
select lives_ok($$select public.execute_operator_lifecycle((select id from public.operator_lifecycle_runs where operator_id='25000000-0000-4000-8000-000000000001' and action='delete'),'25000000-0000-4000-8000-000000000001','worker-delete-001')$$,'deletion is explicitly queued');
reset role;
update public.operator_data_lifecycle set delete_after=clock_timestamp()-interval '1 second' where operator_id='25000000-0000-4000-8000-000000000001';
set local role service_role;
select results_eq($$select run_status from public.process_operator_lifecycle_run((select id from public.operator_lifecycle_runs where idempotency_key='worker-delete-001'),'worker-test-delete-001')$$,array['succeeded'::text],'due logical deletion executes after anonymization');
reset role;
select results_eq($$select state from public.operator_data_lifecycle where operator_id='25000000-0000-4000-8000-000000000001'$$,array['deleted'::text],'referential tombstone reaches explicit deleted state');

set local role authenticated;
select lives_ok($$select public.approve_operator_lifecycle_policy('25000000-0000-4000-8000-000000000002',1,1,1,24)$$,'retry Operator receives an approved policy');
update public.operators set status='archived' where id='25000000-0000-4000-8000-000000000002';
select lives_ok($$select public.plan_operator_lifecycle('25000000-0000-4000-8000-000000000002','anonymize')$$,'retry dry run is created');
select lives_ok($$select public.execute_operator_lifecycle((select id from public.operator_lifecycle_runs where operator_id='25000000-0000-4000-8000-000000000002'),'25000000-0000-4000-8000-000000000002','worker-retry-001')$$,'retry run is queued');
reset role;
set local role service_role;
select results_eq($$select run_status from public.process_operator_lifecycle_run((select id from public.operator_lifecycle_runs where idempotency_key='worker-retry-001'),'worker-test-retry-001')$$,array['failed'::text],'not-yet-due run fails safely');
reset role;update public.operator_lifecycle_runs set next_attempt_at=clock_timestamp()-interval '1 second' where idempotency_key='worker-retry-001';set local role service_role;
select results_eq($$select run_status from public.process_operator_lifecycle_run((select id from public.operator_lifecycle_runs where idempotency_key='worker-retry-001'),'worker-test-retry-002')$$,array['failed'::text],'failed run retries with a second persisted attempt');
reset role;update public.operator_lifecycle_runs set next_attempt_at=clock_timestamp()-interval '1 second' where idempotency_key='worker-retry-001';set local role service_role;
select results_eq($$select run_status from public.process_operator_lifecycle_run((select id from public.operator_lifecycle_runs where idempotency_key='worker-retry-001'),'worker-test-retry-003')$$,array['exhausted'::text],'third failure exhausts retries');
reset role;
select results_eq($$select status||':'||attempt_count from public.operator_lifecycle_runs where idempotency_key='worker-retry-001'$$,array['exhausted:3'::text],'exhausted run preserves its full attempt count');
select results_eq($$select count(*)::bigint from public.audit_events where action='operator_lifecycle.execution_failed' and operator_id='25000000-0000-4000-8000-000000000002'$$,array[3::bigint],'every failed attempt has a redacted audit event');
select results_eq($$select result_summary->>'retryable' from public.operator_lifecycle_runs where idempotency_key='worker-retry-001'$$,array['false'::text],'exhausted result is explicitly non-retryable');
select * from finish();
rollback;
