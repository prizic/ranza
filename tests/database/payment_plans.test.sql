-- A Resident pays by instalments (RANZ-96, ADR 0059, docs/features/payment-plans).
--
-- Four claims, which fail in different ways:
--
--   the plan      who may make one, on what, and that it cannot be written by
--                 anything but the two functions that check their caller
--   the history   a charged instalment is never rewritten; a revision and a
--                 booking's ending withdraw what was not charged and nothing else
--   the worker    an instalment is charged to the Folio on its due date, once,
--                 by the worker alone, and one that cannot be charged yet waits
--   the standing  where an instalment stands, defined once: overdue is the day
--                 after its due date and not paid in full, and a payment
--                 settles the oldest instalment first
--
-- Rows in docs/features/payment-plans/edge-cases.csv are named beside the
-- assertion that proves them. Each break below was applied inside a rolled-back
-- transaction, the altered object printed first, and the named assertion seen
-- red; the list is kept at the foot of this header.
--
-- Eighty-five breaks, each seen red at the assertion named. Where two
-- boundaries guard one thing, the first sabotage that stayed green said so,
-- and an assertion was written for the condition on which they differ.
--
--   making a plan   front_desk.book removed (08); the reach gate asked of the
--                   helper that needs no Staff Member (08); the billing gate
--                   removed (08); one to sixty instalments widened at either end
--                   (07)
--   the rules       Resident-only, departure date, booking not ended, each
--                   removed from the trigger and the trigger dropped (03, 04,
--                   06); due after the term and on its last day (05); an
--                   open-ended booking given a plan's departure back (04)
--   revising        finance.post_charge removed (12); the reach gate swapped
--                   for the helper (12); a revision of an ended booking (06);
--                   the reviser recorded as someone else (11); the revision
--                   not counted, which the table's own check refuses
--   history         plan and instalment deletes, changes and withdrawals of a
--                   charged instalment each allowed (13); a withdrawn
--                   instalment charged, function and trigger (23); the ending
--                   trigger dropped, or withdrawing a charged instalment (24)
--   the policy      the withdrawal policy dropped, open to every booking, open
--                   to every reason, without reach, without the permission of
--                   the command that ended the booking, with the wrong one
--                   (24); both read policies opened to everyone (10); row
--                   security off, and not forced (09)
--   grants          insert, update (amount) and delete to the application role
--                   (09); select to the worker (20); execute on the charging,
--                   the discovery and the definition of ready to the
--                   application role (20); the two unique keys dropped (02, 15)
--   the worker      due tomorrow ready, due today not (14, 16); a closed Folio,
--                   another currency, a charged instalment, a withdrawn one,
--                   unavailable billing, an archived Property, each ready (15,
--                   18, 19, 23); the server's date and UTC's in place of the
--                   Property's, in the charging and in the standing (16, 25);
--                   discovery finding nothing, and finding every Property (14,
--                   19); no worker context, another Organization's Property,
--                   the archived and unbilled gates (19, 21); dated today (17);
--                   the event renamed, carrying a name, or not published (22)
--   the standing    overdue on the due date, newest paid first, a reversed
--                   payment still paid, a waived instalment owing or taking a
--                   payment, withdrawn instalments read (25 to 28, 11); a
--                   figure that counts what is due today, sums the whole
--                   amount, or counts instalments as Residents (29); either
--                   read running with the owner's rights (30)
--   the ledger      an instalment credited to Other Revenue, and its reversal
--                   debited there (31)
--
-- Not shown by a single-session suite, and said so: that a booking being given
-- a plan and losing its departure date cannot both pass (the FOR SHARE on the
-- booking), that the charging re-reads an instalment under lock so a revision
-- and a charge cannot both win, and the clock inside the `waiting` figure that
-- the charging reports, which a wrong date skews only at some hours.
begin;
select plan(98);

insert into public.users (id, email) values
  ('e9111111-1111-4111-8111-111111111111', 'pp-manager@example.test'),
  ('e9222222-2222-4222-8222-222222222222', 'pp-desk@example.test'),
  ('e9333333-3333-4333-8333-333333333333', 'pp-finance@example.test'),
  ('e9444444-4444-4444-8444-444444444444', 'pp-housekeeper@example.test'),
  ('e9555555-5555-4555-8555-555555555555', 'pp-outsider@example.test'),
  ('e9666666-6666-4666-8666-666666666666', 'pp-elsewhere-desk@example.test'),
  ('e9777777-7777-4777-8777-777777777777', 'pp-elsewhere-finance@example.test');

insert into public.organizations (id, name, status) values
  ('e9a11111-1111-4111-8111-111111111111', 'Plan Organization', 'active'),
  ('e9a22222-2222-4222-8222-222222222222', 'Other Plan Organization', 'active');

insert into public.properties (id, organization_id, name, currency, status) values
  ('e9b11111-1111-4111-8111-111111111111',
   'e9a11111-1111-4111-8111-111111111111', 'Plan Yurt', 'TRY', 'active'),
  ('e9b22222-2222-4222-8222-222222222222',
   'e9a11111-1111-4111-8111-111111111111', 'Plan Unbilled Yurt', 'TRY', 'active'),
  ('e9b33333-3333-4333-8333-333333333333',
   'e9a22222-2222-4222-8222-222222222222', 'Other Plan Yurt', 'TRY', 'active'),
  ('e9b44444-4444-4444-8444-444444444444',
   'e9a11111-1111-4111-8111-111111111111', 'Archived Plan Yurt', 'TRY', 'archived');

insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('e9a11111-1111-4111-8111-111111111111',
   'e9111111-1111-4111-8111-111111111111', 'manager', 'organization_wide'),
  ('e9a11111-1111-4111-8111-111111111111',
   'e9222222-2222-4222-8222-222222222222', 'front_desk', 'organization_wide'),
  ('e9a11111-1111-4111-8111-111111111111',
   'e9333333-3333-4333-8333-333333333333', 'finance', 'organization_wide'),
  ('e9a11111-1111-4111-8111-111111111111',
   'e9444444-4444-4444-8444-444444444444', 'housekeeping', 'organization_wide'),
  ('e9a22222-2222-4222-8222-222222222222',
   'e9555555-5555-4555-8555-555555555555', 'manager', 'organization_wide'),
  ('e9a11111-1111-4111-8111-111111111111',
   'e9666666-6666-4666-8666-666666666666', 'front_desk', 'assigned_properties'),
  ('e9a11111-1111-4111-8111-111111111111',
   'e9777777-7777-4777-8777-777777777777', 'finance', 'assigned_properties');

-- Two Properties a day apart, wherever the server's clock is: Kiritimati is
-- fourteen hours ahead of UTC and Pago Pago eleven behind, so their calendar
-- dates are never the same (PP-S1-16).
insert into public.properties (id, organization_id, name, currency, status, timezone) values
  ('e9b55555-5555-4555-8555-555555555555',
   'e9a11111-1111-4111-8111-111111111111', 'Plan Kiritimati Yurt', 'TRY', 'active',
   'Pacific/Kiritimati'),
  ('e9b66666-6666-4666-8666-666666666666',
   'e9a11111-1111-4111-8111-111111111111', 'Plan Pago Pago Yurt', 'TRY', 'active',
   'Pacific/Pago_Pago');

-- Both reach the Property that keeps no Folios and no other.
insert into public.property_assignments (property_id, organization_id, user_id) values
  ('e9b22222-2222-4222-8222-222222222222', 'e9a11111-1111-4111-8111-111111111111',
   'e9666666-6666-4666-8666-666666666666'),
  ('e9b22222-2222-4222-8222-222222222222', 'e9a11111-1111-4111-8111-111111111111',
   'e9777777-7777-4777-8777-777777777777');

insert into public.subscriptions (organization_id, status) values
  ('e9a11111-1111-4111-8111-111111111111', 'active'),
  ('e9a22222-2222-4222-8222-222222222222', 'active');

insert into public.entitlements (organization_id, module_key) values
  ('e9a11111-1111-4111-8111-111111111111', 'platform_core'),
  ('e9a11111-1111-4111-8111-111111111111', 'front_office'),
  ('e9a11111-1111-4111-8111-111111111111', 'billing_folios'),
  ('e9a22222-2222-4222-8222-222222222222', 'front_office'),
  ('e9a22222-2222-4222-8222-222222222222', 'billing_folios');

