-- Folios: the first time this product holds money.
--
-- A Folio is the financial record collecting charges, credits, taxes,
-- adjustments and payments for a Stay (blueprint 2, 5.9). This slice builds a
-- Folio, a line, a balance, a correction and closing. Charge routing, taxes,
-- discounts, credits, deposits, refunds, split folios and company billing are
-- also section 5.9 and are deliberately absent — blueprint section 13 forbids
-- building tables ahead of the workflows that need them.
--
-- Recording money is not moving money. Blueprint 5.9 is explicit that a payment
-- record is a record, and external payment processing is a separately entitled
-- integration. There is no gateway here, no provider column and no pending
-- state, because each of those would be inventing a workflow.
--
-- Three decisions this file makes, recorded in
-- docs/adr/0015-money-is-an-integer-a-balance-is-a-sum-and-a-correction-is-a-line.md:
--
--   1. Amounts are integer minor units. Never a float, never a numeric scaled
--      by a fraction somebody has to remember.
--   2. A Folio holds no total. Its balance is the sum of its lines, computed in
--      the query that reads them. A stored total is a second source of truth,
--      and reconciling it is a job nobody signed up for.
--   3. A correction is a new line referencing the one it corrects. There is no
--      UPDATE and no DELETE on a posted line — not for the runtime role, and
--      not for the role that runs migrations either.
--
-- ADR 0001: Prisma generated the statements down to the marker; everything
-- below it is hand-written in this same file because Prisma models none of it.

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "currency" CHAR(3) NOT NULL DEFAULT 'TRY';

