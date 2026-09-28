-- CreateIndex
CREATE INDEX "reservation_changes_stay_idx" ON "reservation_changes"("stay_id");

-- ---------------------------------------------------------------------------
-- Hand-written from here down
-- ---------------------------------------------------------------------------

-- A Guest in house moves to another Unit (amend-booking slice 3, ADR 0039).
-- It adds no column and no table; the index above is what the room calendar
-- and the readers of a Stay's rooms look moves up by.
--
-- One Stay, one Folio, the same price: the Unit changes from tonight. The
-- revision in reservation_changes is what remembers where the earlier nights
-- were slept. stays.accommodation_unit_id now means the Unit the Guest is in,
-- and no longer every Unit the Stay used: every reader that asks the second
-- question — the room calendar, readiness, the worker, a damage charge, the
-- audit search — reads the moved revisions as well.

-- ---------------------------------------------------------------------------
-- The command
-- ---------------------------------------------------------------------------

-- Moves an in-house Guest to another Unit of the same Property (AB-S3-01).
--
-- Locks: both Units in hashed order (namespace 2) — the one left, so a
-- check-in or a booking onto it waits for the move and then sees the room as
-- it is, and the one entered — then the business day shared (3), then the
-- Stay (1). Rows after: the Stay, then the booking, as check-out takes them.
-- The hashed order is what keeps two Guests swapping rooms from deadlocking:
-- taken old room first they do (seen, 40P01).
--
-- What decides whether the new Unit may take the Guest is what decides it at
-- check-in, in the same words: stays_unit_is_in_service and
-- stays_unit_is_sellable (55000), app.unit_holds_one_occupancy (55006) for a
-- booking over a night of the Stay, and stays_no_double_booking (23P01) — or
-- stays_one_in_house_per_unit (23505), whichever meets the other Guest first —
-- for somebody in it, all fire on the Stay's new Unit. Only
-- readiness is the command's own, because a check-in asks it in the module:
-- a room that is not ready is refused here (RZ002, AB-S3-03), with no
-- override in this slice (AB-DEF-04).
--
-- The booking follows the Stay's Unit and keeps its price: it is checked in,
-- so the re-price trigger passes it by (AB-S3-05). A move needs a reason, and
-- "other" needs a note (reservation_changes' checks, AB-S3-02).
create function app.move_stay(
  target_stay uuid,
  new_unit uuid,
  move_reason text,
  change_note text,
  expected_version integer
)
returns table (
  change_id uuid,
  change_organization_id uuid,
  change_property_id uuid,
  change_reservation_id uuid,
  previous_unit_id uuid,
  current_unit_id uuid
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
  unit_key integer;
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

  if new_unit is null then
    raise exception 'a move names the Unit it goes to'
      using errcode = '23502';
  end if;

  for unit_key in
    select distinct pg_catalog.hashtext(unit_id::text)
      from unnest(array[first_unit, new_unit]) as unit_id
     order by 1
  loop
    perform pg_catalog.pg_advisory_xact_lock(2, unit_key);
  end loop;
  perform pg_catalog.pg_advisory_xact_lock_shared(3, pg_catalog.hashtext(target_property::text));
  perform pg_catalog.pg_advisory_xact_lock(1, pg_catalog.hashtext(target_stay::text));

  select * into stay
    from public.stays as current
   where current.id = target_stay
     for update;

  if stay.status <> 'in_house' or stay.reservation_id is null then
    raise exception 'only a Guest in house on a booking is moved this way'
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

  if new_unit = stay.accommodation_unit_id then
    raise exception 'that change changes nothing'
      using errcode = '23514';
  end if;

  perform 1
    from public.accommodation_units as unit
   where unit.id = new_unit
     and unit.property_id = stay.property_id;
  if not found then
    raise exception 'that Stay cannot be changed'
      using errcode = '42501';
  end if;

  if not app.unit_is_ready(new_unit) then
    raise exception 'that Accommodation Unit is not ready'
      using errcode = 'RZ002';
  end if;

  today := app.property_today(stay.property_id);

  update public.stays as current
     set accommodation_unit_id = new_unit,
         updated_at = now()
   where current.id = target_stay;

  update public.reservations as reservation
     set accommodation_unit_id = new_unit,
         updated_at = now()
   where reservation.id = booking.id;

  insert into public.reservation_changes (
    organization_id, property_id, reservation_id, stay_id, kind, business_date,
    from_starts_on, to_starts_on, from_ends_on, to_ends_on,
    from_unit_id, to_unit_id,
    from_rate_minor, from_rate_currency, to_rate_minor, to_rate_currency,
    reason_kind, note, changed_by
  ) values (
    stay.organization_id, stay.property_id, booking.id, stay.id, 'moved', today,
    stay.starts_on, stay.starts_on, stay.ends_on, stay.ends_on,
    stay.accommodation_unit_id, new_unit,
    booking.nightly_rate_minor, booking.rate_currency,
    booking.nightly_rate_minor, booking.rate_currency,
    move_reason, nullif(btrim(change_note), ''), app.current_user_id()
  )
  returning id into revision;

  return query
    select revision, stay.organization_id, stay.property_id, booking.id,
           stay.accommodation_unit_id, new_unit;
end;
$$;

comment on function app.move_stay(uuid, uuid, text, text, integer) is
  'Moves an in-house Guest to another ready Unit of the same Property, keeping the Stay, its Folio and its price, for a caller holding front_desk.amend within the front desk''s gates, and records the revision (ADR 0039, amend-booking slice 3).';

revoke execute on function app.move_stay(uuid, uuid, text, text, integer) from public;
grant execute on function app.move_stay(uuid, uuid, text, text, integer) to ranza_app;

-- ---------------------------------------------------------------------------
-- The room a Guest was moved out of reads dirty
-- ---------------------------------------------------------------------------

-- ADR 0029 as amended by 20260916003960 derives "dirty" from a departed Stay
-- as well as from the recorded status, so a room is never ready merely because
-- the worker has not run. A move leaves a room exactly as a departure does,
-- and no departed Stay records it: without this, a room just vacated by a move
-- reads clean until the worker marks it, and a second move or a check-in lands
-- in it (AB-S3-08).
--
-- The same shape as the departure lateral: moves out of the holder or a bed
-- under it, since yesterday's business day, after the recorded status last
-- changed. A move between two beds of one room is not a room left, so it is
-- not counted. Same signature, so every caller follows.
create or replace function app.unit_housekeeping_state(target_unit_id uuid)
returns table (status text, changed_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select case when greatest(departure.departed_at, moved.moved_at) is not null
              then 'dirty'
              else coalesce(state.status, 'clean') end,
         coalesce(greatest(departure.departed_at, moved.moved_at),
                  state.status_changed_at)
    from public.accommodation_units as holder
    left join public.housekeeping_unit_status as state
      on state.accommodation_unit_id = holder.id
   cross join lateral (
     select max(stay.departed_at) as departed_at
       from public.accommodation_units as unit
       join public.stays as stay
         on stay.accommodation_unit_id = unit.id
      where (unit.id = holder.id or unit.parent_id = holder.id)
        and stay.status = 'departed'
        and stay.ends_on >= app.property_today(holder.property_id) - 1
        and stay.departed_at
            > coalesce(state.status_changed_at, '-infinity'::timestamptz)
   ) as departure
   cross join lateral (
     select max(change.changed_at) as moved_at
       from public.reservation_changes as change
       join public.accommodation_units as unit
         on unit.id = change.from_unit_id
      where change.kind = 'moved'
        and (unit.id = holder.id or unit.parent_id = holder.id)
        and app.unit_status_holder(change.to_unit_id) <> holder.id
        and change.business_date >= app.property_today(holder.property_id) - 1
        and change.changed_at
            > coalesce(state.status_changed_at, '-infinity'::timestamptz)
   ) as moved
   where holder.id = app.unit_status_holder(target_unit_id)
$$;

-- ---------------------------------------------------------------------------
-- The worker marks it
-- ---------------------------------------------------------------------------

-- stay.moved -> the room left becomes dirty on the board, as stay.checked_out
-- makes it (AB-S3-08). Modelled on app.mark_unit_dirty_after_check_out: the
-- worker's context and Organization first, then the event. The payload's
-- changeId is the only thing read from it; which room was left is read from
-- the revision, because ranza_app may write any outbox payload and a Unit id
-- in one is only a claim. A move between beds of one room marks nothing; a
-- room marked since the move keeps that later word; a redelivery is a no-op.
create function app.mark_unit_dirty_after_move(target_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_organization uuid := app.worker_organization_id();
  event_organization uuid;
  event_kind text;
  moved_change uuid;
  moved_at timestamptz;
  left_holder uuid;
  entered_holder uuid;
  holder_property uuid;
  written integer;
begin
  if acting_organization is null then
    raise exception 'marking a room dirty requires a worker context'
      using errcode = '42501';
  end if;

  select event.organization_id, event.event_type,
         (event.payload ->> 'changeId')::uuid
    into event_organization, event_kind, moved_change
    from outbox.events as event
   where event.id = target_event_id;

  if not found then
    return false;
  end if;

  if event_organization <> acting_organization then
    raise exception 'that event belongs to another Organization'
      using errcode = '42501';
  end if;

  if event_kind <> 'stay.moved' or moved_change is null then
    return false;
  end if;

  select app.unit_status_holder(change.from_unit_id),
         app.unit_status_holder(change.to_unit_id),
         change.property_id, change.changed_at
    into left_holder, entered_holder, holder_property, moved_at
    from public.reservation_changes as change
   where change.id = moved_change
     and change.kind = 'moved'
     and change.organization_id = acting_organization;

  if not found or left_holder = entered_holder then
    return false;
  end if;

  if not app.capability_is_available(holder_property, 'housekeeping', 'housekeeping') then
    return false;
  end if;

  insert into public.housekeeping_unit_status
    (accommodation_unit_id, property_id, organization_id, status)
  values (left_holder, holder_property, acting_organization, 'dirty')
  on conflict (accommodation_unit_id) do update
     set status = 'dirty'
   where public.housekeeping_unit_status.status_changed_at < moved_at;

  get diagnostics written = row_count;
  return written > 0;
end;
$$;

comment on function app.mark_unit_dirty_after_move(uuid) is
  'The worker''s half of a move: marks the room a Guest left dirty, reading which room from the revision the stay.moved event names, never from its payload (AB-S3-08).';

revoke execute on function app.mark_unit_dirty_after_move(uuid) from public;
grant execute on function app.mark_unit_dirty_after_move(uuid) to ranza_worker;

-- ---------------------------------------------------------------------------
-- Where each night was slept
-- ---------------------------------------------------------------------------

-- A Stay's nights, cut at each move: the Unit, the first night and the end
-- of each stretch, and whether it is the last, which is the one the Guest is
-- in (AB-S3-06). Moves are ordered by when they were made: each holds the
-- Stay's lock and commits on its own, so no two moves of one Stay share a
-- transaction's now(); the id only settles a tie no real sequence produces.
-- A move on business date D puts the night of D in the new
-- Unit. A move on the arrival day leaves an empty first stretch, dropped. A
-- Stay never moved is one stretch on its own Unit. Read by the room calendar;
-- an invoker, so it sees only the revisions its caller reaches.
create function app.stay_unit_segments(target_stay uuid)
returns table (
  accommodation_unit_id uuid,
  starts_on date,
  ends_on date,
  is_last boolean
)
language sql
stable
set search_path = ''
as $$
  with stay as (
    select current.id, current.accommodation_unit_id, current.starts_on, current.ends_on
      from public.stays as current
     where current.id = target_stay
  ), moves as (
    select change.from_unit_id, change.to_unit_id,
           change.business_date as day,
           row_number() over (order by change.changed_at, change.id) as n
      from public.reservation_changes as change
     where change.stay_id = target_stay
       and change.kind = 'moved'
  ), stretches as (
    -- Before each move: from the previous move's day (or arrival) to this one.
    select move.from_unit_id as unit_id,
           coalesce(lag(move.day) over (order by move.n), stay.starts_on) as starts_on,
           move.day as ends_on,
           false as is_last
      from moves as move, stay
    union all
    -- After the last move, or the whole Stay if it never moved.
    select stay.accommodation_unit_id,
           coalesce((select max(move.day) from moves as move), stay.starts_on),
           stay.ends_on,
           true
      from stay
  )
  select unit_id, starts_on, ends_on, is_last
    from stretches
   where is_last or ends_on > starts_on
$$;

comment on function app.stay_unit_segments(uuid) is
  'A Stay''s nights cut at each move into stretches, one per Unit, the last being the Unit the Guest is in (ADR 0039, AB-S3-06).';

revoke execute on function app.stay_unit_segments(uuid) from public;
grant execute on function app.stay_unit_segments(uuid) to ranza_app;

-- ---------------------------------------------------------------------------
-- A damage charge follows the Guest who used the room
-- ---------------------------------------------------------------------------

-- MT-S5-07 charges damage to a Stay that used the request's room. Until moves,
-- that was the Stay's Unit; now a Guest moved out of the room also used it,
-- and a move is often when the damage is found. The same function, replaced,
-- so the trigger 20260916004700 created follows: the Stay's Unit, or any Unit
-- it was moved out of.
create or replace function app.maintenance_charge_is_for_the_room()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  acting uuid := app.current_user_id();
begin
  if acting is null then
    raise exception 'charging a Guest requires an acting Staff Member'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.folios as folio
      join public.stays as stay
        on stay.id = folio.stay_id
      join public.accommodation_units as unit
        on unit.id = stay.accommodation_unit_id
        or unit.id in (
          select change.from_unit_id
            from public.reservation_changes as change
           where change.stay_id = stay.id
             and change.kind = 'moved'
        )
      join public.maintenance_requests as request
        on request.id = new.request_id
     where folio.id = new.folio_id
       and request.accommodation_unit_id in (unit.id, unit.parent_id)
  ) then
    raise exception using
      errcode = '23514',
      message = 'a damage charge is on a Folio of a Stay in the request''s room';
  end if;

  if not exists (
    select 1
      from public.folio_lines as line
     where line.id = new.folio_line_id
       and line.folio_id = new.folio_id
       and line.line_type = 'charge'
       and line.posted_at = now()
  ) then
    raise exception using
      errcode = '23514',
      message = 'a damage charge links the charge posted with it';
  end if;

  new.charged_by := acting;
  new.created_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- A check-in is not withdrawn once the Guest has been moved
-- ---------------------------------------------------------------------------

-- Withdrawing a check-in returns the booking to confirmed as if nobody had
-- arrived. After a move the booking stands on the Unit the Guest was moved to
-- and a revision names a Stay that would no longer exist, so the withdrawal is
-- refused; a moved Guest who never should have arrived is corrected by moving
-- or checking them out (AB-S3-11). RZ004, not 55000: the desk is told this is
-- a move, not money posted. The same function, replaced, so the trigger
-- 20260916001500 created follows; the lock and the charges check are as before.
create or replace function public.stay_may_be_withdrawn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status = 'in_house' then
    -- Before the check, not after it. Whoever is posting a line against this
    -- Stay holds or will hold the same lock, so one of us waits and then sees
    -- what the other committed.
    perform pg_catalog.pg_advisory_xact_lock(
      1, pg_catalog.hashtext(old.id::text)
    );

    if exists (
      select 1
      from public.folio_lines as line
      join public.folios as folio on folio.id = line.folio_id
      where folio.stay_id = old.id
    ) then
      -- 55000, object_not_in_prerequisite_state, rather than 42501. A refusal
      -- from a policy is also 42501, and the caller has to tell the two apart:
      -- "you cannot do that" and "money has been posted" are different answers,
      -- and only the second is worth telling a front desk.
      raise exception 'that Stay has charges posted against it and cannot be withdrawn'
        using errcode = '55000';
    end if;

    if exists (
      select 1
      from public.reservation_changes as change
      where change.stay_id = old.id
        and change.kind = 'moved'
    ) then
      raise exception 'that Stay was moved and cannot be withdrawn'
        using errcode = 'RZ004';
    end if;
  end if;

  return new;
end;
$$;

