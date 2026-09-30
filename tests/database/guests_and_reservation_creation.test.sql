-- Guests, and the nights a Reservation holds (ADR 0024).
--
-- Two things are new here and each is a place this repository has not been
-- before. `guests` is the first tenant-owned table that belongs to an
-- Organization rather than to a Property, so its write policy cannot name one
-- and goes through app.can_use_capability_in_organization() instead — a second
-- gate surface, which is exactly the kind of thing that is correct on the day it
-- is written and quietly wrong a month later. And `reservations` now refuses to
-- let one Unit be sold twice, which ADR 0012 deliberately left out while nothing
-- created a Reservation.
--
-- Every assertion below was checked by breaking the thing it asserts — dropping
-- the WITH CHECK, replacing the helper with app.accessible_organization_ids(),
-- dropping the exclusion constraint, dropping the column grant — and confirming
-- it went red. A test that cannot fail is worse than no test, because it is
-- mistaken for evidence.
begin;
select plan(49);

insert into public.users (id, email) values
  ('41111111-1111-4111-8111-111111111111', 'guest-staff-a@example.test'),
  ('42222222-2222-4222-8222-222222222222', 'guest-staff-b@example.test'),
  ('43333333-3333-4333-8333-333333333333', 'guest-resident@example.test'),
  ('44444444-4444-4444-8444-444444444444', 'guest-staff-narrow@example.test');

insert into public.organizations (id, name, status) values
  ('4a111111-1111-4111-8111-111111111111', 'Guest Organization A', 'active'),
  ('4b111111-1111-4111-8111-111111111111', 'Guest Organization B', 'active');

insert into public.properties (id, organization_id, name) values
  ('4c111111-1111-4111-8111-111111111111',
   '4a111111-1111-4111-8111-111111111111', 'Guest Property A1'),
  -- Organization A's second Property, with no front desk and nobody assigned to
  -- it. It is what makes "Organization-wide" a claim rather than a coincidence.
  ('4c222222-2222-4222-8222-222222222222',
   '4a111111-1111-4111-8111-111111111111', 'Guest Property A2'),
  ('4c333333-3333-4333-8333-333333333333',
   '4b111111-1111-4111-8111-111111111111', 'Guest Property B1');

insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity) values
  ('4d111111-1111-4111-8111-111111111111',
   '4c111111-1111-4111-8111-111111111111',
   '4a111111-1111-4111-8111-111111111111', 'GA1-101', 'room', 2),
  ('4d222222-2222-4222-8222-222222222222',
   '4c111111-1111-4111-8111-111111111111',
   '4a111111-1111-4111-8111-111111111111', 'GA1-102', 'room', 2),
  ('4d333333-3333-4333-8333-333333333333',
   '4c111111-1111-4111-8111-111111111111',
   '4a111111-1111-4111-8111-111111111111', 'GA1-103', 'room', 2),
  ('4d444444-4444-4444-8444-444444444444',
   '4c333333-3333-4333-8333-333333333333',
   '4b111111-1111-4111-8111-111111111111', 'GB1-201', 'room', 2);

insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('4a111111-1111-4111-8111-111111111111',
   '41111111-1111-4111-8111-111111111111', 'manager', 'organization_wide'),
  ('4b111111-1111-4111-8111-111111111111',
   '42222222-2222-4222-8222-222222222222', 'manager', 'organization_wide'),
  -- Reaches one of Organization A's two Properties and no more.
  ('4a111111-1111-4111-8111-111111111111',
   '44444444-4444-4444-8444-444444444444', 'front_desk', 'assigned_properties');

insert into public.property_assignments (property_id, organization_id, user_id)
values
  ('4c111111-1111-4111-8111-111111111111',
   '4a111111-1111-4111-8111-111111111111',
   '44444444-4444-4444-8444-444444444444');

insert into public.subscriptions (organization_id, status) values
  ('4a111111-1111-4111-8111-111111111111', 'active'),
  ('4b111111-1111-4111-8111-111111111111', 'active');

