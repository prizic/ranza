-- A room a Guest has just left is not ready (20260916003950; HK-S1-21).
--
-- Written as the owner, because the rule is a function and not a policy. Within
-- one transaction now() does not move, so each departure is dated either side
-- of its room's mark explicitly; that is also what pins the comparison to
-- strictly later, the worker's own.
--
-- Every assertion here was checked by breaking the thing it asserts — the
-- departure clause removed, the date bound removed, the bound narrowed to today
-- — and confirming it went red.
begin;
select plan(6);

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

create function pg_temp.departed(unit uuid, ended_days int, at_ timestamptz)
returns void language sql as $$
  insert into public.stays
    (organization_id, property_id, accommodation_unit_id, stay_type, status,
     starts_on, ends_on, updated_at)
  values ('e0a11111-1111-4111-8111-111111111111',
          'e0b11111-1111-4111-8111-111111111111', unit, 'guest', 'departed',
          app.property_today('e0b11111-1111-4111-8111-111111111111') + ended_days - 2,
          app.property_today('e0b11111-1111-4111-8111-111111111111') + ended_days,
          at_);
$$;

select pg_temp.departed('e0c11111-1111-4111-8111-111111111111', 0, now() + interval '1 minute');
select pg_temp.departed('e0c11112-1111-4111-8111-111111111111', 0, now() - interval '1 minute');
select pg_temp.departed('e0c11113-1111-4111-8111-111111111111', -3, now());
select pg_temp.departed('e0c11114-1111-4111-8111-111111111111', -1, now());
select pg_temp.departed('e0d11111-1111-4111-8111-111111111111', 0, now() + interval '1 minute');

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

select * from finish();
rollback;
