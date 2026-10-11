-- Webhook endpoints, their deliveries and the failures an operator is shown
-- (RANZ-46, ADR 0045, INT-S1-*).
--
-- Everything the role-bound assertions read, they read as that role. State the
-- worker's functions wrote is read back as the owner (`set local role none`),
-- because the worker holds no grant on any of these tables, which is the point.
--
-- The request context is cleared before every worker call. An earlier version of
-- this suite had the worker "record a failure" while the Manager's context from
-- a few lines up was still set, so the call passed on the Manager's permission
-- and said nothing about the worker.
begin;
select plan(127);

-- ---------------------------------------------------------------------------
-- Fixture: three Organizations, and one Staff Member who lacks each gate alone
-- ---------------------------------------------------------------------------

insert into public.users (id, email) values
  ('e1000000-0000-4000-8000-000000000001', 'wh-manager@example.test'),
  ('e1000000-0000-4000-8000-000000000002', 'wh-assigned@example.test'),
  ('e1000000-0000-4000-8000-000000000003', 'wh-viewer@example.test'),
  ('e1000000-0000-4000-8000-000000000004', 'wh-outsider@example.test'),
  ('e1000000-0000-4000-8000-000000000005', 'wh-uncommercial@example.test'),
  ('e1000000-0000-4000-8000-000000000006', 'wh-nothing@example.test');

insert into public.organizations (id, name, status) values
  ('e2000000-0000-4000-8000-000000000001', 'Webhook Org', 'active'),
  ('e2000000-0000-4000-8000-000000000002', 'Other Org', 'active'),
  ('e2000000-0000-4000-8000-000000000003', 'Unlicensed Org', 'active');

insert into public.subscriptions (organization_id, status) values
  ('e2000000-0000-4000-8000-000000000001', 'active'),
  ('e2000000-0000-4000-8000-000000000002', 'active'),
  ('e2000000-0000-4000-8000-000000000003', 'active');

insert into public.entitlements (organization_id, module_key, status) values
  ('e2000000-0000-4000-8000-000000000001', 'platform_core', 'active'),
  ('e2000000-0000-4000-8000-000000000002', 'platform_core', 'active'),
  ('e2000000-0000-4000-8000-000000000003', 'platform_core', 'active');

insert into public.properties (id, organization_id, name) values
  ('e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'First Property'),
  ('e3000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'Second Property'),
  ('e3000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000002', 'Other Org Property'),
  ('e3000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000003', 'Unlicensed Property');

-- The third Organization is a paying customer without the capability switched on:
-- gate 3 of blueprint 3.5, and only that.
insert into public.property_capabilities (property_id, organization_id, capability_key, enabled) values
  ('e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'integrations', true),
  ('e3000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'integrations', true),
  ('e3000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000002', 'integrations', true),
  ('e3000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000003', 'integrations', false);

insert into public.staff_roles (id, scope_id, organization_id, key, name, permissions) values
  ('e4000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'wh_manager', 'Manager', array['integrations.manage', 'integrations.view']),
  ('e4000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'wh_viewer', 'Viewer', array['integrations.view']),
  ('e4000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'wh_nothing', 'Nothing', array[]::text[]),
  ('e4000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000002', 'wh_manager', 'Manager', array['integrations.manage', 'integrations.view']),
  ('e4000000-0000-4000-8000-000000000005', 'e2000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000003', 'wh_manager', 'Manager', array['integrations.manage', 'integrations.view']);

insert into public.organization_memberships (organization_id, user_id, role, role_scope_id, access_scope) values
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'wh_manager', 'e2000000-0000-4000-8000-000000000001', 'organization_wide'),
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 'wh_manager', 'e2000000-0000-4000-8000-000000000001', 'assigned_properties'),
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 'wh_viewer', 'e2000000-0000-4000-8000-000000000001', 'organization_wide'),
  ('e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000004', 'wh_manager', 'e2000000-0000-4000-8000-000000000002', 'organization_wide'),
  ('e2000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000005', 'wh_manager', 'e2000000-0000-4000-8000-000000000003', 'organization_wide'),
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000006', 'wh_nothing', 'e2000000-0000-4000-8000-000000000001', 'organization_wide');

insert into public.property_assignments (property_id, organization_id, user_id) values
  ('e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002');

-- Two endpoints in the first Organization, one in the third, laid down by the
-- owner so the assertions below have ids to name.
insert into public.webhook_endpoints (id, organization_id, name, url, event_types, created_by) values
  ('e5000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'Channel manager', 'https://hooks.example.test/one',
   array['stay.checked_in', 'folio.line_posted'], 'e1000000-0000-4000-8000-000000000001'),
  ('e5000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'Reservations only', 'https://hooks.example.test/two',
   array['reservation.created'], 'e1000000-0000-4000-8000-000000000001'),
  ('e5000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000003', 'Unlicensed endpoint', 'https://hooks.example.test/three',
   array['stay.checked_in'], 'e1000000-0000-4000-8000-000000000005');

insert into public.webhook_endpoint_secrets (endpoint_id, secret) values
  ('e5000000-0000-4000-8000-000000000001', 'whsec_endpoint_one_secret_0123456789abcdef'),
  ('e5000000-0000-4000-8000-000000000002', 'whsec_endpoint_two_secret_0123456789abcdef'),
  ('e5000000-0000-4000-8000-000000000003', 'whsec_endpoint_three_secret_0123456789abcdef');

-- Outbox events the worker will be asked about. The payload carries a free-text
-- description, which a real folio.line_posted does, and which must not leave.
insert into outbox.events (id, organization_id, event_type, payload) values
  ('e6000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'stay.checked_in',
   '{"stayId":"e7000000-0000-4000-8000-000000000001","reservationId":"e7000000-0000-4000-8000-000000000002","propertyId":"e3000000-0000-4000-8000-000000000001","accommodationUnitId":"e7000000-0000-4000-8000-000000000003","folioId":null,"description":"Taxi to the airport for Mr Example"}'),
  ('e6000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'folio.line_posted',
   '{"lineId":"e7000000-0000-4000-8000-000000000004","propertyId":"e3000000-0000-4000-8000-000000000002","folioId":"e7000000-0000-4000-8000-000000000005","lineType":"charge","amountMinor":12500,"currency":"USD","description":"Minibar: two beers","paymentMethod":null,"source":"two words"}'),
  ('e6000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000001', 'staff.reach_changed',
   '{"userId":"e1000000-0000-4000-8000-000000000001"}'),
  ('e6000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000001', 'stay.checked_in',
   '{"stayId":"e7000000-0000-4000-8000-000000000001","propertyId":"e3000000-0000-4000-8000-000000000003"}'),
  ('e6000000-0000-4000-8000-000000000005', 'e2000000-0000-4000-8000-000000000002', 'stay.checked_in',
   '{"stayId":"e7000000-0000-4000-8000-000000000001","propertyId":"e3000000-0000-4000-8000-000000000003"}'),
  ('e6000000-0000-4000-8000-000000000006', 'e2000000-0000-4000-8000-000000000001', 'reservation.created',
   '{"reservationId":"e7000000-0000-4000-8000-000000000002","propertyId":"e3000000-0000-4000-8000-000000000001","accommodationUnitId":"e7000000-0000-4000-8000-000000000003"}');

-- ---------------------------------------------------------------------------
-- Creating an endpoint: every gate denies on its own (ADR 0012)
-- ---------------------------------------------------------------------------

set local role ranza_app;

select app.set_request_context('e1000000-0000-4000-8000-000000000001');

select lives_ok(
  $$ select app.create_webhook_endpoint(
       'e2000000-0000-4000-8000-000000000001', '  Door locks  ',
       'https://hooks.example.test/doors', array['stay.checked_in'],
       'whsec_created_by_the_definer_0123456789abcdef') $$,
  'INT-S1-10: a Manager with the whole Organization in reach registers an endpoint');

select results_eq(
  $$ select name, url, status, event_types::text from public.webhook_endpoints
      where url = 'https://hooks.example.test/doors' $$,
  $$ values ('Door locks', 'https://hooks.example.test/doors', 'active', '{stay.checked_in}') $$,
  'INT-S1-10: the endpoint is stored trimmed, active, with the events asked for');

select app.set_request_context('e1000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select app.create_webhook_endpoint(
       'e2000000-0000-4000-8000-000000000001', 'Not mine',
       'https://hooks.example.test/not-mine', array['stay.checked_in'],
       'whsec_not_registered_0123456789abcdef0123') $$,
  '42501', null,
  'INT-S1-16: a Manager of another Organization cannot register one here (membership alone)');

select app.set_request_context('e1000000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select app.create_webhook_endpoint(
       'e2000000-0000-4000-8000-000000000001', 'Assigned only',
       'https://hooks.example.test/assigned', array['stay.checked_in'],
       'whsec_not_registered_0123456789abcdef0123') $$,
  '42501', null,
  'INT-S1-16: a Manager assigned to one Property cannot register one (reach alone)');

select app.set_request_context('e1000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select app.create_webhook_endpoint(
       'e2000000-0000-4000-8000-000000000001', 'Viewer',
       'https://hooks.example.test/viewer', array['stay.checked_in'],
       'whsec_not_registered_0123456789abcdef0123') $$,
  '42501', null,
  'INT-S1-16: someone with integrations.view across the Organization cannot register one (permission alone)');

select app.set_request_context('e1000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select app.create_webhook_endpoint(
       'e2000000-0000-4000-8000-000000000003', 'Unlicensed',
       'https://hooks.example.test/unlicensed', array['stay.checked_in'],
       'whsec_not_registered_0123456789abcdef0123') $$,
  '42501', null,
  'INT-S1-16: a Manager whose Organization lacks the integrations capability cannot register one (commercial gate alone)');

