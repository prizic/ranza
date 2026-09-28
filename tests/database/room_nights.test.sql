-- A night is charged once (ADR 0038, docs/features/rates slice 3).
--
-- Four claims, which fail in different ways:
--
--   the night     the close of D charges every Guest in house the night of D
--                 whose booking has a price and whose Folio is open, at that
--                 price, dated D; it lists every other Guest night with why,
--                 and never a Resident's. Guest nights occupied equal the
--                 nights posted plus the nights it could not post.
--
--   once          a night is unique per Folio and date, whoever posts it;
--                 check-out posts the nights no close has reached and the
--                 close then counts them without posting them again.
--
--   the day       a room night is dated on a day that has ended and is not
--                 closed, for every role.
--
--   the caller    posting is the close's and the check-out's act: a Staff
--                 Member without front_desk.close_day or front_desk.check_out,
--                 another Organization, or another Organization's worker,
--                 posts nothing.
--
-- The dates are relative to the Property's own today (T), never fixed.
-- Reservations are written with a Staff request context set, so the stamp
-- prices them as it would for the front desk.
--
-- Rows in docs/features/rates/edge-cases.csv are named beside the assertions.
-- Each break below was applied, the altered function's hash or the object's
-- presence printed first, and the named assertion seen red:
--   post_room_nights without front_desk.close_day      RT-S3-10 (close_day)
--   post_room_nights_for_departure without check_out   RT-S3-10 (check out)
--   post_room_nights without the worker's check        RT-S3-10 (both)
--   the stamp not calling post_room_nights             RT-S3-01, RT-S3-03
--   room_nights_due ignoring a closed Folio            RT-S3-04 (the close
--                                                      then fails outright)
--   room_nights_due counting Residents                 RT-S3-05, RT-S3-03
--   the totals missing a check-out's night             RT-S3-03 (both)
--   the dating trigger dropped                         RT-S3-09 (both)
--   the room-night key dropped                         RT-S3-02 (catalogue)
begin;
select plan(27);

insert into public.users (id, email) values
  ('f1111111-1111-4111-8111-111111111111', 'rn-manager@example.test'),
  ('f2222222-2222-4222-8222-222222222222', 'rn-desk@example.test'),
  ('f3333333-3333-4333-8333-333333333333', 'rn-finance@example.test'),
  ('f4444444-4444-4444-8444-444444444444', 'rn-outsider@example.test');

insert into public.organizations (id, name, status) values
  ('fa111111-1111-4111-8111-111111111111', 'Night Organization', 'active'),
  ('fa222222-2222-4222-8222-222222222222', 'Night Other Organization', 'active');

insert into public.properties (id, organization_id, name, currency) values
  ('fb111111-1111-4111-8111-111111111111',
   'fa111111-1111-4111-8111-111111111111', 'Night Property', 'TRY'),
  ('fb222222-2222-4222-8222-222222222222',
   'fa222222-2222-4222-8222-222222222222', 'Night Other Property', 'TRY');

insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('fa111111-1111-4111-8111-111111111111',
   'f1111111-1111-4111-8111-111111111111', 'manager', 'organization_wide'),
  ('fa111111-1111-4111-8111-111111111111',
   'f2222222-2222-4222-8222-222222222222', 'front_desk', 'organization_wide'),
  ('fa111111-1111-4111-8111-111111111111',
   'f3333333-3333-4333-8333-333333333333', 'finance', 'organization_wide'),
  ('fa222222-2222-4222-8222-222222222222',
   'f4444444-4444-4444-8444-444444444444', 'manager', 'organization_wide');

insert into public.subscriptions (organization_id, status) values
  ('fa111111-1111-4111-8111-111111111111', 'active'),
  ('fa222222-2222-4222-8222-222222222222', 'active');

insert into public.entitlements (organization_id, module_key) values
  ('fa111111-1111-4111-8111-111111111111', 'platform_core'),
  ('fa111111-1111-4111-8111-111111111111', 'front_office'),
  ('fa111111-1111-4111-8111-111111111111', 'billing_folios'),
  ('fa222222-2222-4222-8222-222222222222', 'front_office');

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('fb111111-1111-4111-8111-111111111111',
   'fa111111-1111-4111-8111-111111111111', 'front_desk', true),
  ('fb111111-1111-4111-8111-111111111111',
   'fa111111-1111-4111-8111-111111111111', 'finance', true),
  ('fb222222-2222-4222-8222-222222222222',
   'fa222222-2222-4222-8222-222222222222', 'front_desk', true);

