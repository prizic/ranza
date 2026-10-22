-- Housekeeping answers for a set of rooms in one statement.
--
-- The board asked for each room's state and readiness one room at a time:
-- app.unit_housekeeping_state and app.unit_is_ready, called once per row, and
-- readiness read the state again. Each call is a query of its own under the
-- caller's row-level security, which sets its policy subqueries up again, so a
-- Property of 42 rooms made about 126 statements for one screen. Measured on
-- the hosted database with current planner statistics, that was 1.7 s for the
-- board; the same answers in one statement take 0.1 s. It is also why Today
-- and the Housekeeping page were slow: both read the board.
--
-- 20260916012100 stopped each call looking its holder up once per room scanned.
-- This removes the other multiplier, the call itself, and leaves the rules
-- where they were — stated once, in the two functions below, which the
-- per-room functions now call, so the board, the arrivals list and check-in
-- still cannot disagree about a room (HK-S1-13, HK-S1-22).
--
-- Security invoker, like the functions they replace: they read
-- accommodation_units, stays, reservation_changes and housekeeping_unit_status
-- under their reach-only read policies, so one viewer gets one answer on every
-- screen. A holder the caller cannot see yields no row.

-- The state of every status holder named: dirty if a Guest has left it, or
-- been moved out of it, since its status last changed; its recorded status
-- otherwise; clean if it has none. The body is the one 20260916009200 wrote
-- for one Unit, with `any (...)` in place of `= one holder`, and one change: a
-- move's destination is joined and its holder read from the row
-- (`coalesce(parent_id, id)`, what app.unit_status_holder() returns) instead of
-- calling that function for every reservation_changes row, which would again be
-- a query per row, growing with every move ever recorded. A destination the
-- caller cannot see, or none, drops the move, as the function's null did. A
-- holder here is a status holder (a room, or a Unit with no room above it);
-- naming a bed finds nothing, which is why the per-room function resolves its
-- holder first.
create function app.housekeeping_states(target_holder_ids uuid[])
returns table (holder_id uuid, status text, changed_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select holder.id,
         case when greatest(departure.departed_at, moved.moved_at) is not null
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
       join public.accommodation_units as destination
         on destination.id = change.to_unit_id
      where change.kind = 'moved'
        and (unit.id = holder.id or unit.parent_id = holder.id)
        and coalesce(destination.parent_id, destination.id) <> holder.id
        and change.business_date >= app.property_today(holder.property_id) - 1
        and change.changed_at
            > coalesce(state.status_changed_at, '-infinity'::timestamptz)
   ) as moved
   where holder.id = any (target_holder_ids)
$$;

comment on function app.housekeeping_states(uuid[]) is
  'The housekeeping state of each named status holder, in one statement: dirty if a Guest has left it since its status last changed, its status otherwise, clean if it has none; and since when (ADR 0029). app.unit_housekeeping_state is this for one Unit.';

grant execute on function app.housekeeping_states(uuid[]) to ranza_app;

-- Whether a status holder may be let tonight, given its state and the Property
-- it is at: not dirty, and inspected where the Property asks for inspection;
-- always where housekeeping is not available, because every writer is gated on
-- it and a dirty row there could never be cleared (HK-S1-20). The CASE is the
-- one 20260916003960 wrote inside app.unit_is_ready, moved here so the board can
-- apply it to a state it has already read instead of reading it again.
create function app.status_is_ready(target_property_id uuid, target_status text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
           when not app.capability_is_available(
                  target_property_id, 'housekeeping', 'housekeeping') then true
           when target_status = 'dirty' then false
           when target_status = 'inspected' then true
           else not app.housekeeping_inspection_required(target_property_id)
         end
$$;

comment on function app.status_is_ready(uuid, text) is
  'Whether a status holder at a Property may be let tonight, given its housekeeping status (ADR 0029): not dirty, and inspected where the Property asks for inspection, and always where housekeeping is not available.';

grant execute on function app.status_is_ready(uuid, text) to ranza_app;

-- The per-room functions keep their signatures, return types, grants and
-- comments, so every caller stands. The holder is resolved once, as
-- 20260916012100 did, and the rest is the set function above.
create or replace function app.unit_housekeeping_state(target_unit_id uuid)
returns table (status text, changed_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select state.status, state.changed_at
    from app.housekeeping_states(
           array[(select app.unit_status_holder(target_unit_id))]) as state
$$;

-- A Unit nobody can see is ready, as before: there is nothing there to hold a
-- check-in up.
create or replace function app.unit_is_ready(target_unit_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select app.status_is_ready(holder.property_id, state.status)
       from public.accommodation_units as holder
      cross join app.unit_housekeeping_state(holder.id) as state
      where holder.id = (select app.unit_status_holder(target_unit_id))),
    true)
$$;
