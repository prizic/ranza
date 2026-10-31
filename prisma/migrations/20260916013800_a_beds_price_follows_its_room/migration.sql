-- AlterTable
ALTER TABLE "property_rates" ADD COLUMN     "room_capacity" INTEGER;

-- DropIndex
DROP INDEX "property_rates_property_id_unit_type_key";

-- CreateIndex
CREATE UNIQUE INDEX "property_rates_property_id_unit_type_key" ON "property_rates"("property_id", "unit_type") WHERE (room_capacity IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "property_rates_sized_key" ON "property_rates"("property_id", "unit_type", "room_capacity") WHERE (room_capacity IS NOT NULL);

-- ---------------------------------------------------------------------------
-- Hand-written from here down (RANZ-111, ADR 0038 amended, docs/features/rates)
-- ---------------------------------------------------------------------------

-- ON THE NUMBER. 013800 to 013899 belong to feat/yurt-instalments.
--
-- A bed's price follows its room. A Turkish yurt writes its fee sheet by room
-- size: a bed in a single costs more than a bed in a room of four. ADR 0038
-- priced a night by the kind of Unit alone, so every bed at a Property cost
-- the same. This adds a second dimension for a bed and nothing else: the
-- number of beds its room has.
--
-- ADR 0057: this is a price list any Property may use, a hostel's dorm as much
-- as a yurt. Nothing here reads `operating_model`.

-- ---------------------------------------------------------------------------
-- The row
-- ---------------------------------------------------------------------------

alter table public.property_rates
  -- Only a bed is priced by its room's size: a room is sold whole, an
  -- apartment and a suite have no room around them. 64 is the most a Unit may
  -- sleep (accommodation_units_capacity_check), so no real room is refused.
  -- Null is the price of a bed in a room that has none of its own, and is
  -- every row that existed before this migration, so no hotel price moves.
  add constraint property_rates_room_capacity_check
    check (room_capacity is null
           or (unit_type = 'bed' and room_capacity between 1 and 64));

comment on column public.property_rates.room_capacity is
  'For a bed: the capacity of its room this price is for. Null is the price of a bed in any room without a price of its own, and the only value any other kind has (ADR 0038 amended).';

comment on index public.property_rates_property_id_unit_type_key is
  'One general price per Property and kind (RT-S1-02). A sized price is unique in property_rates_sized_key.';

comment on index public.property_rates_sized_key is
  'One price per Property, kind and room size (RT-S4-02).';

-- The caller names the size with the rest of the row, exactly as it names the
-- type: a price moved to another size is a different price, so one is cleared
-- and the other set, and the update grant stays the amount alone.
grant insert (room_capacity) on public.property_rates to ranza_app;

-- ---------------------------------------------------------------------------
-- The one definition of a Unit's price
-- ---------------------------------------------------------------------------

-- What a night in a Unit costs now, and which price it is. Four places asked
-- "the row for this Unit's kind" by joining the table: the stamp when a booking
-- is taken, the stamp when one is moved to another kind, the booking dialog's
-- quote and the amendment's options. A second dimension in four joins is four
-- chances to disagree, so they all ask this.
--
-- The most specific priced row wins: a bed takes the price for its room's size
-- when that size has an amount, and the price for any room otherwise. A cleared
-- size (a row with no amount) is no price of its own, and is passed over - that
-- is how an override is taken away. A price that is stale is the exception:
-- the row chosen is stated in a currency the Property has left, it prices
-- nothing, and the bed is NOT handed to the general row, because a stale price
-- that quietly gave way to another would charge a number nobody chose for that
-- room (RT-S4-09).
--
-- rate_class names which price applies, whether or not it has an amount, so
-- a caller can tell "the same price class" from "another" - a booking moved
-- between two rooms of the same size keeps its price, and one moved to a room
-- of another size takes that size's (RT-S4-10). It is the kind, and for a bed
-- in a room the room's size.
--
-- Security invoker and stable: the property_rates and accommodation_units
-- reads are by the caller's reach, as every other read of them is, and the
-- stamps call it as the definer they are. No row for a Unit that is not in the
-- Property named, so a caller cannot ask about somebody else's.
create function app.rate_for_unit(target_unit uuid, target_property uuid)
returns table (rate_class text, amount_minor bigint, currency text)
language sql
stable
security invoker
set search_path = ''
as $$
  select unit.unit_type || coalesce(':' || room.capacity::text, ''),
         case when chosen.currency = property.currency::text
              then chosen.amount_minor end,
         case when chosen.currency = property.currency::text
              then chosen.currency end
    from public.accommodation_units as unit
    join public.properties as property
      on property.id = unit.property_id
    left join public.accommodation_units as room
      on room.id = unit.parent_id
     and unit.unit_type = 'bed'
    left join lateral (
      select rate.amount_minor, rate.currency::text as currency
        from public.property_rates as rate
       where rate.property_id = unit.property_id
         and rate.unit_type = unit.unit_type
         and rate.amount_minor is not null
         and (rate.room_capacity is null
              or rate.room_capacity = room.capacity)
       order by rate.room_capacity nulls last
       limit 1
    ) as chosen on true
   where unit.id = target_unit
     and unit.property_id = target_property
$$;

comment on function app.rate_for_unit(uuid, uuid) is
  'The nightly price of a Unit, in the Property''s currency, and the class of price it is: the kind, and for a bed in a room the room''s size. The most specific priced row wins; a price stated in another currency prices nothing and does not hand the bed to the general row (ADR 0038 amended).';

revoke execute on function app.rate_for_unit(uuid, uuid) from public;
grant execute on function app.rate_for_unit(uuid, uuid) to ranza_app;

-- ---------------------------------------------------------------------------
-- The stamp, when a booking is taken
-- ---------------------------------------------------------------------------

-- 20260916008100's, unchanged but for the price: it asks app.rate_for_unit
-- instead of joining the table by kind. Still a definer for the lock, still
-- reach-gated, still unpriced rather than refused, still a Guest's only. The
-- Property row is held FOR SHARE as before, so a booking and a currency change
-- serialise (RT-S2-08).
create or replace function app.reservation_is_priced_when_taken()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.nightly_rate_minor := null;
  new.rate_currency := null;

  if new.stay_type is distinct from 'guest' then
    return new;
  end if;

  perform 1
     from public.properties as property
    where property.id = new.property_id
      and property.id in (select app.accessible_property_ids())
      for share;
  if not found then
    return new;
  end if;

  select rate.amount_minor, rate.currency
    into new.nightly_rate_minor, new.rate_currency
    from app.rate_for_unit(new.accommodation_unit_id, new.property_id) as rate;

  return new;
end;
$$;

comment on function app.reservation_is_priced_when_taken() is
  'Stamps a Guest booking with the price of its Unit in the Property''s currency, holding the Property row so a currency change cannot interleave (ADR 0038 amended, RT-S2-01, RT-S2-08).';

-- ---------------------------------------------------------------------------
-- The stamp, when a booking moves to another class of price
-- ---------------------------------------------------------------------------

-- 20260916009300's, with "another kind" widened to "another class of price".
-- A booking still to come moved from a bed in a room of four to a bed in a
-- single takes the single's price, as one moved from a room to a bed does
-- (ADR 0039): the price follows the room the Guest will sleep in. Moved to a
-- room of the same size it keeps what it was quoted. The check that a lower
-- price, or none, needs rates.manage is unchanged, and now covers a move to a
-- smaller room's cheaper bed as much as to a cheaper kind.
create or replace function app.reservation_is_priced_for_its_new_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_class text;
  new_class text;
begin
  if new.accommodation_unit_id = old.accommodation_unit_id
     or new.status not in ('requested', 'confirmed')
     or new.stay_type is distinct from 'guest' then
    return new;
  end if;

  select rate.rate_class into old_class
    from app.rate_for_unit(old.accommodation_unit_id, new.property_id) as rate;
  select rate.rate_class into new_class
    from app.rate_for_unit(new.accommodation_unit_id, new.property_id) as rate;

  if new_class is not distinct from old_class then
    return new;
  end if;

  perform 1
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

  select rate.amount_minor, rate.currency
    into new.nightly_rate_minor, new.rate_currency
    from app.rate_for_unit(new.accommodation_unit_id, new.property_id) as rate;

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
  'Stamps a booking still to come with the price of its new Unit when the class of price changes - the kind, or for a bed its room''s size - holding the Property row against a currency change; a price that falls or goes needs rates.manage (ADR 0039, AB-S1-03, AB-S1-28, ADR 0038 amended).';
