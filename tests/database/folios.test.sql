-- The first money in the product: who may post a charge, who may not, and why
-- a posted line cannot be changed by anybody.
--
-- The immutability assertions run twice, from ranza_app and then from the
-- migration role, because the second is the case that has already escaped once
-- in this repository. audit.records was append-only in the repository, in its
-- test, and in every database built from scratch — and not in production,
-- because the trigger was added to a migration that had already been applied.
-- A policy and a revoked grant say nothing to a superuser. Only the trigger
-- does, so only the trigger is evidence.
--
-- Every assertion here was checked by breaking the thing it asserts — dropping
-- the trigger, restoring the grant, widening the policy to
-- app.accessible_property_ids(), removing the open-Folio clause — and
-- confirming it went red.
begin;
select plan(57);

insert into public.users (id, email) values
  ('41111111-1111-4111-8111-111111111111', 'finance-a@example.test'),
  ('42222222-2222-4222-8222-222222222222', 'finance-b@example.test'),
  ('43333333-3333-4333-8333-333333333333', 'finance-resident@example.test');

insert into public.organizations (id, name, status) values
  ('4a111111-1111-4111-8111-111111111111', 'Finance Organization A', 'active'),
  ('4b111111-1111-4111-8111-111111111111', 'Finance Organization B', 'active');

-- A1 trades in lira and B1 in dirhams, which is the case that decided where
-- currency lives: one Organization, two countries, so it cannot sit on the
-- Organization. A2 is in Organization A and reachable, but never enables the
-- finance capability — it exists to isolate gate 3 from reach.
insert into public.properties (id, organization_id, name, currency) values
  ('4c111111-1111-4111-8111-111111111111',
   '4a111111-1111-4111-8111-111111111111', 'Finance Property A1', 'TRY'),
  ('4c222222-2222-4222-8222-222222222222',
   '4b111111-1111-4111-8111-111111111111', 'Finance Property B1', 'AED'),
  ('4c333333-3333-4333-8333-333333333333',
   '4a111111-1111-4111-8111-111111111111', 'Finance Property A2', 'TRY');

insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity) values
  ('4d111111-1111-4111-8111-111111111111',
   '4c111111-1111-4111-8111-111111111111',
   '4a111111-1111-4111-8111-111111111111', 'A1-101', 'room', 2),
  ('4d222222-2222-4222-8222-222222222222',
   '4c111111-1111-4111-8111-111111111111',
   '4a111111-1111-4111-8111-111111111111', 'A1-102', 'room', 2),
  ('4d333333-3333-4333-8333-333333333333',
   '4c111111-1111-4111-8111-111111111111',
   '4a111111-1111-4111-8111-111111111111', 'A1-103', 'room', 2),
  ('4d444444-4444-4444-8444-444444444444',
   '4c222222-2222-4222-8222-222222222222',
   '4b111111-1111-4111-8111-111111111111', 'B1-201', 'suite', 4),
  ('4d555555-5555-4555-8555-555555555555',
   '4c333333-3333-4333-8333-333333333333',
   '4a111111-1111-4111-8111-111111111111', 'A2-101', 'room', 2);

insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('4a111111-1111-4111-8111-111111111111',
   '41111111-1111-4111-8111-111111111111', 'manager', 'organization_wide'),
  ('4b111111-1111-4111-8111-111111111111',
   '42222222-2222-4222-8222-222222222222', 'manager', 'organization_wide');

insert into public.subscriptions (organization_id, status) values
  ('4a111111-1111-4111-8111-111111111111', 'active'),
  ('4b111111-1111-4111-8111-111111111111', 'active');

insert into public.entitlements (organization_id, module_key) values
  ('4a111111-1111-4111-8111-111111111111', 'billing_folios'),
  ('4b111111-1111-4111-8111-111111111111', 'billing_folios');

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('4c111111-1111-4111-8111-111111111111',
   '4a111111-1111-4111-8111-111111111111', 'finance', true),
  ('4c222222-2222-4222-8222-222222222222',
   '4b111111-1111-4111-8111-111111111111', 'finance', true);
-- A2 deliberately gets none.

insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, user_id,
   stay_type, status, starts_on, ends_on) values
  -- The Stay whose Folio the assertions below work on.
  ('4f111111-1111-4111-8111-111111111111',
   '4a111111-1111-4111-8111-111111111111',
   '4c111111-1111-4111-8111-111111111111',
   '4d111111-1111-4111-8111-111111111111', null,
   'guest', 'in_house', date '2026-10-01', date '2026-10-05'),
  -- Another Organization's Stay, with another Organization's Folio.
  ('4f222222-2222-4222-8222-222222222222',
   '4b111111-1111-4111-8111-111111111111',
   '4c222222-2222-4222-8222-222222222222',
   '4d444444-4444-4444-8444-444444444444', null,
   'guest', 'in_house', date '2026-10-01', date '2026-10-05'),
  -- The Resident's own current Stay, which is the whole of their reach.
  ('4f333333-3333-4333-8333-333333333333',
   '4a111111-1111-4111-8111-111111111111',
   '4c111111-1111-4111-8111-111111111111',
   '4d222222-2222-4222-8222-222222222222',
   '43333333-3333-4333-8333-333333333333',
   'resident', 'in_house', date '2026-09-01', null),
  -- A Stay with no Folio yet, so opening one can be asserted.
  ('4f444444-4444-4444-8444-444444444444',
   '4a111111-1111-4111-8111-111111111111',
   '4c111111-1111-4111-8111-111111111111',
   '4d333333-3333-4333-8333-333333333333', null,
   'guest', 'in_house', date '2026-11-01', date '2026-11-05'),
  -- A Stay at the Property with no finance capability.
  ('4f555555-5555-4555-8555-555555555555',
   '4a111111-1111-4111-8111-111111111111',
   '4c333333-3333-4333-8333-333333333333',
   '4d555555-5555-4555-8555-555555555555', null,
   'guest', 'in_house', date '2026-10-01', date '2026-10-05');

insert into public.folios
  (id, organization_id, property_id, stay_id, currency) values
  ('4e111111-1111-4111-8111-111111111111',
   '4a111111-1111-4111-8111-111111111111',
   '4c111111-1111-4111-8111-111111111111',
   '4f111111-1111-4111-8111-111111111111', 'TRY'),
  ('4e222222-2222-4222-8222-222222222222',
   '4b111111-1111-4111-8111-111111111111',
   '4c222222-2222-4222-8222-222222222222',
   '4f222222-2222-4222-8222-222222222222', 'AED'),
  -- The Resident's own Folio. It exists so that "a Resident reaches no Folio"
  -- is an assertion about policies rather than about an empty table.
  ('4e333333-3333-4333-8333-333333333333',
   '4a111111-1111-4111-8111-111111111111',
   '4c111111-1111-4111-8111-111111111111',
   '4f333333-3333-4333-8333-333333333333', 'TRY');

insert into public.folio_lines
  (id, organization_id, property_id, folio_id, line_type, description, amount_minor) values
  ('4aaa1111-1111-4111-8111-111111111111',
   '4b111111-1111-4111-8111-111111111111',
   '4c222222-2222-4222-8222-222222222222',
   '4e222222-2222-4222-8222-222222222222', 'charge', 'Other Organization', 9900),
  -- On a second Folio in reach. It exists so the reversal's composite foreign
  -- key can be isolated: the trigger below approves this line, and only the
  -- key refuses it being cancelled from another Folio.
  ('4aaa2222-2222-4222-8222-222222222222',
   '4a111111-1111-4111-8111-111111111111',
   '4c111111-1111-4111-8111-111111111111',
   '4e333333-3333-4333-8333-333333333333', 'charge', 'Another Folio', 5000);

-- ---------------------------------------------------------------------------
-- No request context: the same answer for reading and for writing
-- ---------------------------------------------------------------------------

set local role ranza_app;

select is_empty('select id from public.folios',
  'without request context no Folio is visible');
select is_empty('select id from public.folio_lines',
  'without request context no line is visible');

select throws_ok(
  $$insert into public.folios (organization_id, property_id, stay_id, currency)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4f444444-4444-4444-8444-444444444444', 'TRY')$$,
  '42501', NULL,
  'without request context no Folio can be opened');

select throws_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4e111111-1111-4111-8111-111111111111', 'charge', 'Nobody', 1000)$$,
  '42501', NULL,
  'without request context no charge can be posted');

-- ---------------------------------------------------------------------------
-- A Staff Member at Organization A
-- ---------------------------------------------------------------------------

