-- A room's housekeeping state looks its status holder up once per call
-- (20260916012100).
--
-- app.unit_housekeeping_state and app.unit_is_ready used to filter with
-- `holder.id = app.unit_status_holder(target)`. A stable function in a filter
-- is evaluated for every row a sequential scan checks, and each evaluation is a
-- query under the caller's row-level security — so one call for one room ran 43
-- of them on the hosted database, and the Housekeeping board took 8.5 s. An
-- index scan hides it, which is why the plan is forced here: the claim is that
-- the count does not depend on the plan.
--
-- Counted rather than timed. A timing assertion is flaky on a loaded runner and
-- passes on a fast machine that is still doing the wrong amount of work; the
-- number of lookups is the same everywhere. Written as the owner, because the
-- count is the same without row-level security — that only makes each lookup
-- dearer.
--
-- Checked by breaking it: both functions put back as 20260916009200 and
-- 20260916003960 wrote them, the altered bodies printed first, and the three
-- counting assertions seen red.
begin;
select plan(6);

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

-- Room 1 was left a minute from now, which reads dirty (HK-S1-22), so the
-- answers below are not an empty set that trivially counts one lookup.
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

-- SQL-language functions are only counted under 'all'. The scans are forced
-- sequential: that is the plan under which the lookup was repeated.
set local track_functions = 'all';
set local enable_indexscan = off;
set local enable_bitmapscan = off;
set local enable_indexonlyscan = off;

create function pg_temp.holder_lookups() returns bigint language sql as $$
  select coalesce(
    pg_stat_get_xact_function_calls('app.unit_status_holder(uuid)'::regprocedure),
    0)
$$;

create temp table lookups (label text primary key, n bigint not null);

insert into lookups values ('start', pg_temp.holder_lookups());
do $$ begin
  perform count(*) from app.unit_housekeeping_state('e2c11111-1111-4111-8111-111111111111');
end $$;
insert into lookups values ('one state', pg_temp.holder_lookups());
do $$ begin
  perform count(*) from public.accommodation_units as unit
    cross join app.unit_housekeeping_state(unit.id)
   where unit.property_id = 'e2b11111-1111-4111-8111-111111111111';
end $$;
insert into lookups values ('every room', pg_temp.holder_lookups());
do $$ begin
  perform app.unit_is_ready('e2c11112-1111-4111-8111-111111111111');
end $$;
insert into lookups values ('one readiness', pg_temp.holder_lookups());

select is(
  (select n from lookups where label = 'one state')
    - (select n from lookups where label = 'start'),
  1::bigint,
  'the state of one room looks its holder up once, not once per room scanned');

select is(
  (select n from lookups where label = 'every room')
    - (select n from lookups where label = 'one state'),
  6::bigint,
  'the state of six rooms looks six holders up: the cost follows the rooms asked about, not the rooms there are squared');

select is(
  (select n from lookups where label = 'one readiness')
    - (select n from lookups where label = 'every room'),
  2::bigint,
  'readiness looks its holder up once and reads the state, which looks it up once');

reset enable_indexscan;
reset enable_bitmapscan;
reset enable_indexonlyscan;

select is((select status from app.unit_housekeeping_state('e2c11111-1111-4111-8111-111111111111')),
  'dirty', 'a room a Guest has just left still reads dirty');
select is((select status from app.unit_housekeeping_state('e2c11112-1111-4111-8111-111111111111')),
  'clean', 'a room with nothing recorded still reads clean');
select is(app.unit_is_ready('e2c11111-1111-4111-8111-111111111111'), false,
  'and is still not ready');

select * from finish();
rollback;
