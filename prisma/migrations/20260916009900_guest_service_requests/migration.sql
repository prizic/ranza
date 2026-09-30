-- CreateTable
CREATE TABLE "service_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "category" TEXT NOT NULL DEFAULT 'other',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'new',
    "cancel_reason" TEXT,
    "resolution_notes" TEXT,
    "accommodation_unit_id" UUID,
    "stay_id" UUID,
    "guest_id" UUID,
    "assigned_to_user_id" UUID,
    "reported_by_user_id" UUID,
    "reported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_requests_property_status_idx" ON "service_requests"("property_id", "status");

-- CreateIndex
CREATE INDEX "service_requests_organization_idx" ON "service_requests"("organization_id");

-- CreateIndex
CREATE INDEX "service_requests_unit_idx" ON "service_requests"("accommodation_unit_id");

-- CreateIndex
CREATE INDEX "service_requests_stay_idx" ON "service_requests"("stay_id");

-- CreateIndex
CREATE INDEX "service_requests_guest_idx" ON "service_requests"("guest_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_requests_property_id_number_key" ON "service_requests"("property_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "service_requests_id_property_id_organization_id_key" ON "service_requests"("id", "property_id", "organization_id");

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_property_id_organization_id_fkey" FOREIGN KEY ("property_id", "organization_id") REFERENCES "properties"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_accommodation_unit_id_property_id_organiz_fkey" FOREIGN KEY ("accommodation_unit_id", "property_id", "organization_id") REFERENCES "accommodation_units"("id", "property_id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_stay_id_property_id_organization_id_fkey" FOREIGN KEY ("stay_id", "property_id", "organization_id") REFERENCES "stays"("id", "property_id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_guest_id_organization_id_fkey" FOREIGN KEY ("guest_id", "organization_id") REFERENCES "guests"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_reported_by_user_id_fkey" FOREIGN KEY ("reported_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------
-- Hand-written domain constraints and policies (Blueprint 5.5, 4.3, GX-S1-*)
-- ---------------------------------------------------------------------------

alter table public.service_requests
  add constraint service_requests_number_check
    check (number > 0),
  add constraint service_requests_title_check
    check (char_length(btrim(title)) between 3 and 200),
  add constraint service_requests_details_check
    check (details is null or char_length(details) <= 2000),
  add constraint service_requests_category_check
    check (category in ('housekeeping', 'maintenance', 'amenities', 'front_desk', 'other')),
  add constraint service_requests_priority_check
    check (priority in ('low', 'normal', 'high', 'urgent')),
  add constraint service_requests_status_check
    check (status in ('new', 'in_progress', 'resolved', 'cancelled')),
  add constraint service_requests_cancel_reason_pairing
    check ((status = 'cancelled') = (cancel_reason is not null)),
  add constraint service_requests_cancel_reason_check
    check (cancel_reason is null or char_length(btrim(cancel_reason)) between 3 and 200),
  add constraint service_requests_resolution_notes_check
    check (resolution_notes is null or char_length(resolution_notes) <= 2000);

comment on table public.service_requests is
  'A guest or resident service request at a Property (Blueprint 5.5, 4.3). '
  'Numbered per Property. Never deleted: cancelled requests carry a cancel reason.';

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.staff_permissions (key, module_key)
values ('guest_services.create_request', 'guest_services'),
       ('guest_services.manage_requests', 'guest_services')
on conflict (key) do nothing;

-- Shipped roles: owner, manager, front_desk, housekeeping create requests
update public.staff_roles
   set permissions = array_append(permissions, 'guest_services.create_request'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager', 'front_desk', 'housekeeping')
   and not ('guest_services.create_request' = any (permissions));

-- Shipped roles: owner, manager, front_desk manage requests
update public.staff_roles
   set permissions = array_append(permissions, 'guest_services.manage_requests'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager', 'front_desk')
   and not ('guest_services.manage_requests' = any (permissions));

-- ---------------------------------------------------------------------------
-- Reading: Row-Level Security
-- ---------------------------------------------------------------------------

alter table public.service_requests enable row level security;
alter table public.service_requests force row level security;

create policy service_requests_read_accessible_property
  on public.service_requests for select
  using (property_id in (select app.accessible_property_ids()));

grant select on public.service_requests to ranza_app;

-- ---------------------------------------------------------------------------
-- Writing: Five gates (Subscription, Entitlement, Capability, Reach, Permission)
-- ---------------------------------------------------------------------------

create policy service_requests_insert_create
  on public.service_requests for insert
  with check (
    app.can_use_capability(property_id, 'guest_services', 'guest_experience')
    and app.has_organization_permission(organization_id, 'guest_services.create_request')
    and (
      assigned_to_user_id is null
      or app.has_organization_permission(organization_id, 'guest_services.manage_requests')
    )
  );

create policy service_requests_update_manage
  on public.service_requests for update
  using (
    app.can_use_capability(property_id, 'guest_services', 'guest_experience')
    and app.has_organization_permission(organization_id, 'guest_services.manage_requests')
  )
  with check (
    app.can_use_capability(property_id, 'guest_services', 'guest_experience')
    and app.has_organization_permission(organization_id, 'guest_services.manage_requests')
  );

-- No delete policy and no delete grant: service requests are immutable or transitioned to cancelled
grant insert (organization_id, property_id, title, details, category, priority,
              accommodation_unit_id, stay_id, guest_id, assigned_to_user_id)
  on public.service_requests to ranza_app;

grant update (status, cancel_reason, resolution_notes, priority, category,
              assigned_to_user_id, accommodation_unit_id)
  on public.service_requests to ranza_app;

-- ---------------------------------------------------------------------------
-- Stamping Trigger
-- ---------------------------------------------------------------------------

create or replace function app.service_request_is_stamped()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  acting uuid := app.current_user_id();
begin
  if tg_op = 'INSERT' then
    -- Sequential number per property
    perform pg_advisory_xact_lock(hashtext('service_requests_number'), hashtext(new.property_id::text));
    select coalesce(max(number), 0) + 1
      into new.number
      from public.service_requests
     where property_id = new.property_id;

    new.status := 'new';
    new.reported_at := now();
    new.reported_by_user_id := acting;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Prevent directly cancelling a resolved request
    if old.status = 'resolved' and new.status = 'cancelled' then
      raise exception 'a resolved request cannot be cancelled; reopen it first'
        using errcode = '22000';
    end if;

    -- A cancelled request reopened goes to new
    if old.status = 'cancelled' and new.status not in ('cancelled', 'new') then
      raise exception 'a cancelled request can only be reopened to new'
        using errcode = '22000';
    end if;

    if new.status = 'resolved' and old.status <> 'resolved' then
      new.resolved_at := now();
    elsif new.status <> 'resolved' then
      new.resolved_at := null;
    end if;

    new.updated_at := now();
    return new;
  end if;

  return null;
end;
$$;

create trigger service_request_stamp
  before insert or update on public.service_requests
  for each row execute function app.service_request_is_stamped();
