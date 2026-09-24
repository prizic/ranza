-- Housekeeping status: a departure makes the room dirty (RANZ-28, ADR 0029).
--
-- Three claims, and they fail in different ways on purpose:
--
--   the holder     a room holds the status and answers for its beds; a bed
--                  with no room holds its own. A trigger binds every role.
--
--   the worker     a departure dirties the room through one function and no
--                  grant. It refuses without a worker context or for another
--                  Organization, marks nothing where housekeeping is not
--                  available, and keeps a status changed after the departure.
--
--   the stamp      who and when are written by the database, never stated by
--                  the caller.
--
-- Everything runs in one transaction, where now() does not move. The event's
-- occurred_at is set a minute either side of now() to stand for "the Guest
-- left before" and "after" the status was last changed — the same comparison
-- the worker makes across two transactions in production.
--
-- Rows in docs/features/housekeeping/edge-cases.csv are named beside the
-- assertion that proves them. Each break below was applied inside a rolled-back
-- transaction, the altered object printed first, and the named assertions seen
-- red:
--   worker function without the changed-after guard     HK-S1-04, HK-S1-05
--   without the Organization check                      HK-S1-08
--   without the capability gate                         HK-S1-09
--   without the worker-context check                    HK-S1-07
--   holder trigger dropped                              HK-S1-12
--   stamp trigger dropped                               HK-S1-19
--   a select grant to ranza_worker                      HK-S1-11
--   status check dropped                                the status check
--   unit_is_ready without the capability gate           HK-S1-20
--   insert policy without the permission                HK-S2-04
--   insert policy without the capability                HK-S2-08
--   insert policy with capability_is_available (no reach)  HK-S2-07 reach
--   update policy without the permission                HK-S2-04 update
--   update policy without the capability                HK-S2-08 update
--   a stamp column granted                              HK-S2-09
--   the front desk role without the permission          HK-S2-01, HK-S2-11
--   a delete policy and grant                           the delete refusal
-- The upsert refusal (HK-S2-04, second assertion) is not independent: ON
-- CONFLICT checks the insert policy first, so it holds for the insert policy's
-- reason. The plain update beside it is what proves the update policy.
begin;
select plan(48);

insert into public.users (id, email) values
  ('81111111-1111-4111-8111-111111111111', 'hk-manager@example.test'),
  ('82222222-2222-4222-8222-222222222222', 'hk-desk@example.test'),
  ('83333333-3333-4333-8333-333333333333', 'hk-outsider@example.test'),
  ('84444444-4444-4444-8444-444444444444', 'hk-lapsed@example.test'),
  ('85555555-5555-4555-8555-555555555555', 'hk-finance@example.test'),
  ('86666666-6666-4666-8666-666666666666', 'hk-assigned@example.test');

insert into public.organizations (id, name, status) values
  ('8a111111-1111-4111-8111-111111111111', 'Housekeeping Organization', 'active'),
  ('8a222222-2222-4222-8222-222222222222', 'Housekeeping Other Organization', 'active'),
  ('8a333333-3333-4333-8333-333333333333', 'Housekeeping Lapsed Organization', 'active');

-- The first Property has housekeeping; the second has the front desk only.
insert into public.properties (id, organization_id, name) values
  ('8b111111-1111-4111-8111-111111111111',
   '8a111111-1111-4111-8111-111111111111', 'Housekeeping Property'),
  ('8b444444-4444-4444-8444-444444444444',
   '8a111111-1111-4111-8111-111111111111', 'Housekeeping No-HK Property'),
  ('8b222222-2222-4222-8222-222222222222',
   '8a222222-2222-4222-8222-222222222222', 'Housekeeping Other Property'),
  ('8b333333-3333-4333-8333-333333333333',
   '8a333333-3333-4333-8333-333333333333', 'Housekeeping Lapsed Property');

insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('8a111111-1111-4111-8111-111111111111',
   '81111111-1111-4111-8111-111111111111', 'manager', 'organization_wide'),
  ('8a111111-1111-4111-8111-111111111111',
   '82222222-2222-4222-8222-222222222222', 'front_desk', 'organization_wide'),
  ('8a111111-1111-4111-8111-111111111111',
   '85555555-5555-4555-8555-555555555555', 'finance', 'organization_wide'),
  -- A front desk who reaches only the Property without housekeeping: the one
  -- fixture that fails the write on reach and on nothing else.
  ('8a111111-1111-4111-8111-111111111111',
   '86666666-6666-4666-8666-666666666666', 'front_desk', 'assigned_properties'),
  ('8a222222-2222-4222-8222-222222222222',
   '83333333-3333-4333-8333-333333333333', 'manager', 'organization_wide'),
  ('8a333333-3333-4333-8333-333333333333',
   '84444444-4444-4444-8444-444444444444', 'manager', 'organization_wide');

insert into public.property_assignments (property_id, organization_id, user_id)
values ('8b444444-4444-4444-8444-444444444444',
        '8a111111-1111-4111-8111-111111111111',
        '86666666-6666-4666-8666-666666666666');

insert into public.subscriptions (organization_id, status) values
  ('8a111111-1111-4111-8111-111111111111', 'active'),
  ('8a222222-2222-4222-8222-222222222222', 'active'),
  ('8a333333-3333-4333-8333-333333333333', 'past_due');

insert into public.entitlements (organization_id, module_key) values
  ('8a111111-1111-4111-8111-111111111111', 'housekeeping'),
  ('8a111111-1111-4111-8111-111111111111', 'front_office'),
  ('8a222222-2222-4222-8222-222222222222', 'housekeeping'),
  ('8a333333-3333-4333-8333-333333333333', 'housekeeping');

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('8b111111-1111-4111-8111-111111111111',
   '8a111111-1111-4111-8111-111111111111', 'housekeeping', true),
  ('8b444444-4444-4444-8444-444444444444',
   '8a111111-1111-4111-8111-111111111111', 'front_desk', true),
  ('8b222222-2222-4222-8222-222222222222',
   '8a222222-2222-4222-8222-222222222222', 'housekeeping', true),
  ('8b333333-3333-4333-8333-333333333333',
   '8a333333-3333-4333-8333-333333333333', 'housekeeping', true);

-- Rooms 101, 103 and 104; room 102 let by the bed with beds A and B; a bed
-- with no room above it (ADR 0004); and room 201 at the Property without
-- housekeeping.
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity)
values
  ('8c111111-1111-4111-8111-111111111111',
   '8b111111-1111-4111-8111-111111111111',
   '8a111111-1111-4111-8111-111111111111', 'HK-101', 'room', 2),
  ('8c222222-2222-4222-8222-222222222222',
   '8b111111-1111-4111-8111-111111111111',
   '8a111111-1111-4111-8111-111111111111', 'HK-102', 'room', 2),
  ('8c333333-3333-4333-8333-333333333333',
   '8b111111-1111-4111-8111-111111111111',
   '8a111111-1111-4111-8111-111111111111', 'HK-103', 'room', 2),
  ('8c444444-4444-4444-8444-444444444444',
   '8b111111-1111-4111-8111-111111111111',
   '8a111111-1111-4111-8111-111111111111', 'HK-104', 'room', 2),
  ('8c555555-5555-4555-8555-555555555555',
   '8b111111-1111-4111-8111-111111111111',
   '8a111111-1111-4111-8111-111111111111', 'HK-D1', 'bed', 1),
  ('8c666666-6666-4666-8666-666666666666',
   '8b444444-4444-4444-8444-444444444444',
   '8a111111-1111-4111-8111-111111111111', 'HK-201', 'room', 2),
  ('8c777777-7777-4777-8777-777777777777',
   '8b333333-3333-4333-8333-333333333333',
   '8a333333-3333-4333-8333-333333333333', 'HK-L1', 'room', 2);