-- The Organization bills; the second Property does not (PP-S1-08).
insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('e9b11111-1111-4111-8111-111111111111',
   'e9a11111-1111-4111-8111-111111111111', 'front_desk', true),
  ('e9b11111-1111-4111-8111-111111111111',
   'e9a11111-1111-4111-8111-111111111111', 'finance', true),
  ('e9b22222-2222-4222-8222-222222222222',
   'e9a11111-1111-4111-8111-111111111111', 'front_desk', true),
  ('e9b22222-2222-4222-8222-222222222222',
   'e9a11111-1111-4111-8111-111111111111', 'finance', false),
  ('e9b33333-3333-4333-8333-333333333333',
   'e9a22222-2222-4222-8222-222222222222', 'front_desk', true),
  ('e9b33333-3333-4333-8333-333333333333',
   'e9a22222-2222-4222-8222-222222222222', 'finance', true),
  ('e9b44444-4444-4444-8444-444444444444',
   'e9a11111-1111-4111-8111-111111111111', 'front_desk', true),
  ('e9b44444-4444-4444-8444-444444444444',
   'e9a11111-1111-4111-8111-111111111111', 'finance', true),
  ('e9b55555-5555-4555-8555-555555555555',
   'e9a11111-1111-4111-8111-111111111111', 'front_desk', true),
  ('e9b55555-5555-4555-8555-555555555555',
   'e9a11111-1111-4111-8111-111111111111', 'finance', true),
  ('e9b66666-6666-4666-8666-666666666666',
   'e9a11111-1111-4111-8111-111111111111', 'front_desk', true),
  ('e9b66666-6666-4666-8666-666666666666',
   'e9a11111-1111-4111-8111-111111111111', 'finance', true);

-- One room for each booking below, so no two compete for a Unit.
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity)
select ('e9c0000' || to_hex(n) || '-0000-4000-8000-000000000001')::uuid,
       case when n = 7 then 'e9b22222-2222-4222-8222-222222222222'::uuid
            else 'e9b11111-1111-4111-8111-111111111111'::uuid end,
       'e9a11111-1111-4111-8111-111111111111', 'PP-' || n, 'room', 1
  from generate_series(1, 12) as n;

insert into public.guests (id, organization_id, full_name) values
  ('e9d00000-0000-4000-8000-000000000001',
   'e9a11111-1111-4111-8111-111111111111', 'Plan Resident');

create function pg_temp.today() returns date
language sql stable
as $$ select app.property_today('e9b11111-1111-4111-8111-111111111111') $$;

grant execute on function pg_temp.today() to public;
select app.set_request_context('e9111111-1111-4111-8111-111111111111');

-- 1 a plan that never arrives, 2 a Guest, 3 open-ended, 4 in house with a plan
-- charged through the suite, 5 confirmed and late, 6 cancelled, 7 at the
-- Property that does not bill, 8 starts next month, 9 to be cancelled,
-- 10 in house and checked out below, 11 in house with its Folio closed, 12 in
-- house with a plan in another currency.
insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id,
   stay_type, status, starts_on, ends_on)
select ('e9e0000' || to_hex(n) || '-0000-4000-8000-000000000001')::uuid,
       'e9a11111-1111-4111-8111-111111111111',
       case when n = 7 then 'e9b22222-2222-4222-8222-222222222222'::uuid
            else 'e9b11111-1111-4111-8111-111111111111'::uuid end,
       ('e9c0000' || to_hex(n) || '-0000-4000-8000-000000000001')::uuid,
       'e9d00000-0000-4000-8000-000000000001',
       case when n = 2 then 'guest' else 'resident' end,
       case when n in (4, 10, 11, 12) then 'checked_in'
            when n = 6 then 'cancelled' else 'confirmed' end,
       case n when 1 then pg_temp.today() + 5
              when 2 then pg_temp.today() + 1
              when 3 then pg_temp.today() + 5
              when 4 then pg_temp.today() - 60
              when 5 then pg_temp.today() - 10
              when 6 then pg_temp.today() + 5
              when 7 then pg_temp.today() + 5
              when 8 then pg_temp.today() + 30
              when 9 then pg_temp.today() + 10
              when 10 then pg_temp.today() - 40
              else pg_temp.today() - 20 end,
       case n when 1 then pg_temp.today() + 125
              when 2 then pg_temp.today() + 5
              when 3 then null
              when 4 then pg_temp.today() + 120
              when 5 then pg_temp.today() + 110
              when 6 then pg_temp.today() + 60
              when 7 then pg_temp.today() + 60
              when 8 then pg_temp.today() + 90
              when 9 then pg_temp.today() + 70
              when 10 then pg_temp.today() + 20
              else pg_temp.today() + 100 end
  from generate_series(1, 12) as n;

insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, reservation_id,
   stay_type, status, starts_on, ends_on)
select ('e9f0000' || to_hex(n) || '-0000-4000-8000-000000000001')::uuid,
       reservation.organization_id, reservation.property_id,
       reservation.accommodation_unit_id, reservation.id,
       reservation.stay_type, 'in_house', reservation.starts_on,
       reservation.ends_on
  from public.reservations as reservation
  cross join generate_series(1, 12) as n
 where reservation.id = ('e9e0000' || to_hex(n) || '-0000-4000-8000-000000000001')::uuid
   and n in (4, 10, 11, 12);

insert into public.folios (id, organization_id, property_id, stay_id, currency)
select ('e9a0000' || to_hex(n) || '-0000-4000-8000-000000000001')::uuid,
       stay.organization_id, stay.property_id, stay.id, 'TRY'
  from public.stays as stay
  cross join generate_series(1, 12) as n
 where stay.id = ('e9f0000' || to_hex(n) || '-0000-4000-8000-000000000001')::uuid;

-- The archived Property has a Resident in house with an instalment due.
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity)
values ('e9c000d1-0000-4000-8000-000000000001',
        'e9b44444-4444-4444-8444-444444444444',
        'e9a11111-1111-4111-8111-111111111111', 'PP-ARCHIVED', 'room', 1);
insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id,
   stay_type, status, starts_on, ends_on)
values ('e9e000d1-0000-4000-8000-000000000001',
        'e9a11111-1111-4111-8111-111111111111',
        'e9b44444-4444-4444-8444-444444444444',
        'e9c000d1-0000-4000-8000-000000000001',
        'e9d00000-0000-4000-8000-000000000001',
        'resident', 'checked_in', pg_temp.today() - 30, pg_temp.today() + 100);
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, reservation_id,
   stay_type, status, starts_on, ends_on)
values ('e9f000d1-0000-4000-8000-000000000001',
        'e9a11111-1111-4111-8111-111111111111',
        'e9b44444-4444-4444-8444-444444444444',
        'e9c000d1-0000-4000-8000-000000000001',
        'e9e000d1-0000-4000-8000-000000000001',
        'resident', 'in_house', pg_temp.today() - 30, pg_temp.today() + 100);
insert into public.folios (id, organization_id, property_id, stay_id, currency)
values ('e9a000d1-0000-4000-8000-000000000001',
        'e9a11111-1111-4111-8111-111111111111',
        'e9b44444-4444-4444-8444-444444444444',
        'e9f000d1-0000-4000-8000-000000000001', 'TRY');
insert into public.payment_plans
  (id, organization_id, property_id, reservation_id, currency, created_by)
values ('e9aa00d1-0000-4000-8000-000000000001',
        'e9a11111-1111-4111-8111-111111111111',
        'e9b44444-4444-4444-8444-444444444444',
        'e9e000d1-0000-4000-8000-000000000001', 'TRY',
        'e9222222-2222-4222-8222-222222222222');
insert into public.plan_instalments
  (organization_id, property_id, plan_id, ordinal, amount_minor, due_on, revision)
values ('e9a11111-1111-4111-8111-111111111111',
        'e9b44444-4444-4444-8444-444444444444',
        'e9aa00d1-0000-4000-8000-000000000001', 1, 1000, pg_temp.today(), 1);

