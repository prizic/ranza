begin;
select plan(17);
select has_table('public', 'students', 'Student identities exist');
select has_table('public', 'student_branch_history', 'Branch assignments are historical');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password) values
('71000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','roster-owner@example.test',''),
('71000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','roster-student@example.test',''),
('71000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','roster-manager@example.test','');
insert into public.operators (id,name,status) values
('72000000-0000-4000-8000-000000000001','Roster Operator','active'),
('72000000-0000-4000-8000-000000000002','Other Roster Operator','active');
insert into public.branches (id,operator_id,name,residence_classification) values
('73000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','First Branch','female'),
('73000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000001','Second Branch','male'),
('73000000-0000-4000-8000-000000000003','72000000-0000-4000-8000-000000000002','Other Branch','mixed');
insert into public.operator_memberships (id,operator_id,auth_user_id,role,access_scope) values
('74000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','owner','operator_wide'),
('74000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000003','manager','assigned_branches');
insert into public.branch_assignments(operator_id,membership_id,branch_id,role) values
('72000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000001','manager');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.manage_student_roster('create','72000000-0000-4000-8000-000000000001',null,'73000000-0000-4000-8000-000000000001','Ayşe Kaya','tr','A-1')$$,'Owner creates Student and assignment');
select is((select count(*) from public.students),1::bigint,'Owner sees roster');
select throws_ok($$select public.manage_student_roster('transfer','72000000-0000-4000-8000-000000000001',(select id from public.students where external_reference='A-1'),'73000000-0000-4000-8000-000000000003')$$,'42501','Roster access denied','Cross-Operator transfer is denied');
select is((select count(*) from public.student_branch_history where ended_at is null),1::bigint,'Rejected transfer leaves original assignment open');
select lives_ok($$select public.manage_student_roster('transfer','72000000-0000-4000-8000-000000000001',(select id from public.students where external_reference='A-1'),'73000000-0000-4000-8000-000000000002')$$,'Same-Operator transfer is atomic');
select is((select count(*) from public.student_branch_history where branch_id='73000000-0000-4000-8000-000000000001' and ended_at is not null),1::bigint,'Original Branch remains in closed history');
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from public.students),0::bigint,'Former Branch Manager cannot read current roster identity');
select is((select count(*) from public.student_branch_history),1::bigint,'Former Branch Manager sees only their historical Branch');
reset role;
select set_config('request.jwt.claims','{}',true);
update public.students set auth_user_id='71000000-0000-4000-8000-000000000002' where external_reference='A-1';
select throws_ok($$insert into public.student_branch_history(operator_id,student_id,branch_id,started_at) select operator_id,id,'73000000-0000-4000-8000-000000000001',clock_timestamp() from public.students where external_reference='A-1'$$,'23P01',null,'Overlapping assignments are rejected');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select ok(private.is_active_student_in_branch('72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002'),'Student can access current Branch');
select ok(not private.is_active_student_in_branch('72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001'),'Transferred Student loses previous Branch access');
select throws_ok($$select public.manage_student_roster('archive','72000000-0000-4000-8000-000000000001',(select id from public.students),null)$$,'42501','Roster access denied','Student cannot mutate roster');
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.manage_student_roster('archive','72000000-0000-4000-8000-000000000001',(select id from public.students),null)$$,'Owner archives Student');
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select ok(not private.is_active_student_in_branch('72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002'),'Inactive Student is denied current Protected and operational access');
reset role;
select ok((select count(*) from public.audit_events where target_type='student' and action in ('student.created','student.transferred','student.archived'))=3,'Roster actions are audited');
select * from finish();
rollback;