insert into public.accommodation_units
  (id, property_id, organization_id, parent_id, parent_unit_type,
   name, unit_type, capacity)
values
  ('8c2a2222-2222-4222-8222-222222222222',
   '8b111111-1111-4111-8111-111111111111',
   '8a111111-1111-4111-8111-111111111111',
   '8c222222-2222-4222-8222-222222222222', 'room', 'A', 'bed', 1),
  ('8c2b2222-2222-4222-8222-222222222222',
   '8b111111-1111-4111-8111-111111111111',
   '8a111111-1111-4111-8111-111111111111',
   '8c222222-2222-4222-8222-222222222222', 'room', 'B', 'bed', 1);

-- A departed Stay on each of 101, bed A, D1, 201, 103 and 104, and one still
-- in house on 101's neighbour for the "did not depart" case.
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id,
   stay_type, status, starts_on, ends_on)
select stay_id::uuid, '8a111111-1111-4111-8111-111111111111', property_id::uuid,
       unit_id::uuid, 'guest', status,
       app.property_today(property_id::uuid) - 2,
       case when status = 'departed' then app.property_today(property_id::uuid) end
from (values
  ('8d111111-1111-4111-8111-111111111111', '8b111111-1111-4111-8111-111111111111', '8c111111-1111-4111-8111-111111111111', 'departed'),
  ('8d2a2222-2222-4222-8222-222222222222', '8b111111-1111-4111-8111-111111111111', '8c2a2222-2222-4222-8222-222222222222', 'departed'),
  ('8d555555-5555-4555-8555-555555555555', '8b111111-1111-4111-8111-111111111111', '8c555555-5555-4555-8555-555555555555', 'departed'),
  ('8d666666-6666-4666-8666-666666666666', '8b444444-4444-4444-8444-444444444444', '8c666666-6666-4666-8666-666666666666', 'departed'),
  ('8d333333-3333-4333-8333-333333333333', '8b111111-1111-4111-8111-111111111111', '8c333333-3333-4333-8333-333333333333', 'departed'),
  ('8d444444-4444-4444-8444-444444444444', '8b111111-1111-4111-8111-111111111111', '8c444444-4444-4444-8444-444444444444', 'departed'),
  ('8d2b2222-2222-4222-8222-222222222222', '8b111111-1111-4111-8111-111111111111', '8c2b2222-2222-4222-8222-222222222222', 'in_house')
) as fixture (stay_id, property_id, unit_id, status);

-- A departure at the Organization whose Subscription lapsed.
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id,
   stay_type, status, starts_on, ends_on)
values ('8d777777-7777-4777-8777-777777777777',
        '8a333333-3333-4333-8333-333333333333',
        '8b333333-3333-4333-8333-333333333333',
        '8c777777-7777-4777-8777-777777777777', 'guest', 'departed',
        app.property_today('8b333333-3333-4333-8333-333333333333') - 2,
        app.property_today('8b333333-3333-4333-8333-333333333333'));

-- 103 was marked clean and 104 inspected, before any event is delivered. The
-- events below are dated relative to these stamps.
insert into public.housekeeping_unit_status
  (accommodation_unit_id, property_id, organization_id, status)
values
  ('8c333333-3333-4333-8333-333333333333',
   '8b111111-1111-4111-8111-111111111111',
   '8a111111-1111-4111-8111-111111111111', 'clean'),
  ('8c444444-4444-4444-8444-444444444444',
   '8b111111-1111-4111-8111-111111111111',
   '8a111111-1111-4111-8111-111111111111', 'inspected');