-- A Resident in house at each of the two Properties a day apart. The instalment
-- at Kiritimati falls due on its own today; the one at Pago Pago the day after
-- its own, which is a date Kiritimati has already reached. No single date can
-- be right for both (PP-S1-16).
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity)
select ('e9c000e' || n || '-0000-4000-8000-000000000001')::uuid,
       case n when 1 then 'e9b55555-5555-4555-8555-555555555555'::uuid
              else 'e9b66666-6666-4666-8666-666666666666'::uuid end,
       'e9a11111-1111-4111-8111-111111111111', 'PP-CLOCK-' || n, 'room', 1
  from generate_series(1, 2) as n;

create function pg_temp.clock_today(clock_property uuid) returns date
language sql stable
as $$ select app.property_today(clock_property) $$;
grant execute on function pg_temp.clock_today(uuid) to public;

insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id,
   stay_type, status, starts_on, ends_on)
select ('e9e000e' || n || '-0000-4000-8000-000000000001')::uuid,
       'e9a11111-1111-4111-8111-111111111111', clock.property_id,
       ('e9c000e' || n || '-0000-4000-8000-000000000001')::uuid,
       'e9d00000-0000-4000-8000-000000000001', 'resident', 'checked_in',
       pg_temp.clock_today(clock.property_id) - 30,
       pg_temp.clock_today(clock.property_id) + 100
  from (values (1, 'e9b55555-5555-4555-8555-555555555555'::uuid),
               (2, 'e9b66666-6666-4666-8666-666666666666'::uuid)) as clock (n, property_id);

insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, reservation_id,
   stay_type, status, starts_on, ends_on)
select ('e9f000e' || n || '-0000-4000-8000-000000000001')::uuid, reservation.organization_id,
       reservation.property_id, reservation.accommodation_unit_id, reservation.id,
       'resident', 'in_house', reservation.starts_on, reservation.ends_on
  from public.reservations as reservation
  cross join generate_series(1, 2) as n
 where reservation.id = ('e9e000e' || n || '-0000-4000-8000-000000000001')::uuid;

insert into public.folios (id, organization_id, property_id, stay_id, currency)
select ('e9a000e' || n || '-0000-4000-8000-000000000001')::uuid, stay.organization_id,
       stay.property_id, stay.id, 'TRY'
  from public.stays as stay
  cross join generate_series(1, 2) as n
 where stay.id = ('e9f000e' || n || '-0000-4000-8000-000000000001')::uuid;

insert into public.payment_plans
  (id, organization_id, property_id, reservation_id, currency, created_by)
select ('e9aa00e' || n || '-0000-4000-8000-000000000001')::uuid, reservation.organization_id,
       reservation.property_id, reservation.id, 'TRY',
       'e9222222-2222-4222-8222-222222222222'
  from public.reservations as reservation
  cross join generate_series(1, 2) as n
 where reservation.id = ('e9e000e' || n || '-0000-4000-8000-000000000001')::uuid;

insert into public.plan_instalments
  (organization_id, property_id, plan_id, ordinal, amount_minor, due_on, revision)
select plan.organization_id, plan.property_id, plan.id, 1, 1000,
       pg_temp.clock_today(plan.property_id)
         + case plan.property_id when 'e9b55555-5555-4555-8555-555555555555' then 0 else 1 end,
       1
  from public.payment_plans as plan
 where plan.id in ('e9aa00e1-0000-4000-8000-000000000001',
                   'e9aa00e2-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- The plan
-- ---------------------------------------------------------------------------

set local role ranza_app;
select app.set_request_context('e9222222-2222-4222-8222-222222222222');

select lives_ok(
  $$ select * from app.create_payment_plan(
       'e9e00001-0000-4000-8000-000000000001',
       jsonb_build_array(
         jsonb_build_object('amountMinor', 100000, 'dueOn', pg_temp.today() + 60),
         jsonb_build_object('amountMinor', 100000, 'dueOn', pg_temp.today() + 5),
         jsonb_build_object('amountMinor', 100000, 'dueOn', pg_temp.today() + 30)) ) $$,
  'PP-S1-01: a Front desk member makes the plan of a Resident booking');

select results_eq(
  $$ select instalment.ordinal, instalment.due_on - pg_temp.today(),
            instalment.revision
       from public.plan_instalments as instalment
       join public.payment_plans as plan on plan.id = instalment.plan_id
      where plan.reservation_id = 'e9e00001-0000-4000-8000-000000000001'
      order by instalment.ordinal $$,
  $$ values (1, 5, 1), (2, 30, 1), (3, 60, 1) $$,
  'PP-S1-01: its instalments are numbered in due-date order whatever order they were given in');

select is(
  (select trim(plan.currency) || ':' || plan.created_by::text
     from public.payment_plans as plan
    where plan.reservation_id = 'e9e00001-0000-4000-8000-000000000001'),
  'TRY:e9222222-2222-4222-8222-222222222222',
  'PP-S1-01: the plan is in the Property''s currency and names who made it');

select throws_ok(
  $$ select * from app.create_payment_plan(
       'e9e00001-0000-4000-8000-000000000001',
       jsonb_build_array(
         jsonb_build_object('amountMinor', 100000, 'dueOn', pg_temp.today() + 5))) $$,
  '23505', null,
  'PP-S1-02: a booking has one plan');

select throws_ok(
  $$ select * from app.create_payment_plan(
       'e9e00002-0000-4000-8000-000000000001',
       jsonb_build_array(
         jsonb_build_object('amountMinor', 100000, 'dueOn', pg_temp.today() + 2))) $$,
  'RZP01', null,
  'PP-S1-03: a Guest booking takes no plan');

select throws_ok(
  $$ select * from app.create_payment_plan(
       'e9e00003-0000-4000-8000-000000000001',
       jsonb_build_array(
         jsonb_build_object('amountMinor', 100000, 'dueOn', pg_temp.today() + 6))) $$,
  'RZP02', null,
  'PP-S1-04: a plan needs the booking to have a departure date');

reset role;

select throws_ok(
  $$ update public.reservations set ends_on = null
      where id = 'e9e00001-0000-4000-8000-000000000001' $$,
  'RZP02', null,
  'PP-S1-04: and a booking with a plan cannot be made open-ended');

set local role ranza_app;
select app.set_request_context('e9222222-2222-4222-8222-222222222222');

select throws_ok(
  $$ select * from app.create_payment_plan(
       'e9e00008-0000-4000-8000-000000000001',
       jsonb_build_array(
         jsonb_build_object('amountMinor', 100000, 'dueOn', pg_temp.today() + 91))) $$,
  'RZP03', null,
  'PP-S1-05: an instalment cannot fall due after the term ends');

select lives_ok(
  $$ select * from app.create_payment_plan(
       'e9e00008-0000-4000-8000-000000000001',
       jsonb_build_array(
         jsonb_build_object('amountMinor', 100000, 'dueOn', pg_temp.today() + 1),
         jsonb_build_object('amountMinor', 100000, 'dueOn', pg_temp.today() + 90))) $$,
  'PP-S1-05: one that falls due before the term starts, or on the last day of it, is accepted');

select throws_ok(
  $$ select * from app.create_payment_plan(
       'e9e00006-0000-4000-8000-000000000001',
       jsonb_build_array(
         jsonb_build_object('amountMinor', 100000, 'dueOn', pg_temp.today() + 6))) $$,
  'RZP05', null,
  'PP-S1-06: a booking that has ended takes no plan');

select throws_ok(
  $$ select * from app.create_payment_plan(
       'e9e00009-0000-4000-8000-000000000001', '[]'::jsonb) $$,
  '22023', null,
  'PP-S1-07: a plan has between one and sixty instalments of a positive amount (none)');

select throws_ok(
  $$ select * from app.create_payment_plan(
       'e9e00009-0000-4000-8000-000000000001',
       (select jsonb_agg(jsonb_build_object('amountMinor', 1000,
                                           'dueOn', pg_temp.today() + 10))
          from generate_series(1, 61))) $$,
  '22023', null,
  'PP-S1-07: sixty-one is too many');

select throws_ok(
  $$ select * from app.create_payment_plan(
       'e9e00009-0000-4000-8000-000000000001',
       jsonb_build_array(
         jsonb_build_object('amountMinor', 0, 'dueOn', pg_temp.today() + 10))) $$,
  '23514', null,
  'PP-S1-07: an amount of nothing is refused by the table');

-- Who may.
reset role;
set local role ranza_app;
select app.set_request_context('e9444444-4444-4444-8444-444444444444');
select throws_ok(
  $$ select * from app.create_payment_plan(
       'e9e00009-0000-4000-8000-000000000001',
       jsonb_build_array(
         jsonb_build_object('amountMinor', 1000, 'dueOn', pg_temp.today() + 10))) $$,
  '42501', null,
  'PP-S1-08: a Housekeeping member makes no plan');

select app.set_request_context('e9333333-3333-4333-8333-333333333333');
select throws_ok(
  $$ select * from app.create_payment_plan(
       'e9e00009-0000-4000-8000-000000000001',
       jsonb_build_array(
         jsonb_build_object('amountMinor', 1000, 'dueOn', pg_temp.today() + 10))) $$,
  '42501', null,
  'PP-S1-08: nor does Finance, which holds no front_desk.book; the plan is the booking''s');

select app.set_request_context('e9555555-5555-4555-8555-555555555555');
select throws_ok(
  $$ select * from app.create_payment_plan(
       'e9e00009-0000-4000-8000-000000000001',
       jsonb_build_array(
         jsonb_build_object('amountMinor', 1000, 'dueOn', pg_temp.today() + 10))) $$,
  '42501', null,
  'PP-S1-08: nor a member of another Organization');

select app.set_request_context('e9666666-6666-4666-8666-666666666666');
select throws_ok(
  $$ select * from app.create_payment_plan(
       'e9e00009-0000-4000-8000-000000000001',
       jsonb_build_array(
         jsonb_build_object('amountMinor', 1000, 'dueOn', pg_temp.today() + 10))) $$,
  '42501', null,
  'PP-S1-08: nor a Front desk member of this Organization who reaches only another Property');

select app.set_request_context('e9222222-2222-4222-8222-222222222222');
select throws_ok(
  $$ select * from app.create_payment_plan(
       'e9e00007-0000-4000-8000-000000000001',
       jsonb_build_array(
         jsonb_build_object('amountMinor', 1000, 'dueOn', pg_temp.today() + 10))) $$,
  'RZP06', null,
  'PP-S1-08: nor at a Property that keeps no Folios, where nothing could be charged');

-- The rest of the plans the suite charges, made by the desk as a desk does.
select lives_ok(
  $$ select * from app.create_payment_plan(
       'e9e00004-0000-4000-8000-000000000001',
       jsonb_build_array(
         jsonb_build_object('amountMinor', 100000, 'dueOn', pg_temp.today() - 30),
         jsonb_build_object('amountMinor', 100000, 'dueOn', pg_temp.today() - 1),
         jsonb_build_object('amountMinor', 100000, 'dueOn', pg_temp.today()),
         jsonb_build_object('amountMinor', 100000, 'dueOn', pg_temp.today() + 1),
         jsonb_build_object('amountMinor', 100000, 'dueOn', pg_temp.today() + 30))) $$,
  'PP-S1-14: set up: the in-house Resident''s plan of five instalments');

select lives_ok(
  $$ select * from app.create_payment_plan(
       'e9e00005-0000-4000-8000-000000000001',
       jsonb_build_array(
         jsonb_build_object('amountMinor', 50000, 'dueOn', pg_temp.today() - 5),
         jsonb_build_object('amountMinor', 50000, 'dueOn', pg_temp.today() + 25))) $$,
  'PP-S1-17: set up: the Resident who has not arrived, with an instalment already due');

select lives_ok(
  $$ select * from app.create_payment_plan(
       'e9e00009-0000-4000-8000-000000000001',
       jsonb_build_array(
         jsonb_build_object('amountMinor', 1000, 'dueOn', pg_temp.today() + 10),
         jsonb_build_object('amountMinor', 1000, 'dueOn', pg_temp.today() + 40),
         jsonb_build_object('amountMinor', 1000, 'dueOn', pg_temp.today() + 70))) $$,
  'PP-S1-24: set up: the booking that will be cancelled has a plan');

select lives_ok(
  $$ select * from app.create_payment_plan(
       'e9e0000a-0000-4000-8000-000000000001',
       jsonb_build_array(
         jsonb_build_object('amountMinor', 1000, 'dueOn', pg_temp.today()),
         jsonb_build_object('amountMinor', 1000, 'dueOn', pg_temp.today() + 5),
         jsonb_build_object('amountMinor', 1000, 'dueOn', pg_temp.today() + 15))) $$,
  'PP-S1-24: set up: the in-house booking that will be checked out has a plan');

select lives_ok(
  $$ select * from app.create_payment_plan(
       'e9e0000b-0000-4000-8000-000000000001',
       jsonb_build_array(
         jsonb_build_object('amountMinor', 1000, 'dueOn', pg_temp.today()))) $$,
  'PP-S1-18: set up: the Resident whose Folio will be closed has an instalment due');

-- ---------------------------------------------------------------------------
-- Nobody writes a plan directly, and plans are read by reach
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.payment_plans
       (organization_id, property_id, reservation_id, currency, created_by)
     values ('e9a11111-1111-4111-8111-111111111111',
             'e9b11111-1111-4111-8111-111111111111',
             'e9e00005-0000-4000-8000-000000000001', 'TRY',
             'e9222222-2222-4222-8222-222222222222') $$,
  '42501', null,
  'PP-S1-09: the application role inserts no plan');

