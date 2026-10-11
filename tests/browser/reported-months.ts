import { expect } from "@playwright/test";

import { aFreshProperty, type FreshProperty } from "./fresh-property";
import { psql } from "./local-database";

/**
 * Properties whose months are known to the unit, for the Reports screen.
 *
 * A month is only worth asserting against when its truth was written down
 * before the screen was asked, so these build history the clock cannot make:
 * Stays that have departed, room nights charged and closed, corrections and
 * payments posted on named dates. Written as the owner with triggers off
 * (`session_replication_role = replica`), the way tests/integration/analytics
 * does, because the business-day closer can only produce one day per day.
 *
 * A Property of each run's own, never reused: a closed day is history that is
 * never deleted, and a second run on the same Property would add to the first
 * run's totals and make every figure here wrong.
 */

/**
 * Helpers that live for one statement only (`pg_temp`), so nothing is left in
 * the database to be mistaken for part of the product.
 */
const HELPERS = `
  create function pg_temp.unit(p uuid, o uuid, n text, t text) returns uuid
  language sql as $f$
    insert into public.accommodation_units
      (id, property_id, organization_id, name, unit_type, capacity, created_at)
    values (gen_random_uuid(), p, o, n, t, 2, now() - interval '400 days')
    returning id
  $f$;

  -- A departed Stay on a unit and its Folio, with a room night charged for
  -- every night when a nightly rate is given.
  create function pg_temp.stay(p uuid, o uuid, u uuid, kind text,
                               from_on date, to_on date, nightly bigint)
  returns uuid language plpgsql as $f$
  declare
    s uuid := gen_random_uuid();
    f uuid := gen_random_uuid();
    zone text;
  begin
    select timezone into zone from public.properties where id = p;
    insert into public.stays
      (id, organization_id, property_id, accommodation_unit_id, stay_type,
       status, starts_on, ends_on, departed_at)
    values (s, o, p, u, kind, 'departed', from_on, to_on,
            (to_on + time '12:00') at time zone zone);
    insert into public.folios (id, organization_id, property_id, stay_id, currency)
    select f, o, p, s, currency from public.properties where id = p;
    if nightly is not null then
      insert into public.folio_lines
        (organization_id, property_id, folio_id, line_type, description,
         amount_minor, source, business_date, posted_at)
      select o, p, f, 'charge', 'fixture', nightly, 'room_night', d::date,
             ((d::date + 1) + time '04:30') at time zone zone
        from generate_series(from_on, to_on - 1, interval '1 day') as d;
    end if;
    return f;
  end $f$;

  -- A line posted at midday on a Property day, so no cutoff can move it.
  create function pg_temp.line(p uuid, o uuid, f uuid, kind text, amount bigint,
                               method text, on_date date, reverses uuid)
  returns uuid language plpgsql as $f$
  declare
    made uuid := gen_random_uuid();
    zone text;
  begin
    select timezone into zone from public.properties where id = p;
    insert into public.folio_lines
      (id, organization_id, property_id, folio_id, line_type, description,
       amount_minor, reverses_line_id, payment_method, posted_at)
    values (made, o, p, f, kind, 'fixture', amount, reverses, method,
            (on_date + time '12:00') at time zone zone);
    return made;
  end $f$;

  create function pg_temp.night_line(f uuid, d date) returns uuid
  language sql as $f$
    select id from public.folio_lines
     where folio_id = f and source = 'room_night' and business_date = d
  $f$;

  create function pg_temp.close_days(p uuid, o uuid, first_day date, last_day date)
  returns void language sql as $f$
    insert into public.business_day_closes
      (organization_id, property_id, business_date, closed_by_job)
    select o, p, d::date, 'test.fixture'
      from generate_series(first_day, last_day, interval '1 day') as d
  $f$;
`;

/**
 * February 2026, settled, beside the January that precedes it. Both are whole
 * calendar months long in the past, every day closed.
 *
 * Three units: two rooms and a suite, all older than January, so February has
 * 3 x 28 = 84 nights to sell and January 3 x 31 = 93.
 *
 * February
 *   A  Guest  room 1   2-5 Feb    3 nights @ 100.00
 *   B  Guest  room 2   10-12 Feb  2 nights @ 120.00
 *   C  Guest  suite    10-11 Feb  1 night  @ 200.00
 *   D  Resident room 1 20-23 Feb  3 nights, never charged
 *   the 3 Feb night of A reversed on 2 Mar (a correction, dated 3 Feb)
 *   other charges 30.00 (3 Feb) and 20.00 (10 Feb, reversed 12 Feb)
 *   payments: cash 150.00 (4 Feb) and 40.00 (5 Feb, reversed 6 Feb),
 *             card 200.00 (10 Feb), bank transfer 90.00 (11 Feb), other 10.00 (12 Feb)
 *
 * January
 *   E  Guest  room 1   5-9 Jan    4 nights @ 80.00, paid 200.00 by card on 8 Jan
 */
