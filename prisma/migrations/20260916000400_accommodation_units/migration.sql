-- Accommodation Units (blueprint 2 and 5.2).
--
-- A sellable or assignable space inside a Property: a room, a bed, an
-- apartment, a suite. Which of those a Property uses is configuration, not a
-- separate product (ADR 0004) — a dormitory is a Property whose Units are beds.
--
-- ADR 0001: Prisma generated the table below. Check constraints, row-level
-- security and grants are hand-written beneath it, in this same file, because
-- Prisma does not model them and would otherwise regenerate them away.

-- CreateTable
CREATE TABLE "accommodation_units" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "property_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit_type" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'available',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accommodation_units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accommodation_units_property_id_name_key" ON "accommodation_units"("property_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "accommodation_units_id_property_id_organization_id_key" ON "accommodation_units"("id", "property_id", "organization_id");

-- AddForeignKey
ALTER TABLE "accommodation_units" ADD CONSTRAINT "accommodation_units_property_id_organization_id_fkey" FOREIGN KEY ("property_id", "organization_id") REFERENCES "properties"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------
-- Hand-written from here down
-- ---------------------------------------------------------------------------

-- The composite foreign key above is the point of carrying organization_id on a
-- Property-scoped row (blueprint 7.1): it makes "this Unit belongs to another
-- Organization's Property" unrepresentable rather than merely checked.
comment on column public.accommodation_units.organization_id is
  'Denormalized from the Property so the composite foreign key can prove the pair belongs together.';

alter table public.accommodation_units
  add constraint accommodation_units_name_check
    check (char_length(btrim(name)) between 1 and 60),
  add constraint accommodation_units_unit_type_check
    check (unit_type in ('room', 'bed', 'apartment', 'suite')),
  add constraint accommodation_units_capacity_check
    check (capacity between 1 and 64),
  add constraint accommodation_units_status_check
    check (status in ('available', 'occupied', 'out_of_service'));

-- ---------------------------------------------------------------------------
-- Row-level security (gate 5)
-- ---------------------------------------------------------------------------

-- FORCE so the table owner is subject to policies too. Without it a defect that
-- ran a query as an owning role would read every Organization's Units while the
-- policies below looked correct and did nothing.
alter table public.accommodation_units enable row level security;
alter table public.accommodation_units force row level security;

create policy accommodation_units_read_accessible_property
  on public.accommodation_units for select
  using (property_id in (select app.accessible_property_ids()));

grant select on public.accommodation_units to ranza_app;