select throws_ok(
  $$ update public.plan_instalments set amount_minor = 1 $$,
  '42501', null,
  'PP-S1-09: changes no amount');

select throws_ok(
  $$ delete from public.plan_instalments $$,
  '42501', null,
  'PP-S1-09: and deletes no instalment');

reset role;

select is_empty(
  $$ select privilege_type from information_schema.table_privileges
      where table_schema = 'public'
        and table_name in ('payment_plans', 'plan_instalments')
        and grantee in ('ranza_app', 'ranza_auth', 'ranza_worker')
        and privilege_type <> 'SELECT' $$,
  'PP-S1-09: nothing but select is granted on either table to any runtime role');

select is_empty(
  $$ select 1 from information_schema.table_privileges
      where table_schema = 'public'
        and table_name in ('payment_plans', 'plan_instalments')
        and grantee in ('ranza_auth', 'ranza_worker') $$,
  'PP-S1-20: the worker and the credentials role hold nothing on either table');

select set_eq(
  $$ select column_name::text from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'plan_instalments'
        and grantee = 'ranza_app' and privilege_type = 'UPDATE' $$,
  array['withdrawn_at', 'withdrawn_reason'],
  'PP-S1-09: the one thing the application role may write is the withdrawal of an instalment');

select is(
  (select count(*)::int from pg_class
    where oid in ('public.payment_plans'::regclass, 'public.plan_instalments'::regclass)
      and relrowsecurity and relforcerowsecurity),
  2,
  'PP-S1-09: both tables are under row-level security, forced on their owner too');

set local role ranza_app;
select app.set_request_context('e9555555-5555-4555-8555-555555555555');

select is(
  (select count(*)::int from public.payment_plans)
  + (select count(*)::int from public.plan_instalments),
  0,
  'PP-S1-10: a member of another Organization reads no plan and no instalment');

select app.set_request_context('e9222222-2222-4222-8222-222222222222');

select ok(
  (select count(*) from public.payment_plans) >= 6
  and (select count(*) from public.plan_instalments) >= 12,
  'PP-S1-10: a member with reach reads them');

reset role;

-- ---------------------------------------------------------------------------
-- The worker
-- ---------------------------------------------------------------------------

-- Two more waiting reasons (PP-S1-18): a Folio that was closed, and a plan in a
-- currency the Folio does not trade in.
update public.stays set status = 'departed'
 where id = 'e9f0000b-0000-4000-8000-000000000001';
update public.folios set status = 'closed', closed_at = now()
 where id = 'e9a0000b-0000-4000-8000-000000000001';

insert into public.payment_plans
  (id, organization_id, property_id, reservation_id, currency, created_by)
values ('e9aa0012-0000-4000-8000-000000000001',
        'e9a11111-1111-4111-8111-111111111111',
        'e9b11111-1111-4111-8111-111111111111',
        'e9e0000c-0000-4000-8000-000000000001', 'USD',
        'e9222222-2222-4222-8222-222222222222');
insert into public.plan_instalments
  (organization_id, property_id, plan_id, ordinal, amount_minor, due_on, revision)
values ('e9a11111-1111-4111-8111-111111111111',
        'e9b11111-1111-4111-8111-111111111111',
        'e9aa0012-0000-4000-8000-000000000001', 1, 1000, pg_temp.today(), 1);

