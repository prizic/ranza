-- What a student sees of their payment plan on My stay (RANZ-87, GP-S4-11 to
-- GP-S4-17, ADR 0060; the plan is ADR 0059).
--
-- One claim, ADR 0009's: a Resident reaches what is theirs through their own
-- path and never through a widening of the Staff one. The path is
-- app.resident_next_instalments(), which reads app.payment_plan_standing() as
-- its owner, so the standing function's own reach policies keep nobody out and
-- this function's body is the whole boundary:
--
--   the user       only the signed-in user's own Stays; another student's plan
--                  is invisible, and so is it to a Staff Member, who has no
--                  Stay of their own to read it through
--   the booking    a Stay with no booking asks the standing of every booking
--                  in its Property, so it is left out (twice over)
--   current        a reserved or in-house Stay, not a finished one
--   the gates      the Organization holds billing_folios, the Property has
--                  finance on
--   the answer     the next unpaid instalment, what is still owed on it, and
--                  the overdue total; the state is the standing's own
--
-- Each break below was applied inside a rolled-back transaction, the altered
-- object printed first, and the named assertions seen red.
begin;
select plan(27);

insert into public.users (id, email) values
  ('ec000001-0000-4000-8000-000000000001', 'ri-overdue@example.test'),
  ('ec000002-0000-4000-8000-000000000001', 'ri-upcoming@example.test'),
  ('ec000003-0000-4000-8000-000000000001', 'ri-walk-in@example.test'),
  ('ec000004-0000-4000-8000-000000000001', 'ri-no-finance@example.test'),
  ('ec000005-0000-4000-8000-000000000001', 'ri-no-billing@example.test'),
  ('ec000006-0000-4000-8000-000000000001', 'ri-all-paid@example.test'),
  ('ec000007-0000-4000-8000-000000000001', 'ri-departed@example.test'),
  ('ec000008-0000-4000-8000-000000000001', 'ri-no-plan@example.test'),
  ('ec000009-0000-4000-8000-000000000001', 'ri-two-overdue@example.test'),
  ('ec000010-0000-4000-8000-000000000001', 'ri-due-today@example.test'),
  ('ec000011-0000-4000-8000-000000000001', 'ri-manager-who-lives-here@example.test'),
  ('ecaa0001-0000-4000-8000-000000000001', 'ri-manager@example.test'),
  ('ecaa0002-0000-4000-8000-000000000001', 'ri-other-manager@example.test');

insert into public.organizations (id, name, status) values
  ('ecb00001-0000-4000-8000-000000000001', 'Instalment Organization', 'active'),
  ('ecb00002-0000-4000-8000-000000000001', 'Unbilled Instalment Organization', 'active');

insert into public.properties (id, organization_id, name, currency, status) values
  ('ecd00001-0000-4000-8000-000000000001',
   'ecb00001-0000-4000-8000-000000000001', 'Instalment Yurt', 'TRY', 'active'),
  ('ecd00002-0000-4000-8000-000000000001',
   'ecb00001-0000-4000-8000-000000000001', 'Instalment Yurt Without Finance', 'TRY', 'active'),
  ('ecd00003-0000-4000-8000-000000000001',
   'ecb00002-0000-4000-8000-000000000001', 'Unbilled Instalment Yurt', 'TRY', 'active');

insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('ecb00001-0000-4000-8000-000000000001',
   'ecaa0001-0000-4000-8000-000000000001', 'manager', 'organization_wide'),
  ('ecb00001-0000-4000-8000-000000000001',
   'ec000011-0000-4000-8000-000000000001', 'manager', 'organization_wide'),
  ('ecb00002-0000-4000-8000-000000000001',
   'ecaa0002-0000-4000-8000-000000000001', 'manager', 'organization_wide');

insert into public.subscriptions (organization_id, status) values
  ('ecb00001-0000-4000-8000-000000000001', 'active'),
  ('ecb00002-0000-4000-8000-000000000001', 'active');