select app.set_request_context('41111111-1111-4111-8111-111111111111');

select set_eq(
  'select id::text from public.folios',
  array['4e111111-1111-4111-8111-111111111111',
        '4e333333-3333-4333-8333-333333333333'],
  'a Staff Member sees the Folios of a Property they reach, and no others');

select set_eq(
  'select description from public.folio_lines',
  array['Another Folio'],
  'and the lines of those Folios, and none of another Organization''s');

select lives_ok(
  $$insert into public.folios (organization_id, property_id, stay_id, currency)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4f444444-4444-4444-8444-444444444444', 'TRY')$$,
  'a Staff Member opens a Folio on a Stay they reach');

-- Self-consistent in every respect: Organization B really does own that
-- Property and that Stay. Only the WITH CHECK refuses it.
select throws_ok(
  $$insert into public.folios (organization_id, property_id, stay_id, currency)
    values ('4b111111-1111-4111-8111-111111111111',
            '4c222222-2222-4222-8222-222222222222',
            '4f222222-2222-4222-8222-222222222222', 'AED')$$,
  '42501', NULL,
  'a Folio cannot be opened in another Organization''s Property');

-- The other direction, which the policy lets through: a Property in reach,
-- claimed for an Organization that does not own it. The composite foreign key
-- is what refuses here, which is why both layers exist.
select throws_ok(
  $$insert into public.folios (organization_id, property_id, stay_id, currency)
    values ('4b111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4f444444-4444-4444-8444-444444444444', 'TRY')$$,
  '23503', NULL,
  'a Property cannot be relabelled into another Organization');

select throws_ok(
  $$insert into public.folios (organization_id, property_id, stay_id, currency)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4f222222-2222-4222-8222-222222222222', 'TRY')$$,
  '23503', NULL,
  'a Folio cannot be opened on another Organization''s Stay');

select throws_ok(
  $$insert into public.folios (organization_id, property_id, stay_id, currency)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4f111111-1111-4111-8111-111111111111', 'TRY')$$,
  '23505', NULL,
  'a Stay has at most one Folio: split folios are not built');

select throws_ok(
  $$insert into public.folios (organization_id, property_id, stay_id, currency)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4f444444-4444-4444-8444-444444444444', 'try')$$,
  '23514', NULL,
  'a currency is three upper-case letters, not whatever was typed');

-- ---------------------------------------------------------------------------
-- Lines, and the balance that is only ever their sum
-- ---------------------------------------------------------------------------

-- Written without naming `id`: 20260916002150 withholds it from ranza_app,
-- because no statement in the product names it either. The row is found
-- below by its description, which is unique within this Folio.
select lives_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4e111111-1111-4111-8111-111111111111',
            'charge', 'Four nights', 400000)$$,
  'a Staff Member posts a charge to a Folio they reach');

select lives_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4e111111-1111-4111-8111-111111111111',
            'charge', 'Minibar', 12550)$$,
  'and a second');

select results_eq(
  $$select sum(amount_minor) from public.folio_lines
    where folio_id = '4e111111-1111-4111-8111-111111111111'$$,
  $$values (412550::numeric)$$,
  'the balance is the sum of the lines, and is stored nowhere');

select throws_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4e111111-1111-4111-8111-111111111111',
            'charge', 'Nothing at all', 0)$$,
  '23514', NULL,
  'a line of zero is not a posting');

select throws_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4e111111-1111-4111-8111-111111111111',
            'charge', 'Negative charge', -500)$$,
  '23514', NULL,
  'a charge is positive: making one negative is a reversal, and must say so');

select throws_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4e111111-1111-4111-8111-111111111111',
            'payment', 'Cash', 1000)$$,
  '23514', NULL,
  'there is no payment line: recording money is a workflow this slice does not build');

select throws_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description,
       amount_minor, reverses_line_id)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4e111111-1111-4111-8111-111111111111',
            'reversal', 'Free-floating reversal', -500, null)$$,
  '23514', NULL,
  'a reversal must name the line it corrects');

-- ---------------------------------------------------------------------------
-- A correction is a new line
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description,
       amount_minor, reverses_line_id)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4e111111-1111-4111-8111-111111111111',
            'reversal', 'Partial', -50, (select id from public.folio_lines where description = 'Minibar'))$$,
  '23514', NULL,
  'a reversal cancels its line exactly: a partial one is an adjustment, which is not built');

