-- Payroll is approved Organization-wide, kept in minor units, and locked once
-- approved (RANZ-42, ADR 0012, ADR 0015, ADR 0044).
--
-- Hand-written. 20260916010800 to 20260916010899 belong to the HR lane.
--
-- 20260916010100 and 20260916010500 shipped HR with the policies of a table
-- nobody had thought about yet: membership and a permission, and none of the
-- commercial gates. They also left a payroll run that could be written over
-- after it was approved, amounts held as numeric and computed with floats, and
-- a foreign key whose `on delete set null` would have nulled organization_id.
-- Eleven things change here, and each is a rule the repository already has,
-- applied to a place that was missed.
--
--   1. A payroll run is the whole Organization's (HR-S1-24). It is read,
--      opened and approved by someone who reaches every Property, because it
--      has no Property to narrow to (ADR 0031) and because the run is unique
--      per (Organization, period): a run computed from only the employees one
--      manager could see leaves the other Properties without payslips for good.
--   2. Every HR policy carries blueprint 3.5's gates beside the permission, and
--      a write carries reach (ADR 0012, ADR 0026). A lapsed Subscription no
--      longer writes payroll.
--   3. Money is `bigint` minor units (ADR 0015); a run has one currency.
--   4. An approved run, and its payslips, cannot change, whoever asks. A run is
--      opened as a draft and moves to approved once, with who and when.
--   5. A termination is a status and a date on a record that stays.
--   6. `on_leave` and `paid` are removed: nothing reached either (HR-S1-31).
--   7. hr_employees_property_fkey nulls property_id and nothing else.
--   8. The outbox trigger's definer has an empty search_path.
--   9. A run is approved for a period that has ended, and it covers everyone
--      who was employed at any point in it (HR-S1-40, HR-S1-45).
--  10. The rota is read only where the employee is (HR-S1-47), and a
--      terminated employee takes no new shift or leave (HR-S1-39).
--  11. A termination is dated on a day that has come (HR-S1-46).

-- ---------------------------------------------------------------------------
-- What exists must convert exactly, or nothing converts
-- ---------------------------------------------------------------------------

-- The amounts were numeric(12,2) major units and the product could only ever
-- have written lira: the module defaulted to TRY, the server action never
-- named a currency, and the screen printed TRY. Converting by 100 is therefore
-- exact for every row the product could have made, and a row it could not have
-- made (another currency, put in by hand) is a decision for a person rather
-- than a guess here about how many minor units that currency has. ADR 0015
-- reads that number from Intl at display and nowhere else; this migration does
-- not keep a table of it.
do $$
begin
  if exists (select 1 from public.hr_employees where currency <> 'TRY') then
    raise exception 'an hr_employees row is in a currency other than TRY; convert its pay by hand before this migration';
  end if;
  if exists (select 1 from public.hr_payroll_runs where status = 'paid') then
    raise exception 'a payroll run is marked paid, and nothing in the product could have done that; decide what it means before this migration';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- hr_employees
-- ---------------------------------------------------------------------------

alter table public.hr_employees
  add column gross_pay_minor bigint,
  add column terminated_on date;

update public.hr_employees
   set gross_pay_minor = round(gross_pay * 100)::bigint;

-- Nothing could set on_leave, so the only rows holding it were put there by
-- hand, and a person on leave is still employed (HR-S1-31).
update public.hr_employees
   set status = 'active'
 where status = 'on_leave';

-- A termination now carries its date. The module used to flip the status
-- alone, so a row may be terminated with no date; it is dated by when it
-- stopped being touched, which is the only thing that is known.
update public.hr_employees
   set terminated_on = greatest(updated_at::date, hired_on)
 where status = 'terminated';

alter table public.hr_employees
  alter column gross_pay_minor set not null,
  alter column gross_pay_minor set default 0,
  drop column gross_pay;

