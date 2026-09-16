-- The first write path: who may create a Reservation, who may not, and why a
-- Unit cannot be let twice (ADR 0012).
--
-- Every earlier suite in this directory asks what a role can read. This one asks
-- what it can write, and the two are not the same question: a SELECT policy is
-- never consulted for an INSERT, so a table can be thoroughly protected against
-- reading and completely open to writing while looking correct.
--
-- Each assertion here was checked by breaking the thing it asserts — dropping
-- the WITH CHECK, widening the condition to app.accessible_property_ids(),
-- dropping the exclusion constraint — and confirming it went red. A test that
-- cannot fail is worse than no test, because it is mistaken for evidence.
begin;
select plan(42);

insert into public.users (id, email) values
  ('31111111-1111-4111-8111-111111111111', 'front-desk-a@example.test'),
  ('32222222-2222-4222-8222-222222222222', 'front-desk-b@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'front-desk-resident@example.test');

insert into public.organizations (id, name, status) values
  ('3a111111-1111-4111-8111-111111111111', 'Front Desk Organization A', 'active'),
  ('3b111111-1111-4111-8111-111111111111', 'Front Desk Organization B', 'active');

insert into public.properties (id, organization_id, name) values
  ('3c111111-1111-4111-8111-111111111111',
   '3a111111-1111-4111-8111-111111111111', 'Front Desk Property A1'),
  ('3c222222-2222-4222-8222-222222222222',
   '3b111111-1111-4111-8111-111111111111', 'Front Desk Property B1'),
  -- Same Organization as A1, so the Staff Member reaches it, but the front desk
  -- capability is never enabled on it. It exists to isolate one thing: what the
  -- UPDATE policy's WITH CHECK contributes that nothing else does.
  ('3c333333-3333-4333-8333-333333333333',
   '3a111111-1111-4111-8111-111111111111', 'Front Desk Property A2');

insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity) values
  ('3d111111-1111-4111-8111-111111111111',
   '3c111111-1111-4111-8111-111111111111',
   '3a111111-1111-4111-8111-111111111111', 'A1-101', 'room', 2),
  ('3d222222-2222-4222-8222-222222222222',
   '3c111111-1111-4111-8111-111111111111',
   '3a111111-1111-4111-8111-111111111111', 'A1-102', 'bed', 1),
  ('3d333333-3333-4333-8333-333333333333',
   '3c111111-1111-4111-8111-111111111111',
   '3a111111-1111-4111-8111-111111111111', 'A1-103', 'room', 2),
  ('3d444444-4444-4444-8444-444444444444',
   '3c111111-1111-4111-8111-111111111111',
   '3a111111-1111-4111-8111-111111111111', 'A1-104', 'room', 2),
  ('3d555555-5555-4555-8555-555555555555',
   '3c222222-2222-4222-8222-222222222222',
   '3b111111-1111-4111-8111-111111111111', 'B1-201', 'suite', 4),
  ('3d666666-6666-4666-8666-666666666666',
   '3c333333-3333-4333-8333-333333333333',
   '3a111111-1111-4111-8111-111111111111', 'A2-101', 'room', 2);

insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('3a111111-1111-4111-8111-111111111111',
   '31111111-1111-4111-8111-111111111111', 'manager', 'organization_wide'),
  ('3b111111-1111-4111-8111-111111111111',
   '32222222-2222-4222-8222-222222222222', 'manager', 'organization_wide');

insert into public.subscriptions (organization_id, status) values
  ('3a111111-1111-4111-8111-111111111111', 'active'),
  ('3b111111-1111-4111-8111-111111111111', 'active');

insert into public.entitlements (organization_id, module_key) values
  ('3a111111-1111-4111-8111-111111111111', 'front_office'),
  ('3b111111-1111-4111-8111-111111111111', 'front_office');

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('3c111111-1111-4111-8111-111111111111',
   '3a111111-1111-4111-8111-111111111111', 'front_desk', true),
  ('3c111111-1111-4111-8111-111111111111',
   '3a111111-1111-4111-8111-111111111111', 'portal_stay_overview', true),
  ('3c222222-2222-4222-8222-222222222222',
   '3b111111-1111-4111-8111-111111111111', 'front_desk', true);

insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id,
   guest_name, stay_type, status, starts_on, ends_on) values
  ('3e111111-1111-4111-8111-111111111111',
   '3a111111-1111-4111-8111-111111111111',
   '3c111111-1111-4111-8111-111111111111',
   '3d111111-1111-4111-8111-111111111111',
   'Ada Lovelace', 'guest', 'confirmed', date '2026-10-01', date '2026-10-04'),
  ('3e222222-2222-4222-8222-222222222222',
   '3b111111-1111-4111-8111-111111111111',
   '3c222222-2222-4222-8222-222222222222',
   '3d555555-5555-4555-8555-555555555555',
   'Grace Hopper', 'guest', 'confirmed', date '2026-10-01', date '2026-10-04'),
  ('3e333333-3333-4333-8333-333333333333',
   '3a111111-1111-4111-8111-111111111111',
   '3c111111-1111-4111-8111-111111111111',
   '3d333333-3333-4333-8333-333333333333',
   'Katherine Johnson', 'resident', 'confirmed',
   date '2026-10-01', date '2026-10-05');

-- The Resident's own current Stay, which is the whole of their reach (ADR 0009).
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, user_id,
   stay_type, status, starts_on, ends_on) values
  ('3f111111-1111-4111-8111-111111111111',
   '3a111111-1111-4111-8111-111111111111',
   '3c111111-1111-4111-8111-111111111111',
   '3d222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333',
   'resident', 'in_house', date '2026-09-01', null);

-- ---------------------------------------------------------------------------
-- No request context: the same answer for reading and for writing
-- ---------------------------------------------------------------------------

set local role ranza_app;

select is_empty('select id from public.reservations',
  'without request context no Reservation is visible');

-- The read above fails safe by returning nothing, which looks like missing
-- data. The write fails loudly, because there is no empty result to hide in.
select throws_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_name, stay_type, starts_on, ends_on)
    values ('3a111111-1111-4111-8111-111111111111',
            '3c111111-1111-4111-8111-111111111111',
            '3d111111-1111-4111-8111-111111111111',
            'Nobody', 'guest', date '2026-11-01', date '2026-11-03')$$,
  '42501', NULL,
  'without request context no Reservation can be written');

-- ---------------------------------------------------------------------------
-- A Staff Member at Organization A
-- ---------------------------------------------------------------------------

select app.set_request_context('31111111-1111-4111-8111-111111111111');

select set_eq(
  'select guest_name from public.reservations',
  array['Ada Lovelace', 'Katherine Johnson'],
  'a Staff Member sees the Reservations of a Property they reach, and no others');

select lives_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_name, stay_type, starts_on, ends_on)
    values ('3a111111-1111-4111-8111-111111111111',
            '3c111111-1111-4111-8111-111111111111',
            '3d111111-1111-4111-8111-111111111111',
            'Hedy Lamarr', 'guest', date '2026-11-01', date '2026-11-03')$$,
  'a Staff Member creates a Reservation in a Property they reach');

-- The row this refuses is entirely self-consistent: Organization B really does
-- own that Property and that Unit. Only the WITH CHECK stops it.
select throws_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_name, stay_type, starts_on, ends_on)
    values ('3b111111-1111-4111-8111-111111111111',
            '3c222222-2222-4222-8222-222222222222',
            '3d555555-5555-4555-8555-555555555555',
            'Intruder', 'guest', date '2026-11-01', date '2026-11-03')$$,
  '42501', NULL,
  'a Reservation cannot be written into another Organization''s Property');

-- Relabelling the row with an Organization the actor does belong to changes
-- nothing: the policy reads property_id, and that Property is still out of
-- reach. The policy refuses before the foreign key is ever consulted.
select throws_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_name, stay_type, starts_on, ends_on)
    values ('3a111111-1111-4111-8111-111111111111',
            '3c222222-2222-4222-8222-222222222222',
            '3d555555-5555-4555-8555-555555555555',
            'Intruder', 'guest', date '2026-11-01', date '2026-11-03')$$,
  '42501', NULL,
  'supplying a reachable organization_id does not open another Property');

-- And the other way round, which is the case the policy lets through: a
-- Property the actor really does reach, claimed for an Organization that does
-- not own it. Here the composite foreign key is the thing that refuses, which
-- is why both layers exist.
select throws_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_name, stay_type, starts_on, ends_on)
    values ('3b111111-1111-4111-8111-111111111111',
            '3c111111-1111-4111-8111-111111111111',
            '3d111111-1111-4111-8111-111111111111',
            'Intruder', 'guest', date '2026-11-01', date '2026-11-03')$$,
  '23503', NULL,
  'a Property cannot be relabelled into another Organization');