select throws_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description,
       amount_minor, reverses_line_id)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4e111111-1111-4111-8111-111111111111',
            'reversal', 'Wrong Folio', -9900, '4aaa1111-1111-4111-8111-111111111111')$$,
  '23514', NULL,
  'a reversal cannot name another Organization''s line: it is not there to be cancelled');

-- The same attempt, against a line the actor really can see, on another Folio
-- in the same Property. The trigger has no objection — it is visible and the
-- amount cancels — so this isolates the composite foreign key, which is the
-- only thing that refuses it. Confirmed by dropping the key and watching this
-- go red.
select throws_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description,
       amount_minor, reverses_line_id)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4e111111-1111-4111-8111-111111111111',
            'reversal', 'Wrong Folio', -5000, '4aaa2222-2222-4222-8222-222222222222')$$,
  '23503', NULL,
  'nor a line on another Folio, even one it can see');

select lives_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description,
       amount_minor, reverses_line_id)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4e111111-1111-4111-8111-111111111111',
            'reversal', 'Minibar was not theirs', -12550,
            (select id from public.folio_lines where description = 'Minibar'))$$,
  'a charge is corrected by reversing it');

select results_eq(
  $$select sum(amount_minor) from public.folio_lines
    where folio_id = '4e111111-1111-4111-8111-111111111111'$$,
  $$values (400000::numeric)$$,
  'and the balance follows, with both lines still there');

select results_eq(
  $$select count(*) from public.folio_lines
    where folio_id = '4e111111-1111-4111-8111-111111111111'$$,
  $$values (3::bigint)$$,
  'nothing was removed to make that true');

select throws_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description,
       amount_minor, reverses_line_id)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4e111111-1111-4111-8111-111111111111',
            'reversal', 'Again', -12550, (select id from public.folio_lines where description = 'Minibar'))$$,
  '23505', NULL,
  'a line is reversed at most once');

-- ---------------------------------------------------------------------------
-- A posted line cannot be changed, from the runtime role
-- ---------------------------------------------------------------------------

select throws_ok(
  $$update public.folio_lines set amount_minor = 1
    where description = 'Four nights'$$,
  '42501', NULL,
  'the runtime role cannot rewrite an amount');

select throws_ok(
  $$update public.folio_lines set description = 'Something else'
    where description = 'Four nights'$$,
  '42501', NULL,
  'nor a description');

select throws_ok(
  $$delete from public.folio_lines
    where description = 'Four nights'$$,
  '42501', NULL,
  'nor remove one');

select throws_ok(
  $$delete from public.folios
    where id = '4e111111-1111-4111-8111-111111111111'$$,
  '42501', NULL,
  'nor the Folio around them');

-- ---------------------------------------------------------------------------
-- Closing, and the column grant that bounds it
-- ---------------------------------------------------------------------------

select throws_ok(
  $$update public.folios set status = 'closed'
    where id = '4e111111-1111-4111-8111-111111111111'$$,
  '23514', NULL,
  'a closed Folio without a closing date is not a state this can reach');

select lives_ok(
  $$update public.folios set status = 'closed', closed_at = now(), updated_at = now()
    where id = '4e111111-1111-4111-8111-111111111111'$$,
  'a Staff Member closes a Folio in a Property they reach');

-- lives_ok alone proves nothing: an update the policy filters to no rows also
-- raises nothing. The row afterwards is the proof.
select results_eq(
  $$select status from public.folios
    where id = '4e111111-1111-4111-8111-111111111111'$$,
  $$values ('closed')$$,
  'and the Folio is closed');

select throws_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4e111111-1111-4111-8111-111111111111',
            'charge', 'Too late', 100)$$,
  '42501', NULL,
  'a closed Folio accepts no new lines');

-- What the column grant is for, and the only thing that isolates it. The row
-- is in reach, so both halves of the policy approve; the statement is refused
-- because closing a Folio is not restating what is on it, and row-level
-- security has no way to say which columns may change.
select throws_ok(
  $$update public.folios set currency = 'USD'
    where id = '4e111111-1111-4111-8111-111111111111'$$,
  '42501', NULL,
  'closing a Folio cannot restate every amount on it by changing the currency');

select throws_ok(
  $$update public.folios set stay_id = '4f444444-4444-4444-8444-444444444444'
    where id = '4e111111-1111-4111-8111-111111111111'$$,
  '42501', NULL,
  'nor move the Folio onto somebody else''s Stay');

