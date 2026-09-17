-- CreateTable
CREATE TABLE "guests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guests_organization_idx" ON "guests"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "guests_id_organization_id_key" ON "guests"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "guests_organization_email_key" ON "guests"("organization_id", "email") WHERE (email IS NOT NULL);

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN "guest_id" UUID;

-- ---------------------------------------------------------------------------
-- Hand-written from here down
--
-- Including the backfill and the two statements that depend on it — SET NOT
-- NULL and DROP COLUMN — because a generated migration would have put them
-- before the data was moved and lost every name in the database.
-- ---------------------------------------------------------------------------

comment on table public.guests is
  'A person a Reservation or a Stay is for (blueprint section 2). Owned by an Organization rather than by a Property, which is ADR 0024.';

comment on column public.guests.organization_id is
  'The owner. A Guest is deliberately not Property-scoped: a history across two Stays, duplicate review and a document are Organization-wide questions (blueprint 18.7).';

alter table public.guests
  add constraint guests_full_name_check
    check (full_name = btrim(full_name)
           and char_length(full_name) between 1 and 120),
  -- Stored lowercased and trimmed, because guests_organization_email_key is
  -- over the stored value. Without this, `Ada@example.test` and
  -- `ada@example.test` are two people with one address, which is precisely the
  -- duplicate this table exists to stop.
  add constraint guests_email_is_normalized
    check (email is null
           or (email = lower(btrim(email))
               and char_length(email) between 3 and 254)),
  add constraint guests_phone_check
    check (phone is null
           or (phone = btrim(phone) and char_length(phone) between 1 and 40));

comment on constraint guests_email_is_normalized on public.guests is
  'The unique index is over the stored value, so the stored value has to be the normalized one.';

-- ---------------------------------------------------------------------------
-- Every Reservation gets the Guest its name was standing in for
-- ---------------------------------------------------------------------------

-- `reservations` carries FORCE row level security, so the role running this
-- migration is subject to its policies too — which is the whole point of FORCE
-- and is why the two statements below would otherwise match no rows and
-- silently move nothing. Lifted for the length of this migration and restored
-- before it ends; a migration runs in one transaction, so there is no moment at
-- which a concurrent session sees the table unprotected.
alter table public.reservations no force row level security;

-- One Guest per distinct name within an Organization. Two Reservations under
-- one name become one person, which is the assumption a `guest_name` column was
-- already making every time somebody read the list.
--
-- No email, because none was ever recorded. That leaves these Guests outside
-- the exact-address matching in identifyGuestWithin(), so booking one of them
-- again creates a second record — correct rather than unfortunate: an
-- unverified name match is the automatic merge blueprint 18.7 forbids.
insert into public.guests (organization_id, full_name)
select distinct organization_id, btrim(guest_name)
from public.reservations;

update public.reservations as reservation
   set guest_id = guest.id
  from public.guests as guest
 where guest.organization_id = reservation.organization_id
   and guest.full_name = btrim(reservation.guest_name);

alter table public.reservations force row level security;

alter table public.reservations
  alter column guest_id set not null;

-- The name is gone rather than kept beside the Guest. Two places holding one
-- person's name is the drift this repository refuses everywhere else, and every
-- one of them was copied into public.guests above.
alter table public.reservations
  drop column guest_name;

alter table public.reservations
  add constraint reservations_guest_id_organization_id_fkey
    foreign key (guest_id, organization_id)
    references public.guests (id, organization_id)
    on delete restrict on update no action;

create index reservations_guest_idx on public.reservations (guest_id);

comment on column public.reservations.guest_id is
  'Composite with organization_id, so a Reservation naming another Organization''s Guest is unrepresentable rather than merely checked.';

-- ---------------------------------------------------------------------------
-- Asking blueprint 3.5 about an Organization-scoped write
-- ---------------------------------------------------------------------------

-- Every write policy so far has been able to name a Property, because every
-- writable row so far has had one. A Guest does not (ADR 0024), and the four
-- gates still have to apply: a lapsed Subscription must stop Guests being
-- recorded and not merely stop them being listed.
--
-- So the question becomes the same one asked of any Property: may this Staff
-- Member use this capability at some Property of this Organization? Answering
-- yes for one Property is answering yes for the Organization's Guests, which
-- is the correct reading — a Guest is not the property of a building.
--
-- security definer, like every other helper here, so a policy can consult
-- Properties the caller has no read access to.
create function app.can_use_capability_in_organization(
  target_organization_id uuid,
  target_module_key text,
  target_capability_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.properties as property
    where property.organization_id = target_organization_id
      and app.can_use_capability(
            property.id, target_module_key, target_capability_key)
  );
$$;

comment on function app.can_use_capability_in_organization(uuid, text, text) is
  'Gates 1-4 of blueprint 3.5 for a row that belongs to an Organization rather than to a Property: true when they hold at any one Property of it the acting Staff Member reaches.';

-- ---------------------------------------------------------------------------
-- Row-level security on guests (gate 5)
-- ---------------------------------------------------------------------------

alter table public.guests enable row level security;
alter table public.guests force row level security;

-- Organization-wide on purpose, and it is the one place a read here is wider
-- than a Property. A Staff Member assigned to one Property can see the
-- Organization's Guests, because a Guest who stayed at the other Property is
-- the same person and a front desk that could not find them would create a
-- duplicate — the outcome blueprint 18.7 is written to prevent.
create policy guests_read_own_organization
  on public.guests for select
  using (organization_id in (select app.accessible_organization_ids()));

