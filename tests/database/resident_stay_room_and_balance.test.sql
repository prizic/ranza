-- What My stay shows a student beyond their bed (RANZ-87, GP-S4-*, ADR 0060).
--
-- Two claims, both ADR 0009's: a Resident reaches what is theirs through their
-- own path and never through a widening of the Staff one.
--
--   the room      a student holds a bed and the room around it is readable, and
--                 only that room: not the neighbouring room, not the sibling
--                 bed, not another Organization's.
--
--   the balance   what the student's own current Stay stands at, as a sum of
--                 its Folio's lines. Not another student's, not a departed
--                 Stay's, not where the Organization lacks billing or the
--                 Property has finance off, and not a zero where there is no
--                 Folio. The function returns no line description: the policy
--                 on folio_lines would, so the student is given a function.
--
-- Each break below was applied inside a rolled-back transaction, the altered
-- object printed first, and the named assertions seen red.
begin;
select plan(22);

insert into public.users (id, email) values
  ('eb111111-1111-4111-8111-111111111111', 'rb-student-one@example.test'),
  ('eb222222-2222-4222-8222-222222222222', 'rb-student-two@example.test'),
  ('eb333333-3333-4333-8333-333333333333', 'rb-student-three@example.test'),
  ('eb444444-4444-4444-8444-444444444444', 'rb-student-four@example.test'),
  ('eb555555-5555-4555-8555-555555555555', 'rb-student-five@example.test'),
  ('eb666666-6666-4666-8666-666666666666', 'rb-student-six@example.test'),
  ('eb777777-7777-4777-8777-777777777777', 'rb-student-seven@example.test');

insert into public.organizations (id, name, status) values
  ('eba11111-1111-4111-8111-111111111111', 'Billing Organization', 'active'),
  ('eba22222-2222-4222-8222-222222222222', 'Unbilled Organization', 'active');

insert into public.properties (id, organization_id, name) values
  ('ebb11111-1111-4111-8111-111111111111',
   'eba11111-1111-4111-8111-111111111111', 'Billing Yurt'),
  ('ebb22222-2222-4222-8222-222222222222',
   'eba11111-1111-4111-8111-111111111111', 'Billing Yurt Without Finance'),
  ('ebb33333-3333-4333-8333-333333333333',
   'eba22222-2222-4222-8222-222222222222', 'Unbilled Yurt');

insert into public.subscriptions (organization_id, status) values
  ('eba11111-1111-4111-8111-111111111111', 'active'),
  ('eba22222-2222-4222-8222-222222222222', 'active');

-- The second Organization holds the front office and not billing.
insert into public.entitlements (organization_id, module_key) values
  ('eba11111-1111-4111-8111-111111111111', 'front_office'),
  ('eba11111-1111-4111-8111-111111111111', 'billing_folios'),
  ('eba22222-2222-4222-8222-222222222222', 'front_office');

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('ebb11111-1111-4111-8111-111111111111',
   'eba11111-1111-4111-8111-111111111111', 'portal_stay_overview', true),
  ('ebb11111-1111-4111-8111-111111111111',
   'eba11111-1111-4111-8111-111111111111', 'finance', true),
  ('ebb22222-2222-4222-8222-222222222222',
   'eba11111-1111-4111-8111-111111111111', 'portal_stay_overview', true),
  ('ebb33333-3333-4333-8333-333333333333',
   'eba22222-2222-4222-8222-222222222222', 'portal_stay_overview', true),
  ('ebb33333-3333-4333-8333-333333333333',
   'eba22222-2222-4222-8222-222222222222', 'finance', true);

-- Room 1 holds two beds, one student on each. Room 2 is another room of the
-- same Property. Room 3 is let whole, so it has no parent.
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity) values
  ('ebc00000-0000-4000-8000-000000000001', 'ebb11111-1111-4111-8111-111111111111',
   'eba11111-1111-4111-8111-111111111111', 'Room 1', 'room', 2),
  ('ebc00000-0000-4000-8000-000000000002', 'ebb11111-1111-4111-8111-111111111111',
   'eba11111-1111-4111-8111-111111111111', 'Room 2', 'room', 1),
  ('ebc00000-0000-4000-8000-000000000003', 'ebb11111-1111-4111-8111-111111111111',
   'eba11111-1111-4111-8111-111111111111', 'Room 3', 'room', 1),
  ('ebc00000-0000-4000-8000-000000000004', 'ebb22222-2222-4222-8222-222222222222',
   'eba11111-1111-4111-8111-111111111111', 'Room 4', 'room', 1),
  ('ebc00000-0000-4000-8000-000000000005', 'ebb33333-3333-4333-8333-333333333333',
   'eba22222-2222-4222-8222-222222222222', 'Room 5', 'room', 1);

