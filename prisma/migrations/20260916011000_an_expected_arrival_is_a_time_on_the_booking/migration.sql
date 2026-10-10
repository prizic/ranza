-- A booking may say when its Guest expects to arrive (RANZ-23, front-desk
-- arrivals). Hand-written.
--
-- The time is a local time of day, not an instant: the day is the booking's own
-- starts_on and the Property's timezone gives the clock its meaning, so a
-- booking carries no offset to go stale when a Property's timezone is
-- corrected. Whole minutes are all a desk asks a Guest for, hence time(0).
--
-- Who may set it follows what each act already is:
--
--   * Taking the booking. ranza_app is granted the column on insert, and
--     reservations_insert_front_desk already asks for front_desk.book and the
--     four gates of blueprint 3.5, so nobody who cannot book can set it.
--   * Changing it afterwards. ranza_app is granted nothing on the column for
--     update. It changes through app.change_expected_arrival(), a definer that
--     asks for the gates and front_desk.amend before it reads anything, and
--     leaves a revision, as every other change to a booking does (ADR 0039).
--     The update policy is keyed on the booking's new status, so a column
--     grant would let any check-in holder change it; the command is how
--     "whoever may amend" is said (ADR 0039, ADR 0012).
--
-- Nothing here touches amend_reservation(): the time takes no Unit and no
-- night, so the locks that command takes protect nothing it would change, and
-- a change of nights and a change of time are two revisions, in one
-- transaction when one dialog asks for both.

alter table public.reservations
  add column expected_arrival_time time(0);

comment on column public.reservations.expected_arrival_time is
  'When the Guest expects to arrive on starts_on, as a time of day at the Property; null when nobody said. Set when the booking is taken, changed only by app.change_expected_arrival().';

grant insert (expected_arrival_time) on public.reservations to ranza_app;
grant select (expected_arrival_time) on public.reservations to ranza_app;

-- ---------------------------------------------------------------------------
-- The revision
-- ---------------------------------------------------------------------------

alter table public.reservation_changes
  add column from_expected_arrival_time time(0),
  add column to_expected_arrival_time time(0);

alter table public.reservation_changes
  drop constraint reservation_changes_kind_check,
  drop constraint reservation_changes_stay_when_in_house;

alter table public.reservation_changes
  add constraint reservation_changes_kind_check
    check (kind in ('amended', 'departure_changed', 'moved', 'arrival_time_changed')),
  -- A change made to somebody in house names their Stay; a booking not yet
  -- arrived has none, and a time of arrival is only ever for one not arrived.
  add constraint reservation_changes_stay_when_in_house
    check ((kind in ('amended', 'arrival_time_changed')) = (stay_id is null)),
  -- The two columns belong to the one kind, and that kind changes something.
  add constraint reservation_changes_arrival_time_is_its_own_kind
    check ((kind = 'arrival_time_changed'
              and from_expected_arrival_time is distinct from to_expected_arrival_time)
           or (kind <> 'arrival_time_changed'
               and from_expected_arrival_time is null
               and to_expected_arrival_time is null));

-- ---------------------------------------------------------------------------
-- The command
-- ---------------------------------------------------------------------------

-- Sets, changes or clears the time a booking that has not arrived is expected
-- (null clears it), and records the revision. Checked like
-- app.amend_reservation(): the gates and front_desk.amend first, and a booking
-- out of reach, one that does not exist and one in the wrong state all answer
-- alike (42501).
--
-- The locks are the ones the change touches: the Property's business day,
-- shared, so a close cannot slip between reading today and writing it into the
-- revision, then the booking's row. No Unit lock: the time takes no night. The
-- booking is refused as changed (RZ003) when another revision landed since the
-- version the caller read, as amend_reservation() does.
create function app.change_expected_arrival(
  target_reservation uuid,
  new_time time,
  expected_version integer,
  change_note text
)
returns table (
  change_id uuid,
  change_organization_id uuid,
  change_property_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  booking public.reservations%rowtype;
  target_property uuid;
  target_organization uuid;
  revisions integer;
  today date;
  revision uuid;
begin
  select reservation.property_id, reservation.organization_id
    into target_property, target_organization
    from public.reservations as reservation
   where reservation.id = target_reservation;

  if not found
     or not app.can_use_capability(target_property, 'front_office', 'front_desk')
     or not app.has_organization_permission(target_organization, 'front_desk.amend') then
    raise exception 'that booking cannot be changed'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(3, pg_catalog.hashtext(target_property::text));

  select * into booking
    from public.reservations as reservation
   where reservation.id = target_reservation
     for update;

  select count(*)::integer into revisions
    from public.reservation_changes as change
   where change.reservation_id = target_reservation;

  if revisions is distinct from expected_version then
    raise exception 'that booking changed since it was read'
      using errcode = 'RZ003';
  end if;

  if booking.status not in ('requested', 'confirmed') then
    raise exception 'only a booking that has not arrived is changed this way'
      using errcode = '42501';
  end if;

  if new_time is not distinct from booking.expected_arrival_time then
    raise exception 'that change changes nothing'
      using errcode = '23514';
  end if;

  today := app.property_today(booking.property_id);

  update public.reservations as reservation
     set expected_arrival_time = new_time,
         updated_at = now()
   where reservation.id = target_reservation;

  insert into public.reservation_changes (
    organization_id, property_id, reservation_id, stay_id, kind, business_date,
    from_starts_on, to_starts_on, from_ends_on, to_ends_on,
    from_unit_id, to_unit_id,
    from_rate_minor, from_rate_currency, to_rate_minor, to_rate_currency,
    from_expected_arrival_time, to_expected_arrival_time,
    note, changed_by
  )
  values (
    booking.organization_id, booking.property_id, booking.id, null, 'arrival_time_changed', today,
    booking.starts_on, booking.starts_on, booking.ends_on, booking.ends_on,
    booking.accommodation_unit_id, booking.accommodation_unit_id,
    booking.nightly_rate_minor, booking.rate_currency,
    booking.nightly_rate_minor, booking.rate_currency,
    booking.expected_arrival_time, new_time,
    nullif(btrim(change_note), ''), app.current_user_id()
  )
  returning id into revision;

  return query
    select revision, booking.organization_id, booking.property_id;
end;
$$;

comment on function app.change_expected_arrival(uuid, time, integer, text) is
  'Sets, changes or clears the time a booking that has not arrived is expected, for a caller holding front_desk.amend within the front desk''s gates, and records the revision (RANZ-23).';

revoke execute on function app.change_expected_arrival(uuid, time, integer, text) from public;
grant execute on function app.change_expected_arrival(uuid, time, integer, text) to ranza_app;
