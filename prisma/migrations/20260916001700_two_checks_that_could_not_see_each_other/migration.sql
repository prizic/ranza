-- Two rules that were each correct alone and wrong together, and a range with
-- no nights in it.
--
-- Both were found by review and reproduced against a real database. Every
-- assertion in tests/database passed while both were live, because every one of
-- them runs one transaction at a time and none of them uses the day a range
-- ends. That is the lesson worth more than the fix.
--
-- No Prisma-generated section: nothing here changes a table's shape.

-- ---------------------------------------------------------------------------
-- 1. Write skew: a withdrawn Stay with a charge on its Folio
-- ---------------------------------------------------------------------------

-- 20260916001500 added two rules that guard the same invariant from opposite
-- sides: a Stay cannot be withdrawn once a line exists, and a line cannot be
-- posted once the Stay is withdrawn. Under READ COMMITTED neither transaction
-- can see the other's uncommitted work, so both checks pass and both commit:
--
--   A: insert folio_line   -- the Stay is not cancelled yet
--   B: cancel the Stay     -- there are no lines yet
--   B: commit
--   A: commit              -- a withdrawn Stay, carrying money
--
-- Reproduced on two connections before this was written. It is write skew, and
-- no amount of care inside either check fixes it: the checks have to be made to
-- see each other.
--
-- A transaction-scoped advisory lock keyed on the Stay does that. The second
-- transaction waits for the first to commit and then re-reads, so whichever
-- arrives second finds the other's work and refuses. It is an advisory lock
-- rather than `select ... for update` on the row, because a row lock needs
-- UPDATE privilege on the table being locked and `ranza_app` holds none on
-- `folios` columns beyond the three the closure grant names — the lock would
-- have failed for the caller it most needs to bind.
--
-- `hashtext` narrows a uuid to an int, so two Stays can collide on one lock.
-- The cost of a collision is that two unrelated withdrawals serialise for a few
-- milliseconds; it is never a wrong answer, which is the only property that
-- matters here.
--
-- The first key is a namespace, so a second kind of advisory lock added later
-- cannot silently share these. 1 means "keyed on a Stay"; the next one takes 2
-- and says so here.

create or replace function public.stay_may_be_withdrawn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status = 'in_house' then
    -- Before the check, not after it. Whoever is posting a line against this
    -- Stay holds or will hold the same lock, so one of us waits and then sees
    -- what the other committed.
    perform pg_catalog.pg_advisory_xact_lock(
      1, pg_catalog.hashtext(old.id::text)
    );

    if exists (
      select 1
      from public.folio_lines as line
      join public.folios as folio on folio.id = line.folio_id
      where folio.stay_id = old.id
    ) then
      -- 55000, object_not_in_prerequisite_state, rather than 42501. A refusal
      -- from a policy is also 42501, and the caller has to tell the two apart:
      -- "you cannot do that" and "money has been posted" are different answers,
      -- and only the second is worth telling a front desk.
      raise exception 'that Stay has charges posted against it and cannot be withdrawn'
        using errcode = '55000';
    end if;
  end if;

  return new;
end;
$$;

-- The other side of the same lock. Taken first, before any check, and on the
-- Stay rather than the Folio so both triggers queue on one key.
--
-- security invoker still: the lookups below are deliberately subject to the
-- caller's own policies, and an actor who cannot see the Folio finds no row and
-- is refused, which is the safe direction. Finding no row also means no lock,
-- which costs nothing — the insert is about to be refused anyway.
create or replace function public.folio_line_is_postable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  subject uuid;
begin
  select folio.stay_id into subject
  from public.folios as folio
  where folio.id = new.folio_id;

  if subject is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      1, pg_catalog.hashtext(subject::text)
    );
  end if;

  if not exists (
    select 1 from public.folios
    where folios.id = new.folio_id and folios.status = 'open'
  ) then
    raise exception 'that Folio is not open'
      using errcode = '42501';
  end if;

  -- A withdrawn check-in leaves an open Folio behind, and an open Folio accepts
  -- lines. Re-read after the lock, so a withdrawal that committed while this
  -- statement waited is visible here.
  if exists (
    select 1
    from public.folios as folio
    join public.stays as stay on stay.id = folio.stay_id
    where folio.id = new.folio_id
      and stay.status = 'cancelled'
  ) then
    raise exception 'that Stay was withdrawn'
      using errcode = '42501';
  end if;

  -- A reversal cancels its line exactly. Without this, `reversal` would be a
  -- label rather than a fact: a line could name a 400.00 charge and cancel
  -- 4.00 of it, and the balance would still be the sum of the lines and still
  -- be wrong. A partial correction is an adjustment, which is a blueprint 5.9
  -- workflow this slice does not build.
  if new.reverses_line_id is not null and not exists (
    select 1 from public.folio_lines as original
    where original.id = new.reverses_line_id
      and original.amount_minor = -new.amount_minor
  ) then
    raise exception 'a reversal must cancel exactly the line it names'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. A range with no nights in it holds no Unit
-- ---------------------------------------------------------------------------

-- 20260916001300 let a Reservation be checked in while `ends_on >= today`. For
-- somebody arriving on the day their booking ends, the Stay becomes
-- `[today, today)` — an empty daterange, which overlaps nothing, so
-- `stays_no_double_booking` has no opinion and the Unit takes a second
-- `in_house` Stay tonight. That is precisely the bug 20260916001300 existed to
-- close, arriving through a date nobody tested.
--
-- The module now refuses it with `ends_on > today`, so a front desk gets a
-- refusal. This binds every role, including the one that runs migrations.
--
-- Scoped to `in_house`, like the policy: a `departed` Stay may legitimately end
-- on the day it started — that is a check-out the same morning, and it holds
-- nothing because the exclusion constraint is partial on status.
alter table public.stays
  add constraint stays_in_house_has_a_night
    check (
      status <> 'in_house'
      or ends_on is null
      or ends_on > starts_on
    );

comment on constraint stays_in_house_has_a_night on public.stays is
  'A current Stay covers at least one night. An empty daterange overlaps nothing, so without this a zero-night Stay holds no Unit and stays_no_double_booking never fires.';

-- ---------------------------------------------------------------------------
-- 3. A delivery belongs to its event's Organization
-- ---------------------------------------------------------------------------

-- outbox.deliveries referenced events(id) alone, so a worker holding one
-- Organization's context could record a delivery carrying another's
-- organization_id — and that Organization's handler would then never run,
-- silently, because the delivery row already exists.
--
-- The composite key is the pattern every Property-scoped table in this schema
-- already uses, and it makes the mismatch unrepresentable rather than unlikely.
create unique index events_id_organization_id_key
  on outbox.events (id, organization_id);

alter table outbox.deliveries
  drop constraint deliveries_event_id_fkey;

alter table outbox.deliveries
  add constraint deliveries_event_id_organization_id_fkey
    foreign key (event_id, organization_id)
    references outbox.events (id, organization_id)
    on delete restrict;

comment on constraint deliveries_event_id_organization_id_fkey on outbox.deliveries is
  'A delivery is recorded in its event''s own Organization. Referencing the event alone let a worker with the wrong context record one for somebody else, and that consumer would then never run.';