-- The second Organization holds the front office and not billing.
insert into public.entitlements (organization_id, module_key) values
  ('ecb00001-0000-4000-8000-000000000001', 'platform_core'),
  ('ecb00001-0000-4000-8000-000000000001', 'front_office'),
  ('ecb00001-0000-4000-8000-000000000001', 'billing_folios'),
  ('ecb00002-0000-4000-8000-000000000001', 'platform_core'),
  ('ecb00002-0000-4000-8000-000000000001', 'front_office');

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('ecd00001-0000-4000-8000-000000000001',
   'ecb00001-0000-4000-8000-000000000001', 'portal_stay_overview', true),
  ('ecd00001-0000-4000-8000-000000000001',
   'ecb00001-0000-4000-8000-000000000001', 'finance', true),
  ('ecd00002-0000-4000-8000-000000000001',
   'ecb00001-0000-4000-8000-000000000001', 'portal_stay_overview', true),
  ('ecd00002-0000-4000-8000-000000000001',
   'ecb00001-0000-4000-8000-000000000001', 'finance', false),
  ('ecd00003-0000-4000-8000-000000000001',
   'ecb00002-0000-4000-8000-000000000001', 'portal_stay_overview', true),
  ('ecd00003-0000-4000-8000-000000000001',
   'ecb00002-0000-4000-8000-000000000001', 'finance', true);

insert into public.guests (id, organization_id, full_name) values
  ('ece00001-0000-4000-8000-000000000001',
   'ecb00001-0000-4000-8000-000000000001', 'Instalment Student'),
  ('ece00002-0000-4000-8000-000000000001',
   'ecb00002-0000-4000-8000-000000000001', 'Unbilled Instalment Student');

create function pg_temp.today() returns date
language sql stable
as $$ select app.property_today('ecd00001-0000-4000-8000-000000000001') $$;

grant execute on function pg_temp.today() to public;

-- Student `n` with a room of their own, a booking for the term (or none, for a
-- walk-in), a Stay that is theirs, and a Folio.
create function pg_temp.a_student(
  n integer, organization uuid, property uuid, guest uuid,
  booking_status text, stay_status text, with_booking boolean,
  user_number integer default null
) returns void
language plpgsql
as $$
declare
  tag text := lpad(n::text, 2, '0');
  unit uuid := ('ec1000' || tag || '-0000-4000-8000-000000000001')::uuid;
  booking uuid := ('ec2000' || tag || '-0000-4000-8000-000000000001')::uuid;
  stay uuid := ('ec3000' || tag || '-0000-4000-8000-000000000001')::uuid;
begin
  insert into public.accommodation_units
    (id, property_id, organization_id, name, unit_type, capacity)
  values (unit, property, organization, 'RI-' || n, 'room', 1);
  insert into public.reservations
    (id, organization_id, property_id, accommodation_unit_id, guest_id,
     stay_type, status, starts_on, ends_on)
  values (booking, organization, property, unit, guest, 'resident',
          booking_status, pg_temp.today() - 60, pg_temp.today() + 200);
  insert into public.stays
    (id, organization_id, property_id, accommodation_unit_id, reservation_id,
     user_id, stay_type, status, starts_on, ends_on)
  values (stay, organization, property, unit,
          case when with_booking then booking end,
          ('ec0000' || lpad(coalesce(user_number, n)::text, 2, '0')
             || '-0000-4000-8000-000000000001')::uuid,
          'resident', stay_status, pg_temp.today() - 60, pg_temp.today() + 200);
  insert into public.folios (organization_id, property_id, stay_id, currency)
  values (organization, property, stay, 'TRY');
end
$$;

-- The booking's plan, and one instalment of it.
create function pg_temp.a_plan(n integer, organization uuid, property uuid)
returns void
language sql
as $$
  insert into public.payment_plans
    (id, organization_id, property_id, reservation_id, currency, created_by)
  values (('ec4000' || lpad(n::text, 2, '0') || '-0000-4000-8000-000000000001')::uuid,
          organization, property,
          ('ec2000' || lpad(n::text, 2, '0') || '-0000-4000-8000-000000000001')::uuid,
          'TRY', 'ecaa0001-0000-4000-8000-000000000001')