select throws_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_name, stay_type, starts_on, ends_on)
    values ('3a111111-1111-4111-8111-111111111111',
            '3c111111-1111-4111-8111-111111111111',
            '3d555555-5555-4555-8555-555555555555',
            'Intruder', 'guest', date '2026-11-01', date '2026-11-03')$$,
  '23503', NULL,
  'a Unit from another Property cannot be reserved');

select lives_ok(
  $$update public.reservations set status = 'cancelled'
    where id = '3e111111-1111-4111-8111-111111111111'$$,
  'a Staff Member updates a Reservation in a Property they reach');

-- An UPDATE bounded by USING does not raise; it matches nothing. The proof it
-- was bounded is therefore the row afterwards, asserted below as the owner.
select lives_ok(
  $$update public.reservations set status = 'cancelled'
    where id = '3e222222-2222-4222-8222-222222222222'$$,
  'updating another Organization''s Reservation raises nothing');

-- The one thing the UPDATE policy's WITH CHECK contributes that nothing else
-- does, which is narrower than it first looks and was worth finding out.
--
-- USING is evaluated against the row as it was, and Property A1 passes every
-- gate. The SELECT policy is evaluated against the row as it will be, and
-- Property A2 is in the same Organization so it is reachable. Only WITH CHECK
-- asks whether the *destination* Property has the front desk capability — and
-- A2 never enabled it. Drop the WITH CHECK and this update succeeds.
select throws_ok(
  $$update public.reservations
       set property_id = '3c333333-3333-4333-8333-333333333333',
           accommodation_unit_id = '3d666666-6666-4666-8666-666666666666'
     where id = '3e111111-1111-4111-8111-111111111111'$$,
  '42501', NULL,
  'a Reservation cannot be moved to a Property that has no front desk');

select throws_ok(
  $$delete from public.reservations
    where id = '3e111111-1111-4111-8111-111111111111'$$,
  '42501', NULL,
  'a Reservation is never deleted, it is cancelled');

select throws_ok(
  $$delete from public.stays$$,
  '42501', NULL,
  'the runtime role cannot delete a Stay');

reset role;

select results_eq(
  $$select status from public.reservations
    where id = '3e222222-2222-4222-8222-222222222222'$$,
  $$values ('confirmed')$$,
  'the other Organization''s Reservation was not changed');

-- ---------------------------------------------------------------------------
-- A Guest or Resident writes nothing (ADR 0009)
-- ---------------------------------------------------------------------------

-- They reach the database through the same ranza_app role and the same
-- connection as Staff, so no grant separates them. The only thing that does is
-- that every write condition resolves through app.accessible_property_ids(),
-- which needs a membership. An absence is exactly the kind of guarantee that
-- quietly stops being true, so it is asserted rather than reasoned about.
set local role ranza_app;
select app.set_request_context('33333333-3333-4333-8333-333333333333');

select is_empty('select id from public.reservations',
  'a Resident reaches no Reservation at all');

select throws_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_name, stay_type, starts_on, ends_on)
    values ('3a111111-1111-4111-8111-111111111111',
            '3c111111-1111-4111-8111-111111111111',
            '3d111111-1111-4111-8111-111111111111',
            'Self Service', 'guest', date '2026-11-01', date '2026-11-03')$$,
  '42501', NULL,
  'a Resident cannot create a Reservation, not even in their own Property');

select throws_ok(
  $$insert into public.stays
      (organization_id, property_id, accommodation_unit_id, user_id,
       stay_type, status, starts_on, ends_on)
    values ('3a111111-1111-4111-8111-111111111111',
            '3c111111-1111-4111-8111-111111111111',
            '3d111111-1111-4111-8111-111111111111',
            '33333333-3333-4333-8333-333333333333',
            'resident', 'in_house', date '2026-11-01', date '2026-11-03')$$,
  '42501', NULL,
  'a Resident cannot check themselves in');

-- And cannot end one either. This refuses quietly rather than loudly: the
-- UPDATE policy's USING excludes every row a Resident can see, so the statement
-- matches nothing instead of raising. That is why the assertion is lives_ok
-- followed by the row — a throws_ok here would pass for a Resident who had been
-- granted the capability and denied by something else entirely.
select lives_ok(
  $$update public.stays set status = 'departed'$$,
  'a Resident''s check-out matches nothing rather than raising');

select results_eq(
  $$select status from public.stays
    where id = '3f111111-1111-4111-8111-111111111111'$$,
  $$values ('in_house')$$,
  'and their own Stay is untouched: a Resident cannot check themselves out');

