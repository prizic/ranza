-- CreateTable
CREATE TABLE "reservation_changes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "stay_id" UUID,
    "kind" TEXT NOT NULL,
    "business_date" DATE NOT NULL,
    "from_starts_on" DATE NOT NULL,
    "to_starts_on" DATE NOT NULL,
    "from_ends_on" DATE,
    "to_ends_on" DATE,
    "from_unit_id" UUID NOT NULL,
    "to_unit_id" UUID NOT NULL,
    "from_rate_minor" BIGINT,
    "from_rate_currency" CHAR(3),
    "to_rate_minor" BIGINT,
    "to_rate_currency" CHAR(3),
    "reason_kind" TEXT,
    "note" TEXT,
    "changed_by" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reservation_changes_reservation_idx" ON "reservation_changes"("reservation_id");

-- CreateIndex
CREATE INDEX "reservation_changes_from_unit_idx" ON "reservation_changes"("from_unit_id", "changed_at");

-- AddForeignKey
ALTER TABLE "reservation_changes" ADD CONSTRAINT "reservation_changes_property_id_organization_id_fkey" FOREIGN KEY ("property_id", "organization_id") REFERENCES "properties"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reservation_changes" ADD CONSTRAINT "reservation_changes_reservation_id_property_id_organizatio_fkey" FOREIGN KEY ("reservation_id", "property_id", "organization_id") REFERENCES "reservations"("id", "property_id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reservation_changes" ADD CONSTRAINT "reservation_changes_stay_id_property_id_organization_id_fkey" FOREIGN KEY ("stay_id", "property_id", "organization_id") REFERENCES "stays"("id", "property_id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reservation_changes" ADD CONSTRAINT "reservation_changes_from_unit_id_property_id_organization__fkey" FOREIGN KEY ("from_unit_id", "property_id", "organization_id") REFERENCES "accommodation_units"("id", "property_id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reservation_changes" ADD CONSTRAINT "reservation_changes_to_unit_id_property_id_organization_id_fkey" FOREIGN KEY ("to_unit_id", "property_id", "organization_id") REFERENCES "accommodation_units"("id", "property_id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reservation_changes" ADD CONSTRAINT "reservation_changes_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;


-- ---------------------------------------------------------------------------
-- Hand-written from here down (amend-booking slice 1, ADR 0039)
-- ---------------------------------------------------------------------------

-- A booking that has not arrived changes its dates, its Unit, or both. It is
-- changed through app.amend_reservation(), a definer that checks its caller,
-- and not through a wider grant: the update policy on reservations asks for
-- the permission the NEW status needs, so a grant on the dates would let any
-- check-in holder amend a booking, and an amend policy beside it would be
-- OR-ed in and let an amend-only role check a Guest in (ADR 0039). ranza_app's
-- update grants are therefore unchanged: (status, updated_at) here and
-- (status, ends_on, updated_at) on stays.

-- ---------------------------------------------------------------------------
-- The permission
-- ---------------------------------------------------------------------------

-- One permission for changing a booking, a departure and a room: the same
-- people do all three at a desk (AB-S1-21).
insert into public.staff_permissions (key, module_key) values
  ('front_desk.amend', 'front_office');