select throws_ok(
  $$update public.folios set property_id = '4c333333-3333-4333-8333-333333333333'$$,
  '42501', NULL,
  'nor move it to another Property');

-- ---------------------------------------------------------------------------
-- A posted line cannot be changed, from the migration role either
-- ---------------------------------------------------------------------------

-- This is the half that has already escaped once. The policies above bind
-- ranza_app and the grants say the same thing again, and neither says anything
-- to the role that runs migrations — locally a superuser, on the hosted
-- database a role with BYPASSRLS. Only the trigger does.
reset role;

select throws_ok(
  $$update public.folio_lines set amount_minor = 1$$,
  '42501', NULL,
  'the migration role cannot rewrite an amount either');

select throws_ok(
  $$delete from public.folio_lines$$,
  '42501', NULL,
  'nor remove a line');

select throws_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4e111111-1111-4111-8111-111111111111',
            'charge', 'Owner override', 100)$$,
  '42501', NULL,
  'nor post to a closed Folio: the trigger binds every role, which a policy does not');

select results_eq(
  $$select amount_minor from public.folio_lines
    where description = 'Four nights'$$,
  $$values (400000::bigint)$$,
  'and the line is exactly as it was posted');

-- ---------------------------------------------------------------------------
-- A Guest or Resident reaches nothing (ADR 0009)
-- ---------------------------------------------------------------------------

-- They reach the database through the same ranza_app role and the same
-- connection as Staff, so no grant separates them. The only thing that does is
-- that every condition on these tables resolves through
-- app.accessible_property_ids(), which needs a membership. The Folio on their
-- own Stay is deliberately included above, so this is a statement about the
-- policies and not about an empty table.
set local role ranza_app;
select app.set_request_context('43333333-3333-4333-8333-333333333333');

select is_empty('select id from public.folios',
  'a Resident reaches no Folio, not even the one on their own Stay');

select is_empty('select id from public.folio_lines',
  'and no line at all');

select throws_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4e333333-3333-4333-8333-333333333333',
            'charge', 'Self service', 100)$$,
  '42501', NULL,
  'a Resident cannot post a charge to their own Folio');

select throws_ok(
  $$insert into public.folios (organization_id, property_id, stay_id, currency)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4f444444-4444-4444-8444-444444444444', 'TRY')$$,
  '42501', NULL,
  'nor open one');

select lives_ok(
  $$update public.folios set status = 'closed', closed_at = now()$$,
  'a Resident''s closure matches nothing rather than raising');

reset role;

select results_eq(
  $$select status from public.folios
    where id = '4e333333-3333-4333-8333-333333333333'$$,
  $$values ('open')$$,
  'and their own Folio is untouched');

-- ---------------------------------------------------------------------------
-- The commercial gates apply to a write, not only to a read
-- ---------------------------------------------------------------------------

-- Reach is unchanged in all three cases below, which is the half that
-- app.accessible_property_ids() alone would have missed.

set local role ranza_app;
select app.set_request_context('41111111-1111-4111-8111-111111111111');

-- A2 is in the same Organization and reachable; it just never enabled finance.
select throws_ok(
  $$insert into public.folios (organization_id, property_id, stay_id, currency)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c333333-3333-4333-8333-333333333333',
            '4f555555-5555-4555-8555-555555555555', 'TRY')$$,
  '42501', NULL,
  'gate 3 denies the write: a Property that has not enabled finance holds no Folio');
reset role;

update public.subscriptions set status = 'suspended'
where organization_id = '4a111111-1111-4111-8111-111111111111';

set local role ranza_app;
select app.set_request_context('41111111-1111-4111-8111-111111111111');
select throws_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4e333333-3333-4333-8333-333333333333',
            'charge', 'Lapsed', 100)$$,
  '42501', NULL,
  'gate 1 denies the write: a suspended Subscription posts nothing');
reset role;

update public.subscriptions set status = 'active'
where organization_id = '4a111111-1111-4111-8111-111111111111';
update public.entitlements set status = 'revoked'
where organization_id = '4a111111-1111-4111-8111-111111111111'
  and module_key = 'billing_folios';