-- The commercial gates, in the policy, for the reason ADR 0012 gives: a read
-- carries them in the query around it and a write has no such query.
--
-- 'front_office'/'front_desk' is another module's capability key, which is new
-- and is a deliberate narrowing rather than an oversight. Taking a booking is
-- the only thing in the product that records a Guest, so that is the only
-- entitlement under which one can appear. When a Guest 360 screen exists it
-- brings its own key and this policy gains a second clause — an OR, not a
-- replacement, because the front desk must go on working without it.
create policy guests_insert_front_desk
  on public.guests for insert
  with check (
    app.can_use_capability_in_organization(
      organization_id, 'front_office', 'front_desk')
  );

-- UPDATE exists for one statement: the `on conflict do update` in
-- identifyGuestWithin(), which assigns a column to itself so that RETURNING
-- gives back an existing Guest. That is a real UPDATE to PostgreSQL and is
-- gated like one. What stops it being an edit is the column grant below, not
-- this policy — a policy bounds rows and a grant bounds columns (ADR 0012).
create policy guests_update_front_desk
  on public.guests for update
  using (
    app.can_use_capability_in_organization(
      organization_id, 'front_office', 'front_desk')
  )
  with check (
    app.can_use_capability_in_organization(
      organization_id, 'front_office', 'front_desk')
  );

-- There is deliberately no DELETE policy, and no grant either. A person is not
-- removed from the record; blueprint 18.7 asks for anonymization under a
-- retention policy, which is a workflow and not a DELETE.

-- ---------------------------------------------------------------------------
-- Runtime role
-- ---------------------------------------------------------------------------

grant execute on function
  app.can_use_capability_in_organization(uuid, text, text) to ranza_app;

grant select, insert on public.guests to ranza_app;

-- Exactly one column, and it is the one the no-op conflict update assigns to
-- itself. Nothing edits a Guest's name, address or telephone number, so
-- building that is a deliberate act that has to widen this line rather than a
-- side effect of a policy somebody loosened.
grant update (updated_at) on public.guests to ranza_app;

revoke delete on public.guests from ranza_app;

-- A Resident is granted nothing. They reach the database through the same role,
-- and what denies them is that guests_read_own_organization resolves through
-- app.accessible_organization_ids(), which needs an organization_membership a
-- Resident does not have and never will (ADR 0009). Asserted rather than
-- assumed: see tests/database/guests_and_reservation_creation.test.sql.

-- ---------------------------------------------------------------------------
-- A Reservation holds its nights (ADR 0024)
-- ---------------------------------------------------------------------------

-- ADR 0012 left this out, and said why: whether two Reservations may overlap on
-- one Unit is an overbooking policy, and nothing created a Reservation, so the
-- rule would have been invented ahead of the workflow (blueprint section 13).
-- Creating one is now a command, so the question is real and this is the answer.

-- A zero-night booking first, because it is the hole the constraint below
-- cannot see: daterange(x, x, '[)') is empty and overlaps nothing, so a
-- Reservation ending on the day it starts would hold no Unit while looking
-- exactly like one that did. The same edge as stays_in_house_has_a_night.
--
-- This replaces `ends_on >= starts_on`. No existing row can violate the
-- stricter version that did not already describe a booking for no nights.
alter table public.reservations
  drop constraint reservations_period_check;

alter table public.reservations
  add constraint reservations_period_check
    check (ends_on is null or ends_on > starts_on);

comment on constraint reservations_period_check on public.reservations is
  'A Reservation covers at least one night, or is open-ended. An empty daterange overlaps nothing, so without this a zero-night booking holds no Unit and reservations_no_double_booking never fires.';

-- Half-open, like stays_no_double_booking and for the same reason: a Guest
-- leaving on the 5th and one arriving on the 5th do not overlap, which is how a
-- front desk already counts nights. An open-ended Reservation holds the Unit
-- from its start date onwards, which is the correct reading of "nobody has said
-- when they leave".
--
-- Partial on `confirmed` alone, and that is the decision inside the decision.
-- A confirmed Reservation is a promise of a Unit for those nights and no second
-- one may be made. Every other status is deliberately outside it:
--
--   requested   is somebody asking, not a promise. Refusing a second enquiry
--               would be an availability policy nobody has specified.
--   checked_in  is a promise that has been kept, and from that moment the Stay
--               holds the Unit — stays_no_double_booking, which knows about the
--               early departure this one cannot see. Including it here would
--               make a Reservation go on holding nights after its Guest had
--               checked out, so a room could not be re-let the same morning,
--               which is the one thing a front desk asks for before lunch.
--   cancelled
--   no_show     keep their dates and stop holding the Unit, which is what makes
--               it re-lettable without deleting history (blueprint 7.4).
--
-- The gap that leaves is real and named rather than papered over: a Unit whose
-- Guest is in house can still be promised over their remaining nights, and the
-- refusal arrives at check-in instead of at the booking. Answering it needs a
-- Reservation to consult the Stays on its Unit, which is a cross-table question
-- an exclusion constraint cannot ask. See ADR 0024 and docs/roadmap.md.
--
-- A constraint rather than a query, for the reason availability always is here:
-- two clerks booking the same Unit for the same nights at the same moment both
-- read "free", and only one of them can commit.
alter table public.reservations
  add constraint reservations_no_double_booking
    exclude using gist (
      accommodation_unit_id with =,
      daterange(starts_on, ends_on, '[)') with &&
    ) where (status = 'confirmed');

comment on constraint reservations_no_double_booking on public.reservations is
  'One Unit is promised to one confirmed Reservation over any night. A checked-in Reservation is held by its Stay instead, which is what lets a room be re-let the morning its Guest leaves.';
