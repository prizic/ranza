-- A booking is not taken on a closed business day (RG-S1-08, ADR 0024 amended
-- 2026-09-29).
--
-- The module refuses a booking that starts before the Property's today, but
-- that is the module's rule: the seed, a future channel or the worker could
-- insert a Reservation dated on a day Close the day already counted, and the
-- day's figures would never have seen it. This is the INSERT branch of
-- app.stays_keep_closed_days() (20260916005200) applied to the booking: the
-- same date test, the same shared lock and the same RZ001.
--
-- Deliberately not "before today". Seeds and fixtures insert bookings for
-- Guests who arrived days ago, which is a record of what happened rather than
-- a booking taken late; what must not happen is a new row inside a day that is
-- already final.
--
-- Security invoker: it reads business_day_closes, which every role that may
-- insert a Reservation can read for its own Properties, and a Property it
-- cannot see has no Reservation it could insert.
--
-- The trigger's name sorts after reservations_unit_holds_one_occupancy, and
-- Postgres fires same-event triggers by name: the Unit's lock (namespace 2) is
-- taken before the Property's day (namespace 3), which is ADR 0038's order.

create function app.reservations_keep_closed_days()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(
    3, pg_catalog.hashtext(new.property_id::text)
  );
  if exists (
    select 1
      from public.business_day_closes as close
     where close.property_id = new.property_id
       and close.business_date >= new.starts_on
  ) then
    raise exception 'business day % is closed at this Property', new.starts_on
      using errcode = 'RZ001';
  end if;
  return new;
end;
$$;

comment on function app.reservations_keep_closed_days() is
  'Refuses a Reservation inserted with a start date on or before a closed business day at its Property (RZ001), under the Property''s shared advisory lock (namespace 3). Security invoker.';

create trigger reservations_want_an_open_day
  before insert on public.reservations
  for each row execute function app.reservations_keep_closed_days();
