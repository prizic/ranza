-- Data Export and Scheduled Exports (Blueprint 7.5, 13.10, Phase 1 data lifecycle)

-- CreateTable data_exports
CREATE TABLE "data_exports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "requester_name" TEXT NOT NULL,
    "resource_types" TEXT[] NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'csv',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "trigger_type" TEXT NOT NULL DEFAULT 'on_demand',
    "schedule_id" UUID,
    "file_name" TEXT,
    "file_size_bytes" BIGINT,
    "file_content" TEXT,
    "record_counts" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "error" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable export_schedules
CREATE TABLE "export_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "resource_types" TEXT[] NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'csv',
    "frequency" TEXT NOT NULL DEFAULT 'daily',
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_run_at" TIMESTAMPTZ(6),
    "next_run_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_exports_organization_idx" ON "data_exports"("organization_id", "requested_at" DESC);
CREATE INDEX "data_exports_status_idx" ON "data_exports"("status");

-- CreateIndex
CREATE INDEX "export_schedules_organization_idx" ON "export_schedules"("organization_id");
CREATE INDEX "export_schedules_due_idx" ON "export_schedules"("next_run_at");

-- AddForeignKey
ALTER TABLE "data_exports" ADD CONSTRAINT "data_exports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "data_exports" ADD CONSTRAINT "data_exports_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "data_exports" ADD CONSTRAINT "data_exports_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "export_schedules"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "export_schedules" ADD CONSTRAINT "export_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "export_schedules" ADD CONSTRAINT "export_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------
-- Hand-written domain constraints (Blueprint 7.5, Phase 1 data lifecycle)
-- ---------------------------------------------------------------------------

alter table public.data_exports
  add constraint data_exports_status_check
  check (status in ('pending', 'processing', 'ready', 'failed'));

alter table public.data_exports
  add constraint data_exports_format_check
  check (format in ('csv', 'json', 'excel'));

alter table public.data_exports
  add constraint data_exports_trigger_type_check
  check (trigger_type in ('on_demand', 'scheduled'));

alter table public.data_exports
  add constraint data_exports_resource_types_not_empty
  check (cardinality(resource_types) > 0);

alter table public.export_schedules
  add constraint export_schedules_frequency_check
  check (frequency in ('daily', 'weekly', 'monthly'));

alter table public.export_schedules
  add constraint export_schedules_status_check
  check (status in ('active', 'paused'));

alter table public.export_schedules
  add constraint export_schedules_format_check
  check (format in ('csv', 'json', 'excel'));

alter table public.export_schedules
  add constraint export_schedules_resource_types_not_empty
  check (cardinality(resource_types) > 0);

-- ---------------------------------------------------------------------------
-- Staff permissions (Blueprint 3.6 baseline right, 7.2)
-- ---------------------------------------------------------------------------

insert into public.staff_permissions (key, module_key)
values
  ('data_export.read', 'platform_core'),
  ('data_export.create', 'platform_core')
on conflict (key) do nothing;

update public.staff_roles
   set permissions = array_append(permissions, 'data_export.read'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager', 'finance')
   and not ('data_export.read' = any (permissions));

update public.staff_roles
   set permissions = array_append(permissions, 'data_export.create'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager', 'finance')
   and not ('data_export.create' = any (permissions));

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.data_exports enable row level security;
alter table public.data_exports force row level security;

alter table public.export_schedules enable row level security;
alter table public.export_schedules force row level security;

create policy data_exports_read_worker on public.data_exports
  for select
  to ranza_worker
  using (organization_id = app.worker_organization_id());

create policy data_exports_read_app on public.data_exports
  for select
  to ranza_app
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'data_export.read')
  );

create policy data_exports_insert_worker on public.data_exports
  for insert
  to ranza_worker
  with check (organization_id = app.worker_organization_id());

create policy data_exports_insert_app on public.data_exports
  for insert
  to ranza_app
  with check (
    organization_id in (select app.accessible_organization_ids())
    and requester_id = app.current_user_id()
    and app.has_organization_permission(organization_id, 'data_export.create')
  );