$$;

create function pg_temp.an_instalment(
  n integer, organization uuid, property uuid, ordinal integer,
  amount bigint, due_in_days integer, withdrawn boolean default false
) returns void
language sql
as $$
  insert into public.plan_instalments
    (organization_id, property_id, plan_id, ordinal, amount_minor, due_on,
     revision, withdrawn_at, withdrawn_reason)
  values (organization, property,
          ('ec4000' || lpad(n::text, 2, '0') || '-0000-4000-8000-000000000001')::uuid,
          ordinal, amount, pg_temp.today() + due_in_days, 1,
          case when withdrawn then current_timestamp end,
          case when withdrawn then 'revised' end)
$$;

-- A payment on the student's Folio: instalments are settled oldest first.
create function pg_temp.a_payment(
  n integer, organization uuid, property uuid, amount bigint
) returns void
language sql
as $$
  insert into public.folio_lines
    (organization_id, property_id, folio_id, line_type, description,
     amount_minor, payment_method)
  select organization, property, folio.id, 'payment', 'Bank transfer',
         -amount, 'bank_transfer'
    from public.folios as folio
   where folio.stay_id = ('ec3000' || lpad(n::text, 2, '0') || '-0000-4000-8000-000000000001')::uuid
$$;

-- One: an instalment paid, one part-paid and late, one due today, one to come.
-- Two: a reserved Stay with two instalments to come, written out of order.
-- Three: a walk-in with no booking, in the Property whose plans are above.
-- Four: a Property with finance off. Five: an Organization without billing.
-- Six: a plan paid in full. Seven: a Stay that has finished. Eight: no plan.
-- Nine: two instalments, both late. Ten: one due today, and an earlier
-- instalment that a revision withdrew.
select pg_temp.a_student(1, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 'ece00001-0000-4000-8000-000000000001', 'checked_in', 'in_house', true);
select pg_temp.a_student(2, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 'ece00001-0000-4000-8000-000000000001', 'confirmed', 'reserved', true);
select pg_temp.a_student(3, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 'ece00001-0000-4000-8000-000000000001', 'checked_in', 'in_house', false);
select pg_temp.a_student(4, 'ecb00001-0000-4000-8000-000000000001', 'ecd00002-0000-4000-8000-000000000001', 'ece00001-0000-4000-8000-000000000001', 'checked_in', 'in_house', true);
select pg_temp.a_student(5, 'ecb00002-0000-4000-8000-000000000001', 'ecd00003-0000-4000-8000-000000000001', 'ece00002-0000-4000-8000-000000000001', 'checked_in', 'in_house', true);
select pg_temp.a_student(6, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 'ece00001-0000-4000-8000-000000000001', 'checked_in', 'in_house', true);
select pg_temp.a_student(7, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 'ece00001-0000-4000-8000-000000000001', 'checked_in', 'in_house', true);
select pg_temp.a_student(8, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 'ece00001-0000-4000-8000-000000000001', 'checked_in', 'in_house', true);
select pg_temp.a_student(9, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 'ece00001-0000-4000-8000-000000000001', 'checked_in', 'in_house', true);
select pg_temp.a_student(10, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 'ece00001-0000-4000-8000-000000000001', 'checked_in', 'in_house', true);

-- Eleven: a Staff Member who also lives here, with a plan of their own.
-- Twelve: student one's earlier term, finished, with an instalment charged to
-- its Folio and never paid; student one's current Stay is in the same Property.
select pg_temp.a_student(11, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 'ece00001-0000-4000-8000-000000000001', 'checked_in', 'in_house', true);
select pg_temp.a_student(12, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 'ece00001-0000-4000-8000-000000000001', 'checked_in', 'in_house', true, 1);