-- A Resident arrives late (PP-S1-17): the Folio the instalment waits for does
-- not exist yet.
reset role;
set local role ranza_worker;

select is(
  (select count(*)::int from app.properties_with_instalments_due()
    where property_id = 'e9b11111-1111-4111-8111-111111111111'),
  1,
  'PP-S1-14: the worker is told which Property has something to charge, by id');

select is(
  (select count(*)::int from app.properties_with_instalments_due()
    where property_id in ('e9b22222-2222-4222-8222-222222222222',
                          'e9b33333-3333-4333-8333-333333333333')),
  0,
  'PP-S1-19: and not the Properties that have nothing, or keep no Folios');

select throws_ok(
  $$ select * from app.post_due_instalments('e9b11111-1111-4111-8111-111111111111') $$,
  '42501', 'charging instalments requires a worker context',
  'PP-S1-21: charging needs a worker context');

select app.set_worker_context('e9a22222-2222-4222-8222-222222222222', 'payment_plans.post');

select throws_ok(
  $$ select * from app.post_due_instalments('e9b11111-1111-4111-8111-111111111111') $$,
  '42501', 'those instalments cannot be charged',
  'PP-S1-21: a context for another Organization charges nothing of this one');

select throws_ok(
  $$ select * from app.post_due_instalments('e9b99999-9999-4999-8999-999999999999') $$,
  '42501', 'those instalments cannot be charged',
  'PP-S1-21: and gets the same answer for a Property that does not exist');

select app.set_worker_context('e9a11111-1111-4111-8111-111111111111', 'payment_plans.post');

select results_eq(
  $$ select posted, waiting from app.post_due_instalments('e9b11111-1111-4111-8111-111111111111') $$,
  $$ values (4, 3) $$,
  'PP-S1-14: four instalments are charged, three of the in-house Resident''s and one due today; the one that is late, the Folio that is closed and the plan in another currency wait');

reset role;

select results_eq(
  $$ select line.description, line.business_date - pg_temp.today(), line.amount_minor,
            line.line_type, line.source
       from public.folio_lines as line
      where line.folio_id = 'e9a00004-0000-4000-8000-000000000001'
      order by line.business_date $$,
  $$ values ('Instalment 1 of 5', -30, 100000::bigint, 'charge', 'instalment'),
            ('Instalment 2 of 5', -1, 100000::bigint, 'charge', 'instalment'),
            ('Instalment 3 of 5', 0, 100000::bigint, 'charge', 'instalment') $$,
  'PP-S1-14: each is a charge on the Resident''s Folio, dated the day it fell due, numbered of the plan');

select is(
  (select count(*)::int from public.folio_lines
    where instalment_id in (
      select instalment.id from public.plan_instalments as instalment
       join public.payment_plans as plan on plan.id = instalment.plan_id
      where plan.reservation_id = 'e9e00004-0000-4000-8000-000000000001'
        and instalment.due_on > pg_temp.today())),
  0,
  'PP-S1-16: an instalment that falls due tomorrow, or later, is not charged');

select results_eq(
  $$ select property_id::text from app.instalments_ready()
      where property_id in ('e9b55555-5555-4555-8555-555555555555',
                            'e9b66666-6666-4666-8666-666666666666') $$,
  $$ values ('e9b55555-5555-4555-8555-555555555555') $$,
  'PP-S1-16: each Property is asked about its own date: the instalment due today at Kiritimati is ready, the one due tomorrow at Pago Pago is not');

set local role ranza_app;
select app.set_request_context('e9111111-1111-4111-8111-111111111111');

select is(
  (select state from app.payment_plan_standing('e9b55555-5555-4555-8555-555555555555'))
  || ',' ||
  (select state from app.payment_plan_standing('e9b66666-6666-4666-8666-666666666666')),
  'due,upcoming',
  'PP-S1-25: and the standing is read by the Property''s own date too');

reset role;

set local role ranza_worker;
select app.set_worker_context('e9a11111-1111-4111-8111-111111111111', 'payment_plans.post');

select results_eq(
  $$ select posted, waiting from app.post_due_instalments('e9b11111-1111-4111-8111-111111111111') $$,
  $$ values (0, 3) $$,
  'PP-S1-15: a second pass charges nothing');

reset role;

select throws_ok(
  $$ insert into public.folio_lines
       (organization_id, property_id, folio_id, line_type, description,
        amount_minor, source, business_date, instalment_id)
     select plan.organization_id, plan.property_id,
            'e9a00004-0000-4000-8000-000000000001', 'charge', 'Again',
            instalment.amount_minor, 'instalment', instalment.due_on, instalment.id
       from public.plan_instalments as instalment
       join public.payment_plans as plan on plan.id = instalment.plan_id
      where plan.reservation_id = 'e9e00004-0000-4000-8000-000000000001'
        and instalment.ordinal = 1 $$,
  '23505', null,
  'PP-S1-15: and a second line for one instalment is refused, from any writer, by the unique key');

select is(
  (select count(*)::int from outbox.events
    where event_type = 'instalment.posted'
      and organization_id = 'e9a11111-1111-4111-8111-111111111111'),
  4,
  'PP-S1-22: charging an instalment publishes instalment.posted');

select is(
  (select array_agg(key order by key)::text from (
     select jsonb_object_keys(payload) as key from outbox.events
      where event_type = 'instalment.posted'
      limit 7) as published),
  '{amountMinor,dueOn,folioLineId,instalmentId,planId,propertyId,reservationId}',
  'PP-S1-22: with ids, the date and the amount, and no name');

-- Late: the Resident has not arrived, so there is no Folio.
select is(
  (select count(*)::int from public.folio_lines
    where instalment_id in (
      select instalment.id from public.plan_instalments as instalment
       join public.payment_plans as plan on plan.id = instalment.plan_id
      where plan.reservation_id = 'e9e00005-0000-4000-8000-000000000001')),
  0,
  'PP-S1-17: an instalment fallen due before the Resident has a Folio is not charged');

insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, reservation_id,
   stay_type, status, starts_on, ends_on)
select 'e9f00005-0000-4000-8000-000000000001', reservation.organization_id,
       reservation.property_id, reservation.accommodation_unit_id, reservation.id,
       'resident', 'in_house', reservation.starts_on, reservation.ends_on
  from public.reservations as reservation
 where reservation.id = 'e9e00005-0000-4000-8000-000000000001';
update public.reservations set status = 'checked_in'
 where id = 'e9e00005-0000-4000-8000-000000000001';
insert into public.folios (id, organization_id, property_id, stay_id, currency)
values ('e9a00005-0000-4000-8000-000000000001',
        'e9a11111-1111-4111-8111-111111111111',
        'e9b11111-1111-4111-8111-111111111111',
        'e9f00005-0000-4000-8000-000000000001', 'TRY');

set local role ranza_worker;
select app.set_worker_context('e9a11111-1111-4111-8111-111111111111', 'payment_plans.post');

select results_eq(
  $$ select posted, waiting from app.post_due_instalments('e9b11111-1111-4111-8111-111111111111') $$,
  $$ values (1, 2) $$,
  'PP-S1-17: the pass after the Resident checks in charges the instalment that was waiting');

reset role;

select results_eq(
  $$ select line.description, line.business_date - pg_temp.today()
       from public.folio_lines as line where line.folio_id = 'e9a00005-0000-4000-8000-000000000001' $$,
  $$ values ('Instalment 1 of 2', -5) $$,
  'PP-S1-17: dated the day it fell due, though it was charged days after');

select is(
  (select count(*)::int from public.folio_lines
    where folio_id in ('e9a0000b-0000-4000-8000-000000000001',
                       'e9a0000c-0000-4000-8000-000000000001')),
  0,
  'PP-S1-18: a closed Folio, and a Folio in another currency than the plan''s, are not charged; both wait and neither fails the pass');

-- Said again of the definition of ready itself, which the discovery and the
-- charging both ask: the loop that charges would also decline these, so only
-- asking it directly shows that it does not offer them (PP-S1-14).
select is_empty(
  $$ select 1 from app.instalments_ready('e9b11111-1111-4111-8111-111111111111')
      where reservation_id in ('e9e0000b-0000-4000-8000-000000000001',
                               'e9e0000c-0000-4000-8000-000000000001') $$,
  'PP-S1-18: neither a closed Folio nor a Folio in another currency is ready');

