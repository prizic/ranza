begin;
select plan(19);

insert into auth.users(id,email) values
('c1000000-0000-4000-8000-000000000001','final-admin@test.invalid'),
('c1000000-0000-4000-8000-000000000002','final-manager@test.invalid'),
('c1000000-0000-4000-8000-000000000003','final-student@test.invalid'),
('c1000000-0000-4000-8000-000000000004','final-outsider@test.invalid');
insert into private.platform_memberships(auth_user_id,role)
values('c1000000-0000-4000-8000-000000000001','platform_admin');
insert into public.operators(id,name,status) values
('c2000000-0000-4000-8000-000000000001','Finalization Operator','active'),
('c2000000-0000-4000-8000-000000000002','Other Finalization Operator','active');
insert into public.branches(id,operator_id,name,residence_classification,timezone) values
('c3000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Final Branch','female','Europe/Istanbul'),
('c3000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000002','Other Branch','male','America/New_York');
insert into public.operator_memberships(operator_id,auth_user_id,role,access_scope) values
('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002','manager','operator_wide'),
('c2000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000004','manager','operator_wide');
insert into public.students(id,operator_id,auth_user_id,display_name) values
('c5000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000003','Responded Student'),
('c5000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000001',null,'Unconfirmed Student');
insert into public.student_branch_history(operator_id,student_id,branch_id,started_at) values
('c2000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001',clock_timestamp()-interval '2 days'),
('c2000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000001',clock_timestamp()-interval '2 days');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001"}',true);
insert into public.operator_entitlements(operator_id,capability_key,catalog_version,allowed_modes)
values('c2000000-0000-4000-8000-000000000001','attendance',1,array['standard']);
set local role postgres;
insert into public.attendance_sessions(id,operator_id,branch_id,service_date,cutoff_at)
values
('c6000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001',current_date-1,clock_timestamp()-interval '1 minute'),
('c6000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001',current_date,clock_timestamp()+interval '1 hour');
insert into public.attendance_responses(operator_id,branch_id,session_id,student_id,declaration,updated_at)
values('c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001','staying',clock_timestamp()-interval '2 minutes');

set local role service_role;
select is(public.finalize_due_attendance('finalize-correlation-0001',100)->>'succeeded','1','Scheduler discovers due Session without Operator scope');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000002"}',true);
select is((select count(*)::integer from public.attendance_snapshots),1,'Exactly one Snapshot is created');
select is((select eligible_count from public.attendance_snapshots),2,'Snapshot freezes eligible roster');
select is((select staying_count from public.attendance_snapshots),1,'Snapshot counts Staying');
select is((select unconfirmed_count from public.attendance_snapshots),1,'Silence remains Unconfirmed');
select is((select count(*)::integer from public.attendance_snapshot_students),2,'Snapshot stores Student-level roster');
select is((select status from public.attendance_sessions where id='c6000000-0000-4000-8000-000000000001'),'finalized','Session is finalized transactionally');
select is((select correlation_id from public.background_job_runs where target_session_id='c6000000-0000-4000-8000-000000000001' limit 1),'finalize-correlation-0001','Job records correlation reference');
select ok((select duration_ms is not null from public.background_job_runs where target_session_id='c6000000-0000-4000-8000-000000000001' limit 1),'Job records duration');
set local role service_role;
select is(public.finalize_due_attendance('finalize-correlation-0002',100)->>'attempted','0','Repeated discovery is idempotent');
select is((select count(*)::integer from public.attendance_snapshots),1,'Retry does not duplicate Snapshot');
set local role postgres;
select throws_ok($$update public.attendance_snapshots set staying_count=0$$,'22023','Attendance Snapshots are immutable','Snapshot totals are immutable');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000003"}',true);
select throws_ok($$select public.submit_attendance_declaration('c6000000-0000-4000-8000-000000000001','away')$$,'P0001','Attendance cutoff has passed','Late mutation cannot change Snapshot');
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000004"}',true);
select is((select count(*)::integer from public.attendance_snapshots),0,'Cross-Operator staff cannot see Snapshot');

set local role postgres;
select is(private.run_attendance_finalization('c6000000-0000-4000-8000-000000000002','failure-correlation-0001','scheduler')->>'status','failed','Pre-cutoff attempt is recorded failed');
select is(private.run_attendance_finalization('c6000000-0000-4000-8000-000000000002','failure-correlation-0002','scheduler')->>'status','failed','Bounded retry remains visible');
select is(private.run_attendance_finalization('c6000000-0000-4000-8000-000000000002','failure-correlation-0003','scheduler')->>'status','exhausted','Third failure becomes exhausted');
select is((select count(*)::integer from public.attendance_snapshots where session_id='c6000000-0000-4000-8000-000000000002'),0,'Failed attempt rolls back partial Snapshot');
alter table public.attendance_sessions disable trigger attendance_session_cutoff_immutable;
update public.attendance_sessions set cutoff_at=clock_timestamp()-interval '1 second' where id='c6000000-0000-4000-8000-000000000002';
alter table public.attendance_sessions enable trigger attendance_session_cutoff_immutable;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000002"}',true);
select is(public.retry_attendance_finalization('c6000000-0000-4000-8000-000000000002','staff-retry-correlation')->>'status','succeeded','Authorized retry succeeds after exhausted failure');

select * from finish();
rollback;
