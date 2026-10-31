-- A Resident pays by instalments (RANZ-96, PP-S1-*, ADR 0059 Proposed).
--
-- A Turkish yurt takes a term's fee in parts: ten monthly payments, or four
-- senets. Both are the same thing — N amounts, each due on a date — so that is
-- all this models. A plan belongs to one booking of a Resident for a term, and
-- the worker charges each instalment to the Resident's Folio on its due date.
-- Nothing here is specific to a dormitory and nothing reads `operating_model`
-- (ADR 0057): a hotel that lets a long-stay Resident pay in parts has the same
-- plan.
--
-- Three tables' worth of facts, kept in two:
--
--   payment_plans       one per booking of a Resident; the contract's header
--   plan_instalments    one row per amount and due date. Never changed and
--                       never deleted: a revision withdraws what has not been
--                       charged and writes new rows beside it, so the schedule
--                       as it stood is always there to read.
--
-- That an instalment has been charged is not stored on it. It is the Folio
-- line that names it (folio_lines.instalment_id), and a unique index on that
-- column is what makes "charged once" a fact about the database rather than a
-- check somebody has to remember (PP-S1-*). Overdue is defined once, in
-- app.payment_plan_standing(), and everything that says "overdue" reads it.
--
-- Locks, globally (ADR 0038): the Unit (namespace 2), then the Property's
-- business day (3), then the Stay (1). Posting an instalment takes the Stay's
-- and nothing else; revising a plan takes its row first and never a Stay's.
--
-- SQLSTATEs, Ranza's own class (see 20260916005000):
--   RZP01  only a Resident pays by instalments
--   RZP02  a booking with a plan has a departure date
--   RZP03  an instalment cannot fall due after the term ends
--   RZP04  an instalment that was charged, or withdrawn, is history
--   RZP05  a booking that has ended takes no plan
--   RZP06  this Property keeps no Folios, so nothing could be charged
--   42501  not the caller's to make or to revise

-- ---------------------------------------------------------------------------
-- The two tables
-- ---------------------------------------------------------------------------

create table public.payment_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null,
  reservation_id uuid not null,
  -- The Property's currency when the plan was made. A Folio opens in the same
  -- one, and an instalment is charged only to a Folio that agrees.
  currency char(3) not null,
  -- 1 when the plan is made; one more each time it is revised.
  revision integer not null default 1,
  created_by uuid not null references public.users (id) on delete restrict,
  created_at timestamptz not null default current_timestamp,
  revised_by uuid references public.users (id) on delete restrict,
  revised_at timestamptz,
  constraint payment_plans_property_fkey
    foreign key (property_id, organization_id)
    references public.properties (id, organization_id)
    on delete restrict on update no action,
  constraint payment_plans_reservation_fkey
    foreign key (reservation_id, property_id, organization_id)
    references public.reservations (id, property_id, organization_id)
    on delete restrict on update no action,
  -- One plan per booking. A change of plan is a revision of this one.
  constraint payment_plans_reservation_key unique (reservation_id),
  constraint payment_plans_scope_key unique (id, property_id, organization_id),
  constraint payment_plans_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint payment_plans_revision_check check (revision >= 1),
  -- Revised exactly when the revision is past the first, and by somebody.
  constraint payment_plans_revised_together
    check ((revision = 1) = (revised_at is null)
           and (revised_at is null) = (revised_by is null))
);

comment on table public.payment_plans is
  'One payment plan per booking of a Resident: the header of a term contract whose instalments the worker charges to the Folio on their due dates (PP-S1-*, ADR 0059).';

create table public.plan_instalments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null,
  plan_id uuid not null,
  -- Order in which it was written, for the plan's whole life. Unique, so two
  -- instalments due on one day still have an order and a number.
  ordinal integer not null,
  amount_minor bigint not null,
  due_on date not null,
  -- The plan's revision that wrote it.
  revision integer not null,
  withdrawn_at timestamptz,
  withdrawn_reason text,
  created_at timestamptz not null default current_timestamp,
  constraint plan_instalments_plan_fkey
    foreign key (plan_id, property_id, organization_id)
    references public.payment_plans (id, property_id, organization_id)
    on delete restrict on update no action,
  constraint plan_instalments_scope_key unique (id, property_id, organization_id),
  constraint plan_instalments_ordinal_key unique (plan_id, ordinal),
  constraint plan_instalments_amount_check check (amount_minor > 0),
  constraint plan_instalments_revision_check check (revision >= 1),
  constraint plan_instalments_withdrawn_together
    check ((withdrawn_at is null) = (withdrawn_reason is null)),
  constraint plan_instalments_withdrawn_reason_check
    check (withdrawn_reason is null
           or withdrawn_reason in ('revised', 'reservation_ended'))
);

comment on table public.plan_instalments is
  'One amount and one due date of a payment plan. Never changed and never deleted; withdrawn when a revision replaces it or its booking ends, and never once charged (PP-S1-*, ADR 0059).';

create index plan_instalments_property_due_idx
  on public.plan_instalments (property_id, due_on);

-- ---------------------------------------------------------------------------
-- A Folio line can be an instalment
-- ---------------------------------------------------------------------------

alter table public.folio_lines
  add column instalment_id uuid;

