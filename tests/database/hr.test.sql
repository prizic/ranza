-- Human Resources and Payroll (Blueprint 5.11, Phase 4, HR-S1-*)
-- "A Staff Member's record outlives their access to the system."
begin;
select plan(12);

insert into public.users (id, email) values
  ('81111111-1111-4111-8111-111111111111', 'hr-manager@example.test'),
  ('82222222-2222-4222-8222-222222222222', 'hr-viewer@example.test'),
  ('83333333-3333-4333-8333-333333333333', 'hr-noperm@example.test'),
  ('84444444-4444-4444-8444-444444444444', 'frontdesk-staff@example.test');

insert into public.organizations (id, name, status) values
  ('8a111111-1111-4111-8111-111111111111', 'Hospitality Org', 'active'),
  ('8a222222-2222-4222-8222-222222222222', 'Other Org', 'active');

insert into public.subscriptions (organization_id, status) values
  ('8a111111-1111-4111-8111-111111111111', 'active'),
  ('8a222222-2222-4222-8222-222222222222', 'active');

insert into public.entitlements (organization_id, module_key, status) values
  ('8a111111-1111-4111-8111-111111111111', 'human_resources', 'active'),
  ('8a222222-2222-4222-8222-222222222222', 'human_resources', 'active');

insert into public.properties (id, organization_id, name) values
  ('8b111111-1111-4111-8111-111111111111', '8a111111-1111-4111-8111-111111111111', 'Galata Hotel'),
  ('8b222222-2222-4222-8222-222222222222', '8a222222-2222-4222-8222-222222222222', 'Other Org Property');

insert into public.property_capabilities (property_id, organization_id, capability_key, enabled) values
  ('8b111111-1111-4111-8111-111111111111', '8a111111-1111-4111-8111-111111111111', 'staff_administration', true),
  ('8b222222-2222-4222-8222-222222222222', '8a222222-2222-4222-8222-222222222222', 'staff_administration', true);

-- Roles & Memberships
insert into public.staff_roles (id, scope_id, organization_id, key, name, permissions) values
  ('8d111111-1111-4111-8111-111111111111', '8a111111-1111-4111-8111-111111111111', '8a111111-1111-4111-8111-111111111111', 'hr_manager', 'HR Manager',
   array['hr.manage', 'hr.view', 'staff.administer']),
  ('8d222222-2222-4222-8222-222222222222', '8a111111-1111-4111-8111-111111111111', '8a111111-1111-4111-8111-111111111111', 'hr_viewer', 'HR Viewer',
   array['hr.view']),
  ('8d333333-3333-4333-8333-333333333333', '8a111111-1111-4111-8111-111111111111', '8a111111-1111-4111-8111-111111111111', 'hr_noperms', 'No Perms',
   array[]::text[]);

insert into public.organization_memberships (organization_id, user_id, role, role_scope_id, access_scope, status) values
  ('8a111111-1111-4111-8111-111111111111', '81111111-1111-4111-8111-111111111111', 'hr_manager', '8a111111-1111-4111-8111-111111111111', 'organization_wide', 'active'),
  ('8a111111-1111-4111-8111-111111111111', '82222222-2222-4222-8222-222222222222', 'hr_viewer', '8a111111-1111-4111-8111-111111111111', 'organization_wide', 'active'),
  ('8a111111-1111-4111-8111-111111111111', '83333333-3333-4333-8333-333333333333', 'hr_noperms', '8a111111-1111-4111-8111-111111111111', 'organization_wide', 'active'),
  ('8a111111-1111-4111-8111-111111111111', '84444444-4444-4444-8444-444444444444', 'hr_noperms', '8a111111-1111-4111-8111-111111111111', 'assigned_properties', 'active');

insert into public.property_assignments (property_id, organization_id, user_id) values
  ('8b111111-1111-4111-8111-111111111111', '8a111111-1111-4111-8111-111111111111', '84444444-4444-4444-8444-444444444444');

-- Switch to application role
set local role ranza_app;

-- 1. HR-S1-02: Register an employee with no system login (user_id is null)
select app.set_request_context('81111111-1111-4111-8111-111111111111');

insert into public.hr_employees (
  id, organization_id, property_id, user_id, first_name, last_name, email, department, position, gross_pay
) values (
  '8e111111-1111-4111-8111-111111111111',
  '8a111111-1111-4111-8111-111111111111',
  '8b111111-1111-4111-8111-111111111111',
  null,
  'Ahmet', 'Yilmaz', 'ahmet@hotel.test', 'Housekeeping', 'Housekeeper', 30000.00
);

select results_eq(
  $$select first_name, user_id is null from public.hr_employees where id = '8e111111-1111-4111-8111-111111111111'$$,
  $$values ('Ahmet', true)$$,
  'An employee record can exist without any system login / user account'
);

-- 2. HR-S1-01: Register an employee linked to a system user, then REVOKE their system membership.
-- The employee record outlives their access to the system!
insert into public.hr_employees (
  id, organization_id, property_id, user_id, first_name, last_name, email, department, position, gross_pay
) values (
  '8e222222-2222-4222-8222-222222222222',
  '8a111111-1111-4111-8111-111111111111',
  '8b111111-1111-4111-8111-111111111111',
  '84444444-4444-4444-8444-444444444444',
  'Mert', 'Polat', 'frontdesk-staff@example.test', 'Front desk', 'Front Desk Agent', 35000.00
);

