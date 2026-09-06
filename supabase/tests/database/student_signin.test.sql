begin;
select no_plan();
select ok(not has_function_privilege('authenticated','public.student_signin_lookup(text)','EXECUTE'),'Identity lookup is gateway-only');
select ok(not has_function_privilege('anon','public.recover_student_credential(uuid,text)','EXECUTE'),'Anonymous cannot recover');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password) values
('a1000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reset-owner@example.test',''),
('a1000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','student@students.ranza.invalid','');
insert into public.operators(id,name,status) values('a2000000-0000-4000-8000-000000000001','Reset Operator','active');
insert into public.branches(id,operator_id,name,residence_classification) values
('a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','Reset Branch','mixed');
insert into public.operator_memberships(operator_id,auth_user_id,role,access_scope) values
('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','owner','operator_wide');
insert into public.students(id,operator_id,access_id,display_name,auth_user_id) values
('a4000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','reset-id','Reset Student','a1000000-0000-4000-8000-000000000002');
insert into public.student_branch_history(operator_id,student_id,branch_id) values
('a2000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001');
insert into private.student_credentials(student_id,auth_user_id,auth_identifier,activation_hash,activation_expires_at,activated_at) values
('a4000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','student@students.ranza.invalid','scrypt-v1$'||repeat('a',32)||'$'||repeat('b',64),now()+interval '1 day',now()-interval '1 hour');
insert into auth.sessions(id,user_id,created_at,updated_at) values
('a5000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002',now(),now());
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"a5000000-0000-4000-8000-000000000001"}',true);
select is(private.current_student_id(),'a4000000-0000-4000-8000-000000000001'::uuid,'Live session authorizes Student');
update auth.sessions set created_at=now()-interval '8 days';
select is(private.current_student_id(),null::uuid,'Session lifetime is bounded');
update auth.sessions set created_at=now();
select public.student_activation_failure('reset-id') from generate_series(1,5);
select is(public.student_signin_lookup('reset-id'),null::jsonb,'Failed PIN burst locks credential');
update private.student_credentials set locked_until=now()-interval '1 minute';
select ok(public.student_signin_lookup('reset-id') is not null,'Lock expires');
set local role authenticated;
select throws_ok($$select public.recover_student_credential('a4000000-0000-4000-8000-000000000001','scrypt-v1$'||repeat('c',32)||'$'||repeat('d',64))$$,'42501','Credential recovery denied','Students cannot recover themselves');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.recover_student_credential('a4000000-0000-4000-8000-000000000001','scrypt-v1$'||repeat('c',32)||'$'||repeat('d',64))$$,'Authorized staff issue recovery');
reset role;
select is((select auth_user_id from public.students where access_id='reset-id'),'a1000000-0000-4000-8000-000000000002'::uuid,'Recovery preserves identity');
select is((select count(*) from auth.sessions where user_id='a1000000-0000-4000-8000-000000000002'),0::bigint,'Recovery deletes active sessions');
select is(public.student_signin_lookup('reset-id'),null::jsonb,'Old PIN cannot sign in pending recovery');
select ok(public.student_activation_lookup('reset-id') is not null,'Recovery code uses existing activation exchange');
select is((select count(*) from public.audit_events where action='student.credential_reset'),1::bigint,'Recovery is audited');
select is((select count(*) from public.audit_events where action='student.credential_reset' and after_summary::text like '%scrypt%'),0::bigint,'Recovery audit has no secret');
create temporary table recovery_claim as select public.claim_student_activation('a4000000-0000-4000-8000-000000000001','scrypt-v1$'||repeat('c',32)||'$'||repeat('d',64)) as data;
select ok((select data from recovery_claim) is not null,'Recovery claims existing identity');
select is(public.claim_student_activation('a4000000-0000-4000-8000-000000000001','scrypt-v1$'||repeat('c',32)||'$'||repeat('d',64)),null::jsonb,'Recovery code cannot replay');
select ok(public.finish_student_activation('a4000000-0000-4000-8000-000000000001',(select (data->>'claim')::uuid from recovery_claim)),'Existing identity binds');
select is(public.student_signin_lookup('reset-id'),null::jsonb,'Binding alone does not enable old PIN');
select ok(public.confirm_student_pin('a4000000-0000-4000-8000-000000000001',(select (data->>'claim')::uuid from recovery_claim)),'Confirmation enables new PIN');
select ok(public.student_signin_lookup('reset-id') is not null,'Confirmed credential available');
insert into auth.sessions(id,user_id,created_at,updated_at) values
('a5000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002',clock_timestamp(),clock_timestamp());
update public.operators set status='suspended' where id='a2000000-0000-4000-8000-000000000001';
select is(public.student_signin_lookup('reset-id'),null::jsonb,'Suspended Operator denies new sign-in');
select is((select count(*) from auth.sessions where user_id='a1000000-0000-4000-8000-000000000002'),0::bigint,'Suspension revokes sessions');
update public.operators set status='active' where id='a2000000-0000-4000-8000-000000000001';
insert into auth.sessions(id,user_id,created_at,updated_at) values
('a5000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000002',clock_timestamp(),clock_timestamp());
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"a5000000-0000-4000-8000-000000000003"}',true);
select ok(public.sign_out_student_session(),'Student signs out own device');
select is(private.current_student_id(),null::uuid,'Signed-out JWT loses access immediately');
insert into auth.sessions(id,user_id,created_at,updated_at) values
('a5000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000002',clock_timestamp(),clock_timestamp());
update public.students set status='inactive' where access_id='reset-id';
select is(public.student_signin_lookup('reset-id'),null::jsonb,'Deactivated Student cannot sign in');
select is((select count(*) from auth.sessions where user_id='a1000000-0000-4000-8000-000000000002'),0::bigint,'Deactivation revokes sessions');
select * from finish();
rollback;
