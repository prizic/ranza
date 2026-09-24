-- The worker closes a quiet day (20260916005100, ADR 0034, ADR 0018 amended).
--
-- Two functions and nothing else stand between ranza_worker and closing a day:
-- one that says which days are due, across Organizations, and one that closes
-- a day inside one Organization's context. Both are asserted from the catalogue
-- first — who may execute them, and exactly what the first returns — because a
-- cross-Organization read that quietly widened would not fail a behaviour test.
--
-- Privileges are read from pg_proc.proacl rather than has_function_privilege,
-- which raises when the function is absent and takes the suite with it.
--
-- Checked by breaking each thing in turn, proof printed first: execute granted
-- to ranza_app, the context check (asserted on a Property that does not exist,
-- the one place it is not subsumed by the Organization check), the
-- Organization, archived and capability checks, the capability read directly
-- instead of through capability_is_available, the publish, the three discovery
-- predicates, the class-55 handler left bare, the stamp's worker branch and its
-- already-closed branch — each red on the assertion named for it.
begin;
select plan(29);

insert into public.organizations (id, name, status) values
  ('be0a0000-0000-4000-8000-00000000000a', 'Worker Close Organization', 'active'),
  ('be0b0000-0000-4000-8000-00000000000b', 'Worker Close Other', 'active');
insert into public.subscriptions (organization_id, status) values
  ('be0a0000-0000-4000-8000-00000000000a', 'active'),
  ('be0b0000-0000-4000-8000-00000000000b', 'active');
insert into public.entitlements (organization_id, module_key) values
  ('be0a0000-0000-4000-8000-00000000000a', 'front_office'),
  ('be0b0000-0000-4000-8000-00000000000b', 'front_office');

-- quiet 1, open items 2, front desk off 3, closed through yesterday 4,
-- archived 6, one whose close fails on purpose 7; 5 is the other
-- Organization's.
insert into public.properties (id, organization_id, name, status)
select ('be200000-0000-4000-8000-00000000000' || n)::uuid,
       case when n = 5 then 'be0b0000-0000-4000-8000-00000000000b'::uuid
            else 'be0a0000-0000-4000-8000-00000000000a'::uuid end,
       'Worker Close Property ' || n,
       case when n = 6 then 'archived' else 'active' end
from generate_series(1, 7) as n;
insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled)
select property.id, property.organization_id, 'front_desk',
       property.id <> 'be200000-0000-4000-8000-000000000003'::uuid
from public.properties as property
where property.id::text like 'be200000-%';

insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity) values
  ('be300000-0000-4000-8000-000000000001', 'be200000-0000-4000-8000-000000000002',
   'be0a0000-0000-4000-8000-00000000000a', 'WORKER-1', 'room', 2);
insert into public.guests (id, organization_id, full_name) values
  ('be400000-0000-4000-8000-000000000001',
   'be0a0000-0000-4000-8000-00000000000a', 'Worker Guest');
insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id, stay_type,
   status, starts_on, ends_on)
select 'be600000-0000-4000-8000-000000000001', 'be0a0000-0000-4000-8000-00000000000a',
       'be200000-0000-4000-8000-000000000002', 'be300000-0000-4000-8000-000000000001',
       'be400000-0000-4000-8000-000000000001', 'guest', 'confirmed',
       today - 1, today + 1
from (select app.property_today('be200000-0000-4000-8000-000000000002') as today) as t;

-- An Organization whose Subscription has lapsed and one that never bought the
-- front desk, each with a Property that has the capability on.
insert into public.organizations (id, name, status) values
  ('be0c0000-0000-4000-8000-00000000000c', 'Worker Close Lapsed', 'active'),
  ('be0d0000-0000-4000-8000-00000000000d', 'Worker Close Unbought', 'active');
insert into public.subscriptions (organization_id, status) values
  ('be0c0000-0000-4000-8000-00000000000c', 'past_due'),
  ('be0d0000-0000-4000-8000-00000000000d', 'active');
insert into public.entitlements (organization_id, module_key) values
  ('be0c0000-0000-4000-8000-00000000000c', 'front_office');
