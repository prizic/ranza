-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "nightly_rate_minor" BIGINT,
ADD COLUMN     "rate_currency" CHAR(3);

-- ---------------------------------------------------------------------------
-- Hand-written from here down (RANZ-31 slice 2, ADR 0038)
-- ---------------------------------------------------------------------------

-- A Guest booking carries the price it was taken at. The database stamps it
-- from the price list when the row is written, for every role, and nothing
-- changes it after: the price a Guest was quoted is the price their nights are
-- charged at, whatever the list says later. Re-pricing belongs to amending a
-- booking, which is not built (RT-DEF-03).
--
-- Reservations taken before this migration stay unpriced. Nothing is
-- backfilled: a price nobody quoted is not one anybody agreed (RT-S2-11).

-- ---------------------------------------------------------------------------
-- The columns
-- ---------------------------------------------------------------------------

alter table public.reservations
  -- Both or neither: an amount means nothing without its currency.
  add constraint reservations_price_is_a_pair
    check ((nightly_rate_minor is null) = (rate_currency is null)),
  add constraint reservations_price_amount_check
    check (nightly_rate_minor is null or nightly_rate_minor > 0),
  add constraint reservations_rate_currency_check
    check (rate_currency is null or rate_currency ~ '^[A-Z]{3}$'),
  -- A Resident is billed by the month, which nothing builds yet (RT-DEF-04);
  -- a nightly price on one would be charged by the night the day it existed.
  add constraint reservations_resident_is_not_priced_by_the_night
    check (stay_type = 'guest' or nightly_rate_minor is null);

comment on column public.reservations.nightly_rate_minor is
  'What a night of this booking costs, in minor units of rate_currency (ADR 0038). Stamped from the price list when the booking is taken and never changed; null when unpriced.';

-- No grant names either column: ranza_app's insert grant is a column list
-- (20260916002150) and its update grant is (status, updated_at), so neither
-- column is writable by the runtime role. What a BEFORE trigger writes into
-- NEW is not a column the statement named, so the stamp below needs no grant.

-- ---------------------------------------------------------------------------
-- The stamp
-- ---------------------------------------------------------------------------

-- Before every insert, for every role, overwriting whatever was supplied
-- (RT-S2-06). The price is the one for the booked Unit's kind, and only while
-- it is stated in the currency the Property trades in now: a price left in an
-- old currency prices nothing (RT-S2-04). No price, a stale one or a Resident
-- is an unpriced booking, never a refusal — the front desk is not blocked by a
-- price list nobody has filled in (RT-S2-03).
--
-- A definer, for the lock. It holds the Property row FOR SHARE so a booking and
-- a currency change serialise (RT-S2-08): a booking first makes the change see
-- a priced booking and refuse; a change first makes this read the new currency.
-- Locking a row needs update rights under row-level security, which the front
-- desk does not hold on properties — the reason app.folio_currency_is_its_
-- propertys() is a definer too. Reach-gated the same way, so it says nothing
-- about a Property the caller cannot see; a caller with no reach books
-- unpriced, and the insert policy refuses them anyway.
--
-- It writes no row, only NEW: insert_grants' writer sweep reads the body for a
-- statement verb, and this body is kept free of one.
create function app.reservation_is_priced_when_taken()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trading text;
  kind text;
begin
  new.nightly_rate_minor := null;
  new.rate_currency := null;

  if new.stay_type is distinct from 'guest' then
    return new;
  end if;

  select property.currency::text into trading
    from public.properties as property
   where property.id = new.property_id
     and property.id in (select app.accessible_property_ids())
     for share;
  if not found then
    return new;
  end if;

  select unit.unit_type into kind
    from public.accommodation_units as unit
   where unit.id = new.accommodation_unit_id
     and unit.property_id = new.property_id;

  select rate.amount_minor, rate.currency::text
    into new.nightly_rate_minor, new.rate_currency
    from public.property_rates as rate
   where rate.property_id = new.property_id
     and rate.unit_type = kind
     and rate.amount_minor is not null
     and rate.currency::text = trading;

  return new;
end;
$$;

comment on function app.reservation_is_priced_when_taken() is
  'Stamps a Guest booking with the price of its Unit''s kind in the Property''s currency, holding the Property row so a currency change cannot interleave (ADR 0038, RT-S2-01, RT-S2-08).';

revoke execute on function app.reservation_is_priced_when_taken() from public;

create trigger reservations_priced_when_taken
  before insert on public.reservations
  for each row
  execute function app.reservation_is_priced_when_taken();

-- And never after, for any role (RT-S2-02, RT-S2-06). An invoker: it reads
-- nothing but the row.
create function app.reservation_keeps_its_price()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.nightly_rate_minor is distinct from old.nightly_rate_minor
     or new.rate_currency is distinct from old.rate_currency then
    raise exception 'a booking keeps the price it was taken at'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger reservations_keep_their_price
  before update of nightly_rate_minor, rate_currency on public.reservations
  for each row
  execute function app.reservation_keeps_its_price();

-- ---------------------------------------------------------------------------
-- A priced booking fixes the currency (ADR 0036 amended)
-- ---------------------------------------------------------------------------

-- A booking that is requested, confirmed or checked in with a price is money
-- promised in the Property's currency, as a Folio is money owed in it, so it
-- fixes the currency the same way (RT-S2-07). A cancelled booking or a no-show
-- promises nothing; a checked-out one has a Folio if its Property bills.
--
-- The same function, replaced, so the trigger 006000 created follows. A
-- definer for the reason that migration gives: the question is whether any
-- such row exists, whatever the caller may read. 55000 as before, so the
-- Configuration screen's mapping is unchanged.
create or replace function app.property_currency_is_fixed_by_its_first_folio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.folios as folio
              where folio.property_id = new.id)
     or exists (select 1 from public.reservations as booking
                 where booking.property_id = new.id
                   and booking.nightly_rate_minor is not null
                   and booking.status in ('requested', 'confirmed', 'checked_in')) then
    raise exception 'a Property''s currency is fixed once a Folio is opened or a priced booking is taken there'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

comment on function app.property_currency_is_fixed_by_its_first_folio() is
  'Refuses a currency change at a Property any Folio was opened in, or with a priced booking still to come or in house (CF-S1-04, RT-S2-07).';

create or replace function app.property_currency_is_fixed(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_property_id in (select app.accessible_property_ids())
     and (exists (select 1 from public.folios as folio
                   where folio.property_id = target_property_id)
          or exists (select 1 from public.reservations as booking
                      where booking.property_id = target_property_id
                        and booking.nightly_rate_minor is not null
                        and booking.status in ('requested', 'confirmed', 'checked_in')))
$$;

comment on function app.property_currency_is_fixed(uuid) is
  'Whether a Property the caller reaches has had a Folio opened or holds a priced booking still to come or in house, and so keeps its currency (CF-S1-04, RT-S2-07).';
