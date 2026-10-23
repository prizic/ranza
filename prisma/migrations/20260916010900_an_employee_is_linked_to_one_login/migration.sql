-- A login is linked to at most one employee record in an Organization
-- (HR-S1-51).
--
-- Hand-written. Until now `hr_employees.user_id` could be written and nothing
-- offered to write it, so no row could have been linked twice. The Employees
-- screen now offers a Staff Member's login for registration, and two people
-- pressing the button at once, or one pressing it twice, would otherwise leave
-- two records that both claim the same person. That is a payroll problem: a
-- run pays every record, so a duplicate pays the person twice.
--
-- Partial, because a record with no login is the normal case (HR-S1-02) and
-- those rows are not what this constrains. Per Organization, because a login
-- may belong to more than one and be employed in each.
--
-- A terminated record keeps its login and keeps this claim: the person is not
-- offered for registration again, and a returning employee's record is
-- revisited rather than duplicated.
--
-- This fails to apply if an Organization already holds two records for one
-- login, which is the right outcome: a person has to decide which is real
-- before the database can promise there is only one.
create unique index hr_employees_organization_login_key
  on public.hr_employees (organization_id, user_id)
  where user_id is not null;
