-- One guest in one Unit (RANZ-23; ADR 0033).
--
-- Hand-written; this migration adds no column and no table.
--
-- Two ways the same Unit could hold two people, both reproduced against a real
-- database before this was written:
--
-- 1. A Guest who stays past their planned departure is still in the room, but
--    stays_no_double_booking compares planned ranges, and an overdue Stay's
--    range ended days ago. A second Guest was checked in on top of them.
-- 2. reservations_no_double_booking compares confirmed Reservations with each
--    other, and a checked-in Reservation leaves it on purpose — its Stay holds
--    the nights instead. Nothing compared a new booking with that Stay, so a
--    Unit with somebody in it could be promised over their remaining nights,
--    and the refusal arrived at the desk on the day, with the Guest standing
--    there. docs/roadmap.md named this gap and left it for a decision; this is
--    the decision.

-- ---------------------------------------------------------------------------
-- One in-house Stay per Unit, whatever the dates say
-- ---------------------------------------------------------------------------

-- Refused with the rows named rather than by the index build, whose message
-- says only that a key is duplicated. A database holding two in-house Stays on
-- one Unit has a problem somebody has to look at — which Guest is really in the
-- room — and this migration will not guess.
do $$
declare
  offenders text;
begin
  select string_agg(accommodation_unit_id::text || ': ' || stays, '; ')
    into offenders
  from (
    select accommodation_unit_id, string_agg(id::text, ', ') as stays
    from public.stays
    where status = 'in_house'
    group by accommodation_unit_id
    having count(*) > 1
  ) as doubled;

  if offenders is not null then
    raise exception 'more than one in-house Stay on one Accommodation Unit; check the Guests out or withdraw the mistaken check-ins first: %', offenders;
  end if;
end;
$$;

-- Stronger than stays_no_double_booking, which stays: it still orders reserved
-- Stays by their dates. This one ignores dates altogether, because an in-house
-- Stay's dates are a plan and the room is a fact. Same-day turnover is not
-- lost — the next Guest checks in once the last one is checked out, which is
-- the order a front desk does it in.
create unique index stays_one_in_house_per_unit
  on public.stays (accommodation_unit_id)
  where status = 'in_house';

comment on index public.stays_one_in_house_per_unit is
  'One in-house Stay per Accommodation Unit, whatever its planned dates say. An overdue Guest is still in the room.';

-- ---------------------------------------------------------------------------
-- A booking does not promise nights somebody is staying in
-- ---------------------------------------------------------------------------

-- The nights a current Stay holds. A reserved Stay holds its plan. An in-house
-- one holds its plan too, with two exceptions: without end while nobody has
-- said when they leave, and through tonight once they are past their planned
-- departure and still here.
--
-- Not through tonight on the day they are due out. A hotel sells tonight in a
-- room whose Guest leaves this morning — that is most of what a day's arrivals
-- are — and the next Guest's check-in waits for the check-out through
-- stays_one_in_house_per_unit, which is the right place for it to wait. Only
-- once the business date rolls with them still in the room are they overdue,
-- and nobody knows then whether they leave today or stay another night.
create function app.stay_holds(
  status text,
  starts_on date,
  ends_on date,
  today date
)
returns daterange
language sql
immutable
set search_path = ''
as $$
  select case
    when status = 'in_house' and ends_on is null then daterange(starts_on, null, '[)')
    when status = 'in_house' and ends_on < today then daterange(starts_on, today + 1, '[)')
    else daterange(starts_on, ends_on, '[)')
  end;
$$;

comment on function app.stay_holds(text, date, date, date) is
  'The nights a current Stay holds on its Unit: its plan; through tonight once it is overdue; without end while open-ended.';

grant execute on function app.stay_holds(text, date, date, date) to ranza_app;