insert into public.entitlements (organization_id, module_key) values
  ('4a111111-1111-4111-8111-111111111111', 'front_office'),
  ('4b111111-1111-4111-8111-111111111111', 'front_office');

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('4c111111-1111-4111-8111-111111111111',
   '4a111111-1111-4111-8111-111111111111', 'front_desk', true),
  ('4c111111-1111-4111-8111-111111111111',
   '4a111111-1111-4111-8111-111111111111', 'portal_stay_overview', true),
  ('4c333333-3333-4333-8333-333333333333',
   '4b111111-1111-4111-8111-111111111111', 'front_desk', true);

insert into public.guests (id, organization_id, full_name, email) values
  ('4e111111-1111-4111-8111-111111111111',
   '4a111111-1111-4111-8111-111111111111', 'Ada Lovelace', 'ada@example.test'),
  ('4e222222-2222-4222-8222-222222222222',
   '4a111111-1111-4111-8111-111111111111', 'Kerem Yılmaz', null),
  ('4e333333-3333-4333-8333-333333333333',
   '4b111111-1111-4111-8111-111111111111', 'Grace Hopper', 'grace@example.test');

-- The Resident's own current Stay, which is the whole of their reach (ADR 0009).
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, user_id,
   stay_type, status, starts_on, ends_on) values
  ('4f111111-1111-4111-8111-111111111111',
   '4a111111-1111-4111-8111-111111111111',
   '4c111111-1111-4111-8111-111111111111',
   '4d333333-3333-4333-8333-333333333333',
   '43333333-3333-4333-8333-333333333333',
   'resident', 'in_house', date '2026-09-01', null);

-- ---------------------------------------------------------------------------
-- The runtime role with nobody acting
-- ---------------------------------------------------------------------------

set local role ranza_app;

select is_empty(
  'select id from public.guests',
  'without a request context no Guest is readable');

select throws_ok(
  $$insert into public.guests (organization_id, full_name)
    values ('4a111111-1111-4111-8111-111111111111', 'Nobody')$$,
  '42501', NULL,
  'without a request context no Guest can be recorded');

-- ---------------------------------------------------------------------------
-- A Staff Member of Organization A
-- ---------------------------------------------------------------------------

select app.set_request_context('41111111-1111-4111-8111-111111111111');

select set_eq(
  'select full_name from public.guests',
  array['Ada Lovelace', 'Kerem Yılmaz'],
  'a Staff Member reads their own Organization''s Guests and no others');

select lives_ok(
  $$insert into public.guests (organization_id, full_name, email)
    values ('4a111111-1111-4111-8111-111111111111',
            'Hedy Lamarr', 'hedy@example.test')$$,
  'a Staff Member records a Guest for their own Organization');

-- The row is entirely self-consistent — Organization B exists and is active.
-- Only the write policy stops it, and only because the acting Staff Member
-- reaches no Property of it.
select throws_ok(
  $$insert into public.guests (organization_id, full_name)
    values ('4b111111-1111-4111-8111-111111111111', 'Intruder')$$,
  '42501', NULL,
  'a Guest cannot be recorded for another Organization');

select throws_ok(
  $$delete from public.guests
    where id = '4e111111-1111-4111-8111-111111111111'$$,
  '42501', NULL,
  'a Guest is never deleted');

-- A policy bounds rows and a grant bounds columns (ADR 0012). The policy above
-- permits this row; the missing column grant is the only thing that does not.
select throws_ok(
  $$update public.guests set full_name = 'Renamed'
    where id = '4e111111-1111-4111-8111-111111111111'$$,
  '42501', NULL,
  'a Guest''s name cannot be edited through the runtime role');

select throws_ok(
  $$update public.guests set email = 'elsewhere@example.test'
    where id = '4e111111-1111-4111-8111-111111111111'$$,
  '42501', NULL,
  'a Guest''s email cannot be edited through the runtime role');

