-- What My stay shows a student beyond the bed they sleep in (RANZ-87, GP-S4-*,
-- ADR 0060): the room around it, and what their Folio stands at.
--
-- Both are the Resident's own path (ADR 0009): separate policy and function,
-- keyed on the acting user's own current Stay, and never a widening of the
-- Staff ones.

-- ---------------------------------------------------------------------------
-- The room around a bed
-- ---------------------------------------------------------------------------

-- A student's Stay is on a bed (ADR 0025), and a bed's name alone says "A" or
-- "2". The room is the parent of the Unit they hold. A definer, as
-- resident_stay_accommodation_unit_ids() is: a policy on accommodation_units
-- that asked accommodation_units for the parent would read the table it guards.
create function app.resident_stay_room_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct unit.parent_id
    from public.accommodation_units as unit
   where unit.id in (select app.resident_stay_accommodation_unit_ids())
     and unit.parent_id is not null;
$$;

revoke execute on function app.resident_stay_room_ids() from public;
grant execute on function app.resident_stay_room_ids() to ranza_app;

create policy accommodation_units_read_own_stay_room
  on public.accommodation_units for select
  using (id in (select app.resident_stay_room_ids()));

-- ---------------------------------------------------------------------------
-- The balance on a Resident's own Folio
-- ---------------------------------------------------------------------------

-- What each of the acting user's current Stays owes: the sum of its Folio's
-- lines, a charge positive and a reversal negative (ADR 0015), so a positive
-- balance is owed. The Folio's currency and status come with it.
--
-- A function and not a policy on folio_lines: a policy bounds rows and the
-- description of a line is a column, so a policy would hand the student every
-- line the desk typed. The balance is the whole of what this slice shows, and
-- the statement of the account is GP-DEF-09, to be decided as its own thing.
--
-- The commercial gates are asked here as the Portal asks them everywhere: the
-- Organization must hold billing_folios and the Property have finance switched
-- on, and the Stay must be the user's own and current. A Stay with no Folio
-- returns no row, which is not a zero balance (ADR 0015).
create function app.resident_folio_balances()
returns table (
  stay_id uuid,
  currency character(3),
  folio_status text,
  balance_minor text
)
language sql
stable
security definer
set search_path = ''
as $$
  select folio.stay_id,
         folio.currency,
         folio.status,
         coalesce(sum(line.amount_minor), 0)::text
    from public.stays as stay
    join public.folios as folio
      on folio.stay_id = stay.id
     and folio.property_id = stay.property_id
     and folio.organization_id = stay.organization_id
    left join public.folio_lines as line
      on line.folio_id = folio.id
   where stay.user_id = app.current_user_id()
     and stay.status in ('reserved', 'in_house')
     and app.resident_can_use_capability(
           stay.property_id, 'billing_folios', 'finance')
   group by folio.stay_id, folio.currency, folio.status;
$$;

revoke execute on function app.resident_folio_balances() from public;
grant execute on function app.resident_folio_balances() to ranza_app;
