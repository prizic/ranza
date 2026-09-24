-- Maintenance: a problem is reported and worked, and a request holds its room
-- out of order (RANZ-33, ADR 0032).
--
-- Four claims, and they fail in different ways on purpose:
--
--   the request    reported by anyone at the Property, worked by a few, never
--                  deleted; numbered, stamped and moved only as drawn.
--
--   the hold       its own table and its own permission; blocked and out of
--                  order are each written by their own permission, entered from
--                  available only, and a room out of order covers its beds.
--
--   the setting    an Organization default and Property overrides, and the
--                  assignee it may require before work starts.
--
--   the worker     a return reaches housekeeping status through one function
--                  and no grant, and only for a release that really happened.
--
-- Everything runs in one transaction, where now() does not move: a release's
-- returned_at and its event's occurred_at are the same instant, which is what
-- the worker function matches on.
--
-- Rows in docs/features/maintenance/edge-cases.csv are named beside the
-- assertion that proves them. Each break below was applied inside a rolled-back
-- transaction, the altered object printed first, and the named assertions seen
-- red:
--   insert policy without the report permission         MT-S1-04
--   insert policy with capability_is_available (no reach)  MT-S1-06
--   insert policy without the assignee clause           MT-S1-18 (report)
--   update policy without the manage permission         MT-S1-12
--   a stamp column granted on insert                    MT-S1-03
--   the stamping trigger's cancelled branch removed     MT-S1-17
--   the stamping trigger's done branch removed          MT-S1-16
--   the assignee trigger dropped                        MT-S1-19
--   hold insert policy without its permission           MT-S2-03
--   the restrictive policy dropped                      MT-S2-04
--   the from-available trigger dropped                  MT-S2-08
--   unit_is_in_service reading the Unit only            MT-S2-06
--   the release-before-cancel trigger dropped           MT-S2-16
--   the assignee-required trigger dropped               MT-S2-25
--   the worker function without the returned_at match   MT-S2-19 (forged)
--   the worker function without the context check       MT-S2-19
begin;
select plan(65);

insert into public.users (id, email) values
  ('91111111-1111-4111-8111-111111111111', 'mt-manager@example.test'),
  ('92222222-2222-4222-8222-222222222222', 'mt-desk@example.test'),
  ('93333333-3333-4333-8333-333333333333', 'mt-finance@example.test'),
  ('94444444-4444-4444-8444-444444444444', 'mt-elsewhere@example.test'),
  ('95555555-5555-4555-8555-555555555555', 'mt-rooms@example.test'),
  ('96666666-6666-4666-8666-666666666666', 'mt-local@example.test'),
  ('97777777-7777-4777-8777-777777777777', 'mt-revoked@example.test'),
  ('98888888-8888-4888-8888-888888888888', 'mt-outsider@example.test'),
  ('99999999-9999-4999-8999-999999999999', 'mt-lapsed@example.test');

insert into public.organizations (id, name, status) values
  ('9a111111-1111-4111-8111-111111111111', 'Maintenance Organization', 'active'),
  ('9a222222-2222-4222-8222-222222222222', 'Maintenance Other Organization', 'active'),
  ('9a333333-3333-4333-8333-333333333333', 'Maintenance Lapsed Organization', 'active');

-- The first Property has maintenance, the front desk and housekeeping; the
-- second the front desk only; the other Organization's has maintenance and no
-- housekeeping.
insert into public.properties (id, organization_id, name) values
  ('9b111111-1111-4111-8111-111111111111',
   '9a111111-1111-4111-8111-111111111111', 'Maintenance Property'),
  ('9b222222-2222-4222-8222-222222222222',
   '9a111111-1111-4111-8111-111111111111', 'Maintenance No-MT Property'),
  ('9b333333-3333-4333-8333-333333333333',
   '9a222222-2222-4222-8222-222222222222', 'Maintenance Other Property'),
  ('9b444444-4444-4444-8444-444444444444',
   '9a333333-3333-4333-8333-333333333333', 'Maintenance Lapsed Property');

-- A role that may configure rooms and nothing else, so blocking and out of
-- order can be told apart by permission (MT-S2-04).
insert into public.staff_roles (scope_id, key, organization_id, name, permissions)
values ('9a111111-1111-4111-8111-111111111111', 'rooms_admin',
        '9a111111-1111-4111-8111-111111111111', 'Rooms admin',
        array['accommodation.configure']);

insert into public.organization_memberships
  (organization_id, user_id, role, role_scope_id, access_scope, status, revoked_at)