-- The one column that is granted, and the only statement that assigns it: the
-- no-op conflict update in identifyGuestWithin(), which exists so RETURNING
-- gives back a Guest the Organization already had.
select lives_ok(
  $$insert into public.guests (organization_id, full_name, email)
    values ('4a111111-1111-4111-8111-111111111111',
            'Ada L', 'ada@example.test')
    on conflict (organization_id, email) where email is not null
      do update set updated_at = public.guests.updated_at
    returning id$$,
  'booking a Guest already on file reaches the existing row');

select is(
  (select full_name from public.guests
    where id = '4e111111-1111-4111-8111-111111111111'),
  'Ada Lovelace',
  'and leaves the profile alone: a second booking is not an edit');

select throws_ok(
  $$insert into public.guests (organization_id, full_name, email)
    values ('4a111111-1111-4111-8111-111111111111',
            'Shouty', 'ADA@example.test')$$,
  '23514', NULL,
  'an address is stored normalized, so two spellings cannot become two people');

-- Partial on purpose: a Guest with no email is not a key, and two people who
-- gave none must not collide. Deciding they are the same person is the
-- automatic merge blueprint 18.7 forbids.
select lives_ok(
  $$insert into public.guests (organization_id, full_name)
    values ('4a111111-1111-4111-8111-111111111111', 'Anonymous One')$$,
  'a second Guest with no email is a second person');

select is(
  (select pg_get_expr(indpred, indrelid) from pg_index
    where indexrelid = 'guests_organization_email_key'::regclass),
  '(email IS NOT NULL)',
  'the Guest email index is partial on the address being present');

-- ---------------------------------------------------------------------------
-- A Staff Member who reaches one of Organization A's two Properties
-- ---------------------------------------------------------------------------

select app.set_request_context('44444444-4444-4444-8444-444444444444');

-- The deliberate widening in ADR 0024, asserted rather than assumed. A Guest is
-- not attached to a Property, so an assignment cannot bound this read — and a
-- front desk that could not find the person who stayed at the other Property
-- would create the duplicate blueprint 18.7 exists to prevent.
select is(
  (select count(*)::int from public.guests
    where id = '4e111111-1111-4111-8111-111111111111'),
  1,
  'a Staff Member assigned to one Property reaches the Organization''s Guests');

select is(
  (select count(*)::int from public.guests
    where organization_id = '4b111111-1111-4111-8111-111111111111'),
  0,
  'and reaches none of another Organization''s');

-- ---------------------------------------------------------------------------
-- A Resident
-- ---------------------------------------------------------------------------

select app.set_request_context('43333333-3333-4333-8333-333333333333');

-- Not a rule written for them: app.accessible_organization_ids() needs an
-- organization_membership, and a Resident has none (ADR 0009). An absence is
-- the kind of guarantee that quietly stops being true, so it is asserted.
select is_empty(
  'select id from public.guests',
  'a Resident reaches no Guest at all');

select throws_ok(
  $$insert into public.guests (organization_id, full_name)
    values ('4a111111-1111-4111-8111-111111111111', 'Self Service')$$,
  '42501', NULL,
  'a Resident cannot record a Guest');

-- ---------------------------------------------------------------------------
-- A Reservation holds its nights
-- ---------------------------------------------------------------------------

select app.set_request_context('41111111-1111-4111-8111-111111111111');

-- The composite foreign key, not a check: a Reservation naming another
-- Organization's Guest is unrepresentable rather than refused by a policy that
-- somebody could widen.
select throws_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_id, stay_type, status, starts_on, ends_on)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4d111111-1111-4111-8111-111111111111',
            '4e333333-3333-4333-8333-333333333333',
            'guest', 'confirmed', date '2026-11-01', date '2026-11-04')$$,
  '23503', NULL,
  'a Reservation cannot name another Organization''s Guest');

select lives_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_id, stay_type, status, starts_on, ends_on)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4d111111-1111-4111-8111-111111111111',
            '4e111111-1111-4111-8111-111111111111',
            'guest', 'confirmed', date '2026-11-01', date '2026-11-04')$$,
  'a front desk takes a booking');

