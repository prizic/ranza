-- A room's housekeeping state is read once per call, and the board reads every
-- room's in one (20260916012100, 20260916012200).
--
-- app.unit_housekeeping_state and app.unit_is_ready used to filter with
-- `holder.id = app.unit_status_holder(target)`. A stable function in a filter
-- is evaluated for every row a sequential scan checks, and each evaluation is a
-- query under the caller's row-level security — so one call for one room ran 43
-- of them on the hosted database, and the Housekeeping board took 8.5 s. An
-- index scan hides it, which is why the plan is forced here: the claim is that
-- the count does not depend on the plan.
--
-- The board then still asked for each room one call at a time, about 126
-- statements for 42 rooms, each setting its policy subqueries up again.
-- app.housekeeping_states answers for a set of rooms in one statement and
-- app.status_is_ready applies readiness to a state already read; the per-room
-- functions are built on them, so there is one definition of dirty and of ready.
--
-- Counted rather than timed. A timing assertion is flaky on a loaded runner and
-- passes on a fast machine that is still doing the wrong amount of work; the
-- number of calls is the same everywhere. Written as the owner, because the
-- count is the same without row-level security — that only makes each call
-- dearer.
--
-- Checked by breaking it: the per-room functions put back as 20260916009200 and
-- 20260916003960 wrote them, and the board's statement put back to one call per
-- room, the altered bodies printed first, and the counting assertions seen red.
begin;
select plan(9);

insert into public.organizations (id, name, status) values
  ('e2a11111-1111-4111-8111-111111111111', 'Lookup Organization', 'active');
insert into public.properties (id, organization_id, name) values
  ('e2b11111-1111-4111-8111-111111111111',
   'e2a11111-1111-4111-8111-111111111111', 'Lookup Property');
insert into public.subscriptions (organization_id, status) values
  ('e2a11111-1111-4111-8111-111111111111', 'active');
insert into public.entitlements (organization_id, module_key) values
  ('e2a11111-1111-4111-8111-111111111111', 'housekeeping');
insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('e2b11111-1111-4111-8111-111111111111',
   'e2a11111-1111-4111-8111-111111111111', 'housekeeping', true);

-- Six rooms, so a per-row evaluation is visibly more than one.
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity)
select ('e2c1111' || n || '-1111-4111-8111-111111111111')::uuid,
       'e2b11111-1111-4111-8111-111111111111',
       'e2a11111-1111-4111-8111-111111111111', 'LK-' || n, 'room', 2
from generate_series(1, 6) as n;

-- The states differ, so that agreeing is not agreeing about one answer. Room 1
-- was left a minute from now, which reads dirty (HK-S1-22); room 2 was marked
-- dirty, room 3 inspected, room 4 clean; rooms 5 and 6 have nothing recorded.
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, stay_type, status,
   starts_on, ends_on, departed_at)
values ('e2f11111-1111-4111-8111-111111111111',
        'e2a11111-1111-4111-8111-111111111111',
        'e2b11111-1111-4111-8111-111111111111',
        'e2c11111-1111-4111-8111-111111111111', 'guest', 'departed',
        app.property_today('e2b11111-1111-4111-8111-111111111111') - 2,
        app.property_today('e2b11111-1111-4111-8111-111111111111'),
        now() + interval '1 minute');
insert into public.housekeeping_unit_status
  (accommodation_unit_id, property_id, organization_id, status)
values
  ('e2c11112-1111-4111-8111-111111111111', 'e2b11111-1111-4111-8111-111111111111',
   'e2a11111-1111-4111-8111-111111111111', 'dirty'),
  ('e2c11113-1111-4111-8111-111111111111', 'e2b11111-1111-4111-8111-111111111111',
   'e2a11111-1111-4111-8111-111111111111', 'inspected'),
  ('e2c11114-1111-4111-8111-111111111111', 'e2b11111-1111-4111-8111-111111111111',
   'e2a11111-1111-4111-8111-111111111111', 'clean');

-- SQL-language functions are only counted under 'all'. The scans are forced
-- sequential: that is the plan under which the lookup was repeated.
set local track_functions = 'all';
set local enable_indexscan = off;
set local enable_bitmapscan = off;
set local enable_indexonlyscan = off;

