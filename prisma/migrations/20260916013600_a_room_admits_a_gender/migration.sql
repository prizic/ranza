-- Which gender a room admits, refused in the database (RANZ-110, RB-S5-*).
--
-- Turkish dormitories place students by gender: some whole buildings, some
-- floors, some rooms. A room is the unit every one of those reduces to, so
-- that is where it is stored; a building is a bulk action over its rooms, not
-- a stored default. ADR 0057: it is a setting any Property may use, a
-- hostel's women-only dorm as much as a yurt, and nothing here reads
-- `operating_model`.
--
-- Null means anyone, which is every room this migration finds.
--
-- `guests.gender` is recorded only when a room needs it. A Guest with none
-- recorded is refused a gendered room, so the desk is asked rather than the
-- database guessing.
--
-- SQLSTATEs, Ranza's own class (see 20260916005000):
--   RZ005  that room does not admit this Guest
--   RZ006  that change would leave somebody booked into a room that no longer
--          admits them

alter table public.accommodation_units
  add column admits text,
  add constraint accommodation_units_admits_check
    check (admits is null or admits in ('female', 'male')),
  -- A bed admits whom its room admits; two answers for one room could only
  -- disagree.
  add constraint accommodation_units_admits_on_the_room
    check (admits is null or parent_id is null);

comment on column public.accommodation_units.admits is
  'Which gender this room admits, female or male; null for anyone. On the room, never a bed (RB-S5-*).';

alter table public.guests
  add column gender text,
  add constraint guests_gender_check
    check (gender is null or gender in ('female', 'male'));

comment on column public.guests.gender is
  'female or male when recorded; null when not. Recorded when a gendered room needs it (RB-S5-*).';

-- A room is given its gender when it is added, by whoever may add it. Changing
-- it afterwards is `app.set_room_admits` below and no grant: three UPDATE
-- policies on the table are permissive, and one of them is maintenance's, so a
-- column grant would let anybody who may take a room out of order re-gender it.
grant insert (admits) on public.accommodation_units to ranza_app;

-- One UPDATE policy on guests, `front_desk.book`'s, so the grant is bounded by
-- the people who take bookings.
grant insert (gender), update (gender) on public.guests to ranza_app;

-- Whether a Unit's room admits a Guest. The room is the Unit itself or, for a
-- bed, its parent. A missing Unit or Guest answers true, so the foreign key
-- that refuses it is the one that speaks.
create function app.room_admits(target_unit uuid, target_guest uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select room.admits is null or coalesce(room.admits = guest.gender, false)
        from public.accommodation_units as unit
        join public.accommodation_units as room
          on room.id = coalesce(unit.parent_id, unit.id)
       cross join public.guests as guest
       where unit.id = target_unit
         and guest.id = target_guest
    ),
    true
  );
$$;

revoke execute on function app.room_admits(uuid, uuid) from public;

create function app.booking_is_admitted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('requested', 'confirmed', 'checked_in')
     and not app.room_admits(new.accommodation_unit_id, new.guest_id) then
    raise exception 'that room does not admit this Guest'
      using errcode = 'RZ005';
  end if;
  return new;
end;
$$;

create trigger reservations_room_admits_the_guest
  before insert or update of accommodation_unit_id, guest_id, status
  on public.reservations
  for each row execute function app.booking_is_admitted();

-- A Stay names no Guest; its booking does. A Stay with no booking has nobody
-- to ask about, and is admitted.
create function app.stay_is_admitted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('reserved', 'in_house')
     and new.reservation_id is not null
     and not app.room_admits(
       new.accommodation_unit_id,
       (select booking.guest_id
          from public.reservations as booking
         where booking.id = new.reservation_id)
     ) then
    raise exception 'that room does not admit this Guest'
      using errcode = 'RZ005';
  end if;
  return new;
end;
$$;

create trigger stays_room_admits_the_guest
  before insert or update of accommodation_unit_id, status, reservation_id
  on public.stays
  for each row execute function app.stay_is_admitted();