-- Add shift, leave request, and payroll entry for this staff member
insert into public.hr_shifts (
  id, organization_id, property_id, employee_id, date, shift_type, start_time, end_time
) values (
  '8f111111-1111-4111-8111-111111111111',
  '8a111111-1111-4111-8111-111111111111',
  '8b111111-1111-4111-8111-111111111111',
  '8e222222-2222-4222-8222-222222222222',
  '2026-10-10', 'morning', '07:00', '15:00'
);

insert into public.hr_leave_requests (
  id, organization_id, employee_id, leave_type, starts_on, ends_on, status
) values (
  '8f222222-2222-4222-8222-222222222222',
  '8a111111-1111-4111-8111-111111111111',
  '8e222222-2222-4222-8222-222222222222',
  'annual', '2026-10-15', '2026-10-18', 'approved'
);

-- Revoke their system membership (access removed)
update public.organization_memberships
   set status = 'revoked', revoked_at = now()
 where user_id = '84444444-4444-4444-8444-444444444444';

-- Verify the staff member's record outlives their access
select results_eq(
  $$select e.first_name, e.status, m.status as membership_status
      from public.hr_employees e
      join public.organization_memberships m on m.user_id = e.user_id
     where e.id = '8e222222-2222-4222-8222-222222222222'$$,
  $$values ('Mert', 'active', 'revoked')$$,
  'Done when: a Staff Member''s record outlives their access to the system'
);

-- 3. Shifts and Leave records are also intact
select results_eq(
  $$select count(*)::int from public.hr_shifts where employee_id = '8e222222-2222-4222-8222-222222222222'$$,
  $$values (1)$$,
  'Shift history outlives system access'
);

select results_eq(
  $$select status from public.hr_leave_requests where employee_id = '8e222222-2222-4222-8222-222222222222'$$,
  $$values ('approved')$$,
  'Leave history outlives system access'
);

-- 4. HR-S1-03: Viewer holding hr.view can read employee directory
select app.set_request_context('82222222-2222-4222-8222-222222222222');
select results_eq(
  $$select count(*)::int from public.hr_employees$$,
  $$values (2)$$,
  'Staff Member with hr.view reads all organization employees'
);

-- 5. HR-S1-06: Viewer holding hr.view cannot insert employee records
select throws_matching(
  $$insert into public.hr_employees (
      organization_id, first_name, last_name, department, position, gross_pay
    ) values (
      '8a111111-1111-4111-8111-111111111111', 'Ali', 'Demir', 'Kitchen', 'Cook', 28000.00
    )$$,
  'new row violates row-level security policy',
  'Registering employee without hr.manage permission is refused by RLS'
);

-- 6. HR-S1-05: Staff Member without hr permissions sees zero employee rows
select app.set_request_context('83333333-3333-4333-8333-333333333333');
select is_empty(
  $$select * from public.hr_employees$$,
  'Staff Member without hr.view sees zero employee rows'
);

-- 7. HR-S1-04: Organization isolation
select is_empty(
  $$select * from public.hr_employees where organization_id = '8a222222-2222-4222-8222-222222222222'$$,
  'Employees of other organizations are invisible'
);

-- 8. HR-S1-08: Duplicate shift on same date for same employee is prevented
select app.set_request_context('81111111-1111-4111-8111-111111111111');
select throws_matching(
  $$insert into public.hr_shifts (
      organization_id, property_id, employee_id, date, shift_type
    ) values (
      '8a111111-1111-4111-8111-111111111111',
      '8b111111-1111-4111-8111-111111111111',
      '8e222222-2222-4222-8222-222222222222',
      '2026-10-10', 'evening'
    )$$,
  'hr_shifts_employee_date_key',
  'Duplicate shift on same date for one employee is refused by unique constraint'
);

-- 9. HR-S1-12: Payroll run and payslip creation
insert into public.hr_payroll_runs (
  id, organization_id, period, total_gross, total_net, status, approved_at
) values (
  '89111111-1111-4111-8111-111111111111',
  '8a111111-1111-4111-8111-111111111111',
  '2026-10', 65000.00, 48000.00, 'approved', now()
);

insert into public.hr_payslips (
  id, organization_id, payroll_run_id, employee_id, gross_pay, social_security_deduction, tax_deduction, stamp_duty, net_pay
) values (
  '89222222-2222-4222-8222-222222222222',
  '8a111111-1111-4111-8111-111111111111',
  '89111111-1111-4111-8111-111111111111',
  '8e222222-2222-4222-8222-222222222222',
  35000.00, 5250.00, 4462.50, 265.65, 25021.85
);

select results_eq(
  $$select total_gross, status from public.hr_payroll_runs where id = '89111111-1111-4111-8111-111111111111'$$,
  $$values (65000.00::numeric(12,2), 'approved')$$,
  'Payroll run is approved and recorded'
);

select results_eq(
  $$select net_pay from public.hr_payslips where id = '89222222-2222-4222-8222-222222222222'$$,
  $$values (25021.85::numeric(12,2))$$,
  'Payslip deductions and net pay are stored accurately'
);

-- 10. HR-S1-13: Hard DELETE is refused
select throws_matching(
  $$delete from public.hr_employees where id = '8e111111-1111-4111-8111-111111111111'$$,
  'permission denied',
  'Hard delete on hr_employees is denied by policy'
);

rollback;