create function pg_temp.calls(target regprocedure) returns bigint language sql as $$
  select coalesce(pg_stat_get_xact_function_calls(target), 0)
$$;

create temp table calls (label text primary key, holder bigint not null, states bigint not null);

create function pg_temp.note(label text) returns void language sql as $$
  insert into calls values (label,
    pg_temp.calls('app.unit_status_holder(uuid)'::regprocedure),
    pg_temp.calls('app.housekeeping_states(uuid[])'::regprocedure))
$$;

select pg_temp.note('start');
do $$ begin
  perform count(*) from app.unit_housekeeping_state('e2c11111-1111-4111-8111-111111111111');
end $$;
select pg_temp.note('one state');
do $$ begin
  perform count(*) from public.accommodation_units as unit
    cross join app.unit_housekeeping_state(unit.id)
   where unit.property_id = 'e2b11111-1111-4111-8111-111111111111';
end $$;
select pg_temp.note('every room, one at a time');
do $$ begin
  perform app.unit_is_ready('e2c11115-1111-4111-8111-111111111111');
end $$;
select pg_temp.note('one readiness');
-- What the board's statement does: the state of every room, asked once.
do $$ begin
  perform count(*) from app.housekeeping_states(
    array(select holder.id from public.accommodation_units as holder
           where holder.property_id = 'e2b11111-1111-4111-8111-111111111111'
             and holder.parent_id is null));
end $$;
select pg_temp.note('every room, as a set');

select is(
  (select holder from calls where label = 'one state')
    - (select holder from calls where label = 'start'),
  1::bigint,
  'the state of one room looks its holder up once, not once per room scanned');

select is(
  (select holder from calls where label = 'every room, one at a time')
    - (select holder from calls where label = 'one state'),
  6::bigint,
  'the state of six rooms, one at a time, looks six holders up: the cost follows the rooms asked about, not the rooms there are squared');

select is(
  (select holder from calls where label = 'one readiness')
    - (select holder from calls where label = 'every room, one at a time'),
  2::bigint,
  'readiness looks its holder up once and reads the state, which looks it up once');

select is(
  (select states from calls where label = 'every room, as a set')
    - (select states from calls where label = 'one readiness'),
  1::bigint,
  'the state of six rooms, as a set, is one call and not six');

select is(
  (select holder from calls where label = 'every room, as a set')
    - (select holder from calls where label = 'one readiness'),
  0::bigint,
  'and it looks no holder up at all: the rooms are named, not found one by one');

reset enable_indexscan;
reset enable_bitmapscan;
reset enable_indexonlyscan;

select is(
  (select count(*)::int from (
     (select holder_id, status, changed_at
        from app.housekeeping_states(array(
               select id from public.accommodation_units where parent_id is null)))
     except
     (select unit.id, state.status, state.changed_at
        from public.accommodation_units as unit
       cross join app.unit_housekeeping_state(unit.id) as state
       where unit.parent_id is null)
   ) as only_in_the_set)
  + (select count(*)::int from (
     (select unit.id, state.status, state.changed_at
        from public.accommodation_units as unit
       cross join app.unit_housekeeping_state(unit.id) as state
       where unit.parent_id is null)
     except
     (select holder_id, status, changed_at
        from app.housekeeping_states(array(
               select id from public.accommodation_units where parent_id is null)))
   ) as only_one_at_a_time),
  0,
  'a set of rooms and the same rooms one at a time give the same state and the same moment, room for room');

select is(
  (select count(*)::int
     from public.accommodation_units as unit
    cross join app.unit_housekeeping_state(unit.id) as state
    where unit.parent_id is null
      and app.status_is_ready(unit.property_id, state.status)
          is distinct from app.unit_is_ready(unit.id)),
  0,
  'readiness applied to a state already read is readiness read from the room: the board and check-in cannot disagree');

select is((select status from app.unit_housekeeping_state('e2c11111-1111-4111-8111-111111111111')),
  'dirty', 'a room a Guest has just left still reads dirty');
select is(app.unit_is_ready('e2c11111-1111-4111-8111-111111111111'), false,
  'and is still not ready');

select * from finish();
rollback;