insert into outbox.events (id, organization_id, event_type, payload, occurred_at)
values
  ('8e111111-1111-4111-8111-111111111111', '8a111111-1111-4111-8111-111111111111',
   'stay.checked_out', '{"stayId":"8d111111-1111-4111-8111-111111111111"}', now()),
  ('8e2a2222-2222-4222-8222-222222222222', '8a111111-1111-4111-8111-111111111111',
   'stay.checked_out', '{"stayId":"8d2a2222-2222-4222-8222-222222222222"}', now()),
  ('8e555555-5555-4555-8555-555555555555', '8a111111-1111-4111-8111-111111111111',
   'stay.checked_out', '{"stayId":"8d555555-5555-4555-8555-555555555555"}', now()),
  ('8e666666-6666-4666-8666-666666666666', '8a111111-1111-4111-8111-111111111111',
   'stay.checked_out', '{"stayId":"8d666666-6666-4666-8666-666666666666"}', now()),
  -- 103 left a minute before it was marked clean; 104 left a minute after it
  -- was marked inspected.
  ('8e333333-3333-4333-8333-333333333333', '8a111111-1111-4111-8111-111111111111',
   'stay.checked_out', '{"stayId":"8d333333-3333-4333-8333-333333333333"}', now() - interval '1 minute'),
  ('8e444444-4444-4444-8444-444444444444', '8a111111-1111-4111-8111-111111111111',
   'stay.checked_out', '{"stayId":"8d444444-4444-4444-8444-444444444444"}', now() + interval '1 minute'),
  ('8e2b2222-2222-4222-8222-222222222222', '8a111111-1111-4111-8111-111111111111',
   'stay.checked_out', '{"stayId":"8d2b2222-2222-4222-8222-222222222222"}', now()),
  ('8e777777-7777-4777-8777-777777777777', '8a111111-1111-4111-8111-111111111111',
   'stay.checked_in', '{"stayId":"8d111111-1111-4111-8111-111111111111"}', now()),
  ('8e888888-8888-4888-8888-888888888888', '8a222222-2222-4222-8222-222222222222',
   'stay.checked_out', '{"stayId":"8d111111-1111-4111-8111-111111111111"}', now()),
  ('8e999999-9999-4999-8999-999999999999', '8a333333-3333-4333-8333-333333333333',
   'stay.checked_out', '{"stayId":"8d777777-7777-4777-8777-777777777777"}', now());

-- ---------------------------------------------------------------------------
-- Reach: the worker holds nothing on the table (HK-S1-11)
-- ---------------------------------------------------------------------------

-- Read off the catalogue, which returns no row rather than raising when the
-- thing is absent.
select is_empty(
  $$ select privilege.privilege_type
       from pg_class as class,
            aclexplode(class.relacl) as privilege
      where class.oid = 'public.housekeeping_unit_status'::regclass
        and privilege.grantee = 'ranza_worker'::regrole $$,
  'HK-S1-11: ranza_worker holds no privilege on housekeeping_unit_status');

select is_empty(
  $$ select column_name from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'housekeeping_unit_status'
        and grantee in ('ranza_worker', 'PUBLIC') $$,
  'HK-S1-11: nor any column of it, and nothing is granted to PUBLIC');

select is_empty(
  $$ select privilege.privilege_type
       from pg_class as class,
            aclexplode(class.relacl) as privilege
      where class.oid = 'public.housekeeping_unit_status'::regclass
        and privilege.grantee = 0 $$,
  'HK-S1-11: PUBLIC holds nothing on the table either');

select results_eq(
  $$ select array_agg(privilege.privilege_type::text order by privilege.privilege_type)
       from pg_class as class,
            aclexplode(class.relacl) as privilege
      where class.oid = 'public.housekeeping_unit_status'::regclass
        and privilege.grantee = 'ranza_app'::regrole $$,
  $$ values (array['SELECT']) $$,
  'ranza_app holds SELECT and nothing else at the table level');

select results_eq(
  $$ select array_agg(privilege.grantee::regrole::text order by 1)
       from pg_proc as proc,
            aclexplode(proc.proacl) as privilege
      where proc.oid = 'app.mark_unit_dirty_after_check_out(uuid)'::regprocedure
        and privilege.privilege_type = 'EXECUTE'
        and privilege.grantee <> proc.proowner $$,
  $$ values (array['ranza_worker']) $$,
  'only ranza_worker may call app.mark_unit_dirty_after_check_out');