select app.set_request_context('e1000000-0000-4000-8000-000000000001');

select throws_ok(
  $$ select app.create_webhook_endpoint(
       'e2000000-0000-4000-8000-000000000001', 'Same address',
       'https://hooks.example.test/doors', array['stay.checked_in'],
       'whsec_not_registered_0123456789abcdef0123') $$,
  '23505', null,
  'INT-S1-17: one address is registered once per Organization');

select throws_ok(
  $$ select app.create_webhook_endpoint(
       'e2000000-0000-4000-8000-000000000001', 'Plain http',
       'http://hooks.example.test/plain', array['stay.checked_in'],
       'whsec_not_registered_0123456789abcdef0123') $$,
  '23514', null,
  'INT-S1-18: a plain http address that is not loopback is refused by the table');

select throws_ok(
  $$ select app.create_webhook_endpoint(
       'e2000000-0000-4000-8000-000000000001', 'With a password',
       'https://user:secret@hooks.example.test/x', array['stay.checked_in'],
       'whsec_not_registered_0123456789abcdef0123') $$,
  '23514', null,
  'INT-S1-18: an address carrying user information is refused by the table');

select throws_ok(
  $$ select app.create_webhook_endpoint(
       'e2000000-0000-4000-8000-000000000001', 'Unknown event',
       'https://hooks.example.test/unknown', array['staff.reach_changed'],
       'whsec_not_registered_0123456789abcdef0123') $$,
  '23514', null,
  'INT-S1-19: an event that cannot be subscribed to is refused by the table');

select throws_ok(
  $$ select app.create_webhook_endpoint(
       'e2000000-0000-4000-8000-000000000001', 'No events',
       'https://hooks.example.test/none', array[]::text[],
       'whsec_not_registered_0123456789abcdef0123') $$,
  '23514', null,
  'INT-S1-19: an endpoint subscribed to nothing is refused by the table');

select throws_ok(
  $$ select app.create_webhook_endpoint(
       'e2000000-0000-4000-8000-000000000001', 'Weak secret',
       'https://hooks.example.test/weak', array['stay.checked_in'], 'short') $$,
  '23514', null,
  'INT-S1-20: a secret too short to sign with is refused by the table');

select lives_ok(
  $$ select app.create_webhook_endpoint(
       'e2000000-0000-4000-8000-000000000001', 'Endpoint ' || n,
       'https://hooks.example.test/many/' || n, array['reservation.cancelled'],
       'whsec_many_0123456789abcdef0123456789abcdef' || n)
       from generate_series(1, 7) as n $$,
  'INT-S1-21: an Organization registers up to ten endpoints');