alter table public.folio_lines
  add constraint folio_lines_instalment_fkey
    foreign key (instalment_id, property_id, organization_id)
    references public.plan_instalments (id, property_id, organization_id)
    on delete restrict on update no action,
  drop constraint folio_lines_source_check,
  add constraint folio_lines_source_check
    check (source is null
           or (source in ('room_night', 'instalment') and line_type = 'charge')),
  -- An instalment line names its instalment and only an instalment line does.
  add constraint folio_lines_instalment_is_its_source
    check ((source = 'instalment') = (instalment_id is not null));

-- An instalment is charged once: one Folio line per instalment, whoever posts
-- it — a pass, a retried pass, or a second worker running the same pass. A
-- plain unique index, because NULLs never collide and most lines have none.
create unique index folio_lines_instalment_key
  on public.folio_lines (instalment_id);

comment on index public.folio_lines_instalment_key is
  'An instalment is charged once: one Folio line per instalment, whoever posts it (PP-S1-*, ADR 0059).';

-- No grant names instalment_id or source: ranza_app's insert on folio_lines is
-- a column list (20260916002150), so a Staff Member posting a charge by hand
-- cannot mark it an instalment. Only post_due_instalments() writes one, and
-- the dated constraint of 20260916008200 ties its business_date to the day
-- the instalment fell due.

-- ---------------------------------------------------------------------------
-- What a plan may be
-- ---------------------------------------------------------------------------

-- A plan is for a Resident, for a term, on a booking that is still to come or
-- in progress (PP-S1-*). The end date is a rule on the plan and not on the
-- operating model: instalments are scheduled against a term, so a booking that
-- has one needs it. Said here, for every writer.
create function app.payment_plan_belongs_to_a_term()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  booking record;
begin
  select reservation.stay_type, reservation.ends_on, reservation.status
    into booking
    from public.reservations as reservation
   where reservation.id = new.reservation_id;

  if booking.stay_type is distinct from 'resident' then
    raise exception 'only a Resident pays by instalments'
      using errcode = 'RZP01';
  end if;

  if booking.ends_on is null then
    raise exception 'a payment plan needs the booking to have a departure date'
      using errcode = 'RZP02';
  end if;

  if booking.status not in ('requested', 'confirmed', 'checked_in') then
    raise exception 'a booking that has ended takes no payment plan'
      using errcode = 'RZP05';
  end if;

  return new;
end;
$$;

create trigger payment_plans_belong_to_a_term
  before insert on public.payment_plans
  for each row execute function app.payment_plan_belongs_to_a_term();

-- An instalment falls due within the term: a charge cannot be due after the
-- Stay it is charged to has ended, and check-out closes the Folio. It may fall
-- due before the term starts — the first payment is often made at registration.
create function app.plan_instalment_falls_due_within_the_term()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  term_ends date;
begin
  select reservation.ends_on
    into term_ends
    from public.payment_plans as plan
    join public.reservations as reservation on reservation.id = plan.reservation_id
   where plan.id = new.plan_id;

  if term_ends is null or new.due_on > term_ends then
    raise exception 'an instalment cannot fall due after the term ends'
      using errcode = 'RZP03';
  end if;

  return new;
end;
$$;

create trigger plan_instalments_fall_due_within_the_term
  before insert on public.plan_instalments
  for each row execute function app.plan_instalment_falls_due_within_the_term();

-- A booking that has a plan keeps a departure date. The reservation's own
-- check allows a Resident an open end, so this is the other half of the rule
-- above: a plan cannot be made on an open-ended booking and an open-ended
-- booking cannot be made of one that has a plan. The booking is read FOR SHARE
-- by the function that makes a plan, so the two cannot both pass at once.
create function app.reservation_with_a_plan_keeps_its_departure()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.payment_plans as plan
     where plan.reservation_id = new.id
  ) then
    raise exception 'a booking with a payment plan keeps its departure date'
      using errcode = 'RZP02';
  end if;

  return new;
end;
$$;

create trigger reservations_with_a_plan_keep_their_departure
  before update of ends_on on public.reservations
  for each row
  when (new.ends_on is null)
  execute function app.reservation_with_a_plan_keeps_its_departure();

-- ---------------------------------------------------------------------------
-- History is never rewritten
-- ---------------------------------------------------------------------------

-- A plan changes only by being revised: its revision, and who and when.
create function app.payment_plan_keeps_its_history()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'a payment plan is never deleted'
      using errcode = 'RZP04';
  end if;

  if (new.id, new.organization_id, new.property_id, new.reservation_id,
      new.currency, new.created_by, new.created_at)
     is distinct from
     (old.id, old.organization_id, old.property_id, old.reservation_id,
      old.currency, old.created_by, old.created_at) then
    raise exception 'a payment plan changes only by being revised'
      using errcode = 'RZP04';
  end if;

  return new;
end;
$$;

create trigger payment_plans_keep_their_history
  before update or delete on public.payment_plans
  for each row execute function app.payment_plan_keeps_its_history();

