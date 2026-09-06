begin;
select no_plan();
select ok(not has_table_privilege('anon','public.announcement_revisions','select'),'Anonymous cannot read announcements');
select ok(not has_table_privilege('authenticated','public.announcement_acknowledgements','insert'),'Acknowledgment only through explicit authorized RPC');
insert into auth.users(id,email) values
('b1000000-0000-4000-8000-000000000001','announcement-owner@test.invalid'),
('b1000000-0000-4000-8000-000000000002','announcement-student@test.invalid'),
('b1000000-0000-4000-8000-000000000003','announcement-other@test.invalid');
insert into public.operators(id,name,status) values
('b2000000-0000-4000-8000-000000000001','Announcements','active'),
('b2000000-0000-4000-8000-000000000002','Other Operator','active');
insert into public.branches(id,operator_id,name,residence_classification) values
('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','Target','mixed'),
('b3000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002','Other','mixed');
insert into public.operator_memberships(operator_id,auth_user_id,role,access_scope) values
('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','owner','operator_wide');
insert into public.operator_entitlements(operator_id,capability_key,catalog_version,allowed_modes) values
('b2000000-0000-4000-8000-000000000001','announcements',1,array['standard']);
insert into public.students(id,operator_id,auth_user_id,display_name) values
('b4000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002','Student One'),
('b4000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000003','Student Other');
insert into public.student_branch_history(operator_id,student_id,branch_id) values
('b2000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001'),
('b2000000-0000-4000-8000-000000000002','b4000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000002');
insert into private.student_credentials(student_id,auth_user_id,auth_identifier,activation_hash,activation_expires_at,activated_at)
select id,auth_user_id,auth_user_id::text||'@students.ranza.invalid','scrypt-v1$'||repeat('a',32)||'$'||repeat('b',64),now()+interval '1 day',now()-interval '1 hour' from public.students where id in ('b4000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000002');
insert into auth.sessions(id,user_id,created_at,updated_at) values
('b5000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002',clock_timestamp(),clock_timestamp()),
('b5000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000003',clock_timestamp(),clock_timestamp());
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.save_announcement_draft('b2000000-0000-4000-8000-000000000001',null,'branches',array['b3000000-0000-4000-8000-000000000002'::uuid],'tr','Hello','{}')$$,'42501','Announcement access denied','Cross-Operator target is denied');
select set_config('test.announcement',public.save_announcement_draft('b2000000-0000-4000-8000-000000000001',null,'branches',array['b3000000-0000-4000-8000-000000000001'::uuid],'tr','Kaynak','{"en":"English"}')::text,true);
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"b5000000-0000-4000-8000-000000000001"}',true);
select is(public.student_announcement_feed(),'[]'::jsonb,'Draft does not enter Student feed');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('test.revision',public.publish_announcement(current_setting('test.announcement')::uuid)::text,true);
select is((select count(*) from public.announcement_recipients),1::bigint,'Only target Student resolved');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"b5000000-0000-4000-8000-000000000001"}',true);
select is(jsonb_array_length(public.student_announcement_feed()),1,'Target reads publication');
select is((select count(*) from public.announcement_acknowledgements),0::bigint,'Reading does not acknowledge');
select lives_ok($$select public.acknowledge_announcement(current_setting('test.revision')::uuid)$$,'Explicit action acknowledges');
select lives_ok($$select public.acknowledge_announcement(current_setting('test.revision')::uuid)$$,'Repeated action is idempotent');
select is((select count(*) from public.announcement_acknowledgements),1::bigint,'Duplicate action retains one acknowledgment');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated","session_id":"b5000000-0000-4000-8000-000000000002"}',true);
select is((select count(*) from public.announcement_revisions where id=current_setting('test.revision')::uuid),0::bigint,'Copied revision ID denied to other Operator');
select throws_ok($$select public.acknowledge_announcement(current_setting('test.revision')::uuid)$$,'42501','Acknowledgment denied','Untargeted Student cannot acknowledge');
reset role;
update public.students set status='inactive' where id='b4000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select inactive from public.announcement_followup_counts where revision_id=current_setting('test.revision')::uuid),1::bigint,'Inactive recipients counted separately');
select lives_ok($$select public.archive_announcement(current_setting('test.announcement')::uuid)$$,'Staff archive publication');
select is((select count(*) from public.audit_events where action in ('announcement.published','announcement.archived')),2::bigint,'Publication and archive audited');
select * from finish();
rollback;