select throws_ok(
  $$ select app.create_webhook_endpoint(
       'e2000000-0000-4000-8000-000000000001', 'The eleventh',
       'https://hooks.example.test/eleventh', array['stay.checked_in'],
       'whsec_not_registered_0123456789abcdef0123') $$,
  '54000', null,
  'INT-S1-21: the eleventh active endpoint is refused');

-- ---------------------------------------------------------------------------
-- The secret is readable by no application role, and nobody can write directly
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select secret from public.webhook_endpoint_secrets $$,
  '42501', null,
  'INT-S1-22: ranza_app cannot read a signing secret');

select throws_ok(
  $$ select body from public.webhook_deliveries $$,
  '42501', null,
  'INT-S1-22: ranza_app cannot read the body that was sent');

select throws_ok(
  $$ insert into public.webhook_endpoints (organization_id, name, url, event_types, created_by)
     values ('e2000000-0000-4000-8000-000000000001', 'Direct', 'https://hooks.example.test/direct',
             array['stay.checked_in'], 'e1000000-0000-4000-8000-000000000001') $$,
  '42501', null,
  'INT-S1-16: ranza_app has no grant to insert an endpoint, whatever its permission');

select throws_ok(
  $$ update public.webhook_endpoints set url = 'https://hooks.example.test/elsewhere' $$,
  '42501', null,
  'INT-S1-16: ranza_app has no grant to repoint an endpoint');

select throws_ok(
  $$ update public.failed_operations set status = 'resolved' $$,
  '42501', null,
  'INT-S1-16: ranza_app has no grant to close a failure by hand');

select throws_ok(
  $$ delete from public.webhook_endpoints $$,
  '42501', null,
  'INT-S1-11: an endpoint cannot be deleted');

select throws_ok(
  $$ delete from public.webhook_deliveries $$,
  '42501', null,
  'INT-S1-11: a delivery cannot be deleted');

select throws_ok(
  $$ delete from public.failed_operations $$,
  '42501', null,
  'INT-S1-11: a failed operation cannot be deleted');

-- ---------------------------------------------------------------------------
-- Reading: integrations.view, reach and the commercial gate
-- ---------------------------------------------------------------------------

select app.set_request_context('e1000000-0000-4000-8000-000000000003');
select results_eq(
  $$ select count(*)::int from public.webhook_endpoints where status = 'active' $$,
  $$ values (10) $$,
  'INT-S1-01: someone with integrations.view reads the Organization''s endpoints');

select app.set_request_context('e1000000-0000-4000-8000-000000000006');
select results_eq(
  $$ select count(*)::int from public.webhook_endpoints $$,
  $$ values (0) $$,
  'INT-S1-03: someone with neither integrations permission reads none');

select app.set_request_context('e1000000-0000-4000-8000-000000000004');
select results_eq(
  $$ select count(*)::int from public.webhook_endpoints $$,
  $$ values (0) $$,
  'INT-S1-02: a Manager of another Organization reads none');

select app.set_request_context('e1000000-0000-4000-8000-000000000005');
select results_eq(
  $$ select count(*)::int from public.webhook_endpoints $$,
  $$ values (0) $$,
  'INT-S1-02: an Organization without the capability reads none of its own endpoints');


-- ---------------------------------------------------------------------------
-- Queueing: the worker, in an Organization's context, from an event
-- ---------------------------------------------------------------------------

set local role ranza_app;
select app.set_request_context('e1000000-0000-4000-8000-000000000001');

select throws_ok(
  $$ select app.enqueue_webhook_deliveries('e6000000-0000-4000-8000-000000000001') $$,
  '42501', null,
  'INT-S1-23: ranza_app cannot queue deliveries, even as a Manager');

select throws_ok(
  $$ select * from app.due_webhook_deliveries(10) $$,
  '42501', null,
  'INT-S1-23: ranza_app cannot list the deliveries that are due');

select throws_ok(
  $$ select * from app.claim_webhook_delivery('e6000000-0000-4000-8000-000000000001') $$,
  '42501', null,
  'INT-S1-23: ranza_app cannot claim a delivery');

select throws_ok(
  $$ select app.webhook_delivery_secret('e6000000-0000-4000-8000-000000000001') $$,
  '42501', null,
  'INT-S1-23: ranza_app cannot be handed a signing secret');

select throws_ok(
  $$ select app.record_webhook_attempt(
       'e6000000-0000-4000-8000-000000000001', 'delivered', 200, null, null, 1) $$,
  '42501', null,
  'INT-S1-23: ranza_app cannot record the outcome of an attempt');

set local role ranza_worker;
select set_config('app.user_id', '', true);

select throws_ok(
  $$ select app.enqueue_webhook_deliveries('e6000000-0000-4000-8000-000000000001') $$,
  '42501', null,
  'INT-S1-24: the worker without an Organization context queues nothing');

select app.set_worker_context('e2000000-0000-4000-8000-000000000002', 'integrations.test');
select throws_ok(
  $$ select app.enqueue_webhook_deliveries('e6000000-0000-4000-8000-000000000001') $$,
  '42501', null,
  'INT-S1-24: the worker in another Organization''s context cannot queue this one''s event');

select app.set_worker_context('e2000000-0000-4000-8000-000000000001', 'integrations.test');

select is(
  app.enqueue_webhook_deliveries('e6000000-0000-4000-8000-000000000001'),
  2,
  'INT-S1-04: a checked-in event is queued for the two endpoints that subscribed to it');

select is(
  app.enqueue_webhook_deliveries('e6000000-0000-4000-8000-000000000001'),
  0,
  'INT-S1-25: the same event is never queued twice for the same endpoint');

select is(
  app.enqueue_webhook_deliveries('e6000000-0000-4000-8000-000000000003'),
  0,
  'INT-S1-26: an event nobody can subscribe to queues nothing');

select is(
  app.enqueue_webhook_deliveries('e6000000-0000-4000-8000-000000000006'),
  1,
  'INT-S1-04: a reservation event is queued only for the endpoint that asked for it');

select is(
  app.enqueue_webhook_deliveries('e6000000-0000-4000-8000-000000000002'),
  1,
  'INT-S1-04: a folio line is queued for the one endpoint that listed it');

select throws_ok(
  $$ select app.enqueue_webhook_deliveries('e6000000-0000-4000-8000-000000000004') $$,
  '22023', null,
  'INT-S1-27: an event that names another Organization''s Property is refused loudly, not delivered');

