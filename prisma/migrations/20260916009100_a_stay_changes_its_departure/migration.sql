-- A Guest in house changes their planned departure (amend-booking slice 2,
-- ADR 0039). Hand-written; this migration adds no column and no table.
--
-- Extending, shortening, and giving an open-ended Stay an end or taking it
-- away. Through a definer that checks its caller, for the reason slice 1's is
-- one: ranza_app's update grant on stays names ends_on for check-out, and the
-- update policy refuses every row still in house, so there is no policy to
-- widen that would not also let a check-out holder re-date a Stay.
--
-- What is not here, because it is already somewhere:
--   * the extended nights being free — app.unit_holds_one_occupancy fires on
--     the Stay's new ends_on and refuses a night a confirmed booking holds
--     (55006, AB-S2-02);
--   * what the extra nights cost — a night in house is due whatever its
--     planned departure, at the booking's own price (app.room_nights_due), so
--     an extension is charged as each night closes (AB-S2-01, AB-S2-07);
--   * a closed day — a departure is tomorrow or later, and the closed-day
--     trigger does not date an in-house Stay's planned end (AB-S3-10).

-- Changes an in-house Stay's departure and its booking's with it (AB-S2-08).
--
-- The locks are ADR 0038's order: the Stay's Unit (namespace 2), the
-- Property's business day shared (namespace 3), then the Stay (namespace 1).
-- Check-out takes the last two in the same order (it takes no Unit lock), so
-- the two serialise on the Stay rather than deadlock, and a close cannot slip
-- between reading today and writing. The Stay is re-read under
-- FOR UPDATE and refused as changed (RZ003) when it moved to another Unit
-- after it was first read, or when another revision landed on its booking
-- since the caller's version.
--
-- The rows are locked Stay first, then the booking, which is check-out's order
-- too. Either that or the Stay lock alone keeps a change and a check-out from
-- deadlocking; removing both was seen to (40P01), so the integration race
-- tests the pair.
--
-- A Stay that departed or was withdrawn in between is refused with the same
-- 42501 as one out of reach: check-out won, and the desk reads the list again.
create function app.change_departure(
  target_stay uuid,
  new_ends_on date,
  expected_version integer,
  change_note text
)
returns table (
  change_id uuid,
  change_organization_id uuid,
  change_property_id uuid,
  change_reservation_id uuid,
  change_unit_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  stay public.stays%rowtype;
  booking public.reservations%rowtype;
  first_unit uuid;
  target_property uuid;
  target_organization uuid;
  today date;
  revisions integer;
  revision uuid;
begin
  select current.accommodation_unit_id, current.property_id, current.organization_id
    into first_unit, target_property, target_organization
    from public.stays as current
   where current.id = target_stay;

  if not found
     or not app.can_use_capability(target_property, 'front_office', 'front_desk')
     or not app.has_organization_permission(target_organization, 'front_desk.amend') then
    raise exception 'that Stay cannot be changed'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(2, pg_catalog.hashtext(first_unit::text));
  perform pg_catalog.pg_advisory_xact_lock_shared(3, pg_catalog.hashtext(target_property::text));
  perform pg_catalog.pg_advisory_xact_lock(1, pg_catalog.hashtext(target_stay::text));

  select * into stay
    from public.stays as current
   where current.id = target_stay
     for update;

  if stay.status <> 'in_house' or stay.reservation_id is null then
    raise exception 'only a Guest in house on a booking is changed this way'
      using errcode = '42501';
  end if;

  select * into booking
    from public.reservations as reservation
   where reservation.id = stay.reservation_id
     for update;

  select count(*)::integer into revisions
    from public.reservation_changes as change
   where change.reservation_id = booking.id;

  if stay.accommodation_unit_id <> first_unit
     or revisions is distinct from expected_version then
    raise exception 'that Stay changed since it was read'
      using errcode = 'RZ003';
  end if;

  today := app.property_today(stay.property_id);
  -- Leaving today is a check-out, which reviews the bill; a night already
  -- slept cannot be taken back (AB-S2-03, AB-S2-04).
  if new_ends_on is not null and new_ends_on <= today then
    raise exception 'a departure is tomorrow or later; leaving today is a check-out'
      using errcode = '23514';
  end if;
  if new_ends_on is null and stay.stay_type = 'guest' then
    raise exception 'a Guest''s Stay has a departure'
      using errcode = '23514';
  end if;
  if new_ends_on is not distinct from stay.ends_on then
    raise exception 'that change changes nothing'
      using errcode = '23514';
  end if;

  update public.stays as current
     set ends_on = new_ends_on,
         updated_at = now()
   where current.id = target_stay;

  update public.reservations as reservation
     set ends_on = new_ends_on,
         updated_at = now()
   where reservation.id = booking.id;

  insert into public.reservation_changes (
    organization_id, property_id, reservation_id, stay_id, kind, business_date,
    from_starts_on, to_starts_on, from_ends_on, to_ends_on,
    from_unit_id, to_unit_id,
    from_rate_minor, from_rate_currency, to_rate_minor, to_rate_currency,
    note, changed_by
  ) values (
    stay.organization_id, stay.property_id, booking.id, stay.id,
    'departure_changed', today,
    stay.starts_on, stay.starts_on, stay.ends_on, new_ends_on,
    stay.accommodation_unit_id, stay.accommodation_unit_id,
    booking.nightly_rate_minor, booking.rate_currency,
    booking.nightly_rate_minor, booking.rate_currency,
    nullif(btrim(change_note), ''), app.current_user_id()
  )
  returning id into revision;

  return query
    select revision, stay.organization_id, stay.property_id, booking.id,
           stay.accommodation_unit_id;
end;
$$;

comment on function app.change_departure(uuid, date, integer, text) is
  'Changes an in-house Stay''s planned departure and its booking''s with it, for a caller holding front_desk.amend within the front desk''s gates, and records the revision (ADR 0039, amend-booking slice 2).';

revoke execute on function app.change_departure(uuid, date, integer, text) from public;
grant execute on function app.change_departure(uuid, date, integer, text) to ranza_app;