select pg_temp.a_plan(n, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001')
  from unnest(array[1, 2, 3, 6, 7, 9, 10, 11, 12]) as n;
select pg_temp.a_plan(4, 'ecb00001-0000-4000-8000-000000000001', 'ecd00002-0000-4000-8000-000000000001');
select pg_temp.a_plan(5, 'ecb00002-0000-4000-8000-000000000001', 'ecd00003-0000-4000-8000-000000000001');

select pg_temp.an_instalment(1, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 1, 100000, -40);
select pg_temp.an_instalment(1, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 2, 100000, -10);
select pg_temp.an_instalment(1, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 3, 100000, 0);
select pg_temp.an_instalment(1, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 4, 100000, 30);
select pg_temp.a_payment(1, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 130000);

select pg_temp.an_instalment(2, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 1, 111111, 40);
select pg_temp.an_instalment(2, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 2, 222222, 5);

-- The plans of three students nobody asked about, each late.
select pg_temp.an_instalment(3, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 1, 333333, -20);
select pg_temp.an_instalment(4, 'ecb00001-0000-4000-8000-000000000001', 'ecd00002-0000-4000-8000-000000000001', 1, 444444, -20);
select pg_temp.an_instalment(5, 'ecb00002-0000-4000-8000-000000000001', 'ecd00003-0000-4000-8000-000000000001', 1, 555555, -20);

select pg_temp.an_instalment(6, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 1, 100000, -20);
select pg_temp.an_instalment(6, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 2, 100000, 20);
select pg_temp.a_payment(6, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 200000);

select pg_temp.an_instalment(7, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 1, 666666, -20);

select pg_temp.an_instalment(9, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 1, 50000, -30);
select pg_temp.an_instalment(9, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 2, 60000, -5);

select pg_temp.an_instalment(10, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 1, 70000, -15, true);
select pg_temp.an_instalment(10, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 2, 80000, 0);

select pg_temp.an_instalment(11, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 1, 90000, 15);

-- Twelve's instalment is charged to the Folio the way the worker charges it,
-- and then the booking ends and the Stay finishes. A charged instalment is not
-- withdrawn by the booking's ending, so it is still unpaid and still late.
select pg_temp.an_instalment(12, 'ecb00001-0000-4000-8000-000000000001', 'ecd00001-0000-4000-8000-000000000001', 1, 120000, -30);
insert into public.folio_lines
  (organization_id, property_id, folio_id, line_type, description,
   amount_minor, source, business_date, instalment_id)
select instalment.organization_id, instalment.property_id, folio.id, 'charge',
       'Instalment 1', instalment.amount_minor, 'instalment', instalment.due_on,
       instalment.id
  from public.plan_instalments as instalment
  join public.folios as folio
    on folio.stay_id = 'ec300012-0000-4000-8000-000000000001'
 where instalment.plan_id = 'ec400012-0000-4000-8000-000000000001';
update public.reservations set status = 'checked_out'
 where id = 'ec200012-0000-4000-8000-000000000001';
update public.stays set status = 'departed'
 where id = 'ec300012-0000-4000-8000-000000000001';

update public.stays set status = 'departed'
 where id = 'ec300007-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- The function is the runtime role's alone
-- ---------------------------------------------------------------------------

select ok(
  has_function_privilege('ranza_app', 'app.resident_next_instalments()', 'execute')
    and not has_function_privilege('ranza_auth', 'app.resident_next_instalments()', 'execute')
    and not has_function_privilege('ranza_worker', 'app.resident_next_instalments()', 'execute'),
  'GP-S4-11: only the runtime role may ask for the next instalment');

select is(
  (select proargnames::text from pg_catalog.pg_proc
    where oid = 'app.resident_next_instalments()'::regprocedure),
  '{stay_id,currency,instalment_number,instalments_total,due_on,outstanding_minor,state,overdue_count,overdue_minor}',
  'GP-S4-11: it returns the next instalment and nothing a Staff Member typed: no reason, no note, no line');

set local role ranza_app;

select is_empty($$ select * from app.resident_next_instalments() $$,
  'GP-S4-11: with no one signed in there is no instalment');

-- ---------------------------------------------------------------------------
-- A student who is late
-- ---------------------------------------------------------------------------

select app.set_request_context('ec000001-0000-4000-8000-000000000001');

select results_eq(
  $$ select stay_id::text, currency, instalment_number, instalments_total,
            due_on, outstanding_minor, state, overdue_count, overdue_minor
       from app.resident_next_instalments() $$,
  $$ select 'ec300001-0000-4000-8000-000000000001'::text, 'TRY'::text, 2, 4,
            to_char(pg_temp.today() - 10, 'YYYY-MM-DD'), '70000'::text,
            'overdue'::text, 1, '70000'::text $$,
  'GP-S4-12: the next instalment is the oldest one not paid in full, with what is still owed on it and how much is overdue');

select is(
  (select count(*)::int from app.resident_next_instalments()),
  1, 'GP-S4-16: an earlier term that finished with an instalment unpaid is not told beside the current one, in the same Property');

select is_empty($$ select id from public.payment_plans $$,
  'GP-S4-11: the student still reads no plan');
select is_empty($$ select id from public.plan_instalments $$,
  'GP-S4-11: and no instalment');
select is_empty($$ select id from public.folio_lines $$,
  'GP-S4-11: and no line of the Folio the standing is worked out from');

-- ---------------------------------------------------------------------------
-- Another student: their own, and nothing of the first student's lateness
-- ---------------------------------------------------------------------------

select app.set_request_context('ec000002-0000-4000-8000-000000000001');

select results_eq(
  $$ select stay_id::text, instalment_number, instalments_total, due_on,
            outstanding_minor, state, overdue_count, overdue_minor
       from app.resident_next_instalments() $$,
  $$ select 'ec300002-0000-4000-8000-000000000001'::text, 1, 2,
            to_char(pg_temp.today() + 5, 'YYYY-MM-DD'), '222222'::text,
            'upcoming'::text, 0, '0'::text $$,
  'GP-S4-13: another student''s plan is theirs and not the first student''s: the soonest of two written out of order, upcoming, nothing overdue');

select is(
  (select count(*)::int from app.resident_next_instalments()),
  1, 'GP-S4-13: and one row, for the one Stay they hold');

-- ---------------------------------------------------------------------------
-- A walk-in has no booking, and a Property holds other students' plans
-- ---------------------------------------------------------------------------

select app.set_request_context('ec000003-0000-4000-8000-000000000001');

select is_empty($$ select * from app.resident_next_instalments() $$,
  'GP-S4-14: a Stay with no booking is told nothing, not every booking of its Property');

-- ---------------------------------------------------------------------------
-- The gates
-- ---------------------------------------------------------------------------

select app.set_request_context('ec000004-0000-4000-8000-000000000001');
select is_empty($$ select * from app.resident_next_instalments() $$,
  'GP-S4-15: no instalment at a Property with finance switched off');

select app.set_request_context('ec000005-0000-4000-8000-000000000001');
select is_empty($$ select * from app.resident_next_instalments() $$,
  'GP-S4-15: nor where the Organization does not hold billing');

-- ---------------------------------------------------------------------------
-- Nothing to say
-- ---------------------------------------------------------------------------

select app.set_request_context('ec000006-0000-4000-8000-000000000001');
select is_empty($$ select * from app.resident_next_instalments() $$,
  'GP-S4-16: a plan paid in full has no next instalment');

select app.set_request_context('ec000007-0000-4000-8000-000000000001');
select is_empty($$ select * from app.resident_next_instalments() $$,
  'GP-S4-16: a Stay that has finished has none');

select app.set_request_context('ec000008-0000-4000-8000-000000000001');
select is_empty($$ select * from app.resident_next_instalments() $$,
  'GP-S4-16: and a Stay with no plan has none');

-- ---------------------------------------------------------------------------
-- Late, and due today
-- ---------------------------------------------------------------------------

select app.set_request_context('ec000009-0000-4000-8000-000000000001');
select results_eq(
  $$ select instalment_number, outstanding_minor, state, overdue_count, overdue_minor
       from app.resident_next_instalments() $$,
  $$ values (1, '50000'::text, 'overdue'::text, 2, '110000'::text) $$,
  'GP-S4-12: two late instalments are the oldest one first, with the count and the sum overdue');

select app.set_request_context('ec000010-0000-4000-8000-000000000001');
select results_eq(
  $$ select instalment_number, outstanding_minor, state, overdue_count
       from app.resident_next_instalments() $$,
  $$ values (1, '80000'::text, 'due'::text, 0) $$,
  'GP-S4-12: an instalment due today is due and not late, and one a revision withdrew is not the next');

-- ---------------------------------------------------------------------------
-- Staff get nothing from it
-- ---------------------------------------------------------------------------

select app.set_request_context('ecaa0001-0000-4000-8000-000000000001');

select is_empty($$ select * from app.resident_next_instalments() $$,
  'GP-S4-17: a manager of the Organization has no Stay of their own to read it through');

select cmp_ok(
  (select count(*)::int from public.plan_instalments), '>', 0,
  'GP-S4-17: though the same manager reads every plan through the policies staff have, so the empty answer above is not an empty table');

select app.set_request_context('ec000011-0000-4000-8000-000000000001');
select results_eq(
  $$ select stay_id::text, instalment_number, outstanding_minor, state, overdue_count
       from app.resident_next_instalments() $$,
  $$ values ('ec300011-0000-4000-8000-000000000001'::text, 1, '90000'::text, 'upcoming'::text, 0) $$,
  'GP-S4-17: a Staff Member who also lives here reads their own instalment and no student''s, whatever the policies give them');

select app.set_request_context('ecaa0002-0000-4000-8000-000000000001');
select is_empty($$ select * from app.resident_next_instalments() $$,
  'GP-S4-17: nor does another Organization''s manager');

set local role none;
-- Where the standing says an instalment is: the function says the same thing,
-- because it reads it. Asked as its owner, which is the role the function reads the standing as.
select app.set_request_context('ec000001-0000-4000-8000-000000000001');
select is(
  (select state from app.resident_next_instalments()),
  (select state from app.payment_plan_standing(
     'ecd00001-0000-4000-8000-000000000001',
     'ec200001-0000-4000-8000-000000000001') where number = 2),
  'GP-S4-12: the state is the standing''s own, never a second definition of overdue');
select is(
  (select state from app.payment_plan_standing(
     'ecd00001-0000-4000-8000-000000000001',
     'ec200001-0000-4000-8000-000000000001') where number = 2),
  'overdue',
  'GP-S4-12: and that instalment is overdue, which the assertion above is not read against nothing');

select app.set_request_context('ec000010-0000-4000-8000-000000000001');
select is(
  (select state from app.resident_next_instalments()),
  (select state from app.payment_plan_standing(
     'ecd00001-0000-4000-8000-000000000001',
     'ec200010-0000-4000-8000-000000000001') where number = 1),
  'GP-S4-12: the day an instalment falls due is the standing''s call too, due and not yet overdue');

set local role ranza_app;

-- ---------------------------------------------------------------------------
-- A student whose only Stay has finished reaches nothing
-- ---------------------------------------------------------------------------

set local role none;
update public.stays set status = 'departed'
 where id = 'ec300001-0000-4000-8000-000000000001';
set local role ranza_app;
select app.set_request_context('ec000001-0000-4000-8000-000000000001');

select is_empty($$ select * from app.resident_next_instalments() $$,
  'GP-S4-16: when the last Stay has finished there is none, however late it was');

select is(
  (select count(*)::int from pg_catalog.pg_policies
    where schemaname = 'public' and tablename in ('payment_plans', 'plan_instalments')
      and policyname !~ '(accessible_property|withdrawn_with_their_booking)'),
  0, 'GP-S4-11: no policy of a student''s own was added to a plan table: the function is the only path');

select * from finish();
rollback;