insert into public.properties (id, organization_id, name) values
  ('be200000-0000-4000-8000-000000000008', 'be0c0000-0000-4000-8000-00000000000c',
   'Worker Close Lapsed Property'),
  ('be200000-0000-4000-8000-000000000009', 'be0d0000-0000-4000-8000-00000000000d',
   'Worker Close Unbought Property');
insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('be200000-0000-4000-8000-000000000008', 'be0c0000-0000-4000-8000-00000000000c',
   'front_desk', true),
  ('be200000-0000-4000-8000-000000000009', 'be0d0000-0000-4000-8000-00000000000d',
   'front_desk', true);

set local session_replication_role = replica;
insert into public.business_day_closes
  (organization_id, property_id, business_date, closed_by_job)
values ('be0a0000-0000-4000-8000-00000000000a', 'be200000-0000-4000-8000-000000000004',
        app.property_today('be200000-0000-4000-8000-000000000004') - 1, 'test.fixture');
set local session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- Who may call them, and what the cross-Organization one says (CD-S2-09)
-- ---------------------------------------------------------------------------

select set_eq(
  $$select a.grantee::regrole::text
      from pg_proc as p
      cross join lateral aclexplode(p.proacl) as a
     where p.proname = 'properties_due_for_close'
       and a.privilege_type = 'EXECUTE' and a.grantee <> p.proowner$$,
  array['ranza_worker'],
  'only the worker may ask which days are due');

select set_eq(
  $$select a.grantee::regrole::text
      from pg_proc as p
      cross join lateral aclexplode(p.proacl) as a
     where p.proname = 'close_business_day_automatically'
       and a.privilege_type = 'EXECUTE' and a.grantee <> p.proowner$$,
  array['ranza_worker'],
  'the front desk cannot call the worker''s close: only the worker holds execute');

select is(
  (select pg_get_function_result(p.oid) from pg_proc as p
    where p.proname = 'properties_due_for_close'),
  'TABLE(organization_id uuid, property_id uuid, business_date date)',
  'and what is due is ids and a date, nothing else');

-- Nothing else is granted, table or column: ADR 0018 says the worker holds
-- nothing on properties or on a close, and the table-level view alone would
-- miss a column grant.
select is_empty(
  $$select table_name || ' ' || privilege_type from information_schema.table_privileges
     where table_schema = 'public' and grantee = 'ranza_worker'
       and table_name in ('properties', 'business_day_closes')
    union all
    select table_name || ' ' || privilege_type || ' ' || column_name
      from information_schema.column_privileges
     where table_schema = 'public' and grantee = 'ranza_worker'
       and table_name in ('properties', 'business_day_closes')$$,
  'the worker holds nothing on properties or on a close, not a column');

-- ---------------------------------------------------------------------------
-- What is due
-- ---------------------------------------------------------------------------

set local role ranza_worker;

select set_eq(
  $$select property_id::text || ' ' || (business_date - app.property_today(property_id))
      from app.properties_due_for_close()
     where property_id::text like 'be200000-%'$$,
  array['be200000-0000-4000-8000-000000000001 -1',
        'be200000-0000-4000-8000-000000000002 -1',
        'be200000-0000-4000-8000-000000000005 -1',
        'be200000-0000-4000-8000-000000000007 -1'],
  'the worker''s first close is the day before today, where the front desk is and the day has not closed');

select ok(
  not exists (select 1 from app.properties_due_for_close()
               where property_id = 'be200000-0000-4000-8000-000000000006'),
  'an archived Property has nothing due');

select ok(
  not exists (select 1 from app.properties_due_for_close()
               where property_id in ('be200000-0000-4000-8000-000000000008',
                                     'be200000-0000-4000-8000-000000000009')),
  'nor one whose Subscription has lapsed, or whose Organization never bought the front desk');

select ok(
  not exists (select 1 from app.properties_due_for_close()
               where property_id = 'be200000-0000-4000-8000-000000000003'),
  'the worker closes nothing where the front desk is not available');

select ok(
  not exists (select 1 from app.properties_due_for_close()
               where property_id = 'be200000-0000-4000-8000-000000000004'),
  'nothing is due before the cutoff: yesterday is closed and today has not ended');

-- ---------------------------------------------------------------------------
-- Closing, inside one Organization
-- ---------------------------------------------------------------------------