-- ---------------------------------------------------------------------------
-- What leaves: ids and facts, never a sentence
-- ---------------------------------------------------------------------------

set local role none;

select is(
  (select body -> 'data' from public.webhook_deliveries
    where event_id = 'e6000000-0000-4000-8000-000000000001'
      and endpoint_id = 'e5000000-0000-4000-8000-000000000001'),
  '{"stayId":"e7000000-0000-4000-8000-000000000001","folioId":null,"propertyId":"e3000000-0000-4000-8000-000000000001","reservationId":"e7000000-0000-4000-8000-000000000002","accommodationUnitId":"e7000000-0000-4000-8000-000000000003"}'::jsonb,
  'INT-S1-28: a body carries the listed ids and not the description the event also held');

select is(
  (select body -> 'data' from public.webhook_deliveries
    where event_id = 'e6000000-0000-4000-8000-000000000002'),
  '{"lineId":"e7000000-0000-4000-8000-000000000004","folioId":"e7000000-0000-4000-8000-000000000005","currency":"USD","lineType":"charge","propertyId":"e3000000-0000-4000-8000-000000000002","amountMinor":12500,"paymentMethod":null}'::jsonb,
  'INT-S1-28: a folio line leaves with its amount and no description, and a listed key holding a sentence is dropped');

select is(
  (select property_id from public.webhook_deliveries
    where event_id = 'e6000000-0000-4000-8000-000000000002'),
  'e3000000-0000-4000-8000-000000000002'::uuid,
  'INT-S1-29: a delivery is filed at the Property the event happened at');

select is(
  (select (body ->> 'type') || '/' || (body ->> 'organizationId') from public.webhook_deliveries
    where event_id = 'e6000000-0000-4000-8000-000000000001'
      and endpoint_id = 'e5000000-0000-4000-8000-000000000001'),
  'stay.checked_in/e2000000-0000-4000-8000-000000000001',
  'INT-S1-30: the envelope names the event type and the Organization');

select is(
  app.webhook_event_data('folio.line_posted',
    '{"description":"Taxi","amountMinor":100,"lineType":"charge","currency":"USD","extra":"x"}'::jsonb),
  '{"amountMinor":100,"lineType":"charge","currency":"USD"}'::jsonb,
  'INT-S1-28: the body filter keeps listed keys with plain values and drops everything else');

select is(
  app.webhook_event_data('stay.checked_in', '[]'::jsonb),
  '{}'::jsonb,
  'INT-S1-28: a payload that is not an object yields an empty body, not an error');

select set_eq(
  $$ select candidate.event_type
       from unnest(array['reservation.created', 'reservation.cancelled',
         'reservation.no_show', 'stay.checked_in', 'stay.checked_out',
         'folio.line_posted', 'staff.reach_changed', 'stay.moved'])
         as candidate(event_type)
      where app.webhook_event_keys(candidate.event_type) is not null $$,
  array['reservation.created', 'reservation.cancelled', 'reservation.no_show',
        'stay.checked_in', 'stay.checked_out', 'folio.line_posted'],
  'INT-S1-26: exactly six events can be subscribed to');

-- ---------------------------------------------------------------------------
-- Delivering: claim, sign, record
-- ---------------------------------------------------------------------------

-- One attempt made by the worker on a delivery that is due now, the way the
-- delivery pass makes it: the lease first, then the outcome. Run as the owner,
-- who steps into the worker's role for the two calls and steps out again.
create function pg_temp.worker_attempt(
  target uuid, outcome text, code integer, failure text
) returns text
language plpgsql
as $$
declare
  result text;
begin
  update public.webhook_deliveries
     set next_attempt_at = now(), claimed_until = null
   where id = target and status in ('pending', 'retrying');
  set local role ranza_worker;
  perform set_config('app.user_id', '', true);
  perform app.set_worker_context('e2000000-0000-4000-8000-000000000001', 'integrations.test');
  perform 1 from app.claim_webhook_delivery(target);
  result := app.record_webhook_attempt(target, outcome, code, failure, null, 5);
  set local role none;
  return result;
end;
$$;

set local role ranza_worker;
select set_config('app.user_id', '', true);

select is(
  (select count(*)::int from app.due_webhook_deliveries(50)),
  4,
  'INT-S1-31: the worker lists every due delivery, across Organizations, as ids');

set local role none;

create temporary table named (label text primary key, id uuid not null);
grant select on named to public;
insert into named
  select 'a_checked_in_channel', id from public.webhook_deliveries
   where event_id = 'e6000000-0000-4000-8000-000000000001' and endpoint_id = 'e5000000-0000-4000-8000-000000000001';
insert into named
  select 'b_checked_in_doors', id from public.webhook_deliveries
   where event_id = 'e6000000-0000-4000-8000-000000000001' and endpoint_id <> 'e5000000-0000-4000-8000-000000000001';
insert into named
  select 'c_folio_line', id from public.webhook_deliveries
   where event_id = 'e6000000-0000-4000-8000-000000000002';
insert into named
  select 'd_reservation', id from public.webhook_deliveries
   where event_id = 'e6000000-0000-4000-8000-000000000006';

set local role ranza_worker;
select set_config('app.user_id', '', true);
select set_config('app.worker_organization_id', '', true);

select throws_ok(
  $$ select * from app.claim_webhook_delivery((select id from named where label = 'a_checked_in_channel')) $$,
  '42501', null,
  'INT-S1-31: the worker claims nothing without an Organization context');

select app.set_worker_context('e2000000-0000-4000-8000-000000000002', 'integrations.test');
select is(
  (select count(*)::int from named cross join lateral app.claim_webhook_delivery(named.id)),
  0,
  'INT-S1-31: a worker in another Organization''s context claims none of this one''s deliveries');

select app.set_worker_context('e2000000-0000-4000-8000-000000000001', 'integrations.test');
select is(
  (select count(*)::int from named cross join lateral app.claim_webhook_delivery(named.id)),
  4,
  'INT-S1-31: in its own Organization''s context the worker claims every due delivery');

select is(
  (select count(*)::int from named cross join lateral app.claim_webhook_delivery(named.id)),
  0,
  'INT-S1-31: a claimed delivery is leased, so a second replica gets none of them');

select is(
  (select url from app.claim_webhook_delivery((select id from named where label = 'a_checked_in_channel'))),
  null,
  'INT-S1-31: and it is not handed the target again either');