select throws_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_id, stay_type, status, starts_on, ends_on)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4d111111-1111-4111-8111-111111111111',
            '4e222222-2222-4222-8222-222222222222',
            'guest', 'confirmed', date '2026-11-03', date '2026-11-06')$$,
  '23P01', NULL,
  'a second confirmed Reservation cannot overlap on one Unit');

-- Half-open, so the departure date is the next arrival's date. This is how a
-- front desk already counts nights, and getting it wrong would lose a night's
-- revenue on every changeover.
select lives_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_id, stay_type, status, starts_on, ends_on)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4d111111-1111-4111-8111-111111111111',
            '4e222222-2222-4222-8222-222222222222',
            'guest', 'confirmed', date '2026-11-04', date '2026-11-06')$$,
  'somebody may arrive on the day the last Guest leaves');

-- `requested` is somebody asking, not an allocation. Refusing a second enquiry
-- would be an availability policy nobody has specified (blueprint section 13).
select lives_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_id, stay_type, status, starts_on, ends_on)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4d111111-1111-4111-8111-111111111111',
            '4e222222-2222-4222-8222-222222222222',
            'guest', 'requested', date '2026-11-01', date '2026-11-04')$$,
  'a requested Reservation holds nothing');

-- The hole the exclusion constraint cannot see: an empty daterange overlaps
-- nothing, so without this a zero-night booking would hold no Unit while
-- looking exactly like one that did.
select throws_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_id, stay_type, status, starts_on, ends_on)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4d222222-2222-4222-8222-222222222222',
            '4e222222-2222-4222-8222-222222222222',
            'guest', 'confirmed', date '2026-11-01', date '2026-11-01')$$,
  '23514', NULL,
  'a Reservation covers at least one night');

-- Checking in hands the Unit to the Stay, which is the thing that knows about
-- an early departure. Without this a room could not be re-let the morning its
-- Guest left, because the Reservation would still be holding nights nobody was
-- in. Asserted because it is the clause somebody widening this constraint would
-- take out first.
select lives_ok(
  $$update public.reservations set status = 'checked_in'
    where guest_id = '4e111111-1111-4111-8111-111111111111'
      and starts_on = date '2026-11-01'$$,
  'a checked-in Reservation hands its nights to its Stay');

select lives_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_id, stay_type, status, starts_on, ends_on)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4d111111-1111-4111-8111-111111111111',
            '4e222222-2222-4222-8222-222222222222',
            'guest', 'confirmed', date '2026-11-01', date '2026-11-04')$$,
  'so the nights it was holding take another booking');

-- Cancelled keeps its dates and stops holding the Unit, which is what makes it
-- re-lettable without deleting anything (blueprint 7.4).
select lives_ok(
  $$update public.reservations set status = 'cancelled'
    where guest_id = '4e222222-2222-4222-8222-222222222222'
      and starts_on = date '2026-11-01'$$,
  'a Reservation is cancelled, never removed');

select lives_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_id, stay_type, status, starts_on, ends_on)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c111111-1111-4111-8111-111111111111',
            '4d111111-1111-4111-8111-111111111111',
            '4e222222-2222-4222-8222-222222222222',
            'guest', 'confirmed', date '2026-11-01', date '2026-11-04')$$,
  'and the nights it held are free again');

reset role;

-- Names the statuses, so a later migration that widens or drops the predicate
-- fails here rather than silently letting a Unit be sold twice. The two
-- assertions above both pass if the constraint is made total, and this one does
-- not.
select is(
  (select pg_get_constraintdef(oid) from pg_constraint
    where conname = 'reservations_no_double_booking'),
  'EXCLUDE USING gist (accommodation_unit_id WITH =, daterange(starts_on, ends_on, ''[)''::text) WITH &&) WHERE ((status = ''confirmed''::text))',
  'the double-booking constraint is partial on confirmed alone');

-- The exact set, like the one ADR 0012 asserts on `stays`. Adding a column here
-- has to be a deliberate act rather than a side effect of widening a policy.
select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'guests'
       and grantee = 'ranza_app' and privilege_type = 'UPDATE'$$,
  array['updated_at'],
  'the runtime role may update exactly one column of a Guest');