-- ---------------------------------------------------------------------------
-- The shape, for every role
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.housekeeping_unit_status
       (accommodation_unit_id, property_id, organization_id, status)
     values ('8c111111-1111-4111-8111-111111111111',
             '8b111111-1111-4111-8111-111111111111',
             '8a111111-1111-4111-8111-111111111111', 'cleaning') $$,
  '23514', null,
  'a status outside dirty, clean and inspected is refused');

select throws_ok(
  $$ insert into public.housekeeping_unit_status
       (accommodation_unit_id, property_id, organization_id, status)
     values ('8c2a2222-2222-4222-8222-222222222222',
             '8b111111-1111-4111-8111-111111111111',
             '8a111111-1111-4111-8111-111111111111', 'dirty') $$,
  '55000', 'that Accommodation Unit is a bed in a room; its room holds the status',
  'HK-S1-12: a bed under a room cannot hold a status, even for the owner');

-- ---------------------------------------------------------------------------
-- The stamp (HK-S1-19)
-- ---------------------------------------------------------------------------

select is(
  (select status_changed_by from public.housekeeping_unit_status
    where accommodation_unit_id = '8c333333-3333-4333-8333-333333333333'),
  null::uuid,
  'HK-S1-19: a write with nobody acting is stamped with nobody');

select app.set_request_context('81111111-1111-4111-8111-111111111111');

update public.housekeeping_unit_status
   set status = 'clean',
       status_changed_by = '83333333-3333-4333-8333-333333333333',
       status_changed_at = now() - interval '1 day'
 where accommodation_unit_id = '8c333333-3333-4333-8333-333333333333';

select results_eq(
  $$ select status_changed_by, status_changed_at
       from public.housekeeping_unit_status
      where accommodation_unit_id = '8c333333-3333-4333-8333-333333333333' $$,
  $$ values ('81111111-1111-4111-8111-111111111111'::uuid, now()) $$,
  'HK-S1-19: who and when are the database''s, whatever the statement said');

-- ---------------------------------------------------------------------------
-- What ready means before any departure is delivered
-- ---------------------------------------------------------------------------

select ok(app.unit_is_ready('8c111111-1111-4111-8111-111111111111'),
  'a room with no status row is ready: a room is born clean');

select is(app.unit_status_holder('8c2b2222-2222-4222-8222-222222222222'),
  '8c222222-2222-4222-8222-222222222222'::uuid,
  'a bed under a room answers to the room');

select is(app.unit_status_holder('8c555555-5555-4555-8555-555555555555'),
  '8c555555-5555-4555-8555-555555555555'::uuid,
  'a bed with no room answers to itself');

-- ---------------------------------------------------------------------------
-- The worker
-- ---------------------------------------------------------------------------

-- A worker's transaction carries no Staff Member: ranza_worker cannot call
-- app.set_request_context. The stamp test above set one, so it is cleared.
select set_config('app.user_id', '', true);

set local role ranza_worker;

select throws_ok(
  $$ select app.mark_unit_dirty_after_check_out('8e111111-1111-4111-8111-111111111111') $$,
  '42501', 'marking a room dirty requires a worker context',
  'HK-S1-07: without a worker context the function refuses before reading anything');

select app.set_worker_context('8a111111-1111-4111-8111-111111111111',
                              'housekeeping.markRoomDirtyOnCheckOut');

select throws_ok(
  $$ select app.mark_unit_dirty_after_check_out('8e888888-8888-4888-8888-888888888888') $$,
  '42501', 'that event belongs to another Organization',
  'HK-S1-08: an event of another Organization is refused');

select is(app.mark_unit_dirty_after_check_out('8e777777-7777-4777-8777-777777777777'),
  false, 'HK-S1-10: an event that is not a departure marks nothing');