select is_empty(
  $$ select 1 from app.instalments_ready('e9b11111-1111-4111-8111-111111111111') as ready
       join public.folio_lines as line on line.instalment_id = ready.instalment_id $$,
  'PP-S1-15: an instalment that was charged is not ready again');

-- Two more instalments of the Resident who arrived late, both fallen due today:
-- one stays live, the other is withdrawn.
insert into public.plan_instalments
  (organization_id, property_id, plan_id, ordinal, amount_minor, due_on, revision,
   withdrawn_at, withdrawn_reason)
select plan.organization_id, plan.property_id, plan.id, extra.ordinal, 1000,
       pg_temp.today(), 1,
       case when extra.ordinal = 4 then current_timestamp end,
       case when extra.ordinal = 4 then 'revised' end
  from public.payment_plans as plan
 cross join (values (3), (4)) as extra (ordinal)
 where plan.reservation_id = 'e9e00005-0000-4000-8000-000000000001';

select is(
  (select array_agg(instalment.ordinal order by instalment.ordinal)::text
     from app.instalments_ready('e9b11111-1111-4111-8111-111111111111') as ready
     join public.plan_instalments as instalment on instalment.id = ready.instalment_id
    where ready.reservation_id = 'e9e00005-0000-4000-8000-000000000001'),
  '{3}',
  'PP-S1-23: what is ready is the live instalment fallen due and not the withdrawn one');

-- Billing unavailable at the Property: nothing is charged and it is not found.
update public.property_capabilities set enabled = false
 where property_id = 'e9b11111-1111-4111-8111-111111111111'
   and capability_key = 'finance';

set local role ranza_worker;
select app.set_worker_context('e9a11111-1111-4111-8111-111111111111', 'payment_plans.post');

select results_eq(
  $$ select posted, waiting from app.post_due_instalments('e9b11111-1111-4111-8111-111111111111') $$,
  $$ values (0, 0) $$,
  'PP-S1-19: a Property whose billing is unavailable is charged nothing');

select is(
  (select count(*)::int from app.properties_with_instalments_due()
    where property_id in ('e9b11111-1111-4111-8111-111111111111',
                          'e9b44444-4444-4444-8444-444444444444')),
  0,
  'PP-S1-19: and is not found by the discovery, nor is the archived Property that has an instalment due');

select results_eq(
  $$ select posted, waiting from app.post_due_instalments('e9b44444-4444-4444-8444-444444444444') $$,
  $$ values (0, 0) $$,
  'PP-S1-19: an archived Property is charged nothing');

reset role;

update public.property_capabilities set enabled = true
 where property_id = 'e9b11111-1111-4111-8111-111111111111'
   and capability_key = 'finance';

select is(
  (select array_agg(who order by who)::text from (
     select r.rolname::text || ':' || has_function_privilege(r.rolname,
              to_regprocedure('app.post_due_instalments(uuid)'), 'execute') as who
       from pg_roles r where r.rolname in ('ranza_app', 'ranza_auth', 'ranza_worker')
     union all
     select r.rolname::text || ':' || has_function_privilege(r.rolname,
              to_regprocedure('app.properties_with_instalments_due()'), 'execute')
       from pg_roles r where r.rolname in ('ranza_app', 'ranza_auth', 'ranza_worker')
     ) as asked),
  '{ranza_app:false,ranza_app:false,ranza_auth:false,ranza_auth:false,ranza_worker:true,ranza_worker:true}',
  'PP-S1-20: only the worker may execute the discovery and the charging');

select is(
  (select array_agg(has_function_privilege(r.rolname,
            to_regprocedure('app.instalments_ready(uuid)'), 'execute') order by r.rolname)::text
     from pg_roles r where r.rolname in ('ranza_app', 'ranza_auth', 'ranza_worker')),
  '{f,f,f}',
  'PP-S1-20: the shared definition of ready is executable by no runtime role');

-- ---------------------------------------------------------------------------
-- Where an instalment stands, and the overdue figure
-- ---------------------------------------------------------------------------

set local role ranza_app;
select app.set_request_context('e9222222-2222-4222-8222-222222222222');

select results_eq(
  $$ select number, state, outstanding_minor, posted
       from app.payment_plan_standing('e9b11111-1111-4111-8111-111111111111',
                                      'e9e00004-0000-4000-8000-000000000001') $$,
  $$ values (1, 'overdue', 100000::bigint, true),
            (2, 'overdue', 100000::bigint, true),
            (3, 'due', 100000::bigint, true),
            (4, 'upcoming', 100000::bigint, false),
            (5, 'upcoming', 100000::bigint, false) $$,
  'PP-S1-25: unpaid and past its due date is overdue, due today is due, and later is upcoming');

select results_eq(
  $$ select students, instalments, outstanding_minor, currency
       from app.payment_plans_overdue('e9b11111-1111-4111-8111-111111111111') $$,
  $$ values (2, 3, 250000::bigint, 'TRY') $$,
  'PP-S1-29: two students are overdue, on three instalments, for 2,500.00, in the Property''s currency');

select results_eq(
  $$ select students, instalments, outstanding_minor, currency
       from app.payment_plans_overdue('e9b22222-2222-4222-8222-222222222222') $$,
  $$ values (0, 0, 0::bigint, 'TRY') $$,
  'PP-S1-29: where nobody is overdue the figure is zero and still names the currency');

select app.set_request_context('e9555555-5555-4555-8555-555555555555');

select is(
  (select count(*)::int from app.payment_plan_standing('e9b11111-1111-4111-8111-111111111111')),
  0,
  'PP-S1-30: a member of another Organization reads no standing');

select results_eq(
  $$ select students, instalments, outstanding_minor
       from app.payment_plans_overdue('e9b11111-1111-4111-8111-111111111111') $$,
  $$ values (0, 0, 0::bigint) $$,
  'PP-S1-30: and an overdue figure of nothing');

reset role;

-- A payment of one and a half instalments.
insert into public.folio_lines
  (organization_id, property_id, folio_id, line_type, description, amount_minor,
   payment_method)
values ('e9a11111-1111-4111-8111-111111111111',
        'e9b11111-1111-4111-8111-111111111111',
        'e9a00004-0000-4000-8000-000000000001', 'payment', 'Cash on account',
        -150000, 'cash');

select results_eq(
  $$ select number, state, paid_minor, outstanding_minor
       from app.payment_plan_standing('e9b11111-1111-4111-8111-111111111111',
                                      'e9e00004-0000-4000-8000-000000000001')
      where number <= 3 $$,
  $$ values (1, 'paid', 100000::bigint, 0::bigint),
            (2, 'overdue', 50000::bigint, 50000::bigint),
            (3, 'due', 0::bigint, 100000::bigint) $$,
  'PP-S1-26: a payment settles the oldest instalment first, and what is left of the second is outstanding');

set local role ranza_app;
select app.set_request_context('e9222222-2222-4222-8222-222222222222');

select results_eq(
  $$ select students, instalments, outstanding_minor
       from app.payment_plans_overdue('e9b11111-1111-4111-8111-111111111111') $$,
  $$ values (2, 2, 100000::bigint) $$,
  'PP-S1-29: the overdue figure is what is still owed, net of what was paid');

reset role;

-- The payment is reversed, by somebody who may.
select app.set_request_context('e9333333-3333-4333-8333-333333333333');
insert into public.folio_lines
  (organization_id, property_id, folio_id, line_type, description, amount_minor,
   reverses_line_id)
select line.organization_id, line.property_id, line.folio_id, 'reversal',
       'Cash reversed', 150000, line.id
  from public.folio_lines as line
 where line.folio_id = 'e9a00004-0000-4000-8000-000000000001'
   and line.line_type = 'payment';

select results_eq(
  $$ select number, state, outstanding_minor
       from app.payment_plan_standing('e9b11111-1111-4111-8111-111111111111',
                                      'e9e00004-0000-4000-8000-000000000001')
      where number <= 2 $$,
  $$ values (1, 'overdue', 100000::bigint), (2, 'overdue', 100000::bigint) $$,
  'PP-S1-27: a reversed payment re-opens the instalments it had paid');

-- The first instalment's charge is reversed (waived), and 1,000.00 is paid.
insert into public.folio_lines
  (organization_id, property_id, folio_id, line_type, description, amount_minor,
   reverses_line_id)
