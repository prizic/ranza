-- AlterTable
ALTER TABLE "business_day_closes" ADD COLUMN     "room_nights_posted" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "room_nights_unposted" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "room_revenue_currency" CHAR(3),
ADD COLUMN     "room_revenue_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "unposted" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "folio_lines" ADD COLUMN     "business_date" DATE,
ADD COLUMN     "source" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "folio_lines_room_night_key" ON "folio_lines"("folio_id", "business_date") WHERE (source = 'room_night'::text);

-- ---------------------------------------------------------------------------
-- Hand-written from here down (RANZ-31 slice 3, ADR 0038)
-- ---------------------------------------------------------------------------

-- A night a Guest spends in house is charged once, at the price their booking
-- was taken at: by the close of that business day, or by their check-out when
-- no close has reached it yet. Close the day's PRE-01 (a rate) and PRE-02 (a
-- dated, keyed Folio line) are what this migration and the two before it
-- supply.
--
-- Locks, globally (ADR 0038): the Unit (namespace 2), then the Property's
-- business day (3), then the Stay (1). The close holds 3 exclusive and takes
-- 1 for each Stay it posts to; check-out and a withdrawn check-in take 3
-- shared before 1.
--
-- SQLSTATEs: 42501 not the caller's to post; 55000 the day has not ended;
-- RZ001 the day is already closed.

-- ---------------------------------------------------------------------------
-- A room night on a Folio
-- ---------------------------------------------------------------------------

alter table public.folio_lines
  -- A room night is dated, and only a room night: a date on anything else
  -- would be a second, unkeyed way of saying which day money belongs to.
  add constraint folio_lines_room_night_is_dated
    check ((source is null) = (business_date is null)),
  -- A room night is a charge. A correction of one is an ordinary reversal and
  -- carries neither, so a reversed night is still posted and never posted
  -- again (RT-S3-11).
  add constraint folio_lines_source_check
    check (source is null or (source = 'room_night' and line_type = 'charge'));

comment on index public.folio_lines_room_night_key is
  'A night is charged once: one room night per Folio and business date, whoever posts it (ADR 0038, RT-S3-02).';

-- No grant names source or business_date: ranza_app's insert on folio_lines is
-- a column list (20260916002150), so a Staff Member posting a charge by hand
-- cannot mark it a room night. Only the two posting functions below write one.

-- A room night is dated on a day that has ended and has not been finalized
-- without it (RT-S3-09), for every role — a trigger, so the migration role is
-- bound too. The close of D posts while D's close row is being written, so D
-- has no row yet; any other closed day has one.
--
-- Security invoker: it reads closes through their read policy, which is by
-- reach, and whoever may post at a Property reaches it. Lock 3 shared, so a
-- posting and a close of the same day cannot interleave; re-entrant for the
-- close that already holds it exclusive.
create function app.room_night_is_dated_on_an_ended_open_day()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.source is distinct from 'room_night' then
    return new;
  end if;

  perform pg_advisory_xact_lock_shared(3, hashtext(new.property_id::text));

  if new.business_date >= app.property_today(new.property_id) then
    raise exception 'a room night is charged only for a day that has ended'
      using errcode = '55000';
  end if;

  if exists (
    select 1
      from public.business_day_closes as close
     where close.property_id = new.property_id
       and close.business_date = new.business_date
  ) then
    raise exception 'business day % is closed at this Property', new.business_date
      using errcode = 'RZ001';
  end if;

  return new;
end;
$$;

create trigger folio_lines_room_night_dated
  before insert on public.folio_lines
  for each row
  execute function app.room_night_is_dated_on_an_ended_open_day();

-- ---------------------------------------------------------------------------
-- What a close records
-- ---------------------------------------------------------------------------