values
  ('9a111111-1111-4111-8111-111111111111', '91111111-1111-4111-8111-111111111111',
   'manager', '00000000-0000-0000-0000-000000000000', 'organization_wide', 'active', null),
  ('9a111111-1111-4111-8111-111111111111', '92222222-2222-4222-8222-222222222222',
   'front_desk', '00000000-0000-0000-0000-000000000000', 'organization_wide', 'active', null),
  ('9a111111-1111-4111-8111-111111111111', '93333333-3333-4333-8333-333333333333',
   'finance', '00000000-0000-0000-0000-000000000000', 'organization_wide', 'active', null),
  -- Reaches only the Property without maintenance.
  ('9a111111-1111-4111-8111-111111111111', '94444444-4444-4444-8444-444444444444',
   'manager', '00000000-0000-0000-0000-000000000000', 'assigned_properties', 'active', null),
  ('9a111111-1111-4111-8111-111111111111', '95555555-5555-4555-8555-555555555555',
   'rooms_admin', '9a111111-1111-4111-8111-111111111111', 'organization_wide', 'active', null),
  -- A manager who reaches the maintenance Property and nothing else.
  ('9a111111-1111-4111-8111-111111111111', '96666666-6666-4666-8666-666666666666',
   'manager', '00000000-0000-0000-0000-000000000000', 'assigned_properties', 'active', null),
  ('9a111111-1111-4111-8111-111111111111', '97777777-7777-4777-8777-777777777777',
   'front_desk', '00000000-0000-0000-0000-000000000000', 'organization_wide', 'revoked', now()),
  ('9a222222-2222-4222-8222-222222222222', '98888888-8888-4888-8888-888888888888',
   'manager', '00000000-0000-0000-0000-000000000000', 'organization_wide', 'active', null),
  ('9a333333-3333-4333-8333-333333333333', '99999999-9999-4999-8999-999999999999',
   'manager', '00000000-0000-0000-0000-000000000000', 'organization_wide', 'active', null);

insert into public.property_assignments (property_id, organization_id, user_id) values
  ('9b222222-2222-4222-8222-222222222222', '9a111111-1111-4111-8111-111111111111',
   '94444444-4444-4444-8444-444444444444'),
  ('9b111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111',
   '96666666-6666-4666-8666-666666666666');

insert into public.subscriptions (organization_id, status) values
  ('9a111111-1111-4111-8111-111111111111', 'active'),
  ('9a222222-2222-4222-8222-222222222222', 'active'),
  ('9a333333-3333-4333-8333-333333333333', 'past_due');

insert into public.entitlements (organization_id, module_key) values
  ('9a111111-1111-4111-8111-111111111111', 'maintenance'),
  ('9a111111-1111-4111-8111-111111111111', 'front_office'),
  ('9a111111-1111-4111-8111-111111111111', 'housekeeping'),
  ('9a222222-2222-4222-8222-222222222222', 'maintenance'),
  ('9a333333-3333-4333-8333-333333333333', 'maintenance');

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('9b111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111', 'maintenance', true),
  ('9b111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111', 'front_desk', true),
  ('9b111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111', 'housekeeping', true),
  ('9b222222-2222-4222-8222-222222222222', '9a111111-1111-4111-8111-111111111111', 'front_desk', true),
  ('9b333333-3333-4333-8333-333333333333', '9a222222-2222-4222-8222-222222222222', 'maintenance', true),
  ('9b444444-4444-4444-8444-444444444444', '9a333333-3333-4333-8333-333333333333', 'maintenance', true);

-- Rooms 101, 103 and 104; room 102 let by the bed with beds A and B; 201 at
-- the Property without maintenance; 301 at the other Organization's.
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity) values
  ('9c111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
   '9a111111-1111-4111-8111-111111111111', 'MT-101', 'room', 2),
  ('9c222222-2222-4222-8222-222222222222', '9b111111-1111-4111-8111-111111111111',
   '9a111111-1111-4111-8111-111111111111', 'MT-102', 'room', 2),
  ('9c333333-3333-4333-8333-333333333333', '9b111111-1111-4111-8111-111111111111',
   '9a111111-1111-4111-8111-111111111111', 'MT-103', 'room', 2),
  ('9c444444-4444-4444-8444-444444444444', '9b111111-1111-4111-8111-111111111111',
   '9a111111-1111-4111-8111-111111111111', 'MT-104', 'room', 2),
  ('9c555555-5555-4555-8555-555555555555', '9b222222-2222-4222-8222-222222222222',
   '9a111111-1111-4111-8111-111111111111', 'MT-201', 'room', 2),
  ('9c666666-6666-4666-8666-666666666666', '9b333333-3333-4333-8333-333333333333',
   '9a222222-2222-4222-8222-222222222222', 'MT-301', 'room', 2),
  ('9c777777-7777-4777-8777-777777777777', '9b444444-4444-4444-8444-444444444444',
   '9a333333-3333-4333-8333-333333333333', 'MT-401', 'room', 2);