-- ---------------------------------------------------------------------------
-- Each gate denies on its own (blueprint 3.5), against an Organization-scoped
-- write
-- ---------------------------------------------------------------------------

-- Gate 4 first, because it needs nothing changed: a Staff Member of
-- Organization B reaches no Property of Organization A.
set local role ranza_app;
select app.set_request_context('42222222-2222-4222-8222-222222222222');
select throws_ok(
  $$insert into public.guests (organization_id, full_name)
    values ('4a111111-1111-4111-8111-111111111111', 'Reach')$$,
  '42501', NULL,
  'gate 4 denies the write: an unreached Organization records nothing');
reset role;

update public.subscriptions set status = 'suspended'
 where organization_id = '4a111111-1111-4111-8111-111111111111';
set local role ranza_app;
select app.set_request_context('41111111-1111-4111-8111-111111111111');
select throws_ok(
  $$insert into public.guests (organization_id, full_name)
    values ('4a111111-1111-4111-8111-111111111111', 'Lapsed')$$,
  '42501', NULL,
  'gate 1 denies the write: a suspended Subscription records nothing');
reset role;
update public.subscriptions set status = 'active'
 where organization_id = '4a111111-1111-4111-8111-111111111111';

update public.entitlements set status = 'revoked'
 where organization_id = '4a111111-1111-4111-8111-111111111111'
   and module_key = 'front_office';
set local role ranza_app;
select app.set_request_context('41111111-1111-4111-8111-111111111111');
select throws_ok(
  $$insert into public.guests (organization_id, full_name)
    values ('4a111111-1111-4111-8111-111111111111', 'Unentitled')$$,
  '42501', NULL,
  'gate 2 denies the write: a revoked Entitlement records nothing');
reset role;
update public.entitlements set status = 'active'
 where organization_id = '4a111111-1111-4111-8111-111111111111'
   and module_key = 'front_office';

-- Gate 3 is per Property, and this row is per Organization, so the helper has
-- to find no Property at all with the capability — which is what makes
-- Organization A's second, capability-less Property part of the fixture.
update public.property_capabilities set enabled = false
 where property_id = '4c111111-1111-4111-8111-111111111111'
   and capability_key = 'front_desk';
set local role ranza_app;
select app.set_request_context('41111111-1111-4111-8111-111111111111');
select throws_ok(
  $$insert into public.guests (organization_id, full_name)
    values ('4a111111-1111-4111-8111-111111111111', 'Disabled')$$,
  '42501', NULL,
  'gate 3 denies the write: no Property with a front desk records nothing');

-- And the read is unaffected by any of it, which is the point of the gates
-- being separate: losing the front desk stops Guests being recorded and does
-- not make the Organization's existing people disappear.
select is(
  (select count(*)::int from public.guests
    where id = '4e111111-1111-4111-8111-111111111111'),
  1,
  'a Property without a front desk still reads the Organization''s Guests');
reset role;

-- ---------------------------------------------------------------------------
-- What a booking is, for every writer (decision sheet 2026-09-29)
-- ---------------------------------------------------------------------------

-- A Property of its own, with a front desk, so nothing above changes and the
-- closed day below is this section's alone. Organization A's other Properties
-- had their front desk switched off by the gate 3 assertion.
insert into public.properties (id, organization_id, name) values
  ('4c444444-4444-4444-8444-444444444444',
   '4a111111-1111-4111-8111-111111111111', 'Guest Property A3');

insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity) values
  ('4d555555-5555-4555-8555-555555555555',
   '4c444444-4444-4444-8444-444444444444',
   '4a111111-1111-4111-8111-111111111111', 'GA3-101', 'room', 2),
  ('4d666666-6666-4666-8666-666666666666',
   '4c444444-4444-4444-8444-444444444444',
   '4a111111-1111-4111-8111-111111111111', 'GA3-102', 'room', 2);

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('4c444444-4444-4444-8444-444444444444',
   '4a111111-1111-4111-8111-111111111111', 'front_desk', true);