alter table public.hr_employees
  drop constraint hr_employees_status_check,
  add constraint hr_employees_status_check
    check (status in ('active', 'terminated')),
  add constraint hr_employees_gross_pay_minor_check
    check (gross_pay_minor >= 0),
  add constraint hr_employees_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  add constraint hr_employees_termination_dated
    check ((status = 'terminated') = (terminated_on is not null)),
  add constraint hr_employees_terminated_after_hired
    check (terminated_on is null or terminated_on >= hired_on);

comment on column public.hr_employees.gross_pay_minor is
  'Monthly gross pay in the minor units of `currency` (ADR 0015). A payslip keeps its own copy, so a raise never restates a payslip.';
comment on column public.hr_employees.terminated_on is
  'The day employment ended. The record, its payslips and its history stay and stay readable; this is the other half of "membership is access, not employment".';

-- Null property_id and nothing else. The composite key makes organization_id
-- part of the reference, so the plain `on delete set null` of 20260916010500
-- would have tried to null a NOT NULL column and refused the delete of any
-- Property that had an employee. The column list is PostgreSQL 15.
alter table public.hr_employees
  drop constraint hr_employees_property_fkey,
  add constraint hr_employees_property_fkey
    foreign key (property_id, organization_id)
    references public.properties (id, organization_id)
    on delete set null (property_id);

-- A terminated employee stays terminated. Re-hiring is a new record, because
-- the old one is what the payslips and the audit trail point at; an update
-- that quietly un-terminated it would make "terminated on" a statement about
-- nothing.
create function public.hr_employees_termination_is_final()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'terminated'
     and (new.status is distinct from old.status
          or new.terminated_on is distinct from old.terminated_on) then
    raise exception 'a terminated employee stays terminated: register a new record to re-hire'
      using errcode = '55000';
  end if;

  -- An ending is recorded on or after the day it happens. A date ahead is a
  -- plan, and a record that is final cannot hold one: it would be terminated
  -- today and still working tomorrow (HR-S1-46). The Property's own calendar
  -- day, or the earliest one in the Organization for an employee with none.
  if new.status = 'terminated'
     and old.status is distinct from 'terminated'
     and new.terminated_on > app.hr_today(new.organization_id, new.property_id) then
    raise exception 'a termination is recorded on or after the day it happens, not ahead of it'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger hr_employees_termination_is_final_trg
  before update on public.hr_employees
  for each row
  execute function public.hr_employees_termination_is_final();

-- ---------------------------------------------------------------------------
-- hr_payroll_runs
-- ---------------------------------------------------------------------------

alter table public.hr_payroll_runs
  add column currency char(3),
  add column approved_by uuid,
  add column total_gross_minor bigint,
  add column total_net_minor bigint;

-- A run's currency is its employees'. An old run with no payslip has no
-- employees to ask and is lira, for the reason above; one whose payslips span
-- currencies cannot be converted to a single currency and is refused.
update public.hr_payroll_runs as run
   set currency = coalesce(
         (select min(employee.currency)
            from public.hr_payslips as payslip
            join public.hr_employees as employee
              on employee.id = payslip.employee_id
           where payslip.payroll_run_id = run.id),
         'TRY'),
       total_gross_minor = round(run.total_gross * 100)::bigint,
       total_net_minor = round(run.total_net * 100)::bigint,
       approved_at = case when run.status = 'approved'
                          then coalesce(run.approved_at, run.updated_at) end;

do $$
begin
  if exists (
    select 1
      from public.hr_payslips as payslip
      join public.hr_employees as employee on employee.id = payslip.employee_id
     group by payslip.payroll_run_id
    having count(distinct employee.currency) > 1
  ) then
    raise exception 'a payroll run holds payslips in more than one currency; split it by hand before this migration';
  end if;
end;
$$;

