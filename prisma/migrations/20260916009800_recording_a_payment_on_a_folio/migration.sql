-- Recording a payment on a Folio (PRE-01, FP-S1-01 to FP-S1-11; Blueprint 5.9).
--
-- A Folio collects charges, reversals, and payments. A payment is recorded
-- money value: integer minor units signed negative, so that the balance
-- remains the exact sum of all lines (ADR 0015).
--
-- External payment gateway processing is an integration; this migration models
-- recorded payment lines, payment methods, settlement, and separate permissions
-- for posting and reversing payments (ADR 0041 pattern).

-- ---------------------------------------------------------------------------
-- 1. Schema: payment_method column and updated constraints on folio_lines
-- ---------------------------------------------------------------------------

alter table public.folio_lines
  add column payment_method text;

comment on column public.folio_lines.payment_method is
  'Payment method when line_type is payment: cash, card, bank_transfer, other. Null on charges and reversals.';

alter table public.folio_lines
  add constraint folio_lines_payment_method_check
    check (payment_method is null or payment_method in ('cash', 'card', 'bank_transfer', 'other'));

-- Update folio_lines_type_check to allow payments and their reversals
alter table public.folio_lines
  drop constraint folio_lines_type_check;

alter table public.folio_lines
  add constraint folio_lines_type_check
    check (
      (line_type = 'charge' and amount_minor > 0 and reverses_line_id is null and payment_method is null)
      or
      (line_type = 'payment' and amount_minor < 0 and reverses_line_id is null and payment_method is not null)
      or
      (line_type = 'reversal' and amount_minor <> 0 and reverses_line_id is not null and payment_method is null)
    );

-- ---------------------------------------------------------------------------
-- 2. Trigger: folio_line_is_postable refuses closed folios and invalid reversals
-- ---------------------------------------------------------------------------

create or replace function public.folio_line_is_postable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  subject uuid;
  target_line_type text;
begin
  select folio.stay_id into subject
  from public.folios as folio
  where folio.id = new.folio_id;

  if subject is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      1, pg_catalog.hashtext(subject::text)
    );
  end if;

  if not exists (
    select 1 from public.folios
    where folios.id = new.folio_id and folios.status = 'open'
  ) then
    raise exception 'that Folio is not open'
      using errcode = '42501';
  end if;

  -- A withdrawn check-in leaves an open Folio behind, and an open Folio accepts
  -- lines. Re-read after the lock, so a withdrawal that committed while this
  -- statement waited is visible here.
  if exists (
    select 1
    from public.folios as folio
    join public.stays as stay on stay.id = folio.stay_id
    where folio.id = new.folio_id
      and stay.status = 'cancelled'
  ) then
    raise exception 'that Stay was withdrawn'
      using errcode = '42501';
  end if;

  -- A reversal must cancel exactly the line it names, and can only reverse an
  -- original charge or payment — never another reversal.
  if new.reverses_line_id is not null then
    if not exists (
      select 1 from public.folio_lines as original
      where original.id = new.reverses_line_id
        and original.line_type in ('charge', 'payment')
        and original.amount_minor = -new.amount_minor
    ) then
      raise exception 'a reversal must cancel exactly the line it names'
        using errcode = '23514';
    end if;

    select line_type into target_line_type
    from public.folio_lines
    where id = new.reverses_line_id;

    if app.current_user_id() is not null then
      if target_line_type = 'payment' and not app.has_organization_permission(new.organization_id, 'finance.reverse_payment') then
        raise exception 'permission denied to reverse payment'
          using errcode = '42501';
      elsif target_line_type = 'charge' and not app.has_organization_permission(new.organization_id, 'finance.reverse_charge') then
        raise exception 'permission denied to reverse charge'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Staff permissions
-- ---------------------------------------------------------------------------

insert into public.staff_permissions (key, module_key)
values
  ('finance.post_payment', 'billing_folios'),
  ('finance.reverse_payment', 'billing_folios')
on conflict (key) do nothing;

-- Shipped roles:
-- Front desk, Finance, Manager and Owner hold finance.post_payment (so desk staff can collect payments).
-- Finance, Manager and Owner hold finance.reverse_payment.
update public.staff_roles
   set permissions = array_append(permissions, 'finance.post_payment'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager', 'finance', 'front_desk')
   and not ('finance.post_payment' = any (permissions));

update public.staff_roles
   set permissions = array_append(permissions, 'finance.reverse_payment'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager', 'finance')
   and not ('finance.reverse_payment' = any (permissions));

-- Custom roles that held finance.post_charge are granted finance.post_payment and finance.reverse_payment
update public.staff_roles
   set permissions = array_append(permissions, 'finance.post_payment'),
       updated_at = now()
 where organization_id is not null
   and 'finance.post_charge' = any (permissions)
   and not ('finance.post_payment' = any (permissions));

update public.staff_roles
   set permissions = array_append(permissions, 'finance.reverse_payment'),
       updated_at = now()
 where organization_id is not null
   and 'finance.reverse_charge' = any (permissions)
   and not ('finance.reverse_payment' = any (permissions));

do $$
begin
  if (select count(*) from public.staff_roles
       where organization_id is null
         and key in ('owner', 'manager', 'finance', 'front_desk')
         and 'finance.post_payment' = any (permissions)) <> 4 then
    raise exception 'finance.post_payment did not reach owner, manager, finance and front_desk';
  end if;
  if (select count(*) from public.staff_roles
       where organization_id is null
         and key in ('owner', 'manager', 'finance')
         and 'finance.reverse_payment' = any (permissions)) <> 3 then
    raise exception 'finance.reverse_payment did not reach owner, manager and finance';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Policy: folio_lines_insert_finance
-- ---------------------------------------------------------------------------

-- Column grant to ranza_app for the new payment_method column
grant insert (payment_method) on public.folio_lines to ranza_app;

drop policy folio_lines_insert_finance on public.folio_lines;
create policy folio_lines_insert_finance
  on public.folio_lines for insert
  with check (
    app.can_use_capability(property_id, 'billing_folios', 'finance')
    and case
      when line_type = 'payment'
        then app.has_organization_permission(organization_id, 'finance.post_payment')
      when line_type = 'charge'
        then app.has_organization_permission(organization_id, 'finance.post_charge')
      when line_type = 'reversal'
        then (
          app.has_organization_permission(organization_id, 'finance.reverse_charge')
          or app.has_organization_permission(organization_id, 'finance.reverse_payment')
        )
      else false
    end
  );

comment on policy folio_lines_insert_finance on public.folio_lines is
  'A charge asks finance.post_charge, a payment asks finance.post_payment, and a reversal asks finance.reverse_charge or finance.reverse_payment (ADR 0041, PRE-01), behind the four gates can_use_capability carries (ADR 0012).';
