-- ===========================================================================
-- Human Resources and Payroll (Blueprint 5.11, Phase 4)
-- Staff records beyond membership: contracts, shifts, pay.
-- "Membership is access, not employment, and conflating the two is the
-- mistake to avoid here. A Staff Member's record outlives their access."
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.hr_employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  property_id uuid references public.properties (id) on delete set null,
  user_id uuid references public.users (id) on delete set null,
  first_name text not null check (btrim(first_name) <> ''),
  last_name text not null check (btrim(last_name) <> ''),
  email text,
  phone text,
  department text not null check (btrim(department) <> ''),
  position text not null check (btrim(position) <> ''),
  contract_type text not null default 'full_time' check (contract_type in ('full_time', 'part_time', 'seasonal', 'fixed_term')),
  hired_on date not null default current_date,
  gross_pay numeric(12, 2) not null default 0.00 check (gross_pay >= 0),
  currency char(3) not null default 'TRY',
  status text not null default 'active' check (status in ('active', 'terminated', 'on_leave')),
  bank_name text,
  iban text,
  created_at timestamptz(6) not null default now(),
  updated_at timestamptz(6) not null default now()
);

create table public.hr_shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  property_id uuid not null references public.properties (id) on delete restrict,
  employee_id uuid not null references public.hr_employees (id) on delete restrict,
  date date not null,
  shift_type text not null check (shift_type in ('morning', 'evening', 'day', 'off')),
  start_time text not null default '09:00',
  end_time text not null default '18:00',
  notes text,
  created_at timestamptz(6) not null default now(),
  updated_at timestamptz(6) not null default now(),
  constraint hr_shifts_employee_date_key unique (organization_id, employee_id, date)
);

create table public.hr_leave_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  employee_id uuid not null references public.hr_employees (id) on delete restrict,
  leave_type text not null default 'annual' check (leave_type in ('annual', 'sick', 'unpaid', 'emergency', 'maternity')),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  notes text,
  created_at timestamptz(6) not null default now(),
  updated_at timestamptz(6) not null default now(),
  constraint hr_leave_dates_valid check (ends_on >= starts_on)
);

create table public.hr_payroll_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  total_gross numeric(12, 2) not null default 0.00 check (total_gross >= 0),
  total_net numeric(12, 2) not null default 0.00 check (total_net >= 0),
  status text not null default 'draft' check (status in ('draft', 'approved', 'paid')),
  approved_at timestamptz(6),
  created_at timestamptz(6) not null default now(),
  updated_at timestamptz(6) not null default now(),
  constraint hr_payroll_runs_org_period_key unique (organization_id, period)
);

create table public.hr_payslips (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  payroll_run_id uuid not null references public.hr_payroll_runs (id) on delete cascade,
  employee_id uuid not null references public.hr_employees (id) on delete restrict,
  gross_pay numeric(12, 2) not null default 0.00 check (gross_pay >= 0),
  social_security_deduction numeric(12, 2) not null default 0.00 check (social_security_deduction >= 0),
  tax_deduction numeric(12, 2) not null default 0.00 check (tax_deduction >= 0),
  stamp_duty numeric(12, 2) not null default 0.00 check (stamp_duty >= 0),
  net_pay numeric(12, 2) not null default 0.00 check (net_pay >= 0),
  iban text,
  created_at timestamptz(6) not null default now(),
  updated_at timestamptz(6) not null default now(),
  constraint hr_payslips_run_employee_key unique (payroll_run_id, employee_id)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index hr_employees_organization_idx on public.hr_employees (organization_id);
create index hr_employees_property_idx on public.hr_employees (property_id);
create index hr_employees_user_idx on public.hr_employees (user_id);

create index hr_shifts_org_prop_date_idx on public.hr_shifts (organization_id, property_id, date);
create index hr_leave_requests_org_status_idx on public.hr_leave_requests (organization_id, status);
create index hr_leave_requests_employee_idx on public.hr_leave_requests (employee_id);
create index hr_payslips_org_idx on public.hr_payslips (organization_id);

comment on table public.hr_employees is
  'Staff and employee records beyond system membership (contracts, hire date, salary, department). An employee record outlives their system access.';

comment on table public.hr_shifts is
  'Weekly rota shift assignments per employee (Morning, Evening, Day, Off).';

comment on table public.hr_leave_requests is
  'Leave requests and approvals with shift clash visibility.';

comment on table public.hr_payroll_runs is
  'Monthly payroll calculation and approval runs.';

comment on table public.hr_payslips is
  'Detailed payslips per employee per payroll period with SGK and tax deductions.';

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.staff_permissions (key, module_key)
values ('hr.view', 'human_resources'),
       ('hr.manage', 'human_resources')
on conflict (key) do nothing;

-- Shipped roles: owner, manager, and finance view and manage hr
update public.staff_roles
   set permissions = array_append(permissions, 'hr.view'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager', 'finance')
   and not ('hr.view' = any (permissions));

update public.staff_roles
   set permissions = array_append(permissions, 'hr.manage'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager', 'finance')
   and not ('hr.manage' = any (permissions));

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

alter table public.hr_employees enable row level security;
alter table public.hr_employees force row level security;

alter table public.hr_shifts enable row level security;
alter table public.hr_shifts force row level security;

alter table public.hr_leave_requests enable row level security;
alter table public.hr_leave_requests force row level security;

alter table public.hr_payroll_runs enable row level security;
alter table public.hr_payroll_runs force row level security;

alter table public.hr_payslips enable row level security;
alter table public.hr_payslips force row level security;

-- Policies for hr_employees
create policy hr_employees_read_own_organization
  on public.hr_employees for select
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.view')
  );

create policy hr_employees_write_own_organization
  on public.hr_employees for insert
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
  );

create policy hr_employees_update_own_organization
  on public.hr_employees for update
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
  )
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
  );