select is(app.mark_unit_dirty_after_check_out('8e2b2222-2222-4222-8222-222222222222'),
  false, 'HK-S1-10: a Stay that did not depart marks nothing');

select is(app.mark_unit_dirty_after_check_out('8e111111-1111-4111-8111-111111111111'),
  true, 'HK-S1-01: a departure marks its room');

select is(app.mark_unit_dirty_after_check_out('8e111111-1111-4111-8111-111111111111'),
  false, 'HK-S1-04: the same departure delivered again changes nothing');

select is(app.mark_unit_dirty_after_check_out('8e2a2222-2222-4222-8222-222222222222'),
  true, 'HK-S1-02: a departure from a bed marks something');

select is(app.mark_unit_dirty_after_check_out('8e555555-5555-4555-8555-555555555555'),
  true, 'HK-S1-03: a departure from a bed with no room marks something');

select is(app.mark_unit_dirty_after_check_out('8e666666-6666-4666-8666-666666666666'),
  false, 'HK-S1-09: a departure where housekeeping is not available marks nothing');

select is(app.mark_unit_dirty_after_check_out('8e333333-3333-4333-8333-333333333333'),
  false, 'HK-S1-05: a departure older than the last change marks nothing');

select is(app.mark_unit_dirty_after_check_out('8e444444-4444-4444-8444-444444444444'),
  true, 'HK-S1-06: a departure newer than the last change marks the room');

select app.set_worker_context('8a333333-3333-4333-8333-333333333333',
                              'housekeeping.markRoomDirtyOnCheckOut');

select is(app.mark_unit_dirty_after_check_out('8e999999-9999-4999-8999-999999999999'),
  false, 'HK-S1-09: a departure at a lapsed Subscription marks nothing');

select throws_ok(
  $$ select status from public.housekeeping_unit_status $$,
  '42501', null,
  'HK-S1-11: the worker cannot read the table it just wrote through the function');

-- What the worker wrote, read as the connecting role.
set local role none;

select results_eq(
  $$ select unit.name, state.status
       from public.housekeeping_unit_status as state
       join public.accommodation_units as unit
         on unit.id = state.accommodation_unit_id
      where state.organization_id = '8a111111-1111-4111-8111-111111111111'
      order by unit.name $$,
  $$ values ('HK-101'::text, 'dirty'::text),
            ('HK-102', 'dirty'),
            ('HK-103', 'clean'),
            ('HK-104', 'dirty'),
            ('HK-D1', 'dirty') $$,
  'HK-S1-01..06, 09: the rooms, the bed with no room, and nothing for bed A or HK-201');

select is(
  (select status_changed_by from public.housekeeping_unit_status
    where accommodation_unit_id = '8c111111-1111-4111-8111-111111111111'),
  null::uuid,
  'HK-S1-19: a departure''s mark names no Staff Member');

select ok(not app.unit_is_ready('8c2b2222-2222-4222-8222-222222222222'),
  'a bed in a dirty room is not ready, though it holds no row of its own');

-- A Property that stopped using housekeeping. Its room was dirty when it did;
-- the row stays, and nothing can clear it there, so it must not count.
insert into public.housekeeping_unit_status
  (accommodation_unit_id, property_id, organization_id, status)
values ('8c666666-6666-4666-8666-666666666666',
        '8b444444-4444-4444-8444-444444444444',
        '8a111111-1111-4111-8111-111111111111', 'dirty');

select ok(app.unit_is_ready('8c666666-6666-4666-8666-666666666666'),
  'HK-S1-20: a dirty room where housekeeping is not available reads ready');

select is(
  (select status from public.housekeeping_unit_status
    where accommodation_unit_id = '8c666666-6666-4666-8666-666666666666'),
  'dirty',
  'HK-S1-20: and what was stored is untouched');

-- ---------------------------------------------------------------------------
-- The read
-- ---------------------------------------------------------------------------

