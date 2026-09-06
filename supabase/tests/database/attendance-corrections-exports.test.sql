begin;
select plan(15);

insert into auth.users(id,email) values
('d1000000-0000-4000-8000-000000000001','correction-manager@test.invalid'),
('d1000000-0000-4000-8000-000000000002','correction-outsider@test.invalid');
insert into public.operators(id,name,status) values
('d2000000-0000-4000-8000-000000000001','Correction Operator','active'),
('d2000000-0000-4000-8000-000000000002','Outside Operator','active');
insert into public.branches(id,operator_id,name,residence_classification) values
('d3000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','Original Branch','female'),
('d3000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000001','Transfer Branch','female'),
('d3000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-000000000002','Outside Branch','male');
insert into public.operator_memberships(operator_id,auth_user_id,role,access_scope) values
('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','manager','operator_wide'),
('d2000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000002','manager','operator_wide');
insert into public.operator_entitlements(operator_id,capability_key,catalog_version,allowed_modes)
values('d2000000-0000-4000-8000-000000000001','attendance',1,array['standard']);
insert into public.students(id,operator_id,access_id,display_name) values
('d5000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','student-stable-001','Öğrenci العربية');
insert into public.student_branch_history(operator_id,student_id,branch_id,started_at) values
('d2000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001',clock_timestamp()-interval '2 days');
insert into public.attendance_sessions(id,operator_id,branch_id,service_date,cutoff_at,status) values
('d6000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001',current_date-1,clock_timestamp()-interval '1 hour','finalized');
insert into public.attendance_snapshots(id,operator_id,branch_id,session_id,eligible_count,staying_count,away_count,unconfirmed_count,correlation_id)
values('d7000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','d6000000-0000-4000-8000-000000000001',1,0,0,1,'snapshot-correlation-001');
insert into public.attendance_snapshot_students(snapshot_id,operator_id,branch_id,session_id,student_id,display_name,status)
values('d7000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','d6000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','Öğrenci العربية','unconfirmed');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000001"}',true);
select lives_ok($$select public.correct_attendance('d6000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','staying','Veli ile doğrulandı')$$,'Manager appends a correction');
select is((select status from public.attendance_snapshot_students),'unconfirmed','Cutoff row remains immutable');
select is((select effective_status from public.attendance_final_student_status),'staying','Effective status applies latest correction');
select lives_ok($$select public.correct_attendance('d6000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','away','Geç dönüş bildirildi')$$,'A later correction is appended');
select is((select before_status from public.attendance_corrections order by corrected_at desc,id desc limit 1),'staying','Correction records the previous effective value');
select is((select count(*)::integer from public.attendance_corrections),2,'Correction history is append-only');
select throws_ok($$select public.correct_attendance('d6000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','staying','')$$,'22023','Correction reason is required','Reason is mandatory');
select lives_ok($$select public.reopen_attendance('d6000000-0000-4000-8000-000000000001','Manuel inceleme gerekli')$$,'Manager records a reopen exception');
select is((select count(*)::integer from public.attendance_reopens),1,'Reopen is preserved as a separate event');
select is((select student_access_id from public.attendance_export_rows('d6000000-0000-4000-8000-000000000001')),'student-stable-001','Student export uses cutoff identifier');
select is((select effective_away from public.attendance_export_totals('d6000000-0000-4000-8000-000000000001')),1,'Totals export uses effective values');

set local role postgres;
select throws_ok($$update public.attendance_corrections set reason='rewrite'$$,'55000','Final Attendance exceptions are append-only','Corrections cannot be rewritten');
update public.student_branch_history set ended_at=clock_timestamp() where student_id='d5000000-0000-4000-8000-000000000001';
insert into public.student_branch_history(operator_id,student_id,branch_id)
values('d2000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000001"}',true);
select is((select branch_id from public.attendance_final_student_status),'d3000000-0000-4000-8000-000000000001'::uuid,'Transfer does not change historical Branch');
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000002"}',true);
select throws_ok($$select public.attendance_export_rows('d6000000-0000-4000-8000-000000000001')$$,'42501','Attendance export denied','Cross-Operator export is denied');
select throws_ok($$select public.correct_attendance('d6000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','staying','Unauthorized change')$$,'42501','Attendance correction denied','Cross-Operator correction is denied');

select * from finish();
rollback;