-- Eight rooms, one per Stay below.
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity)
select ('fc00000' || n || '-0000-4000-8000-000000000001')::uuid,
       'fb111111-1111-4111-8111-111111111111',
       'fa111111-1111-4111-8111-111111111111', 'RN-10' || n, 'room', 2
  from generate_series(1, 8) as n;

insert into public.property_rates
  (organization_id, property_id, unit_type, amount_minor)
values ('fa111111-1111-4111-8111-111111111111',
        'fb111111-1111-4111-8111-111111111111', 'room', 10000);

insert into public.guests (id, organization_id, full_name) values
  ('fd111111-1111-4111-8111-111111111111',
   'fa111111-1111-4111-8111-111111111111', 'Night Guest');

select app.property_today('fb111111-1111-4111-8111-111111111111') as t \gset

-- Bookings, as the front desk would take them: the manager's context, so the
-- stamp reaches the Property and prices each at 100.00 TRY. The unpriced one
-- is taken before the price existed would be; here the price is cleared for
-- it and set again after.
select app.set_request_context('f1111111-1111-4111-8111-111111111111');

-- 1 A  priced, Folio open, in house T-3 .. T+1          charged
-- 2 B  unpriced booking, Folio open                      unpriced
-- 3 C  Resident                                          not a Guest night
-- 4 D  priced, no Folio                                  no_folio
-- 5 G  priced, Folio open, begun T-2                     charged
-- 6 H  priced, Folio closed                              folio_closed
-- 7 J  priced, Folio open; its nights posted by check-out before the close
-- 8 K  priced, Folio open, begun today                   no night yet
insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id,
   stay_type, status, starts_on, ends_on)
select ('fe00000' || n || '-0000-4000-8000-000000000001')::uuid,
       'fa111111-1111-4111-8111-111111111111',
       'fb111111-1111-4111-8111-111111111111',
       ('fc00000' || n || '-0000-4000-8000-000000000001')::uuid,
       'fd111111-1111-4111-8111-111111111111',
       case when n = 3 then 'resident' else 'guest' end,
       'checked_in',
       case n when 5 then :'t'::date - 2 when 8 then :'t'::date
              else :'t'::date - 3 end,
       case when n = 3 then null else :'t'::date + 1 end
  from generate_series(1, 8) as n
 where n <> 2;

update public.property_rates set amount_minor = null
 where property_id = 'fb111111-1111-4111-8111-111111111111';
insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id,
   stay_type, status, starts_on, ends_on)
values ('fe000002-0000-4000-8000-000000000001',
        'fa111111-1111-4111-8111-111111111111',
        'fb111111-1111-4111-8111-111111111111',
        'fc000002-0000-4000-8000-000000000001',
        'fd111111-1111-4111-8111-111111111111',
        'guest', 'checked_in', :'t'::date - 3, :'t'::date + 1);
update public.property_rates set amount_minor = 10000
 where property_id = 'fb111111-1111-4111-8111-111111111111';

insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, reservation_id,
   stay_type, status, starts_on, ends_on)
select ('ff00000' || n || '-0000-4000-8000-000000000001')::uuid,
       reservation.organization_id, reservation.property_id,
       reservation.accommodation_unit_id, reservation.id,
       reservation.stay_type, 'in_house', reservation.starts_on,
       reservation.ends_on
  from public.reservations as reservation
  cross join generate_series(1, 8) as n
 where reservation.id = ('fe00000' || n || '-0000-4000-8000-000000000001')::uuid;

insert into public.folios (organization_id, property_id, stay_id, currency)
select 'fa111111-1111-4111-8111-111111111111',
       'fb111111-1111-4111-8111-111111111111',
       ('ff00000' || n || '-0000-4000-8000-000000000001')::uuid, 'TRY'
  from generate_series(1, 8) as n
 where n not in (3, 4);