insert into public.accommodation_units
  (id, property_id, organization_id, parent_id, parent_unit_type, name, unit_type, capacity)
values
  ('9c2a2222-2222-4222-8222-222222222222', '9b111111-1111-4111-8111-111111111111',
   '9a111111-1111-4111-8111-111111111111', '9c222222-2222-4222-8222-222222222222',
   'room', 'A', 'bed', 1),
  ('9c2b2222-2222-4222-8222-222222222222', '9b111111-1111-4111-8111-111111111111',
   '9a111111-1111-4111-8111-111111111111', '9c222222-2222-4222-8222-222222222222',
   'room', 'B', 'bed', 1);

-- ---------------------------------------------------------------------------
-- What ships
-- ---------------------------------------------------------------------------

-- MT-S1-28.
select results_eq(
  $$ select key,
            'maintenance.report' = any (permissions),
            'maintenance.manage' = any (permissions),
            'maintenance.take_out_of_order' = any (permissions)
       from public.staff_roles
      where organization_id is null
      order by key $$,
  $$ values ('finance', true, false, false),
            ('front_desk', true, false, true),
            ('housekeeping', true, false, true),
            ('manager', true, true, true),
            ('owner', true, true, true) $$,
  'MT-S1-28: every shipped role reports; owner and manager work the board; four take rooms out of order');

select results_eq(
  $$ select key from public.staff_roles
      where organization_id is null
        and 'maintenance.equipment' = any (permissions)
      order by key $$,
  $$ values ('manager'), ('owner') $$,
  'MT-S1-28: owner and manager keep the equipment register');

-- MT-S1-22, MT-S1-03: the columns a caller may name.
select set_eq(
  $$ select column_name::text from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'maintenance_requests'
        and grantee = 'ranza_app' and privilege_type = 'INSERT' $$,
  array['organization_id', 'property_id', 'title', 'details',
        'accommodation_unit_id', 'equipment_id', 'kind', 'priority',
        'assignee_id'],
  'MT-S1-03: a report names where and what, never its number, reporter or times');

select set_eq(
  $$ select column_name::text from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'maintenance_requests'
        and grantee = 'ranza_app' and privilege_type = 'UPDATE' $$,
  array['status', 'cancel_reason', 'priority', 'assignee_id', 'cost_minor',
        'vendor'],
  'MT-S1-22: an update touches the state, the reason, the priority, the assignee and the cost');

-- MT-S1-23. Read off the catalogue, which returns no row rather than raising.
select is_empty(
  $$ select policyname from pg_policies
      where schemaname = 'public'
        and tablename in ('maintenance_requests', 'maintenance_unit_holds',
                          'maintenance_settings', 'maintenance_equipment',
                          'maintenance_request_charges')
        and cmd in ('DELETE', 'ALL') $$,
  'MT-S1-23: no maintenance table has a delete policy');

select is_empty(
  $$ select class.relname
       from pg_class as class, aclexplode(class.relacl) as privilege
      where class.relname in ('maintenance_requests', 'maintenance_unit_holds',
                              'maintenance_settings', 'maintenance_equipment',
                              'maintenance_request_charges')
        and privilege.grantee = 'ranza_app'::regrole
        and privilege.privilege_type in ('DELETE', 'TRUNCATE') $$,
  'MT-S1-23: and ranza_app may delete from none of them');

select is(
  (select permissive from pg_policies
    where tablename = 'accommodation_units'
      and policyname = 'accommodation_units_status_by_permission'),
  'RESTRICTIVE',
  'MT-S2-04: the status policy is restrictive, so it narrows every way in');

-- ---------------------------------------------------------------------------
-- Reporting
-- ---------------------------------------------------------------------------

set local role ranza_app;
select app.set_request_context('92222222-2222-4222-8222-222222222222');

-- MT-S1-01, MT-S1-02: the front desk reports two problems at the first
-- Property.
insert into public.maintenance_requests
  (organization_id, property_id, title, accommodation_unit_id, priority)
values
  ('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
   'The shower drain is blocked', '9c111111-1111-4111-8111-111111111111', 'urgent');