reset role;

-- ---------------------------------------------------------------------------
-- Availability is a constraint, not a query
-- ---------------------------------------------------------------------------

-- Dates from here down are relative to the Property's own today rather than
-- fixed, because `stays_insert_front_desk` now refuses an `in_house` Stay that
-- has not started yet. Fixed dates made checking somebody in weeks early the
-- normal case in this file, which is how the bug that rule closes survived a
-- suite that was otherwise asserting the right things.

set local role ranza_app;
select app.set_request_context('31111111-1111-4111-8111-111111111111');

select lives_ok(
  $$insert into public.stays
      (organization_id, property_id, accommodation_unit_id,
       stay_type, status, starts_on, ends_on)
    values ('3a111111-1111-4111-8111-111111111111',
            '3c111111-1111-4111-8111-111111111111',
            '3d333333-3333-4333-8333-333333333333',
            'guest', 'in_house',
            app.property_today('3c111111-1111-4111-8111-111111111111'),
            app.property_today('3c111111-1111-4111-8111-111111111111') + 4)$$,
  'a Unit that is free can be let');

select throws_ok(
  $$insert into public.stays
      (organization_id, property_id, accommodation_unit_id,
       stay_type, status, starts_on, ends_on)
    values ('3a111111-1111-4111-8111-111111111111',
            '3c111111-1111-4111-8111-111111111111',
            '3d333333-3333-4333-8333-333333333333',
            'guest', 'reserved',
            app.property_today('3c111111-1111-4111-8111-111111111111') + 3,
            app.property_today('3c111111-1111-4111-8111-111111111111') + 5)$$,
  '23P01', NULL,
  'the same Unit cannot be let twice over overlapping nights');

-- '[)' rather than '[]': the departure date is the next arrival's date, which
-- is how a front desk already counts nights.
select lives_ok(
  $$insert into public.stays
      (organization_id, property_id, accommodation_unit_id,
       stay_type, status, starts_on, ends_on)
    values ('3a111111-1111-4111-8111-111111111111',
            '3c111111-1111-4111-8111-111111111111',
            '3d333333-3333-4333-8333-333333333333',
            'guest', 'reserved',
            app.property_today('3c111111-1111-4111-8111-111111111111') + 4,
            app.property_today('3c111111-1111-4111-8111-111111111111') + 7)$$,
  'an arrival on the previous Guest''s departure date is not a clash');

-- Partial on status, which is what lets a Unit be re-let without deleting the
-- history of who was in it (blueprint 7.4).
select lives_ok(
  $$insert into public.stays
      (organization_id, property_id, accommodation_unit_id,
       stay_type, status, starts_on, ends_on)
    values ('3a111111-1111-4111-8111-111111111111',
            '3c111111-1111-4111-8111-111111111111',
            '3d333333-3333-4333-8333-333333333333',
            'guest', 'cancelled',
            app.property_today('3c111111-1111-4111-8111-111111111111') + 1,
            app.property_today('3c111111-1111-4111-8111-111111111111') + 2)$$,
  'a cancelled Stay keeps its dates and holds nothing');

-- The Resident's Stay on A1-102 is open-ended, so it holds that Unit from its
-- start date onwards rather than for a period somebody had to guess.
select throws_ok(
  $$insert into public.stays
      (organization_id, property_id, accommodation_unit_id,
       stay_type, status, starts_on, ends_on)
    values ('3a111111-1111-4111-8111-111111111111',
            '3c111111-1111-4111-8111-111111111111',
            '3d222222-2222-4222-8222-222222222222',
            'guest', 'reserved', date '2027-06-01', date '2027-06-03')$$,
  '23P01', NULL,
  'an open-ended Stay holds its Unit indefinitely');

-- ---------------------------------------------------------------------------
-- One Reservation, at most one Stay
-- ---------------------------------------------------------------------------

select lives_ok(
  $$insert into public.stays
      (organization_id, property_id, accommodation_unit_id, reservation_id,
       stay_type, status, starts_on, ends_on)
    values ('3a111111-1111-4111-8111-111111111111',
            '3c111111-1111-4111-8111-111111111111',
            '3d444444-4444-4444-8444-444444444444',
            '3e333333-3333-4333-8333-333333333333',
            'resident', 'in_house',
            app.property_today('3c111111-1111-4111-8111-111111111111'),
            app.property_today('3c111111-1111-4111-8111-111111111111') + 4)$$,
  'a Reservation becomes a Stay');