-- A Folio closed under a Guest in house is refused since
-- 20260916008300 (FO-S5-01), for every role; one closed before it is the case
-- `folio_closed` still names. It is written here the only way it can be now:
-- with triggers suspended for this one statement, as data from before.
set local session_replication_role = replica;
update public.folios set status = 'closed', closed_at = now()
 where stay_id = 'ff000006-0000-4000-8000-000000000001';
set local session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- What a night is
-- ---------------------------------------------------------------------------

-- Read from the catalogue first: without the key the posting statements raise
-- rather than fail, and would take every assertion after them with them.
select ok(
  coalesce((select indexdef ~ 'UNIQUE INDEX .* \(folio_id, business_date\) WHERE \(source = ''room_night''::text\)'
              from pg_indexes
             where schemaname = 'public'
               and indexname = 'folio_lines_room_night_key'), false),
  'RT-S3-02: a room night is unique per Folio and business date');

select results_eq(
  format($$ select stay_id, amount_minor, reason
              from app.room_nights_due(
                     'fb111111-1111-4111-8111-111111111111', %L::date - 1,
                     %L::date - 1)
             order by stay_id $$, :'t', :'t'),
  $$ values
       ('ff000001-0000-4000-8000-000000000001'::uuid, 10000::bigint, null::text),
       ('ff000002-0000-4000-8000-000000000001'::uuid, null::bigint, 'unpriced'),
       ('ff000004-0000-4000-8000-000000000001'::uuid, 10000::bigint, 'no_folio'),
       ('ff000005-0000-4000-8000-000000000001'::uuid, 10000::bigint, null::text),
       ('ff000006-0000-4000-8000-000000000001'::uuid, 10000::bigint, 'folio_closed'),
       ('ff000007-0000-4000-8000-000000000001'::uuid, 10000::bigint, null::text) $$,
  'RT-S3-04, RT-S3-05: every Guest night of T-1 with why it cannot be charged; no Resident, and nobody begun today');

-- ---------------------------------------------------------------------------
-- Check-out charges what no close has reached
-- ---------------------------------------------------------------------------

set local role ranza_app;
select app.set_request_context('f2222222-2222-4222-8222-222222222222');

select results_eq(
  $$ select * from app.post_room_nights_for_departure(
       'ff000007-0000-4000-8000-000000000001') $$,
  $$ values (3, 30000::bigint) $$,
  'RT-S3-06: a departing Guest''s nights no close has reached are charged: T-3, T-2 and T-1');

select results_eq(
  $$ select * from app.post_room_nights_for_departure(
       'ff000007-0000-4000-8000-000000000001') $$,
  $$ values (0, 0::bigint) $$,
  'RT-S3-02: and asked again, nothing is charged twice');

select app.set_request_context('f3333333-3333-4333-8333-333333333333');

select throws_ok(
  $$ select * from app.post_room_nights_for_departure(
       'ff000001-0000-4000-8000-000000000001') $$,
  '42501', null,
  'RT-S3-10: a Staff Member who may not check a Guest out posts nothing for them');

select throws_ok(
  format($$ select * from app.post_room_nights(
       'fb111111-1111-4111-8111-111111111111', %L::date - 1) $$, :'t'),
  '42501', null,
  'RT-S3-10: nor a day''s nights, without front_desk.close_day');

select app.set_request_context('f4444444-4444-4444-8444-444444444444');

select throws_ok(
  format($$ select * from app.post_room_nights(
       'fb111111-1111-4111-8111-111111111111', %L::date - 1) $$, :'t'),
  '42501', null, 'RT-S3-10: nor another Organization');

select app.set_request_context('f2222222-2222-4222-8222-222222222222');

select throws_ok(
  format($$ insert into public.folio_lines
       (organization_id, property_id, folio_id, line_type, description,
        amount_minor, source, business_date)
     select organization_id, property_id, id, 'charge', 'Room night', 10000,
            'room_night', %L::date - 1
       from public.folios
      where stay_id = 'ff000005-0000-4000-8000-000000000001' $$, :'t'),
  '42501', null,
  'RT-S3-10: a Staff Member cannot mark a charge a room night by hand');

select throws_ok(
  $$ select * from app.post_room_nights(
       'fb111111-1111-4111-8111-111111111111',
       app.property_today('fb111111-1111-4111-8111-111111111111')) $$,
  '55000', null, 'RT-S3-09: today has not ended, so its nights are not charged');

