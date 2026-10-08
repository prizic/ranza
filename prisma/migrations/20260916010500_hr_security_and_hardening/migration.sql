-- ===========================================================================
-- Human Resources and Payroll Security Hardening (Blueprint 5.11, ADR 0012, ADR 0028, ADR 0042)
-- - Composite foreign keys for cross-tenant / cross-property isolation
-- - PostgreSQL GIST exclusion constraint preventing overlapping approved leaves
-- - Clean string constraints (no empty/whitespace-only email, phone, iban)
-- - Shift time format regex validation
-- - Property-scoped RLS policies (supervisors only reach their assigned properties)
-- - Outbox event trigger for General Ledger integration (payroll.approved)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Composite Keys & Foreign Key Constraints
-- ---------------------------------------------------------------------------

-- Ensure hr_employees has unique (id, organization_id) so children can reference it
alter table public.hr_employees
  add constraint hr_employees_id_org_key unique (id, organization_id);

-- hr_employees -> properties (property_id, organization_id)
alter table public.hr_employees
  drop constraint if exists hr_employees_property_id_fkey;

alter table public.hr_employees
  add constraint hr_employees_property_fkey
  foreign key (property_id, organization_id)
  references public.properties (id, organization_id)
  on delete set null;

-- hr_shifts -> properties and hr_employees
alter table public.hr_shifts
  drop constraint if exists hr_shifts_property_id_fkey,
  drop constraint if exists hr_shifts_employee_id_fkey;

alter table public.hr_shifts
  add constraint hr_shifts_property_fkey
  foreign key (property_id, organization_id)
  references public.properties (id, organization_id)
  on delete restrict,
  add constraint hr_shifts_employee_fkey
  foreign key (employee_id, organization_id)
  references public.hr_employees (id, organization_id)
  on delete restrict;

-- hr_leave_requests -> hr_employees
alter table public.hr_leave_requests
  drop constraint if exists hr_leave_requests_employee_id_fkey;

alter table public.hr_leave_requests
  add constraint hr_leave_requests_employee_fkey
  foreign key (employee_id, organization_id)
  references public.hr_employees (id, organization_id)
  on delete restrict;

-- hr_payslips -> hr_employees
alter table public.hr_payslips
  drop constraint if exists hr_payslips_employee_id_fkey;

alter table public.hr_payslips
  add constraint hr_payslips_employee_fkey
  foreign key (employee_id, organization_id)
  references public.hr_employees (id, organization_id)
  on delete restrict;

-- ---------------------------------------------------------------------------
-- 2. Data Integrity & Validation Constraints
-- ---------------------------------------------------------------------------

alter table public.hr_employees
  add constraint hr_employees_email_clean check (email is null or btrim(email) <> ''),
  add constraint hr_employees_phone_clean check (phone is null or btrim(phone) <> ''),
  add constraint hr_employees_bank_clean check (bank_name is null or btrim(bank_name) <> ''),
  add constraint hr_employees_iban_clean check (iban is null or btrim(iban) <> '');

alter table public.hr_shifts
  add constraint hr_shifts_start_time_fmt check (start_time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  add constraint hr_shifts_end_time_fmt check (end_time ~ '^([01]\d|2[0-3]):[0-5]\d$');

-- Exclusion constraint: an employee cannot have overlapping approved leave spans
alter table public.hr_leave_requests
  add constraint hr_leave_no_overlapping_approved
  exclude using gist (
    employee_id with =,
    daterange(starts_on, ends_on, '[]') with &&
  ) where (status = 'approved');

-- ---------------------------------------------------------------------------
-- 3. Row-Level Security: Property-Scoped Isolation (ADR 0028)
-- ---------------------------------------------------------------------------

-- hr_employees: assigned staff only see employees assigned to their properties (or org-wide floaters)
drop policy if exists hr_employees_read_own_organization on public.hr_employees;
create policy hr_employees_read_own_organization
  on public.hr_employees for select
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.view')
    and (
      property_id is null
      or property_id in (select app.accessible_property_ids())
    )
  );

-- hr_shifts: restricted strictly to accessible properties
drop policy if exists hr_shifts_read_own_organization on public.hr_shifts;
create policy hr_shifts_read_own_organization
  on public.hr_shifts for select
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.view')
    and property_id in (select app.accessible_property_ids())
  );

drop policy if exists hr_shifts_write_own_organization on public.hr_shifts;
create policy hr_shifts_write_own_organization
  on public.hr_shifts for insert
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
    and property_id in (select app.accessible_property_ids())
  );

drop policy if exists hr_shifts_update_own_organization on public.hr_shifts;
create policy hr_shifts_update_own_organization
  on public.hr_shifts for update
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
    and property_id in (select app.accessible_property_ids())
  )
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
    and property_id in (select app.accessible_property_ids())
  );

-- hr_leave_requests: only read leaves of employees within accessible properties
drop policy if exists hr_leave_requests_read_own_organization on public.hr_leave_requests;
create policy hr_leave_requests_read_own_organization
  on public.hr_leave_requests for select
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.view')
    and employee_id in (
      select id from public.hr_employees
      where property_id is null or property_id in (select app.accessible_property_ids())
    )
  );

-- hr_payslips: only read payslips of employees within accessible properties
drop policy if exists hr_payslips_read_own_organization on public.hr_payslips;
create policy hr_payslips_read_own_organization
  on public.hr_payslips for select
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.view')
    and employee_id in (
      select id from public.hr_employees
      where property_id is null or property_id in (select app.accessible_property_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Outbox Integration for General Ledger (ADR 0017, ADR 0042)
-- ---------------------------------------------------------------------------

create or replace function public.hr_payroll_run_emit_outbox()
returns trigger
language plpgsql
security definer
set search_path = public, outbox, pg_temp
as $$
begin
  if NEW.status = 'approved' and (TG_OP = 'INSERT' or OLD.status is distinct from 'approved') then
    insert into outbox.events (organization_id, event_type, payload)
    values (
      NEW.organization_id,
      'payroll.approved',
      jsonb_build_object(
        'payrollRunId', NEW.id,
        'organizationId', NEW.organization_id,
        'period', NEW.period,
        'totalGross', NEW.total_gross,
        'totalNet', NEW.total_net,
        'approvedAt', NEW.approved_at
      )
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists hr_payroll_run_approved_outbox_trg on public.hr_payroll_runs;
create trigger hr_payroll_run_approved_outbox_trg
  after insert or update on public.hr_payroll_runs
  for each row
  execute function public.hr_payroll_run_emit_outbox();

-- ---------------------------------------------------------------------------
-- 5. Restore Shipped Role Hierarchy (ADR 0026)
-- ---------------------------------------------------------------------------

update public.staff_roles
   set permissions = array_remove(array_remove(permissions, 'hr.manage'), 'hr.view'),
       updated_at = now()
 where organization_id is null
   and key = 'finance';