set local role ranza_worker;
select set_config('app.user_id', '', true);
select set_config('app.worker_organization_id', '', true);

select throws_ok(
  $$ select app.webhook_delivery_secret((select id from named where label = 'a_checked_in_channel')) $$,
  '42501', null,
  'INT-S1-32: no secret without an Organization context');

select app.set_worker_context('e2000000-0000-4000-8000-000000000002', 'integrations.test');
select throws_ok(
  $$ select app.webhook_delivery_secret((select id from named where label = 'a_checked_in_channel')) $$,
  '42501', null,
  'INT-S1-32: no secret for another Organization''s delivery');

select app.set_worker_context('e2000000-0000-4000-8000-000000000001', 'integrations.test');
select is(
  app.webhook_delivery_secret((select id from named where label = 'a_checked_in_channel')),
  'whsec_endpoint_one_secret_0123456789abcdef',
  'INT-S1-32: the worker is handed the secret of the delivery it holds the lease on');

select is(
  app.record_webhook_attempt((select id from named where label = 'a_checked_in_channel'),
    'retryable', 503, 'http_error', E'Service\nUnavailable', 120),
  'retrying',
  'INT-S1-33: a 503 leaves the delivery retrying');

set local role none;

select results_eq(
  $$ select status, attempts, last_status_code, last_failure, last_response_excerpt,
            claimed_until is null,
            next_attempt_at > now() + interval '50 seconds'
              and next_attempt_at < now() + interval '70 seconds'
       from public.webhook_deliveries where id = (select id from named where label = 'a_checked_in_channel') $$,
  $$ values ('retrying', 1, 503, 'http_error', E'Service\nUnavailable', true, true) $$,
  'INT-S1-33: the first retry is about a minute away, and the attempt is counted and recorded');

select results_eq(
  $$ select status, attempts, error, operation, integration_name,
            next_attempt_at > now() and closed_at is null
       from public.failed_operations
      where delivery_id = (select id from named where label = 'a_checked_in_channel') $$,
  $$ values ('retrying', 1, 'http_error', 'stay.checked_in', 'Channel manager', true) $$,
  'INT-S1-04: the failing delivery is on the failed-operations view, with its retry time');

select results_eq(
  $$ select attempt, app.webhook_retry_delay(attempt)
       from generate_series(1, 6) as attempt order by attempt $$,
  $$ values (1, interval '1 minute'), (2, interval '5 minutes'), (3, interval '30 minutes'),
            (4, interval '2 hours'), (5, interval '12 hours'), (6, null::interval) $$,
  'INT-S1-34: the schedule is 1m, 5m, 30m, 2h, 12h, and then there is no seventh attempt');

select is(pg_temp.worker_attempt((select id from named where label = 'a_checked_in_channel'),
  'retryable', null, 'timeout'), 'retrying', 'INT-S1-33: a timeout is worth another try');
select is(pg_temp.worker_attempt((select id from named where label = 'a_checked_in_channel'),
  'retryable', 429, 'http_error'), 'retrying', 'INT-S1-33: a 429 is worth another try');
select is(pg_temp.worker_attempt((select id from named where label = 'a_checked_in_channel'),
  'retryable', 500, 'http_error'), 'retrying', 'INT-S1-33: a 500 is worth another try');
select is(pg_temp.worker_attempt((select id from named where label = 'a_checked_in_channel'),
  'retryable', 502, 'http_error'), 'retrying', 'INT-S1-34: the fifth failure still schedules the twelve-hour retry');

select ok(
  (select next_attempt_at > now() + interval '11 hours 59 minutes'
      and next_attempt_at < now() + interval '12 hours 1 minute'
     from public.webhook_deliveries where id = (select id from named where label = 'a_checked_in_channel')),
  'INT-S1-34: and it is twelve hours away');

select is(pg_temp.worker_attempt((select id from named where label = 'a_checked_in_channel'),
  'retryable', 503, 'http_error'), 'failed', 'INT-S1-35: the sixth failure stops the retries');

select results_eq(
  $$ select d.status, d.attempts, d.next_attempt_at is null,
            f.status, f.attempts, f.next_attempt_at is null
       from public.webhook_deliveries d
       join public.failed_operations f on f.delivery_id = d.id
      where d.id = (select id from named where label = 'a_checked_in_channel') $$,
  $$ values ('failed', 6, true, 'failed', 6, true) $$,
  'INT-S1-35: after six attempts the delivery and its failure are both failed, with nothing scheduled');

-- Delivered on the first try: no failure is ever shown.
select is(pg_temp.worker_attempt((select id from named where label = 'b_checked_in_doors'),
  'delivered', 204, null), 'delivered', 'INT-S1-37: a 2xx answer delivers it');

select results_eq(
  $$ select d.status, d.attempts, d.delivered_at is not null, d.last_failure,
            (select count(*) from public.failed_operations where delivery_id = d.id)::int
       from public.webhook_deliveries d where d.id = (select id from named where label = 'b_checked_in_doors') $$,
  $$ values ('delivered', 1, true, null, 0) $$,
  'INT-S1-37: a first-try delivery leaves no failure behind');

-- Failed once, then delivered: the failure resolves itself and says why.
select is(pg_temp.worker_attempt((select id from named where label = 'c_folio_line'),
  'retryable', 503, 'http_error'), 'retrying', 'INT-S1-08: a delivery fails once');
select is(pg_temp.worker_attempt((select id from named where label = 'c_folio_line'),
  'delivered', 200, null), 'delivered', 'INT-S1-08: and arrives on the retry');

select results_eq(
  $$ select f.status, f.closed_reason, f.closed_by is null, f.closed_at is not null, f.attempts, f.next_attempt_at is null
       from public.failed_operations f where f.delivery_id = (select id from named where label = 'c_folio_line') $$,
  $$ values ('resolved', 'delivered', true, true, 2, true) $$,
  'INT-S1-08: a failure resolves only when a delivery arrives, and records that it was the delivery that did it');

-- A permanent answer ends it at once.
select is(pg_temp.worker_attempt((select id from named where label = 'd_reservation'),
  'permanent', 400, 'http_error'), 'failed', 'INT-S1-38: a 400 is not retried');