select throws_ok(
  $$ insert into public.maintenance_requests
       (organization_id, property_id, title, accommodation_unit_id, priority, reported_by)
     values ('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
             'A forged reporter', '9c111111-1111-4111-8111-111111111111', 'urgent',
             '91111111-1111-4111-8111-111111111111') $$,
  '42501', null,
  'MT-S1-03: naming the reporter is refused by the grant');

select throws_ok(
  $$ insert into public.maintenance_requests
       (organization_id, property_id, title, accommodation_unit_id, priority, assignee_id)
     values ('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
             'Assigned while reporting', '9c111111-1111-4111-8111-111111111111', 'urgent',
             '91111111-1111-4111-8111-111111111111') $$,
  '42501', null,
  'MT-S1-18: naming an assignee needs maintenance.manage, which the front desk lacks');

select throws_ok(
  $$ insert into public.maintenance_requests
       (organization_id, property_id, title, accommodation_unit_id, priority)
     values ('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
             'Another Property''s room', '9c555555-5555-4555-8555-555555555555', 'urgent') $$,
  '23503', null,
  'MT-S1-07: a request''s Unit is at its own Property');

select throws_ok(
  $$ insert into public.maintenance_requests
       (organization_id, property_id, title, priority)
     values ('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
             'About nothing at all', 'urgent') $$,
  '23514', null,
  'MT-S1-08: a request is about something');

select throws_ok(
  $$ insert into public.maintenance_requests
       (organization_id, property_id, title, accommodation_unit_id, priority)
     values ('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
             ' ab ', '9c111111-1111-4111-8111-111111111111', 'urgent') $$,
  '23514', null,
  'MT-S1-09: a title is at least three characters once trimmed');

select throws_ok(
  $$ insert into public.maintenance_requests
       (organization_id, property_id, title, accommodation_unit_id, priority)
     values ('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
             'Not a priority', '9c111111-1111-4111-8111-111111111111', 'whenever') $$,
  '23514', null,
  'MT-S1-21: a priority is urgent, this week or can wait');

-- The finance role reports as well: every shipped role does.
select app.set_request_context('93333333-3333-4333-8333-333333333333');

insert into public.maintenance_requests
  (organization_id, property_id, title, accommodation_unit_id, priority)
values
  ('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
   'The window will not close', '9c333333-3333-4333-8333-333333333333', 'this_week');

-- An id is the database's to choose; a caller names none (the grant). The two
-- requests are given known ids here, by the owner, so the rest of the suite
-- can name them.
set local role none;
update public.maintenance_requests set id = '9f111111-1111-4111-8111-111111111111'
 where title = 'The shower drain is blocked';
update public.maintenance_requests set id = '9f222222-2222-4222-8222-222222222222'
 where title = 'The window will not close';
set local role ranza_app;

select results_eq(
  $$ select number, reported_by, status, reported_at = now()
       from public.maintenance_requests
      where property_id = '9b111111-1111-4111-8111-111111111111'
      order by number $$,
  $$ values (1, '92222222-2222-4222-8222-222222222222'::uuid, 'new', true),
            (2, '93333333-3333-4333-8333-333333333333'::uuid, 'new', true) $$,
  'MT-S1-01, MT-S1-02: numbered from one at the Property, new, stamped with who and when');

-- A role holding accommodation.configure and nothing of maintenance's.
select app.set_request_context('95555555-5555-4555-8555-555555555555');

select throws_ok(
  $$ insert into public.maintenance_requests
       (organization_id, property_id, title, accommodation_unit_id, priority)
     values ('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
             'Without the permission', '9c111111-1111-4111-8111-111111111111', 'urgent') $$,
  '42501', null,
  'MT-S1-04: reporting without maintenance.report is refused');

-- A manager whose only reach is the Property without maintenance.
select app.set_request_context('94444444-4444-4444-8444-444444444444');

select is_empty(
  $$ select id from public.maintenance_requests $$,
  'MT-S1-06: requests at a Property out of reach are absent');

select throws_ok(
  $$ insert into public.maintenance_requests
       (organization_id, property_id, title, accommodation_unit_id, priority)
     values ('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
             'Out of reach', '9c111111-1111-4111-8111-111111111111', 'urgent') $$,
  '42501', null,
  'MT-S1-06: and reporting there is refused');

select throws_ok(
  $$ insert into public.maintenance_requests
       (organization_id, property_id, title, accommodation_unit_id, priority)
     values ('9a111111-1111-4111-8111-111111111111', '9b222222-2222-4222-8222-222222222222',
             'Where there is no maintenance', '9c555555-5555-4555-8555-555555555555', 'urgent') $$,
  '42501', null,
  'MT-S1-05: reporting where maintenance is not available is refused');

