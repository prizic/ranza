-- AlterTable
ALTER TABLE "accommodation_units" ADD COLUMN     "building" TEXT,
ADD COLUMN     "floor" INTEGER,
ADD COLUMN     "parent_id" UUID,
ADD COLUMN     "parent_unit_type" TEXT;

-- DropIndex
DROP INDEX "accommodation_units_property_id_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "accommodation_units_property_id_name_key" ON "accommodation_units"("property_id", "name") WHERE (parent_id IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "accommodation_units_parent_id_name_key" ON "accommodation_units"("parent_id", "name") WHERE (parent_id IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "accommodation_units_nesting_key" ON "accommodation_units"("id", "property_id", "organization_id", "unit_type");

-- CreateIndex
CREATE INDEX "accommodation_units_parent_idx" ON "accommodation_units"("parent_id");

-- AddForeignKey
ALTER TABLE "accommodation_units" ADD CONSTRAINT "accommodation_units_parent_id_property_id_organization_id__fkey" FOREIGN KEY ("parent_id", "property_id", "organization_id", "parent_unit_type") REFERENCES "accommodation_units"("id", "property_id", "organization_id", "unit_type") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------
-- Hand-written from here down (ADR 0025)
-- ---------------------------------------------------------------------------

comment on column public.accommodation_units.parent_id is
  'The Unit this one is inside. Null for a room; a bed''s room (ADR 0025).';

-- Denormalized for exactly the reason organization_id is: a foreign key can
-- prove a claim about another row, and a check constraint can only look at this
-- one. Storing the parent's type here and pointing the composite key at
-- (id, property_id, organization_id, unit_type) makes "my parent is a room"
-- proved rather than asserted — and makes it impossible for the parent to
-- become something else afterwards without the key noticing.
comment on column public.accommodation_units.parent_unit_type is
  'The parent''s own unit_type, so the composite foreign key proves the parent is a room.';

comment on column public.accommodation_units.floor is
  'Where the Unit is, for grouping. Not a Unit of its own: nothing addresses a floor as a record (ADR 0025).';

-- The whole of the nesting rule, in one constraint:
--
--   a Unit with a parent is a bed, and that parent is a room
--   a Unit without one claims no parent type either
--
-- Which makes a cycle unrepresentable rather than merely unlikely. Only a bed
-- may have a parent and only a room may be one, so the tree is two deep and
-- cannot close on itself. Nothing needs a recursive check.
--
-- A bed *may* have a parent; it does not have to. A Property whose Units are
-- beds with no rooms above them is a dormitory, which ADR 0004 says is a
-- configuration rather than a different product. Requiring the room would be
-- inventing a requirement the business does not have — and it is what the
-- existing accommodation_units suite caught, by having had a parentless bed in
-- its fixtures since the day that table was written.
alter table public.accommodation_units
  add constraint accommodation_units_nesting_check
    check (
      case
        when parent_id is null then parent_unit_type is null
        else unit_type = 'bed' and parent_unit_type = 'room'
      end
    ),
  -- The one thing ADR 0025 newly enforces about capacity. The rest of it stays
  -- a fact rather than a rule until a Stay records how many people are in it.
  add constraint accommodation_units_bed_sleeps_one
    check (unit_type <> 'bed' or capacity = 1),
  add constraint accommodation_units_building_check
    check (building is null or char_length(btrim(building)) between 1 and 60),
  add constraint accommodation_units_floor_check
    check (floor is null or floor between -20 and 200);

comment on constraint accommodation_units_nesting_check on public.accommodation_units is
  'Only a bed has a parent and only a room may be one, so the tree is two deep and cannot cycle.';

-- ---------------------------------------------------------------------------
-- A Unit is sellable when it has no children
-- ---------------------------------------------------------------------------

-- Derived rather than flagged (ADR 0025): a room with no beds under it is sold
-- whole, and adding beds to it moves what is sellable down a level. A
-- `bookable_by` column would be a setting that can disagree with the rows
-- underneath it, and the way it disagrees is selling one bed twice — once on
-- its own and once inside its room.
--
-- Both halves are cross-row, so neither can be a check constraint, and both are
-- triggers for the reason `stays_withdrawal_is_free_of_charges` is one: the
-- rule has to bind every role rather than only the one this product uses.
--
-- security definer, so the check is answered from the whole table rather than
-- from the rows the caller's policies happen to let through. A Staff Member who
-- cannot read a bed must still be refused the room above it.
create function app.unit_is_sellable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.accommodation_units as child
    where child.parent_id = new.accommodation_unit_id
  ) then
    -- 55000 rather than a constraint violation, and deliberately not 42501: a
    -- policy refusal is 42501, and "that room is let by the bed" is a different
    -- answer from "you cannot".
    raise exception using
      errcode = '55000',
      message = 'that Accommodation Unit is let by the bed, not as a whole';
  end if;
  return new;
end;
$$;

comment on function app.unit_is_sellable() is
  'Refuses a Stay or a Reservation on a Unit that has children. A Unit is sellable when it is a leaf (ADR 0025).';

create trigger reservations_unit_is_sellable
  before insert or update of accommodation_unit_id on public.reservations
  for each row execute function app.unit_is_sellable();

create trigger stays_unit_is_sellable
  before insert or update of accommodation_unit_id on public.stays
  for each row execute function app.unit_is_sellable();

-- And the other direction, which is the one that is easy to forget: a room
-- somebody is already in cannot be divided into beds underneath them. Without
-- it the trigger above is a rule you can walk around by dividing the room after
-- the booking rather than before it.
create function app.unit_has_no_current_occupant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.stays as stay
    where stay.accommodation_unit_id = new.parent_id
      and stay.status in ('reserved', 'in_house')
  ) or exists (
    select 1
    from public.reservations as reservation
    where reservation.accommodation_unit_id = new.parent_id
      and reservation.status in ('requested', 'confirmed', 'checked_in')
  ) then
    raise exception using
      errcode = '55000',
      message = 'that Accommodation Unit is spoken for and cannot be divided';
  end if;
  return new;
end;
$$;

comment on function app.unit_has_no_current_occupant() is
  'Refuses dividing a Unit that a current Stay or an uncancelled Reservation names (ADR 0025).';

create trigger accommodation_units_parent_is_free
  before insert or update of parent_id on public.accommodation_units
  for each row execute function app.unit_has_no_current_occupant();

-- ---------------------------------------------------------------------------
-- Runtime role
-- ---------------------------------------------------------------------------

-- Nothing new. `grant select on public.accommodation_units` is table-wide, so
-- it already covers the four columns above, and ranza_app still holds no
-- INSERT or UPDATE here: creating a Unit is the Configuration screen's
-- workflow and it does not exist yet. Under FORCE row level security an absent
-- policy denies, and that absence is the decision (ADR 0012).
