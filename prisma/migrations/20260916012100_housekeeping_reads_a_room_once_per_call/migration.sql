-- A room's housekeeping state is read once per call, not once per room.
--
-- app.unit_housekeeping_state and app.unit_is_ready both found the status
-- holder with `where holder.id = app.unit_status_holder(target_unit_id)`. That
-- function is stable, not immutable, so when the planner scans
-- accommodation_units sequentially — which it does for a table this small — it
-- evaluates the call for every row it checks rather than once. Each evaluation
-- is a query of its own under the caller's row-level security, which runs the
-- policy subqueries again. Measured on the hosted database, one call for one
-- room ran unit_status_holder 43 times, and the Housekeeping board, which calls
-- both functions for every room, took 8.5 s for 42 rooms. Every list that asks
-- whether each row's room is ready — arrivals, in house, room assignment —
-- paid the same per row.
--
-- Whether it was paid at all depended on the plan: an index scan evaluates a
-- stable call once, as an index condition, so a database whose statistics
-- favoured the index never showed it. Wrapping the call in a scalar subquery
-- makes it an InitPlan, evaluated once per call under any plan.
--
-- The answers do not change; only how often the holder is looked up does. Same
-- signatures and return types, so the grants, the comments and every caller
-- stand. A correction to a function body is a new migration, as 003960 and
-- 009200 were; an applied one is never edited.

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
   where holder.id = (select app.unit_status_holder(target_unit_id))
$$;

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
      where holder.id = (select app.unit_status_holder(target_unit_id))),
    true)
$$;
