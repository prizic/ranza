-- An employee's wage is dated (HR-03, HR-S1-57 to HR-S1-62).
--
-- The integration suite proves the module on top of this. This proves the
-- database alone, one statement at a time: who may add a wage change, what a
-- change may not claim, that nothing can be rewritten, and that pay is not
-- written in place any more.
--
-- Its own suite, as hr.test.sql's fixtures are rewritten section by section.
-- Each break was applied as DDL inside this transaction after printing what it
-- changed, and the assertion named went red:
--   a  the approved-month clause removed from the trigger
--        HR-S1-59: a wage cannot start in an approved month, nor before one
--   b  app.hr_payroll_approved_through() left unchecked for hr.manage
--        HR-S1-59: nor tell a stranger when payroll was approved
--   c  the manageable clause removed from the insert policy
--        HR-S1-62: a viewer and a Staff Member of another Property add no change
--   d  `update (gross_pay_minor)` granted back to ranza_app
--        HR-S1-61: pay is not updatable
--   e  the append-only grants widened to update
--        HR-S1-58: a wage change is never rewritten

begin;
select plan(16);

insert into public.users (id, email) values
  ('a1111111-1111-4111-8111-111111111111', 'wage-manager@example.test'),
  ('a2222222-2222-4222-8222-222222222222', 'wage-viewer@example.test'),
  ('a3333333-3333-4333-8333-333333333333', 'wage-scoped@example.test'),
  ('a4444444-4444-4444-8444-444444444444', 'wage-stranger@example.test');

insert into public.organizations (id, name, status) values
  ('ab111111-1111-4111-8111-111111111111', 'Wage Organization', 'active'),
  ('ab222222-2222-4222-8222-222222222222', 'Other Wage Organization', 'active');
insert into public.subscriptions (organization_id, status) values
  ('ab111111-1111-4111-8111-111111111111', 'active'),
  ('ab222222-2222-4222-8222-222222222222', 'active');
insert into public.entitlements (organization_id, module_key, status) values
  ('ab111111-1111-4111-8111-111111111111', 'human_resources', 'active'),
  ('ab222222-2222-4222-8222-222222222222', 'human_resources', 'active');
insert into public.properties (id, organization_id, name) values
  ('ac111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111', 'Wage North'),
  ('ac222222-2222-4222-8222-222222222222', 'ab111111-1111-4111-8111-111111111111', 'Wage South'),
  ('ac333333-3333-4333-8333-333333333333', 'ab222222-2222-4222-8222-222222222222', 'Elsewhere');
insert into public.property_capabilities (property_id, organization_id, capability_key, enabled) values
  ('ac111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111', 'staff_administration', true),
  ('ac222222-2222-4222-8222-222222222222', 'ab111111-1111-4111-8111-111111111111', 'staff_administration', true),
  ('ac333333-3333-4333-8333-333333333333', 'ab222222-2222-4222-8222-222222222222', 'staff_administration', true);
insert into public.staff_roles (scope_id, organization_id, key, name, permissions) values
  ('ab111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111', 'hr_manager', 'HR Manager', array['hr.manage', 'hr.view']),
  ('ab111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111', 'hr_viewer', 'HR Viewer', array['hr.view']),
  ('ab222222-2222-4222-8222-222222222222', 'ab222222-2222-4222-8222-222222222222', 'hr_manager', 'HR Manager', array['hr.manage', 'hr.view']);
