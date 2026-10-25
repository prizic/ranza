-- A Guest in house is checked against the nights still to come (calendar and
-- rooms audit 2026-10-24, CALENDAR-02).
--
-- Hand-written; this migration adds no column and no table.
--
-- app.unit_holds_one_occupancy compared a Stay's whole plan, from its first
-- night, with the confirmed bookings on the Unit it enters. For a Guest who
-- moves room that is the wrong span: the nights already slept were slept in
-- the room they left, and a booking on the new room for nights that have
-- passed — a Guest who never arrived and nobody marked a no-show — is history,
-- not a promise. The desk was refused a move "from tonight" for a booking
-- three days old, naming only its code.
--
-- An in-house Stay now holds the nights of its plan from today on. A Stay that
-- has not arrived still holds its whole plan, which starts today or later, so
-- nothing changes for it, and nothing changes for a booking: the reservation
-- side of the function compares a new booking with what a Stay holds, and a
-- booking cannot be taken for a night that has passed.
--
-- `app.stay_holds` itself is untouched. It is the plan, and bookable-Unit
-- availability reads it with the same trigger.

create or replace function app.unit_holds_one_occupancy()
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
    if new.status = 'in_house' then
      wanted := wanted * daterange(today, null, '[)');
    end if;

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
  'Refuses a confirmed booking over nights a current Stay holds, and a Stay over nights another confirmed booking holds from today on (55006). Serialised per Unit by advisory lock namespace 2.';
