-- A room a Guest has just left is not ready (RANZ-23 meeting RANZ-28; ADR 0029
-- amended, ADR 0033).
--
-- Hand-written; this migration adds no column and no table.
--
-- ON THE NUMBER. 003950 is inside the range feat/front-desk-occupancy owns
-- (003500 to 003999), and it has to sort after both housekeeping's 003200,
-- whose function it replaces, and this lane's 003700, whose rule makes it
-- necessary.
--
-- A check-out marks its room dirty through the worker, when it delivers
-- stay.checked_out: a couple of seconds normally, and for as long as the
-- worker is down otherwise. Until then no dirty row exists, and readiness read
-- the room as ready. That did not matter while a room could be let again
-- before its Guest was checked out; ADR 0033 made check-out the only way to
-- re-let one, so the window between a check-out and its delivery became the
-- path every turnover takes. The next Guest was checked in without the desk
-- being asked, and the worker then marked a room dirty with somebody in it.
--
-- So readiness asks what the worker asks, before it has asked it: has a Guest
-- left this room since anybody last said what state it is in? The comparison is
-- the worker's own, mark_unit_dirty_after_check_out's `status_changed_at <
-- departed_at`, read from the other side. closeStayWithin stamps the Stay's
-- updated_at in the transaction whose outbox row takes occurred_at from now(),
-- so the two instants are one. In every order the answers agree: before the
-- delivery the room is not ready; after it, it is dirty; once somebody marks it,
-- it is what they said, and the worker leaves a later mark alone (HK-S1-05).
--
-- Only departures from yesterday's business date on. Without a bound, turning
-- housekeeping on at a Property that has run for a year would read every room
-- anybody ever left as not ready until somebody marked it. Yesterday rather than
-- today covers a check-out at 03:59 whose delivery lands after the cutoff.
--
-- Still security invoker, as 003200 left it: it reads accommodation_units,
-- housekeeping_unit_status and now stays, all under reach-only read policies,
-- so the board, the arrivals list and checkIn get the same answer for one
-- viewer. The definer inventory in insert_grants is unchanged.
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
              when holder.status = 'dirty' then false
              when exists (
                select 1
                  from public.stays as stay
                  join public.accommodation_units as unit
                    on unit.id = stay.accommodation_unit_id
                 where coalesce(unit.parent_id, unit.id) = holder.id
                   and stay.status = 'departed'
                   and stay.ends_on >= app.property_today(holder.property_id) - 1
                   and stay.updated_at
                       > coalesce(holder.changed_at, '-infinity'::timestamptz)
              ) then false
              when holder.status = 'inspected' then true
              else not app.housekeeping_inspection_required(holder.property_id)
            end
       from (select unit.id,
                    unit.property_id,
                    coalesce(state.status, 'clean') as status,
                    state.status_changed_at as changed_at
               from public.accommodation_units as unit
               left join public.housekeeping_unit_status as state
                 on state.accommodation_unit_id = unit.id
              where unit.id = app.unit_status_holder(target_unit_id)) as holder),
    true)
$$;

comment on function app.unit_is_ready(uuid) is
  'Whether a Unit may be let tonight as far as housekeeping is concerned (ADR 0029): not dirty, not left by a Guest since its status last changed, and inspected where the Property asks for inspection.';
