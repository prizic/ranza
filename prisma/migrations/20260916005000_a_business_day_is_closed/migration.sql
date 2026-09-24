-- CreateTable
CREATE TABLE "business_day_closes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "closed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_by" UUID,
    "closed_by_job" TEXT,
    "reason" TEXT,
    "arrived" INTEGER NOT NULL DEFAULT 0,
    "departed" INTEGER NOT NULL DEFAULT 0,
    "nights_occupied" INTEGER NOT NULL DEFAULT 0,
    "folios_left_open" INTEGER NOT NULL DEFAULT 0,
    "exceptions" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "business_day_closes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_day_closes_property_id_business_date_key" ON "business_day_closes"("property_id", "business_date");

-- AddForeignKey
ALTER TABLE "business_day_closes" ADD CONSTRAINT "business_day_closes_property_id_organization_id_fkey" FOREIGN KEY ("property_id", "organization_id") REFERENCES "properties"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "business_day_closes" ADD CONSTRAINT "business_day_closes_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------
-- Hand-written from here down (RANZ-26, ADR 0034)
-- ---------------------------------------------------------------------------

-- ON THE NUMBER. 005000 to 005499 belong to feat/close-the-day. Housekeeping
-- holds 003000 to 003499, the front desk 003500 to 003999, audit hardening
-- 004200 and maintenance 004300 onwards; a gap is cheaper than two branches
-- renumbering each other.
--
-- A business day is closed once the clock has ended it, and never before
-- (ADR 0034). A close is one row per Property and business date: the unique
-- key above is both the claim and the idempotency key, so a Staff Member and
-- the worker closing the same day at the same moment make one row, and the one
-- that loses is told the day is already closed.
--
-- SQLSTATEs, because the application reads them rather than messages:
--   42501  the caller may not close this Property's day
--   55000  the day has not ended, or waits for the day before it
--   23505  the day is already closed
--   23514  items were left open and no reason was given
--   RZ001  a business day is closed, so this change would rewrite it. RZ is a
--          class Postgres does not use; it is Ranza's own, and this is the
--          first code in it. 55000 was taken: withdrawing a check-in already
--          raises it for "money has been posted", which is a different answer.

-- ---------------------------------------------------------------------------
-- The row
-- ---------------------------------------------------------------------------