create policy data_exports_update_worker on public.data_exports
  for update
  to ranza_worker
  using (organization_id = app.worker_organization_id())
  with check (organization_id = app.worker_organization_id());

create policy data_exports_update_app on public.data_exports
  for update
  to ranza_app
  using (
    organization_id in (select app.accessible_organization_ids())
    and requester_id = app.current_user_id()
    and app.has_organization_permission(organization_id, 'data_export.create')
  )
  with check (
    organization_id in (select app.accessible_organization_ids())
    and requester_id = app.current_user_id()
    and app.has_organization_permission(organization_id, 'data_export.create')
  );

create policy export_schedules_read_worker on public.export_schedules
  for select
  to ranza_worker
  using (organization_id = app.worker_organization_id());

create policy export_schedules_read_app on public.export_schedules
  for select
  to ranza_app
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'data_export.read')
  );

create policy export_schedules_insert_app on public.export_schedules
  for insert
  to ranza_app
  with check (
    organization_id in (select app.accessible_organization_ids())
    and created_by = app.current_user_id()
    and app.has_organization_permission(organization_id, 'data_export.create')
  );

create policy export_schedules_update_worker on public.export_schedules
  for update
  to ranza_worker
  using (organization_id = app.worker_organization_id())
  with check (organization_id = app.worker_organization_id());

create policy export_schedules_update_app on public.export_schedules
  for update
  to ranza_app
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'data_export.create')
  )
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(organization_id, 'data_export.create')
  );

-- ---------------------------------------------------------------------------
-- Column-level write grants (ADR 0012, IG-01 … IG-11)
-- ---------------------------------------------------------------------------

grant select on public.data_exports to ranza_app;
grant insert (id, organization_id, requester_id, requester_name, resource_types,
              format, status, trigger_type, schedule_id, file_name, file_size_bytes,
              file_content, record_counts, error, expires_at, requested_at,
              completed_at, created_at, updated_at)
  on public.data_exports to ranza_app;
grant update (status, error, updated_at)
  on public.data_exports to ranza_app;

grant select on public.data_exports to ranza_worker;
grant insert (id, organization_id, requester_id, requester_name, resource_types,
              format, status, trigger_type, schedule_id, file_name, file_size_bytes,
              file_content, record_counts, error, expires_at, requested_at,
              completed_at, created_at, updated_at)
  on public.data_exports to ranza_worker;
grant update (status, file_name, file_size_bytes, file_content, record_counts,
              error, expires_at, completed_at, updated_at)
  on public.data_exports to ranza_worker;

grant select on public.export_schedules to ranza_app;
grant insert (id, organization_id, created_by, name, resource_types, format,
              frequency, status, next_run_at, created_at, updated_at)
  on public.export_schedules to ranza_app;
grant update (name, resource_types, format, frequency, status, next_run_at, updated_at)
  on public.export_schedules to ranza_app;

grant select on public.export_schedules to ranza_worker;
grant update (last_run_at, next_run_at, status, updated_at)
  on public.export_schedules to ranza_worker;

-- ---------------------------------------------------------------------------
-- Worker cross-organization scheduling functions (ADR 0018, ADR 0034)
-- ---------------------------------------------------------------------------

create function app.export_schedules_due()
returns table (
  schedule_id uuid,
  organization_id uuid
)
language sql
security definer
set search_path = ''
as $$
  select id as schedule_id, organization_id
    from public.export_schedules
   where status = 'active'
     and next_run_at <= now()
   order by next_run_at asc;
$$;

revoke all on function app.export_schedules_due() from public, ranza_app, ranza_auth;
grant execute on function app.export_schedules_due() to ranza_worker;

create function app.pending_data_exports()
returns table (
  export_id uuid,
  organization_id uuid
)
language sql
security definer
set search_path = ''
as $$
  select id as export_id, organization_id
    from public.data_exports
   where status = 'pending'
   order by requested_at asc
   limit 50;
$$;

revoke all on function app.pending_data_exports() from public, ranza_app, ranza_auth;
grant execute on function app.pending_data_exports() to ranza_worker;