-- An instalment changes only by being withdrawn, once, and never after it was
-- charged: the Folio line that names it is the record that it was. A deleted
-- one would take with it the reason a line is on a bill.
create function app.plan_instalment_keeps_its_history()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'an instalment is never deleted'
      using errcode = 'RZP04';
  end if;

  if (new.id, new.organization_id, new.property_id, new.plan_id, new.ordinal,
      new.amount_minor, new.due_on, new.revision, new.created_at)
     is distinct from
     (old.id, old.organization_id, old.property_id, old.plan_id, old.ordinal,
      old.amount_minor, old.due_on, old.revision, old.created_at) then
    raise exception 'an instalment is never changed, only withdrawn'
      using errcode = 'RZP04';
  end if;

  if old.withdrawn_at is not null then
    raise exception 'that instalment is already withdrawn'
      using errcode = 'RZP04';
  end if;

  if exists (
    select 1 from public.folio_lines as line
     where line.instalment_id = old.id
  ) then
    raise exception 'an instalment that was charged is history'
      using errcode = 'RZP04';
  end if;

  return new;
end;
$$;

create trigger plan_instalments_keep_their_history
  before update or delete on public.plan_instalments
  for each row execute function app.plan_instalment_keeps_its_history();

-- A withdrawn instalment is not charged, by anyone: the worker re-reads it
-- under a lock, and this holds the line for every writer all the same.
create function app.instalment_line_is_for_a_live_instalment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.source is distinct from 'instalment' then
    return new;
  end if;

  if exists (
    select 1 from public.plan_instalments as instalment
     where instalment.id = new.instalment_id
       and instalment.withdrawn_at is not null
  ) then
    raise exception 'a withdrawn instalment is not charged'
      using errcode = 'RZP04';
  end if;

  return new;
end;
$$;

create trigger folio_lines_instalment_is_live
  before insert on public.folio_lines
  for each row execute function app.instalment_line_is_for_a_live_instalment();

-- ---------------------------------------------------------------------------
-- Who reads, and who writes
-- ---------------------------------------------------------------------------

alter table public.payment_plans enable row level security;
alter table public.payment_plans force row level security;
alter table public.plan_instalments enable row level security;
alter table public.plan_instalments force row level security;

-- By reach, as the Folio is: whoever may see a Resident's bill may see the
-- schedule it is charged from.
create policy payment_plans_read_accessible_property
  on public.payment_plans for select
  using (property_id in (select app.accessible_property_ids()));

create policy plan_instalments_read_accessible_property
  on public.plan_instalments for select
  using (property_id in (select app.accessible_property_ids()));

-- Nobody writes a plan directly. Making one and revising one are the two
-- functions below, which check their caller, and the only other thing that
-- happens to a plan is the booking ending, which is the policy that follows.
revoke all on public.payment_plans from public, ranza_app, ranza_auth, ranza_worker;
revoke all on public.plan_instalments from public, ranza_app, ranza_auth, ranza_worker;
grant select on public.payment_plans to ranza_app;
grant select on public.plan_instalments to ranza_app;

-- A booking that ends — cancelled, no-show or checked out — has nothing left
-- to charge. The trigger below withdraws what was not charged, as the Staff
-- Member who ended it, so this is the one write ranza_app has on a schedule,
-- bounded the way ADR 0012 says: the policy to the rows of a booking that has
-- ended and to a Staff Member who holds the permission of the command that
-- ended it — the one reservations_update_front_desk asked for — and the grant
-- to the two columns that say so. Reach alone would let a Housekeeping member
-- withdraw a Resident's schedule.
create policy plan_instalments_withdrawn_with_their_booking
  on public.plan_instalments for update
  using (
    app.can_use_capability(property_id, 'front_office', 'front_desk')
    and exists (
      select 1
        from public.payment_plans as plan
        join public.reservations as reservation on reservation.id = plan.reservation_id
       where plan.id = plan_instalments.plan_id
         and case reservation.status
               when 'checked_out' then app.has_organization_permission(plan.organization_id, 'front_desk.check_out')
               when 'cancelled'   then app.has_organization_permission(plan.organization_id, 'front_desk.cancel')
               when 'no_show'     then app.has_organization_permission(plan.organization_id, 'front_desk.cancel')
               else false
             end
    )
  )
  with check (
    withdrawn_at is not null
    and withdrawn_reason = 'reservation_ended'
  );

grant update (withdrawn_at, withdrawn_reason) on public.plan_instalments to ranza_app;

create function app.reservation_ending_withdraws_its_instalments()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.plan_instalments as instalment
     set withdrawn_at = current_timestamp,
         withdrawn_reason = 'reservation_ended'
    from public.payment_plans as plan
   where plan.id = instalment.plan_id
     and plan.reservation_id = new.id
     and instalment.withdrawn_at is null
     and not exists (
       select 1 from public.folio_lines as line
        where line.instalment_id = instalment.id
     );

  return null;
end;
$$;

create trigger reservations_ending_withdraw_their_instalments
  after update of status on public.reservations
  for each row
  when (new.status in ('cancelled', 'no_show', 'checked_out')
        and old.status is distinct from new.status)
  execute function app.reservation_ending_withdraws_its_instalments();

-- ---------------------------------------------------------------------------
-- Making a plan
-- ---------------------------------------------------------------------------