select app.set_request_context('99999999-9999-4999-8999-999999999999');

select throws_ok(
  $$ insert into public.maintenance_requests
       (organization_id, property_id, title, accommodation_unit_id, priority)
     values ('9a333333-3333-4333-8333-333333333333', '9b444444-4444-4444-8444-444444444444',
             'A lapsed Subscription', '9c777777-7777-4777-8777-777777777777', 'urgent') $$,
  '42501', null,
  'MT-S1-05: and where the Subscription has lapsed');

-- ---------------------------------------------------------------------------
-- Working the board
-- ---------------------------------------------------------------------------

-- The front desk may report and may not move.
select app.set_request_context('92222222-2222-4222-8222-222222222222');

-- A row the update policy does not admit is filtered, not refused.
update public.maintenance_requests set status = 'in_progress'
 where id = '9f111111-1111-4111-8111-111111111111';

select is(
  (select status from public.maintenance_requests
    where id = '9f111111-1111-4111-8111-111111111111'),
  'new',
  'MT-S1-12: moving without maintenance.manage changes nothing');

select app.set_request_context('91111111-1111-4111-8111-111111111111');

select throws_ok(
  $$ update public.maintenance_requests
        set property_id = '9b222222-2222-4222-8222-222222222222'
      where id = '9f111111-1111-4111-8111-111111111111' $$,
  '42501', null,
  'MT-S1-22: where a request is cannot be changed');

-- MT-S1-19: an assignee reaches the Property.
select throws_ok(
  $$ update public.maintenance_requests
        set assignee_id = '98888888-8888-4888-8888-888888888888'
      where id = '9f111111-1111-4111-8111-111111111111' $$,
  '23514', 'the assignee does not reach this Property',
  'MT-S1-19: somebody from another Organization is not assigned');

select throws_ok(
  $$ update public.maintenance_requests
        set assignee_id = '97777777-7777-4777-8777-777777777777'
      where id = '9f111111-1111-4111-8111-111111111111' $$,
  '23514', 'the assignee does not reach this Property',
  'MT-S1-19: nor somebody whose membership is revoked');

select throws_ok(
  $$ update public.maintenance_requests
        set assignee_id = '94444444-4444-4444-8444-444444444444'
      where id = '9f111111-1111-4111-8111-111111111111' $$,
  '23514', 'the assignee does not reach this Property',
  'MT-S1-19: nor somebody who reaches only another Property');

select lives_ok(
  $$ update public.maintenance_requests
        set assignee_id = '96666666-6666-4666-8666-666666666666', status = 'in_progress'
      where id = '9f111111-1111-4111-8111-111111111111' $$,
  'MT-S1-18, MT-S1-11: a manager assigns somebody assigned to the Property, and moves it');

