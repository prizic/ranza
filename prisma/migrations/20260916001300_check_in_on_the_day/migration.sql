-- A Stay is in house from the day it starts, not from the day it was booked.
--
-- The gap this closes was reachable as ranza_app against main. Check-in moved
-- any `confirmed` Reservation with no date condition at all and started the
-- Stay on the *planned* arrival date, so a Reservation three weeks out could be
-- checked in today; `stays_no_double_booking` then permitted a second Guest
-- into the same Unit tonight, because the two date ranges do not overlap. One
-- Unit, two `in_house` Stays, one of them for somebody who is not in the
-- building — and a Folio accruing against each.
--
-- Two halves, and neither is redundant. The module refuses on a predicate, so a
-- front desk gets a refusal rather than an exception. This policy refuses
-- independently, so a second caller written later cannot skip it.
--
-- A policy rather than a trigger, which is the opposite of the choice
-- 20260916001200_folios made for folio_lines, and deliberately. That one is a
-- claim about tamper-evidence: a financial record must be unrewritable by
-- *every* role, so only a trigger is evidence. This is an operational rule
-- about what the application may write, which is exactly what ADR 0012 puts in
-- a policy. The migration role can still backdate or forward-date a Stay, and
-- should be able to: that is how a correction is made.
--
-- No Prisma-generated section: nothing here changes a table.

-- ---------------------------------------------------------------------------
-- The Property's own today
-- ---------------------------------------------------------------------------

-- Already computed inline in three places — the arrivals list, the departures
-- list and check-out — as `(now() at time zone property.timezone)::date`. It
-- becomes a function here because a policy needs it too, and a policy that
-- sub-selected `properties` would be subject to that table's own policies: a
-- Property the caller cannot read would return no row, the comparison would be
-- null, and the WITH CHECK would deny for a reason nobody could find.
--
-- security definer for that reason, and stable rather than immutable because it
-- reads `now()`. Returning null for a Property that does not exist is the safe
-- direction: `starts_on <= null` is null, and a WITH CHECK that is not true
-- denies.
create function app.property_today(target_property_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone property.timezone)::date
  from public.properties as property
  where property.id = target_property_id;
$$;

comment on function app.property_today(uuid) is
  'The calendar date at one Property right now. A front desk in Izmir and one in Dubai are working different dates at the same moment, so a date computed in the server''s timezone is wrong for one of them for several hours every day.';

grant execute on function app.property_today(uuid) to ranza_app;

-- ---------------------------------------------------------------------------
-- The rule
-- ---------------------------------------------------------------------------

-- Stated on both write paths, because a policy for INSERT is not consulted for
-- an UPDATE and vice versa. Without the second, a `reserved` Stay dated next
-- month could simply be moved to `in_house` today, which is the same bug
-- arriving through the other door.
--
-- Scoped to `in_house` on purpose. A `reserved` Stay *is* a future booking, and
-- constraining its dates would forbid the thing it exists to express.
drop policy stays_insert_front_desk on public.stays;

create policy stays_insert_front_desk
  on public.stays for insert
  with check (
    app.can_use_capability(property_id, 'front_office', 'front_desk')
    and (
      status <> 'in_house'
      or starts_on <= app.property_today(property_id)
    )
  );

drop policy stays_update_front_desk on public.stays;

create policy stays_update_front_desk
  on public.stays for update
  using (
    app.can_use_capability(property_id, 'front_office', 'front_desk')
  )
  with check (
    app.can_use_capability(property_id, 'front_office', 'front_desk')
    and (
      status <> 'in_house'
      or starts_on <= app.property_today(property_id)
    )
  );

comment on policy stays_insert_front_desk on public.stays is
  'A Stay may be created where the front desk capability is available, and is in house only from the day it starts. Checking somebody in weeks early produced two current Stays on one Unit, because their date ranges did not overlap.';
