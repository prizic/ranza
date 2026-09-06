\set ON_ERROR_STOP on
\timing on
begin;

insert into public.operators(id,name,status) values('25000000-0000-4000-8000-000000000001','Readiness Performance Operator','active');
insert into public.branches(id,operator_id,name,residence_classification) values
('35000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000001','Performance Branch','mixed');
insert into public.students(id,operator_id,access_id,display_name,status)
select gen_random_uuid(),'25000000-0000-4000-8000-000000000001','PERF-'||lpad(value::text,4,'0'),'Performance Student '||value,'active'
from generate_series(1,1000) value;
insert into public.student_branch_history(operator_id,student_id,branch_id)
select operator_id,id,'35000000-0000-4000-8000-000000000001' from public.students
where operator_id='25000000-0000-4000-8000-000000000001';
analyze public.students;
analyze public.student_branch_history;

select count(*) as fixture_students from public.students where operator_id='25000000-0000-4000-8000-000000000001';
explain(analyze,buffers,format json)
select student.id,student.display_name
from public.student_branch_history history
join public.students student on student.id=history.student_id and student.operator_id=history.operator_id
where history.operator_id='25000000-0000-4000-8000-000000000001'
  and history.branch_id='35000000-0000-4000-8000-000000000001'
  and history.ended_at is null and student.status='active'
order by student.display_name limit 100;
explain(analyze,buffers,format json)
select student_id,remaining_balance,overdue_balance
from public.branch_student_balance_summary
where operator_id='25000000-0000-4000-8000-000000000001'
  and branch_id='35000000-0000-4000-8000-000000000001'
order by display_name limit 100;

rollback;