insert into public.accommodation_units
  (id, property_id, organization_id, parent_id, parent_unit_type, name,
   unit_type, capacity) values
  ('ebc00000-0000-4000-8000-000000000011', 'ebb11111-1111-4111-8111-111111111111',
   'eba11111-1111-4111-8111-111111111111', 'ebc00000-0000-4000-8000-000000000001',
   'room', 'Bed 1A', 'bed', 1),
  ('ebc00000-0000-4000-8000-000000000012', 'ebb11111-1111-4111-8111-111111111111',
   'eba11111-1111-4111-8111-111111111111', 'ebc00000-0000-4000-8000-000000000001',
   'room', 'Bed 1B', 'bed', 1),
  ('ebc00000-0000-4000-8000-000000000021', 'ebb11111-1111-4111-8111-111111111111',
   'eba11111-1111-4111-8111-111111111111', 'ebc00000-0000-4000-8000-000000000002',
   'room', 'Bed 2A', 'bed', 1);

-- One: a bed in Room 1, in house, with a Folio. Two: the other bed of Room 1.
-- Three: Room 2. Four: Room 3 let whole. Five: a Property without finance.
-- Six: an Organization without billing. Seven: a Stay with no Folio yet.
-- Student one has an earlier Stay as well, finished, with a Folio of its own.
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, user_id,
   stay_type, status, starts_on, ends_on) values
  ('ebf00000-0000-4000-8000-000000000001',
   'eba11111-1111-4111-8111-111111111111', 'ebb11111-1111-4111-8111-111111111111',
   'ebc00000-0000-4000-8000-000000000011', 'eb111111-1111-4111-8111-111111111111',
   'resident', 'in_house', date '2026-09-01', date '2027-06-30'),
  ('ebf00000-0000-4000-8000-000000000002',
   'eba11111-1111-4111-8111-111111111111', 'ebb11111-1111-4111-8111-111111111111',
   'ebc00000-0000-4000-8000-000000000012', 'eb222222-2222-4222-8222-222222222222',
   'resident', 'in_house', date '2026-09-01', date '2027-06-30'),
  ('ebf00000-0000-4000-8000-000000000003',
   'eba11111-1111-4111-8111-111111111111', 'ebb11111-1111-4111-8111-111111111111',
   'ebc00000-0000-4000-8000-000000000021', 'eb333333-3333-4333-8333-333333333333',
   'resident', 'in_house', date '2026-09-01', null),
  ('ebf00000-0000-4000-8000-000000000004',
   'eba11111-1111-4111-8111-111111111111', 'ebb11111-1111-4111-8111-111111111111',
   'ebc00000-0000-4000-8000-000000000003', 'eb444444-4444-4444-8444-444444444444',
   'resident', 'in_house', date '2026-09-01', date '2027-06-30'),
  ('ebf00000-0000-4000-8000-000000000005',
   'eba11111-1111-4111-8111-111111111111', 'ebb22222-2222-4222-8222-222222222222',
   'ebc00000-0000-4000-8000-000000000004', 'eb555555-5555-4555-8555-555555555555',
   'resident', 'in_house', date '2026-09-01', date '2027-06-30'),
  ('ebf00000-0000-4000-8000-000000000006',
   'eba22222-2222-4222-8222-222222222222', 'ebb33333-3333-4333-8333-333333333333',
   'ebc00000-0000-4000-8000-000000000005', 'eb666666-6666-4666-8666-666666666666',
   'resident', 'in_house', date '2026-09-01', date '2027-06-30'),
  ('ebf00000-0000-4000-8000-000000000007',
   'eba11111-1111-4111-8111-111111111111', 'ebb11111-1111-4111-8111-111111111111',
   'ebc00000-0000-4000-8000-000000000003', 'eb777777-7777-4777-8777-777777777777',
   'resident', 'reserved', date '2028-09-01', date '2029-06-30'),
  ('ebf00000-0000-4000-8000-000000000008',
   'eba11111-1111-4111-8111-111111111111', 'ebb11111-1111-4111-8111-111111111111',
   'ebc00000-0000-4000-8000-000000000011', 'eb111111-1111-4111-8111-111111111111',
   'resident', 'departed', date '2025-09-01', date '2026-06-30');