-- Whoever may take the booking may make its plan (PP-S1-*): it is the same act
-- as registering the student, in the same dialog, and the front desk holds no
-- finance permission. Revising it is finance's (below). `wanted` is the
-- schedule as a JSON array of {"amountMinor": 120000, "dueOn": "2026-10-01"},
-- between one and sixty of them; the table's constraints and triggers decide
-- whether each is acceptable, so a bad row raises with its own SQLSTATE.
--
-- Returns what was made, for the audit record the caller writes.
create function app.create_payment_plan(target_reservation_id uuid, wanted jsonb)
returns table (
  plan_id uuid,
  plan_organization_id uuid,
  plan_property_id uuid,
  instalment_count integer,
  total_minor bigint,
  plan_currency text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := app.current_user_id();
  booking public.reservations%rowtype;
  made_plan uuid;
  made_currency text;
begin
  -- FOR SHARE: a booking being given a plan and the same booking losing its
  -- departure date cannot both pass their checks.
  select * into booking
    from public.reservations as reservation
   where reservation.id = target_reservation_id
     for share;

  if not found
     or actor is null
     or not app.can_use_capability(booking.property_id, 'front_office', 'front_desk')
     or not app.has_organization_permission(booking.organization_id, 'front_desk.book') then
    raise exception 'that payment plan cannot be made'
      using errcode = '42501';
  end if;

  if not app.can_use_capability(booking.property_id, 'billing_folios', 'finance') then
    raise exception 'this Property keeps no Folios, so nothing could be charged'
      using errcode = 'RZP06';
  end if;

  if jsonb_typeof(wanted) is distinct from 'array'
     or jsonb_array_length(wanted) not between 1 and 60 then
    raise exception 'a payment plan has between one and sixty instalments'
      using errcode = '22023';
  end if;

  select trim(property.currency) into made_currency
    from public.properties as property
   where property.id = booking.property_id;

  insert into public.payment_plans
    (organization_id, property_id, reservation_id, currency, created_by)
  values
    (booking.organization_id, booking.property_id, booking.id, made_currency, actor)
  returning id into made_plan;

  insert into public.plan_instalments
    (organization_id, property_id, plan_id, ordinal, amount_minor, due_on, revision)
  select booking.organization_id, booking.property_id, made_plan,
         row_number() over (order by (item.value ->> 'dueOn')::date, item.position),
         (item.value ->> 'amountMinor')::bigint,
         (item.value ->> 'dueOn')::date,
         1
    from jsonb_array_elements(wanted) with ordinality as item (value, position);

  return query
  select made_plan, booking.organization_id, booking.property_id,
         jsonb_array_length(wanted),
         (select sum(instalment.amount_minor)::bigint
            from public.plan_instalments as instalment
           where instalment.plan_id = made_plan),
         made_currency;
end;
$$;

comment on function app.create_payment_plan(uuid, jsonb) is
  'Makes the payment plan of a booking of a Resident, with its instalments, as whoever may take the booking. Checks its caller; answers with what it made, for the audit record (PP-S1-*, ADR 0059).';

revoke execute on function app.create_payment_plan(uuid, jsonb) from public;
grant execute on function app.create_payment_plan(uuid, jsonb) to ranza_app;

-- ---------------------------------------------------------------------------
-- Revising one
-- ---------------------------------------------------------------------------

-- A revision withdraws every instalment not yet charged and writes `wanted` in
-- its place, as the plan's next revision. What was charged stays as it was; a
-- charged instalment that was wrong is reversed on the Folio, and is then
-- 'waived' in the standing below, not rewritten. At least one instalment must
-- be written: a plan is stopped by revising it to what is still owed, not by
-- emptying it.
--
-- finance.post_charge: a revision schedules charges to somebody's bill, and the
-- front desk, which makes the plan, holds no finance permission.
create function app.revise_payment_plan(target_reservation_id uuid, wanted jsonb)
returns table (
  plan_id uuid,
  plan_organization_id uuid,
  plan_property_id uuid,
  plan_revision integer,
  withdrawn_count integer,
  added_count integer,
  total_minor bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := app.current_user_id();
  existing public.payment_plans%rowtype;
  withdrawn integer;
  next_ordinal integer;
begin
  select * into existing
    from public.payment_plans as plan
   where plan.reservation_id = target_reservation_id
     for update;

  if not found
     or actor is null
     or not app.can_use_capability(existing.property_id, 'billing_folios', 'finance')
     or not app.has_organization_permission(existing.organization_id, 'finance.post_charge') then
    raise exception 'that payment plan cannot be revised'
      using errcode = '42501';
  end if;

  if jsonb_typeof(wanted) is distinct from 'array'
     or jsonb_array_length(wanted) not between 1 and 60 then
    raise exception 'a payment plan has between one and sixty instalments'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.reservations as reservation
     where reservation.id = existing.reservation_id
       and reservation.status in ('requested', 'confirmed', 'checked_in')
  ) then
    raise exception 'a booking that has ended takes no payment plan'
      using errcode = 'RZP05';
  end if;

  update public.plan_instalments as instalment
     set withdrawn_at = current_timestamp,
         withdrawn_reason = 'revised'
   where instalment.plan_id = existing.id
     and instalment.withdrawn_at is null
     and not exists (
       select 1 from public.folio_lines as line
        where line.instalment_id = instalment.id
     );
  get diagnostics withdrawn = row_count;

  select coalesce(max(instalment.ordinal), 0) into next_ordinal
    from public.plan_instalments as instalment
   where instalment.plan_id = existing.id;

  update public.payment_plans
     set revision = revision + 1,
         revised_at = current_timestamp,
         revised_by = actor
   where id = existing.id
  returning revision into existing.revision;

  insert into public.plan_instalments
    (organization_id, property_id, plan_id, ordinal, amount_minor, due_on, revision)
  select existing.organization_id, existing.property_id, existing.id,
         next_ordinal
           + row_number() over (order by (item.value ->> 'dueOn')::date, item.position),
         (item.value ->> 'amountMinor')::bigint,
         (item.value ->> 'dueOn')::date,
         existing.revision
    from jsonb_array_elements(wanted) with ordinality as item (value, position);

  return query
  select existing.id, existing.organization_id, existing.property_id,
         existing.revision, withdrawn, jsonb_array_length(wanted),
         (select sum(instalment.amount_minor)::bigint
            from public.plan_instalments as instalment
           where instalment.plan_id = existing.id
             and instalment.withdrawn_at is null);
end;
$$;

comment on function app.revise_payment_plan(uuid, jsonb) is
  'Withdraws the instalments of a plan that were not charged and writes a new schedule in their place, as its next revision, as whoever may post a charge. Checks its caller; answers with what changed, for the audit record (PP-S1-*, ADR 0059).';

revoke execute on function app.revise_payment_plan(uuid, jsonb) from public;
grant execute on function app.revise_payment_plan(uuid, jsonb) to ranza_app;

-- ---------------------------------------------------------------------------
-- Where a schedule stands: the one definition of overdue
-- ---------------------------------------------------------------------------

-- Every live instalment of a Property — or of one booking — with what has been
-- paid toward it and where it stands. THE definition of overdue (PP-S1-*): the
-- close, the Today screen, the booking's schedule and the Resident's portal all
-- read this and none restates it.
--
--   A payment settles the oldest instalment first. What a Resident has paid on
--   their Folio — payments, net of the reversals of payments — is laid over
--   their instalments in due-date order, so a payment covers the first
--   instalment before it reaches the second. Other charges on the Folio are not
--   instalments and are not what this reads; a payment made toward one is laid
--   over the instalments all the same, which is a simplification the README
--   records (PP-DEF-01).
--
--   waived    the Folio line charging it was reversed. It owes nothing, and
--             covers none of the payments.
--   paid      paid in full
--   overdue   past its due date — the day after, in the Property's own time —
--             and not paid in full. The money owed is outstanding_minor.
--   due       falls due today and is not paid
--   upcoming  falls due after today and is not paid
--
-- Whether it has been charged to the Folio is separate: `posted`. An instalment
-- is overdue because of its date and what was paid, not because the worker has
-- or has not reached it; a Resident who has not arrived yet, with no Folio to
-- pay into, is overdue on the day after it fell due like any other.
--
-- Security invoker and stable. It reads plans, Folios and their lines through
-- the caller's policies, which are all by reach, so a caller sees the
-- instalments of the Properties they reach and no others.
create function app.payment_plan_standing(
  target_property_id uuid,
  target_reservation_id uuid default null
)
returns table (
  instalment_id uuid,
  plan_id uuid,
  reservation_id uuid,
  number integer,
  due_on date,
  amount_minor bigint,
  currency text,
  posted boolean,
  paid_minor bigint,
  outstanding_minor bigint,
  state text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with today as (
    select app.property_today(target_property_id) as day
  ),
  live as (
    select instalment.id, instalment.plan_id, plan.reservation_id,
           trim(plan.currency) as currency, instalment.ordinal,
           instalment.due_on, instalment.amount_minor,
           line.id is not null as posted,
           reversal.id is not null as waived
      from public.plan_instalments as instalment
      join public.payment_plans as plan on plan.id = instalment.plan_id
      left join public.folio_lines as line on line.instalment_id = instalment.id
      left join public.folio_lines as reversal
        on reversal.reverses_line_id = line.id
       and reversal.folio_id = line.folio_id
     where plan.property_id = target_property_id
       and (target_reservation_id is null
            or plan.reservation_id = target_reservation_id)
       and instalment.withdrawn_at is null
  ),
  paid as (
    select stay.reservation_id,
           coalesce(-sum(line.amount_minor) filter (
             where line.line_type = 'payment'
                or (line.line_type = 'reversal' and original.line_type = 'payment')
           ), 0)::bigint as paid_minor
      from public.stays as stay
      join public.folios as folio on folio.stay_id = stay.id
      join public.folio_lines as line on line.folio_id = folio.id
      left join public.folio_lines as original on original.id = line.reverses_line_id
     where stay.reservation_id in (select live.reservation_id from live)
     group by stay.reservation_id
  ),
  stacked as (
    select live.*,
           row_number() over booking_order as number,
           coalesce(paid.paid_minor, 0) as paid_total,
           coalesce(sum(case when live.waived then 0 else live.amount_minor end)
                      over (partition by live.reservation_id
                            order by live.due_on, live.ordinal
                            rows between unbounded preceding and 1 preceding),
                    0)::bigint as owed_before
      from live
      left join paid on paid.reservation_id = live.reservation_id
    window booking_order as (partition by live.reservation_id
                             order by live.due_on, live.ordinal)
  ),
  covered as (
    select stacked.*,
           case when stacked.waived then 0::bigint
                else least(stacked.amount_minor,
                           greatest(0::bigint, stacked.paid_total - stacked.owed_before))
           end as covered_minor
      from stacked
  )
  select covered.id, covered.plan_id, covered.reservation_id,
         covered.number::integer, covered.due_on, covered.amount_minor,
         covered.currency, covered.posted, covered.covered_minor,
         case when covered.waived then 0::bigint
              else covered.amount_minor - covered.covered_minor
         end,
         case
           when covered.waived then 'waived'
           when covered.covered_minor >= covered.amount_minor then 'paid'
           when covered.due_on < today.day then 'overdue'
           when covered.due_on = today.day then 'due'
           else 'upcoming'
         end
    from covered
   cross join today
   order by covered.reservation_id, covered.due_on, covered.ordinal
$$;

comment on function app.payment_plan_standing(uuid, uuid) is
  'The live instalments of a Property, or of one booking, with what each has been paid and its state: waived, paid, overdue, due or upcoming. The one definition of overdue; payments settle the oldest instalment first (PP-S1-*, ADR 0059).';

revoke execute on function app.payment_plan_standing(uuid, uuid) from public;
grant execute on function app.payment_plan_standing(uuid, uuid) to ranza_app;

-- How many Residents are overdue at a Property, on how many instalments, and
-- for how much. Named for what it counts, because the Today screen reads it:
-- `students` is Residents with at least one overdue instalment, and
-- `outstanding_minor` is the money overdue, not the money owed in all.
create function app.payment_plans_overdue(target_property_id uuid)
returns table (
  students integer,
  instalments integer,
  outstanding_minor bigint,
  currency text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select count(distinct standing.reservation_id)::integer,
         count(standing.instalment_id)::integer,
         coalesce(sum(standing.outstanding_minor), 0)::bigint,
         (select trim(property.currency)
            from public.properties as property
           where property.id = target_property_id)
    from app.payment_plan_standing(target_property_id) as standing
   where standing.state = 'overdue'
$$;

comment on function app.payment_plans_overdue(uuid) is
  'Residents with an overdue instalment at a Property, the instalments, and the money overdue, read from app.payment_plan_standing(), the one definition of overdue (PP-S1-*, ADR 0059).';

revoke execute on function app.payment_plans_overdue(uuid) from public;
grant execute on function app.payment_plans_overdue(uuid) to ranza_app;

-- ---------------------------------------------------------------------------
-- The worker charges what has fallen due
-- ---------------------------------------------------------------------------

-- What is ready to be charged, anywhere: a live instalment, not yet charged,
-- fallen due by its Property's own calendar, whose Resident has a Folio that is
-- open and trades in the plan's currency, at a Property whose billing is
-- available. The one definition of ready; the two functions below ask it, and
-- nothing else does — it is granted to nobody.
--
-- A Resident who has not arrived has no Folio and is not ready: the instalment
-- waits, overdue by its date, and is charged on the pass after they check in.
-- capability_is_available rather than can_use_capability, whose fourth gate
-- needs a Staff Member and is always false for the worker.
create function app.instalments_ready(target_property_id uuid default null)
returns table (
  organization_id uuid,
  property_id uuid,
  instalment_id uuid,
  plan_id uuid,
  reservation_id uuid,
  stay_id uuid,
  folio_id uuid,
  due_on date,
  ordinal integer,
  amount_minor bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select plan.organization_id, plan.property_id, instalment.id, plan.id,
         plan.reservation_id, stay.id, folio.id, instalment.due_on,
         instalment.ordinal, instalment.amount_minor
    from public.plan_instalments as instalment
    join public.payment_plans as plan on plan.id = instalment.plan_id
    join public.properties as property on property.id = plan.property_id
    join public.stays as stay
      on stay.reservation_id = plan.reservation_id
     and stay.status <> 'cancelled'
    join public.folios as folio
      on folio.stay_id = stay.id
     and folio.status = 'open'
     and trim(folio.currency) = trim(plan.currency)
   where instalment.withdrawn_at is null
     and (target_property_id is null or plan.property_id = target_property_id)
     and property.status = 'active'
     and instalment.due_on <= app.property_today(plan.property_id)
     and not exists (
       select 1 from public.folio_lines as line
        where line.instalment_id = instalment.id
     )
     and app.capability_is_available(plan.property_id, 'billing_folios', 'finance')
$$;

comment on function app.instalments_ready(uuid) is
  'Every instalment fallen due and not yet charged whose Resident has an open Folio in its currency, at a Property whose billing is available. The one definition of ready; granted to nobody, asked by the two worker functions (PP-S1-*, ADR 0059).';

revoke execute on function app.instalments_ready(uuid) from public;
revoke execute on function app.instalments_ready(uuid) from ranza_app;
revoke execute on function app.instalments_ready(uuid) from ranza_auth;
revoke execute on function app.instalments_ready(uuid) from ranza_worker;

-- Which Properties have something to charge: ids and nothing else, and the
-- worker's alone. The same shape of read as app.properties_due_for_close()
-- (ADR 0018): answering it needs every Property's clock before any
-- Organization's context can be set.
create function app.properties_with_instalments_due()
returns table (organization_id uuid, property_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct ready.organization_id, ready.property_id
    from app.instalments_ready() as ready
$$;

comment on function app.properties_with_instalments_due() is
  'The Properties with an instalment ready to be charged: ids only, and executable by ranza_worker alone (ADR 0018, PP-S1-*).';

revoke execute on function app.properties_with_instalments_due() from public;
revoke execute on function app.properties_with_instalments_due() from ranza_app;
revoke execute on function app.properties_with_instalments_due() from ranza_auth;
grant execute on function app.properties_with_instalments_due() to ranza_worker;

-- Charges every instalment of one Property that is ready, once, to its
-- Resident's Folio, dated the day it fell due, and publishes instalment.posted
-- for each (PP-S1-*). The worker's, inside one Organization's context: no
-- context, or a Property of another Organization, is refused with the same
-- answer as a Property that does not exist.
--
-- Charged once however often it runs: the unique index on instalment_id turns
-- a second charge into nothing, and the row is re-read FOR SHARE under the
-- Stay's lock, so a revision that withdraws it and this cannot both win. A
-- Folio that was closed between the read and the lock is the one refusal
-- folio_line_is_postable() has here; the instalment waits for the next pass
-- rather than failing the Property's.
--
-- Answers with what it posted and what is still waiting — due and live and not
-- charged — so the worker can report both and a Resident who has not arrived
-- is a count and not an error.
create function app.post_due_instalments(target_property_id uuid)
returns table (posted integer, waiting integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  acting_organization uuid := app.worker_organization_id();
  property_organization uuid;
  property_status text;
  ready record;
  numbering record;
  made_line uuid;
  posted_count integer := 0;
begin
  if acting_organization is null then
    raise exception 'charging instalments requires a worker context'
      using errcode = '42501';
  end if;

  select property.organization_id, property.status
    into property_organization, property_status
    from public.properties as property
   where property.id = target_property_id;

  if property_organization is distinct from acting_organization then
    raise exception 'those instalments cannot be charged'
      using errcode = '42501';
  end if;

  if property_status <> 'active'
     or not app.capability_is_available(target_property_id, 'billing_folios', 'finance') then
    return query select 0, 0;
    return;
  end if;

  -- In the order the Stays' locks are taken in, so two workers running the
  -- same pass can never take two Stays' locks the other way round.
  for ready in
    select due.*
      from app.instalments_ready(target_property_id) as due
     order by hashtext(due.stay_id::text), due.due_on, due.ordinal
  loop
    perform pg_advisory_xact_lock(1, hashtext(ready.stay_id::text));

    perform 1
       from public.plan_instalments as instalment
      where instalment.id = ready.instalment_id
        and instalment.withdrawn_at is null
        for share;
    if not found then
      continue;
    end if;

    select numbered.number, numbered.total
      into numbering
      from (
        select item.id,
               row_number() over (order by item.due_on, item.ordinal) as number,
               count(*) over () as total
          from public.plan_instalments as item
         where item.plan_id = ready.plan_id
           and item.withdrawn_at is null
      ) as numbered
     where numbered.id = ready.instalment_id;

    made_line := null;
    begin
      insert into public.folio_lines
        (organization_id, property_id, folio_id, line_type, description,
         amount_minor, source, business_date, instalment_id)
      values
        (ready.organization_id, ready.property_id, ready.folio_id, 'charge',
         'Instalment ' || numbering.number || ' of ' || numbering.total,
         ready.amount_minor, 'instalment', ready.due_on, ready.instalment_id)
      on conflict (instalment_id) do nothing
      returning id into made_line;
    exception
      when insufficient_privilege then
        made_line := null;
    end;

    if made_line is not null then
      posted_count := posted_count + 1;

      insert into outbox.events (organization_id, event_type, payload)
      values (
        acting_organization,
        'instalment.posted',
        jsonb_build_object(
          'instalmentId', ready.instalment_id,
          'planId', ready.plan_id,
          'reservationId', ready.reservation_id,
          'propertyId', ready.property_id,
          'folioLineId', made_line,
          'dueOn', to_char(ready.due_on, 'YYYY-MM-DD'),
          'amountMinor', ready.amount_minor
        )
      );
    end if;
  end loop;

  return query
  select posted_count,
         (select count(*)::integer
            from public.plan_instalments as instalment
            join public.payment_plans as plan on plan.id = instalment.plan_id
           where plan.property_id = target_property_id
             and instalment.withdrawn_at is null
             and instalment.due_on <= app.property_today(target_property_id)
             and not exists (
               select 1 from public.folio_lines as line
                where line.instalment_id = instalment.id
             ));
end;
$$;

comment on function app.post_due_instalments(uuid) is
  'Charges every instalment of a Property that has fallen due and whose Resident has an open Folio, once, dated the day it fell due, and publishes instalment.posted for each. Inside the worker''s Organization context; executable by ranza_worker alone (PP-S1-*, ADR 0059).';

revoke execute on function app.post_due_instalments(uuid) from public;
revoke execute on function app.post_due_instalments(uuid) from ranza_app;
revoke execute on function app.post_due_instalments(uuid) from ranza_auth;
grant execute on function app.post_due_instalments(uuid) to ranza_worker;

-- ---------------------------------------------------------------------------
-- An instalment is accommodation revenue
-- ---------------------------------------------------------------------------

-- A Resident's instalment is what they pay for the room, as a Guest's night is,
-- so it credits Accommodation Revenue (4000) and not Other Revenue (4100), and
-- its reversal debits the same account. 20260916010600's function, unchanged
-- but for the two places that named room_night alone. Its grants stay as they
-- were: create or replace keeps them.
CREATE OR REPLACE FUNCTION app.post_folio_line_to_ledger(target_event_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  acting_organization uuid := app.worker_organization_id();
  event_organization uuid;
  event_kind text;
  event_line text;
  posted record;
  reversed record;
  debit_code text;
  credit_code text;
  debit_account uuid;
  credit_account uuid;
  magnitude bigint;
  entry_id uuid;
begin
  if acting_organization is null then
    raise exception 'posting to the ledger requires a worker context'
      using errcode = '42501';
  end if;

  select event.organization_id, event.event_type, event.payload ->> 'lineId'
    into event_organization, event_kind, event_line
    from outbox.events as event
   where event.id = target_event_id;

  if not found then
    raise exception 'there is no outbox event %', target_event_id
      using errcode = 'P0002';
  end if;

  if event_organization <> acting_organization then
    raise exception 'that event belongs to another Organization'
      using errcode = '42501';
  end if;

  if event_kind <> 'folio.line_posted' then
    raise exception 'event % is a %, and only folio.line_posted is posted to the ledger',
      target_event_id, event_kind
      using errcode = '22023';
  end if;

  if event_line is null then
    raise exception 'folio.line_posted event % names no lineId to post', target_event_id
      using errcode = '22023';
  end if;

  select line.id, line.folio_id, line.line_type, line.description,
         line.amount_minor, line.payment_method, line.reverses_line_id,
         line.source, line.posted_at, line.business_date,
         folio.currency::text as currency,
         property.timezone, property.business_date_cutoff
    into posted
    from public.folio_lines as line
    join public.folios as folio on folio.id = line.folio_id
    join public.properties as property on property.id = line.property_id
   where line.id = event_line::uuid
     and line.organization_id = acting_organization;

  if not found then
    raise exception 'event % names Folio line %, which this Organization does not have',
      target_event_id, event_line
      using errcode = 'P0002';
  end if;

  magnitude := abs(posted.amount_minor);

  if posted.line_type = 'charge' then
    debit_code := '1200';
    credit_code := case when posted.source in ('room_night', 'instalment') then '4000' else '4100' end;
  elsif posted.line_type = 'payment' then
    debit_code := case posted.payment_method
                    when 'card' then '1020'
                    when 'bank_transfer' then '1010'
                    else '1000'
                  end;
    credit_code := '1200';
  elsif posted.line_type = 'reversal' then
    select original.line_type, original.payment_method, original.source
      into reversed
      from public.folio_lines as original
     where original.id = posted.reverses_line_id
       and original.folio_id = posted.folio_id;

    if reversed.line_type = 'payment' then
      debit_code := '1200';
      credit_code := case reversed.payment_method
                       when 'card' then '1020'
                       when 'bank_transfer' then '1010'
                       else '1000'
                     end;
    elsif reversed.line_type = 'charge' then
      debit_code := case when reversed.source in ('room_night', 'instalment') then '4000' else '4100' end;
      credit_code := '1200';
    else
      raise exception 'Folio line % reverses a % line, which has no ledger posting',
        posted.id, coalesce(reversed.line_type, 'missing')
        using errcode = '22023';
    end if;
  else
    raise exception 'Folio line % is a %, which has no ledger posting',
      posted.id, posted.line_type
      using errcode = '22023';
  end if;

  perform finance.ensure_default_accounts(acting_organization);

  select account.id into debit_account
    from finance.accounts as account
   where account.organization_id = acting_organization
     and account.code = debit_code
     and account.is_active;

  select account.id into credit_account
    from finance.accounts as account
   where account.organization_id = acting_organization
     and account.code = credit_code
     and account.is_active;

  if debit_account is null or credit_account is null then
    raise exception 'account % or % is missing or inactive for this Organization',
      debit_code, credit_code
      using errcode = '22023';
  end if;

  insert into finance.journal_entries
    (organization_id, entry_date, currency, description, source_type, source_id)
  values (
    acting_organization,
    coalesce(
      posted.business_date,
      app.business_date(posted.posted_at, posted.timezone, posted.business_date_cutoff)
    ),
    posted.currency,
    btrim(posted.description),
    'folio_line',
    posted.id
  )
  on conflict (organization_id, source_type, source_id) do nothing
  returning id into entry_id;

  -- Already posted: a redelivery, or a rival worker that got there first. The
  -- entry that exists is the one this line owes, so say so rather than fail.
  if entry_id is null then
    select entry.id into entry_id
      from finance.journal_entries as entry
     where entry.organization_id = acting_organization
       and entry.source_type = 'folio_line'
       and entry.source_id = posted.id;
    return entry_id;
  end if;

  insert into finance.journal_lines
    (organization_id, journal_entry_id, account_id, direction, amount_minor,
     description, line_number)
  values
    (acting_organization, entry_id, debit_account, 'debit', magnitude,
     btrim(posted.description), 1),
    (acting_organization, entry_id, credit_account, 'credit', magnitude,
     btrim(posted.description), 2);

  return entry_id;
end;
$$;
