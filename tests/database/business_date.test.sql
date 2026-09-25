-- The business date: a Property's day ends at its cutoff, not at midnight
-- (ADR 0021; CO-S1-17 to CO-S1-20).
--
-- Tested through app.business_date, which takes the instant as an argument,
-- because a boundary at 03:59:59 or a day the clocks change cannot be arranged
-- with now(). app.property_today() is asserted to be that function applied to
-- the present, so what is proved here is what every caller gets.
--
-- Every assertion here was checked by breaking the thing it asserts — adding
-- the cutoff instead of subtracting it, returning the calendar date, dropping
-- the cutoff check, widening it to 02:00 — and confirming it went red.
begin;
select plan(17);

-- ---------------------------------------------------------------------------
-- The boundary, at a Property that never changes its clocks
-- ---------------------------------------------------------------------------

select is(
  app.business_date(timestamptz '2026-09-22 03:59:59+03', 'Europe/Istanbul', time '04:00'),
  date '2026-09-21',
  'one second before the cutoff is still the day before (CO-S1-18)'
);

select is(
  app.business_date(timestamptz '2026-09-22 04:00:00+03', 'Europe/Istanbul', time '04:00'),
  date '2026-09-22',
  'the cutoff itself belongs to the new day: half-open, inclusive at the start (CO-S1-18)'
);

select is(
  app.business_date(timestamptz '2026-09-22 01:30:00+03', 'Europe/Istanbul', time '04:00'),
  date '2026-09-21',
  'a night shift at 01:30 on Tuesday is working Monday (CO-S1-17)'
);

select is(
  app.business_date(timestamptz '2026-09-22 23:59:59+03', 'Europe/Istanbul', time '04:00'),
  date '2026-09-22',
  'the evening belongs to the day it began'
);

select is(
  app.business_date(timestamptz '2026-09-22 01:30:00+00', 'Asia/Dubai', time '04:00'),
  date '2026-09-22',
  'the same instant is a different business date in another time zone'
);

-- ---------------------------------------------------------------------------
-- Days the clocks change (CO-S1-19)
-- ---------------------------------------------------------------------------

-- Every minute across two days either side of each change: the business date
-- must never go backwards and must take each date exactly once. `changes` counts
-- the minutes at which the date differs from the minute before; two days means
-- exactly two, and anything else is a skipped or repeated date.
create temporary table clock_change_days (zone text, around timestamptz, cutoff time);
insert into clock_change_days values
  ('Europe/Berlin',    timestamptz '2026-03-29 00:00+00', time '03:00'),
  ('Europe/Berlin',    timestamptz '2026-10-25 00:00+00', time '03:00'),
  ('America/New_York', timestamptz '2026-03-08 06:00+00', time '03:00'),
  ('America/New_York', timestamptz '2026-11-01 06:00+00', time '03:00');

create temporary view clock_change_walk as
  with minutes as (
    select day.zone, day.cutoff, day.around, instant,
           app.business_date(instant, day.zone, day.cutoff) as business
    from clock_change_days as day,
         generate_series(day.around - interval '1 day',
                         day.around + interval '1 day' - interval '1 minute',
                         interval '1 minute') as instant
  ), stepped as (
    select *, lag(business) over (partition by zone, around order by instant) as before
    from minutes
  )
  select zone, around, cutoff,
         bool_and(before is null or business >= before) as never_backwards,
         count(*) filter (where business <> before)      as changes
  from stepped
  group by zone, around, cutoff;

select is(
  (select count(*) from clock_change_walk where never_backwards and changes = 2),
  4::bigint,
  'at the earliest cutoff allowed, no business date is skipped or repeated on any day the clocks change'
);

-- Why the window exists. At 02:30 Berlin's autumn hour from 02:00 to 03:00
-- happens twice, so a 02:30 cutoff is crossed twice: the date goes forward,
-- back, and forward again. This is the hazard the check below forbids, asserted
-- so that widening the check has a failing test to argue with.
update clock_change_days set cutoff = time '02:30';

select ok(
  (select not never_backwards from clock_change_walk
    where zone = 'Europe/Berlin' and around = timestamptz '2026-10-25 00:00+00'),
  'a cutoff inside a repeated hour sends the business date backwards'
);

-- ---------------------------------------------------------------------------
-- The column
-- ---------------------------------------------------------------------------

insert into public.organizations (id, name, status) values
  ('b1111111-1111-4111-8111-111111111111', 'Business Date Organization', 'active');
insert into public.properties (id, organization_id, name, timezone) values
  ('b2111111-1111-4111-8111-111111111111',
   'b1111111-1111-4111-8111-111111111111', 'Business Date Property', 'Europe/Istanbul');