alter table public.hr_payroll_runs
  alter column currency set not null,
  alter column currency set default 'TRY',
  alter column total_gross_minor set not null,
  alter column total_gross_minor set default 0,
  alter column total_net_minor set not null,
  alter column total_net_minor set default 0,
  drop column total_gross,
  drop column total_net;

alter table public.hr_payroll_runs
  drop constraint hr_payroll_runs_status_check,
  add constraint hr_payroll_runs_status_check
    check (status in ('draft', 'approved')),
  add constraint hr_payroll_runs_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  add constraint hr_payroll_runs_totals_check
    check (total_gross_minor >= 0 and total_net_minor >= 0),
  add constraint hr_payroll_runs_approval_dated
    check ((status = 'approved') = (approved_at is not null)),
  add constraint hr_payroll_runs_approved_by_fkey
    foreign key (approved_by) references public.users (id) on delete restrict,
  add constraint hr_payroll_runs_id_org_key
    unique (id, organization_id);

-- NOT VALID: a run approved before this column existed has no one to name, and
-- inventing one would be a forgery of the record this migration protects. The
-- constraint holds for every run approved from here on, and an approved run
-- cannot be updated to fill it in.
alter table public.hr_payroll_runs
  add constraint hr_payroll_runs_approved_by_named
    check (status = 'draft' or approved_by is not null) not valid;

comment on column public.hr_payroll_runs.currency is
  'One currency per run (ADR 0015). A payslip carries none: a payslip that could disagree with its run would make the totals meaningless.';
comment on column public.hr_payroll_runs.approved_by is
  'Who approved the run. Null only on a run approved before 20260916010800.';

-- ---------------------------------------------------------------------------
-- hr_payslips
-- ---------------------------------------------------------------------------

alter table public.hr_payslips
  add column gross_pay_minor bigint,
  add column social_security_deduction_minor bigint,
  add column tax_deduction_minor bigint,
  add column stamp_duty_minor bigint,
  add column net_pay_minor bigint;

update public.hr_payslips
   set gross_pay_minor = round(gross_pay * 100)::bigint,
       social_security_deduction_minor = round(social_security_deduction * 100)::bigint,
       tax_deduction_minor = round(tax_deduction * 100)::bigint,
       stamp_duty_minor = round(stamp_duty * 100)::bigint,
       net_pay_minor = round(net_pay * 100)::bigint;

alter table public.hr_payslips
  alter column gross_pay_minor set not null,
  alter column gross_pay_minor set default 0,
  alter column social_security_deduction_minor set not null,
  alter column social_security_deduction_minor set default 0,
  alter column tax_deduction_minor set not null,
  alter column tax_deduction_minor set default 0,
  alter column stamp_duty_minor set not null,
  alter column stamp_duty_minor set default 0,
  alter column net_pay_minor set not null,
  alter column net_pay_minor set default 0,
  drop column gross_pay,
  drop column social_security_deduction,
  drop column tax_deduction,
  drop column stamp_duty,
  drop column net_pay;

alter table public.hr_payslips
  add constraint hr_payslips_amounts_check
    check (gross_pay_minor >= 0
           and social_security_deduction_minor >= 0
           and tax_deduction_minor >= 0
           and stamp_duty_minor >= 0
           and net_pay_minor >= 0),
  -- The one sum a payslip is. Stated here so that a payslip whose parts do not
  -- add up is refused by the database and not found by a person.
  add constraint hr_payslips_net_is_gross_less_deductions
    check (net_pay_minor = gross_pay_minor
                         - social_security_deduction_minor
                         - tax_deduction_minor
                         - stamp_duty_minor);

-- The payslip's run reference now carries organization_id, so a payslip cannot
-- name another Organization's run (the employee reference already did).
alter table public.hr_payslips
  drop constraint hr_payslips_payroll_run_id_fkey,
  add constraint hr_payslips_run_fkey
    foreign key (payroll_run_id, organization_id)
    references public.hr_payroll_runs (id, organization_id)
    on delete restrict;