-- Policies for hr_shifts
create policy hr_shifts_read_own_organization
  on public.hr_shifts for select
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.view')
  );

create policy hr_shifts_write_own_organization
  on public.hr_shifts for insert
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
  );

create policy hr_shifts_update_own_organization
  on public.hr_shifts for update
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
  )
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
  );

-- Policies for hr_leave_requests
create policy hr_leave_requests_read_own_organization
  on public.hr_leave_requests for select
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.view')
  );

create policy hr_leave_requests_write_own_organization
  on public.hr_leave_requests for insert
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
  );

create policy hr_leave_requests_update_own_organization
  on public.hr_leave_requests for update
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
  )
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
  );

-- Policies for hr_payroll_runs
create policy hr_payroll_runs_read_own_organization
  on public.hr_payroll_runs for select
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.view')
  );

create policy hr_payroll_runs_write_own_organization
  on public.hr_payroll_runs for insert
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
  );

create policy hr_payroll_runs_update_own_organization
  on public.hr_payroll_runs for update
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
  )
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
  );

-- Policies for hr_payslips
create policy hr_payslips_read_own_organization
  on public.hr_payslips for select
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.view')
  );

create policy hr_payslips_write_own_organization
  on public.hr_payslips for insert
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
  );

create policy hr_payslips_update_own_organization
  on public.hr_payslips for update
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
  )
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
  );

-- ---------------------------------------------------------------------------
-- Column-Level Grants (IG-01: A write grant is a column list)
-- ---------------------------------------------------------------------------

grant select on public.hr_employees to ranza_app;
grant insert (id, organization_id, property_id, user_id, first_name, last_name, email, phone, department, position, contract_type, hired_on, gross_pay, currency, status, bank_name, iban, created_at, updated_at)
  on public.hr_employees to ranza_app;
grant update (property_id, user_id, first_name, last_name, email, phone, department, position, contract_type, hired_on, gross_pay, currency, status, bank_name, iban, updated_at)
  on public.hr_employees to ranza_app;

grant select on public.hr_shifts to ranza_app;
grant insert (id, organization_id, property_id, employee_id, date, shift_type, start_time, end_time, notes, created_at, updated_at)
  on public.hr_shifts to ranza_app;
grant update (shift_type, start_time, end_time, notes, updated_at)
  on public.hr_shifts to ranza_app;

grant select on public.hr_leave_requests to ranza_app;
grant insert (id, organization_id, employee_id, leave_type, starts_on, ends_on, status, notes, created_at, updated_at)
  on public.hr_leave_requests to ranza_app;
grant update (leave_type, starts_on, ends_on, status, notes, updated_at)
  on public.hr_leave_requests to ranza_app;

grant select on public.hr_payroll_runs to ranza_app;
grant insert (id, organization_id, period, total_gross, total_net, status, approved_at, created_at, updated_at)
  on public.hr_payroll_runs to ranza_app;
grant update (total_gross, total_net, status, approved_at, updated_at)
  on public.hr_payroll_runs to ranza_app;

grant select on public.hr_payslips to ranza_app;
grant insert (id, organization_id, payroll_run_id, employee_id, gross_pay, social_security_deduction, tax_deduction, stamp_duty, net_pay, iban, created_at, updated_at)
  on public.hr_payslips to ranza_app;
grant update (gross_pay, social_security_deduction, tax_deduction, stamp_duty, net_pay, iban, updated_at)
  on public.hr_payslips to ranza_app;