-- CreateTable
CREATE TABLE "folios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "stay_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folio_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "folio_id" UUID NOT NULL,
    "line_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "reverses_line_id" UUID,
    "posted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folio_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "folios_property_status_idx" ON "folios"("property_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "folios_id_property_id_organization_id_key" ON "folios"("id", "property_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "folios_stay_id_property_id_organization_id_key" ON "folios"("stay_id", "property_id", "organization_id");

-- CreateIndex
CREATE INDEX "folio_lines_folio_idx" ON "folio_lines"("folio_id", "posted_at");

-- CreateIndex
CREATE UNIQUE INDEX "folio_lines_id_folio_id_key" ON "folio_lines"("id", "folio_id");

-- CreateIndex
CREATE UNIQUE INDEX "folio_lines_reverses_line_id_folio_id_key" ON "folio_lines"("reverses_line_id", "folio_id");

-- CreateIndex
CREATE UNIQUE INDEX "stays_id_property_id_organization_id_key" ON "stays"("id", "property_id", "organization_id");

-- AddForeignKey
ALTER TABLE "folios" ADD CONSTRAINT "folios_property_id_organization_id_fkey" FOREIGN KEY ("property_id", "organization_id") REFERENCES "properties"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "folios" ADD CONSTRAINT "folios_stay_id_property_id_organization_id_fkey" FOREIGN KEY ("stay_id", "property_id", "organization_id") REFERENCES "stays"("id", "property_id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "folio_lines" ADD CONSTRAINT "folio_lines_folio_id_property_id_organization_id_fkey" FOREIGN KEY ("folio_id", "property_id", "organization_id") REFERENCES "folios"("id", "property_id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "folio_lines" ADD CONSTRAINT "folio_lines_reverses_line_id_folio_id_fkey" FOREIGN KEY ("reverses_line_id", "folio_id") REFERENCES "folio_lines"("id", "folio_id") ON DELETE RESTRICT ON UPDATE NO ACTION;


-- ---------------------------------------------------------------------------
-- Hand-written from here down
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Where currency lives, and why it is here
-- ---------------------------------------------------------------------------

-- On the Property, beside `timezone`, for exactly the same reason that one is
-- there: an Organization may hold Properties in more than one country, so
-- neither fact can live one level up, and a front desk needs both without
-- asking anyone. 'TRY' is the default because the home market is Turkey — the
-- same assumption `timezone default 'Europe/Istanbul'` already makes, stated
-- once more rather than hidden.
--
-- A Folio copies it at the moment it opens and keeps it. Re-reading the
-- Property later would silently restate every historical amount if the
-- Property ever changed currency, which is the one thing a financial record
-- must never do.
alter table public.properties
  add constraint properties_currency_check
    check (currency ~ '^[A-Z]{3}$');

comment on column public.properties.currency is
  'ISO 4217, the currency this Property trades in. A Folio copies it when it opens; changing it here does not restate an existing Folio.';

-- ---------------------------------------------------------------------------
-- The Folio
-- ---------------------------------------------------------------------------

comment on table public.folios is
  'The financial record collecting charges, credits, taxes, adjustments and payments for a Stay (blueprint 2, 5.9). Holds no total: the balance is the sum of its lines.';

alter table public.folios
  -- Open or closed. Nothing else yet: blueprint 5.9 also names folio closure
  -- rules, and a status invented for one of them would be inventing it.
  add constraint folios_status_check
    check (status in ('open', 'closed')),
  add constraint folios_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  -- A closed Folio has a closing date and an open one does not. Two columns
  -- that can disagree are two columns that eventually do.
  add constraint folios_closed_at_check
    check ((status = 'closed') = (closed_at is not null));

comment on column public.folios.currency is
  'Copied from the Property when the Folio opened. The lines carry no currency of their own, so the sum cannot mix two.';

comment on index public.folios_stay_id_property_id_organization_id_key is
  'One Folio per Stay. Split folios are blueprint 5.9 and are not built; because the composite foreign key forces property and organization to be the Stay''s own, this is uniqueness on stay_id alone.';

-- ---------------------------------------------------------------------------
-- The line
-- ---------------------------------------------------------------------------

comment on table public.folio_lines is
  'One posted line on a Folio. Append-only: a correction is a further line referencing the one it corrects (blueprint 7.4).';

alter table public.folio_lines
  add constraint folio_lines_description_check
    check (char_length(btrim(description)) between 1 and 200),
  -- Zero is not a posting. A line that changes no balance is a note, and this
  -- product has nowhere to put notes yet.
  add constraint folio_lines_amount_check
    check (amount_minor <> 0),
  -- The whole lifecycle, and the shape of each half. A charge is positive and
  -- references nothing; a reversal is negative and must say what it reverses.
  -- Written as one constraint rather than three, because the three are not
  -- independent: it is the pairing that is the rule.
  add constraint folio_lines_type_check
    check (
      (line_type = 'charge' and amount_minor > 0 and reverses_line_id is null)
      or
      (line_type = 'reversal' and amount_minor < 0 and reverses_line_id is not null)
    );

comment on column public.folio_lines.amount_minor is
  'Signed integer minor units of the Folio''s currency. Never a float: a balance that is the sum of its lines must be exact, and binary floating point is not.';

comment on index public.folio_lines_reverses_line_id_folio_id_key is
  'A line is reversed at most once. The composite foreign key forces folio_id to be the reversed line''s own, so this is uniqueness on reverses_line_id alone.';

-- ---------------------------------------------------------------------------
-- What makes a line postable at all
-- ---------------------------------------------------------------------------

-- Two rules a check constraint cannot hold, because both need to read another
-- row: the Folio must be open, and a reversal must cancel exactly the line it
-- names.
--
-- A trigger rather than a clause in the write policy below, and the difference
-- is the point. A policy binds the runtime role. It does not bind the role that
-- runs migrations, and FORCE ROW LEVEL SECURITY does not bind a superuser
-- either — so a policy alone would make these true of the application and not
-- of the database. A trigger fires for everybody.
--
-- security invoker, so both lookups are subject to the caller's own policies.
-- An actor who cannot see the Folio finds no row and is refused, which is the
-- safe direction: not-found and closed are deliberately the same answer.
create function public.folio_line_is_postable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.folios
    where folios.id = new.folio_id and folios.status = 'open'
  ) then
    raise exception 'that Folio is not open'
      using errcode = '42501';
  end if;

  -- A reversal cancels its line exactly. Without this, `reversal` would be a
  -- label rather than a fact: a line could name a 400.00 charge and cancel
  -- 4.00 of it, and the balance would still be the sum of the lines and still
  -- be wrong. A partial correction is an adjustment, which is a blueprint 5.9
  -- workflow this slice does not build.
  --
  -- Reversing a reversal needs no rule of its own: a reversal is negative, so
  -- cancelling one would need a positive amount, and folio_lines_type_check
  -- already refuses a positive line that names another.
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

create trigger folio_lines_postable
  before insert on public.folio_lines
  for each row
  execute function public.folio_line_is_postable();

comment on trigger folio_lines_postable on public.folio_lines is
  'A closed Folio accepts no new lines, and a reversal cancels exactly the line it names. A trigger rather than a policy clause, because a policy does not bind the migration role.';

-- ---------------------------------------------------------------------------
-- A posted line is never rewritten
-- ---------------------------------------------------------------------------

-- Three independent statements of the same rule, and the reason for that is on
-- the record rather than a matter of taste. The audit module's append-only
-- trigger was added to a migration that had already reached the hosted
-- database, so the guarantee held in the repository, in its test, and in every
-- database built from scratch — and did not hold in production. See
-- 20260916000700_audit_append_only_trigger.
--
--   1. No UPDATE or DELETE policy below. Under FORCE row level security an
--      absent policy denies.
--   2. No UPDATE or DELETE grant to ranza_app, revoked explicitly.
--   3. This trigger, which fires for every role including the owner.
--
-- None of it survives a determined administrator: a superuser can drop the
-- trigger. That is an operational control — restricted access and retained
-- backups — not something a constraint can do. What this does guarantee is that
-- no ordinary statement, from any role, can quietly rewrite a financial record.
create function public.folio_lines_forbid_rewrite()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'public.folio_lines is append-only: correct a line by posting a reversal'
    using errcode = '42501';
end;
$$;

create trigger folio_lines_append_only
  before update or delete on public.folio_lines
  for each statement
  execute function public.folio_lines_forbid_rewrite();

-- ---------------------------------------------------------------------------
-- Row-level security (ADR 0012)
-- ---------------------------------------------------------------------------

-- FORCE so the owner is subject to the policies too. Without it a defect that
-- ran a statement as an owning role would reach every Organization's money
-- while the policies below looked correct and did nothing.
alter table public.folios enable row level security;
alter table public.folios force row level security;
alter table public.folio_lines enable row level security;
alter table public.folio_lines force row level security;

create policy folios_read_accessible_property
  on public.folios for select
  using (property_id in (select app.accessible_property_ids()));

create policy folio_lines_read_accessible_property
  on public.folio_lines for select
  using (property_id in (select app.accessible_property_ids()));

-- A read policy is never consulted for an INSERT, so each write gets its own
-- policy, and the condition is app.can_use_capability() rather than
-- app.accessible_property_ids(). A read carries blueprint 3.5's commercial
-- gates in the query around it; a write has no such query, and an Organization
-- whose Subscription has lapsed must stop being able to post charges, not
-- merely stop being able to list them (ADR 0012).
create policy folios_insert_finance
  on public.folios for insert
  with check (
    app.can_use_capability(property_id, 'billing_folios', 'finance')
  );

create policy folio_lines_insert_finance
  on public.folio_lines for insert
  with check (
    app.can_use_capability(property_id, 'billing_folios', 'finance')
  );

-- Closing a Folio is the only UPDATE this slice has. USING bounds which Folio
-- may be touched and refuses quietly — the statement matches no rows rather
-- than raising, so a caller must read "no row returned" as a refusal. WITH
-- CHECK bounds what it may become, and is the only thing that refuses moving a
-- Folio to a Property that has no finance capability.
create policy folios_update_finance
  on public.folios for update
  using (
    app.can_use_capability(property_id, 'billing_folios', 'finance')
  )
  with check (
    app.can_use_capability(property_id, 'billing_folios', 'finance')
  );

-- There is deliberately no UPDATE policy on folio_lines and no DELETE policy on
-- either table.

-- Nothing is added for a Guest or Resident. They reach the database through the
-- same ranza_app role and the same connection as Staff, so no grant separates
-- them; what denies them is that every condition above resolves through
-- app.accessible_property_ids(), which needs an organization_membership a
-- Resident does not have (ADR 0009). A Folio is not exposed in the Portal at
-- all in this slice, and when it is, it gets its own policy resolving through
-- app.resident_stay_property_ids() rather than a widening of these.
-- Asserted rather than reasoned about: see tests/database/folios.test.sql.

-- ---------------------------------------------------------------------------
-- Runtime role
-- ---------------------------------------------------------------------------

grant select, insert on public.folios to ranza_app;
grant select, insert on public.folio_lines to ranza_app;

-- A policy bounds rows; a grant bounds columns (ADR 0012, amended). The policy
-- above that lets a Staff Member close a Folio would equally let them rewrite
-- `currency` or point the Folio at another Stay — turning a closure into a
-- restatement of every amount on it, by a command that never mentions money.
-- Row-level security cannot express "only the status may change"; this can.
grant update (status, closed_at, updated_at) on public.folios to ranza_app;

revoke delete on public.folios from ranza_app;
revoke update, delete on public.folio_lines from ranza_app;

comment on policy folios_update_finance on public.folios is
  'Bounds which Folio may be closed. Which columns is bounded by a column-level grant, because row-level security cannot express it.';