-- A shipped role without front_desk.book, Organization-wide, so every gate is
-- open for them and only the permission is missing.
insert into public.users (id, email) values
  ('45555555-5555-4555-8555-555555555555', 'guest-staff-finance@example.test');
insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('4a111111-1111-4111-8111-111111111111',
   '45555555-5555-4555-8555-555555555555', 'finance', 'organization_wide');

set local role ranza_app;
select app.set_request_context('41111111-1111-4111-8111-111111111111');

-- RG-S1-11. An open-ended booking is the Resident's case; a short-term Guest
-- always has a planned departure, or a priced one holds its Unit and is charged
-- a room night every night until somebody notices (ADR 0038).
select throws_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_id, stay_type, status, starts_on, ends_on)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c444444-4444-4444-8444-444444444444',
            '4d555555-5555-4555-8555-555555555555',
            '4e111111-1111-4111-8111-111111111111', 'guest', 'confirmed',
            app.property_today('4c444444-4444-4444-8444-444444444444') + 30,
            null)$$,
  '23514', NULL,
  'a Guest booking without a departure is refused');

-- A booking finished before the rule existed is excused: it holds no Unit, is
-- charged nothing more, and app.a_finished_row_keeps_its_dates() forbids
-- giving it a departure now, so a database holding one could never take the
-- constraint. Written as the connecting role, since the desk takes every
-- booking confirmed and only history arrives already finished.
set local role none;
select lives_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_id, stay_type, status, starts_on, ends_on)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c444444-4444-4444-8444-444444444444',
            '4d555555-5555-4555-8555-555555555555',
            '4e111111-1111-4111-8111-111111111111', 'guest', 'cancelled',
            app.property_today('4c444444-4444-4444-8444-444444444444') + 40,
            null)$$,
  'RG-S1-11: a Guest booking already finished without a departure is excused');
select throws_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_id, stay_type, status, starts_on, ends_on)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c444444-4444-4444-8444-444444444444',
            '4d555555-5555-4555-8555-555555555555',
            '4e111111-1111-4111-8111-111111111111', 'guest', 'requested',
            app.property_today('4c444444-4444-4444-8444-444444444444') + 40,
            null)$$,
  '23514', NULL,
  'RG-S1-11: but one still live is refused, whoever writes it');
set local role ranza_app;
select app.set_request_context('41111111-1111-4111-8111-111111111111');

select lives_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_id, stay_type, status, starts_on, ends_on)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c444444-4444-4444-8444-444444444444',
            '4d666666-6666-4666-8666-666666666666',
            '4e222222-2222-4222-8222-222222222222', 'resident', 'confirmed',
            app.property_today('4c444444-4444-4444-8444-444444444444') + 30,
            null)$$,
  'a Resident booking may leave its departure open');

-- RG-S1-40. Two stay types and no third; the server action refuses anything
-- else before the module, and this refuses it for every writer.
select throws_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_id, stay_type, status, starts_on, ends_on)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c444444-4444-4444-8444-444444444444',
            '4d555555-5555-4555-8555-555555555555',
            '4e111111-1111-4111-8111-111111111111', 'student', 'confirmed',
            app.property_today('4c444444-4444-4444-8444-444444444444') + 30,
            app.property_today('4c444444-4444-4444-8444-444444444444') + 32)$$,
  '23514', NULL,
  'a stay type other than guest or resident is refused');

-- RG-S1-19. The index is (organization_id, email): Organization B already has
-- this address, and Organization A records its own person at it.
select lives_ok(
  $$insert into public.guests (organization_id, full_name, email)
    values ('4a111111-1111-4111-8111-111111111111',
            'Grace H', 'grace@example.test')$$,
  'an address Organization B holds is recorded again in Organization A');

-- RG-S1-33. Every gate is open for this Staff Member — a Property of theirs has
-- a front desk — and the Guest is refused because booking is not their job.
select app.set_request_context('45555555-5555-4555-8555-555555555555');
select throws_ok(
  $$insert into public.guests (organization_id, full_name)
    values ('4a111111-1111-4111-8111-111111111111', 'Not Their Job')$$,
  '42501', NULL,
  'a role without front_desk.book records no Guest, with every gate open');