set local role ranza_app;
select app.set_request_context('41111111-1111-4111-8111-111111111111');
select throws_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4e333333-3333-4333-8333-333333333333',
            'charge', 'Unentitled', 100)$$,
  '42501', NULL,
  'gate 2 denies the write: without the Entitlement there is no billing');
reset role;

-- ---------------------------------------------------------------------------
-- The grants say the same thing a second way
-- ---------------------------------------------------------------------------

select is_empty(
  $$select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name in ('folios', 'folio_lines')
      and grantee = 'ranza_app' and privilege_type = 'DELETE'$$,
  'the runtime role holds no delete grant on a Folio or a line');

select is_empty(
  $$select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'folio_lines'
      and grantee = 'ranza_app' and privilege_type = 'UPDATE'$$,
  'nor any update grant on a line');

-- A third column here would be a deliberate act rather than a side effect of
-- widening a policy, which is the whole point of stating the set.
select set_eq(
  $$select column_name from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'folios'
      and grantee = 'ranza_app' and privilege_type = 'UPDATE'$$,
  array['status', 'closed_at', 'updated_at'],
  'the runtime role may update only a Folio''s status, closing date and timestamp');

-- ---------------------------------------------------------------------------
-- The backfill that closed the Folios a withdrawn check-in left open
-- ---------------------------------------------------------------------------

-- The migration itself, read from disk rather than copied. A copy would be
-- free to drift from the file it claims to test, which is the failure this
-- whole exercise is about.
\set backfill `cat prisma/migrations/20260916001900_close_ghost_folios/migration.sql`

reset role;

-- A check-in that was withdrawn before `reverseCheckIn` closed its Folio: the
-- Stay cancelled, the Folio still open, nothing posted to it.
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id,
   stay_type, status, starts_on, ends_on) values
  ('4f666666-6666-4666-8666-666666666666',
   '4a111111-1111-4111-8111-111111111111',
   '4c111111-1111-4111-8111-111111111111',
   '4d111111-1111-4111-8111-111111111111',
   'guest', 'cancelled', date '2026-10-01', date '2026-10-05');

insert into public.folios
  (id, organization_id, property_id, stay_id, currency) values
  ('4e444444-4444-4444-8444-444444444444',
   '4a111111-1111-4111-8111-111111111111',
   '4c111111-1111-4111-8111-111111111111',
   '4f666666-6666-4666-8666-666666666666', 'TRY');

select lives_ok(:'backfill',
  'the backfill runs against a database holding an empty ghost Folio');

select is(
  (select status from public.folios
    where id = '4e444444-4444-4444-8444-444444444444'),
  'closed',
  'and closes it');

-- Now the state the guard is for. It is unreachable through the application —
-- `folio_lines_postable` refuses a line on a cancelled Stay — so constructing
-- it means turning that trigger off, which is the point: the guard exists for
-- databases older than the trigger, and an assertion that cannot build the
-- state cannot test the guard.
alter table public.folio_lines disable trigger folio_lines_postable;

insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id,
   stay_type, status, starts_on, ends_on) values
  ('4f777777-7777-4777-8777-777777777777',
   '4a111111-1111-4111-8111-111111111111',
   '4c111111-1111-4111-8111-111111111111',
   '4d222222-2222-4222-8222-222222222222',
   'guest', 'cancelled', date '2026-10-01', date '2026-10-05');

insert into public.folios
  (id, organization_id, property_id, stay_id, currency) values
  ('4e555555-5555-4555-8555-555555555555',
   '4a111111-1111-4111-8111-111111111111',
   '4c111111-1111-4111-8111-111111111111',
   '4f777777-7777-4777-8777-777777777777', 'TRY');

insert into public.folio_lines
  (organization_id, property_id, folio_id, line_type, description, amount_minor)
  values ('4a111111-1111-4111-8111-111111111111',
          '4c111111-1111-4111-8111-111111111111',
          '4e555555-5555-4555-8555-555555555555',
          'charge', 'Posted before the withdrawal rules existed', 7500);

alter table public.folio_lines enable trigger folio_lines_postable;

select throws_ok(:'backfill', 'P0001', NULL,
  'the backfill refuses rather than close a Folio on a cancelled Stay that carries a line');

select is(
  (select status from public.folios
    where id = '4e555555-5555-4555-8555-555555555555'),
  'open',
  'and leaves it exactly as it was, for somebody to credit or refund');

select * from finish();
rollback;
