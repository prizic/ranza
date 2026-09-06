begin;
select plan(27);
select has_table('public','meal_snapshots','Meal Snapshots are migrated');
select has_table('public','meal_snapshot_students','eligible roster snapshots are migrated');
select has_table('public','meal_corrections','Meal Corrections are migrated');
select has_table('public','background_job_runs','background Job Runs are migrated');
select has_view('public','meal_final_totals','final kitchen totals are exposed');
select row_security_active('public','meal_snapshots','Meal Snapshot RLS is enabled');
select row_security_active('public','meal_corrections','Meal Correction RLS is enabled');
select ok(not has_table_privilege('authenticated','public.meal_snapshots','insert,update,delete'),'Snapshot mutation is not exposed');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password) values
('14000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner@final-meals.test',''),
('14000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','student1@final-meals.test',''),
('14000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','student2@final-meals.test',''),
('14000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','student3@final-meals.test',''),
('14000000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','other@final-meals.test','');
insert into public.profiles(id,display_name) values
('14000000-0000-4000-8000-000000000001','Meal Owner'),('14000000-0000-4000-8000-000000000005','Other Owner');
insert into public.operators(id,name,status) values
('24000000-0000-4000-8000-000000000001','Final Meals Operator','active'),('24000000-0000-4000-8000-000000000002','Other Operator','active');
insert into public.branches(id,operator_id,name,residence_classification) values
('34000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000001','Kitchen Branch','mixed'),
('34000000-0000-4000-8000-000000000002','24000000-0000-4000-8000-000000000002','Other Kitchen','mixed');
insert into public.operator_memberships(operator_id,auth_user_id,role,access_scope) values
('24000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','owner','operator_wide'),
('24000000-0000-4000-8000-000000000002','14000000-0000-4000-8000-000000000005','owner','operator_wide');
insert into public.operator_entitlements(operator_id,capability_key,catalog_version,allowed_modes) values
('24000000-0000-4000-8000-000000000001','meals',1,array['standard']);
insert into public.students(id,operator_id,auth_user_id,access_id,display_name) values
('54000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000002','rz-final-1','Ayşe'),
('54000000-0000-4000-8000-000000000002','24000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000003','rz-final-2','Elif'),
('54000000-0000-4000-8000-000000000003','24000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000004','rz-final-3','Zeynep');
insert into public.student_branch_history(operator_id,student_id,branch_id,started_at) values
('24000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000001',clock_timestamp()-interval '30 days'),
('24000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000002','34000000-0000-4000-8000-000000000001',clock_timestamp()-interval '30 days'),
('24000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000003','34000000-0000-4000-8000-000000000001',clock_timestamp()-interval '30 days');
insert into public.meal_days(id,operator_id,branch_id,service_date,deadline_at,published_by) values
('64000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000001',current_date,clock_timestamp()-interval '1 minute','14000000-0000-4000-8000-000000000001');
insert into public.meal_offerings(id,operator_id,branch_id,meal_day_id,meal_type) values
('74000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','breakfast'),
('74000000-0000-4000-8000-000000000002','24000000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','lunch');
insert into public.meal_responses(id,operator_id,branch_id,meal_day_id,student_id,submitted_at) values
('84000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000001',clock_timestamp()-interval '2 minutes'),
('84000000-0000-4000-8000-000000000002','24000000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000002',clock_timestamp()-interval '2 minutes');
insert into public.meal_selections(operator_id,branch_id,meal_day_id,response_id,offering_id) values
('24000000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001');

set local role service_role;
select lives_ok($$select public.finalize_meal_day('64000000-0000-4000-8000-000000000001','meal-finalize-test-001')$$,'protected scheduler finalizes a due Meal Day');
select results_eq($$select eligible_students from public.meal_snapshots$$,array[3],'eligible roster is frozen at cutoff');
select results_eq($$select responded from public.meal_snapshots$$,array[2],'submitted zero-meal response counts as responded');
select results_eq($$select zero_meal from public.meal_snapshots$$,array[1],'explicit zero is frozen separately');
select results_eq($$select unconfirmed from public.meal_snapshots$$,array[1],'silence remains Unconfirmed');
select results_eq($$select offering_totals->>'breakfast' from public.meal_snapshots$$,array['1'::text],'per-offering total is frozen');
select results_eq($$select public.finalize_meal_day('64000000-0000-4000-8000-000000000001','meal-finalize-test-002')$$,$$select id from public.meal_snapshots$$,'finalization retry returns the same Snapshot');
select results_eq($$select count(*)::bigint from public.meal_snapshots$$,array[1::bigint],'finalization retry creates no duplicate Snapshot');
select results_eq($$select count(*)::bigint from public.audit_events where action='meal_day.finalized'$$,array[1::bigint],'finalization audit is not duplicated');

reset role;set local role authenticated;
select set_config('request.jwt.claims','{"sub":"14000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.submit_meal_response('64000000-0000-4000-8000-000000000001',array['lunch'])$$,'55000','Meal response deadline has passed','late Student mutation remains denied');
select set_config('request.jwt.claims','{"sub":"14000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.correct_meal_selection('64000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000003',array['lunch'],'bad')$$,'22023','Correction reason is required','correction requires a meaningful reason');
select lives_ok($$select public.correct_meal_selection('64000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000003',array['lunch'],'Late kitchen exception')$$,'authorized staff append a correction');
select results_eq($$select cutoff_offering_totals->>'lunch' from public.meal_final_totals$$,array['0'::text],'original cutoff total remains immutable');
select results_eq($$select offering_totals->>'lunch' from public.meal_final_totals$$,array['1'::text],'effective kitchen total includes correction');
select results_eq($$select count(*)::bigint from public.meal_export_rows('64000000-0000-4000-8000-000000000001')$$,array[3::bigint],'authorized export includes every eligible Student');
select results_eq($$select count(*)::bigint from public.audit_events where action='meal.exported'$$,array[1::bigint],'authorized export is audited once');
select results_eq($$select response_status from public.meal_export_rows('64000000-0000-4000-8000-000000000001') where student_access_id='rz-final-2'$$,array['zero_meal'::text],'export preserves explicit zero response');
select set_config('request.jwt.claims','{"sub":"14000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select throws_ok($$select * from public.meal_export_rows('64000000-0000-4000-8000-000000000001')$$,'42501','Meal export denied','manipulated cross-Operator export is denied');
reset role;
select throws_ok($$update public.meal_snapshots set responded=99$$,'55000','Final Meal history is append-only and immutable','Snapshot rows cannot be edited');
select * from finish();rollback;
