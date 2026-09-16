-- Withdrawing a check-in that should not have happened.
--
-- `checked_in` was terminal, which is fine as a statement of what is built and
-- untenable as a product: a front desk checks in the wrong one of two Guests
-- arriving together, and the Unit is then held by somebody who is not in it with
-- no way to release it.
--
-- The Stay is cancelled rather than deleted or edited back, and the reasoning is
-- in ADR 0022. Two things arrive here that the application cannot be trusted to
-- remember, and one grant that should have been narrowed a migration ago.
--
-- No Prisma-generated section: nothing here changes a table's shape.

-- ---------------------------------------------------------------------------
-- The window closes when money exists
-- ---------------------------------------------------------------------------

-- A check-in is a slip to withdraw only until something has been posted against
-- it. After that it is a stay that happened and needs a credit, an adjustment or
-- a refund — each a blueprint 5.9 workflow with its own rules, none of them
-- this.
--
-- security definer, which the other triggers on this path are not, and the
-- reason is a dependency rather than a fact about today.
--
-- `folio_lines_read_accessible_property` is reach-based — a Staff Member who can
-- reach the Property can see its lines whether or not they hold `finance`,
-- because the capability gate for a read lives in the query around it and not in
-- the policy. So a `security invoker` check happens to work right now.
--
-- It stops working the moment that policy is narrowed, which a Portal read or a
-- finance-scoped one plausibly would: the check would find no rows, conclude
-- nothing had been charged, and allow the withdrawal — silently, with no test
-- failing, because the tests would be running as somebody who can still see.
-- Verified by narrowing the policy to `app.can_use_capability(..., 'finance')`
-- and watching the invoker version let a charged Stay through while this one
-- refused.
--
-- It returns whether, never what: no row and no amount crosses the boundary.
--
-- A trigger rather than a policy clause for the reason 20260916001200_folios
-- gives for its own: a policy binds ranza_app and says nothing to the role that
-- runs migrations, and this is a claim about money.
create function public.stay_may_be_withdrawn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status = 'in_house'
     and exists (
       select 1
       from public.folio_lines as line
       join public.folios as folio on folio.id = line.folio_id
       where folio.stay_id = old.id
     )
  then
    -- 55000, object_not_in_prerequisite_state, rather than 42501. A refusal
    -- from a policy is also 42501, and the caller has to tell the two apart:
    -- "you cannot do that" and "money has been posted" are different answers,
    -- and only the second is worth telling a front desk.
    raise exception 'that Stay has charges posted against it and cannot be withdrawn'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger stays_withdrawal_is_free_of_charges
  before update on public.stays
  for each row
  execute function public.stay_may_be_withdrawn();

comment on trigger stays_withdrawal_is_free_of_charges on public.stays is
  'A check-in may be withdrawn only while nothing has been posted to its Folio. After that it is a stay that happened, and correcting it is a credit or a refund (blueprint 5.9).';

-- ---------------------------------------------------------------------------
-- And nothing is posted afterwards either
-- ---------------------------------------------------------------------------

-- Without this the reversal leaves an open Folio attached to a Stay that did not
-- happen, and it still accepts charges — the trigger above only looks backwards.
--
-- An invariant rather than a closure rule, which is the distinction ADR 0015
-- drew when it declined to invent folio closure. "A Folio whose Stay was
-- withdrawn accepts nothing" says what is representable; it does not say when a
-- Folio should be closed, or by whom.
--
-- Replaced rather than amended in place: 20260916001200_folios has been applied,
-- and an applied migration is never edited (AGENTS.md).
create or replace function public.folio_line_is_postable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.folios
    where folios.id = new.folio_id and folios.status = 'open'
  ) then
    raise exception 'that Folio is not open'
      using errcode = '42501';
  end if;

  -- Added by 20260916001500_check_in_reversal. A withdrawn check-in leaves an
  -- open Folio behind, and an open Folio accepts lines.
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

  -- A reversal cancels its line exactly. Without this, `reversal` would be a
  -- label rather than a fact: a line could name a 400.00 charge and cancel
  -- 4.00 of it, and the balance would still be the sum of the lines and still
  -- be wrong. A partial correction is an adjustment, which is a blueprint 5.9
  -- workflow this slice does not build.
  --
  -- Reversing a reversal needs no rule of its own: a reversal is negative, so
  -- cancelling one would need a positive amount, and folio_lines_type_check
  -- already refuses a positive line that names another.
  if new.reverses_line_id is not null and not exists (
    select 1 from public.folio_lines as original
    where original.id = new.reverses_line_id
      and original.amount_minor = -new.amount_minor
  ) then
    raise exception 'a reversal must cancel exactly the line it names'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- A grant that should have been narrowed two migrations ago
-- ---------------------------------------------------------------------------

-- `reservations` was granted UPDATE on every column. The policy that lets a
-- Staff Member check a Reservation in therefore equally let them rewrite its
-- dates, its Accommodation Unit or its Organization — by a statement that never
-- mentions a check-in and that row-level security has no way to refuse, because
-- row-level security is row-level.
--
-- This is the same hole that `folios_update_finance` and `stays_update_front_desk`
-- close with a column list. `reservations` predates the rule (ADR 0012, amended)
-- and was missed. Check-in and its withdrawal both move only `status`.
revoke update on public.reservations from ranza_app;
grant update (status, updated_at) on public.reservations to ranza_app;

comment on policy reservations_update_front_desk on public.reservations is
  'Bounds which Reservation may change. Which columns is bounded by a column-level grant, because row-level security cannot express it: only the status moves.';
