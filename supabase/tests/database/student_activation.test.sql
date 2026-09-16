begin;
select plan(19);
select has_table('private','student_credentials','Credentials live outside the Data API');
select ok(not has_table_privilege('anon','private.student_credentials','SELECT'),'Anonymous cannot read secrets');
select ok(not has_table_privilege('authenticated','private.student_credentials','SELECT'),'Authenticated cannot read secrets');
select ok(not has_function_privilege('authenticated','public.student_activation_lookup(text)','EXECUTE'),'Students cannot enumerate gateway identities');
select ok(not has_function_privilege('anon','public.claim_student_activation(uuid,text)','EXECUTE'),'Anonymous cannot consume codes directly');
select ok(has_function_privilege('service_role','public.claim_student_activation(uuid,text)','EXECUTE'),'Only gateway may consume codes');
select ok(not has_function_privilege('authenticated','public.issue_student_activation(uuid,text)','EXECUTE'),'Browser clients cannot install chosen activation verifiers');
select ok(has_function_privilege('service_role','public.issue_student_activation_service(uuid,uuid,text)','EXECUTE'),'Server gateway may install generated activation verifiers');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password) values
('91000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','activation-owner@example.test','');
insert into public.operators(id,name,status) values('92000000-0000-4000-8000-000000000001','Activation Operator','active');
insert into public.branches(id,operator_id,name,residence_classification) values
('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','Activation Branch','mixed');
insert into public.operator_memberships(operator_id,auth_user_id,role,access_scope) values
('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','owner','operator_wide');
insert into public.students(id,operator_id,access_id,display_name) values
('94000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','test-activation-id','Activation Student');
insert into public.student_branch_history(operator_id,student_id,branch_id) values
('92000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001');
set local role service_role;
select lives_ok($$select public.issue_student_activation_service('91000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','scrypt-v1$'||repeat('a',32)||'$'||repeat('b',64))$$,'Server gateway installs a generated code hash for the owner');
reset role;
select is((select count(*) from public.audit_events where action='student.credential_issued' and after_summary::text like '%scrypt%'),0::bigint,'Audit excludes code hash');
select ok(public.student_activation_lookup('test-activation-id') is not null,'Eligible Student can be found by gateway');
select is(public.student_activation_lookup('unknown-id'),null::jsonb,'Unknown credential is empty');
select is(public.claim_student_activation('94000000-0000-4000-8000-000000000001','wrong'),null::jsonb,'Mismatched hash cannot consume');
create temporary table first_activation_claim as
select public.claim_student_activation('94000000-0000-4000-8000-000000000001','scrypt-v1$'||repeat('a',32)||'$'||repeat('b',64)) as data;
select ok((select data from first_activation_claim) is not null,'Valid claim consumes once');
select is(public.claim_student_activation('94000000-0000-4000-8000-000000000001','scrypt-v1$'||repeat('a',32)||'$'||repeat('b',64)),null::jsonb,'Replay cannot claim');
update private.student_credentials set activation_claimed_at=clock_timestamp()-interval '6 minutes'
where student_id='94000000-0000-4000-8000-000000000001';
create temporary table second_activation_claim as
select public.claim_student_activation('94000000-0000-4000-8000-000000000001','scrypt-v1$'||repeat('a',32)||'$'||repeat('b',64)) as data;
select ok((select data from second_activation_claim) is not null,'An expired process claim can be reclaimed');
select isnt((select data->>'claim' from second_activation_claim),(select data->>'claim' from first_activation_claim),'Reclaiming uses a new claim token');
select is(public.finish_student_activation('94000000-0000-4000-8000-000000000001',gen_random_uuid()),false,'Wrong claim cannot bind an identity');
select public.student_credential_attempt(repeat('c',64),repeat('d',64)) from generate_series(1,10);
select is(public.student_credential_attempt(repeat('c',64),repeat('d',64)),false,'Credential burst is rate limited');
select * from finish();
rollback;
