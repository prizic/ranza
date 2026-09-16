-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "accommodation_unit_id" UUID NOT NULL,
    "guest_name" TEXT NOT NULL,
    "stay_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reservations_property_arrival_idx" ON "reservations"("property_id", "starts_on");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_id_property_id_organization_id_key" ON "reservations"("id", "property_id", "organization_id");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_property_id_organization_id_fkey" FOREIGN KEY ("property_id", "organization_id") REFERENCES "properties"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_accommodation_unit_id_property_id_organizatio_fkey" FOREIGN KEY ("accommodation_unit_id", "property_id", "organization_id") REFERENCES "accommodation_units"("id", "property_id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------
-- Hand-written from here down
-- ---------------------------------------------------------------------------

comment on table public.reservations is
  'A planned allocation of an Accommodation Unit for a period, which may become a Stay through check-in (blueprint 2, 5.3).';

-- The point of carrying organization_id on a Property-scoped row (blueprint
-- 7.1): the composite foreign keys above make "this Reservation is in another
-- Organization's Property" and "this Unit is not in this Property"
-- unrepresentable rather than merely checked. That matters more here than on
-- any earlier table, because this is the first one a request may write to: an
-- attacker who supplies a valid-looking organization_id is rejected by a
-- foreign key before any policy is consulted.
comment on column public.reservations.organization_id is
  'Denormalized from the Property so the composite foreign keys can prove the row belongs together.';

alter table public.reservations
  add constraint reservations_guest_name_check
    check (char_length(btrim(guest_name)) between 1 and 120),
  add constraint reservations_stay_type_check
    check (stay_type in ('guest', 'resident')),
  -- The lifecycle this slice implements, and no more. Blueprint 5.3 also lists
  -- group reservations, quotations, deposits, extensions and room moves; none
  -- of them are here, and inventing a status for them would be inventing the
  -- workflow (blueprint section 13).
  add constraint reservations_status_check
    check (status in ('requested', 'confirmed', 'cancelled', 'no_show', 'checked_in')),
  add constraint reservations_period_check
    check (ends_on is null or ends_on >= starts_on);

comment on column public.reservations.ends_on is
  'Null means open-ended, matching the Stay it may become.';

-- ---------------------------------------------------------------------------
-- Row-level security, and the first write (ADR 0012)
-- ---------------------------------------------------------------------------

-- FORCE so the owner is subject to the policies too. Without it a defect that
-- ran a statement as an owning role would reach every Organization's rows while
-- the policies below looked correct and did nothing.
alter table public.reservations enable row level security;
alter table public.reservations force row level security;

create policy reservations_read_accessible_property
  on public.reservations for select
  using (property_id in (select app.accessible_property_ids()));

-- A read policy says nothing about a write. PostgreSQL applies a SELECT policy
-- to the rows a statement returns, never to the row an INSERT proposes, so the
-- policy above would let any row at all be written. INSERT and UPDATE therefore
-- get their own policies, and what they check is the WITH CHECK clause: the
-- row as it will exist after the statement.
--
-- The condition is app.can_use_capability() rather than
-- app.accessible_property_ids(), and that is the decision ADR 0012 records. A
-- read carries blueprint 3.5's commercial gates in the query around it — see
-- @ranza/core and @ranza/stays, which call the gate function in their SELECT.
-- A write has no such query. If the write policy checked reach alone, a Staff
-- Member in an Organization whose Subscription had lapsed could still create
-- Reservations: gates 1-3 would apply to reading them and not to making them.
-- So the write policy carries all four gates, in the database, where an
-- application defect cannot skip them.
create policy reservations_insert_front_desk
  on public.reservations for insert
  with check (
    app.can_use_capability(property_id, 'front_office', 'front_desk')
  );

-- UPDATE states both halves, and what each one actually contributes is narrower
-- than it looks. Worked out by removing each in turn and finding what changed:
--
--   USING     is evaluated against the row as it is. It is what applies gates
--             1-3 to a Reservation being changed, and it refuses quietly — the
--             statement matches no rows rather than raising. A lapsed
--             Subscription therefore makes updates do nothing. Callers must
--             treat "no row returned" as a refusal; @ranza/reservations does.
--
--   WITH CHECK is evaluated against the row as it will be. Most of that job is
--             already done by the SELECT policy above, because PostgreSQL
--             applies it to the new row on an UPDATE too — so reach is covered
--             twice. What is left, and left only here, is gate 3 against the
--             *destination*: moving a Reservation to another Property in the
--             same Organization that has no front desk is refused by this
--             clause and by nothing else.
--
-- Both are asserted in isolation in tests/database/reservations_and_check_in.test.sql,
-- because a clause that changes no observable behaviour when removed is a
-- clause nobody is testing.
create policy reservations_update_front_desk
  on public.reservations for update
  using (
    app.can_use_capability(property_id, 'front_office', 'front_desk')
  )
  with check (
    app.can_use_capability(property_id, 'front_office', 'front_desk')
  );

-- There is deliberately no DELETE policy. Under FORCE row level security an
-- absent policy denies, and the revoked grant below says the same thing a
-- second way: a cancelled Reservation becomes 'cancelled', it is not removed.
-- Operational history is corrected by adding a record, never by deleting one
-- (blueprint 7.4).

-- ---------------------------------------------------------------------------
-- Runtime role
-- ---------------------------------------------------------------------------

grant select, insert, update on public.reservations to ranza_app;
revoke delete on public.reservations from ranza_app;

-- A Guest or Resident is granted nothing new. They reach the database through
-- the same role, so the only thing between a Portal session and this table is
-- the policies above — and each of them resolves through
-- app.accessible_property_ids(), which needs an organization_membership a
-- Resident does not have and never will (ADR 0009). Asserted rather than
-- assumed: see tests/database/reservations_and_check_in.test.sql.