-- ---------------------------------------------------------------------------
-- An approved run cannot change
-- ---------------------------------------------------------------------------

-- Three statements of the same rule, for the reason ADR 0015 gives: the policy
-- and the grant below bind ranza_app and say nothing to the role that runs
-- migrations, and a trigger fires for everyone.
--
--   * opened as a draft, always: a run inserted already approved would skip
--     the one moment the totals are checked against the payslips;
--   * draft to approved, once, with totals that equal the sum of its payslips
--     and at least one payslip;
--   * approved is final. An UPDATE that restates what is already true (the
--     re-approval a double click makes) changes nothing and is skipped, so no
--     second `payroll.approved` is ever emitted; any other change is refused;
--   * a period is opened, and so approved, only once it has ended (HR-S1-45): a
--     run is locked, so approving a month that is still running would lock in a
--     headcount that is still changing, and there is no way to revise it
--     (HR-DEF-10). It has ended when the first day of the next month is no
--     later than today, which is the Organization's earliest calendar day. A
--     period cannot change after the draft is opened, so asking once, there,
--     is asking for the approval too.
create function public.hr_payroll_runs_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  payslip_count bigint;
  payslip_gross numeric;
  payslip_net numeric;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'a payroll run is opened as a draft and approved afterwards'
        using errcode = '55000';
    end if;
    if (to_date(new.period || '-01', 'YYYY-MM-DD') + interval '1 month')::date
         > app.hr_today(new.organization_id, null) then
      raise exception 'a payroll period is approved only once it has ended'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'approved' then
      raise exception 'an approved payroll run cannot be deleted'
        using errcode = '55000';
    end if;
    return old;
  end if;

  if old.status = 'approved' then
    if new.status = 'approved'
       and (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
      return null;
    end if;
    raise exception 'an approved payroll run cannot be changed'
      using errcode = '55000';
  end if;

  if new.status = 'approved' then
    select count(*), coalesce(sum(payslip.gross_pay_minor), 0),
           coalesce(sum(payslip.net_pay_minor), 0)
      into payslip_count, payslip_gross, payslip_net
      from public.hr_payslips as payslip
     where payslip.payroll_run_id = new.id;

    if payslip_count = 0 then
      raise exception 'a payroll run with no payslips cannot be approved'
        using errcode = '55000';
    end if;
    if new.total_gross_minor <> payslip_gross
       or new.total_net_minor <> payslip_net then
      raise exception 'the totals of a payroll run must equal the sum of its payslips'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger hr_payroll_runs_lifecycle_trg
  before insert or update or delete on public.hr_payroll_runs
  for each row
  execute function public.hr_payroll_runs_lifecycle();

-- A payslip is written into a draft run, in the run's currency, and never
-- touched again. Definer, because the answer is the run's state and must not
-- depend on whether the caller may read the run.
create function public.hr_payslips_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_id uuid;
  run_status text;
  run_currency text;
  employee_currency text;
begin
  run_id := case when tg_op = 'INSERT' then new.payroll_run_id
                 else old.payroll_run_id end;

  select run.status, run.currency
    into run_status, run_currency
    from public.hr_payroll_runs as run
   where run.id = run_id;

  -- The run is already gone: a cascade from a draft run being deleted.
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if run_status = 'approved' then
    raise exception 'the payslips of an approved payroll run cannot be changed'
      using errcode = '55000';
  end if;

  if tg_op = 'INSERT' then
    select employee.currency
      into employee_currency
      from public.hr_employees as employee
     where employee.id = new.employee_id;

    if employee_currency is distinct from run_currency then
      raise exception 'a payroll run is in one currency, and this employee is paid in another'
        using errcode = '23514';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger hr_payslips_lifecycle_trg
  before insert or update or delete on public.hr_payslips
  for each row
  execute function public.hr_payslips_lifecycle();

-- ---------------------------------------------------------------------------
-- payroll.approved: the outbox, with an empty search_path
-- ---------------------------------------------------------------------------

-- The definer of 20260916010500 resolved its names through
-- `public, outbox, pg_temp`. The repository's convention is an empty path and
-- qualified names, because a definer that searches pg_temp can be handed a
-- table of the caller's own. Replaced here, not edited there.
--
-- The payload is in minor units and names its currency (ADR 0015). Nothing
-- consumes the event yet (HR-DEF-02): posting payroll to the ledger is
-- deferred, and the roadmap says so.
create or replace function public.hr_payroll_run_emit_outbox()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into outbox.events (organization_id, event_type, payload)
  values (
    new.organization_id,
    'payroll.approved',
    jsonb_build_object(
      'payrollRunId', new.id,
      'organizationId', new.organization_id,
      'period', new.period,
      'currency', new.currency,
      'totalGrossMinor', new.total_gross_minor,
      'totalNetMinor', new.total_net_minor,
      'approvedAt', new.approved_at,
      'approvedBy', new.approved_by
    )
  );
  return new;
end;
$$;

drop trigger hr_payroll_run_approved_outbox_trg on public.hr_payroll_runs;
create trigger hr_payroll_run_approved_outbox_trg
  after update of status on public.hr_payroll_runs
  for each row
  when (old.status is distinct from 'approved' and new.status = 'approved')
  execute function public.hr_payroll_run_emit_outbox();

-- ---------------------------------------------------------------------------
-- Three questions HR asks of the database
-- ---------------------------------------------------------------------------

-- What day it is for the people concerned, as a calendar date: the Property's
-- own when one is named, otherwise the earliest day in any of the
-- Organization's Properties, so that "has ended" and "has happened" mean it is
-- over or done everywhere the Organization works. A definer so a trigger can
-- ask whoever is writing. It reads nothing but time zones and returns a date.
create function app.hr_today(
  target_organization_id uuid,
  target_property_id uuid default null
)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (now() at time zone property.timezone)::date
       from public.properties as property
      where property.id = target_property_id
        and property.organization_id = target_organization_id),
    (select min((now() at time zone property.timezone)::date)
       from public.properties as property
      where property.organization_id = target_organization_id
        and property.status = 'active'),
    (now() at time zone 'UTC')::date
  );
