-- AlterTable
ALTER TABLE "maintenance_requests" ADD COLUMN     "equipment_id" UUID;

-- CreateTable
CREATE TABLE "maintenance_equipment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "accommodation_unit_id" UUID,
    "location" TEXT,
    "service_interval_months" INTEGER,
    "last_serviced_on" DATE,
    "retired_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_equipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenance_equipment_property_id_idx" ON "maintenance_equipment"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_equipment_id_property_id_organization_id_key" ON "maintenance_equipment"("id", "property_id", "organization_id");

-- CreateIndex
CREATE INDEX "maintenance_requests_equipment_id_idx" ON "maintenance_requests"("equipment_id");

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_equipment_id_property_id_organization_fkey" FOREIGN KEY ("equipment_id", "property_id", "organization_id") REFERENCES "maintenance_equipment"("id", "property_id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "maintenance_equipment" ADD CONSTRAINT "maintenance_equipment_property_id_organization_id_fkey" FOREIGN KEY ("property_id", "organization_id") REFERENCES "properties"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "maintenance_equipment" ADD CONSTRAINT "maintenance_equipment_accommodation_unit_id_property_id_or_fkey" FOREIGN KEY ("accommodation_unit_id", "property_id", "organization_id") REFERENCES "accommodation_units"("id", "property_id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------
-- Hand-written from here down (RANZ-33 slice 3, docs/features/maintenance)
-- ---------------------------------------------------------------------------

-- Equipment is registered, and a problem may be reported about it (MT-S3-*).
--
-- ON THE NUMBER. 004500, after 004400 in the same change.
--
-- The composite foreign keys above are MT-S3-02 and MT-S3-07: an item's Unit
-- is at the item's Property, and a request's item is at the request's.

alter table public.maintenance_equipment
  add constraint maintenance_equipment_name_check
    check (char_length(btrim(name)) between 1 and 120),
  add constraint maintenance_equipment_category_check
    check (char_length(btrim(category)) between 1 and 60),
  add constraint maintenance_equipment_location_check
    check (location is null or char_length(btrim(location)) between 1 and 120),
  add constraint maintenance_equipment_interval_check
    check (service_interval_months is null
           or service_interval_months between 1 and 120),
  -- MT-S3-02: somewhere, and one somewhere — a Unit or a named place.
  add constraint maintenance_equipment_is_somewhere
    check (num_nonnulls(accommodation_unit_id, location) = 1);

comment on table public.maintenance_equipment is
  'Something at a Property that is serviced and can break (RANZ-33 slice 3). '
  'At a Unit or a named place. Retired, never deleted. Its condition is read '
  'off its dates and open requests, never stored (MT-S3-04).';

-- MT-S1-08 widened: a request is about a Unit, an item, or both.
alter table public.maintenance_requests
  drop constraint maintenance_requests_is_about_something,
  add constraint maintenance_requests_is_about_something
    check (num_nonnulls(accommodation_unit_id, equipment_id) >= 1);

-- ---------------------------------------------------------------------------
-- The permission
-- ---------------------------------------------------------------------------

-- The register and the service plan. Owner and manager by default
-- (MT-S1-28); an Organization gives it to whoever keeps its equipment.
insert into public.staff_permissions (key, module_key)
values ('maintenance.equipment', 'maintenance');

update public.staff_roles
   set permissions = array_append(permissions, 'maintenance.equipment'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager')
   and not ('maintenance.equipment' = any (permissions));

-- ---------------------------------------------------------------------------
-- Reading and writing
-- ---------------------------------------------------------------------------

alter table public.maintenance_equipment enable row level security;
alter table public.maintenance_equipment force row level security;

create policy maintenance_equipment_read_accessible_property
  on public.maintenance_equipment for select
  using (property_id in (select app.accessible_property_ids()));

grant select on public.maintenance_equipment to ranza_app;

-- Five gates (MT-S3-08).
create policy maintenance_equipment_insert_equipment
  on public.maintenance_equipment for insert
  with check (
    app.can_use_capability(property_id, 'maintenance', 'maintenance')
    and app.has_organization_permission(organization_id, 'maintenance.equipment')
  );

create policy maintenance_equipment_update_equipment
  on public.maintenance_equipment for update
  using (
    app.can_use_capability(property_id, 'maintenance', 'maintenance')
    and app.has_organization_permission(organization_id, 'maintenance.equipment')
  )
  with check (
    app.can_use_capability(property_id, 'maintenance', 'maintenance')
    and app.has_organization_permission(organization_id, 'maintenance.equipment')
  );

-- MT-S3-10: no delete policy and no delete grant. Where an item is and what
-- it is can change; which Property it belongs to cannot.
grant insert (organization_id, property_id, name, category,
              accommodation_unit_id, location, service_interval_months,
              last_serviced_on)
  on public.maintenance_equipment to ranza_app;

grant update (name, category, accommodation_unit_id, location,
              service_interval_months, last_serviced_on, retired_at)
  on public.maintenance_equipment to ranza_app;

-- A request may name an item when it is reported.
grant insert (equipment_id) on public.maintenance_requests to ranza_app;

-- When: the times are the database's. Retiring stamps the moment and a
-- caller's value is replaced; restoring clears it. A last service is not in
-- the future of the Property's own day (MT-S3-03).
create function app.maintenance_equipment_is_stamped()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    if new.retired_at is not null then
      new.retired_at := now();
    end if;
  elsif new.retired_at is not null and old.retired_at is null then
    new.retired_at := now();
  elsif new.retired_at is not null then
    new.retired_at := old.retired_at;
  end if;

  if new.last_serviced_on is not null
     and new.last_serviced_on > app.property_today(new.property_id) then
    raise exception using
      errcode = '23514',
      message = 'equipment is not serviced in the future';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger maintenance_equipment_stamped
  before insert or update on public.maintenance_equipment
  for each row execute function app.maintenance_equipment_is_stamped();

-- A problem is reported about equipment in use (MT-S3-06). The report form
-- offers no retired item, and this is what refuses a form that was open while
-- somebody retired it. An invoker: the reporter reaches the request's
-- Property, and the item is at that Property by the composite foreign key, so
-- the row it reads is one the reporter can already see.
create function app.maintenance_request_names_equipment_in_use()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
      from public.maintenance_equipment as equipment
     where equipment.id = new.equipment_id
       and equipment.retired_at is not null
  ) then
    raise exception using
      errcode = '55000',
      message = 'a request is not raised against retired equipment';
  end if;
  return new;
end;
$$;

create trigger maintenance_requests_name_equipment_in_use
  before insert on public.maintenance_requests
  for each row
  when (new.equipment_id is not null)
  execute function app.maintenance_request_names_equipment_in_use();
