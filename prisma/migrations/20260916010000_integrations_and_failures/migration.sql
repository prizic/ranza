-- CreateTable integrations
CREATE TABLE "integrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_connected',
    "detail" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "last_sync_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable failed_operations
CREATE TABLE "failed_operations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "integration_id" UUID,
    "integration_name" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "error" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'failed',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "last_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failed_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integrations_property_id_key_key" ON "integrations"("property_id", "key");
CREATE INDEX "integrations_property_status_idx" ON "integrations"("property_id", "status");
CREATE INDEX "integrations_organization_idx" ON "integrations"("organization_id");

-- CreateIndex
CREATE INDEX "failed_operations_property_status_idx" ON "failed_operations"("property_id", "status");
CREATE INDEX "failed_operations_organization_idx" ON "failed_operations"("organization_id");

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_property_id_organization_id_fkey" FOREIGN KEY ("property_id", "organization_id") REFERENCES "properties"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "failed_operations" ADD CONSTRAINT "failed_operations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "failed_operations" ADD CONSTRAINT "failed_operations_property_id_organization_id_fkey" FOREIGN KEY ("property_id", "organization_id") REFERENCES "properties"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "failed_operations" ADD CONSTRAINT "failed_operations_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------
-- Hand-written domain constraints (Blueprint 5.15, 5.16, Phase 5, INT-S1-*)
-- ---------------------------------------------------------------------------

alter table public.integrations
  add constraint integrations_status_check
    check (status in ('connected', 'error', 'not_connected')),
  add constraint integrations_category_check
    check (category in ('Distribution', 'Payments', 'Access', 'Government', 'Tax', 'Messaging', 'Other'));

alter table public.failed_operations
  add constraint failed_operations_status_check
    check (status in ('failed', 'retrying', 'resolved')),
  add constraint failed_operations_attempts_check
    check (attempts > 0),
  add constraint failed_operations_error_check
    check (char_length(btrim(error)) > 0),
  add constraint failed_operations_operation_check
    check (char_length(btrim(operation)) > 0);

comment on table public.integrations is
  'External system integrations per Property (Blueprint 5.15, Phase 5). Channels, payment providers, door locks, government reporting.';

comment on table public.failed_operations is
  'Operationally visible failures from external integrations (Blueprint 5.16, INT-S1-*). Retries happen automatically or manually from the workspace.';

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.staff_permissions (key, module_key)
values ('integrations.view', 'platform_core'),
       ('integrations.manage', 'platform_core')
on conflict (key) do nothing;