set local role ranza_app;
select app.set_request_context('83333333-3333-4333-8333-333333333333');

select is_empty(
  $$ select 1 from public.housekeeping_unit_status
      where organization_id = '8a111111-1111-4111-8111-111111111111' $$,
  'HK-S1-14: another Organization''s rooms are not visible');

-- ---------------------------------------------------------------------------
-- Marking a room: the command, and its five gates
-- ---------------------------------------------------------------------------

set local role none;

select ok(
  exists (select 1 from public.staff_permissions
           where key = 'housekeeping.update_status' and module_key = 'housekeeping'),
  'housekeeping.update_status is in the catalogue, under housekeeping');

select results_eq(
  $$ select array_agg(key order by key) from public.staff_roles
      where organization_id is null
        and 'housekeeping.update_status' = any (permissions) $$,
  $$ values (array['front_desk', 'housekeeping', 'manager', 'owner']::text[]) $$,
  'HK-S2-11: owner, manager, front desk and housekeeping ship holding it; finance does not');

-- Read off information_schema, which returns no row rather than raising.
select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema='public' and table_name='housekeeping_unit_status'
       and grantee='ranza_app' and privilege_type='INSERT'$$,
  array['accommodation_unit_id', 'organization_id', 'property_id', 'status'],
  'HK-S2-09: an insert may name the room and its status and nothing about who or when');

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema='public' and table_name='housekeeping_unit_status'
       and grantee='ranza_app' and privilege_type='UPDATE'$$,
  array['status'],
  'HK-S2-09: an update may change the status and nothing else');

set local role ranza_app;

-- The front desk marks 101, which a departure made dirty above.
select app.set_request_context('82222222-2222-4222-8222-222222222222');

select lives_ok(
  $$ insert into public.housekeeping_unit_status
       (accommodation_unit_id, property_id, organization_id, status)
     values ('8c111111-1111-4111-8111-111111111111',
             '8b111111-1111-4111-8111-111111111111',
             '8a111111-1111-4111-8111-111111111111', 'clean')
     on conflict (accommodation_unit_id) do update set status = excluded.status $$,
  'HK-S2-01: the front desk marks a dirty room clean');

select results_eq(
  $$ select status, status_changed_by from public.housekeeping_unit_status
      where accommodation_unit_id = '8c111111-1111-4111-8111-111111111111' $$,
  $$ values ('clean'::text, '82222222-2222-4222-8222-222222222222'::uuid) $$,
  'HK-S2-01: and the room says who marked it');

select throws_ok(
  $$ insert into public.housekeeping_unit_status
       (accommodation_unit_id, property_id, organization_id, status, status_changed_by)
     values ('8c555555-5555-4555-8555-555555555555',
             '8b111111-1111-4111-8111-111111111111',
             '8a111111-1111-4111-8111-111111111111', 'clean',
             '81111111-1111-4111-8111-111111111111') $$,
  '42501', null,
  'HK-S2-09: naming who changed it is refused');

select throws_ok(
  $$ update public.housekeeping_unit_status
        set status_changed_at = now() - interval '1 day'
      where accommodation_unit_id = '8c111111-1111-4111-8111-111111111111' $$,
  '42501', null,
  'HK-S2-09: naming when it changed is refused');

select throws_ok(
  $$ insert into public.housekeeping_unit_status
       (accommodation_unit_id, property_id, organization_id, status)
     values ('8c666666-6666-4666-8666-666666666666',
             '8b444444-4444-4444-8444-444444444444',
             '8a111111-1111-4111-8111-111111111111', 'clean') $$,
  '42501', null,
  'HK-S2-08: a Property without housekeeping cannot be marked');

-- Finance reaches the Property and holds no housekeeping permission.
select app.set_request_context('85555555-5555-4555-8555-555555555555');

