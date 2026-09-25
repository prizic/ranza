-- CreateTable
CREATE TABLE "maintenance_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "accommodation_unit_id" UUID,
    "priority" TEXT NOT NULL DEFAULT 'this_week',
    "status" TEXT NOT NULL DEFAULT 'new',
    "cancel_reason" TEXT,
    "assignee_id" UUID,
    "reported_by" UUID NOT NULL,
    "reported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenance_requests_property_id_status_idx" ON "maintenance_requests"("property_id", "status");

-- CreateIndex
CREATE INDEX "maintenance_requests_accommodation_unit_id_idx" ON "maintenance_requests"("accommodation_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_requests_property_id_number_key" ON "maintenance_requests"("property_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_requests_id_property_id_organization_id_key" ON "maintenance_requests"("id", "property_id", "organization_id");

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_property_id_organization_id_fkey" FOREIGN KEY ("property_id", "organization_id") REFERENCES "properties"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_accommodation_unit_id_property_id_org_fkey" FOREIGN KEY ("accommodation_unit_id", "property_id", "organization_id") REFERENCES "accommodation_units"("id", "property_id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------
-- Hand-written from here down (RANZ-33 slice 1, docs/features/maintenance)
-- ---------------------------------------------------------------------------

-- A problem is reported and worked: reported by anyone at the Property, moved,
-- assigned and cancelled by a few (MT-S1-*).
--
-- ON THE NUMBER. 004300. feat/housekeeping holds 003000 to 003499,
-- feat/front-desk-occupancy 003500 to 003999 and feat/audit-log-hardening
-- 004200, so this sorts after every open branch and none has to renumber.
--
-- The composite foreign key above is MT-S1-07: a request's Unit is at the
-- request's own Property, and so in its own Organization, because the key says
-- so rather than because a caller was careful.

alter table public.maintenance_requests
  add constraint maintenance_requests_number_check
    check (number > 0),
  add constraint maintenance_requests_title_check
    check (char_length(btrim(title)) between 3 and 200),
  add constraint maintenance_requests_details_check
    check (details is null or char_length(details) <= 2000),
  add constraint maintenance_requests_priority_check
    check (priority in ('urgent', 'this_week', 'can_wait')),
  add constraint maintenance_requests_status_check
    check (status in ('new', 'in_progress', 'waiting_for_parts', 'done', 'cancelled')),
  -- MT-S1-15: a cancelled request says why, and nothing else carries a reason.
  add constraint maintenance_requests_cancel_reason_pairing
    check ((status = 'cancelled') = (cancel_reason is not null)),
  add constraint maintenance_requests_cancel_reason_check
    check (cancel_reason is null or char_length(btrim(cancel_reason)) between 3 and 200),
  -- MT-S1-08. Equipment arrives in slice 3, which widens this to "a Unit or an
  -- item"; until then a request is about a Unit.
  add constraint maintenance_requests_is_about_something
    check (accommodation_unit_id is not null);

comment on table public.maintenance_requests is
  'A problem reported at a Property and the work on it (RANZ-33, blueprint 5.13, '
  '6.5). Numbered per Property. Never deleted: a mistake is cancelled with a '
  'reason. Whether it holds its Unit out of order is maintenance_unit_holds.';

-- ---------------------------------------------------------------------------
-- The permissions
-- ---------------------------------------------------------------------------

-- Two of the four maintenance permissions; taking a room out of order arrives
-- with slice 2 and equipment with slice 3. Each is its own so that an
-- Organization composes roles as it likes (Staff slice 3): anyone reports, a
-- few work the board. The catalogue trigger fires on the role update, which is
-- why the inserts come first.
insert into public.staff_permissions (key, module_key)
values ('maintenance.report', 'maintenance'),
       ('maintenance.manage', 'maintenance');

-- MT-S1-28: every shipped role reports.
update public.staff_roles
   set permissions = array_append(permissions, 'maintenance.report'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager', 'front_desk', 'housekeeping', 'finance')
   and not ('maintenance.report' = any (permissions));

-- MT-S1-28: owner and manager work the board.
update public.staff_roles
   set permissions = array_append(permissions, 'maintenance.manage'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager')
   and not ('maintenance.manage' = any (permissions));

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------

-- Reach alone, as accommodation_units and housekeeping_unit_status do. The
-- commercial gates are in the board's own statement (MT-S1-05).
alter table public.maintenance_requests enable row level security;
alter table public.maintenance_requests force row level security;

create policy maintenance_requests_read_accessible_property
  on public.maintenance_requests for select
  using (property_id in (select app.accessible_property_ids()));

grant select on public.maintenance_requests to ranza_app;

-- ---------------------------------------------------------------------------
-- Writing: five gates
-- ---------------------------------------------------------------------------

-- Subscription, Entitlement, Property capability and reach are inside
-- app.can_use_capability; the permission is the fifth conjunct (ADR 0012 as
-- amended by ADR 0026). The capability is maintenance's own.
--
-- A report may name an assignee only when its author may assign: assigning is
-- working the board, and reporting is not (MT-S1-18).
create policy maintenance_requests_insert_report
  on public.maintenance_requests for insert
  with check (
    app.can_use_capability(property_id, 'maintenance', 'maintenance')
    and app.has_organization_permission(organization_id, 'maintenance.report')
    and (
      assignee_id is null
      or app.has_organization_permission(organization_id, 'maintenance.manage')
    )
  );

create policy maintenance_requests_update_manage
  on public.maintenance_requests for update
  using (
    app.can_use_capability(property_id, 'maintenance', 'maintenance')
    and app.has_organization_permission(organization_id, 'maintenance.manage')
  )
  with check (
    app.can_use_capability(property_id, 'maintenance', 'maintenance')
    and app.has_organization_permission(organization_id, 'maintenance.manage')
  );

-- MT-S1-23: no delete policy and no delete grant.
--
-- A policy bounds rows; a grant bounds columns (MT-S1-03, MT-S1-22). Where a
-- request is and what it is about are fixed when it is reported; the number,
-- the reporter and every time are the database's to say. A report is always
-- new, so status is not in the insert grant.
grant insert (organization_id, property_id, title, details,
              accommodation_unit_id, priority, assignee_id)
  on public.maintenance_requests to ranza_app;

grant update (status, cancel_reason, priority, assignee_id)
  on public.maintenance_requests to ranza_app;

-- ---------------------------------------------------------------------------
-- Stamping: the number, who and when
-- ---------------------------------------------------------------------------

-- The number is one more than the Property's highest, under a lock taken per
-- Property for the rest of the transaction, so two reports at one moment get
-- two numbers rather than one refusal (MT-S1-02). An invoker: whoever may
-- report at a Property reaches it, and so reads every request there.
--
-- The reporter is whoever the request context says is acting; a report with no
-- acting Staff Member is refused rather than stamped with nobody.
--
-- The moves are the ones docs/features/maintenance/states.mmd draws, and a
-- check constraint on one row cannot see two states at once: a done request is
-- not cancelled, because it was fixed and is reopened first (MT-S1-16), and a
-- cancelled one is reopened as new and goes nowhere else (MT-S1-17). Every
-- other move between the four board states is allowed (Q4).
create function app.maintenance_request_is_stamped()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  acting uuid := app.current_user_id();
begin
  if tg_op = 'INSERT' then
    if acting is null then
      raise exception 'reporting a problem requires an acting Staff Member'
        using errcode = '42501';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended('maintenance_requests:' || new.property_id::text, 0));

    select coalesce(max(request.number), 0) + 1
      into new.number
      from public.maintenance_requests as request
     where request.property_id = new.property_id;

    new.status := 'new';
    new.cancel_reason := null;
    new.reported_by := acting;
    new.reported_at := now();
    new.status_changed_at := now();
    new.created_at := now();
  else
    if old.status = 'done' and new.status = 'cancelled' then
      raise exception using
        errcode = '55000',
        message = 'a done request is not cancelled; reopen it first';
    end if;

    if old.status = 'cancelled' and new.status not in ('cancelled', 'new') then
      raise exception using
        errcode = '55000',
        message = 'a cancelled request is reopened as new';
    end if;

    if new.status is distinct from old.status then
      new.status_changed_at := now();
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger maintenance_requests_stamped
  before insert or update on public.maintenance_requests
  for each row execute function app.maintenance_request_is_stamped();

-- ---------------------------------------------------------------------------
-- An assignee reaches the Property
-- ---------------------------------------------------------------------------

-- MT-S1-19. The same reach app.accessible_property_ids() computes for the
-- acting Staff Member, asked of the assignee instead: an active membership in
-- the request's Organization that is Organization-wide, or an active
-- assignment to the request's Property. An invoker, because a colleague's
-- membership and assignments are readable to everyone in the Organization
-- (20260916002200), and the acting Staff Member is in it.
--
-- Only when the assignee changes: somebody whose reach is taken away later
-- stays on the requests they had (MT-S1-20), and moving one of those must not
-- be refused for it.
create function app.maintenance_assignee_reaches_the_property()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.assignee_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id then
    return new;
  end if;

  if not exists (
    select 1
      from public.organization_memberships as membership
     where membership.user_id = new.assignee_id
       and membership.organization_id = new.organization_id
       and membership.status = 'active'
       and (
         membership.access_scope = 'organization_wide'
         or exists (
           select 1
             from public.property_assignments as assignment
            where assignment.user_id = membership.user_id
              and assignment.organization_id = membership.organization_id
              and assignment.property_id = new.property_id
              and assignment.status = 'active'
         )
       )
  ) then
    raise exception using
      errcode = '23514',
      message = 'the assignee does not reach this Property';
  end if;

  return new;
end;
$$;

create trigger maintenance_requests_assignee_reaches_the_property
  before insert or update of assignee_id on public.maintenance_requests
  for each row execute function app.maintenance_assignee_reaches_the_property();