-- A different Unit and different nights, so the exclusion constraint has no
-- opinion and stays_reservation_id_property_id_organization_id_key is the only
-- thing that can refuse. Confirmed by dropping it and watching this go red.
select throws_ok(
  $$insert into public.stays
      (organization_id, property_id, accommodation_unit_id, reservation_id,
       stay_type, status, starts_on, ends_on)
    values ('3a111111-1111-4111-8111-111111111111',
            '3c111111-1111-4111-8111-111111111111',
            '3d111111-1111-4111-8111-111111111111',
            '3e333333-3333-4333-8333-333333333333',
            'resident', 'in_house',
            app.property_today('3c111111-1111-4111-8111-111111111111'),
            app.property_today('3c111111-1111-4111-8111-111111111111') + 4)$$,
  '23505', NULL,
  'checking the same Reservation in twice is unrepresentable');

-- ---------------------------------------------------------------------------
-- In house from the day it starts, and not before
-- ---------------------------------------------------------------------------

-- A Reservation weeks out could be checked in, producing an `in_house` Stay
-- with future dates; a second Guest could then take the same Unit tonight,
-- because the two ranges do not overlap and the exclusion constraint has no
-- opinion about which of them is real. The module refuses this on a predicate
-- so the front desk gets a refusal; this is the half that refuses anyway.
--
-- Checked by removing the clause from the policy and watching all three go red.
select throws_ok(
  $$insert into public.stays
      (organization_id, property_id, accommodation_unit_id,
       stay_type, status, starts_on, ends_on)
    values ('3a111111-1111-4111-8111-111111111111',
            '3c111111-1111-4111-8111-111111111111',
            '3d111111-1111-4111-8111-111111111111',
            'guest', 'in_house',
            app.property_today('3c111111-1111-4111-8111-111111111111') + 21,
            app.property_today('3c111111-1111-4111-8111-111111111111') + 24)$$,
  '42501', NULL,
  'a Stay cannot be in house before the day it starts');

-- The rule is about being in house, not about planning. A Reservation for next
-- month is the thing a `reserved` Stay exists to express, and constraining its
-- dates would forbid it.
select lives_ok(
  $$insert into public.stays
      (organization_id, property_id, accommodation_unit_id,
       stay_type, status, starts_on, ends_on)
    values ('3a111111-1111-4111-8111-111111111111',
            '3c111111-1111-4111-8111-111111111111',
            '3d111111-1111-4111-8111-111111111111',
            'guest', 'reserved',
            app.property_today('3c111111-1111-4111-8111-111111111111') + 21,
            app.property_today('3c111111-1111-4111-8111-111111111111') + 24)$$,
  'but a Stay may be reserved for nights that have not arrived');

-- The same bug through the other door. Without the clause on the UPDATE
-- policy's WITH CHECK, the row above could simply be moved to `in_house`.
select throws_ok(
  $$update public.stays
       set status = 'in_house'
     where accommodation_unit_id = '3d111111-1111-4111-8111-111111111111'
       and status = 'reserved'$$,
  '42501', NULL,
  'nor be moved to in house while its first night is still in the future');

-- ---------------------------------------------------------------------------
-- Check-out, and the column-level grant that bounds it
-- ---------------------------------------------------------------------------

-- The Resident's Stay on A1-102 is in house and open-ended, so it is not due —
-- but a Staff Member may still end it, which is what a departure is.
select lives_ok(
  $$update public.stays
       set status = 'departed', ends_on = app.property_today('3c111111-1111-4111-8111-111111111111')
     where id = '3f111111-1111-4111-8111-111111111111'$$,
  'a Staff Member ends a Stay in a Property they reach');

-- lives_ok alone proves nothing here: an update the policy filters to no rows
-- also raises nothing. Dropping the UPDATE policy left the assertion above
-- green, which is what this one is for.
select results_eq(
  $$select status, ends_on from public.stays
    where id = '3f111111-1111-4111-8111-111111111111'$$,
  $$select 'departed', app.property_today('3c111111-1111-4111-8111-111111111111')$$,
  'and the Stay is departed, dated the day they left');

-- What the column grant is for, and the only thing that isolates it. The row is
-- in reach, so both halves of the policy approve it; the statement is refused
-- because a check-out is not a room move, and row-level security has no way to
-- say which columns may change.
select throws_ok(
  $$update public.stays
       set accommodation_unit_id = '3d333333-3333-4333-8333-333333333333'
     where id = '3f111111-1111-4111-8111-111111111111'$$,
  '42501', NULL,
  'a Stay cannot be moved to another Unit: that is a room move, not a check-out');