update public.staff_roles
   set permissions = array_append(permissions, 'front_desk.amend'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager', 'front_desk')
   and not ('front_desk.amend' = any (permissions));

-- ---------------------------------------------------------------------------
-- The revision
-- ---------------------------------------------------------------------------

alter table public.reservation_changes
  add constraint reservation_changes_kind_check
    check (kind in ('amended', 'departure_changed', 'moved')),
  add constraint reservation_changes_reason_kind_check
    check (reason_kind is null or reason_kind in ('fault', 'upgrade', 'guest_request', 'other')),
  -- A move says why; nothing else is asked to (AB-S3-02).
  add constraint reservation_changes_a_move_has_a_reason
    check ((kind = 'moved') = (reason_kind is not null)),
  add constraint reservation_changes_other_is_explained
    check (reason_kind is distinct from 'other' or nullif(btrim(note), '') is not null),
  add constraint reservation_changes_note_length_check
    check (note is null or char_length(note) <= 500),
  -- A change made to somebody in house names their Stay; a booking not yet
  -- arrived has none.
  add constraint reservation_changes_stay_when_in_house
    check ((kind = 'amended') = (stay_id is null));

comment on table public.reservation_changes is
  'One change to a booking or a Stay''s dates or Unit, append-only for every role (ADR 0039, AB-S1-24). Written only by the amend commands.';

alter table public.reservation_changes enable row level security;
alter table public.reservation_changes force row level security;

-- Read by reach, as the booking it belongs to is. Nothing may write it but the
-- commands: no insert, update or delete is granted to anybody.
create policy reservation_changes_read_accessible_property
  on public.reservation_changes
  for select
  using (property_id in (select app.accessible_property_ids()));

revoke all on public.reservation_changes from public, ranza_app, ranza_auth, ranza_worker;
grant select on public.reservation_changes to ranza_app;

-- Row-level security does not bind the owner the commands run as, so the
-- history is kept by a trigger instead, for every role (blueprint 7.4).
create function app.reservation_change_is_kept()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'reservation_changes is append-only'
    using errcode = '42501';
end;
$$;

create trigger reservation_changes_append_only
  before update or delete on public.reservation_changes
  for each statement
  execute function app.reservation_change_is_kept();

-- ---------------------------------------------------------------------------
-- A finished booking or Stay keeps its dates and Unit
-- ---------------------------------------------------------------------------

-- For every role (AB-S1-13). History is corrected by a reversal, never
-- rewritten. It also closes what 20260916003960 left open: ranza_app holds
-- update on stays.ends_on, and nothing stopped it rewriting the departure of a
-- Stay that had already departed. Check-out still works: the Stay it ends is
-- in house when the update begins.
create function app.a_finished_row_keeps_its_dates()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (old.starts_on, old.ends_on, old.accommodation_unit_id)
       is not distinct from (new.starts_on, new.ends_on, new.accommodation_unit_id) then
    return new;
  end if;

  if (tg_table_name = 'reservations' and old.status in ('checked_out', 'cancelled', 'no_show'))
     or (tg_table_name = 'stays' and old.status in ('departed', 'cancelled')) then
    raise exception 'a finished % keeps its dates and Unit', tg_table_name
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function app.a_finished_row_keeps_its_dates() is
  'Refuses changing the dates or Unit of a finished booking or Stay, for every role (AB-S1-13).';

create trigger reservations_finished_keep_their_dates
  before update of starts_on, ends_on, accommodation_unit_id on public.reservations
  for each row execute function app.a_finished_row_keeps_its_dates();

create trigger stays_finished_keep_their_dates
  before update of starts_on, ends_on, accommodation_unit_id on public.stays
  for each row execute function app.a_finished_row_keeps_its_dates();

-- ---------------------------------------------------------------------------
-- Another kind of Unit is another price
-- ---------------------------------------------------------------------------

-- A booking moved to a Unit of another kind is stamped with today's price for
-- that kind, in the Property's currency, or left unpriced when there is none
-- (AB-S1-03). The same kind keeps its price, and so does every change of dates
-- (AB-S1-04). A Guest already checked in keeps theirs when moved (AB-S3-05):
-- only a booking still to come is re-priced.
--
-- The body is the insert stamp's (20260916008100), for the same lock: the
-- Property row FOR SHARE, so a currency change and a re-price serialise. One
-- difference: a Property out of reach raises instead of leaving the booking
-- unpriced, because on an update that would erase a price the Guest agreed.
--
-- reservations_keep_their_price fires on a SET that names the price columns;
-- a BEFORE trigger writing NEW does not, so both hold at once. It writes no
-- row, only NEW, and its body is kept free of a statement verb for the writer
-- sweep in insert_grants.
create function app.reservation_is_priced_for_its_new_kind()
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

  return new;
end;
$$;

comment on function app.reservation_is_priced_for_its_new_kind() is
  'Stamps a booking still to come with the price of its new Unit''s kind when the kind changes, holding the Property row against a currency change (ADR 0039, AB-S1-03).';

revoke execute on function app.reservation_is_priced_for_its_new_kind() from public;

create trigger reservations_priced_for_a_new_kind
  before update of accommodation_unit_id on public.reservations
  for each row execute function app.reservation_is_priced_for_its_new_kind();

-- ---------------------------------------------------------------------------
-- The command
-- ---------------------------------------------------------------------------

-- Changes a booking that has not arrived (AB-S1-01..20). A definer that checks
-- its caller before it reads anything it returns, and bounded by the gates
-- every front-desk write carries: app.can_use_capability for the four of
-- blueprint 3.5, app.has_organization_permission for the fifth (ADR 0012, 0026).
-- A booking out of reach, one that does not exist and one in the wrong state
-- answer alike (42501), as a policy would.
--
-- The locks are the global order of ADR 0038: every Unit the change touches in
-- hashed order (namespace 2), so two changes between the same two rooms wait
-- rather than deadlock (AB-S1-20); then the Property's business day, shared
-- (namespace 3), so a close cannot slip between reading today and writing.
-- Row locks come after, never before. The booking is re-read under FOR UPDATE
-- and refused as changed (RZ003) if its Unit moved after it was first read or
-- another revision landed since the caller's (AB-S1-19). The version is the
-- number of revisions, not updated_at, whose microseconds a JavaScript Date
-- does not keep.
--
-- Availability is the constraints' and triggers' to decide, as at check-in:
-- reservations_no_double_booking (23P01), app.unit_holds_one_occupancy (55006),
-- reservations_unit_is_sellable (55000). Reservations have no in-service
-- trigger, so that one is checked here (55000, AB-S1-15), with the lock
-- app.unit_is_in_service() takes on a Stay.
create function app.amend_reservation(
  target_reservation uuid,
  new_starts_on date,
  new_ends_on date,
  new_unit uuid,
  expected_version integer,
  change_note text
)
returns table (
  change_id uuid,
  change_organization_id uuid,
  change_property_id uuid,
  previous_unit_id uuid,
  current_unit_id uuid,
  current_rate_minor text,
  current_rate_currency text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  booking public.reservations%rowtype;
  first_unit uuid;
  target_property uuid;
  target_organization uuid;
  unit_key integer;
  today date;
  revisions integer;
  unit_status text;
  room_id uuid;
  room_status text;
  revision uuid;
begin
  select reservation.accommodation_unit_id, reservation.property_id, reservation.organization_id
    into first_unit, target_property, target_organization
    from public.reservations as reservation
   where reservation.id = target_reservation;

  if not found
     or not app.can_use_capability(target_property, 'front_office', 'front_desk')
     or not app.has_organization_permission(target_organization, 'front_desk.amend') then
    raise exception 'that booking cannot be changed'
      using errcode = '42501';
  end if;

  if new_unit is null or new_starts_on is null then
    raise exception 'a booking has an arrival and a Unit'
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

  select * into booking
    from public.reservations as reservation
   where reservation.id = target_reservation
     for update;

  select count(*)::integer into revisions
    from public.reservation_changes as change
   where change.reservation_id = target_reservation;

  if booking.accommodation_unit_id <> first_unit
     or revisions is distinct from expected_version then
    raise exception 'that booking changed since it was read'
      using errcode = 'RZ003';
  end if;

  if booking.status not in ('requested', 'confirmed') then
    raise exception 'only a booking that has not arrived is changed this way'
      using errcode = '42501';
  end if;

  today := app.property_today(booking.property_id);
  if new_starts_on < today then
    raise exception 'a booking cannot arrive before today'
      using errcode = '23514';
  end if;
  if new_ends_on is null and booking.stay_type = 'guest' then
    raise exception 'a Guest booking has a departure'
      using errcode = '23514';
  end if;

  if new_starts_on = booking.starts_on
     and new_ends_on is not distinct from booking.ends_on
     and new_unit = booking.accommodation_unit_id then
    raise exception 'that change changes nothing'
      using errcode = '23514';
  end if;

  if new_unit <> booking.accommodation_unit_id then
    select unit.status, unit.parent_id
      into unit_status, room_id
      from public.accommodation_units as unit
     where unit.id = new_unit
       and unit.property_id = booking.property_id
       for share;
    if not found then
      raise exception 'that booking cannot be changed'
        using errcode = '42501';
    end if;

    if room_id is not null then
      select room.status into room_status
        from public.accommodation_units as room
       where room.id = room_id
         for share;
    end if;

    if unit_status in ('blocked', 'out_of_service')
       or room_status in ('blocked', 'out_of_service') then
      raise exception using
        errcode = '55000',
        message = 'that Accommodation Unit is not in service';
    end if;

    -- Named in SET only when it changes: the sellability and re-price
    -- triggers are UPDATE OF accommodation_unit_id, and a date change must not
    -- be refused for a room split into beds after the booking was taken.
    update public.reservations as reservation
       set accommodation_unit_id = new_unit,
           starts_on = new_starts_on,
           ends_on = new_ends_on,
           updated_at = now()
     where reservation.id = target_reservation;
  else
    update public.reservations as reservation
       set starts_on = new_starts_on,
           ends_on = new_ends_on,
           updated_at = now()
     where reservation.id = target_reservation;
  end if;

  insert into public.reservation_changes (
    organization_id, property_id, reservation_id, stay_id, kind, business_date,
    from_starts_on, to_starts_on, from_ends_on, to_ends_on,
    from_unit_id, to_unit_id,
    from_rate_minor, from_rate_currency, to_rate_minor, to_rate_currency,
    note, changed_by
  )
  select booking.organization_id, booking.property_id, booking.id, null, 'amended', today,
         booking.starts_on, reservation.starts_on, booking.ends_on, reservation.ends_on,
         booking.accommodation_unit_id, reservation.accommodation_unit_id,
         booking.nightly_rate_minor, booking.rate_currency,
         reservation.nightly_rate_minor, reservation.rate_currency,
         nullif(btrim(change_note), ''), app.current_user_id()
    from public.reservations as reservation
   where reservation.id = target_reservation
  returning id into revision;

  return query
    select revision, reservation.organization_id, reservation.property_id,
           booking.accommodation_unit_id, reservation.accommodation_unit_id,
           reservation.nightly_rate_minor::text, reservation.rate_currency::text
      from public.reservations as reservation
     where reservation.id = target_reservation;
end;
$$;

comment on function app.amend_reservation(uuid, date, date, uuid, integer, text) is
  'Changes the dates or Unit of a booking that has not arrived, for a caller holding front_desk.amend within the front desk''s gates, and records the revision (ADR 0039, amend-booking slice 1).';

revoke execute on function app.amend_reservation(uuid, date, date, uuid, integer, text) from public;
grant execute on function app.amend_reservation(uuid, date, date, uuid, integer, text) to ranza_app;
