-- A lower price is a pricing decision (AB-S1-28, ADR 0039).
--
-- 20260916009000 re-prices a booking still to come when its Unit changes kind:
-- today's price for the new kind, or none where that kind has none. So anybody
-- holding front_desk.amend could take a price off a booking — move it to a
-- kind nobody has priced and no night of it is ever charged — or lower it,
-- with no finance permission and a note that is optional. Setting a price is
-- rates.manage (ADR 0038); taking one away or lowering it is the same
-- authority, so a change that leaves the booking unpriced or cheaper than it
-- was is refused without it. A higher or equal price is the list's, and the
-- desk may still move a Guest up.
--
-- The body is 20260916009000's with the one check added after the price is
-- read; its signature and trigger are unchanged. Like it, the body is kept
-- free of a statement verb for the writer sweep in insert_grants.

create or replace function app.reservation_is_priced_for_its_new_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trading text;
  old_kind text;
  new_kind text;
begin
  if new.accommodation_unit_id = old.accommodation_unit_id
     or new.status not in ('requested', 'confirmed')
     or new.stay_type is distinct from 'guest' then
    return new;
  end if;

  select unit.unit_type into old_kind
    from public.accommodation_units as unit
   where unit.id = old.accommodation_unit_id;
  select unit.unit_type into new_kind
    from public.accommodation_units as unit
   where unit.id = new.accommodation_unit_id
     and unit.property_id = new.property_id;

  if new_kind is not distinct from old_kind then
    return new;
  end if;

  select property.currency::text into trading
    from public.properties as property
   where property.id = new.property_id
     and property.id in (select app.accessible_property_ids())
     for share;
  if not found then
    raise exception 'that Property is not reachable'
      using errcode = '42501';
  end if;

  new.nightly_rate_minor := null;
  new.rate_currency := null;

  select rate.amount_minor, rate.currency::text
    into new.nightly_rate_minor, new.rate_currency
    from public.property_rates as rate
   where rate.property_id = new.property_id
     and rate.unit_type = new_kind
     and rate.amount_minor is not null
     and rate.currency::text = trading;

  if old.nightly_rate_minor is not null
     and (new.nightly_rate_minor is null
          or new.nightly_rate_minor < old.nightly_rate_minor)
     and not app.has_organization_permission(new.organization_id, 'rates.manage') then
    raise exception 'a lower price for this booking needs rates.manage'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function app.reservation_is_priced_for_its_new_kind() is
  'Stamps a booking still to come with the price of its new Unit''s kind when the kind changes, holding the Property row against a currency change; a price that falls or goes needs rates.manage (ADR 0039, AB-S1-03, AB-S1-28).';
