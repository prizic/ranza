-- A room a Guest has just left reads dirty everywhere, and a departure keeps
-- its moment (RANZ-23 meeting RANZ-28; ADR 0029 amended).
--
-- AlterTable
ALTER TABLE "stays" ADD COLUMN     "departed_at" TIMESTAMPTZ(6);

-- ---------------------------------------------------------------------------
-- Hand-written from here down
-- ---------------------------------------------------------------------------
--
-- ON THE NUMBER. 003960 follows 003950, whose function it replaces, inside the
-- range feat/front-desk-occupancy owns (003500 to 003999). 003950 is not edited:
-- local databases have applied it, and `migrate deploy` would not notice.
--
-- WHAT 003950 LEFT HALF-DONE. It made a room a Guest has just left not ready,
-- and said so to the desk only. The housekeeping board shows the stored status
-- beside readiness, so the same room read `clean` there — "waiting for
-- inspection" with inspection switched off, plain `inspected` with it on — and
-- the dirty count and the dirty filter both left it out. The desk heard "not
-- ready" while nobody was told to clean it, for as long as the worker took to
-- deliver the departure, which is up to two days if it is down. So the answer
-- now lives in one function, `app.unit_housekeeping_state`, which says what
-- state a room is in as housekeeping should see it: dirty when a Guest has left
-- it since its status was last set, what the status says otherwise, and clean
-- when nothing was ever said. The board's status, its counts and filter, the
-- status a mark records it replaced, and readiness all read it.
--
-- WHAT 003950 ASSUMED. It read the moment of departure from stays.updated_at,
-- which only works while nothing touches a departed Stay again. Nothing does
-- today — closeStayWithin and withdrawStayWithin are the only writers and both
-- require in_house — but nothing stops it: ranza_app may update ends_on and
-- updated_at on any Stay its update policy admits, departed ones included, and
-- a re-dating the close-the-day guard lets through onto an open day would move
-- updated_at. 003000 declined that column for the worker for exactly this
-- reason. `departed_at` is the moment itself, written by the database: stamped
-- when a Stay becomes departed and carried over unchanged by every later
-- update, whoever makes it, in the way `housekeeping_unit_status` stamps its
-- own `status_changed_at`. updated_at goes back to meaning only what it says.
--
-- Stamped with now(), in the transaction whose outbox row takes occurred_at
-- from now() as well, so readiness and `mark_unit_dirty_after_check_out`
-- compare the very same instant against a room's mark.

-- ---------------------------------------------------------------------------
-- The moment a Guest left
-- ---------------------------------------------------------------------------

-- Before the stamp exists, which would otherwise carry the null over. Every
-- departed Stay so far was closed by a statement that set updated_at = now()
-- and has not been written since, so updated_at is its departure.
update public.stays
   set departed_at = updated_at
 where status = 'departed';

alter table public.stays
  add constraint stays_departed_at_is_the_departure
  check ((status = 'departed') = (departed_at is not null));

-- A Stay inserted as already departed keeps the moment it states — history
-- brought in from elsewhere knows when its Guest left — and gets now() when it
-- states none. ranza_app's insert column list does not name the column, so no
-- request can state one. Invoker: it reads nothing.
create function app.stay_departure_is_stamped()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.departed_at := case
      when new.status = 'departed' then coalesce(new.departed_at, now())
    end;
  elsif new.status = 'departed' and old.status <> 'departed' then
    new.departed_at := now();
  else
    new.departed_at := old.departed_at;
  end if;
  return new;
end;
$$;

comment on function app.stay_departure_is_stamped() is
  'Stamps stays.departed_at when a Stay becomes departed and carries it over unchanged on every later update, for every role.';

create trigger stays_departure_is_stamped
  before insert or update on public.stays
  for each row execute function app.stay_departure_is_stamped();

comment on column public.stays.departed_at is
  'When the Guest left: stamped by the database as the Stay becomes departed, never moved after (ADR 0029). Null unless departed.';

-- ranza_app reads it through the table-level select 20260916000500 granted,
-- which covers a column added later; its insert and update column lists do
-- not name it, so no request can write it.

-- ---------------------------------------------------------------------------
-- The state housekeeping sees
-- ---------------------------------------------------------------------------

-- Takes any Unit and answers for its status holder: a bed with a room above it
-- has no status of its own (HK-S1-12). No row for a Unit the caller cannot see.
--
-- Only departures from yesterday's business date on, as 003950 decided:
-- switching housekeeping on at a Property with a history must not read every
-- room anybody ever left as dirty. Yesterday rather than today covers a
-- check-out at 03:59 whose delivery lands after the cutoff. `changed_at` is the
-- latest such departure when that is what makes the room dirty, so "when did
-- this change" is answered by what changed it.
--
-- Security invoker, like unit_is_ready: it reads accommodation_units,
-- housekeeping_unit_status and stays under their reach-only read policies, so
-- the board, the arrivals list and check-in give one viewer one answer.
create function app.unit_housekeeping_state(target_unit_id uuid)
returns table (status text, changed_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select case when departure.departed_at is not null then 'dirty'
              else coalesce(state.status, 'clean') end,
         coalesce(departure.departed_at, state.status_changed_at)
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
   where holder.id = app.unit_status_holder(target_unit_id)
$$;

comment on function app.unit_housekeeping_state(uuid) is
  'The housekeeping state of a Unit''s status holder: dirty if a Guest has left it since its status last changed, its status otherwise, clean if it has none; and since when (ADR 0029).';

grant execute on function app.unit_housekeeping_state(uuid) to ranza_app;

-- ---------------------------------------------------------------------------
-- Readiness reads it
-- ---------------------------------------------------------------------------

-- The same rule as 003950, stated once instead of twice. A Unit nobody can see
-- is ready, as before: there is nothing there to hold a check-in up.
create or replace function app.unit_is_ready(target_unit_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select case
              when not app.capability_is_available(
                     holder.property_id, 'housekeeping', 'housekeeping') then true
              when state.status = 'dirty' then false
              when state.status = 'inspected' then true
              else not app.housekeeping_inspection_required(holder.property_id)
            end
       from public.accommodation_units as holder
      cross join app.unit_housekeeping_state(holder.id) as state
      where holder.id = app.unit_status_holder(target_unit_id)),
    true)
$$;

comment on function app.unit_is_ready(uuid) is
  'Whether a Unit may be let tonight as far as housekeeping is concerned (ADR 0029): not dirty by app.unit_housekeeping_state, and inspected where the Property asks for inspection.';