-- One function on both tables, because the question is one question asked from
-- either side: may this row hold these nights on this Unit.
--
-- An exclusion constraint cannot ask it — it spans two tables, and the Stay's
-- side depends on today — so it is a trigger, and a trigger reading another
-- table is write skew: a booking and a check-in on one Unit at the same moment
-- each read the other's table before the other committed, and both commit.
-- The advisory lock makes whichever arrives second wait and then read. It is
-- namespace 2, keyed on the Unit (20260916001700 reserved 1 for the Stay).
--
-- The order is namespace 2 before namespace 1, and before any row lock on
-- stays or reservations, and the commands that touch both take it first
-- themselves. Advisory-against-advisory is not the whole hazard: a check-in
-- inserting into a Unit whose Stay another transaction is withdrawing waits on
-- that transaction inside the unique index, not on a lock this code holds. If
-- the withdrawal then wanted namespace 2 while the check-in held it, each would
-- wait on the other.
--
-- It fires only when a row starts holding nights, or moves them: a booking
-- becoming confirmed, a Stay becoming in house, or either changing its Unit or
-- dates. Not on every update, and not on the way back from checked in: a
-- withdrawn check-in returns its Reservation to confirmed over nights it held a
-- moment ago. The Stay's side grows with today, so a booking that was legal
-- when it was taken can later overlap a Guest who overstayed; checking it on
-- every update would make that booking impossible to touch — to cancel, or to
-- take back a withdrawn check-in — for a reason it did not cause.
-- That overlap surfaces where it can be acted on: at check-in, as a Unit that
-- is occupied.
--
-- security definer because the check must see every Stay and booking on the
-- Unit, not only the ones the actor may read. Today the two cannot differ —
-- both rows are on one Unit, so in one Property, and anybody who may write
-- there may read every Stay there — so no test can tell definer from invoker.
-- It is here so that narrowing the read policies later cannot quietly make a
-- room look free to somebody who cannot see who is in it. It reads ids and
-- dates and returns nothing to the caller but a refusal.
--
-- 55006, object_in_use. Not 23P01, which already means "those nights are
-- booked" and deserves a different sentence at the desk, and not 55000, which
-- means "not in service" or "has charges".
create function app.unit_holds_one_occupancy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date;
  wanted daterange;
begin
  if tg_table_name = 'reservations' then
    if new.status <> 'confirmed' or (
      tg_op = 'UPDATE'
      and old.status in ('confirmed', 'checked_in')
      and old.accommodation_unit_id = new.accommodation_unit_id
      and old.starts_on = new.starts_on
      and old.ends_on is not distinct from new.ends_on
    ) then
      return new;
    end if;
  else
    if new.status not in ('reserved', 'in_house') or (
      tg_op = 'UPDATE'
      and old.status = new.status
      and old.accommodation_unit_id = new.accommodation_unit_id
      and old.starts_on = new.starts_on
      and old.ends_on is not distinct from new.ends_on
    ) then
      return new;
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    2, pg_catalog.hashtext(new.accommodation_unit_id::text)
  );

  today := app.property_today(new.property_id);

  if tg_table_name = 'reservations' then
    wanted := daterange(new.starts_on, new.ends_on, '[)');

    if exists (
      select 1
      from public.stays as stay
      where stay.accommodation_unit_id = new.accommodation_unit_id
        and stay.status in ('reserved', 'in_house')
        and stay.reservation_id is distinct from new.id
        and app.stay_holds(stay.status, stay.starts_on, stay.ends_on, today) && wanted
    ) then
      raise exception 'that Accommodation Unit has somebody staying in it over those nights'
        using errcode = '55006';
    end if;
  else
    wanted := app.stay_holds(new.status, new.starts_on, new.ends_on, today);

    if exists (
      select 1
      from public.reservations as reservation
      where reservation.accommodation_unit_id = new.accommodation_unit_id
        and reservation.status = 'confirmed'
        and reservation.id is distinct from new.reservation_id
        and daterange(reservation.starts_on, reservation.ends_on, '[)') && wanted
    ) then
      raise exception 'that Accommodation Unit is promised to another booking over those nights'
        using errcode = '55006';
    end if;
  end if;

  return new;
end;
$$;

comment on function app.unit_holds_one_occupancy() is
  'Refuses a confirmed booking over nights a current Stay holds, and a Stay over nights another confirmed booking holds (55006). Serialised per Unit by advisory lock namespace 2.';

create trigger reservations_unit_holds_one_occupancy
  before insert or update on public.reservations
  for each row execute function app.unit_holds_one_occupancy();

create trigger stays_unit_holds_one_occupancy
  before insert or update on public.stays
  for each row execute function app.unit_holds_one_occupancy();