-- Shipped roles: owner and manager view and manage integrations
update public.staff_roles
   set permissions = array_append(permissions, 'integrations.view'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager')
   and not ('integrations.view' = any (permissions));

update public.staff_roles
   set permissions = array_append(permissions, 'integrations.manage'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager')
   and not ('integrations.manage' = any (permissions));

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

alter table public.integrations enable row level security;
alter table public.integrations force row level security;

create policy integrations_read_accessible_property
  on public.integrations for select
  using (
    property_id in (select app.accessible_property_ids())
    and (
      app.has_organization_permission(organization_id, 'integrations.view')
      or app.has_organization_permission(organization_id, 'integrations.manage')
    )
  );

create policy integrations_insert_manage
  on public.integrations for insert
  with check (
    app.can_use_capability(property_id, 'platform_core', 'integrations')
    and app.has_organization_permission(organization_id, 'integrations.manage')
  );

create policy integrations_update_manage
  on public.integrations for update
  using (
    app.can_use_capability(property_id, 'platform_core', 'integrations')
    and app.has_organization_permission(organization_id, 'integrations.manage')
  )
  with check (
    app.can_use_capability(property_id, 'platform_core', 'integrations')
    and app.has_organization_permission(organization_id, 'integrations.manage')
  );

grant select on public.integrations to ranza_app;
grant insert (organization_id, property_id, key, name, category, status, detail, config, last_sync_at)
  on public.integrations to ranza_app;
grant update (status, detail, config, last_sync_at, updated_at)
  on public.integrations to ranza_app;

-- Failed operations RLS
alter table public.failed_operations enable row level security;
alter table public.failed_operations force row level security;

create policy failed_operations_read_accessible_property
  on public.failed_operations for select
  using (
    property_id in (select app.accessible_property_ids())
    and (
      app.has_organization_permission(organization_id, 'integrations.view')
      or app.has_organization_permission(organization_id, 'integrations.manage')
    )
  );

create policy failed_operations_insert_manage
  on public.failed_operations for insert
  with check (
    app.can_use_capability(property_id, 'platform_core', 'integrations')
    and app.has_organization_permission(organization_id, 'integrations.manage')
  );

create policy failed_operations_update_manage
  on public.failed_operations for update
  using (
    app.can_use_capability(property_id, 'platform_core', 'integrations')
    and app.has_organization_permission(organization_id, 'integrations.manage')
  )
  with check (
    app.can_use_capability(property_id, 'platform_core', 'integrations')
    and app.has_organization_permission(organization_id, 'integrations.manage')
  );

grant select on public.failed_operations to ranza_app;
grant insert (organization_id, property_id, integration_id, integration_name, operation, error, status, attempts, payload, last_attempt_at)
  on public.failed_operations to ranza_app;
grant update (status, error, attempts, payload, last_attempt_at, updated_at)
  on public.failed_operations to ranza_app;

-- ---------------------------------------------------------------------------
-- Worker single-purpose functions (ADR 0027)
-- ---------------------------------------------------------------------------

create or replace function app.record_integration_failure(
  target_property_id uuid,
  target_key text,
  target_name text,
  target_operation text,
  target_error text,
  target_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_organization uuid;
  integration_record_id uuid;
  failed_op_id uuid;
begin
  select organization_id into acting_organization
    from public.properties
   where id = target_property_id;

  if acting_organization is null then
    raise exception 'property not found' using errcode = '22000';
  end if;

  if current_user <> 'ranza_worker' and not app.has_organization_permission(acting_organization, 'integrations.manage') then
    raise exception 'caller lacks permission to record integration failure'
      using errcode = '42501';
  end if;

  if current_user = 'ranza_worker' and app.worker_organization_id() <> acting_organization then
    raise exception 'worker context does not match property organization'
      using errcode = '42501';
  end if;

  -- 1. Ensure integration row is in error status
  insert into public.integrations
    (property_id, organization_id, key, name, category, status, detail, last_sync_at)
  values
    (target_property_id, acting_organization, target_key, target_name, 'Distribution', 'error', target_error, now())
  on conflict (property_id, key) do update
    set status = 'error',
        detail = target_error,
        last_sync_at = now(),
        updated_at = now()
  returning id into integration_record_id;

  -- 2. Insert failed operation
  insert into public.failed_operations
    (property_id, organization_id, integration_id, integration_name, operation, error, status, attempts, payload, last_attempt_at)
  values
    (target_property_id, acting_organization, integration_record_id, target_name, target_operation, target_error, 'failed', 1, target_payload, now())
  returning id into failed_op_id;

  return failed_op_id;
end;
$$;

create or replace function app.resolve_failed_operation(
  target_operation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org_id uuid;
  target_prop_id uuid;
  target_name text;
  remaining_count bigint;
begin
  select organization_id, property_id, integration_name
    into target_org_id, target_prop_id, target_name
    from public.failed_operations
   where id = target_operation_id
     for update;

  if not found then
    return false;
  end if;

  if current_user <> 'ranza_worker' and not app.has_organization_permission(target_org_id, 'integrations.manage') then
    raise exception 'caller lacks permission to resolve failed operation'
      using errcode = '42501';
  end if;

  if current_user = 'ranza_worker' and app.worker_organization_id() <> target_org_id then
    raise exception 'worker context does not match organization'
      using errcode = '42501';
  end if;

  update public.failed_operations
     set status = 'resolved',
         updated_at = now()
   where id = target_operation_id;

  select count(*) into remaining_count
    from public.failed_operations
   where property_id = target_prop_id
     and integration_name = target_name
     and status in ('failed', 'retrying');

  if remaining_count = 0 then
    update public.integrations
       set status = 'connected',
           detail = null,
           last_sync_at = now(),
           updated_at = now()
     where property_id = target_prop_id
       and name = target_name;
  end if;

  return true;
end;
$$;

revoke execute on function app.record_integration_failure(uuid, text, text, text, text, jsonb) from public;
grant execute on function app.record_integration_failure(uuid, text, text, text, text, jsonb) to ranza_worker, ranza_app;

revoke execute on function app.resolve_failed_operation(uuid) from public;
grant execute on function app.resolve_failed_operation(uuid) to ranza_worker, ranza_app;
