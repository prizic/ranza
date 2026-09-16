-- Check-out: a Stay ends, and the Accommodation Unit becomes free again.
--
-- The other half of the blueprint 5.3 bullet check-in opened. Nothing new is
-- created; what is new is that ranza_app may now UPDATE a tenant-owned row for
-- the first time, and the shape of that permission is the decision here.
--
-- There is no Prisma-generated half. This migration adds no column and no
-- table — only a policy, a grant, and the comment explaining why the grant is
-- narrower than the policy.

-- ---------------------------------------------------------------------------
-- The write (ADR 0012, amended)
-- ---------------------------------------------------------------------------

-- Same four gates as every other write: Subscription, Entitlement, Property
-- capability and Staff reach, together, because a write has no surrounding
-- query to carry the commercial ones.
--
-- USING bounds the Stay that may be changed. WITH CHECK bounds what it may
-- become — and here that is doing real work rather than echoing USING: without
-- it a Stay could be updated into a Property with no front desk, which is the
-- one case the SELECT policy has no opinion about.
create policy stays_update_front_desk
  on public.stays for update
  using (
    app.can_use_capability(property_id, 'front_office', 'front_desk')
  )
  with check (
    app.can_use_capability(property_id, 'front_office', 'front_desk')
  );

-- A column-level grant, and this is the point of the migration.
--
-- Row-level security is row-level: no policy can say "only the status and the
-- end date may change". Without this grant, the policy above would let a
-- check-out rewrite accommodation_unit_id and become a room move — a separate
-- blueprint 5.3 workflow, with its own availability and audit consequences,
-- performed by a command that never mentions it.
--
-- So the two halves answer different questions and both are needed. The policy
-- says which rows. The grant says which columns. Neither is a substitute for
-- the other, and this is the first place in the product where that distinction
-- has mattered.
-- `updated_at` is in the list because the row keeps its own bookkeeping and the
-- statement that ends a Stay has to touch it. It was left out of the first
-- draft, and the check-out failed with "permission denied for column
-- updated_at" — the grant refusing this module's own SQL, which is the grant
-- working. What it still refuses is the set that would turn a check-out into
-- something else: the Unit, the Property, the Organization, the arrival date.
grant update (status, ends_on, updated_at) on public.stays to ranza_app;

-- Still no DELETE, here or anywhere. A Stay that ends becomes 'departed';
-- operational history is corrected by adding a record, never by removing one
-- (blueprint 7.4).
revoke delete on public.stays from ranza_app;

comment on policy stays_update_front_desk on public.stays is
  'Bounds which Stay may be changed. Which columns is bounded by a column-level grant, because row-level security cannot express it.';