export function aSettledMonth(): FreshProperty {
  const property = aFreshProperty("reports", {
    capabilities: ["analytics"],
  });
  const p = `'${property.propertyId}'`;
  psql(
    `set local session_replication_role = replica;
     ${HELPERS}
     do $body$
     declare
       p uuid := ${p};
       o uuid := (select organization_id from public.properties where id = p);
       room_one uuid := pg_temp.unit(p, o, 'Room 1', 'room');
       room_two uuid := pg_temp.unit(p, o, 'Room 2', 'room');
       suite uuid := pg_temp.unit(p, o, 'Suite 1', 'suite');
       a uuid; b uuid; e uuid;
       paid uuid; charged uuid;
     begin
       a := pg_temp.stay(p, o, room_one, 'guest', '2026-02-02', '2026-02-05', 10000);
       perform pg_temp.line(p, o, a, 'reversal', -10000, null, '2026-03-02',
                            pg_temp.night_line(a, '2026-02-03'));
       perform pg_temp.line(p, o, a, 'charge', 3000, null, '2026-02-03', null);
       perform pg_temp.line(p, o, a, 'payment', -15000, 'cash', '2026-02-04', null);
       paid := pg_temp.line(p, o, a, 'payment', -4000, 'cash', '2026-02-05', null);
       perform pg_temp.line(p, o, a, 'reversal', 4000, null, '2026-02-06', paid);

       b := pg_temp.stay(p, o, room_two, 'guest', '2026-02-10', '2026-02-12', 12000);
       charged := pg_temp.line(p, o, b, 'charge', 2000, null, '2026-02-10', null);
       perform pg_temp.line(p, o, b, 'reversal', -2000, null, '2026-02-12', charged);
       perform pg_temp.line(p, o, b, 'payment', -20000, 'card', '2026-02-10', null);
       perform pg_temp.line(p, o, b, 'payment', -9000, 'bank_transfer', '2026-02-11', null);
       perform pg_temp.line(p, o, b, 'payment', -1000, 'other', '2026-02-12', null);

       perform pg_temp.stay(p, o, suite, 'guest', '2026-02-10', '2026-02-11', 20000);
       perform pg_temp.stay(p, o, room_one, 'resident', '2026-02-20', '2026-02-23', null);

       e := pg_temp.stay(p, o, room_one, 'guest', '2026-01-05', '2026-01-09', 8000);
       perform pg_temp.line(p, o, e, 'payment', -20000, 'card', '2026-01-08', null);

       perform pg_temp.close_days(p, o, '2026-01-01', '2026-02-28');
     end $body$;
     select 1`,
  );
  return property;
}

export interface OpenMonth extends FreshProperty {
  /** The current month, `YYYY-MM`, in the Property's own calendar. */
  month: string;
  /** The month before it. */
  priorMonth: string;
  /** Days of the current month that have closed: today's date less one. */
  closedDays: number;
  daysInMonth: number;
  daysInPriorMonth: number;
  /** The Property's business date today. */
  today: string;
}

/**
 * The first zone, of three that are up to twenty-five hours apart, whose
 * business date is not the first of the month: a month that has only just
 * begun has no closed day, and nothing to say about itself yet.
 */
function aZoneWhereTheMonthHasBegun(): string {
  const zone = psql(
    `select zone from (values ('Europe/Istanbul', 1), ('Pacific/Kiritimati', 2),
                              ('Pacific/Pago_Pago', 3)) as zones (zone, rank)
      where extract(day from (now() at time zone zone) - interval '4 hours') >= 2
      order by rank limit 1`,
  );
  expect(zone, "no zone has a business date after the 1st").not.toBe("");
  return zone;
}

/**
 * The current month of a Property, still open, beside the month before it.
 *
 * Two rooms, older than both months. Everything before today is closed.
 *   this month  one Guest night on the 1st @ 100.00
 *   last month  one Guest night on the 1st and one on the 28th, each @ 80.00
 * so the comparison with the same elapsed days takes the 28th in only once
 * enough of this month has passed to reach it.
 */
export function anOpenMonth(): OpenMonth {
  const property = aFreshProperty("open month", {
    timezone: aZoneWhereTheMonthHasBegun(),
    capabilities: ["analytics"],
  });
  const p = `'${property.propertyId}'`;
  const [today, month, priorMonth, closedDays, daysInMonth, daysInPriorMonth] =
    psql(
      `set local session_replication_role = replica;
       ${HELPERS}
       do $body$
       declare
         p uuid := ${p};
         o uuid := (select organization_id from public.properties where id = p);
         today date := app.property_today(p);
         first_day date := date_trunc('month', today)::date;
         prior_first date := (first_day - interval '1 month')::date;
         room_one uuid := pg_temp.unit(p, o, 'Room 1', 'room');
         room_two uuid := pg_temp.unit(p, o, 'Room 2', 'room');
       begin
         perform pg_temp.stay(p, o, room_one, 'guest', first_day, first_day + 1, 10000);
         perform pg_temp.stay(p, o, room_one, 'guest', prior_first, prior_first + 1, 8000);
         perform pg_temp.stay(p, o, room_two, 'guest', prior_first + 27, prior_first + 28, 8000);
         perform pg_temp.close_days(p, o, prior_first, today - 1);
       end $body$;
       select to_char(app.property_today(${p}), 'YYYY-MM-DD'),
              to_char(date_trunc('month', app.property_today(${p})), 'YYYY-MM'),
              to_char(date_trunc('month', app.property_today(${p})) - interval '1 month', 'YYYY-MM'),
              extract(day from app.property_today(${p}))::int - 1,
              extract(day from (date_trunc('month', app.property_today(${p})) + interval '1 month - 1 day'))::int,
              extract(day from (date_trunc('month', app.property_today(${p})) - interval '1 day'))::int`,
    ).split("|");
  return {
    ...property,
    today: today!,
    month: month!,
    priorMonth: priorMonth!,
    closedDays: Number(closedDays),
    daysInMonth: Number(daysInMonth),
    daysInPriorMonth: Number(daysInPriorMonth),
  };
}

/** Lets a Staff Member who already belongs to the Organization reach one more Property. */
export function assignToProperty(propertyId: string, email: string): void {
  psql(
    `insert into public.property_assignments
       (property_id, organization_id, user_id)
     select property.id, property.organization_id, member.id
       from public.properties as property
       join public.users as member on lower(member.email) = lower('${email}')
      where property.id = '${propertyId}'
     on conflict (property_id, user_id) do nothing`,
  );
}
