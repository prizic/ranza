-- A room a Guest has just left is not ready, and reads dirty (20260916003950,
-- 20260916003960; HK-S1-21, HK-S1-22, HK-S1-23).
--
-- Written as the owner, because the rules are functions, a trigger and a
-- check constraint, not policies. Within one transaction now() does not move,
-- so each departure is dated either side of its room's mark explicitly; that is
-- also what pins the comparison to strictly later, the worker's own. The owner
-- may state a departed Stay's moment on insert, which is what lets it do so.
--
-- Every assertion here was checked by breaking the thing it asserts — the
-- departure clause removed, the date bound removed, the bound narrowed to today,
-- the bed's arm of the Unit match dropped, readiness reading updated_at again,
-- the stamp dropped, the check constraint dropped, the column granted for
-- update, the execute grant dropped — and confirming it went red.
begin;
select plan(19);

insert into public.organizations (id, name, status) values
  ('e0a11111-1111-4111-8111-111111111111', 'Turnover Organization', 'active');
insert into public.properties (id, organization_id, name) values
  ('e0b11111-1111-4111-8111-111111111111',
   'e0a11111-1111-4111-8111-111111111111', 'Turnover Property');
insert into public.subscriptions (organization_id, status) values
  ('e0a11111-1111-4111-8111-111111111111', 'active');
insert into public.entitlements (organization_id, module_key) values
  ('e0a11111-1111-4111-8111-111111111111', 'housekeeping');
insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('e0b11111-1111-4111-8111-111111111111',
   'e0a11111-1111-4111-8111-111111111111', 'housekeeping', true);

-- Rooms 1-6; room 6 has two beds under it.
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity)
select ('e0c1111' || n || '-1111-4111-8111-111111111111')::uuid,
       'e0b11111-1111-4111-8111-111111111111',
       'e0a11111-1111-4111-8111-111111111111', 'TO-' || n, 'room', 2
from generate_series(1, 6) as n;
insert into public.accommodation_units
  (id, property_id, organization_id, parent_id, parent_unit_type, name,
   unit_type, capacity) values
  ('e0d11111-1111-4111-8111-111111111111', 'e0b11111-1111-4111-8111-111111111111',
   'e0a11111-1111-4111-8111-111111111111', 'e0c11116-1111-4111-8111-111111111111',
   'room', 'A', 'bed', 1);

-- Rooms 1, 2 and 6 were marked clean just now.
insert into public.housekeeping_unit_status
  (accommodation_unit_id, property_id, organization_id, status)
select ('e0c1111' || n || '-1111-4111-8111-111111111111')::uuid,
       'e0b11111-1111-4111-8111-111111111111',
       'e0a11111-1111-4111-8111-111111111111', 'clean'
from unnest(array[1, 2, 6]) as n;

create function pg_temp.departed(stay uuid, unit uuid, ended_days int, at_ timestamptz)
returns void language sql as $$
  insert into public.stays
    (id, organization_id, property_id, accommodation_unit_id, stay_type, status,
     starts_on, ends_on, departed_at)
  values (stay, 'e0a11111-1111-4111-8111-111111111111',
          'e0b11111-1111-4111-8111-111111111111', unit, 'guest', 'departed',
          app.property_today('e0b11111-1111-4111-8111-111111111111') + ended_days - 2,
          app.property_today('e0b11111-1111-4111-8111-111111111111') + ended_days,
          at_);
$$;

select pg_temp.departed('e0f11111-1111-4111-8111-111111111111',
  'e0c11111-1111-4111-8111-111111111111', 0, now() + interval '1 minute');
select pg_temp.departed('e0f11112-1111-4111-8111-111111111111',
  'e0c11112-1111-4111-8111-111111111111', 0, now() - interval '1 minute');
select pg_temp.departed('e0f11113-1111-4111-8111-111111111111',
  'e0c11113-1111-4111-8111-111111111111', -3, now());
select pg_temp.departed('e0f11114-1111-4111-8111-111111111111',
  'e0c11114-1111-4111-8111-111111111111', -1, now());
select pg_temp.departed('e0f11116-1111-4111-8111-111111111111',
  'e0d11111-1111-4111-8111-111111111111', 0, now() + interval '1 minute');

-- ---------------------------------------------------------------------------
-- Readiness (HK-S1-21)
-- ---------------------------------------------------------------------------

select is(app.unit_is_ready('e0c11111-1111-4111-8111-111111111111'), false,
  'a Guest left after the room was last marked: not ready until somebody says so');

select is(app.unit_is_ready('e0c11112-1111-4111-8111-111111111111'), true,
  'marked after the Guest left: what the mark says');

select is(app.unit_is_ready('e0c11115-1111-4111-8111-111111111111'), true,
  'nobody left, nothing recorded: ready, as before');

select is(app.unit_is_ready('e0c11113-1111-4111-8111-111111111111'), true,
  'a departure before yesterday does not hold a room back: housekeeping switched on at a Property with a history reads its rooms as it always did');

select is(app.unit_is_ready('e0c11114-1111-4111-8111-111111111111'), false,
  'a departure yesterday still does, for a check-out delivered after the cutoff');

