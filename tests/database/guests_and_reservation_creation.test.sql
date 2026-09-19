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
select plan(34);

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

select * from finish();
rollback;