-- ---------------------------------------------------------------------------
-- The close charges the night
-- ---------------------------------------------------------------------------

select lives_ok(
  format($$ insert into public.business_day_closes
       (organization_id, property_id, business_date)
     values ('fa111111-1111-4111-8111-111111111111',
             'fb111111-1111-4111-8111-111111111111', %L::date - 1) $$, :'t'),
  'RT-S3-01: the front desk closes T-1');

set local role none;

select results_eq(
  format($$ select folio.stay_id, line.amount_minor
              from public.folio_lines as line
              join public.folios as folio on folio.id = line.folio_id
             where line.property_id = 'fb111111-1111-4111-8111-111111111111'
               and line.source = 'room_night'
               and line.business_date = %L::date - 1
             order by folio.stay_id $$, :'t'),
  $$ values
       ('ff000001-0000-4000-8000-000000000001'::uuid, 10000::bigint),
       ('ff000005-0000-4000-8000-000000000001'::uuid, 10000::bigint),
       ('ff000007-0000-4000-8000-000000000001'::uuid, 10000::bigint) $$,
  'RT-S3-01, RT-S3-02: one night each, at the booked price; the check-out''s is not posted again');

select results_eq(
  format($$ select room_nights_posted, room_revenue_minor,
                   room_revenue_currency::text, room_nights_unposted
              from public.business_day_closes
             where property_id = 'fb111111-1111-4111-8111-111111111111'
               and business_date = %L::date - 1 $$, :'t'),
  $$ values (3, 30000::bigint, 'TRY', 3) $$,
  'RT-S3-03: the close records every room night dated its day, whoever posted it');

select set_eq(
  format($$ select item ->> 'stayId' || ':' || (item ->> 'reason')
              from public.business_day_closes as close,
                   jsonb_array_elements(close.unposted) as item
             where close.property_id = 'fb111111-1111-4111-8111-111111111111'
               and close.business_date = %L::date - 1 $$, :'t'),
  array['ff000002-0000-4000-8000-000000000001:unpriced',
        'ff000004-0000-4000-8000-000000000001:no_folio',
        'ff000006-0000-4000-8000-000000000001:folio_closed'],
  'RT-S3-04: and lists the nights it could not charge, with why');

select is(
  (select exceptions from public.business_day_closes
    where property_id = 'fb111111-1111-4111-8111-111111111111'
      and business_date = :'t'::date - 1),
  '[]'::jsonb,
  'RT-S3-04: never as items left open, so they block nothing');

-- Guest nights in house that night, counted the way the close counts nights.
select is(
  (select count(*)::int from public.stays as stay
    where stay.property_id = 'fb111111-1111-4111-8111-111111111111'
      and stay.stay_type = 'guest'
      and stay.status in ('in_house', 'departed')
      and stay.starts_on <= :'t'::date - 1
      and (stay.status = 'in_house' or stay.ends_on > :'t'::date - 1)),
  (select room_nights_posted + room_nights_unposted
     from public.business_day_closes
    where property_id = 'fb111111-1111-4111-8111-111111111111'
      and business_date = :'t'::date - 1),
  'RT-S3-03: every Guest night is either charged or listed, none lost');

-- ---------------------------------------------------------------------------
-- The day, for every role
-- ---------------------------------------------------------------------------

select throws_ok(
  format($$ insert into public.folio_lines
       (organization_id, property_id, folio_id, line_type, description,
        amount_minor, source, business_date)
     select organization_id, property_id, id, 'charge', 'Room night', 10000,
            'room_night', %L::date - 1
       from public.folios
      where stay_id = 'ff000002-0000-4000-8000-000000000001' $$, :'t'),
  'RZ001', null,
  'RT-S3-09: a room night is never dated on a closed day, even by a role that bypasses policies');

select throws_ok(
  format($$ insert into public.folio_lines
       (organization_id, property_id, folio_id, line_type, description,
        amount_minor, source, business_date)
     select organization_id, property_id, id, 'charge', 'Room night', 10000,
            'room_night', %L::date
       from public.folios
      where stay_id = 'ff000002-0000-4000-8000-000000000001' $$, :'t'),
  '55000', null, 'RT-S3-09: nor on a day that has not ended');