select results_eq(
  $$ select d.status, d.attempts, f.status, f.attempts
       from public.webhook_deliveries d join public.failed_operations f on f.delivery_id = d.id
      where d.id = (select id from named where label = 'd_reservation') $$,
  $$ values ('failed', 1, 'failed', 1) $$,
  'INT-S1-38: it is failed after one attempt');

-- An attempt for a delivery that is not leased changes nothing and is not an error.
set local role ranza_worker;
select set_config('app.user_id', '', true);
select app.set_worker_context('e2000000-0000-4000-8000-000000000001', 'integrations.test');
select is(
  app.record_webhook_attempt((select id from named where label = 'b_checked_in_doors'),
    'delivered', 200, null, null, 5),
  null,
  'INT-S1-39: recording an attempt for a delivery that is already closed changes nothing');

select throws_ok(
  $$ select app.record_webhook_attempt((select id from named where label = 'd_reservation'),
       'maybe', 200, null, null, 5) $$,
  '22023', null,
  'INT-S1-39: an outcome that is not delivered, retryable or permanent is refused');

select throws_ok(
  $$ select app.record_webhook_attempt((select id from named where label = 'd_reservation'),
       'retryable', 500, null, null, 5) $$,
  '22023', null,
  'INT-S1-39: an attempt that did not arrive must say why');

-- ---------------------------------------------------------------------------
-- A test event
-- ---------------------------------------------------------------------------

set local role ranza_app;

select app.set_request_context('e1000000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select app.send_webhook_test('e5000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000002') $$,
  '42501', null,
  'INT-S1-40: a Manager assigned to one Property cannot send a test event (reach alone)');

select app.set_request_context('e1000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select app.send_webhook_test('e5000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000002') $$,
  '42501', null,
  'INT-S1-40: someone who only views cannot send a test event (permission alone)');

select app.set_request_context('e1000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select app.send_webhook_test('e5000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000003') $$,
  '22023', null,
  'INT-S1-40: a test event is filed at one of the Organization''s own Properties');

select lives_ok(
  $$ select app.send_webhook_test('e5000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000002') $$,
  'INT-S1-41: a Manager sends a test event');

select throws_ok(
  $$ select app.send_webhook_test('e5000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000002') $$,
  '55000', null,
  'INT-S1-41: and cannot send a second while the first is still on its way');

set local role none;

create temporary table test_event as
  select id from public.webhook_deliveries
   where endpoint_id = 'e5000000-0000-4000-8000-000000000002' and event_type = 'webhook.test';
grant select on test_event to public;

select results_eq(
  $$ select status, event_id is null, body ->> 'type', body -> 'data', property_id
       from public.webhook_deliveries where id = (select id from test_event) $$,
  $$ values ('pending', true, 'webhook.test', '{}'::jsonb, 'e3000000-0000-4000-8000-000000000002'::uuid) $$,
  'INT-S1-41: a test event is a pending delivery with no outbox event and no data');

select is(pg_temp.worker_attempt((select id from test_event), 'retryable', null, 'connection_failed'),
  'retrying', 'INT-S1-42: a test event to an endpoint that is down fails like any other delivery');

-- ---------------------------------------------------------------------------
-- Retry, cancel, resolve: the Property's gates, and who and why
-- ---------------------------------------------------------------------------

-- A failure in the Organization without the capability, laid down by the owner.
insert into public.webhook_deliveries
  (id, organization_id, endpoint_id, property_id, event_id, event_type, body, status, attempts, next_attempt_at)
values
  ('e8000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000003',
   'e5000000-0000-4000-8000-000000000003', 'e3000000-0000-4000-8000-000000000004',
   null, 'webhook.test', '{"type":"webhook.test"}', 'failed', 6, null);
insert into public.failed_operations
  (id, organization_id, property_id, endpoint_id, delivery_id, integration_name, operation, error, status, attempts)
values
  ('e9000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000003',
   'e3000000-0000-4000-8000-000000000004', 'e5000000-0000-4000-8000-000000000003',
   'e8000000-0000-4000-8000-000000000001', 'Unlicensed endpoint', 'webhook.test', 'timeout', 'failed', 6);

create temporary table named_operation (label text primary key, id uuid not null);
grant select on named_operation to public;
insert into named_operation
  select 'failed_at_first', id from public.failed_operations
   where delivery_id = (select id from named where label = 'a_checked_in_channel');
insert into named_operation
  select 'failed_permanently', id from public.failed_operations
   where delivery_id = (select id from named where label = 'd_reservation');
insert into named_operation
  select 'retrying_at_second', id from public.failed_operations
   where delivery_id = (select id from test_event);
insert into named_operation
  select 'resolved_by_delivery', id from public.failed_operations
   where delivery_id = (select id from named where label = 'c_folio_line');

set local role ranza_app;

-- Reading: the Property's reach.
select app.set_request_context('e1000000-0000-4000-8000-000000000002');
select results_eq(
  $$ select count(*)::int from public.failed_operations where status in ('failed', 'retrying') $$,
  $$ values (2) $$,
  'INT-S1-02: a Manager assigned to the first Property reads its two open failures and not the second Property''s');
select results_eq(
  $$ select count(*)::int from public.webhook_deliveries $$,
  $$ values (3) $$,
  'INT-S1-02: and its deliveries, three, and not the second Property''s');

select app.set_request_context('e1000000-0000-4000-8000-000000000006');
select results_eq(
  $$ select count(*)::int from public.failed_operations $$,
  $$ values (0) $$,
  'INT-S1-03: someone with neither integrations permission reads no failures');

select app.set_request_context('e1000000-0000-4000-8000-000000000005');
select results_eq(
  $$ select count(*)::int from public.failed_operations $$,
  $$ values (0) $$,
  'INT-S1-03: an Organization without the capability reads no failures even of its own');

-- Retrying.
select app.set_request_context('e1000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select app.retry_failed_operation((select id from named_operation where label = 'failed_at_first')) $$,
  '42501', null,
  'INT-S1-07: someone who only views cannot retry (permission alone)');

select app.set_request_context('e1000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select app.retry_failed_operation((select id from named_operation where label = 'failed_at_first')) $$,
  '42501', null,
  'INT-S1-07: a Manager of another Organization cannot retry (membership alone)');

