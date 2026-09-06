begin;
select plan(17);

insert into auth.users(id,email) values
('a1000000-0000-4000-8000-000000000001','attendance-admin@test.invalid'),
('a1000000-0000-4000-8000-000000000002','attendance-manager@test.invalid'),
('a1000000-0000-4000-8000-000000000003','attendance-student@test.invalid'),
('a1000000-0000-4000-8000-000000000004','attendance-other-student@test.invalid'),
('a1000000-0000-4000-8000-000000000005','attendance-outsider@test.invalid');
insert into private.platform_memberships(auth_user_id,role)
values('a1000000-0000-4000-8000-000000000001','platform_admin');
insert into public.operators(id,name,status) values
('a2000000-0000-4000-8000-000000000001','Attendance Operator','active'),
('a2000000-0000-4000-8000-000000000002','Other Operator','active');
insert into public.branches(id,operator_id,name,residence_classification) values
('a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','Main Branch','female'),
('a3000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000002','Other Branch','male');
insert into public.operator_memberships(id,operator_id,auth_user_id,role,access_scope) values
('a4000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','manager','assigned_branches');
insert into public.branch_assignments(operator_id,membership_id,branch_id,role) values
('a2000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','manager');
insert into public.students(id,operator_id,auth_user_id,display_name) values
('a5000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003','Student One'),
('a5000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000001',null,'Student Two'),
('a5000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000004','Other Student');
insert into public.student_branch_history(operator_id,student_id,branch_id) values
('a2000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001'),
('a2000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000002','a3000000-0000-4000-8000-000000000001'),
('a2000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-000000000003','a3000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001"}',true);
insert into public.operator_entitlements(operator_id,capability_key,catalog_version,allowed_modes) values
('a2000000-0000-4000-8000-000000000001','attendance',1,array['standard']),
('a2000000-0000-4000-8000-000000000002','attendance',1,array['standard']);

select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000002"}',true);
select lives_ok($$select public.configure_attendance_schedule('a3000000-0000-4000-8000-000000000001','Europe/Istanbul',1439)$$,'Manager configures Branch attendance');
select is((select timezone from public.branches where id='a3000000-0000-4000-8000-000000000001'),'Europe/Istanbul','Timezone is saved');
select is((select cutoff_minute from public.attendance_schedules where branch_id='a3000000-0000-4000-8000-000000000001'),1439,'Cutoff is saved');
select lives_ok($$select public.ensure_attendance_session('a3000000-0000-4000-8000-000000000001')$$,'Session materializes');
select is((select count(*)::integer from public.attendance_sessions),1,'Only one local-date Session exists');
select lives_ok($$select public.ensure_attendance_session('a3000000-0000-4000-8000-000000000001')$$,'Session materialization is idempotent');
select is((select count(*)::integer from public.attendance_sessions),1,'Idempotency preserves one Session');
select is((select count(*)::integer from public.attendance_board((select id from public.attendance_sessions)) where status='unconfirmed'),2,'Silence remains Unconfirmed');

select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000003"}',true);
select lives_ok($$select public.submit_attendance_declaration((select id from public.attendance_sessions),'staying')$$,'Student submits own declaration');
select is((select declaration from public.attendance_responses),'staying','Latest declaration is saved');
select lives_ok($$select public.submit_attendance_declaration((select id from public.attendance_sessions),'away')$$,'Student replaces declaration before cutoff');
select is((select version from public.attendance_responses),2,'Replacement increments version');
select throws_ok($$select public.submit_attendance_declaration((select id from public.attendance_sessions),'unconfirmed')$$,'22023','Unsupported Attendance declaration','Student cannot submit Unconfirmed');

select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000004"}',true);
select throws_ok($$select public.submit_attendance_declaration((select id from public.attendance_sessions),'away')$$,'42501','Attendance submission denied','Cross-Operator Student cannot submit');

select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000005"}',true);
select throws_ok($$select public.attendance_board((select id from public.attendance_sessions))$$,'42501','Attendance board access denied','Outsider cannot read board');

set local role postgres;
select throws_ok($$update public.attendance_sessions set cutoff_at=cutoff_at+interval '1 minute'$$,'22023','Attendance Session identity and cutoff are immutable','Existing cutoff cannot be changed');
alter table public.attendance_sessions disable trigger attendance_session_cutoff_immutable;
update public.attendance_sessions set cutoff_at=clock_timestamp()-interval '1 second',status='open';
alter table public.attendance_sessions enable trigger attendance_session_cutoff_immutable;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000003"}',true);
select throws_ok($$select public.submit_attendance_declaration((select id from public.attendance_sessions),'staying')$$,'P0001','Attendance cutoff has passed','Database time rejects late submission');

select * from finish();
rollback;
