-- Check-in: a Reservation becomes a Stay, and a Unit stops being bookable.
--
-- Two things arrive here. The first is the link from a Stay back to the
-- Reservation it came from, so a check-in is traceable without reading the
-- audit trail — evidence and operational structure are different jobs.
--
-- The second is availability. Every earlier invariant in this schema is
-- structural: a Unit cannot be in another Organization's Property because of a
-- composite foreign key. Double-booking has been the exception — nothing stops
-- two current Stays sitting on one Unit over the same nights except an
-- application remembering to look. An exclusion constraint makes it the same
-- kind of impossible as the others, and for the same reason: a check the
-- application performs is a check a concurrent statement can slip past.
--
-- ADR 0001: Prisma generated the four statements below; everything beneath them
-- is hand-written in this same file because Prisma models none of it.

-- AlterTable
ALTER TABLE "stays" ADD COLUMN     "reservation_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "stays_reservation_id_property_id_organization_id_key" ON "stays"("reservation_id", "property_id", "organization_id");

-- AddForeignKey
ALTER TABLE "stays" ADD CONSTRAINT "stays_reservation_id_property_id_organization_id_fkey" FOREIGN KEY ("reservation_id", "property_id", "organization_id") REFERENCES "reservations"("id", "property_id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------
-- Hand-written from here down
-- ---------------------------------------------------------------------------

-- The unique index above carries two claims. It is what the composite foreign
-- key resolves against, proving the Stay and its Reservation are in the same
-- Property; and since that key forces property_id and organization_id to be the
-- Reservation's own, uniqueness across the three is uniqueness on
-- reservation_id alone. Checking one Reservation in twice is therefore
-- unrepresentable, without a second index saying so.
comment on column public.stays.reservation_id is
  'The Reservation this Stay was checked in from. Null for a Stay that began without one, such as a walk-in.';

-- ---------------------------------------------------------------------------
-- Availability as an invariant, not a query
-- ---------------------------------------------------------------------------

-- btree_gist is what lets a plain equality column sit in a GiST index beside a
-- range. Without it the constraint below cannot name accommodation_unit_id.
--
-- Available in the local docker image and already installed on the hosted
-- database, where it lives in the `extensions` schema; `if not exists` matches
-- on the extension name rather than the schema, so this is a no-op there rather
-- than an attempt to install a second copy.
create extension if not exists btree_gist;

-- Half-open on purpose: '[)' means the departure date is the next arrival's
-- date. A Guest leaving on the 5th and one arriving on the 5th do not overlap,
-- which is how a front desk already counts nights.
--
-- An open-ended Stay — normal for long-term residence — produces a daterange
-- with an unbounded upper end, so it blocks the Unit from its start date
-- onwards. That is the correct reading: the Unit is not free again until
-- somebody says when.
--
-- Partial, because only a current Stay occupies anything. A departed or
-- cancelled Stay keeps its dates and stops holding the Unit, which is what
-- makes the same Unit re-lettable without deleting history (blueprint 7.4).
alter table public.stays
  add constraint stays_no_double_booking
    exclude using gist (
      accommodation_unit_id with =,
      daterange(starts_on, ends_on, '[)') with &&
    ) where (status in ('reserved', 'in_house'));

comment on constraint stays_no_double_booking on public.stays is
  'Two current Stays cannot overlap on one Accommodation Unit. Enforced here so a concurrent check-in fails on a constraint rather than on a race the application noticed.';

-- ---------------------------------------------------------------------------
-- The write (ADR 0012)
-- ---------------------------------------------------------------------------

-- The same shape as the Reservation policies, and for the same reason: a SELECT
-- policy is not consulted for an INSERT, so without this one the two existing
-- stays_read_* policies would leave the table writable to anybody.
--
-- app.can_use_capability() rather than app.accessible_property_ids() so all four
-- of blueprint 3.5's gates apply to a write. The read path carries gates 1-3 in
-- the query around it; a write has no such query, and a Subscription that has
-- lapsed must stop Stays being created and not merely stop them being listed.
--
-- This is also the whole of what stops a Guest or Resident writing. They reach
-- the database through the same ranza_app role and the same connection as
-- Staff, so the role grants below say nothing about them. What denies them is
-- that this condition resolves through app.accessible_property_ids(), which
-- needs an organization_membership; a Stay is not a membership (ADR 0009).
create policy stays_insert_front_desk
  on public.stays for insert
  with check (
    app.can_use_capability(property_id, 'front_office', 'front_desk')
  );

-- No UPDATE and no DELETE policy, and the grants below match. Check-out,
-- extensions and room moves are blueprint 5.3 workflows this slice does not
-- build, and a policy written ahead of the workflow that needs it is a widening
-- nobody is testing (blueprint section 13).

grant insert on public.stays to ranza_app;
revoke update, delete on public.stays from ranza_app;