insert into public.folios
  (id, organization_id, property_id, stay_id, currency) values
  ('ebe00000-0000-4000-8000-000000000001', 'eba11111-1111-4111-8111-111111111111',
   'ebb11111-1111-4111-8111-111111111111', 'ebf00000-0000-4000-8000-000000000001', 'TRY'),
  ('ebe00000-0000-4000-8000-000000000002', 'eba11111-1111-4111-8111-111111111111',
   'ebb11111-1111-4111-8111-111111111111', 'ebf00000-0000-4000-8000-000000000002', 'TRY'),
  ('ebe00000-0000-4000-8000-000000000003', 'eba11111-1111-4111-8111-111111111111',
   'ebb11111-1111-4111-8111-111111111111', 'ebf00000-0000-4000-8000-000000000003', 'TRY'),
  ('ebe00000-0000-4000-8000-000000000005', 'eba11111-1111-4111-8111-111111111111',
   'ebb22222-2222-4222-8222-222222222222', 'ebf00000-0000-4000-8000-000000000005', 'TRY'),
  ('ebe00000-0000-4000-8000-000000000006', 'eba22222-2222-4222-8222-222222222222',
   'ebb33333-3333-4333-8333-333333333333', 'ebf00000-0000-4000-8000-000000000006', 'TRY'),
  ('ebe00000-0000-4000-8000-000000000008', 'eba11111-1111-4111-8111-111111111111',
   'ebb11111-1111-4111-8111-111111111111', 'ebf00000-0000-4000-8000-000000000008', 'TRY');

-- Student one: the term fee, a part-payment, and a fee that was reversed. The
-- balance is 1 200 000 - 500 000 + 300 000 - 300 000.
insert into public.folio_lines
  (id, organization_id, property_id, folio_id, line_type, description,
   amount_minor, payment_method) values
  ('ebd00000-0000-4000-8000-000000000001', 'eba11111-1111-4111-8111-111111111111',
   'ebb11111-1111-4111-8111-111111111111', 'ebe00000-0000-4000-8000-000000000001',
   'charge', 'Term fee', 1200000, null),
  ('ebd00000-0000-4000-8000-000000000002', 'eba11111-1111-4111-8111-111111111111',
   'ebb11111-1111-4111-8111-111111111111', 'ebe00000-0000-4000-8000-000000000001',
   'payment', 'Bank transfer', -500000, 'bank_transfer'),
  ('ebd00000-0000-4000-8000-000000000003', 'eba11111-1111-4111-8111-111111111111',
   'ebb11111-1111-4111-8111-111111111111', 'ebe00000-0000-4000-8000-000000000001',
   'charge', 'Damaged desk', 300000, null);

insert into public.folio_lines
  (organization_id, property_id, folio_id, line_type, description,
   amount_minor, reverses_line_id) values
  ('eba11111-1111-4111-8111-111111111111', 'ebb11111-1111-4111-8111-111111111111',
   'ebe00000-0000-4000-8000-000000000001', 'reversal', 'Desk was not damaged',
   -300000, 'ebd00000-0000-4000-8000-000000000003');

insert into public.folio_lines
  (organization_id, property_id, folio_id, line_type, description, amount_minor) values
  ('eba11111-1111-4111-8111-111111111111', 'ebb11111-1111-4111-8111-111111111111',
   'ebe00000-0000-4000-8000-000000000002', 'charge', 'Term fee', 99900),
  ('eba11111-1111-4111-8111-111111111111', 'ebb11111-1111-4111-8111-111111111111',
   'ebe00000-0000-4000-8000-000000000003', 'charge', 'Term fee', 77700),
  ('eba11111-1111-4111-8111-111111111111', 'ebb22222-2222-4222-8222-222222222222',
   'ebe00000-0000-4000-8000-000000000005', 'charge', 'Term fee', 55500),
  ('eba22222-2222-4222-8222-222222222222', 'ebb33333-3333-4333-8333-333333333333',
   'ebe00000-0000-4000-8000-000000000006', 'charge', 'Term fee', 44400),
  ('eba11111-1111-4111-8111-111111111111', 'ebb11111-1111-4111-8111-111111111111',
   'ebe00000-0000-4000-8000-000000000008', 'charge', 'Last year', 5000);

-- ---------------------------------------------------------------------------
-- The function is the runtime role's alone
-- ---------------------------------------------------------------------------

select ok(
  has_function_privilege('ranza_app', 'app.resident_folio_balances()', 'execute')
    and not has_function_privilege('ranza_auth', 'app.resident_folio_balances()', 'execute')
    and not has_function_privilege('ranza_worker', 'app.resident_folio_balances()', 'execute'),
  'GP-S4-07: only the runtime role may ask for a balance');

select is(
  (select proargnames::text from pg_catalog.pg_proc
    where oid = 'app.resident_folio_balances()'::regprocedure),
  '{stay_id,currency,folio_status,balance_minor}',
  'GP-S4-07: and it returns a balance and no line, no description, no payment method');

set local role ranza_app;