-- A Property that does not exist, because that is where the context check is
-- the only one that binds: for one that does, the Organization check below
-- refuses too, and removing this one would go unnoticed.
select throws_ok(
  $$select app.close_business_day_automatically(
      'be200000-0000-4000-8000-0000000000ff', current_date)$$,
  '42501', null,
  'the worker closes only inside its own context: none set');

select app.set_worker_context('be0b0000-0000-4000-8000-00000000000b', 'business_day.close');
select throws_ok(
  $$select app.close_business_day_automatically(
      'be200000-0000-4000-8000-000000000001',
      app.property_today('be200000-0000-4000-8000-000000000001') - 1)$$,
  '42501', null,
  'the worker closes only inside its own context: another Organization''s');

select app.set_worker_context('be0a0000-0000-4000-8000-00000000000a', 'business_day.close');

select is(
  app.close_business_day_automatically(
    'be200000-0000-4000-8000-000000000001',
    app.property_today('be200000-0000-4000-8000-000000000001') - 1),
  'closed',
  'the worker closes a quiet day');

select is(
  app.close_business_day_automatically(
    'be200000-0000-4000-8000-000000000001',
    app.property_today('be200000-0000-4000-8000-000000000001') - 1),
  'already_closed',
  'two workers closing one day make one close: the second is told');

select is(
  app.close_business_day_automatically(
    'be200000-0000-4000-8000-000000000002',
    app.property_today('be200000-0000-4000-8000-000000000002') - 1),
  'open_items',
  'the worker leaves a day with items open');

select is(
  app.close_business_day_automatically(
    'be200000-0000-4000-8000-000000000003',
    app.property_today('be200000-0000-4000-8000-000000000003') - 1),
  'unavailable',
  'nor closes where the front desk is off, even when asked directly');

select is(
  app.close_business_day_automatically(
    'be200000-0000-4000-8000-000000000001',
    app.property_today('be200000-0000-4000-8000-000000000001')),
  'not_due',
  'nor a day that has not ended');

select is(
  app.close_business_day_automatically(
    'be200000-0000-4000-8000-000000000006',
    app.property_today('be200000-0000-4000-8000-000000000006') - 1),
  'unavailable',
  'nor an archived Property, even when asked directly');

select app.set_worker_context('be0c0000-0000-4000-8000-00000000000c', 'business_day.close');
select is(
  app.close_business_day_automatically(
    'be200000-0000-4000-8000-000000000008',
    app.property_today('be200000-0000-4000-8000-000000000008') - 1),
  'unavailable',
  'nor where the Subscription has lapsed, even when asked directly');

select app.set_worker_context('be0d0000-0000-4000-8000-00000000000d', 'business_day.close');
select is(
  app.close_business_day_automatically(
    'be200000-0000-4000-8000-000000000009',
    app.property_today('be200000-0000-4000-8000-000000000009') - 1),
  'unavailable',
  'nor where the front desk was never bought');
select app.set_worker_context('be0a0000-0000-4000-8000-00000000000a', 'business_day.close');

-- Any other class-55 refusal — a lock timeout, an object in use — is raised,
-- not answered as a day waiting: the closer reports a raise as a failure and
-- stays quiet about not_due. A trigger stands in for the lock timeout nothing
-- sets yet.
set local role none;
create function pg_temp.in_use() returns trigger language plpgsql as $f$
begin
  raise exception 'busy' using errcode = '55006';
end;
$f$;
create trigger business_day_closes_in_use
  before insert on public.business_day_closes
  for each row
  when (new.property_id = 'be200000-0000-4000-8000-000000000007')
  execute function pg_temp.in_use();
set local role ranza_worker;
select app.set_worker_context('be0a0000-0000-4000-8000-00000000000a', 'business_day.close');

select throws_ok(
  $$select app.close_business_day_automatically(
      'be200000-0000-4000-8000-000000000007',
      app.property_today('be200000-0000-4000-8000-000000000007') - 1)$$,
  '55006', null,
  'a refusal that is not "the day has not ended" is raised, not answered not_due');