-- RG-S1-08. Yesterday is closed at A3. A booking dated on it would be a row the
-- day's counts never saw, whoever writes it.
select app.set_request_context('41111111-1111-4111-8111-111111111111');
select lives_ok(
  $$insert into public.business_day_closes
      (organization_id, property_id, business_date)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c444444-4444-4444-8444-444444444444',
            app.property_today('4c444444-4444-4444-8444-444444444444') - 1)$$,
  'A3 closes yesterday');

select throws_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_id, stay_type, status, starts_on, ends_on)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c444444-4444-4444-8444-444444444444',
            '4d555555-5555-4555-8555-555555555555',
            '4e111111-1111-4111-8111-111111111111', 'guest', 'confirmed',
            app.property_today('4c444444-4444-4444-8444-444444444444') - 1,
            app.property_today('4c444444-4444-4444-8444-444444444444') + 1)$$,
  'RZ001', NULL,
  'a booking cannot be taken on a closed business day');

select lives_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_id, stay_type, status, starts_on, ends_on)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c444444-4444-4444-8444-444444444444',
            '4d555555-5555-4555-8555-555555555555',
            '4e111111-1111-4111-8111-111111111111', 'guest', 'confirmed',
            app.property_today('4c444444-4444-4444-8444-444444444444'),
            app.property_today('4c444444-4444-4444-8444-444444444444') + 1)$$,
  'a booking on the first open day is taken');
reset role;

-- Not the ranza_app's rule alone: the migration role is refused too, because a
-- seed or a future channel is exactly the writer the module never sees.
select throws_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_id, stay_type, status, starts_on, ends_on)
    values ('4a111111-1111-4111-8111-111111111111',
            '4c444444-4444-4444-8444-444444444444',
            '4d666666-6666-4666-8666-666666666666',
            '4e111111-1111-4111-8111-111111111111', 'guest', 'confirmed',
            app.property_today('4c444444-4444-4444-8444-444444444444') - 3,
            app.property_today('4c444444-4444-4444-8444-444444444444') - 2)$$,
  'RZ001', NULL,
  'and a writer that bypasses policies is refused a closed day too');

select is(
  (select count(*)::int from public.guests where email = 'grace@example.test'),
  2,
  'one address is two Guests in two Organizations');

-- Read from the catalogue, so a missing object is a failing row rather than an
-- error that takes the rest of the suite with it.
select is(
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and conname = 'reservations_guest_has_a_departure'),
  'CHECK (((stay_type = ''resident''::text) OR (ends_on IS NOT NULL) OR (status = ANY (ARRAY[''checked_out''::text, ''cancelled''::text, ''no_show''::text]))))',
  'the departure constraint excuses the Resident, and a booking already finished');

select is(
  (select p.prosecdef from pg_trigger as t join pg_proc as p on p.oid = t.tgfoid
    where t.tgrelid = 'public.reservations'::regclass
      and t.tgname = 'reservations_want_an_open_day'),
  false,
  'the closed-day trigger on bookings is security invoker');

-- Same-event triggers fire in name order. The occupancy trigger takes the
-- Unit's lock (2) and this one the Property's day (3); ADR 0038's order is Unit
-- first, and a name that sorted earlier would invert it for every booking.
select ok(
  (select bool_and(t.tgname > 'reservations_unit_holds_one_occupancy')
     from pg_trigger as t
    where t.tgrelid = 'public.reservations'::regclass
      and t.tgfoid in (select oid from pg_proc
                        where proname = 'reservations_keep_closed_days'
                          and pronamespace = 'app'::regnamespace))
  and exists (select 1 from pg_trigger
               where tgrelid = 'public.reservations'::regclass
                 and tgname = 'reservations_unit_holds_one_occupancy'),
  'the closed-day trigger fires after the Unit''s lock is taken');

select * from finish();
rollback;