select throws_ok(
  $$update public.stays set starts_on = date '2020-01-01'$$,
  '42501', NULL,
  'a Stay''s arrival date cannot be rewritten');

select throws_ok(
  $$update public.stays
       set property_id = '3c333333-3333-4333-8333-333333333333'$$,
  '42501', NULL,
  'a Stay cannot be moved to another Property');

-- Departure frees the Unit: the exclusion constraint is partial on status, so
-- the same Unit can be let again the same day.
select lives_ok(
  $$insert into public.stays
      (organization_id, property_id, accommodation_unit_id,
       stay_type, status, starts_on, ends_on)
    values ('3a111111-1111-4111-8111-111111111111',
            '3c111111-1111-4111-8111-111111111111',
            '3d222222-2222-4222-8222-222222222222',
            'guest', 'in_house',
            app.property_today('3c111111-1111-4111-8111-111111111111'),
            app.property_today('3c111111-1111-4111-8111-111111111111') + 5)$$,
  'a departed Stay releases its Unit for the same nights');

reset role;

-- ---------------------------------------------------------------------------
-- The commercial gates apply to a write, not only to a read
-- ---------------------------------------------------------------------------

-- This is the half that app.accessible_property_ids() alone would have missed:
-- reach is unchanged in both cases below, and the write must still be refused.
update public.subscriptions set status = 'suspended'
where organization_id = '3a111111-1111-4111-8111-111111111111';

set local role ranza_app;
select app.set_request_context('31111111-1111-4111-8111-111111111111');
select throws_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_name, stay_type, starts_on, ends_on)
    values ('3a111111-1111-4111-8111-111111111111',
            '3c111111-1111-4111-8111-111111111111',
            '3d111111-1111-4111-8111-111111111111',
            'Lapsed', 'guest', date '2026-12-01', date '2026-12-03')$$,
  '42501', NULL,
  'gate 1 denies the write: a suspended Subscription creates nothing');

-- And what the USING half contributes, isolated. The row is still reachable —
-- reach did not change — so the SELECT policy has no objection, and WITH CHECK
-- would refuse it loudly. USING refuses it quietly instead, by matching no rows
-- at all. Remove USING and this raises rather than doing nothing, which is what
-- makes the assertion lives_ok rather than a row count.
select lives_ok(
  $$update public.reservations set status = 'cancelled'
    where id = '3e333333-3333-4333-8333-333333333333'$$,
  'gate 1 denies the update by matching nothing, not by raising');

select results_eq(
  $$select status from public.reservations
    where id = '3e333333-3333-4333-8333-333333333333'$$,
  $$values ('confirmed')$$,
  'and the Reservation is unchanged');
reset role;

update public.subscriptions set status = 'active'
where organization_id = '3a111111-1111-4111-8111-111111111111';
update public.property_capabilities set enabled = false
where property_id = '3c111111-1111-4111-8111-111111111111'
  and capability_key = 'front_desk';

set local role ranza_app;
select app.set_request_context('31111111-1111-4111-8111-111111111111');
select throws_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_name, stay_type, starts_on, ends_on)
    values ('3a111111-1111-4111-8111-111111111111',
            '3c111111-1111-4111-8111-111111111111',
            '3d111111-1111-4111-8111-111111111111',
            'Disabled', 'guest', date '2026-12-01', date '2026-12-03')$$,
  '42501', NULL,
  'gate 3 denies the write: a Property without the capability creates nothing');
reset role;

-- ---------------------------------------------------------------------------
-- The grants say the same thing a second way
-- ---------------------------------------------------------------------------

select is_empty(
  $$select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'reservations'
      and grantee = 'ranza_app' and privilege_type = 'DELETE'$$,
  'the runtime role holds no delete grant on reservations');

select is_empty(
  $$select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'stays'
      and grantee = 'ranza_app' and privilege_type = 'DELETE'$$,
  'the runtime role holds no delete grant on stays');

-- The grant says a second way what the statements above proved: the update
-- reaches exactly two columns, and adding a third is a deliberate act rather
-- than a side effect of widening a policy.
select set_eq(
  $$select column_name from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'stays'
      and grantee = 'ranza_app' and privilege_type = 'UPDATE'$$,
  array['status', 'ends_on', 'updated_at'],
  'the runtime role may update only a Stay''s status, end date and timestamp');

select * from finish();
rollback;