select throws_ok(
  $$ update public.maintenance_requests
        set status = 'cancelled'
      where id = '9f111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'MT-S1-15: a cancelled request has a reason');

select throws_ok(
  $$ update public.maintenance_requests
        set status = 'done', cancel_reason = 'not a reason for done'
      where id = '9f111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'MT-S1-15: and nothing else carries one');

update public.maintenance_requests set status = 'done'
 where id = '9f111111-1111-4111-8111-111111111111';

select throws_ok(
  $$ update public.maintenance_requests
        set status = 'cancelled', cancel_reason = 'it was fixed anyway'
      where id = '9f111111-1111-4111-8111-111111111111' $$,
  '55000', 'a done request is not cancelled; reopen it first',
  'MT-S1-16: a done request is not cancelled');

update public.maintenance_requests set status = 'cancelled', cancel_reason = 'reported twice'
 where id = '9f222222-2222-4222-8222-222222222222';

select throws_ok(
  $$ update public.maintenance_requests
        set status = 'in_progress', cancel_reason = null
      where id = '9f222222-2222-4222-8222-222222222222' $$,
  '55000', 'a cancelled request is reopened as new',
  'MT-S1-17: a cancelled request goes nowhere but new');

select lives_ok(
  $$ update public.maintenance_requests
        set status = 'new', cancel_reason = null
      where id = '9f222222-2222-4222-8222-222222222222' $$,
  'MT-S1-17: and is reopened as new');

select is(
  (select status_changed_at = now() from public.maintenance_requests
    where id = '9f222222-2222-4222-8222-222222222222'),
  true,
  'a move is stamped by the database');

-- ---------------------------------------------------------------------------
-- Which permission writes which Unit status (MT-S2-04, MT-S2-08)
-- ---------------------------------------------------------------------------

-- The rooms admin may block; the front desk may take out of order.
select app.set_request_context('95555555-5555-4555-8555-555555555555');

select lives_ok(
  $$ update public.accommodation_units
        set status = 'blocked', status_reason = 'the carpet is being replaced'
      where id = '9c444444-4444-4444-8444-444444444444' $$,
  'accommodation.configure blocks a room');

select throws_ok(
  $$ update public.accommodation_units set status = 'out_of_service'
      where id = '9c111111-1111-4111-8111-111111111111' $$,
  '42501', null,
  'MT-S2-04: accommodation.configure does not take a room out of order');

select throws_ok(
  $$ update public.accommodation_units set status = 'occupied'
      where id = '9c111111-1111-4111-8111-111111111111' $$,
  '42501', null,
  'nothing writes occupied, so no permission may');

select app.set_request_context('92222222-2222-4222-8222-222222222222');

select throws_ok(
  $$ update public.accommodation_units
        set status = 'blocked', status_reason = 'blocked by the desk'
      where id = '9c333333-3333-4333-8333-333333333333' $$,
  '42501', null,
  'MT-S2-04: maintenance.take_out_of_order does not block a room');

update public.accommodation_units set status = 'available', status_reason = null
 where id = '9c444444-4444-4444-8444-444444444444';

select is(
  (select status from public.accommodation_units
    where id = '9c444444-4444-4444-8444-444444444444'),
  'blocked',
  'MT-S2-04: nor unblock one');

-- For every role, the owner included: each is entered from available.
set local role none;

update public.accommodation_units set status = 'out_of_service'
 where id = '9c333333-3333-4333-8333-333333333333';

select throws_ok(
  $$ update public.accommodation_units
        set status = 'blocked', status_reason = 'straight across'
      where id = '9c333333-3333-4333-8333-333333333333' $$,
  '55000', 'a Unit is blocked or taken out of order from available',
  'MT-S2-08: out of order is not blocked without passing through available');

select throws_ok(
  $$ update public.accommodation_units set status = 'out_of_service', status_reason = null
      where id = '9c444444-4444-4444-8444-444444444444' $$,
  '55000', 'a Unit is blocked or taken out of order from available',
  'MT-S2-08: nor blocked taken out of order');

update public.accommodation_units set status = 'available'
 where id = '9c333333-3333-4333-8333-333333333333';

-- ---------------------------------------------------------------------------
-- A request's hold on its room
-- ---------------------------------------------------------------------------

set local role ranza_app;

-- Finance may report and may not hold.
select app.set_request_context('93333333-3333-4333-8333-333333333333');

select throws_ok(
  $$ insert into public.maintenance_unit_holds
       (request_id, organization_id, property_id)
     values ('9f222222-2222-4222-8222-222222222222',
             '9a111111-1111-4111-8111-111111111111',
             '9b111111-1111-4111-8111-111111111111') $$,
  '42501', null,
  'MT-S2-03: taking a room out of order without the permission is refused');

select app.set_request_context('92222222-2222-4222-8222-222222222222');

select throws_ok(
  $$ insert into public.maintenance_unit_holds
       (request_id, organization_id, property_id)
     values ('9f111111-1111-4111-8111-111111111111',
             '9a111111-1111-4111-8111-111111111111',
             '9b111111-1111-4111-8111-111111111111') $$,
  '55000', 'only an open request about a Unit takes it out of order',
  'MT-S2-02: a done request holds nothing');

select throws_ok(
  $$ insert into public.maintenance_unit_holds
       (request_id, organization_id, property_id, expected_back_on)
     values ('9f222222-2222-4222-8222-222222222222',
             '9a111111-1111-4111-8111-111111111111',
             '9b111111-1111-4111-8111-111111111111',
             app.property_today('9b111111-1111-4111-8111-111111111111') - 1) $$,
  '23514', 'the expected-back date is before today',
  'MT-S2-13: an expected-back date is not before the Property''s today');

select throws_ok(
  $$ insert into public.maintenance_unit_holds
       (request_id, organization_id, property_id, returned_at)
     values ('9f222222-2222-4222-8222-222222222222',
             '9a111111-1111-4111-8111-111111111111',
             '9b111111-1111-4111-8111-111111111111', now()) $$,
  '42501', null,
  'a caller cannot claim a hold was returned when it is taken');

insert into public.maintenance_unit_holds
  (request_id, organization_id, property_id, expected_back_on)
values ('9f222222-2222-4222-8222-222222222222',
        '9a111111-1111-4111-8111-111111111111',
        '9b111111-1111-4111-8111-111111111111',
        app.property_today('9b111111-1111-4111-8111-111111111111') + 2);

select results_eq(
  $$ select taken_by, since = now(), returned_at, returned_by
       from public.maintenance_unit_holds
      where request_id = '9f222222-2222-4222-8222-222222222222' $$,
  $$ values ('92222222-2222-4222-8222-222222222222'::uuid, true, null::timestamptz, null::uuid) $$,
  'a hold is stamped with who took it and when');

-- A room with a Guest in a bed, taken out of order: the check-in trigger reads
-- the room above the bed (MT-S2-06).
select lives_ok(
  $$ update public.accommodation_units set status = 'out_of_service'
      where id = '9c222222-2222-4222-8222-222222222222' $$,
  'MT-S2-06: maintenance.take_out_of_order takes a room let by the bed out of order');

set local role none;

select throws_ok(
  $$ insert into public.stays
       (organization_id, property_id, accommodation_unit_id, stay_type, status, starts_on, ends_on)
     values ('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
             '9c2a2222-2222-4222-8222-222222222222', 'guest', 'in_house',
             app.property_today('9b111111-1111-4111-8111-111111111111'),
             app.property_today('9b111111-1111-4111-8111-111111111111') + 2) $$,
  '55000', 'that Accommodation Unit is not in service',
  'MT-S2-06: a bed in a room out of order is not checked in to, for every role');

select is(
  (select status from public.accommodation_units
    where id = '9c2a2222-2222-4222-8222-222222222222'),
  'available',
  'MT-S2-06: and the bed''s own status is not rewritten');

set local role ranza_app;
select app.set_request_context('91111111-1111-4111-8111-111111111111');

select throws_ok(
  $$ update public.maintenance_requests
        set status = 'cancelled', cancel_reason = 'not a fault after all'
      where id = '9f222222-2222-4222-8222-222222222222' $$,
  '55000', 'a request that holds its Unit is released before it is cancelled',
  'MT-S2-16: a request holding its room is not cancelled until it lets go');

-- ---------------------------------------------------------------------------
-- The setting (MT-S2-22 .. MT-S2-26)
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ insert into public.maintenance_settings
       (organization_id, assignee_required, return_on_done, return_as)
     values ('9a111111-1111-4111-8111-111111111111', true, true, 'clean') $$,
  'MT-S2-22: an Organization-wide manager sets the default');

select throws_ok(
  $$ insert into public.maintenance_settings
       (organization_id, assignee_required)
     values ('9a111111-1111-4111-8111-111111111111', false) $$,
  '23505', null,
  'MT-S2-26: a second default is refused');

select app.set_request_context('96666666-6666-4666-8666-666666666666');

update public.maintenance_settings set return_as = 'inspected'
 where organization_id = '9a111111-1111-4111-8111-111111111111'
   and property_id is null;

select is(
  (select return_as from public.maintenance_settings
    where organization_id = '9a111111-1111-4111-8111-111111111111'
      and property_id is null),
  'clean',
  'MT-S2-23: a manager who reaches one Property does not change the default');

select lives_ok(
  $$ insert into public.maintenance_settings
       (organization_id, property_id, return_as)
     values ('9a111111-1111-4111-8111-111111111111',
             '9b111111-1111-4111-8111-111111111111', 'inspected') $$,
  'MT-S2-23: but overrides their own Property');

-- MT-S2-25: the default requires an assignee, and nobody is on 2.
select throws_ok(
  $$ update public.maintenance_requests set status = 'in_progress'
      where id = '9f222222-2222-4222-8222-222222222222' $$,
  '23514', 'work on a request starts with somebody assigned to it',
  'MT-S2-25: work does not start on a request nobody is assigned to');

-- ---------------------------------------------------------------------------
-- The release, and what the worker does with it
-- ---------------------------------------------------------------------------

select app.set_request_context('92222222-2222-4222-8222-222222222222');

update public.maintenance_unit_holds set returned_at = '2000-01-01'
 where request_id = '9f222222-2222-4222-8222-222222222222';

select results_eq(
  $$ select returned_at = now(), returned_by, returned_as
       from public.maintenance_unit_holds
      where request_id = '9f222222-2222-4222-8222-222222222222' $$,
  $$ values (true, '92222222-2222-4222-8222-222222222222'::uuid, 'inspected') $$,
  'MT-S2-17: a release is stamped now, by whoever released it, as the Property''s setting says');

select throws_ok(
  $$ update public.maintenance_unit_holds set returned_as = 'dirty'
      where request_id = '9f222222-2222-4222-8222-222222222222' $$,
  '42501', null,
  'MT-S2-17: what a room returns as is in no grant');

update public.maintenance_unit_holds set expected_back_on = null
 where request_id = '9f222222-2222-4222-8222-222222222222';

select results_eq(
  $$ select returned_at = now(), returned_as
       from public.maintenance_unit_holds
      where request_id = '9f222222-2222-4222-8222-222222222222' $$,
  $$ values (true, 'inspected') $$,
  'a released hold keeps its release when anything else about it changes');

-- The events a release publishes, one real and one forged.
set local role none;

insert into outbox.events (id, organization_id, event_type, payload, occurred_at)
values
  ('9e111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111',
   'unit.returned_to_service',
   '{"requestId":"9f222222-2222-4222-8222-222222222222","unitId":"9c333333-3333-4333-8333-333333333333"}',
   now()),
  -- Forged: the same request, a moment no release happened at.
  ('9e222222-2222-4222-8222-222222222222', '9a111111-1111-4111-8111-111111111111',
   'unit.returned_to_service',
   '{"requestId":"9f222222-2222-4222-8222-222222222222","unitId":"9c333333-3333-4333-8333-333333333333"}',
   now() - interval '1 hour'),
  ('9e333333-3333-4333-8333-333333333333', '9a222222-2222-4222-8222-222222222222',
   'unit.returned_to_service',
   '{"requestId":"9f222222-2222-4222-8222-222222222222"}', now()),
  ('9e444444-4444-4444-8444-444444444444', '9a111111-1111-4111-8111-111111111111',
   'stay.checked_out', '{"stayId":"9f222222-2222-4222-8222-222222222222"}', now());

select set_config('app.user_id', '', true);
set local role ranza_worker;

select throws_ok(
  $$ select app.mark_unit_returned_to_service('9e111111-1111-4111-8111-111111111111') $$,
  '42501', 'returning a room requires a worker context',
  'MT-S2-19: without a worker context the function refuses before reading anything');

select app.set_worker_context('9a111111-1111-4111-8111-111111111111',
                              'housekeeping.markRoomOnReturnToService');

select throws_ok(
  $$ select app.mark_unit_returned_to_service('9e333333-3333-4333-8333-333333333333') $$,
  '42501', 'that event belongs to another Organization',
  'MT-S2-19: an event of another Organization is refused');

select is(app.mark_unit_returned_to_service('9e444444-4444-4444-8444-444444444444'),
  false, 'an event that is not a return writes nothing');

select is(app.mark_unit_returned_to_service('9e222222-2222-4222-8222-222222222222'),
  false, 'MT-S2-19: an event no release matches writes nothing, whatever it names');

select is(app.mark_unit_returned_to_service('9e111111-1111-4111-8111-111111111111'),
  true, 'MT-S2-17: a real release writes the room''s housekeeping status');

select is(app.mark_unit_returned_to_service('9e111111-1111-4111-8111-111111111111'),
  false, 'MT-S2-18: the same return delivered again changes nothing');

select throws_ok(
  $$ select request_id from public.maintenance_unit_holds $$,
  '42501', null,
  'MT-S2-19: the worker cannot read the holds it acted on');

set local role none;

-- The release recorded inspected; a room with no row is clean, and a room
-- comes back no better than it was.
select is(
  (select status from public.housekeeping_unit_status
    where accommodation_unit_id = '9c333333-3333-4333-8333-333333333333'),
  'clean',
  'MT-S2-17, MT-S2-30: the room came back as its release recorded, and no better than it was');

select results_eq(
  $$ select array_agg(privilege.grantee::regrole::text order by 1)
       from pg_proc as proc, aclexplode(proc.proacl) as privilege
      where proc.oid = 'app.mark_unit_returned_to_service(uuid)'::regprocedure
        and privilege.privilege_type = 'EXECUTE'
        and privilege.grantee <> proc.proowner $$,
  $$ values (array['ranza_worker']) $$,
  'MT-S2-19: only ranza_worker may call app.mark_unit_returned_to_service');

select is_empty(
  $$ select table_name from information_schema.table_privileges
      where table_schema = 'public'
        and table_name like 'maintenance\_%'
        and grantee in ('ranza_worker', 'PUBLIC') $$,
  'MT-S2-19: ranza_worker and PUBLIC hold nothing on the maintenance tables');

select finish();
rollback;