insert into public.organization_memberships (organization_id, user_id, role, role_scope_id, access_scope) values
  ('ab111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 'hr_manager', 'ab111111-1111-4111-8111-111111111111', 'organization_wide'),
  ('ab111111-1111-4111-8111-111111111111', 'a2222222-2222-4222-8222-222222222222', 'hr_viewer', 'ab111111-1111-4111-8111-111111111111', 'organization_wide'),
  ('ab111111-1111-4111-8111-111111111111', 'a3333333-3333-4333-8333-333333333333', 'hr_manager', 'ab111111-1111-4111-8111-111111111111', 'assigned_properties'),
  ('ab222222-2222-4222-8222-222222222222', 'a4444444-4444-4444-8444-444444444444', 'hr_manager', 'ab222222-2222-4222-8222-222222222222', 'organization_wide');
-- The scoped manager reaches the north Property only.
insert into public.property_assignments (property_id, organization_id, user_id) values
  ('ac111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111', 'a3333333-3333-4333-8333-333333333333');

insert into public.hr_employees
  (id, organization_id, property_id, first_name, last_name, department, position, hired_on, gross_pay_minor, currency) values
  ('ae111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111', 'ac111111-1111-4111-8111-111111111111',
   'Nora', 'North', 'Front desk', 'Agent', '2025-01-01', 1000000, 'TRY'),
  ('ae222222-2222-4222-8222-222222222222', 'ab111111-1111-4111-8111-111111111111', 'ac222222-2222-4222-8222-222222222222',
   'Sami', 'South', 'Front desk', 'Agent', '2025-01-01', 1000000, 'TRY'),
  ('ae333333-3333-4333-8333-333333333333', 'ab111111-1111-4111-8111-111111111111', 'ac111111-1111-4111-8111-111111111111',
   'Hale', 'Hired', 'Front desk', 'Agent', '2026-06-15', 1000000, 'TRY');

-- A run approved for 2026-04, made as the owner of the database would make it.
insert into public.hr_payroll_runs (id, organization_id, period, currency, total_gross_minor, total_net_minor) values
  ('af111111-1111-4111-8111-111111111111', 'ab111111-1111-4111-8111-111111111111', '2026-04', 'TRY', 1000000, 1000000);
insert into public.hr_payslips
  (organization_id, payroll_run_id, employee_id, gross_pay_minor,
   social_security_deduction_minor, tax_deduction_minor, stamp_duty_minor, net_pay_minor) values
  ('ab111111-1111-4111-8111-111111111111', 'af111111-1111-4111-8111-111111111111',
   'ae111111-1111-4111-8111-111111111111', 1000000, 0, 0, 0, 1000000);
update public.hr_payroll_runs
   set status = 'approved', approved_at = now(),
       approved_by = 'a1111111-1111-4111-8111-111111111111'
 where id = 'af111111-1111-4111-8111-111111111111';

-- What is on the catalogue, read there so a missing object is a failing
-- assertion and not a raise that silences the rest.
select is(
  (select count(*)::int from information_schema.column_privileges
    where table_name = 'hr_employees' and grantee = 'ranza_app'
      and privilege_type = 'UPDATE' and column_name = 'gross_pay_minor'),
  0,
  'HR-S1-61: the application role cannot update an employee''s pay in place'
);

select is(
  (select count(*)::int from information_schema.column_privileges
    where table_name = 'hr_wage_changes' and grantee = 'ranza_app'
      and privilege_type in ('UPDATE')),
  0,
  'HR-S1-58: nor update a wage change'
);

select is(
  (select count(*)::int from information_schema.table_privileges
    where table_name = 'hr_wage_changes' and grantee = 'ranza_app'
      and privilege_type in ('DELETE', 'TRUNCATE', 'UPDATE')),
  0,
  'HR-S1-58: and holds no table-wide update or delete on them either'
);

select is(
  (select count(*)::int from pg_class
    where relname = 'hr_wage_changes' and relrowsecurity and relforcerowsecurity),
  1,
  'HR-S1-62: row-level security is on and forced for wage changes'
);

set local role ranza_app;
select app.set_request_context('a1111111-1111-4111-8111-111111111111');

insert into public.hr_wage_changes (organization_id, employee_id, effective_from, gross_pay_minor, created_by)
values ('ab111111-1111-4111-8111-111111111111', 'ae111111-1111-4111-8111-111111111111',
        '2026-05-01', 1200000, 'a1111111-1111-4111-8111-111111111111');

select results_eq(
  $$select gross_pay_minor from public.hr_wage_changes
     where employee_id = 'ae111111-1111-4111-8111-111111111111'$$,
  $$values (1200000::bigint)$$,
  'HR-S1-57: a manager adds a wage change for a month after the last approved one'
);

select throws_matching(
  $$insert into public.hr_wage_changes (organization_id, employee_id, effective_from, gross_pay_minor, created_by)
    values ('ab111111-1111-4111-8111-111111111111', 'ae111111-1111-4111-8111-111111111111',
            '2026-04-01', 1300000, 'a1111111-1111-4111-8111-111111111111')$$,
  'already approved',
  'HR-S1-59: a wage cannot start in a month whose payroll is approved'
);

select throws_matching(
  $$insert into public.hr_wage_changes (organization_id, employee_id, effective_from, gross_pay_minor, created_by)
    values ('ab111111-1111-4111-8111-111111111111', 'ae111111-1111-4111-8111-111111111111',
            '2026-02-01', 1300000, 'a1111111-1111-4111-8111-111111111111')$$,
  'already approved',
  'HR-S1-59: nor in a month before one'
);

select throws_matching(
  $$insert into public.hr_wage_changes (organization_id, employee_id, effective_from, gross_pay_minor, created_by)
    values ('ab111111-1111-4111-8111-111111111111', 'ae333333-3333-4333-8333-333333333333',
            '2026-05-01', 1300000, 'a1111111-1111-4111-8111-111111111111')$$,
  'before the month the person was hired',
  'HR-S1-60: nor before the month the person was hired'
);

select throws_matching(
  $$insert into public.hr_wage_changes (organization_id, employee_id, effective_from, gross_pay_minor, created_by)
    values ('ab111111-1111-4111-8111-111111111111', 'ae111111-1111-4111-8111-111111111111',
            '2026-06-10', 1300000, 'a1111111-1111-4111-8111-111111111111')$$,
  'hr_wage_changes_first_of_month',
  'HR-S1-57: a change starts on the first of a month'
);

select throws_matching(
  $$update public.hr_wage_changes set gross_pay_minor = 1$$,
  'permission denied',
  'HR-S1-58: a wage change is never rewritten'
);

select throws_matching(
  $$update public.hr_employees set gross_pay_minor = 1
     where id = 'ae111111-1111-4111-8111-111111111111'$$,
  'permission denied',
  'HR-S1-61: pay is not updatable on the employee'
);

select is(
  (select app.hr_payroll_approved_through('ab111111-1111-4111-8111-111111111111')),
  '2026-04',
  'HR-S1-59: a manager is told the last month an approved run covers'
);

-- A viewer reads and adds nothing; the manager of another Property adds nothing
-- for an employee they do not reach, and still cannot claim an approved month
-- they cannot read the run for.
select app.set_request_context('a2222222-2222-4222-8222-222222222222');
select throws_matching(
  $$insert into public.hr_wage_changes (organization_id, employee_id, effective_from, gross_pay_minor, created_by)
    values ('ab111111-1111-4111-8111-111111111111', 'ae111111-1111-4111-8111-111111111111',
            '2026-07-01', 1, 'a2222222-2222-4222-8222-222222222222')$$,
  'row-level security',
  'HR-S1-62: somebody who may only view HR adds no wage change'
);

select app.set_request_context('a3333333-3333-4333-8333-333333333333');
select throws_matching(
  $$insert into public.hr_wage_changes (organization_id, employee_id, effective_from, gross_pay_minor, created_by)
    values ('ab111111-1111-4111-8111-111111111111', 'ae222222-2222-4222-8222-222222222222',
            '2026-07-01', 1, 'a3333333-3333-4333-8333-333333333333')$$,
  'row-level security',
  'HR-S1-62: a manager of the north Property adds none for the south Property''s employee'
);
select throws_matching(
  $$insert into public.hr_wage_changes (organization_id, employee_id, effective_from, gross_pay_minor, created_by)
    values ('ab111111-1111-4111-8111-111111111111', 'ae111111-1111-4111-8111-111111111111',
            '2026-03-01', 1, 'a3333333-3333-4333-8333-333333333333')$$,
  'already approved',
  'HR-S1-59: and the approved month is refused to them though they cannot read the run'
);

select app.set_request_context('a4444444-4444-4444-8444-444444444444');
select is(
  (select app.hr_payroll_approved_through('ab111111-1111-4111-8111-111111111111')),
  null,
  'HR-S1-59: a manager of another Organization is not told when this one approved payroll'
);

select * from finish();
rollback;