$$;

comment on function app.hr_today(uuid, uuid) is
  'The calendar date for a Property, or the earliest one across an Organization''s Properties. What "a period has ended" and "a termination has happened" are measured against.';

revoke execute on function app.hr_today(uuid, uuid) from public;
grant execute on function app.hr_today(uuid, uuid) to ranza_app;

-- Two questions a policy on a child row asks about its employee

-- A leave request and a payslip carry no Property, and the employee they
-- belong to does. Asking hr_employees from inside their policies would use the
-- caller's read policy on it, so removing a clause from that one would
-- silently change these two: a guarantee behind a guarantee that subsumes it,
-- which a test cannot tell from a working one. These are definers, so each
-- policy owns the question it asks.
--
-- Reach: the whole Organization, or the employee's own Property. An employee
-- with no Property is the whole Organization's (HR-S1-26).
create function app.hr_employee_is_reachable(target_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hr_employees as employee
    where employee.id = target_employee_id
      and (
        app.has_organization_wide_reach(employee.organization_id)
        or employee.property_id in (select app.accessible_property_ids())
      )
  );
$$;

comment on function app.hr_employee_is_reachable(uuid) is
  'Whether the acting Staff Member reaches the employee: the whole Organization, or the employee''s own Property. Says nothing about permission or the commercial gates.';

