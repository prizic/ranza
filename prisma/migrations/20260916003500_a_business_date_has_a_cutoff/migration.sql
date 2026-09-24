-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "business_date_cutoff" TIME(6) NOT NULL DEFAULT '04:00:00'::time without time zone;

-- ---------------------------------------------------------------------------
-- Hand-written from here down (RANZ-23, ADR 0021 applied)
-- ---------------------------------------------------------------------------

-- ON THE NUMBER. 003500 to 003999 belong to feat/front-desk-occupancy, which
-- lands several migrations in order. The Unit status lifecycle is being built
-- beside it (feat/housekeeping), has no migration yet and will take the next
-- number after main's last; leaving 003000 to 003499 to it is cheaper than two
-- branches renumbering each other.

-- A Property's day ends at a cutoff, not at midnight (ADR 0021). It is applied
-- now because a front desk needs it, not a night audit: a Guest landing at
-- 00:30 for a one-night booking made for the evening before was refused by
-- check-in (`ends_on > today` is false at midnight) and gone from the arrivals
-- list, standing at the desk.
--
-- 04:00 by default rather than the ADR's 00:00. Hospitality dates a night by
-- the evening it begins, and a midnight default keeps every Property with the
-- defect above until somebody changes it.
--
-- Between 03:00 and 12:00, and nowhere else. The day is the local wall-clock
-- time minus the cutoff, and wall-clock time is not monotonic: in a repeated
-- hour it runs backwards. A cutoff inside that hour is crossed twice, so the
-- business date would go forward, back, and forward again. Every daylight
-- saving change in the time zone database happens before 03:00 local time, so
-- a cutoff in this window is crossed exactly once a day — the property CO-S1-19
-- asks for, held by the check rather than by arithmetic around the gap. Noon is
-- the other end because a cutoff after it would date the afternoon by the day
-- before, which is not a night shift any more.
alter table public.properties
  add constraint properties_business_date_cutoff_check
    check (business_date_cutoff >= time '03:00'
           and business_date_cutoff < time '12:00');

comment on column public.properties.business_date_cutoff is
  'The local time at which this Property''s working day ends (ADR 0021). Between 03:00 and 12:00, the window in which no time zone changes its clocks.';

-- The rule itself, with the instant as an argument rather than `now()`.
--
-- Pure so that it can be tested: a boundary at 03:59:59 and 04:00:00, or a day
-- when the clocks change, cannot be arranged with `now()`. `property_today`
-- below is this function applied to the present, and nothing else computes a
-- business date.
--
-- `cutoff::interval` because Postgres has no `timestamp - time` operator; the
-- expression as ADR 0021 wrote it does not compile. Stable rather than
-- immutable: `at time zone` reads the time zone database, which can change.
create function app.business_date(
  at_instant timestamptz,
  zone text,
  cutoff time
)
returns date
language sql
stable
set search_path = ''
as $$
  select ((at_instant at time zone zone) - cutoff::interval)::date;
$$;

comment on function app.business_date(timestamptz, text, time) is
  'The business date at an instant, for a Property in a time zone with a cutoff (ADR 0021). app.property_today() is this at now().';

grant execute on function app.business_date(timestamptz, text, time) to ranza_app;

-- Same signature and the same callers; only the day it answers changes. Every
-- date comparison in the product resolves through this, which is the blast
-- radius ADR 0021 intended and the reason it was extracted before it was
-- needed.
create or replace function app.property_today(target_property_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select app.business_date(
           now(), property.timezone, property.business_date_cutoff)
  from public.properties as property
  where property.id = target_property_id;
$$;

comment on function app.property_today(uuid) is
  'The business date at one Property right now: its local time less its cutoff (ADR 0021). A front desk in Izmir and one in Dubai are working different dates at the same moment, and a night shift at 02:00 is still working the day before.';