select ok(
  not exists (select 1 from app.properties_due_for_close()
               where property_id = 'be200000-0000-4000-8000-000000000001'),
  'and once it has closed a day, that Property is not due again until the next cutoff');

set local role none;

select is(
  (select row(closed_by, closed_by_job)::text from public.business_day_closes
    where property_id = 'be200000-0000-4000-8000-000000000001'),
  row(null::uuid, 'business_day.close')::text,
  'the worker''s close names the job, not a person');

select is(
  (select count(*)::int from public.business_day_closes
    where property_id in ('be200000-0000-4000-8000-000000000002',
                          'be200000-0000-4000-8000-000000000003')),
  0,
  'and nothing was written where it declined');

select is(
  (select payload from outbox.events
    where event_type = 'business_day.closed'
      and organization_id = 'be0a0000-0000-4000-8000-00000000000a'
      and payload ->> 'propertyId' = 'be200000-0000-4000-8000-000000000001'),
  (select jsonb_build_object(
            'closeId', close.id,
            'propertyId', close.property_id,
            'businessDate', to_char(close.business_date, 'YYYY-MM-DD'))
     from public.business_day_closes as close
    where close.property_id = 'be200000-0000-4000-8000-000000000001'),
  'the worker''s close is published like a desk''s');

-- The stamp's own worker branch. The functions above never reach it with the
-- wrong Organization, so it is asserted where it binds: a direct insert by a
-- role that could, the owner, with nobody named or another Organization's
-- context. The context set above is transaction-local, so it is cleared first.
select set_config('app.worker_organization_id', '', true);
select set_config('app.worker_job', '', true);
select throws_ok(
  $$insert into public.business_day_closes
      (organization_id, property_id, business_date)
    values ('be0a0000-0000-4000-8000-00000000000a', 'be200000-0000-4000-8000-000000000002',
            app.property_today('be200000-0000-4000-8000-000000000002') - 1)$$,
  '42501', null,
  'nobody unnamed closes a day: no user and no worker context');

select app.set_worker_context('be0b0000-0000-4000-8000-00000000000b', 'business_day.close');
select throws_ok(
  $$insert into public.business_day_closes
      (organization_id, property_id, business_date)
    values ('be0a0000-0000-4000-8000-00000000000a', 'be200000-0000-4000-8000-000000000002',
            app.property_today('be200000-0000-4000-8000-000000000002') - 1)$$,
  '42501', null,
  'nor a worker context of another Organization');

-- The last open item resolved, the next pass closes it (CD-S2-03).
update public.reservations set status = 'no_show'
 where id = 'be600000-0000-4000-8000-000000000001';

set local role ranza_worker;
select app.set_worker_context('be0a0000-0000-4000-8000-00000000000a', 'business_day.close');

select is(
  app.close_business_day_automatically(
    'be200000-0000-4000-8000-000000000002',
    app.property_today('be200000-0000-4000-8000-000000000002') - 1),
  'closed',
  'a day closes on the pass after its last item is resolved');

-- A day already closed, with an item written onto it since by somebody who
-- could, is answered as closed: the stamp says 23505 before the reason
-- constraint can say anything.
set local role none;
insert into public.reservations
  (organization_id, property_id, accommodation_unit_id, guest_id, stay_type,
   status, starts_on, ends_on)
select 'be0a0000-0000-4000-8000-00000000000a', 'be200000-0000-4000-8000-000000000002',
       'be300000-0000-4000-8000-000000000001', 'be400000-0000-4000-8000-000000000001',
       'guest', 'confirmed', today - 1, today + 3
from (select app.property_today('be200000-0000-4000-8000-000000000002') as today) as t;
set local role ranza_worker;
select app.set_worker_context('be0a0000-0000-4000-8000-00000000000a', 'business_day.close');
select is(
  app.close_business_day_automatically(
    'be200000-0000-4000-8000-000000000002',
    app.property_today('be200000-0000-4000-8000-000000000002') - 1),
  'already_closed',
  'a day already closed is answered already_closed, whatever has been written onto it since');

set local role none;

select is(
  (select count(*)::int from audit.records
    where organization_id = 'be0a0000-0000-4000-8000-00000000000a'),
  0,
  'and no audit record claims a person did it (CD-DEF-05)');

select finish();
rollback;