-- Reach and the commercial gates for a write about the employee, who is still
-- employed: a terminated employee takes no new shift and no new leave
-- (HR-S1-39). The Property's own capability when the employee has one,
-- otherwise the Organization-wide reach and the capability somewhere in the
-- Organization. A floater is therefore rostered only by whoever reaches the
-- whole Organization, as one is read only by them.
create function app.hr_employee_is_manageable(target_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hr_employees as employee
    where employee.id = target_employee_id
      and employee.status = 'active'
      and case
            when employee.property_id is not null
              then app.can_use_capability(
                     employee.property_id, 'human_resources', 'staff_administration')
            else app.has_organization_wide_reach(employee.organization_id)
                 and app.can_use_capability_in_organization(
                       employee.organization_id,
                       'human_resources', 'staff_administration')
          end
  );
$$;

comment on function app.hr_employee_is_manageable(uuid) is
  'Whether the acting Staff Member may write about the employee: reach and blueprint 3.5 gates 1-3, at the employee''s Property or, for an employee with none, across the Organization.';

revoke execute on function app.hr_employee_is_reachable(uuid) from public;
revoke execute on function app.hr_employee_is_manageable(uuid) from public;
grant execute on function app.hr_employee_is_reachable(uuid) to ranza_app;
grant execute on function app.hr_employee_is_manageable(uuid) to ranza_app;

-- ---------------------------------------------------------------------------
-- Policies: reach, permission and the gates, on every read and every write
-- ---------------------------------------------------------------------------

drop policy hr_employees_read_own_organization on public.hr_employees;
drop policy hr_employees_write_own_organization on public.hr_employees;
drop policy hr_employees_update_own_organization on public.hr_employees;
drop policy hr_shifts_read_own_organization on public.hr_shifts;
drop policy hr_shifts_write_own_organization on public.hr_shifts;
drop policy hr_shifts_update_own_organization on public.hr_shifts;
drop policy hr_leave_requests_read_own_organization on public.hr_leave_requests;
drop policy hr_leave_requests_write_own_organization on public.hr_leave_requests;
drop policy hr_leave_requests_update_own_organization on public.hr_leave_requests;
drop policy hr_payroll_runs_read_own_organization on public.hr_payroll_runs;
drop policy hr_payroll_runs_write_own_organization on public.hr_payroll_runs;
drop policy hr_payroll_runs_update_own_organization on public.hr_payroll_runs;
drop policy hr_payslips_read_own_organization on public.hr_payslips;
drop policy hr_payslips_write_own_organization on public.hr_payslips;
drop policy hr_payslips_update_own_organization on public.hr_payslips;

-- Employees. The read is membership, hr.view, the capability somewhere in the
-- Organization (a read carries gates 1-3 in the policy too, as the ledger's
-- does), and reach: the whole Organization, or the employee's Property. It
-- asks the Organization and not the employee's own Property for the
-- capability on purpose, so that an approver with whole-Organization reach
-- reads every employee and a payroll run is not silently one short.
create policy hr_employees_read
  on public.hr_employees for select
  to ranza_app
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.view')
    and app.can_use_capability_in_organization(
          organization_id, 'human_resources', 'staff_administration')
    and (
      app.has_organization_wide_reach(organization_id)
      or property_id in (select app.accessible_property_ids())
    )
  );

-- The write is hr.manage and the gates at the row's Property; a row with no
-- Property is the whole Organization's and takes whole-Organization reach.
create policy hr_employees_insert
  on public.hr_employees for insert
  to ranza_app
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
    and case
          when property_id is not null
            then app.can_use_capability(
                   property_id, 'human_resources', 'staff_administration')
          else app.has_organization_wide_reach(organization_id)
               and app.can_use_capability_in_organization(
                     organization_id, 'human_resources', 'staff_administration')
        end
  );

create policy hr_employees_update
  on public.hr_employees for update
  to ranza_app
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
    and case
          when property_id is not null
            then app.can_use_capability(
                   property_id, 'human_resources', 'staff_administration')
          else app.has_organization_wide_reach(organization_id)
               and app.can_use_capability_in_organization(
                     organization_id, 'human_resources', 'staff_administration')
        end
  )
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
    and case
          when property_id is not null
            then app.can_use_capability(
                   property_id, 'human_resources', 'staff_administration')
          else app.has_organization_wide_reach(organization_id)
               and app.can_use_capability_in_organization(
                     organization_id, 'human_resources', 'staff_administration')
        end
  );