select is(
  (select business_date_cutoff from public.properties
    where id = 'b2111111-1111-4111-8111-111111111111'),
  time '04:00',
  'a Property ends its day at 04:00 unless it says otherwise'
);

-- Whether property_today reads the cutoff can only be seen while the local
-- time is before it; at 21:00 the business date and the calendar date agree
-- and an assertion comparing them passes for the wrong reason. So the Property
-- is moved, for this assertion, to whichever fixed-offset zone is in its
-- morning right now, with the latest cutoff allowed — which makes the two dates
-- differ at whatever time the suite runs. The second assertion checks that
-- premise, so a run where it did not hold fails rather than passing quietly.
create temporary table morning as
  select zone
  from generate_series(-12, 14) as hours,
       lateral (select 'Etc/GMT' || case when hours > 0 then '-' else '+' end
                        || abs(hours) as zone) as named
  where extract(hour from now() at time zone zone) between 1 and 10
  limit 1;

update public.properties
   set timezone = (select zone from morning), business_date_cutoff = time '11:59'
 where id = 'b2111111-1111-4111-8111-111111111111';

select is(
  app.property_today('b2111111-1111-4111-8111-111111111111'),
  (now() at time zone (select zone from morning))::date - 1,
  'property_today reads the cutoff: in the morning before it, today is still yesterday'
);

select isnt(
  app.business_date(now(), (select zone from morning), time '11:59'),
  (now() at time zone (select zone from morning))::date,
  'premise: in that zone right now the business date and the calendar date differ'
);

update public.properties
   set timezone = 'Europe/Istanbul', business_date_cutoff = time '04:00'
 where id = 'b2111111-1111-4111-8111-111111111111';

select throws_ok(
  $$update public.properties set business_date_cutoff = time '02:59'
     where id = 'b2111111-1111-4111-8111-111111111111'$$,
  '23514',
  null,
  'a cutoff before 03:00 is refused: the clocks change there'
);

select throws_ok(
  $$update public.properties set business_date_cutoff = time '12:00'
     where id = 'b2111111-1111-4111-8111-111111111111'$$,
  '23514',
  null,
  'a cutoff at noon or later is refused: the afternoon is not a night shift'
);

select lives_ok(
  $$update public.properties set business_date_cutoff = time '03:00'
     where id = 'b2111111-1111-4111-8111-111111111111'$$,
  'the earliest cutoff is allowed'
);

select lives_ok(
  $$update public.properties set business_date_cutoff = time '11:59'
     where id = 'b2111111-1111-4111-8111-111111111111'$$,
  'the latest cutoff is allowed'
);

-- ---------------------------------------------------------------------------
-- A cutoff that changes re-dates nothing already written (CO-S1-20)
-- ---------------------------------------------------------------------------

insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity) values
  ('b3111111-1111-4111-8111-111111111111', 'b2111111-1111-4111-8111-111111111111',
   'b1111111-1111-4111-8111-111111111111', 'BD-1', 'room', 2);
insert into public.guests (id, organization_id, full_name) values
  ('b4111111-1111-4111-8111-111111111111',
   'b1111111-1111-4111-8111-111111111111', 'Cutoff Guest');
insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id,
   stay_type, status, starts_on, ends_on) values
  ('b5111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111',
   'b2111111-1111-4111-8111-111111111111', 'b3111111-1111-4111-8111-111111111111',
   'b4111111-1111-4111-8111-111111111111', 'guest', 'confirmed',
   date '2026-10-01', date '2026-10-03');

update public.properties set business_date_cutoff = time '06:00'
 where id = 'b2111111-1111-4111-8111-111111111111';

select is(
  (select (starts_on, ends_on)::text from public.reservations
    where id = 'b5111111-1111-4111-8111-111111111111'),
  '(2026-10-01,2026-10-03)',
  'a Reservation keeps the dates it was written with when the cutoff moves (CO-S1-20)'
);

select is(
  app.property_today('b2111111-1111-4111-8111-111111111111'),
  app.business_date(now(), 'Europe/Istanbul', time '06:00'),
  'the new cutoff is what today is read with from now on'
);

-- Configuration (20260916006000) brought two update triggers: one stamps the
-- row, the other refuses a currency change after a Folio. Neither writes to
-- another table, so moving a cutoff still re-dates nothing — the assertion on
-- the Reservation above is what says so; this one names what does fire.
select set_eq(
  $$select trigger_name::text from information_schema.triggers
     where event_object_schema = 'public' and event_object_table = 'properties'
       and event_manipulation = 'UPDATE'$$,
  array['properties_stamped', 'properties_currency_is_fixed'],
  'only the stamp and the currency lock fire when a Property changes'
);

select * from finish();
rollback;