select app.set_request_context('e1000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select app.retry_failed_operation('e9000000-0000-4000-8000-000000000001') $$,
  '42501', null,
  'INT-S1-07: a Manager whose Organization lacks the capability cannot retry (commercial gate alone)');

select app.set_request_context('e1000000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select app.retry_failed_operation((select id from named_operation where label = 'retrying_at_second')) $$,
  '42501', null,
  'INT-S1-07: a Manager who does not reach the second Property cannot retry its failure (reach alone)');

select app.set_request_context('e1000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select app.retry_failed_operation((select id from named_operation where label = 'resolved_by_delivery')) $$,
  '22023', null,
  'INT-S1-06: a failure that has been resolved cannot be retried');

select app.set_request_context('e1000000-0000-4000-8000-000000000002');
select is(
  app.retry_failed_operation((select id from named_operation where label = 'failed_at_first')),
  'retrying',
  'INT-S1-06: a Manager with reach to the Property puts a failed delivery back in the queue');

set local role none;

select results_eq(
  $$ select d.status, d.attempts, d.next_attempt_at <= now(), f.status, f.attempts, f.closed_at is null
       from public.webhook_deliveries d join public.failed_operations f on f.delivery_id = d.id
      where d.id = (select id from named where label = 'a_checked_in_channel') $$,
  $$ values ('retrying', 6, true, 'retrying', 6, true) $$,
  'INT-S1-06: retry re-queues it, due now; it resolves nothing and counts no attempt until the worker makes one');

select is(pg_temp.worker_attempt((select id from named where label = 'a_checked_in_channel'),
  'retryable', 503, 'http_error'), 'failed',
  'INT-S1-09: a failed retry counts as an attempt, and with the schedule spent the delivery is failed again');

select results_eq(
  $$ select f.status, f.attempts from public.failed_operations f
      where f.id = (select id from named_operation where label = 'failed_at_first') $$,
  $$ values ('failed', 7) $$,
  'INT-S1-09: the failure shows seven attempts');

set local role ranza_app;
select app.set_request_context('e1000000-0000-4000-8000-000000000002');
select app.retry_failed_operation((select id from named_operation where label = 'failed_at_first'));

-- Cancelling: only what is still being retried, with a reason, by name.
select throws_ok(
  $$ select app.cancel_failed_operation((select id from named_operation where label = 'failed_permanently'), 'no longer needed') $$,
  '22023', null,
  'INT-S1-43: a delivery that has stopped being retried cannot be cancelled');

select throws_ok(
  $$ select app.cancel_failed_operation((select id from named_operation where label = 'failed_at_first'), 'x') $$,
  '23514', null,
  'INT-S1-43: a reason of fewer than three characters is refused');

select app.set_request_context('e1000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select app.cancel_failed_operation((select id from named_operation where label = 'failed_at_first'), 'not by me') $$,
  '42501', null,
  'INT-S1-44: someone who only views cannot cancel');

select app.set_request_context('e1000000-0000-4000-8000-000000000001');
select is(
  app.cancel_failed_operation((select id from named_operation where label = 'failed_at_first'), '  receiver retired  '),
  'cancelled',
  'INT-S1-45: a Manager cancels a delivery that is still being retried');

select throws_ok(
  $$ select app.resolve_failed_operation((select id from named_operation where label = 'retrying_at_second'), 'handled by phone') $$,
  '22023', null,
  'INT-S1-46: a delivery that is still being retried cannot be marked resolved');

select app.set_request_context('e1000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select app.resolve_failed_operation((select id from named_operation where label = 'failed_permanently'), 'not by me') $$,
  '42501', null,
  'INT-S1-47: someone who only views cannot resolve');

select app.set_request_context('e1000000-0000-4000-8000-000000000002');
select is(
  app.resolve_failed_operation((select id from named_operation where label = 'failed_permanently'), 'the hotel phoned them'),
  'resolved',
  'INT-S1-48: a Manager marks a failed delivery resolved');

set local role none;

select results_eq(
  $$ select f.status, f.closed_by, f.closed_reason, f.closed_at is not null, d.status
       from public.failed_operations f join public.webhook_deliveries d on d.id = f.delivery_id
      where f.id = (select id from named_operation where label = 'failed_at_first') $$,
  $$ values ('cancelled', 'e1000000-0000-4000-8000-000000000001'::uuid, 'receiver retired', true, 'cancelled') $$,
  'INT-S1-45: a cancellation records who and why, and the delivery is cancelled with it');

select results_eq(
  $$ select f.status, f.closed_by, f.closed_reason, d.status
       from public.failed_operations f join public.webhook_deliveries d on d.id = f.delivery_id
      where f.id = (select id from named_operation where label = 'failed_permanently') $$,
  $$ values ('resolved', 'e1000000-0000-4000-8000-000000000002'::uuid, 'the hotel phoned them', 'failed') $$,
  'INT-S1-48: a resolution records who and why, and the delivery stays failed because it did fail');

-- ---------------------------------------------------------------------------
-- Removing an endpoint
-- ---------------------------------------------------------------------------

set local role ranza_app;

select app.set_request_context('e1000000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select app.remove_webhook_endpoint('e5000000-0000-4000-8000-000000000002') $$,
  '42501', null,
  'INT-S1-49: a Manager assigned to one Property cannot remove an endpoint (reach alone)');

select app.set_request_context('e1000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select app.remove_webhook_endpoint('e5000000-0000-4000-8000-000000000002') $$,
  '42501', null,
  'INT-S1-49: someone who only views cannot remove an endpoint (permission alone)');

select app.set_request_context('e1000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select app.remove_webhook_endpoint('e5000000-0000-4000-8000-000000000002') $$,
  '42501', null,
  'INT-S1-49: a Manager of another Organization cannot remove it (membership alone)');

select app.set_request_context('e1000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select app.remove_webhook_endpoint('e5000000-0000-4000-8000-000000000003') $$,
  '42501', null,
  'INT-S1-49: an Organization without the capability cannot remove its endpoint (commercial gate alone)');

select app.set_request_context('e1000000-0000-4000-8000-000000000001');
select is(
  app.remove_webhook_endpoint('e5000000-0000-4000-8000-000000000002'),
  true,
  'INT-S1-50: a Manager with the whole Organization in reach removes an endpoint');

set local role none;