select line.organization_id, line.property_id, line.folio_id, 'reversal',
       'Waived', -line.amount_minor, line.id
  from public.folio_lines as line
 where line.folio_id = 'e9a00004-0000-4000-8000-000000000001'
   and line.instalment_id is not null
   and line.business_date = pg_temp.today() - 30;

insert into public.folio_lines
  (organization_id, property_id, folio_id, line_type, description, amount_minor,
   payment_method)
values ('e9a11111-1111-4111-8111-111111111111',
        'e9b11111-1111-4111-8111-111111111111',
        'e9a00004-0000-4000-8000-000000000001', 'payment', 'Cash again',
        -100000, 'cash');

select results_eq(
  $$ select number, state, outstanding_minor
       from app.payment_plan_standing('e9b11111-1111-4111-8111-111111111111',
                                      'e9e00004-0000-4000-8000-000000000001')
      where number <= 3 $$,
  $$ values (1, 'waived', 0::bigint), (2, 'paid', 0::bigint),
            (3, 'due', 100000::bigint) $$,
  'PP-S1-28: a waived instalment owes nothing and covers none of the payment, which falls to the next');

-- ---------------------------------------------------------------------------
-- The ledger
-- ---------------------------------------------------------------------------

set local role ranza_worker;
select app.set_worker_context('e9a11111-1111-4111-8111-111111111111', 'ledger-test');

select lives_ok(
  $$ select app.post_folio_line_to_ledger(event.id)
       from outbox.events as event
      where event.event_type = 'folio.line_posted'
        and event.payload ->> 'source' = 'instalment'
        and event.payload ->> 'folioId' = 'e9a00004-0000-4000-8000-000000000001' $$,
  'PP-S1-31: the worker posts every instalment line of the Folio to the ledger');

select lives_ok(
  $$ select app.post_folio_line_to_ledger(event.id)
       from outbox.events as event
      where event.event_type = 'folio.line_posted'
        and event.payload ->> 'reversedOriginalSource' = 'instalment' $$,
  'PP-S1-31: and the reversal of one');

reset role;

select lives_ok(
  $$ set constraints finance.journal_entry_balance_check, finance.journal_entry_has_lines_check immediate $$,
  'PP-S1-31: the entries the worker wrote balance, and each has its lines');

select results_eq(
  $$ select account.code, journal_line.direction
       from finance.journal_entries as entry
       join finance.journal_lines as journal_line on journal_line.journal_entry_id = entry.id
       join finance.accounts as account on account.id = journal_line.account_id
      where entry.source_id = (select line.id from public.folio_lines as line
                                where line.folio_id = 'e9a00004-0000-4000-8000-000000000001'
                                  and line.business_date = pg_temp.today() - 1
                                  and line.source = 'instalment')
        and account.code <> '1200' $$,
  $$ values ('4000', 'credit') $$,
  'PP-S1-31: an instalment credits Accommodation Revenue, and not Other Revenue');

select results_eq(
  $$ select account.code, journal_line.direction
       from finance.journal_entries as entry
       join finance.journal_lines as journal_line on journal_line.journal_entry_id = entry.id
       join finance.accounts as account on account.id = journal_line.account_id
      where entry.source_id = (select line.id from public.folio_lines as line
                                where line.folio_id = 'e9a00004-0000-4000-8000-000000000001'
                                  and line.reverses_line_id in (
                                    select original.id from public.folio_lines as original
                                     where original.instalment_id is not null))
        and account.code <> '1200' $$,
  $$ values ('4000', 'debit') $$,
  'PP-S1-31: and the reversal of one debits it');

-- ---------------------------------------------------------------------------
-- History
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ update public.plan_instalments set withdrawn_at = now(), withdrawn_reason = 'revised'
      where plan_id = (select id from public.payment_plans
                        where reservation_id = 'e9e00004-0000-4000-8000-000000000001')
        and ordinal = 1 $$,
  'RZP04', 'an instalment that was charged is history',
  'PP-S1-13: a charged instalment cannot be withdrawn, by any writer');

select throws_ok(
  $$ update public.plan_instalments set amount_minor = 1
      where plan_id = (select id from public.payment_plans
                        where reservation_id = 'e9e00004-0000-4000-8000-000000000001')
        and ordinal = 5 $$,
  'RZP04', 'an instalment is never changed, only withdrawn',
  'PP-S1-13: nor can one that was not charged be changed; only withdrawn');

select throws_ok(
  $$ delete from public.plan_instalments
      where plan_id = (select id from public.payment_plans
                        where reservation_id = 'e9e00004-0000-4000-8000-000000000001') $$,
  'RZP04', 'an instalment is never deleted',
  'PP-S1-13: or deleted');

select throws_ok(
  $$ delete from public.payment_plans
      where reservation_id = 'e9e00004-0000-4000-8000-000000000001' $$,
  'RZP04', 'a payment plan is never deleted',
  'PP-S1-13: and neither is a plan');

select throws_ok(
  $$ update public.payment_plans set currency = 'EUR'
      where reservation_id = 'e9e00004-0000-4000-8000-000000000001' $$,
  'RZP04', 'a payment plan changes only by being revised',
  'PP-S1-13: or changed but by a revision');

-- ---------------------------------------------------------------------------
-- Revising
-- ---------------------------------------------------------------------------

set local role ranza_app;
select app.set_request_context('e9222222-2222-4222-8222-222222222222');

select throws_ok(
  $$ select * from app.revise_payment_plan(
       'e9e00004-0000-4000-8000-000000000001',
       jsonb_build_array(
         jsonb_build_object('amountMinor', 1000, 'dueOn', pg_temp.today() + 40))) $$,
  '42501', null,
  'PP-S1-12: the front desk makes a plan and does not revise it');

select app.set_request_context('e9777777-7777-4777-8777-777777777777');

select throws_ok(
  $$ select * from app.revise_payment_plan(
       'e9e00004-0000-4000-8000-000000000001',
       jsonb_build_array(
         jsonb_build_object('amountMinor', 1000, 'dueOn', pg_temp.today() + 40))) $$,
  '42501', null,
  'PP-S1-12: nor does a Finance member who reaches only another Property');

select app.set_request_context('e9333333-3333-4333-8333-333333333333');

select results_eq(
  $$ select plan_revision, withdrawn_count, added_count, total_minor
       from app.revise_payment_plan(
         'e9e00004-0000-4000-8000-000000000001',
         jsonb_build_array(
           jsonb_build_object('amountMinor', 150000, 'dueOn', pg_temp.today() + 40),
           jsonb_build_object('amountMinor', 150000, 'dueOn', pg_temp.today() + 70),
           jsonb_build_object('amountMinor', 150000, 'dueOn', pg_temp.today() + 100))) $$,
  $$ values (2, 2, 3, 750000::bigint) $$,
  'PP-S1-11: Finance revises a plan: the two instalments not charged are withdrawn, three are written, and the three charged stay');

select results_eq(
  $$ select instalment.revision, instalment.withdrawn_reason, count(*)::int
       from public.plan_instalments as instalment
       join public.payment_plans as plan on plan.id = instalment.plan_id
      where plan.reservation_id = 'e9e00004-0000-4000-8000-000000000001'
      group by instalment.revision, instalment.withdrawn_reason
      order by instalment.revision, instalment.withdrawn_reason nulls first $$,
  $$ values (1, null, 3), (1, 'revised', 2), (2, null, 3) $$,
  'PP-S1-11: nothing was deleted; the old schedule is still there, withdrawn as revised');

select is(
  (select plan.revision::text || ':' || plan.revised_by::text
     from public.payment_plans as plan
    where plan.reservation_id = 'e9e00004-0000-4000-8000-000000000001'),
  '2:e9333333-3333-4333-8333-333333333333',
  'PP-S1-11: the plan names its revision and who revised it');

select is(
  (select count(*)::int from app.payment_plan_standing(
     'e9b11111-1111-4111-8111-111111111111', 'e9e00004-0000-4000-8000-000000000001')),
  6,
  'PP-S1-11: the standing reads the three charged and the three written, and none of the two withdrawn');

select throws_ok(
  $$ select * from app.revise_payment_plan(
       'e9e00006-0000-4000-8000-000000000001',
       jsonb_build_array(
         jsonb_build_object('amountMinor', 1000, 'dueOn', pg_temp.today() + 40))) $$,
  '42501', null,
  'PP-S1-06: a booking that has no plan has none to revise');