alter table public.business_day_closes
  add constraint business_day_closes_room_nights_check
    check (room_nights_posted >= 0 and room_nights_unposted >= 0
           and room_revenue_minor >= 0),
  add constraint business_day_closes_room_revenue_currency_check
    check (room_revenue_currency is null
           or room_revenue_currency ~ '^[A-Z]{3}$'),
  add constraint business_day_closes_unposted_check
    check (jsonb_typeof(unposted) = 'array');

-- Closes written before this migration posted nothing and keep their zeros:
-- there is nothing to backfill, because nothing had a price.

-- ---------------------------------------------------------------------------
-- What a night is
-- ---------------------------------------------------------------------------

-- The one definition of a night (RT-S3-01), the one the close has always
-- counted: a Guest Stay begun on D or before, in house now or departed after
-- D. For every such night from first_day to last_day, the Folio it would be
-- charged to, the price, and why it cannot be — null when it can:
--
--   already_posted       a room night for that Folio and date exists, reversed
--                        or not (RT-S3-02, RT-S3-11)
--   unpriced             no booking, or a booking taken unpriced (RT-S3-04)
--   billing_unavailable  the Property's billing is not available (RT-S3-17)
--   no_folio             the Stay has no Folio
--   folio_closed         its Folio is closed
--   currency             its Folio trades in another currency than the price
--
-- Residents are not here: they are billed monthly (RT-S3-05).
--
-- Security invoker and stable. Called by the two definers below as their
-- owner, and by the close screen and the departures list as the Staff Member,
-- whose reads of stays, reservations, folios and folio_lines are by reach —
-- the same rows the definers see. The room_nights test pins those policies.
create function app.room_nights_due(
  target_property_id uuid,
  first_day date,
  last_day date,
  only_stay_id uuid default null
)
returns table (
  stay_id uuid,
  business_date date,
  folio_id uuid,
  amount_minor bigint,
  currency text,
  reason text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select stay.id,
         night.day::date,
         folio.id,
         reservation.nightly_rate_minor,
         trim(reservation.rate_currency),
         case
           when exists (
             select 1 from public.folio_lines as line
              where line.folio_id = folio.id
                and line.source = 'room_night'
                and line.business_date = night.day::date) then 'already_posted'
           when reservation.nightly_rate_minor is null then 'unpriced'
           when not app.capability_is_available(
                  stay.property_id, 'billing_folios', 'finance')
             then 'billing_unavailable'
           when folio.id is null then 'no_folio'
           when folio.status <> 'open' then 'folio_closed'
           when trim(folio.currency) <> trim(reservation.rate_currency)
             then 'currency'
         end
    from public.stays as stay
    left join public.reservations as reservation
      on reservation.id = stay.reservation_id
    left join public.folios as folio
      on folio.stay_id = stay.id
   cross join lateral generate_series(
           greatest(stay.starts_on, first_day)::timestamp,
           last_day::timestamp,
           interval '1 day') as night(day)
   where stay.property_id = target_property_id
     and stay.stay_type = 'guest'
     and stay.status in ('in_house', 'departed')
     and (only_stay_id is null or stay.id = only_stay_id)
     and (stay.status = 'in_house' or stay.ends_on > night.day::date)
$$;

comment on function app.room_nights_due(uuid, date, date, uuid) is
  'Every Guest night at a Property between two business dates, the Folio and price it would be charged at, and why it cannot be, if it cannot (ADR 0038). The one definition of a night.';

revoke execute on function app.room_nights_due(uuid, date, date, uuid) from public;
grant execute on function app.room_nights_due(uuid, date, date, uuid) to ranza_app;

-- ---------------------------------------------------------------------------
-- The close posts a day's nights
-- ---------------------------------------------------------------------------

-- Posts every night of one business day that can be charged, and answers with
-- the day's totals: every room night dated that day, whoever posted it, and
-- the nights that could not be charged, with why (RT-S3-01, RT-S3-03, RT-S3-04).
--
-- A definer, because posting a night is the close's act and not
-- finance.post_charge's: a front desk closes the day and holds no finance
-- permission. So it checks its caller first (IG-12): a Staff Member who may
-- close this Property's day, or the worker in its Organization (RT-S3-10).
-- The stamp calls it after its own checks; called directly, it is bounded the
-- same way.
--
-- The finance capability is asked through room_nights_due, which a definer
-- does not skip: an Organization whose billing lapsed posts nothing and says
-- so (RT-S3-17).
--
-- Locks: the Property's day exclusive (re-entrant under the stamp), then each
-- Stay's in hashed-key order in a loop — a single statement's order is not
-- guaranteed — so two closes can never take two Stays' locks the other way
-- round. The nights are read again in a new statement after the locks, so a
-- Folio closed while this waited is seen closed and listed, not posted into.
create function app.post_room_nights(
  target_property_id uuid,
  target_business_date date
)
returns table (
  posted integer,
  revenue bigint,
  currency text,
  unposted integer,
  unposted_list jsonb
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := app.current_user_id();
  property_organization uuid;
  stay_key integer;
begin
  select property.organization_id into property_organization
    from public.properties as property
   where property.id = target_property_id;

  if actor is not null then
    if property_organization is null
       or not app.can_use_capability(target_property_id, 'front_office', 'front_desk')
       or not app.has_organization_permission(property_organization, 'front_desk.close_day') then
      raise exception 'those room nights cannot be posted'
        using errcode = '42501';
    end if;
  elsif property_organization is null
        or app.worker_organization_id() is distinct from property_organization then
    raise exception 'those room nights cannot be posted'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(3, hashtext(target_property_id::text));

  if target_business_date >= app.property_today(target_property_id) then
    raise exception 'business day % has not ended at this Property', target_business_date
      using errcode = '55000';
  end if;

  if exists (
    select 1 from public.business_day_closes as close
     where close.property_id = target_property_id
       and close.business_date = target_business_date
  ) then
    raise exception 'business day % is closed at this Property', target_business_date
      using errcode = 'RZ001';
  end if;

  for stay_key in
    select distinct hashtext(due.stay_id::text)
      from app.room_nights_due(target_property_id, target_business_date,
                               target_business_date) as due
     where due.reason is null
     order by 1
  loop
    perform pg_advisory_xact_lock(1, stay_key);
  end loop;

  insert into public.folio_lines
    (organization_id, property_id, folio_id, line_type, description,
     amount_minor, source, business_date)
  select property_organization, target_property_id, due.folio_id, 'charge',
         'Room night', due.amount_minor, 'room_night', due.business_date
    from app.room_nights_due(target_property_id, target_business_date,
                             target_business_date) as due
   where due.reason is null
  on conflict (folio_id, business_date) where source = 'room_night'
  do nothing;

  return query
  select (select count(*)::integer
            from public.folio_lines as line
           where line.property_id = target_property_id
             and line.source = 'room_night'
             and line.business_date = target_business_date),
         (select coalesce(sum(line.amount_minor), 0)::bigint
            from public.folio_lines as line
           where line.property_id = target_property_id
             and line.source = 'room_night'
             and line.business_date = target_business_date),
         (select trim(max(folio.currency))
            from public.folio_lines as line
            join public.folios as folio on folio.id = line.folio_id
           where line.property_id = target_property_id
             and line.source = 'room_night'
             and line.business_date = target_business_date),
         missed.nights,
         missed.list
    from (
      select count(*)::integer as nights,
             coalesce(jsonb_agg(jsonb_build_object('stayId', due.stay_id,
                                                   'reason', due.reason)
                                order by due.stay_id), '[]'::jsonb) as list
        from app.room_nights_due(target_property_id, target_business_date,
                                 target_business_date) as due
       where due.reason is not null
         and due.reason <> 'already_posted'
    ) as missed;
end;
$$;

comment on function app.post_room_nights(uuid, date) is
  'Posts every Guest night of a business day that can be charged, once, and answers with the day''s room-night totals and the nights it could not charge (ADR 0038). Called by the close; checks its caller.';

revoke execute on function app.post_room_nights(uuid, date) from public;
grant execute on function app.post_room_nights(uuid, date) to ranza_app;

-- ---------------------------------------------------------------------------
-- Check-out posts what no close has reached
-- ---------------------------------------------------------------------------

-- A Guest leaving on T whose night of T-1 no close has reached is charged for
-- it by their check-out (RT-S3-06), so a settled Folio is never closed under a
-- night still owed. It takes the Stay and nothing else: today is the
-- database's, so a caller cannot charge a night that has not been slept. Days
-- already closed are the close's; a day before the Property's first close was
-- never going to be closed, and is charged here.
--
-- A definer for the reason post_room_nights is one; it checks its caller the
-- same way — a Staff Member who may check this Guest out (RT-S3-10). Locks in
-- the global order: the day shared, then the Stay. Answers with what it
-- inserted, which check-out compares with what the desk was shown (RT-S3-07).
create function app.post_room_nights_for_departure(target_stay_id uuid)
returns table (posted integer, amount bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  stay_property uuid;
  stay_organization uuid;
  stay_began date;
  today date;
  first_closed date;
  last_closed date;
begin
  select stay.property_id, stay.organization_id, stay.starts_on
    into stay_property, stay_organization, stay_began
    from public.stays as stay
   where stay.id = target_stay_id
     and stay.status = 'in_house';

  if stay_property is null
     or app.current_user_id() is null
     or not app.can_use_capability(stay_property, 'front_office', 'front_desk')
     or not app.has_organization_permission(stay_organization, 'front_desk.check_out') then
    raise exception 'those room nights cannot be posted'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock_shared(3, hashtext(stay_property::text));
  perform pg_advisory_xact_lock(1, hashtext(target_stay_id::text));

  today := app.property_today(stay_property);
  select min(close.business_date), max(close.business_date)
    into first_closed, last_closed
    from public.business_day_closes as close
   where close.property_id = stay_property;

  return query
  with charged as (
    insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description,
       amount_minor, source, business_date)
    select stay_organization, stay_property, due.folio_id, 'charge',
           'Room night', due.amount_minor, 'room_night', due.business_date
      from app.room_nights_due(stay_property, stay_began, today - 1,
                               target_stay_id) as due
     where due.reason is null
       and (first_closed is null
            or due.business_date not between first_closed and last_closed)
    on conflict (folio_id, business_date) where source = 'room_night'
    do nothing
    returning folio_lines.amount_minor
  )
  select count(*)::integer, coalesce(sum(charged.amount_minor), 0)::bigint
    from charged;
end;
$$;

comment on function app.post_room_nights_for_departure(uuid) is
  'Posts a departing Guest''s nights that no close has reached, and answers with what it posted (ADR 0038, RT-S3-06). Called by check-out; checks its caller.';

revoke execute on function app.post_room_nights_for_departure(uuid) from public;
grant execute on function app.post_room_nights_for_departure(uuid) to ranza_app;

-- ---------------------------------------------------------------------------
-- The close stamp, which now posts first (ADR 0034 amended)
-- ---------------------------------------------------------------------------

-- 20260916005000's stamp, unchanged but for the call to post_room_nights after
-- the closer is named and before anything is counted.
create or replace function app.business_day_close_is_stamped()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor uuid := app.current_user_id();
  today date;
  first_closed date;
  last_closed date;
  nights record;
begin
  if actor is not null then
    if not app.can_use_capability(new.property_id, 'front_office', 'front_desk') then
      raise exception 'that business day cannot be closed'
        using errcode = '42501';
    end if;
  elsif app.worker_organization_id() is distinct from new.organization_id then
    raise exception 'that business day cannot be closed'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(3, hashtext(new.property_id::text));

  today := app.property_today(new.property_id);
  if new.business_date >= today then
    raise exception 'business day % has not ended at this Property', new.business_date
      using errcode = '55000';
  end if;

  select min(close.business_date), max(close.business_date)
    into first_closed, last_closed
    from public.business_day_closes as close
   where close.property_id = new.property_id;

  -- Closes are contiguous from the first, so a day between the first and the
  -- last is already closed. That is said here, with the unique key's own 23505,
  -- rather than left to the key: a check constraint is evaluated before a unique
  -- index, so a closed day with items open and no reason would otherwise answer
  -- "needs a reason" to somebody whose day is simply done.
  if new.business_date between first_closed and last_closed then
    raise exception 'business day % is already closed at this Property', new.business_date
      using errcode = '23505';
  elsif last_closed is null then
    if new.business_date <> today - 1 then
      raise exception 'the first close at a Property is the day before today, %', today - 1
        using errcode = '55000';
    end if;
  elsif new.business_date > last_closed + 1 then
    raise exception 'business day % waits for % to be closed',
      new.business_date, last_closed + 1
      using errcode = '55000';
  elsif new.business_date < first_closed then
    raise exception 'business day % is before the first close at this Property, %',
      new.business_date, first_closed
      using errcode = '55000';
  end if;

  new.closed_by := actor;
  new.closed_by_job := case
    when actor is null then nullif(current_setting('app.worker_job', true), '')
  end;

  -- The day's room nights, posted before anything is counted and inside this
  -- insert, so a hand close and the worker's post the same way and a second
  -- closer, refused above, posts nothing (ADR 0038). The totals are every
  -- room night dated this day, whoever posted it: a check-out may have charged
  -- a departing Guest's last night before the close reached it.
  select * into nights
    from app.post_room_nights(new.property_id, new.business_date);
  new.room_nights_posted := nights.posted;
  new.room_revenue_minor := nights.revenue;
  new.room_revenue_currency := nights.currency;
  new.room_nights_unposted := nights.unposted;
  new.unposted := nights.unposted_list;

  -- Arrived: began that day and was not withdrawn. Departed: left that day.
  -- A night: began that day or before, and was still in house that night — in
  -- house now, or departed after it. A Guest past their departure is a night,
  -- because they were in the room.
  select count(*) filter (where stay.starts_on = new.business_date),
         count(*) filter (where stay.status = 'departed'
                            and stay.ends_on = new.business_date),
         count(*) filter (where stay.starts_on <= new.business_date
                            and (stay.status = 'in_house'
                                 or stay.ends_on > new.business_date))
    into new.arrived, new.departed, new.nights_occupied
    from public.stays as stay
   where stay.property_id = new.property_id
     and stay.status in ('in_house', 'departed');

  -- Reported and never blocking: nothing can take a payment yet (ADR 0030).
  select count(*)
    into new.folios_left_open
    from public.folios as folio
    join public.stays as stay on stay.id = folio.stay_id
   where folio.property_id = new.property_id
     and folio.status = 'open'
     and stay.status = 'departed'
     and stay.ends_on <= new.business_date;

  -- What was left open: a booking whose first night has come and nobody
  -- arrived, requested or confirmed; and a Guest in house past their
  -- departure. An open-ended Stay is never open.
  select coalesce(
           jsonb_agg(open_item.item order by open_item.item ->> 'kind',
                                             open_item.item::text),
           '[]'::jsonb)
    into new.exceptions
    from (
      select jsonb_build_object('kind', 'not_arrived',
                                'reservationId', reservation.id) as item
        from public.reservations as reservation
       where reservation.property_id = new.property_id
         and reservation.status in ('requested', 'confirmed')
         and reservation.starts_on <= new.business_date
      union all
      select jsonb_build_object('kind', 'not_departed', 'stayId', stay.id)
        from public.stays as stay
       where stay.property_id = new.property_id
         and stay.status = 'in_house'
         and stay.ends_on <= new.business_date
    ) as open_item;

  return new;
end;
$$;