select results_eq(
  $$ select e.status, e.removed_at is not null,
            (select count(*) from public.webhook_endpoint_secrets where endpoint_id = e.id)::int
       from public.webhook_endpoints e where e.id = 'e5000000-0000-4000-8000-000000000002' $$,
  $$ values ('removed', true, 0) $$,
  'INT-S1-50: a removed endpoint keeps its row and loses its secret');

select results_eq(
  $$ select d.status, f.status, f.closed_reason, f.closed_by
       from public.webhook_deliveries d join public.failed_operations f on f.delivery_id = d.id
      where d.id = (select id from test_event) $$,
  $$ values ('cancelled', 'cancelled', 'endpoint removed', 'e1000000-0000-4000-8000-000000000001'::uuid) $$,
  'INT-S1-50: what was still on its way is cancelled, by name');

select is(
  (select count(*)::int from public.webhook_deliveries where endpoint_id = 'e5000000-0000-4000-8000-000000000002'),
  2,
  'INT-S1-11: its deliveries are history and stay');

-- ---------------------------------------------------------------------------
-- The catalogue says what the tests above found
-- ---------------------------------------------------------------------------

-- The functions the worker may execute, and nobody else. Read from the ACL
-- with PUBLIC's default included, so a function nobody revoked from PUBLIC
-- fails here instead of raising.
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where n.nspname = 'app'
      and p.proname in ('enqueue_webhook_deliveries', 'due_webhook_deliveries',
                        'claim_webhook_delivery', 'webhook_delivery_secret',
                        'record_webhook_attempt')
      and acl.privilege_type = 'EXECUTE'
      and acl.grantee in (0, (select oid from pg_roles where rolname = 'ranza_app'),
                             (select oid from pg_roles where rolname = 'ranza_auth'))),
  0,
  'INT-S1-23: no one but the worker may execute the five worker functions');

select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where n.nspname = 'app'
      and p.proname in ('create_webhook_endpoint', 'remove_webhook_endpoint',
                        'send_webhook_test', 'retry_failed_operation',
                        'cancel_failed_operation', 'resolve_failed_operation',
                        'webhook_endpoints_are_managed_by_caller',
                        'failed_operation_is_managed_by_caller')
      and acl.privilege_type = 'EXECUTE'
      and acl.grantee in (0, (select oid from pg_roles where rolname = 'ranza_worker'),
                             (select oid from pg_roles where rolname = 'ranza_auth'))),
  0,
  'INT-S1-23: neither the worker nor the credential role may execute a Staff Member''s command');

select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where n.nspname = 'app'
      and p.proname in ('webhook_endpoints_are_managed_by_caller', 'failed_operation_is_managed_by_caller')
      and acl.privilege_type = 'EXECUTE'
      and acl.grantee = (select oid from pg_roles where rolname = 'ranza_app')),
  0,
  'INT-S1-23: the gate helpers are executable by the owner alone');

select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.prosecdef
      and p.proname in ('enqueue_webhook_deliveries', 'due_webhook_deliveries',
                        'claim_webhook_delivery', 'webhook_delivery_secret',
                        'record_webhook_attempt', 'create_webhook_endpoint', 'remove_webhook_endpoint',
                        'send_webhook_test', 'retry_failed_operation',
                        'cancel_failed_operation', 'resolve_failed_operation')
      and p.proconfig @> array['search_path=""']),
  11,
  'INT-S1-23: all eleven definers pin an empty search_path');

select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'webhook_endpoint_secrets'
      and grantee in ('ranza_app', 'ranza_worker', 'ranza_auth', 'PUBLIC')),
  0,
  'INT-S1-22: no role but the owner holds any privilege on the secrets table');

select is(
  (select count(*)::int
     from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'webhook_deliveries'
      and column_name = 'body' and grantee in ('ranza_app', 'ranza_worker', 'PUBLIC')),
  0,
  'INT-S1-22: no role but the owner holds any privilege on a delivery''s body');

select is(
  (select count(*)::int
     from information_schema.column_privileges
    where table_schema = 'public'
      and table_name in ('webhook_endpoints', 'webhook_deliveries', 'failed_operations')
      and grantee in ('ranza_worker', 'ranza_auth', 'PUBLIC')),
  0,
  'INT-S1-23: the worker holds no grant on any column of the three tables; it reaches them through functions');

select is(
  (select count(*)::int
     from information_schema.column_privileges
    where table_schema = 'public'
      and table_name in ('webhook_endpoints', 'webhook_deliveries', 'failed_operations')
      and grantee = 'ranza_app'
      and privilege_type in ('INSERT', 'UPDATE')),
  0,
  'INT-S1-16: ranza_app can write no column of the three tables');

select is(
  (select count(*)::int
     from pg_policies
    where schemaname = 'public'
      and tablename in ('webhook_endpoints', 'webhook_endpoint_secrets', 'webhook_deliveries', 'failed_operations')
      and cmd <> 'SELECT'),
  0,
  'INT-S1-16: there is no policy that lets any role write these tables, and none at all on the secrets');

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'webhook_endpoint_secrets'),
  0,
  'INT-S1-22: the secrets table has no policy for any role');

select ok(
  (select qual like '%integrations.view%' and qual like '%accessible_property_ids%'
      and qual like '%can_use_capability%' and qual like '%accessible_organization_ids%'
     from pg_policies
    where tablename = 'failed_operations' and policyname = 'failed_operations_read_app'),
  'INT-S1-03: reading a failure asks membership, reach, the permission and the commercial gate');

select ok(
  (select qual like '%integrations.view%' and qual like '%can_use_capability_in_organization%'
      and qual like '%accessible_organization_ids%'
     from pg_policies
    where tablename = 'webhook_endpoints' and policyname = 'webhook_endpoints_read_app'),
  'INT-S1-03: reading an endpoint asks membership, the permission and the commercial gate');

select ok(
  (select qual like '%accessible_property_ids%' and qual like '%can_use_capability(%'
     from pg_policies
    where tablename = 'webhook_deliveries' and policyname = 'webhook_deliveries_read_app'),
  'INT-S1-02: reading a delivery asks the reach and the commercial gate of its Property');

select ok(
  (select pg_get_constraintdef(oid) like '%cancelled%'
     from pg_constraint where conname = 'failed_operations_status_check'),
  'INT-S1-48: a failure can be failed, retrying, resolved or cancelled');

select * from finish();
rollback;
