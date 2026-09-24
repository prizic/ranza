-- CreateTable
CREATE TABLE "housekeeping_unit_status" (
    "accommodation_unit_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "status_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status_changed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "housekeeping_unit_status_pkey" PRIMARY KEY ("accommodation_unit_id")
);

-- CreateIndex
CREATE INDEX "housekeeping_unit_status_property_id_status_idx" ON "housekeeping_unit_status"("property_id", "status");

-- AddForeignKey
ALTER TABLE "housekeeping_unit_status" ADD CONSTRAINT "housekeeping_unit_status_accommodation_unit_id_property_id_fkey" FOREIGN KEY ("accommodation_unit_id", "property_id", "organization_id") REFERENCES "accommodation_units"("id", "property_id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------
-- Hand-written from here down (RANZ-28, docs/features/housekeeping)
-- ---------------------------------------------------------------------------

-- Whether a room needs cleaning is a table of its own and not another value of
-- accommodation_units.status. The two coexist — a blocked room is still dirty,
-- and still dirty once unblocked — and one column holds one value. Nor could a
-- policy tell the two permissions apart on one column: the update grant there
-- is role-wide, so whoever may mark a room clean could block it (ADR 0029).
-- 20260916002900 predicted the opposite; this is where that changed.
--
-- ON THE NUMBER. 003000, the next after main's last.
--
-- This migration has no command a Staff Member runs. The board reads, and a
-- departure writes through one function; marking a room is 20260916003100.
-- An absent policy denies, and until then the absence is the decision
-- (ADR 0012).

alter table public.housekeeping_unit_status
  add constraint housekeeping_unit_status_status_check
    check (status in ('dirty', 'clean', 'inspected'));

comment on table public.housekeeping_unit_status is
  'Whether a room needs cleaning, one row per status holder (a Unit with no '
  'parent). A holder with no row reads as clean (ADR 0029).';
comment on column public.housekeeping_unit_status.status_changed_at is
  'When the status last changed. Stamped by the database; what a departure '
  'compares against, so a status changed after the Guest left is kept.';
comment on column public.housekeeping_unit_status.status_changed_by is
  'The Staff Member who changed it, stamped by the database. Null when a '
  'departure did.';

-- ---------------------------------------------------------------------------
-- Row-level security: read by reach
-- ---------------------------------------------------------------------------

-- Reach alone, as accommodation_units does (20260916000400). The commercial
-- gates are in the board's own statement, the way the Rooms read carries them.
alter table public.housekeeping_unit_status enable row level security;
alter table public.housekeeping_unit_status force row level security;

create policy housekeeping_unit_status_read_accessible_property
  on public.housekeeping_unit_status for select
  using (property_id in (select app.accessible_property_ids()));

grant select on public.housekeeping_unit_status to ranza_app;

-- ---------------------------------------------------------------------------
-- The holder, and what ready means
-- ---------------------------------------------------------------------------

-- The room answers for its beds. A bed under a room resolves to the room; a
-- room, or a bed with no room above it (ADR 0004), resolves to itself.
create function app.unit_status_holder(target_unit_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(unit.parent_id, unit.id)
  from public.accommodation_units as unit
  where unit.id = target_unit_id
$$;

comment on function app.unit_status_holder(uuid) is
  'The Unit whose housekeeping status answers for this one: its room, or itself.';

-- The one definition of ready, which the board, the arrivals list and check-in
-- all read. Inspection is not a setting yet, so ready is "not dirty"; the
-- inspection setting replaces this body, and because ready is read rather than
-- stored, switching inspection moves no room between states. A Unit with no
-- row is ready: a room is born clean.
--
-- A dirty row counts only where housekeeping is available. Every writer is
-- gated on it, so a Property that stops using housekeeping could otherwise
-- never clear a dirty room again, and every arrival there would be asked about
-- a status nobody can change (HK-S1-20). capability_is_available is a definer,
-- so what it answers does not depend on what the caller may read.
create function app.unit_is_ready(target_unit_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not exists (
    select 1
    from public.housekeeping_unit_status as state
    where state.accommodation_unit_id = app.unit_status_holder(target_unit_id)
      and state.status = 'dirty'
      and app.capability_is_available(
            state.property_id, 'housekeeping', 'housekeeping')
  )
$$;

comment on function app.unit_is_ready(uuid) is
  'Whether a Unit may be let tonight as far as housekeeping is concerned (ADR 0029).';

grant execute on function app.unit_status_holder(uuid) to ranza_app;
grant execute on function app.unit_is_ready(uuid) to ranza_app;

-- ---------------------------------------------------------------------------
-- Who and when are the database's to write
-- ---------------------------------------------------------------------------

-- Stamped on every write, so no caller states them: a write cannot claim the
-- system did it, or that it happened before a departure it followed. These
-- columns will be in no grant. Invoker, and so null under a worker context,
-- which is what a departure's own mark should say.
create function app.housekeeping_status_is_stamped()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.status_changed_at := now();
  new.status_changed_by := app.current_user_id();
  new.updated_at := now();
  return new;
end;
$$;

create trigger housekeeping_unit_status_stamped
  before insert or update on public.housekeeping_unit_status
  for each row execute function app.housekeeping_status_is_stamped();

-- A bed under a room holds no status of its own; its room answers for it.
-- Relaxing this is how per-bed status in a shared room would arrive
-- (HK-DEF-02). Definer, so a Unit the caller cannot see is still recognised as
-- a bed rather than waved through. No prose inside the body:
-- tests/database/insert_grants.test.sql reads every app definer's source.
create function app.housekeeping_status_holder_is_a_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.accommodation_units as unit
    where unit.id = new.accommodation_unit_id
      and unit.parent_id is not null
  ) then
    raise exception using
      errcode = '55000',
      message = 'that Accommodation Unit is a bed in a room; its room holds the status';
  end if;

  return new;
end;
$$;

comment on function app.housekeeping_status_holder_is_a_room() is
  'Refuses a housekeeping status on a bed that has a room above it (HK-S1-12).';

create trigger housekeeping_unit_status_holder_is_a_room
  before insert or update of accommodation_unit_id on public.housekeeping_unit_status
  for each row execute function app.housekeeping_status_holder_is_a_room();

-- ---------------------------------------------------------------------------
-- A departure makes the room dirty: one function and no grant
-- ---------------------------------------------------------------------------

-- The first real handler of stay.checked_out, in apps/worker, is this call and
-- nothing else. ranza_worker holds no grant on housekeeping_unit_status, as it
-- holds none on the credential tables: ADR 0027's shape, as a function of its
-- own rather than a wider old one.
--
-- It takes the event, not the Stay, and reads both the Stay and the moment of
-- departure from the event itself. Stays carry no departure timestamp, and
-- stays.updated_at would move if anything later touched a departed Stay; an
-- outbox event is never rewritten, so occurred_at is the moment and stays it.
--
-- In order:
--   - no worker context is refused, before anything is read (HK-S1-07);
--   - an event of another Organization is refused (HK-S1-08);
--   - an event that is not a departure, or a Stay that did not depart,
--     marks nothing (HK-S1-10);
--   - a Property where housekeeping is not available marks nothing, so a
--     front desk that never bought it does not see rooms turn dirty
--     (HK-S1-09). capability_is_available rather than can_use_capability,
--     which needs a Staff Member and is always false here;
--   - a status changed after the departure is kept: the later word wins
--     (HK-S1-05). A redelivery finds its own earlier mark stamped after the
--     departure and so changes nothing (HK-S1-04).
-- Returns whether a row was written.
create function app.mark_unit_dirty_after_check_out(target_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_organization uuid := app.worker_organization_id();
  event_organization uuid;
  event_kind text;
  departed_at timestamptz;
  departed_stay uuid;
  holder uuid;
  holder_property uuid;
  written integer;
begin
  if acting_organization is null then
    raise exception 'marking a room dirty requires a worker context'
      using errcode = '42501';
  end if;

  select event.organization_id, event.event_type, event.occurred_at,
         (event.payload ->> 'stayId')::uuid
    into event_organization, event_kind, departed_at, departed_stay
    from outbox.events as event
   where event.id = target_event_id;

  if not found then
    return false;
  end if;

  if event_organization <> acting_organization then
    raise exception 'that event belongs to another Organization'
      using errcode = '42501';
  end if;

  if event_kind <> 'stay.checked_out' or departed_stay is null then
    return false;
  end if;

  select coalesce(unit.parent_id, unit.id), stay.property_id
    into holder, holder_property
    from public.stays as stay
    join public.accommodation_units as unit
      on unit.id = stay.accommodation_unit_id
   where stay.id = departed_stay
     and stay.organization_id = acting_organization
     and stay.status = 'departed';

  if not found then
    return false;
  end if;

  if not app.capability_is_available(holder_property, 'housekeeping', 'housekeeping') then
    return false;
  end if;

  insert into public.housekeeping_unit_status
    (accommodation_unit_id, property_id, organization_id, status)
  values (holder, holder_property, acting_organization, 'dirty')
  on conflict (accommodation_unit_id) do update
     set status = 'dirty'
   where public.housekeeping_unit_status.status_changed_at < departed_at;

  get diagnostics written = row_count;
  return written > 0;
end;
$$;

comment on function app.mark_unit_dirty_after_check_out(uuid) is
  'Marks the room a departure left dirty, unless its status changed since. The '
  'whole of what ranza_worker may do to housekeeping_unit_status (ADR 0029).';

revoke execute on function app.mark_unit_dirty_after_check_out(uuid) from public;
grant execute on function app.mark_unit_dirty_after_check_out(uuid) to ranza_worker;