select is(app.unit_is_ready('e0c11116-1111-4111-8111-111111111111'), false,
  'a Guest leaving a bed makes its room not ready, like the worker marks the room');

-- ---------------------------------------------------------------------------
-- The state the board shows (HK-S1-22)
-- ---------------------------------------------------------------------------

select is(
  (select row(status, changed_at)::text
     from app.unit_housekeeping_state('e0c11111-1111-4111-8111-111111111111')),
  row('dirty', now() + interval '1 minute')::text,
  'a room a Guest left since it was marked clean reads dirty, since the departure');

select is(
  (select row(status, changed_at)::text
     from app.unit_housekeeping_state('e0d11111-1111-4111-8111-111111111111')),
  row('dirty', now() + interval '1 minute')::text,
  'asked about a bed, it answers for the bed''s room');

select is(
  (select row(status, changed_at)::text
     from app.unit_housekeeping_state('e0c11112-1111-4111-8111-111111111111')),
  row('clean', now())::text,
  'a room marked after its Guest left reads as marked, since the mark');

select is(
  (select row(status, changed_at)::text
     from app.unit_housekeeping_state('e0c11115-1111-4111-8111-111111111111')),
  row('clean', null::timestamptz)::text,
  'a room nobody left and nobody marked reads clean, never changed');

-- ---------------------------------------------------------------------------
-- A departure keeps its moment (HK-S1-23)
-- ---------------------------------------------------------------------------

-- Everything a later update could move: the dates, updated_at, and the
-- column itself.
update public.stays
   set ends_on = ends_on + 1,
       updated_at = now() + interval '10 minutes',
       departed_at = now() + interval '10 minutes'
 where id = 'e0f11112-1111-4111-8111-111111111111';

select is(
  (select departed_at = now() - interval '1 minute' from public.stays
    where id = 'e0f11112-1111-4111-8111-111111111111'),
  true,
  'a departed Stay touched afterwards keeps the moment its Guest left');

select is(app.unit_is_ready('e0c11112-1111-4111-8111-111111111111'), true,
  'so its room keeps what the later mark said');

-- Checking a Guest out of room 5 the way closeStayWithin does. Each write is
-- inside lives_ok, so a missing stamp reports every assertion after it instead
-- of aborting the transaction on the check constraint; each read fails rather
-- than passes when its row is missing.
select lives_ok(
  $$insert into public.stays
      (id, organization_id, property_id, accommodation_unit_id, stay_type,
       status, starts_on, ends_on, departed_at)
    values ('e0f11115-1111-4111-8111-111111111111',
            'e0a11111-1111-4111-8111-111111111111',
            'e0b11111-1111-4111-8111-111111111111',
            'e0c11115-1111-4111-8111-111111111111', 'guest', 'in_house',
            app.property_today('e0b11111-1111-4111-8111-111111111111') - 1,
            app.property_today('e0b11111-1111-4111-8111-111111111111') + 1,
            now() - interval '1 day')$$,
  'a Stay checked in with a departure stated is taken');

select is(
  (select departed_at is null from public.stays
    where id = 'e0f11115-1111-4111-8111-111111111111'),
  true,
  'and has no departure: a Stay that has not departed has none, whatever the insert said');

select lives_ok(
  $$update public.stays
       set status = 'departed',
           ends_on = app.property_today('e0b11111-1111-4111-8111-111111111111'),
           updated_at = now()
     where id = 'e0f11115-1111-4111-8111-111111111111'$$,
  'the Guest is checked out');

select is(
  (select departed_at = now() from public.stays
    where id = 'e0f11115-1111-4111-8111-111111111111'),
  true,
  'and the moment is stamped, in the transaction that checks them out');

set local session_replication_role = replica;
select throws_ok(
  $$insert into public.stays
      (organization_id, property_id, accommodation_unit_id, stay_type, status,
       starts_on, ends_on)
    values ('e0a11111-1111-4111-8111-111111111111',
            'e0b11111-1111-4111-8111-111111111111',
            'e0c11113-1111-4111-8111-111111111111', 'guest', 'departed',
            app.property_today('e0b11111-1111-4111-8111-111111111111') - 2,
            app.property_today('e0b11111-1111-4111-8111-111111111111'))$$,
  '23514', null,
  'a departed Stay with no moment is refused even where the stamp is skipped');
set local session_replication_role = origin;

-- Read from the catalogue, so a missing grant fails rather than raises.
select is(
  (select string_agg(privilege_type, ',' order by privilege_type)
     from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'stays'
      and column_name = 'departed_at' and grantee = 'ranza_app'),
  'SELECT',
  'the runtime role reads the moment and can write none');

select ok(
  exists (
    select 1
      from pg_proc as proc
      join pg_namespace as ns on ns.oid = proc.pronamespace
     cross join aclexplode(proc.proacl) as acl
     where ns.nspname = 'app' and proc.proname = 'unit_housekeeping_state'
       and acl.grantee = 'ranza_app'::regrole and acl.privilege_type = 'EXECUTE'),
  'the runtime role is granted the state by name, like readiness');

select * from finish();
rollback;