select is_empty($$ select * from app.resident_folio_balances() $$,
  'GP-S4-05: with no one signed in there is no balance');
select is_empty($$ select id from public.accommodation_units $$,
  'GP-S4-02: nor any room');

-- ---------------------------------------------------------------------------
-- Student one
-- ---------------------------------------------------------------------------

select app.set_request_context('eb111111-1111-4111-8111-111111111111');

select set_eq(
  $$ select name from public.accommodation_units $$,
  array['Bed 1A', 'Room 1'],
  'GP-S4-01: the student reads their bed and the room around it');

select is_empty(
  $$ select name from public.accommodation_units
      where name in ('Bed 1B', 'Room 2', 'Bed 2A', 'Room 3', 'Room 4', 'Room 5') $$,
  'GP-S4-02: and no other bed, no other room, and nothing of another Organization');

select results_eq(
  $$ select stay_id::text, currency::text, folio_status, balance_minor
       from app.resident_folio_balances() $$,
  $$ values ('ebf00000-0000-4000-8000-000000000001'::text, 'TRY'::text, 'open'::text, '700000'::text) $$,
  'GP-S4-03: the balance is the sum of the Folio''s lines, a payment and a reversal included');

select is(
  (select count(*)::int from app.resident_folio_balances()),
  1, 'GP-S4-04: and the finished Stay is not the student''s balance now');

select is_empty($$ select id from public.folios $$,
  'GP-S4-07: the student still reads no Folio');
select is_empty($$ select id from public.folio_lines $$,
  'GP-S4-07: and no line of one');

-- ---------------------------------------------------------------------------
-- Another student, in the same room
-- ---------------------------------------------------------------------------

select app.set_request_context('eb222222-2222-4222-8222-222222222222');

select set_eq(
  $$ select name from public.accommodation_units $$,
  array['Bed 1B', 'Room 1'],
  'GP-S4-02: the neighbour in Room 1 reads the same room and the other bed');

select results_eq(
  $$ select stay_id::text, balance_minor from app.resident_folio_balances() $$,
  $$ values ('ebf00000-0000-4000-8000-000000000002'::text, '99900'::text) $$,
  'GP-S4-04: and their own balance, not their neighbour''s');

-- ---------------------------------------------------------------------------
-- A student in a room of another shape
-- ---------------------------------------------------------------------------

select app.set_request_context('eb333333-3333-4333-8333-333333333333');
select set_eq(
  $$ select name from public.accommodation_units $$,
  array['Bed 2A', 'Room 2'],
  'GP-S4-01: a student in another room reads that room');

select app.set_request_context('eb444444-4444-4444-8444-444444444444');
select set_eq(
  $$ select name from public.accommodation_units $$,
  array['Room 3'],
  'GP-S4-01: a student whose room is let whole reads it, and no parent is invented');

select is_empty($$ select * from app.resident_folio_balances() $$,
  'GP-S4-06: a Stay with no Folio has no balance, which is not a zero');

-- ---------------------------------------------------------------------------
-- The commercial gates
-- ---------------------------------------------------------------------------

select app.set_request_context('eb555555-5555-4555-8555-555555555555');
select is_empty($$ select * from app.resident_folio_balances() $$,
  'GP-S4-05: no balance at a Property with finance switched off');

select app.set_request_context('eb666666-6666-4666-8666-666666666666');
select is_empty($$ select * from app.resident_folio_balances() $$,
  'GP-S4-05: nor where the Organization does not hold billing');

select app.set_request_context('eb777777-7777-4777-8777-777777777777');
select is_empty($$ select * from app.resident_folio_balances() $$,
  'GP-S4-06: a reserved Stay with no Folio yet has none');

-- ---------------------------------------------------------------------------
-- A student whose only Stay has finished reaches nothing
-- ---------------------------------------------------------------------------

set local role none;
update public.stays set status = 'departed'
 where id = 'ebf00000-0000-4000-8000-000000000001';
set local role ranza_app;
select app.set_request_context('eb111111-1111-4111-8111-111111111111');

select is_empty($$ select * from app.resident_folio_balances() $$,
  'GP-S4-04: when the last Stay has finished there is no balance');
select is_empty($$ select id from public.accommodation_units $$,
  'GP-S4-02: and no room');

select is(
  (select count(*)::int from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'accommodation_units'
      and policyname = 'accommodation_units_read_own_stay_room'
      and cmd = 'SELECT'),
  1, 'GP-S4-02: the room is read by a policy of its own, and no Staff policy was widened');

select is(
  (select count(*)::int from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'accommodation_units'
      and cmd <> 'SELECT' and policyname like '%own_stay_room%'),
  0, 'GP-S4-02: and it writes nothing');

select * from finish();
rollback;