alter table public.business_day_closes
  add constraint business_day_closes_counts_check
    check (arrived >= 0 and departed >= 0 and nights_occupied >= 0
           and folios_left_open >= 0),
  -- A person or a job, never both and never neither (ADR 0018 names the job
  -- when there is no person).
  add constraint business_day_closes_closer_check
    check ((closed_by is null) <> (closed_by_job is null)),
  add constraint business_day_closes_job_check
    check (closed_by_job ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  -- The bounds audit.records puts on a reason, so a reason accepted here is
  -- one the audit record of the same close accepts.
  add constraint business_day_closes_reason_check
    check (reason is null or char_length(btrim(reason)) between 3 and 2000),
  add constraint business_day_closes_exceptions_check
    check (jsonb_typeof(exceptions) = 'array'),
  -- Items left open need somebody to say why the day closed anyway. A check
  -- rather than a line in the trigger, because it is a fact about the row the
  -- trigger has just finished writing, and a constraint is where that belongs.
  add constraint business_day_closes_exceptions_need_a_reason
    check (exceptions = '[]'::jsonb or reason is not null);

comment on table public.business_day_closes is
  'A business day a Property has closed (ADR 0034). One row per Property and business date, append-only. The closer supplies the day and a reason; app.business_day_close_is_stamped() supplies the closer and the snapshot.';

-- ---------------------------------------------------------------------------
-- The stamp
-- ---------------------------------------------------------------------------

-- Runs before every insert, for every path. A Staff Member's close and the
-- worker's end in this one insert, so they cannot record different things.
--
-- Security invoker. Its counts are the Property's rather than the closer's
-- because a closer must reach the Property, and every Staff read of stays,
-- reservations and folios is by reach alone; the worker reaches this trigger
-- from inside a definer, as that definer's owner. The suite pins those three
-- read policies (CD-S1-17): the day one is narrowed below reach, this must
-- become a definer or the snapshot will count what the closer happens to see.
--
-- The caller is checked first, so a Property in another Organization is
-- refused before anything about it — its business date, its closes — is read.
-- The permission is the policy's, after this: a Staff Member who reaches the
-- Property without front_desk.close_day learns only what they can already see.
--
-- The Property's advisory lock, namespace 3 (1 is the Stay, 2 the Unit), is
-- what stays_keep_closed_days takes too, shared, so a close and a check-in,
-- check-out or withdrawal dated on the same day cannot interleave. Every query
-- after it takes a fresh snapshot, because this function is volatile and the
-- transaction is READ COMMITTED: it sees whatever the lock was waiting for.
create function app.business_day_close_is_stamped()
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

comment on function app.business_day_close_is_stamped() is
  'Before a close is inserted: checks the caller, refuses a day that has not ended or is out of order, names the closer and computes the snapshot (ADR 0034).';

create trigger business_day_closes_stamped
  before insert on public.business_day_closes
  for each row
  execute function app.business_day_close_is_stamped();

-- For every role, the owner included, as audit.records and folio_lines are:
-- a policy and a grant say nothing to the role that runs migrations.
create function app.business_day_close_is_never_rewritten()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'a business day close is never rewritten'
    using errcode = '42501';
end;
$$;

create trigger business_day_closes_append_only
  before update or delete or truncate on public.business_day_closes
  for each statement
  execute function app.business_day_close_is_never_rewritten();

-- ---------------------------------------------------------------------------
-- Who may close, and who may read
-- ---------------------------------------------------------------------------

insert into public.staff_permissions (key, module_key) values
  ('front_desk.close_day', 'front_office');

-- Not finance: closing posts nothing until room nights exist, and the shipped
-- finance role holds no front-desk permission. Not housekeeping, as the
-- mockup has it.
update public.staff_roles
   set permissions = array_append(permissions, 'front_desk.close_day'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager', 'front_desk')
   and not ('front_desk.close_day' = any (permissions));

alter table public.business_day_closes enable row level security;
alter table public.business_day_closes force row level security;

create policy business_day_closes_read_accessible_property
  on public.business_day_closes for select
  using (property_id in (select app.accessible_property_ids()));

-- All five gates (ADR 0012): the four of blueprint 3.5 through
-- can_use_capability, and the permission.
create policy business_day_closes_insert_front_desk
  on public.business_day_closes for insert
  with check (
    app.can_use_capability(property_id, 'front_office', 'front_desk')
    and app.has_organization_permission(organization_id, 'front_desk.close_day')
  );

-- The day and a reason. The closer, the counts, the exceptions and when it
-- closed are the database's, so none of them is granted.
revoke all on public.business_day_closes from public, ranza_app, ranza_auth, ranza_worker;
grant select on public.business_day_closes to ranza_app;
grant insert (organization_id, property_id, business_date, reason)
  on public.business_day_closes to ranza_app;

-- ---------------------------------------------------------------------------
-- Nothing is dated on a closed day afterwards
-- ---------------------------------------------------------------------------

-- Every date the front desk writes is app.property_today() or later — a Stay
-- begins, and ends, on the day it is written — so a closed day receives nothing
-- new except in the ways below.
--
-- That "or later" is read at the start of a transaction (now() is the
-- transaction's), and a check-in or check-out that began before the cutoff can
-- commit after the day has closed. So a Stay is refused a date on or before the
-- last close whenever one is written: begun (a check-in), ended (a check-out),
-- taken back (a withdrawn check-in, which would put an unarrived booking back
-- into a day that is finalized), or re-dated after it happened — a departed
-- Stay's dates are what a closed day counted. An in-house Stay's planned
-- departure is not: a close counts it by its status, so moving that date is
-- left to whatever amends a booking.
--
-- Lock 3 shared, where the close takes it exclusive: check-ins and check-outs
-- do not queue behind each other, and each waits for a close in progress and
-- then sees it, while a close waits for each and then counts it.
--
-- Security invoker, reading closes through business_day_closes'
-- read policy, which is by reach alone; whoever may write a Stay reaches its
-- Property. business_day_close.test.sql pins that policy beside the three the
-- stamp relies on, and asserts the refusal for a role that cannot close a day.
create function app.stays_keep_closed_days()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dated date;
begin
  if tg_op = 'INSERT' then
    dated := new.starts_on;
  else
    if new.status is distinct from old.status then
      dated := case
        when new.status = 'departed' then new.ends_on
        when old.status = 'in_house' and new.status = 'cancelled' then old.starts_on
        when old.status = 'departed' then old.ends_on
      end;
    end if;
    -- least() skips nulls, so each of these only ever narrows the date.
    if new.starts_on is distinct from old.starts_on then
      dated := least(dated, old.starts_on, new.starts_on);
    end if;
    if old.status = 'departed' and new.status = 'departed'
       and new.ends_on is distinct from old.ends_on then
      dated := least(dated, old.ends_on, new.ends_on);
    end if;
  end if;

  if dated is null then
    return new;
  end if;

  perform pg_advisory_xact_lock_shared(3, hashtext(new.property_id::text));
  if exists (
    select 1
      from public.business_day_closes as close
     where close.property_id = new.property_id
       and close.business_date >= dated
  ) then
    raise exception 'business day % is closed at this Property', dated
      using errcode = 'RZ001';
  end if;
  return new;
end;
$$;

create trigger stays_keep_closed_days_on_insert
  before insert on public.stays
  for each row
  execute function app.stays_keep_closed_days();

create trigger stays_keep_closed_days_on_update
  before update of status, starts_on, ends_on on public.stays
  for each row
  execute function app.stays_keep_closed_days();

-- A cutoff or time zone that would make today a day already closed. Changing
-- them is SQL until a settings screen exists (ADR 0021), and this binds that
-- SQL too.
create function app.properties_keep_today_after_the_last_close()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(3, hashtext(new.id::text));
  if app.business_date(now(), new.timezone, new.business_date_cutoff)
     <= (select max(close.business_date)
           from public.business_day_closes as close
          where close.property_id = new.id) then
    raise exception 'this change would make today a business day that is already closed'
      using errcode = 'RZ001';
  end if;
  return new;
end;
$$;

create trigger properties_keep_today_after_the_last_close
  before update of timezone, business_date_cutoff on public.properties
  for each row
  when (new.timezone is distinct from old.timezone
        or new.business_date_cutoff is distinct from old.business_date_cutoff)
  execute function app.properties_keep_today_after_the_last_close();