-- Shifts belong to a Property and to an employee, and a shift is read where
-- BOTH can be reached. The Property's gates carry its reach; the employee's is
-- asked of the employee, as leave and payslips ask it. Without that a shift of
-- an employee the reader may not read (one with no Property, or one moved to a
-- Property they do not reach, whose old shifts stay) came back joined to no
-- employee and broke the page that listed it (HR-S1-47).
--
-- A write also asks whether the employee is still employed and whether the
-- writer may manage them (HR-S1-39).
create policy hr_shifts_read
  on public.hr_shifts for select
  to ranza_app
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.view')
    and app.can_use_capability(
          property_id, 'human_resources', 'staff_administration')
    and app.hr_employee_is_reachable(employee_id)
  );

create policy hr_shifts_insert
  on public.hr_shifts for insert
  to ranza_app
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
    and app.can_use_capability(
          property_id, 'human_resources', 'staff_administration')
    and app.hr_employee_is_manageable(employee_id)
  );

create policy hr_shifts_update
  on public.hr_shifts for update
  to ranza_app
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
    and app.can_use_capability(
          property_id, 'human_resources', 'staff_administration')
    and app.hr_employee_is_manageable(employee_id)
  )
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
    and app.can_use_capability(
          property_id, 'human_resources', 'staff_administration')
    and app.hr_employee_is_manageable(employee_id)
  );

-- Leave belongs to an employee and so to wherever they are.
create policy hr_leave_requests_read
  on public.hr_leave_requests for select
  to ranza_app
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.view')
    and app.can_use_capability_in_organization(
          organization_id, 'human_resources', 'staff_administration')
    and app.hr_employee_is_reachable(employee_id)
  );

create policy hr_leave_requests_insert
  on public.hr_leave_requests for insert
  to ranza_app
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
    and app.hr_employee_is_manageable(employee_id)
  );

create policy hr_leave_requests_update
  on public.hr_leave_requests for update
  to ranza_app
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
    and app.hr_employee_is_manageable(employee_id)
  )
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.manage')
    and app.hr_employee_is_manageable(employee_id)
  );

-- A payroll run has no Property (ADR 0031): whole-Organization reach, on every
-- statement, and an update only ever reaches a draft.
create policy hr_payroll_runs_read
  on public.hr_payroll_runs for select
  to ranza_app
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_wide_reach(organization_id)
    and app.has_organization_permission(organization_id, 'hr.view')
    and app.can_use_capability_in_organization(
          organization_id, 'human_resources', 'staff_administration')
  );

create policy hr_payroll_runs_insert
  on public.hr_payroll_runs for insert
  to ranza_app
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_wide_reach(organization_id)
    and app.has_organization_permission(organization_id, 'hr.manage')
    and app.can_use_capability_in_organization(
          organization_id, 'human_resources', 'staff_administration')
  );

create policy hr_payroll_runs_update
  on public.hr_payroll_runs for update
  to ranza_app
  using (
    status = 'draft'
    and organization_id in (select app.accessible_organization_ids())
    and app.has_organization_wide_reach(organization_id)
    and app.has_organization_permission(organization_id, 'hr.manage')
    and app.can_use_capability_in_organization(
          organization_id, 'human_resources', 'staff_administration')
  )
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_wide_reach(organization_id)
    and app.has_organization_permission(organization_id, 'hr.manage')
    and app.can_use_capability_in_organization(
          organization_id, 'human_resources', 'staff_administration')
    -- Approving names the person approving, and cannot name anybody else.
    and (status <> 'approved' or approved_by = app.current_user_id())
  );