select throws_ok(
  format($$ insert into public.folio_lines
       (organization_id, property_id, folio_id, line_type, description,
        amount_minor, source, business_date)
     select organization_id, property_id, id, 'charge', 'Room night', 10000,
            'room_night', %L::date - 2
       from public.folios
      where stay_id = 'ff000007-0000-4000-8000-000000000001' $$, :'t'),
  '23505', null, 'RT-S3-02: nor twice for one Folio and date, whoever writes it');

select throws_ok(
  $$ insert into public.folio_lines
       (organization_id, property_id, folio_id, line_type, description,
        amount_minor, business_date)
     select organization_id, property_id, id, 'charge', 'Undated', 10000,
            current_date
       from public.folios
      where stay_id = 'ff000002-0000-4000-8000-000000000001' $$,
  '23514', null, 'RT-S3-09: and only a room night carries a business date');

-- No request context and no worker context: asked before the day, so the
-- answer is about the caller and not about the closed day.
select set_config('app.user_id', '', true);
select throws_ok(
  format($$ select * from app.post_room_nights(
       'fb111111-1111-4111-8111-111111111111', %L::date - 1) $$, :'t'),
  '42501', null,
  'RT-S3-10: posting outside a request or the worker is refused');

select app.set_worker_context('fa222222-2222-4222-8222-222222222222', 'business_day.close');
select throws_ok(
  format($$ select * from app.post_room_nights(
       'fb111111-1111-4111-8111-111111111111', %L::date - 1) $$, :'t'),
  '42501', null, 'RT-S3-10: and by another Organization''s worker');

-- ---------------------------------------------------------------------------
-- The check-out, after the close
-- ---------------------------------------------------------------------------

set local role ranza_app;
select app.set_request_context('f2222222-2222-4222-8222-222222222222');

select results_eq(
  $$ select * from app.post_room_nights_for_departure(
       'ff000001-0000-4000-8000-000000000001') $$,
  $$ values (2, 20000::bigint) $$,
  'RT-S3-06: T-1 is the close''s; check-out charges T-3 and T-2, before the first close');

select throws_ok(
  format($$ select * from app.post_room_nights(
       'fb111111-1111-4111-8111-111111111111', %L::date - 1) $$, :'t'),
  'RZ001', null, 'RT-S3-09: a closed day''s nights are not posted again');

select results_eq(
  $$ select * from app.post_room_nights_for_departure(
       'ff000008-0000-4000-8000-000000000001') $$,
  $$ values (0, 0::bigint) $$,
  'RT-S3-13: a Guest who arrived today has no night to charge');

-- ---------------------------------------------------------------------------
-- A reversed night, and lapsed billing
-- ---------------------------------------------------------------------------

set local role none;
insert into public.folio_lines
  (organization_id, property_id, folio_id, line_type, description,
   amount_minor, reverses_line_id)
select line.organization_id, line.property_id, line.folio_id, 'reversal',
       'Correction', -line.amount_minor, line.id
  from public.folio_lines as line
  join public.folios as folio on folio.id = line.folio_id
 where folio.stay_id = 'ff000005-0000-4000-8000-000000000001'
   and line.source = 'room_night'
   and line.business_date = :'t'::date - 2;

select is(
  (select reason from app.room_nights_due(
     'fb111111-1111-4111-8111-111111111111', :'t'::date - 2, :'t'::date - 2,
     'ff000005-0000-4000-8000-000000000001')),
  null,
  'fixture: G''s night of T-2 was never posted, so it is still owed');

select is(
  (select reason from app.room_nights_due(
     'fb111111-1111-4111-8111-111111111111', :'t'::date - 1, :'t'::date - 1,
     'ff000001-0000-4000-8000-000000000001')),
  'already_posted',
  'RT-S3-11: a posted night stays posted, reversed or not');

update public.property_capabilities set enabled = false
 where property_id = 'fb111111-1111-4111-8111-111111111111'
   and capability_key = 'finance';

select is(
  (select reason from app.room_nights_due(
     'fb111111-1111-4111-8111-111111111111', :'t'::date - 2, :'t'::date - 2,
     'ff000005-0000-4000-8000-000000000001')),
  'billing_unavailable',
  'RT-S3-17: where billing is not available, a night is listed and not charged');

select * from finish();
rollback;