-- Re-gendering a room nobody holds is free; one somebody holds is refused for
-- as long as one of them would no longer be admitted. Making a room open to
-- anyone is always allowed.
--
-- What holds a room: a booking not yet finished, and a Stay not yet over. A
-- requested or confirmed booking whose departure has passed is a Guest who
-- never came and nobody marked, and holds nothing; an in-house Stay holds its
-- room however late its planned departure.
create function app.room_keeps_whom_it_admits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.admits is not null
     and new.admits is distinct from old.admits
     and exists (
       select 1
         from public.accommodation_units as unit
         join public.reservations as booking
           on booking.accommodation_unit_id = unit.id
         join public.guests as guest on guest.id = booking.guest_id
        where (unit.id = new.id or unit.parent_id = new.id)
          and guest.gender is distinct from new.admits
          and (
            booking.status = 'checked_in'
            or (
              booking.status in ('requested', 'confirmed')
              and (booking.ends_on is null
                   or booking.ends_on > app.property_today(booking.property_id))
            )
          )
       union all
       select 1
         from public.accommodation_units as unit
         join public.stays as stay on stay.accommodation_unit_id = unit.id
         join public.reservations as booking on booking.id = stay.reservation_id
         join public.guests as guest on guest.id = booking.guest_id
        where (unit.id = new.id or unit.parent_id = new.id)
          and guest.gender is distinct from new.admits
          and stay.status in ('reserved', 'in_house')
     ) then
    raise exception 'that room has somebody booked it would no longer admit'
      using errcode = 'RZ006';
  end if;
  return new;
end;
$$;

create trigger accommodation_units_keep_whom_they_admit
  before update of admits
  on public.accommodation_units
  for each row execute function app.room_keeps_whom_it_admits();

-- Correcting a Guest's gender is refused while it would put them in a room
-- that no longer admits them; recording one where none was is the same check.
create function app.guest_keeps_their_rooms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.gender is distinct from old.gender and exists (
    select 1
      from public.reservations as booking
      join public.accommodation_units as unit
        on unit.id = booking.accommodation_unit_id
      join public.accommodation_units as room
        on room.id = coalesce(unit.parent_id, unit.id)
     where booking.guest_id = new.id
       and room.admits is not null
       and room.admits is distinct from new.gender
       and (
         booking.status = 'checked_in'
         or (
           booking.status in ('requested', 'confirmed')
           and (booking.ends_on is null
                or booking.ends_on > app.property_today(booking.property_id))
         )
       )
    union all
    select 1
      from public.stays as stay
      join public.reservations as booking on booking.id = stay.reservation_id
      join public.accommodation_units as unit
        on unit.id = stay.accommodation_unit_id
      join public.accommodation_units as room
        on room.id = coalesce(unit.parent_id, unit.id)
     where booking.guest_id = new.id
       and stay.status in ('reserved', 'in_house')
       and room.admits is not null
       and room.admits is distinct from new.gender
  ) then
    raise exception 'that Guest is booked into a room that would no longer admit them'
      using errcode = 'RZ006';
  end if;
  return new;
end;
$$;

create trigger guests_keep_their_rooms
  before update of gender
  on public.guests
  for each row execute function app.guest_keeps_their_rooms();

-- Changing whom an existing room admits, by whoever may configure rooms: the
-- one way to write the column after the room exists (see the grant above).
-- Returns the room and its previous answer, for the audit record the caller
-- writes. A room out of the caller's reach, and a bed, which answers as its
-- room, are one refusal.
create function app.set_room_admits(target_room uuid, wanted text)
returns table (
  room_organization_id uuid,
  room_property_id uuid,
  room_name text,
  previous_admits text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  room public.accommodation_units%rowtype;
begin
  select * into room
    from public.accommodation_units as unit
   where unit.id = target_room
     for update;

  if not found
     or room.parent_id is not null
     or room.property_id not in (select app.accessible_property_ids())
     or not app.can_use_capability(room.property_id, 'front_office', 'front_desk')
     or not app.has_organization_permission(room.organization_id, 'accommodation.configure') then
    raise exception 'that room cannot be changed'
      using errcode = '42501';
  end if;

  update public.accommodation_units
     set admits = wanted,
         updated_at = current_timestamp
   where id = target_room
     and admits is distinct from wanted;

  room_organization_id := room.organization_id;
  room_property_id := room.property_id;
  room_name := room.name;
  previous_admits := room.admits;
  return next;
end;
$$;

revoke execute on function app.set_room_admits(uuid, text) from public;
grant execute on function app.set_room_admits(uuid, text) to ranza_app;
