-- An employee's wage is dated, so a raise never rewrites a month already paid
-- (HR-03, ADR 0044, HR-DEF-10).
--
-- Until now the wage was one column on the employee, and the only way to change
-- it would have been to overwrite it — which would have changed what a draft
-- run for an earlier month said, and left nothing to show the pay was ever
-- different. An approved run keeps its own payslips and is untouched either
-- way; the dated rows decide what the runs that are still to be approved say.
--
--   * One row per change: from which month, to how much, by whom. Never
--     updated, never deleted — a correction is a newer row for the same month,
--     and the newest of a month's rows is the one that counts.
--   * The column on the employee stays as the wage the record began with, and
--     can no longer be written by the runtime role: there is one way to change
--     pay, and it leaves a row.
--   * A change may start in any month later than the last one a payroll run was
--     approved for, and not before the month the person was hired. A month
--     already approved is a run that cannot change (ADR 0044), so a wage that
--     claimed to start in it would be a record of a raise that was never paid.

create table public.hr_wage_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  employee_id uuid not null,
  effective_from date not null,
  gross_pay_minor bigint not null,
  created_by uuid not null references public.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint hr_wage_changes_first_of_month
    check (effective_from = date_trunc('month', effective_from)::date),
  constraint hr_wage_changes_gross_pay_minor_check
    check (gross_pay_minor >= 0),
  constraint hr_wage_changes_employee_fkey
    foreign key (employee_id, organization_id)
    references public.hr_employees (id, organization_id) on delete restrict
);

create index hr_wage_changes_employee_idx
  on public.hr_wage_changes (employee_id, effective_from desc, created_at desc);
create index hr_wage_changes_organization_idx
  on public.hr_wage_changes (organization_id);

comment on table public.hr_wage_changes is
  'Dated wage changes: the month a gross pay takes effect. Append-only. The '
  'wage in force for a month is the newest row at or before it, else the '
  'employee''s own gross_pay_minor.';

alter table public.hr_wage_changes enable row level security;
alter table public.hr_wage_changes force row level security;

create policy hr_wage_changes_read on public.hr_wage_changes
  for select to ranza_app
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.view')
    and app.can_use_capability_in_organization(
          organization_id, 'human_resources', 'staff_administration')
    and app.hr_employee_is_reachable(employee_id)
  );

create policy hr_wage_changes_insert on public.hr_wage_changes
  for insert to ranza_app
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
    and app.can_use_capability_in_organization(
          organization_id, 'human_resources', 'staff_administration')
    and app.hr_employee_is_manageable(employee_id)
    and created_by = app.current_user_id()
  );

grant select on public.hr_wage_changes to ranza_app;
grant insert (organization_id, employee_id, effective_from, gross_pay_minor,
              created_by)
  on public.hr_wage_changes to ranza_app;

-- One way to change pay, and it leaves a row.
revoke update (gross_pay_minor) on public.hr_employees from ranza_app;

-- ---------------------------------------------------------------------------
-- The last month a payroll run was approved for
-- ---------------------------------------------------------------------------

-- A definer because a Staff Member who reaches one Property cannot read the
-- Organization's payroll runs, and "no run is visible" must not read as "no run
-- was approved". It answers one question about one Organization, and only to
-- somebody who may manage HR there: asked by anybody else it answers null, as a
-- Property that does not exist would, so it cannot be used to read another
-- Organization's payroll calendar.
create function app.hr_payroll_approved_through(target_organization_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.has_organization_permission(target_organization_id, 'hr.manage') then
    return null;
  end if;
  return (
    select max(run.period)
      from public.hr_payroll_runs as run
     where run.organization_id = target_organization_id
       and run.status = 'approved'
  );
end;
$$;

comment on function app.hr_payroll_approved_through(uuid) is
  'The latest period (YYYY-MM) a payroll run was approved for in the '
  'Organization, or null when none was or when the caller may not manage HR '
  'there. Reads; writes nothing.';

revoke execute on function app.hr_payroll_approved_through(uuid) from public;
grant execute on function app.hr_payroll_approved_through(uuid) to ranza_app;

-- ---------------------------------------------------------------------------
-- When a wage may start
-- ---------------------------------------------------------------------------

create function public.hr_wage_change_is_not_retroactive()
returns trigger
language plpgsql
as $$
declare
  hired date;
  state text;
  approved_through text := app.hr_payroll_approved_through(new.organization_id);
begin
  select employee.hired_on, employee.status
    into hired, state
    from public.hr_employees as employee
   where employee.id = new.employee_id
     and employee.organization_id = new.organization_id;

  if state = 'terminated' then
    raise exception 'a terminated employee''s record stays terminated and takes no new wage'
      using errcode = '55000';
  end if;
  if hired is not null and new.effective_from < date_trunc('month', hired)::date then
    raise exception 'a wage cannot start before the month the person was hired'
      using errcode = '23514';
  end if;
  if approved_through is not null
     and to_char(new.effective_from, 'YYYY-MM') <= approved_through then
    raise exception 'a wage cannot start in a month whose payroll is already approved'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger hr_wage_changes_are_not_retroactive_trg
  before insert on public.hr_wage_changes
  for each row execute function public.hr_wage_change_is_not_retroactive();
