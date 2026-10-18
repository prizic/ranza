-- Human Resources and Payroll (Blueprint 5.11, HR-S1-*, RANZ-42)
-- "A Staff Member's record outlives their access to the system."
--
-- Every assertion carries the test_name of the edge-case row it proves
-- (docs/features/hr/edge-cases.csv), followed by what it asserts, and
-- tests/unit/hr-edge-cases.test.ts reads the table against this file.
--
-- Written after the policies it tests, and then each boundary was broken to see
-- it go red. Each break below was applied as DDL in the same transaction as
-- this suite (the suite's own ROLLBACK undoes it), after printing the definition
-- it changed, and the assertions named are the ones that went red, by what they
-- say. "Aborts" means a statement outside an assertion raised and took the rest
-- of the transaction with it, which is red for the suite and names nothing.
--
--   a  the draft guard removed from the run update policy
--        HR-S1-25: the application role's revert of an approved run matches nothing
--   b  hr_payslips_lifecycle_trg dropped
--        HR-S1-33: a payslip in another currency joins a run in lira
--        HR-S1-36: approving as somebody else is refused / a draft is approved
--        HR-S1-27: approving emits payroll.approved once
--        HR-S1-25: and the run is still approved
--   c1 app.hr_employee_is_manageable loses its reach and gates (keeps the
--      employee's existence and status)
--        HR-S1-23: leave requested under a suspended Subscription, a revoked
--        Entitlement, and at a Property with HR off
--      Not red, and why: a shift is also asked the Property's gates directly by
--      its own policy, so the helper's gates are subsumed there. They are the
--      only gates leave has.
--   c2 app.hr_employee_is_manageable forgets that an employee may have left
--        HR-S1-39: no new shift, no new leave, no decision on pending leave
--   s01 whole-Organization reach removed from the run insert policy
--        HR-S1-24: nor open one / hr.view reads the runs / every run policy asks
--   s02 the gates removed from the employee insert policy
--        HR-S1-22, HR-S1-26: an employee at a Property out of reach, one with
--        none; HR-S1-23: a suspended Subscription, a revoked Entitlement, a
--        Property with HR off, an Organization with it off everywhere, and the
--        catalogue of write policies
--   s03 hr_payroll_runs_lifecycle_trg dropped
--        HR-S1-35: a run with no payslips cannot be approved, then aborts
--   s04 hr_employees_termination_is_final_trg dropped
--        HR-S1-39: made active again / the day moved; HR-S1-46: dated tomorrow
--   s05 the Property key without its column list
--        HR-S1-21: a Property that has an employee can be deleted (the original
--        defect: NOT NULL on organization_id), what the key does, what it says
--   s06 employee reach removed from the leave read policy
--        HR-S1-22: only the leave of its employees; HR-S1-47: catalogue of reads
--   s08 the gates removed from the employee read policy
--        HR-S1-23: a lapsed Organization reads no employee; every read has them
--   s09 an UPDATE grant on a payslip column restored
--        HR-S1-36: a payslip is inserted and never updated
--   s10 the outbox definer's search_path restored to public, outbox, pg_temp
--        HR-S1-25: the definer has an empty search_path
--   s12 whole-Organization reach removed from the payslip insert policy
--        HR-S1-24: nor write a payslip / read the payslips they reach;
--        HR-S1-23: a payslip while any Property has HR
--   s13 the employee's reach removed from the shift read policy
--        HR-S1-22: only its shifts; HR-S1-47: only Mert's shifts, every shift
--        joins to an employee, catalogue of reads
--   s14 the period-has-ended check removed from the run lifecycle trigger
--        HR-S1-45: the running month, a month not started, even for the owner
--   s15 the future-day check removed from the termination trigger
--        HR-S1-46: dated tomorrow is refused / dated today is recorded
--   s16 the manageable check removed from the shift insert policy
--        HR-S1-39: a terminated employee is given no new shift
--   s17 the gates removed from the employee update policy
--        HR-S1-23: a Property with HR off cannot take a change to one, and the
--        catalogue of write policies. Not red, and why: the Subscription and
--        the Entitlement for an UPDATE. The row cannot be updated unless it can
--        be read, and the read policy asks the same two gates, so the update
--        policy's own copy is subsumed. They differ for the Property's
--        capability, which the read asks of the Organization and the update of
--        the Property, and that is the assertion.
--   s18 the gates removed from the payslip insert policy
--        HR-S1-23: a suspended Subscription, a revoked Entitlement, HR off at
--        every Property, and the catalogue of write policies
--   s19 the manageable check removed from the leave insert policy
--        HR-S1-23: a suspended Subscription, a revoked Entitlement, a Property
--        with HR off, the catalogue; HR-S1-39: nor new leave
--   s20 hr_employees_organization_login_key dropped
--        HR-S1-51: the index is unique over the Organization and the login /
--        a second record for the same login is refused by the index; and
--        HR-S1-03: hr.view reads the directory, which counts the duplicate
begin;
select plan(126);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into public.users (id, email) values
  ('91111111-1111-4111-8111-111111111111', 'hr-manager@example.test'),
  ('92222222-2222-4222-8222-222222222222', 'hr-viewer@example.test'),
  ('93333333-3333-4333-8333-333333333333', 'hr-noperms@example.test'),
  ('94444444-4444-4444-8444-444444444444', 'hr-linked@example.test'),
  ('95555555-5555-4555-8555-555555555555', 'hr-scoped@example.test'),
  ('96666666-6666-4666-8666-666666666666', 'hr-other@example.test');

insert into public.organizations (id, name, status) values
  ('9a111111-1111-4111-8111-111111111111', 'Hospitality Org', 'active'),
  ('9a222222-2222-4222-8222-222222222222', 'Other Org', 'active');

insert into public.subscriptions (organization_id, status) values
  ('9a111111-1111-4111-8111-111111111111', 'active'),
  ('9a222222-2222-4222-8222-222222222222', 'active');

insert into public.entitlements (organization_id, module_key, status) values
  ('9a111111-1111-4111-8111-111111111111', 'human_resources', 'active'),
  ('9a222222-2222-4222-8222-222222222222', 'human_resources', 'active');

insert into public.properties (id, organization_id, name) values
  ('9b111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111', 'Galata Hotel'),
  ('9b333333-3333-4333-8333-333333333333', '9a111111-1111-4111-8111-111111111111', 'Kadikoy Hotel'),
  ('9b444444-4444-4444-8444-444444444444', '9a111111-1111-4111-8111-111111111111', 'Closing Hotel'),
  ('9b222222-2222-4222-8222-222222222222', '9a222222-2222-4222-8222-222222222222', 'Other Org Property');

insert into public.property_capabilities (property_id, organization_id, capability_key, enabled) values
  ('9b111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111', 'staff_administration', true),
  ('9b333333-3333-4333-8333-333333333333', '9a111111-1111-4111-8111-111111111111', 'staff_administration', true),
  ('9b222222-2222-4222-8222-222222222222', '9a222222-2222-4222-8222-222222222222', 'staff_administration', true);

insert into public.staff_roles (id, scope_id, organization_id, key, name, permissions) values
  ('9d111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111', 'hr_manager', 'HR Manager',
   array['hr.manage', 'hr.view']),
  ('9d222222-2222-4222-8222-222222222222', '9a111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111', 'hr_viewer', 'HR Viewer',
   array['hr.view']),
  ('9d333333-3333-4333-8333-333333333333', '9a111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111', 'hr_noperms', 'No Perms',
   array[]::text[]),
  ('9d444444-4444-4444-8444-444444444444', '9a222222-2222-4222-8222-222222222222', '9a222222-2222-4222-8222-222222222222', 'hr_manager', 'HR Manager',
   array['hr.manage', 'hr.view']);

insert into public.organization_memberships (organization_id, user_id, role, role_scope_id, access_scope, status) values
  ('9a111111-1111-4111-8111-111111111111', '91111111-1111-4111-8111-111111111111', 'hr_manager', '9a111111-1111-4111-8111-111111111111', 'organization_wide', 'active'),
  ('9a111111-1111-4111-8111-111111111111', '92222222-2222-4222-8222-222222222222', 'hr_viewer', '9a111111-1111-4111-8111-111111111111', 'organization_wide', 'active'),
  ('9a111111-1111-4111-8111-111111111111', '93333333-3333-4333-8333-333333333333', 'hr_noperms', '9a111111-1111-4111-8111-111111111111', 'organization_wide', 'active'),
  ('9a111111-1111-4111-8111-111111111111', '94444444-4444-4444-8444-444444444444', 'hr_noperms', '9a111111-1111-4111-8111-111111111111', 'assigned_properties', 'active'),
  ('9a111111-1111-4111-8111-111111111111', '95555555-5555-4555-8555-555555555555', 'hr_manager', '9a111111-1111-4111-8111-111111111111', 'assigned_properties', 'active'),
  ('9a222222-2222-4222-8222-222222222222', '96666666-6666-4666-8666-666666666666', 'hr_manager', '9a222222-2222-4222-8222-222222222222', 'organization_wide', 'active');

-- The scoped manager reaches the Galata Hotel and nothing else.
insert into public.property_assignments (property_id, organization_id, user_id) values
  ('9b111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111', '95555555-5555-4555-8555-555555555555'),
  ('9b111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111', '94444444-4444-4444-8444-444444444444');

-- Employees are fixtures of the owner: what is under test below is the
-- application role, and this keeps the first write it makes its own.
insert into public.hr_employees
  (id, organization_id, property_id, user_id, first_name, last_name, department, position, gross_pay_minor, currency)
values
  -- Galata: linked to a login that is revoked below.
  ('9e222222-2222-4222-8222-222222222222', '9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111', '94444444-4444-4444-8444-444444444444', 'Mert', 'Polat', 'Front desk', 'Front Desk Agent', 3500000, 'TRY'),
  -- Kadikoy
  ('9e333333-3333-4333-8333-333333333333', '9a111111-1111-4111-8111-111111111111', '9b333333-3333-4333-8333-333333333333', null, 'Selin', 'Kaya', 'Kitchen', 'Cook', 2800000, 'TRY'),
  -- No Property: the whole Organization's
  ('9e444444-4444-4444-8444-444444444444', '9a111111-1111-4111-8111-111111111111', null, null, 'Deniz', 'Aksoy', 'Finance', 'Accountant', 4200000, 'TRY'),
  -- Paid in euros
  ('9e555555-5555-4555-8555-555555555555', '9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111', null, 'Eva', 'Meyer', 'Sales', 'Rep', 300000, 'EUR'),
  -- At a Property that is about to be deleted
  ('9e666666-6666-4666-8666-666666666666', '9a111111-1111-4111-8111-111111111111', '9b444444-4444-4444-8444-444444444444', null, 'Closing', 'Employee', 'Housekeeping', 'Housekeeper', 2500000, 'TRY'),
  -- Another Organization's
  ('9e777777-7777-4777-8777-777777777777', '9a222222-2222-4222-8222-222222222222', '9b222222-2222-4222-8222-222222222222', null, 'Other', 'Person', 'Kitchen', 'Cook', 2000000, 'TRY');

-- A run that was opened and not approved: what a payslip may still be written into.
insert into public.hr_payroll_runs (id, organization_id, period, currency) values
  ('99333333-3333-4333-8333-333333333333', '9a111111-1111-4111-8111-111111111111', '2026-06', 'TRY');

insert into public.hr_shifts (id, organization_id, property_id, employee_id, date, shift_type, start_time, end_time) values
  ('9f111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111', '9e222222-2222-4222-8222-222222222222', '2026-10-10', 'morning', '07:00', '15:00'),
  ('9f333333-3333-4333-8333-333333333333', '9a111111-1111-4111-8111-111111111111', '9b333333-3333-4333-8333-333333333333', '9e333333-3333-4333-8333-333333333333', '2026-10-12', 'morning', '07:00', '15:00'),
  -- A shift at the Galata Hotel for an employee with no Property, and one for
  -- an employee who is moved to the Kadikoy Hotel below: the two ways a shift
  -- can outlive a scoped manager's right to read the person it belongs to.
  ('9f555555-5555-4555-8555-555555555555', '9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111', '9e444444-4444-4444-8444-444444444444', '2026-10-14', 'day', '09:00', '18:00'),
  ('9f666666-6666-4666-8666-666666666666', '9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111', '9e555555-5555-4555-8555-555555555555', '2026-10-15', 'day', '09:00', '18:00');

insert into public.hr_leave_requests (id, organization_id, employee_id, leave_type, starts_on, ends_on, status) values
  ('9f222222-2222-4222-8222-222222222222', '9a111111-1111-4111-8111-111111111111', '9e222222-2222-4222-8222-222222222222', 'annual', '2026-10-15', '2026-10-18', 'approved'),
  ('9f444444-4444-4444-8444-444444444444', '9a111111-1111-4111-8111-111111111111', '9e333333-3333-4333-8333-333333333333', 'sick', '2026-10-20', '2026-10-21', 'pending');

-- ---------------------------------------------------------------------------
-- The record outlives the access (HR-S1-01, the ticket's "done when")
-- ---------------------------------------------------------------------------

-- The person is revoked as the table owner would revoke them, the way the
-- staff module does: the membership becomes `revoked`, nothing is deleted.
update public.organization_memberships
   set status = 'revoked', revoked_at = now()
 where user_id = '94444444-4444-4444-8444-444444444444';

set local role ranza_app;
select app.set_request_context('91111111-1111-4111-8111-111111111111');

select results_eq(
  $$select e.first_name, e.status, m.status as membership_status
      from public.hr_employees e
      join public.organization_memberships m on m.user_id = e.user_id
     where e.id = '9e222222-2222-4222-8222-222222222222'$$,
  $$values ('Mert', 'active', 'revoked')$$,
  'HR-S1-01: a Staff Member''s record is still there, active, when their membership is revoked'
);

select results_eq(
  $$select (select count(*)::int from public.hr_shifts where employee_id = '9e222222-2222-4222-8222-222222222222'),
          (select count(*)::int from public.hr_leave_requests where employee_id = '9e222222-2222-4222-8222-222222222222')$$,
  $$values (1, 1)$$,
  'HR-S1-01: and so are their shift and their leave'
);

-- ---------------------------------------------------------------------------
-- Registering and reading
-- ---------------------------------------------------------------------------

insert into public.hr_employees
  (id, organization_id, property_id, user_id, first_name, last_name, email, department, position, hired_on, gross_pay_minor)
values (
  '9e111111-1111-4111-8111-111111111111',
  '9a111111-1111-4111-8111-111111111111',
  '9b111111-1111-4111-8111-111111111111',
  null,
  'Ahmet', 'Yilmaz', 'ahmet@hotel.test', 'Housekeeping', 'Housekeeper', '2026-01-01', 3000000
);

select results_eq(
  $$select first_name, user_id is null, status, terminated_on is null
      from public.hr_employees where id = '9e111111-1111-4111-8111-111111111111'$$,
  $$values ('Ahmet', true, 'active', true)$$,
  'HR-S1-02: an employee record exists with no user and starts active'
);

select results_eq(
  $$select count(*)::int from public.hr_employees$$,
  $$values (6)$$,
  'HR-S1-03: a manager reaching the Organization reads all six of its employees, the one with no Property included'
);

select is_empty(
  $$select * from public.hr_employees where organization_id = '9a222222-2222-4222-8222-222222222222'$$,
  'HR-S1-04: another Organization''s employees are not read'
);

select throws_matching(
  $$insert into public.hr_employees
      (organization_id, property_id, first_name, last_name, department, position, gross_pay_minor)
    values ('9a222222-2222-4222-8222-222222222222', '9b222222-2222-4222-8222-222222222222',
            'Cross', 'Tenant', 'Kitchen', 'Cook', 100)$$,
  'row-level security',
  'HR-S1-04: and none is written into it'
);

-- A login is one record in an Organization (HR-S1-51). Mert is linked to
-- 94444444 above; a second record for the same login is refused by the index,
-- and says so by its name, so a refusal by some other rule cannot pass for it.
select results_eq(
  $$select indexdef from pg_indexes
     where schemaname = 'public' and indexname = 'hr_employees_organization_login_key'$$,
  $$values ('CREATE UNIQUE INDEX hr_employees_organization_login_key ON public.hr_employees USING btree (organization_id, user_id) WHERE (user_id IS NOT NULL)')$$,
  'HR-S1-51: the index is unique over the Organization and the login, for the records that have one'
);

select throws_matching(
  $$insert into public.hr_employees
      (organization_id, property_id, user_id, first_name, last_name, department, position, gross_pay_minor)
    values ('9a111111-1111-4111-8111-111111111111', '9b333333-3333-4333-8333-333333333333',
            '94444444-4444-4444-8444-444444444444', 'Mert', 'Twice', 'Kitchen', 'Cook', 100)$$,
  'hr_employees_organization_login_key',
  'HR-S1-51: a second record for the same login in the same Organization is refused by the index'
);

select ok(
  (select count(*) from public.hr_employees
    where organization_id = '9a111111-1111-4111-8111-111111111111' and user_id is null) > 1,
  'HR-S1-51: records without a login are not held to one, which is the normal case'
);

-- ---------------------------------------------------------------------------
-- Gates: wrong role, no permission, no reach
-- ---------------------------------------------------------------------------

select app.set_request_context('92222222-2222-4222-8222-222222222222');

select results_eq(
  $$select count(*)::int from public.hr_employees$$,
  $$values (6)$$,
  'HR-S1-03: hr.view reads the directory'
);

select throws_matching(
  $$insert into public.hr_employees
      (organization_id, property_id, first_name, last_name, department, position, gross_pay_minor)
    values ('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
            'Ali', 'Demir', 'Kitchen', 'Cook', 2800000)$$,
  'row-level security',
  'HR-S1-06: hr.view alone does not register an employee'
);

select is_empty(
  $$update public.hr_employees set position = 'Boss' where id = '9e222222-2222-4222-8222-222222222222' returning id$$,
  'HR-S1-06: nor change one'
);

select app.set_request_context('93333333-3333-4333-8333-333333333333');

select is_empty(
  $$select * from public.hr_employees$$,
  'HR-S1-05: a Staff Member without hr.view reads no employee'
);

select is(
  (select count(*) from public.hr_shifts) + (select count(*) from public.hr_leave_requests),
  0::bigint,
  'HR-S1-05: no shift and no leave request either'
);

-- ---------------------------------------------------------------------------
-- A manager who reaches one Property
-- ---------------------------------------------------------------------------

select app.set_request_context('95555555-5555-4555-8555-555555555555');

select results_eq(
  $$select first_name from public.hr_employees order by first_name$$,
  $$values ('Ahmet'), ('Eva'), ('Mert')$$,
  'HR-S1-22: reads only the employees of the Galata Hotel'
);

select results_eq(
  $$select count(*)::int from public.hr_shifts$$,
  $$values (2)$$,
  'HR-S1-22: and only its shifts, which are Mert''s and Eva''s'
);

select results_eq(
  $$select count(*)::int from public.hr_leave_requests$$,
  $$values (1)$$,
  'HR-S1-22: and only the leave of its employees'
);

select throws_matching(
  $$insert into public.hr_employees
      (organization_id, property_id, first_name, last_name, department, position, gross_pay_minor)
    values ('9a111111-1111-4111-8111-111111111111', '9b333333-3333-4333-8333-333333333333',
            'Out', 'Of Reach', 'Kitchen', 'Cook', 100)$$,
  'row-level security',
  'HR-S1-22: registering an employee at a Property they do not reach is refused'
);

select throws_matching(
  $$insert into public.hr_shifts (organization_id, property_id, employee_id, date, shift_type)
    values ('9a111111-1111-4111-8111-111111111111', '9b333333-3333-4333-8333-333333333333',
            '9e333333-3333-4333-8333-333333333333', '2026-10-13', 'day')$$,
  'row-level security',
  'HR-S1-22: so is a shift there'
);

select is_empty(
  $$update public.hr_employees set position = 'Boss' where id = '9e333333-3333-4333-8333-333333333333' returning id$$,
  'HR-S1-22: and changing an employee there matches nothing'
);

select is_empty(
  $$update public.hr_leave_requests set status = 'approved' where id = '9f444444-4444-4444-8444-444444444444' returning id$$,
  'HR-S1-22: and deciding their leave'
);

select throws_matching(
  $$insert into public.hr_employees
      (organization_id, property_id, first_name, last_name, department, position, gross_pay_minor)
    values ('9a111111-1111-4111-8111-111111111111', null,
            'No', 'Property', 'Kitchen', 'Cook', 100)$$,
  'row-level security',
  'HR-S1-26: an employee with no Property is the whole Organization''s, so a manager of one Property cannot register one'
);

select throws_matching(
  $$update public.hr_employees set property_id = null where id = '9e222222-2222-4222-8222-222222222222'$$,
  'row-level security',
  'HR-S1-26: nor move one out of their Property into the whole Organization'
);

select is_empty(
  $$select * from public.hr_employees where property_id is null$$,
  'HR-S1-26: and cannot read one'
);

-- ---------------------------------------------------------------------------
-- Constraints that hold for the manager of the whole Organization
-- ---------------------------------------------------------------------------

select app.set_request_context('91111111-1111-4111-8111-111111111111');

select throws_matching(
  $$insert into public.hr_shifts (organization_id, property_id, employee_id, date, shift_type)
    values ('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
            '9e222222-2222-4222-8222-222222222222', '2026-10-10', 'evening')$$,
  'hr_shifts_employee_date_key',
  'HR-S1-08: a second shift for one employee on one day is refused by the unique key'
);

select throws_matching(
  $$insert into public.hr_leave_requests (organization_id, employee_id, leave_type, starts_on, ends_on, status)
    values ('9a111111-1111-4111-8111-111111111111', '9e222222-2222-4222-8222-222222222222',
            'annual', '2026-10-16', '2026-10-17', 'approved')$$,
  'hr_leave_no_overlapping_approved',
  'HR-S1-19: approved leave over days already approved is refused by the exclusion constraint'
);

select throws_matching(
  $$insert into public.hr_leave_requests (organization_id, employee_id, leave_type, starts_on, ends_on, status)
    values ('9a111111-1111-4111-8111-111111111111', '9e222222-2222-4222-8222-222222222222',
            'annual', '2026-10-20', '2026-10-10', 'pending')$$,
  'hr_leave_dates_valid',
  'HR-S1-43: leave that ends before it starts is refused by a check'
);

select throws_matching(
  $$insert into public.hr_employees
      (organization_id, first_name, last_name, email, department, position, gross_pay_minor)
    values ('9a111111-1111-4111-8111-111111111111', 'Test', 'Clean', '   ', 'Front desk', 'Agent', 100)
    $$,
  'hr_employees_email_clean',
  'HR-S1-43: a blank email is refused by a check'
);

select throws_matching(
  $$insert into public.hr_employees
      (organization_id, first_name, last_name, department, position, gross_pay_minor, currency)
    values ('9a111111-1111-4111-8111-111111111111', 'Bad', 'Currency', 'Kitchen', 'Cook', 100, 'try')$$,
  'hr_employees_currency_check',
  'HR-S1-34: a currency code that is not three capitals is refused'
);

select throws_matching(
  $$insert into public.hr_employees
      (organization_id, first_name, last_name, department, position, gross_pay_minor)
    values ('9a111111-1111-4111-8111-111111111111', 'Neg', 'Pay', 'Kitchen', 'Cook', -1)$$,
  'hr_employees_gross_pay_minor_check',
  'HR-S1-32: a negative amount is refused'
);

select throws_matching(
  $$update public.hr_employees set currency = 'EUR' where id = '9e222222-2222-4222-8222-222222222222'$$,
  'permission denied',
  'HR-S1-34: and an employee''s currency is not in the update grant, so it is never restated'
);

-- ---------------------------------------------------------------------------
-- Hard deletes
-- ---------------------------------------------------------------------------

select throws_matching(
  $$delete from public.hr_employees where id = '9e111111-1111-4111-8111-111111111111'$$,
  'permission denied',
  'HR-S1-13: an employee cannot be deleted'
);

select throws_matching(
  $$delete from public.hr_payroll_runs$$,
  'permission denied',
  'HR-S1-13: nor a payroll run'
);

select throws_matching(
  $$delete from public.hr_payslips$$,
  'permission denied',
  'HR-S1-13: nor a payslip'
);

-- ---------------------------------------------------------------------------
-- Termination
-- ---------------------------------------------------------------------------

select lives_ok(
  $$update public.hr_employees
       set status = 'terminated', terminated_on = '2026-06-30'
     where id = '9e111111-1111-4111-8111-111111111111'$$,
  'HR-S1-29: an employee is terminated by a status and a date'
);

select results_eq(
  $$select first_name, status, terminated_on from public.hr_employees
     where id = '9e111111-1111-4111-8111-111111111111'$$,
  $$values ('Ahmet', 'terminated', '2026-06-30'::date)$$,
  'HR-S1-29: and the record is still there and readable'
);

select throws_matching(
  $$update public.hr_employees set status = 'active', terminated_on = null
     where id = '9e111111-1111-4111-8111-111111111111'$$,
  'stays terminated',
  'HR-S1-39: a terminated employee cannot be made active again'
);

select throws_matching(
  $$update public.hr_employees set terminated_on = '2026-07-31'
     where id = '9e111111-1111-4111-8111-111111111111'$$,
  'stays terminated',
  'HR-S1-39: nor have the day they left moved'
);

select throws_matching(
  $$update public.hr_employees set status = 'terminated'
     where id = '9e222222-2222-4222-8222-222222222222'$$,
  'hr_employees_termination_dated',
  'HR-S1-29: a termination without a day is refused by a check'
);

select throws_matching(
  $$update public.hr_employees set status = 'terminated', terminated_on = '2000-01-01'
     where id = '9e222222-2222-4222-8222-222222222222'$$,
  'hr_employees_terminated_after_hired',
  'HR-S1-29: nor one before the day they were hired'
);

set local role none;

select throws_matching(
  $$insert into public.hr_employees
      (organization_id, first_name, last_name, department, position, gross_pay_minor, status)
    values ('9a111111-1111-4111-8111-111111111111', 'On', 'Leave', 'Kitchen', 'Cook', 100, 'on_leave')$$,
  'hr_employees_status_check',
  'HR-S1-38: on_leave is not a status, so nothing can be left dangling in it'
);

select is(
  (select pg_get_constraintdef(oid) from pg_constraint
    where conname = 'hr_payroll_runs_status_check'),
  'CHECK ((status = ANY (ARRAY[''draft''::text, ''approved''::text])))',
  'HR-S1-38: a run is a draft or approved, and there is no paid'
);

-- The policy refuses an employee at a Property the writer does not reach, and
-- this is the key under it, which holds for a writer the policy does not bind.
select throws_matching(
  $$insert into public.hr_employees
      (organization_id, property_id, first_name, last_name, department, position, gross_pay_minor)
    values ('9a111111-1111-4111-8111-111111111111', '9b222222-2222-4222-8222-222222222222',
            'Cross', 'Org', 'Kitchen', 'Cook', 100)$$,
  'hr_employees_property_fkey',
  'HR-S1-20: another Organization''s Property is refused by the composite key, even for the table owner'
);

-- A Property with an employee can be deleted, and the employee stays.
select lives_ok(
  $$delete from public.properties where id = '9b444444-4444-4444-8444-444444444444'$$,
  'HR-S1-21: a Property that has an employee can be deleted'
);

select results_eq(
  $$select property_id is null, organization_id, status
      from public.hr_employees where id = '9e666666-6666-4666-8666-666666666666'$$,
  $$values (true, '9a111111-1111-4111-8111-111111111111'::uuid, 'active')$$,
  'HR-S1-21: deleting a Property nulls the employee''s Property and nothing else'
);

select is(
  (select pg_get_constraintdef(oid) from pg_constraint
    where conname = 'hr_employees_property_fkey'),
  'FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE SET NULL (property_id)',
  'HR-S1-21: the key says which column it nulls'
);

-- ---------------------------------------------------------------------------
-- Money is whole minor units
-- ---------------------------------------------------------------------------

select is_empty(
  $$select table_name || '.' || column_name
      from information_schema.columns
     where table_schema = 'public' and table_name like 'hr\_%'
       and data_type in ('numeric', 'real', 'double precision', 'money')$$,
  'HR-S1-32: no HR table holds a fractional amount'
);

select is(
  (select array_agg(table_name::text || '.' || column_name::text || ':' || data_type::text
                    order by (table_name::text || '.' || column_name::text) collate "C")
     from information_schema.columns
    where table_schema = 'public' and column_name like '%\_minor'
      and table_name like 'hr\_%'),
  array[
    'hr_employees.gross_pay_minor:bigint',
    'hr_payroll_runs.total_gross_minor:bigint',
    'hr_payroll_runs.total_net_minor:bigint',
    'hr_payslips.gross_pay_minor:bigint',
    'hr_payslips.net_pay_minor:bigint',
    'hr_payslips.social_security_deduction_minor:bigint',
    'hr_payslips.stamp_duty_minor:bigint',
    'hr_payslips.tax_deduction_minor:bigint',
    'hr_wage_changes.gross_pay_minor:bigint'
  ],
  'HR-S1-32: every amount is a bigint count of minor units'
);

-- ---------------------------------------------------------------------------
-- A payroll run: opened as a draft, approved once, then locked
-- ---------------------------------------------------------------------------

set local role ranza_app;
select app.set_request_context('91111111-1111-4111-8111-111111111111');

select throws_matching(
  $$insert into public.hr_payroll_runs (organization_id, period, currency, status)
    values ('9a111111-1111-4111-8111-111111111111', '2026-08', 'TRY', 'approved')$$,
  'permission denied',
  'HR-S1-36: the application role cannot insert a run as approved, because status is not in its insert grant'
);

insert into public.hr_payroll_runs
  (id, organization_id, period, currency, total_gross_minor, total_net_minor)
values ('99111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111',
        '2026-09', 'TRY', 3500055, 2502224);

select results_eq(
  $$select status, approved_at is null, approved_by is null
      from public.hr_payroll_runs where id = '99111111-1111-4111-8111-111111111111'$$,
  $$values ('draft', true, true)$$,
  'HR-S1-36: a run is opened as a draft'
);

select throws_matching(
  $$update public.hr_payroll_runs
       set status = 'approved', approved_at = now(),
           approved_by = '91111111-1111-4111-8111-111111111111'
     where id = '99111111-1111-4111-8111-111111111111'$$,
  'no payslips',
  'HR-S1-35: a run with no payslips cannot be approved'
);

insert into public.hr_payslips
  (id, organization_id, payroll_run_id, employee_id, gross_pay_minor,
   social_security_deduction_minor, tax_deduction_minor, stamp_duty_minor, net_pay_minor)
values ('99222222-2222-4222-8222-222222222222', '9a111111-1111-4111-8111-111111111111',
        '99111111-1111-4111-8111-111111111111', '9e222222-2222-4222-8222-222222222222',
        3500000, 525000, 446250, 26565, 2502185);

select throws_matching(
  $$update public.hr_payroll_runs
       set status = 'approved', approved_at = now(),
           approved_by = '91111111-1111-4111-8111-111111111111'
     where id = '99111111-1111-4111-8111-111111111111'$$,
  'must equal the sum of its payslips',
  'HR-S1-35: totals that are not the sum of the payslips are refused'
);

select throws_matching(
  $$insert into public.hr_payslips
      (organization_id, payroll_run_id, employee_id, gross_pay_minor,
       social_security_deduction_minor, tax_deduction_minor, stamp_duty_minor, net_pay_minor)
    values ('9a111111-1111-4111-8111-111111111111', '99111111-1111-4111-8111-111111111111',
            '9e333333-3333-4333-8333-333333333333', 100, 0, 0, 0, 99)$$,
  'hr_payslips_net_is_gross_less_deductions',
  'HR-S1-35: a payslip whose parts do not add up is refused'
);

select throws_matching(
  $$insert into public.hr_payslips
      (organization_id, payroll_run_id, employee_id, gross_pay_minor,
       social_security_deduction_minor, tax_deduction_minor, stamp_duty_minor, net_pay_minor)
    values ('9a111111-1111-4111-8111-111111111111', '99111111-1111-4111-8111-111111111111',
            '9e555555-5555-4555-8555-555555555555', 300000, 0, 0, 0, 300000)$$,
  'one currency',
  'HR-S1-33: a payslip for an employee paid in euros cannot join a run in lira'
);

select throws_matching(
  $$update public.hr_payslips set net_pay_minor = net_pay_minor
     where id = '99222222-2222-4222-8222-222222222222'$$,
  'permission denied',
  'HR-S1-36: a payslip is inserted and never updated, so it has no update grant'
);

-- Fix the totals to the payslip's, then approve, naming somebody else first.
set local role none;
update public.hr_payroll_runs
   set total_gross_minor = 3500000, total_net_minor = 2502185
 where id = '99111111-1111-4111-8111-111111111111';
set local role ranza_app;
select app.set_request_context('91111111-1111-4111-8111-111111111111');

select throws_matching(
  $$update public.hr_payroll_runs
       set status = 'approved', approved_at = now(),
           approved_by = '92222222-2222-4222-8222-222222222222'
     where id = '99111111-1111-4111-8111-111111111111'$$,
  'row-level security',
  'HR-S1-36: approving as somebody else is refused'
);

select lives_ok(
  $$update public.hr_payroll_runs
       set status = 'approved', approved_at = now(),
           approved_by = '91111111-1111-4111-8111-111111111111'
     where id = '99111111-1111-4111-8111-111111111111'$$,
  'HR-S1-36: a draft whose totals are its payslips'' is approved, by the person approving it'
);

-- The approval emitted exactly one event.
set local role ranza_worker;
select results_eq(
  $$select count(*)::int, min(payload ->> 'currency'),
           min((payload ->> 'totalGrossMinor')::bigint)
      from outbox.events
     where organization_id = '9a111111-1111-4111-8111-111111111111'
       and event_type = 'payroll.approved'$$,
  $$values (1, 'TRY', 3500000::bigint)$$,
  'HR-S1-27: approving a run emits payroll.approved once, in minor units and its currency'
);
set local role ranza_app;
select app.set_request_context('91111111-1111-4111-8111-111111111111');

-- lives_ok and then a read, not is_empty over the update: if the policy stopped
-- matching only drafts the trigger would raise, and a raise inside is_empty
-- aborts the transaction and takes every assertion after it with it.
select lives_ok(
  $$update public.hr_payroll_runs set status = 'draft' where id = '99111111-1111-4111-8111-111111111111'$$,
  'HR-S1-25: the application role''s revert of an approved run matches nothing and raises nothing, because the update policy matches only drafts'
);

select results_eq(
  $$select status from public.hr_payroll_runs where id = '99111111-1111-4111-8111-111111111111'$$,
  $$values ('approved')$$,
  'HR-S1-25: and the run is still approved'
);

select is_empty(
  $$update public.hr_payroll_runs set status = 'approved', approved_at = now()
     where id = '99111111-1111-4111-8111-111111111111' returning id$$,
  'HR-S1-27: nor approve it again'
);

-- The owner: the policies say nothing to it, the trigger does.
set local role none;

select throws_matching(
  $$update public.hr_payroll_runs set total_gross_minor = 1 where id = '99111111-1111-4111-8111-111111111111'$$,
  'cannot be changed',
  'HR-S1-25: even the table owner cannot change its totals'
);

select throws_matching(
  $$update public.hr_payroll_runs set status = 'draft' where id = '99111111-1111-4111-8111-111111111111'$$,
  'cannot be changed',
  'HR-S1-25: nor revert it to a draft'
);

select throws_matching(
  $$update public.hr_payslips set net_pay_minor = net_pay_minor where id = '99222222-2222-4222-8222-222222222222'$$,
  'cannot be changed',
  'HR-S1-25: nor touch one of its payslips'
);

select throws_matching(
  $$delete from public.hr_payslips where id = '99222222-2222-4222-8222-222222222222'$$,
  'cannot be changed',
  'HR-S1-25: nor delete one'
);

select throws_matching(
  $$delete from public.hr_payroll_runs where id = '99111111-1111-4111-8111-111111111111'$$,
  'cannot be deleted',
  'HR-S1-25: nor delete the run'
);

select throws_matching(
  $$insert into public.hr_payslips
      (organization_id, payroll_run_id, employee_id, gross_pay_minor, net_pay_minor)
    values ('9a111111-1111-4111-8111-111111111111', '99111111-1111-4111-8111-111111111111',
            '9e333333-3333-4333-8333-333333333333', 100, 100)$$,
  'cannot be changed',
  'HR-S1-25: nor add a payslip to it'
);

select throws_matching(
  $$insert into public.hr_payroll_runs (organization_id, period, currency, status, approved_at, approved_by)
    values ('9a111111-1111-4111-8111-111111111111', '2026-07', 'TRY', 'approved', now(),
            '91111111-1111-4111-8111-111111111111')$$,
  'opened as a draft',
  'HR-S1-36: even the owner cannot insert a run already approved'
);

-- Re-approval by the owner is a no-op: nothing changes, nothing is emitted.
with attempt as (
  update public.hr_payroll_runs set status = 'approved'
   where id = '99111111-1111-4111-8111-111111111111' returning id
)
select is(
  (select count(*)::int from attempt),
  0,
  'HR-S1-27: restating an approved run changes no row, even for the table owner'
);

select is(
  (select count(*)::int from outbox.events
    where organization_id = '9a111111-1111-4111-8111-111111111111'
      and event_type = 'payroll.approved'),
  1,
  'HR-S1-27: and emits no second event'
);

-- ---------------------------------------------------------------------------
-- Payroll is the whole Organization's
-- ---------------------------------------------------------------------------

set local role ranza_app;

select app.set_request_context('95555555-5555-4555-8555-555555555555');

select is_empty(
  $$select * from public.hr_payroll_runs$$,
  'HR-S1-24: a manager of one Property cannot read a payroll run, which has no Property to narrow to'
);

select throws_matching(
  $$insert into public.hr_payroll_runs (organization_id, period, currency)
    values ('9a111111-1111-4111-8111-111111111111', '2026-08', 'TRY')$$,
  'row-level security',
  'HR-S1-24: nor open one'
);

select throws_matching(
  $$insert into public.hr_payslips
      (organization_id, payroll_run_id, employee_id, gross_pay_minor, net_pay_minor)
    values ('9a111111-1111-4111-8111-111111111111', '99333333-3333-4333-8333-333333333333',
            '9e222222-2222-4222-8222-222222222222', 100, 100)$$,
  'row-level security',
  'HR-S1-24: nor write a payslip'
);

select results_eq(
  $$select count(*)::int from public.hr_payslips$$,
  $$values (1)$$,
  'HR-S1-24: but reads the payslips of the employees they reach'
);

select app.set_request_context('92222222-2222-4222-8222-222222222222');

select results_eq(
  $$select count(*)::int from public.hr_payroll_runs$$,
  $$values (2)$$,
  'HR-S1-24: hr.view with reach to every Property reads the runs'
);

select throws_matching(
  $$insert into public.hr_payroll_runs (organization_id, period, currency)
    values ('9a111111-1111-4111-8111-111111111111', '2026-08', 'TRY')$$,
  'row-level security',
  'HR-S1-24: but hr.view does not open one'
);

select throws_matching(
  $$insert into public.hr_payslips
      (organization_id, payroll_run_id, employee_id, gross_pay_minor, net_pay_minor)
    values ('9a111111-1111-4111-8111-111111111111', '99333333-3333-4333-8333-333333333333',
            '9e222222-2222-4222-8222-222222222222', 100, 100)$$,
  'row-level security',
  'HR-S1-06: nor write a payslip'
);

select throws_matching(
  $$insert into public.hr_shifts (organization_id, property_id, employee_id, date, shift_type)
    values ('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
            '9e222222-2222-4222-8222-222222222222', '2026-10-14', 'day')$$,
  'row-level security',
  'HR-S1-06: nor assign a shift'
);

select throws_matching(
  $$insert into public.hr_leave_requests (organization_id, employee_id, leave_type, starts_on, ends_on)
    values ('9a111111-1111-4111-8111-111111111111', '9e222222-2222-4222-8222-222222222222',
            'annual', '2026-12-01', '2026-12-02')$$,
  'row-level security',
  'HR-S1-06: nor request leave for someone'
);

select app.set_request_context('93333333-3333-4333-8333-333333333333');

select is_empty(
  $$select * from public.hr_payroll_runs$$,
  'HR-S1-05: without hr.view there is no run to read'
);

-- ---------------------------------------------------------------------------
-- Every gate denies on its own (blueprint 3.5, ADR 0012)
-- ---------------------------------------------------------------------------
-- Four gates, each closed alone while the others stay open, and each asked of
-- every kind of write the module makes: an employee registered and changed, a
-- shift, leave, a payslip and a run. A gate that only the employee insert asked
-- would pass every assertion here and leave the rest of HR open to a lapsed
-- Organization.

select app.set_request_context('91111111-1111-4111-8111-111111111111');

select lives_ok(
  $$insert into public.hr_employees
      (organization_id, property_id, first_name, last_name, department, position, gross_pay_minor)
    values ('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
            'Gate', 'Open', 'Kitchen', 'Cook', 100)$$,
  'HR-S1-23: with every gate open, a manager registers an employee'
);

select lives_ok(
  $$insert into public.hr_shifts (organization_id, property_id, employee_id, date, shift_type)
    values ('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
            '9e222222-2222-4222-8222-222222222222', '2026-11-02', 'day')$$,
  'HR-S1-23: and assigns a shift'
);

-- Gate 1: the Subscription.
set local role none;
update public.subscriptions set status = 'suspended'
 where organization_id = '9a111111-1111-4111-8111-111111111111';
set local role ranza_app;
select app.set_request_context('91111111-1111-4111-8111-111111111111');
select throws_matching(
  $$insert into public.hr_employees
      (organization_id, property_id, first_name, last_name, department, position, gross_pay_minor)
    values ('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
            'Gate', 'Closed', 'Kitchen', 'Cook', 100)$$,
  'row-level security',
  'HR-S1-23: a suspended Subscription stops an employee being registered'
);
select is_empty(
  $$update public.hr_employees set position = 'Boss'
     where id = '9e222222-2222-4222-8222-222222222222' returning id$$,
  'HR-S1-23: a suspended Subscription stops an employee being changed'
);
select throws_matching(
  $$insert into public.hr_shifts (organization_id, property_id, employee_id, date, shift_type)
    values ('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
            '9e222222-2222-4222-8222-222222222222', '2026-11-03', 'day')$$,
  'row-level security',
  'HR-S1-23: a suspended Subscription stops a shift being assigned'
);
select throws_matching(
  $$insert into public.hr_leave_requests (organization_id, employee_id, leave_type, starts_on, ends_on)
    values ('9a111111-1111-4111-8111-111111111111', '9e222222-2222-4222-8222-222222222222',
            'annual', '2026-12-01', '2026-12-02')$$,
  'row-level security',
  'HR-S1-23: a suspended Subscription stops leave being requested'
);
select throws_matching(
  $$insert into public.hr_payslips
      (organization_id, payroll_run_id, employee_id, gross_pay_minor, net_pay_minor)
    values ('9a111111-1111-4111-8111-111111111111', '99333333-3333-4333-8333-333333333333',
            '9e222222-2222-4222-8222-222222222222', 100, 100)$$,
  'row-level security',
  'HR-S1-23: a suspended Subscription stops a payslip being written'
);
select throws_matching(
  $$insert into public.hr_payroll_runs (organization_id, period, currency)
    values ('9a111111-1111-4111-8111-111111111111', '2026-08', 'TRY')$$,
  'row-level security',
  'HR-S1-23: a suspended Subscription stops payroll being opened'
);
select is_empty(
  $$select * from public.hr_employees$$,
  'HR-S1-23: and a read carries the gates too, so a lapsed Organization reads no employee'
);

-- Past due is a grace period (ADR 0040), not a lapse.
set local role none;
update public.subscriptions set status = 'past_due'
 where organization_id = '9a111111-1111-4111-8111-111111111111';
set local role ranza_app;
select app.set_request_context('91111111-1111-4111-8111-111111111111');

select lives_ok(
  $$insert into public.hr_employees
      (organization_id, property_id, first_name, last_name, department, position, gross_pay_minor)
    values ('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
            'Grace', 'Period', 'Kitchen', 'Cook', 100)$$,
  'HR-S1-23: past due is a grace period and does not stop it'
);

-- Gate 2: the Entitlement.
set local role none;
update public.subscriptions set status = 'active'
 where organization_id = '9a111111-1111-4111-8111-111111111111';
update public.entitlements set status = 'revoked'
 where organization_id = '9a111111-1111-4111-8111-111111111111'
   and module_key = 'human_resources';
set local role ranza_app;
select app.set_request_context('91111111-1111-4111-8111-111111111111');
select throws_matching(
  $$insert into public.hr_employees
      (organization_id, property_id, first_name, last_name, department, position, gross_pay_minor)
    values ('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
            'Gate', 'Two', 'Kitchen', 'Cook', 100)$$,
  'row-level security',
  'HR-S1-23: an Entitlement the Subscription does not include stops an employee being registered'
);
select is_empty(
  $$update public.hr_employees set position = 'Boss'
     where id = '9e222222-2222-4222-8222-222222222222' returning id$$,
  'HR-S1-23: an Entitlement the Subscription does not include stops an employee being changed'
);
select throws_matching(
  $$insert into public.hr_shifts (organization_id, property_id, employee_id, date, shift_type)
    values ('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
            '9e222222-2222-4222-8222-222222222222', '2026-11-04', 'day')$$,
  'row-level security',
  'HR-S1-23: an Entitlement the Subscription does not include stops a shift being assigned'
);
select throws_matching(
  $$insert into public.hr_leave_requests (organization_id, employee_id, leave_type, starts_on, ends_on)
    values ('9a111111-1111-4111-8111-111111111111', '9e222222-2222-4222-8222-222222222222',
            'annual', '2026-12-01', '2026-12-02')$$,
  'row-level security',
  'HR-S1-23: an Entitlement the Subscription does not include stops leave being requested'
);
select throws_matching(
  $$insert into public.hr_payslips
      (organization_id, payroll_run_id, employee_id, gross_pay_minor, net_pay_minor)
    values ('9a111111-1111-4111-8111-111111111111', '99333333-3333-4333-8333-333333333333',
            '9e222222-2222-4222-8222-222222222222', 100, 100)$$,
  'row-level security',
  'HR-S1-23: an Entitlement the Subscription does not include stops a payslip being written'
);
select throws_matching(
  $$insert into public.hr_payroll_runs (organization_id, period, currency)
    values ('9a111111-1111-4111-8111-111111111111', '2026-08', 'TRY')$$,
  'row-level security',
  'HR-S1-23: an Entitlement the Subscription does not include stops payroll being opened'
);

-- Gate 3: the Property's capability, off at the Galata Hotel only. The Kadikoy
-- Hotel still has HR, so what belongs to the Organization still passes and what
-- belongs to the Galata Hotel does not.
set local role none;
update public.entitlements set status = 'active'
 where organization_id = '9a111111-1111-4111-8111-111111111111'
   and module_key = 'human_resources';
update public.property_capabilities set enabled = false
 where property_id = '9b111111-1111-4111-8111-111111111111'
   and capability_key = 'staff_administration';
set local role ranza_app;
select app.set_request_context('91111111-1111-4111-8111-111111111111');
select throws_matching(
  $$insert into public.hr_employees
      (organization_id, property_id, first_name, last_name, department, position, gross_pay_minor)
    values ('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
            'Gate', 'Three', 'Kitchen', 'Cook', 100)$$,
  'row-level security',
  'HR-S1-23: a Property that has not switched HR on cannot take an employee'
);
select is_empty(
  $$update public.hr_employees set position = 'Boss'
     where id = '9e222222-2222-4222-8222-222222222222' returning id$$,
  'HR-S1-23: a Property that has not switched HR on cannot take a change to one'
);
select throws_matching(
  $$insert into public.hr_shifts (organization_id, property_id, employee_id, date, shift_type)
    values ('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
            '9e222222-2222-4222-8222-222222222222', '2026-11-05', 'day')$$,
  'row-level security',
  'HR-S1-23: a Property that has not switched HR on cannot take a shift'
);
select throws_matching(
  $$insert into public.hr_leave_requests (organization_id, employee_id, leave_type, starts_on, ends_on)
    values ('9a111111-1111-4111-8111-111111111111', '9e222222-2222-4222-8222-222222222222',
            'annual', '2026-12-01', '2026-12-02')$$,
  'row-level security',
  'HR-S1-23: a Property that has not switched HR on cannot take leave for one'
);
select lives_ok(
  $$insert into public.hr_employees
      (organization_id, property_id, first_name, last_name, department, position, gross_pay_minor)
    values ('9a111111-1111-4111-8111-111111111111', '9b333333-3333-4333-8333-333333333333',
            'Gate', 'Elsewhere', 'Kitchen', 'Cook', 100)$$,
  'HR-S1-23: but another Property that has can'
);

select lives_ok(
  $$insert into public.hr_payslips
      (organization_id, payroll_run_id, employee_id, gross_pay_minor, net_pay_minor)
    values ('9a111111-1111-4111-8111-111111111111', '99333333-3333-4333-8333-333333333333',
            '9e222222-2222-4222-8222-222222222222', 100, 100)$$,
  'HR-S1-23: and a payslip, which is the Organization''s, is written while any Property has it'
);

-- Gate 3 again, off at every Property: nothing the Organization owns passes.
set local role none;
update public.property_capabilities set enabled = false
 where property_id = '9b333333-3333-4333-8333-333333333333'
   and capability_key = 'staff_administration';
set local role ranza_app;
select app.set_request_context('91111111-1111-4111-8111-111111111111');
select throws_matching(
  $$insert into public.hr_payslips
      (organization_id, payroll_run_id, employee_id, gross_pay_minor, net_pay_minor)
    values ('9a111111-1111-4111-8111-111111111111', '99333333-3333-4333-8333-333333333333',
            '9e222222-2222-4222-8222-222222222222', 100, 100)$$,
  'row-level security',
  'HR-S1-23: an Organization with HR off at every Property cannot take a payslip'
);
select throws_matching(
  $$insert into public.hr_payroll_runs (organization_id, period, currency)
    values ('9a111111-1111-4111-8111-111111111111', '2026-07', 'TRY')$$,
  'row-level security',
  'HR-S1-23: an Organization with HR off at every Property cannot take a payroll run'
);
select throws_matching(
  $$insert into public.hr_employees
      (organization_id, property_id, first_name, last_name, department, position, gross_pay_minor)
    values ('9a111111-1111-4111-8111-111111111111', null,
            'Gate', 'Floater', 'Kitchen', 'Cook', 100)$$,
  'row-level security',
  'HR-S1-23: an Organization with HR off at every Property cannot take an employee with no Property'
);

set local role none;
update public.property_capabilities set enabled = true
 where capability_key = 'staff_administration'
   and property_id in ('9b111111-1111-4111-8111-111111111111', '9b333333-3333-4333-8333-333333333333');
set local role ranza_app;
select app.set_request_context('91111111-1111-4111-8111-111111111111');


-- ---------------------------------------------------------------------------
-- The rota is read where the employee is (HR-S1-47)
-- ---------------------------------------------------------------------------
-- A shift came back joined to no employee for a manager who could read the
-- shift and not the person, and broke the page that listed it. Two ways to get
-- there: an employee with no Property, rostered at the Galata Hotel by the
-- whole Organization's manager, and an employee moved to the Kadikoy Hotel
-- whose old shifts stay at the Galata Hotel.

set local role none;
update public.hr_employees
   set property_id = '9b333333-3333-4333-8333-333333333333'
 where id = '9e555555-5555-4555-8555-555555555555';
set local role ranza_app;

select app.set_request_context('95555555-5555-4555-8555-555555555555');

select results_eq(
  $$select distinct employee_id from public.hr_shifts$$,
  $$values ('9e222222-2222-4222-8222-222222222222'::uuid)$$,
  'HR-S1-47: a manager of the Galata Hotel reads only Mert''s shifts, not the floater''s nor those of an employee moved away'
);

select is(
  (select count(*) from public.hr_shifts),
  (select count(*) from public.hr_shifts as shift
     join public.hr_employees as employee on employee.id = shift.employee_id),
  'HR-S1-47: so every shift they read joins to an employee they can read'
);

select app.set_request_context('91111111-1111-4111-8111-111111111111');

select results_eq(
  $$select count(*)::int from public.hr_shifts where property_id = '9b111111-1111-4111-8111-111111111111'$$,
  $$values (4)$$,
  'HR-S1-47: and the manager of the whole Organization still reads all four of the Galata Hotel''s shifts'
);

-- ---------------------------------------------------------------------------
-- A period is approved once it has ended (HR-S1-45)
-- ---------------------------------------------------------------------------

select is(
  app.hr_today('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111'),
  (select (now() at time zone property.timezone)::date from public.properties as property
    where property.id = '9b111111-1111-4111-8111-111111111111'),
  'HR-S1-45: a Property''s today is its own calendar date'
);

select is(
  app.hr_today('9a111111-1111-4111-8111-111111111111'),
  (select min((now() at time zone property.timezone)::date) from public.properties as property
    where property.organization_id = '9a111111-1111-4111-8111-111111111111' and property.status = 'active'),
  'HR-S1-45: and an Organization''s is the earliest of its Properties'''
);

select throws_matching(
  format($$insert into public.hr_payroll_runs (organization_id, period, currency)
           values ('9a111111-1111-4111-8111-111111111111', %L, 'TRY')$$,
         to_char(app.hr_today('9a111111-1111-4111-8111-111111111111'), 'YYYY-MM')),
  'only once it has ended',
  'HR-S1-45: a run for the month that is running is refused'
);

select throws_matching(
  format($$insert into public.hr_payroll_runs (organization_id, period, currency)
           values ('9a111111-1111-4111-8111-111111111111', %L, 'TRY')$$,
         to_char(app.hr_today('9a111111-1111-4111-8111-111111111111') + interval '2 months', 'YYYY-MM')),
  'only once it has ended',
  'HR-S1-45: and for a month that has not started'
);

select lives_ok(
  $$insert into public.hr_payroll_runs (organization_id, period, currency)
    values ('9a111111-1111-4111-8111-111111111111', '2026-04', 'TRY')$$,
  'HR-S1-45: but a month that has ended is opened'
);

set local role none;

select throws_matching(
  format($$insert into public.hr_payroll_runs (organization_id, period, currency)
           values ('9a111111-1111-4111-8111-111111111111', %L, 'TRY')$$,
         to_char(app.hr_today('9a111111-1111-4111-8111-111111111111') + interval '2 months', 'YYYY-MM')),
  'only once it has ended',
  'HR-S1-45: even for the table owner'
);

set local role ranza_app;
select app.set_request_context('91111111-1111-4111-8111-111111111111');

-- ---------------------------------------------------------------------------
-- A termination has happened (HR-S1-46) and a leaver takes no new work (HR-S1-39)
-- ---------------------------------------------------------------------------

select throws_matching(
  format($$update public.hr_employees
              set status = 'terminated', terminated_on = %L
            where id = '9e333333-3333-4333-8333-333333333333'$$,
         app.hr_today('9a111111-1111-4111-8111-111111111111',
                      '9b333333-3333-4333-8333-333333333333') + 1),
  'not ahead of it',
  'HR-S1-46: a termination dated tomorrow is refused'
);

select lives_ok(
  format($$update public.hr_employees
              set status = 'terminated', terminated_on = %L
            where id = '9e333333-3333-4333-8333-333333333333'$$,
         app.hr_today('9a111111-1111-4111-8111-111111111111',
                      '9b333333-3333-4333-8333-333333333333')),
  'HR-S1-46: and one dated today is recorded'
);

select throws_matching(
  $$insert into public.hr_shifts (organization_id, property_id, employee_id, date, shift_type)
    values ('9a111111-1111-4111-8111-111111111111', '9b333333-3333-4333-8333-333333333333',
            '9e333333-3333-4333-8333-333333333333', '2027-01-04', 'day')$$,
  'row-level security',
  'HR-S1-39: a terminated employee is given no new shift'
);

select throws_matching(
  $$insert into public.hr_leave_requests (organization_id, employee_id, leave_type, starts_on, ends_on)
    values ('9a111111-1111-4111-8111-111111111111', '9e333333-3333-4333-8333-333333333333',
            'annual', '2027-02-01', '2027-02-02')$$,
  'row-level security',
  'HR-S1-39: nor new leave'
);

select is_empty(
  $$update public.hr_leave_requests set status = 'approved'
     where id = '9f444444-4444-4444-8444-444444444444' returning id$$,
  'HR-S1-39: nor is the leave they left pending decided'
);

-- ---------------------------------------------------------------------------
-- What the catalogue says, read without raising on anything missing
-- ---------------------------------------------------------------------------

select is_empty(
  $$select tablename || '.' || policyname
      from pg_policies
     where schemaname = 'public' and tablename like 'hr\_%'
       and cmd in ('INSERT', 'UPDATE')
       and coalesce(qual, '') || coalesce(with_check, '') !~ '(can_use_capability|hr_employee_is_manageable)'$$,
  'HR-S1-23: every HR write policy carries the commercial gates'
);

select is_empty(
  $$select tablename || '.' || policyname
      from pg_policies
     where schemaname = 'public' and tablename like 'hr\_%' and cmd = 'SELECT'
       and coalesce(qual, '') !~ 'can_use_capability'$$,
  'HR-S1-23: and every HR read policy does'
);

select is_empty(
  $$select tablename || '.' || policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in ('hr_shifts', 'hr_leave_requests', 'hr_payslips')
       and cmd = 'SELECT'
       and coalesce(qual, '') !~ 'hr_employee_is_reachable'$$,
  'HR-S1-47: every read of something that belongs to an employee asks whether the reader reaches that employee'
);

select is_empty(
  $$select tablename || '.' || policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in ('hr_payroll_runs')
       and coalesce(qual, '') || coalesce(with_check, '') !~ 'has_organization_wide_reach'$$,
  'HR-S1-24: every payroll run policy asks for reach to the whole Organization'
);

select is_empty(
  $$select tablename || '.' || policyname
      from pg_policies
     where schemaname = 'public' and tablename like 'hr\_%'
       and (roles <> '{ranza_app}' or cmd = 'DELETE')$$,
  'HR-S1-13: every HR policy is for ranza_app and none is for DELETE'
);

select is_empty(
  $$select c.relname
      from pg_class as c
      cross join lateral aclexplode(c.relacl) as a
     where c.relname like 'hr\_%' and c.relnamespace = 'public'::regnamespace
       and a.grantee = 'ranza_app'::regrole and a.privilege_type = 'DELETE'$$,
  'HR-S1-13: ranza_app holds no DELETE on any HR table'
);

select is(
  (select proconfig from pg_proc
    where proname = 'hr_payroll_run_emit_outbox' and pronamespace = 'public'::regnamespace),
  array['search_path=""'],
  'HR-S1-25: the definer that writes the outbox has an empty search_path'
);

select * from finish();
rollback;