select throws_ok(
  $$ insert into public.housekeeping_unit_status
       (accommodation_unit_id, property_id, organization_id, status)
     values ('8c555555-5555-4555-8555-555555555555',
             '8b111111-1111-4111-8111-111111111111',
             '8a111111-1111-4111-8111-111111111111', 'clean') $$,
  '42501', null,
  'HK-S2-04: a Staff Member without the permission cannot mark a room');

-- A plain update that fails the policy's USING matches no row rather than
-- raising: that is how row-level security filters an update. The upsert the
-- module runs does raise, because ON CONFLICT DO UPDATE refuses a conflicting
-- row it may not touch. Both are asserted, since both are doors.
select results_eq(
  $$ with changed as (
       update public.housekeeping_unit_status set status = 'dirty'
        where accommodation_unit_id = '8c111111-1111-4111-8111-111111111111'
       returning 1)
     select count(*)::int from changed $$,
  $$ values (0) $$,
  'HK-S2-04: nor change a room that has one, by a plain update');

select throws_ok(
  $$ insert into public.housekeeping_unit_status
       (accommodation_unit_id, property_id, organization_id, status)
     values ('8c111111-1111-4111-8111-111111111111',
             '8b111111-1111-4111-8111-111111111111',
             '8a111111-1111-4111-8111-111111111111', 'dirty')
     on conflict (accommodation_unit_id) do update set status = excluded.status $$,
  '42501', null,
  'HK-S2-04: nor by the upsert the module runs');

-- A front desk of this Organization, holding the permission, who does not
-- reach the Property the room is at.
select app.set_request_context('86666666-6666-4666-8666-666666666666');

select throws_ok(
  $$ insert into public.housekeeping_unit_status
       (accommodation_unit_id, property_id, organization_id, status)
     values ('8c555555-5555-4555-8555-555555555555',
             '8b111111-1111-4111-8111-111111111111',
             '8a111111-1111-4111-8111-111111111111', 'clean') $$,
  '42501', null,
  'HK-S2-07: a Property the Staff Member does not reach cannot be marked');

-- A manager of another Organization, naming this Organization's room.
select app.set_request_context('83333333-3333-4333-8333-333333333333');

select throws_ok(
  $$ insert into public.housekeeping_unit_status
       (accommodation_unit_id, property_id, organization_id, status)
     values ('8c555555-5555-4555-8555-555555555555',
             '8b111111-1111-4111-8111-111111111111',
             '8a111111-1111-4111-8111-111111111111', 'clean') $$,
  '42501', null,
  'HK-S2-07: another Organization''s room cannot be marked');

-- A manager whose Subscription lapsed, marking their own room.
select app.set_request_context('84444444-4444-4444-8444-444444444444');

select throws_ok(
  $$ insert into public.housekeeping_unit_status
       (accommodation_unit_id, property_id, organization_id, status)
     values ('8c777777-7777-4777-8777-777777777777',
             '8b333333-3333-4333-8333-333333333333',
             '8a333333-3333-4333-8333-333333333333', 'clean') $$,
  '42501', null,
  'HK-S2-08: a lapsed Subscription cannot mark its own rooms');

-- Housekeeping switched off at the Property whose rooms already have rows: the
-- update policy, not the insert policy, is what must refuse now.
set local role none;
update public.property_capabilities set enabled = false
 where property_id = '8b111111-1111-4111-8111-111111111111'
   and capability_key = 'housekeeping';
set local role ranza_app;
select app.set_request_context('82222222-2222-4222-8222-222222222222');

select results_eq(
  $$ with changed as (
       update public.housekeeping_unit_status set status = 'dirty'
        where accommodation_unit_id = '8c111111-1111-4111-8111-111111111111'
       returning 1)
     select count(*)::int from changed $$,
  $$ values (0) $$,
  'HK-S2-08: a room with a row cannot be changed once housekeeping is off');

select throws_ok(
  $$ delete from public.housekeeping_unit_status $$,
  '42501', null,
  'a status is changed, never removed');

reset role;
select finish();
rollback;