-- A payslip is read where its employee is, and written only by the run that
-- covers the whole Organization.
create policy hr_payslips_read
  on public.hr_payslips for select
  to ranza_app
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'hr.view')
    and app.can_use_capability_in_organization(
          organization_id, 'human_resources', 'staff_administration')
    and app.hr_employee_is_reachable(employee_id)
  );

create policy hr_payslips_insert
  on public.hr_payslips for insert
  to ranza_app
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_wide_reach(organization_id)
    and app.has_organization_permission(organization_id, 'hr.manage')
    and app.can_use_capability_in_organization(
          organization_id, 'human_resources', 'staff_administration')
  );

comment on policy hr_payroll_runs_update on public.hr_payroll_runs is
  'A draft run is approved by whole-Organization reach, hr.manage and the gates, naming itself as approver (ADR 0012). An approved run matches no row here, and the lifecycle trigger refuses it for every other role.';

-- ---------------------------------------------------------------------------
-- Grants: a policy bounds rows, a grant bounds columns (ADR 0012)
-- ---------------------------------------------------------------------------

-- Stated as an end state, so the next reader does not have to replay three
-- migrations to learn who may write what. Revoking a table privilege takes the
-- column privileges under it.
revoke all on public.hr_employees, public.hr_shifts, public.hr_leave_requests,
  public.hr_payroll_runs, public.hr_payslips from ranza_app;

grant select on public.hr_employees, public.hr_shifts, public.hr_leave_requests,
  public.hr_payroll_runs, public.hr_payslips to ranza_app;

-- Not status and not terminated_on: a new record is active. Not anything
-- derived from a payslip.
grant insert (id, organization_id, property_id, user_id, first_name, last_name,
              email, phone, department, position, contract_type, hired_on,
              gross_pay_minor, currency, bank_name, iban, created_at, updated_at)
  on public.hr_employees to ranza_app;

-- Not currency: it is fixed by the first payslip the way a Folio's is (ADR
-- 0015), and a correction is a new record.
grant update (property_id, user_id, first_name, last_name, email, phone,
              department, position, contract_type, hired_on, gross_pay_minor,
              status, terminated_on, bank_name, iban, updated_at)
  on public.hr_employees to ranza_app;

grant insert (id, organization_id, property_id, employee_id, date, shift_type,
              start_time, end_time, notes, created_at, updated_at)
  on public.hr_shifts to ranza_app;
grant update (shift_type, start_time, end_time, notes, updated_at)
  on public.hr_shifts to ranza_app;

grant insert (id, organization_id, employee_id, leave_type, starts_on, ends_on,
              status, notes, created_at, updated_at)
  on public.hr_leave_requests to ranza_app;
grant update (leave_type, starts_on, ends_on, status, notes, updated_at)
  on public.hr_leave_requests to ranza_app;

-- A run is opened with its currency and totals and nothing that says it is
-- approved; it is approved by an UPDATE of exactly these columns.
grant insert (id, organization_id, period, currency, total_gross_minor,
              total_net_minor, created_at, updated_at)
  on public.hr_payroll_runs to ranza_app;
grant update (status, approved_at, approved_by, updated_at)
  on public.hr_payroll_runs to ranza_app;

-- Payslips are inserted and never changed: no UPDATE grant, no policy.
grant insert (id, organization_id, payroll_run_id, employee_id, gross_pay_minor,
              social_security_deduction_minor, tax_deduction_minor,
              stamp_duty_minor, net_pay_minor, iban, created_at, updated_at)
  on public.hr_payslips to ranza_app;

comment on table public.hr_payroll_runs is
  'A payroll run for the whole Organization and one period, in one currency. Opened as a draft, approved once, then locked. Posting it to the ledger is not built (HR-DEF-02).';
comment on table public.hr_payslips is
  'One payslip per employee per run, in the run''s currency. The deductions are placeholders pending the owner and an accountant (HR-S1-28).';
