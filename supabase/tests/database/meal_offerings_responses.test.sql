begin;
select plan(21);

select has_table('public','meal_days','Meal Days are migrated');
select has_table('public','meal_offerings','Meal Offerings are migrated');
select has_table('public','meal_responses','Meal responses are migrated');
select has_table('public','meal_selections','Meal selections are migrated');
select row_security_active('public','meal_days','Meal Day RLS is enabled');
select row_security_active('public','meal_responses','Meal response RLS is enabled');
select has_view('public','meal_day_live_totals','Live meal totals are exposed');
select ok(not has_table_privilege('anon','public.meal_days','select,insert,update,delete'),'anonymous users have no Meal Day privileges');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password) values
('12000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','manager@meals.test',''),
('12000000-0000-4000-8000-000000000002','00000000-0000-0000-8000-000000000000','authenticated','authenticated','student@meals.test',''),
('12000000-0000-4000-8000-000000000003','00000000-0000-0000-8000-000000000000','authenticated','authenticated','other@meals.test','');
insert into public.profiles(id,display_name) values ('12000000-0000-4000-8000-000000000001','Meals Manager');
insert into public.operators(id,name,status) values
('22000000-0000-4000-8000-000000000001','Meals Operator','active'),
('22000000-0000-4000-8000-000000000002','Other Meals Operator','active');
insert into public.branches(id,operator_id,name,residence_classification) values
('32000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','Meals Branch','mixed'),
('32000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000002','Other Branch','mixed');
insert into public.operator_memberships(id,operator_id,auth_user_id,role,access_scope) values
('42000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','manager','assigned_branches');
insert into public.branch_assignments(operator_id,membership_id,branch_id,role) values
('22000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001','manager');
insert into public.operator_entitlements(operator_id,capability_key,catalog_version,allowed_modes) values
('22000000-0000-4000-8000-000000000001','meals',1,array['standard']);
insert into public.students(id,operator_id,auth_user_id,display_name) values
('52000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000002','Meal Student'),
('52000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000003','Other Student');
insert into public.student_branch_history(operator_id,student_id,branch_id) values
('22000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001'),
('22000000-0000-4000-8000-000000000002','52000000-0000-4000-8000-000000000002','32000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok(
  $$ select public.publish_meal_day('22000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001',(clock_timestamp() at time zone 'Europe/Istanbul')::date + 1,clock_timestamp()+interval '2 hours',array['breakfast','lunch']) $$,
  'an entitled assigned Manager publishes offered meals atomically'
);
select results_eq($$ select meal_type from public.meal_offerings order by meal_type $$,array['breakfast'::text,'lunch'::text],'only published Offerings exist');
select throws_ok(
  $$ select public.publish_meal_day('22000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001',(clock_timestamp() at time zone 'Europe/Istanbul')::date + 2,clock_timestamp()+interval '3 hours',array['lunch','lunch']) $$,
  '22023',null,'duplicate Offering types are rejected'
);
select throws_ok(
  $$ update public.meal_days set deadline_at=clock_timestamp()+interval '9 hours' $$,
  '42501',null,'published deadlines cannot be edited through authenticated grants'
);

select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select lives_ok($$ select public.submit_meal_response((select id from public.meal_days limit 1),array[]::text[]) $$,'a Student submits an explicit zero-meal response');
select results_eq($$ select response_status from public.meal_response_status where student_id='52000000-0000-4000-8000-000000000001' $$,array['zero_meal'::text],'zero-meal is distinct from silence');
select lives_ok($$ select public.submit_meal_response((select id from public.meal_days limit 1),array['breakfast']) $$,'a Student atomically replaces their response');
select results_eq($$ select version from public.meal_responses where student_id='52000000-0000-4000-8000-000000000001' $$,array[2],'replacement increments the response version');
select results_eq($$ select meal_type from public.meal_selections selection join public.meal_offerings offering on offering.id=selection.offering_id $$,array['breakfast'::text],'replacement removes the old complete selection');
select throws_ok($$ select public.submit_meal_response((select id from public.meal_days limit 1),array['dinner']) $$,'22023',null,'a Student cannot select an unpublished Offering');
select results_eq($$ select count(*)::bigint from public.meal_days where operator_id='22000000-0000-4000-8000-000000000002' $$,array[0::bigint],'Student RLS denies another Operator');

reset role;
insert into public.meal_days(id,operator_id,branch_id,service_date,deadline_at,published_by) values
('62000000-0000-4000-8000-000000000099','22000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001',current_date-1,clock_timestamp()-interval '1 minute','12000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$ select public.submit_meal_response('62000000-0000-4000-8000-000000000099',array[]::text[]) $$,'55000','Meal response deadline has passed','server time rejects a late response');

reset role;
update public.operator_entitlements set status='revoked' where operator_id='22000000-0000-4000-8000-000000000001' and capability_key='meals';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$ select public.submit_meal_response((select id from public.meal_days where deadline_at>clock_timestamp() limit 1),array[]::text[]) $$,'42501','Meal response denied','revoked entitlement blocks mutation');

select * from finish();
rollback;