reset role;

select throws_ok(
  $$ insert into public.folio_lines
       (organization_id, property_id, folio_id, line_type, description,
        amount_minor, source, business_date, instalment_id)
     select plan.organization_id, plan.property_id,
            'e9a00004-0000-4000-8000-000000000001', 'charge', 'Withdrawn',
            instalment.amount_minor, 'instalment', instalment.due_on, instalment.id
       from public.plan_instalments as instalment
       join public.payment_plans as plan on plan.id = instalment.plan_id
      where plan.reservation_id = 'e9e00004-0000-4000-8000-000000000001'
        and instalment.withdrawn_reason = 'revised'
      limit 1 $$,
  'RZP04', 'a withdrawn instalment is not charged',
  'PP-S1-23: a withdrawn instalment is not charged, by any writer');

-- ---------------------------------------------------------------------------
-- A booking that ends
-- ---------------------------------------------------------------------------

-- The in-house booking's instalment due today was charged by the first pass.
select is(
  (select count(*)::int from public.folio_lines
    where folio_id = 'e9a0000a-0000-4000-8000-000000000001'),
  1,
  'PP-S1-24: set up: the booking about to end has one instalment charged');

set local role ranza_app;
select app.set_request_context('e9222222-2222-4222-8222-222222222222');

select lives_ok(
  $$ update public.reservations set status = 'cancelled'
      where id = 'e9e00009-0000-4000-8000-000000000001' $$,
  'PP-S1-24: the desk cancels a booking that has a plan');

select lives_ok(
  $$ update public.reservations set status = 'checked_out'
      where id = 'e9e0000a-0000-4000-8000-000000000001' $$,
  'PP-S1-24: and checks out a Resident that has one');

select results_eq(
  $$ select plan.reservation_id::text,
            count(*) filter (where instalment.withdrawn_reason = 'reservation_ended')::int,
            count(*) filter (where instalment.withdrawn_at is null)::int
       from public.plan_instalments as instalment
       join public.payment_plans as plan on plan.id = instalment.plan_id
      where plan.reservation_id in ('e9e00009-0000-4000-8000-000000000001',
                                    'e9e0000a-0000-4000-8000-000000000001')
      group by plan.reservation_id
      order by plan.reservation_id $$,
  $$ values ('e9e00009-0000-4000-8000-000000000001', 3, 0),
            ('e9e0000a-0000-4000-8000-000000000001', 2, 1) $$,
  'PP-S1-24: what was not charged is withdrawn as reservation_ended and the charged instalment stays');

select is_empty(
  $$ update public.plan_instalments set withdrawn_at = now(), withdrawn_reason = 'reservation_ended'
      where plan_id = (select id from public.payment_plans
                        where reservation_id = 'e9e00001-0000-4000-8000-000000000001')
     returning id $$,
  'PP-S1-24: the application role cannot withdraw the instalments of a booking that has not ended; the policy shows it none');

select is(
  (select count(*)::int from public.plan_instalments as instalment
     join public.payment_plans as plan on plan.id = instalment.plan_id
    where plan.reservation_id = 'e9e00001-0000-4000-8000-000000000001'
      and instalment.withdrawn_at is null),
  3,
  'PP-S1-24: and that booking''s three are untouched');

-- A booking that has ended and still has a live instalment, written as the
-- owner, as a late correction would be: who may withdraw it?
reset role;
insert into public.plan_instalments
  (organization_id, property_id, plan_id, ordinal, amount_minor, due_on, revision)
select plan.organization_id, plan.property_id, plan.id, 4, 1000, pg_temp.today() + 65, 1
  from public.payment_plans as plan
 where plan.reservation_id = 'e9e00009-0000-4000-8000-000000000001';
set local role ranza_app;

select app.set_request_context('e9444444-4444-4444-8444-444444444444');
select is_empty(
  $$ update public.plan_instalments set withdrawn_at = now(), withdrawn_reason = 'reservation_ended'
      where plan_id = (select id from public.payment_plans
                        where reservation_id = 'e9e00009-0000-4000-8000-000000000001')
        and withdrawn_at is null
     returning id $$,
  'PP-S1-24: a member who is not at the front desk withdraws nothing, though the booking has ended');

select app.set_request_context('e9666666-6666-4666-8666-666666666666');
select is_empty(
  $$ update public.plan_instalments set withdrawn_at = now(), withdrawn_reason = 'reservation_ended'
      where plan_id = (select id from public.payment_plans
                        where reservation_id = 'e9e00009-0000-4000-8000-000000000001')
        and withdrawn_at is null
     returning id $$,
  'PP-S1-24: nor does a front desk that reaches only another Property');

-- Reach is not the whole gate: where the Property's front desk is not available
-- the desk withdraws nothing either.
reset role;
update public.property_capabilities set enabled = false
 where property_id = 'e9b11111-1111-4111-8111-111111111111'
   and capability_key = 'front_desk';
set local role ranza_app;
select app.set_request_context('e9222222-2222-4222-8222-222222222222');
select is_empty(
  $$ update public.plan_instalments set withdrawn_at = now(), withdrawn_reason = 'reservation_ended'
      where plan_id = (select id from public.payment_plans
                        where reservation_id = 'e9e00009-0000-4000-8000-000000000001')
        and withdrawn_at is null
     returning id $$,
  'PP-S1-24: nor does the desk where the Property''s front desk is not available');

reset role;
update public.property_capabilities set enabled = true
 where property_id = 'e9b11111-1111-4111-8111-111111111111'
   and capability_key = 'front_desk';
set local role ranza_app;

select app.set_request_context('e9222222-2222-4222-8222-222222222222');
select throws_ok(
  $$ update public.plan_instalments set withdrawn_at = now(), withdrawn_reason = 'revised'
      where plan_id = (select id from public.payment_plans
                        where reservation_id = 'e9e00009-0000-4000-8000-000000000001')
        and withdrawn_at is null
     returning id $$,
  '42501', null,
  'PP-S1-24: the desk withdraws for the booking ending and for no other reason; a revision is Finance''s');

select app.set_request_context('e9333333-3333-4333-8333-333333333333');

select throws_ok(
  $$ select * from app.revise_payment_plan(
       'e9e00009-0000-4000-8000-000000000001',
       jsonb_build_array(
         jsonb_build_object('amountMinor', 1000, 'dueOn', pg_temp.today() + 40))) $$,
  'RZP05', null,
  'PP-S1-06: a booking that has ended takes no revision either');

reset role;

-- ---------------------------------------------------------------------------
-- No rule reads the operating model
-- ---------------------------------------------------------------------------

select is_empty(
  $$ select p.proname::text from pg_proc as p
      where p.pronamespace = 'app'::regnamespace
        and p.proname in ('create_payment_plan', 'revise_payment_plan',
                          'payment_plan_standing', 'payment_plans_overdue',
                          'instalments_ready', 'properties_with_instalments_due',
                          'post_due_instalments', 'payment_plan_belongs_to_a_term',
                          'plan_instalment_falls_due_within_the_term',
                          'reservation_with_a_plan_keeps_its_departure',
                          'payment_plan_keeps_its_history',
                          'plan_instalment_keeps_its_history',
                          'instalment_line_is_for_a_live_instalment',
                          'reservation_ending_withdraws_its_instalments')
        and p.prosrc ~ 'operating_model' $$,
  'PP-S1-32: none of the plan''s functions or triggers reads the operating model');

select is(
  (select count(*)::int from pg_proc as p
    where p.pronamespace = 'app'::regnamespace
      and p.proname in ('create_payment_plan', 'revise_payment_plan',
                        'payment_plan_standing', 'payment_plans_overdue',
                        'instalments_ready', 'properties_with_instalments_due',
                        'post_due_instalments', 'payment_plan_belongs_to_a_term',
                        'plan_instalment_falls_due_within_the_term',
                        'reservation_with_a_plan_keeps_its_departure',
                        'payment_plan_keeps_its_history',
                        'plan_instalment_keeps_its_history',
                        'instalment_line_is_for_a_live_instalment',
                        'reservation_ending_withdraws_its_instalments')),
  14,
  'PP-S1-32: and the list above names every one of them, so the sweep cannot be empty');

select * from finish();
rollback;
