-- CreateTable
CREATE TABLE "maintenance_unit_holds" (
    "request_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "since" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taken_by" UUID NOT NULL,
    "expected_back_on" DATE,
    "returned_at" TIMESTAMPTZ(6),
    "returned_by" UUID,
    "returned_as" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_unit_holds_pkey" PRIMARY KEY ("request_id")
);

-- CreateTable
CREATE TABLE "maintenance_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "property_id" UUID,
    "assignee_required" BOOLEAN,
    "return_on_done" BOOLEAN,
    "return_as" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_unit_holds_request_id_property_id_organization__key" ON "maintenance_unit_holds"("request_id", "property_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_settings_organization_default_key" ON "maintenance_settings"("organization_id") WHERE (property_id IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_settings_property_override_key" ON "maintenance_settings"("property_id") WHERE (property_id IS NOT NULL);

-- AddForeignKey
ALTER TABLE "maintenance_unit_holds" ADD CONSTRAINT "maintenance_unit_holds_request_id_property_id_organization_fkey" FOREIGN KEY ("request_id", "property_id", "organization_id") REFERENCES "maintenance_requests"("id", "property_id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "maintenance_settings" ADD CONSTRAINT "maintenance_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "maintenance_settings" ADD CONSTRAINT "maintenance_settings_property_id_organization_id_fkey" FOREIGN KEY ("property_id", "organization_id") REFERENCES "properties"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------
-- Hand-written from here down (RANZ-33 slice 2, docs/features/maintenance)
-- ---------------------------------------------------------------------------

-- A request takes its room out of order, and the room comes back when the last
-- request holding it lets go (ADR 0032, MT-S2-*).
--
-- ON THE NUMBER. 004400, after 004300 in the same change.

-- ---------------------------------------------------------------------------
-- The permission
-- ---------------------------------------------------------------------------

-- Taking a Unit out of order and returning it. Its own permission, because the
-- people who find an unsafe room are on the floor and at the desk, and they
-- must not thereby be able to block rooms, nor the reverse (ADR 0032). Owner,
-- manager, front desk and housekeeping by default (MT-S1-28); an Organization
-- takes it from any role it likes.
insert into public.staff_permissions (key, module_key)
values ('maintenance.take_out_of_order', 'maintenance');

update public.staff_roles
   set permissions = array_append(permissions, 'maintenance.take_out_of_order'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager', 'front_desk', 'housekeeping')
   and not ('maintenance.take_out_of_order' = any (permissions));

-- ---------------------------------------------------------------------------
-- A request's hold on its Unit
-- ---------------------------------------------------------------------------

alter table public.maintenance_unit_holds
  -- Released is all three or none: when, by whom, and as what.
  add constraint maintenance_unit_holds_returned_pairing
    check ((returned_at is null) = (returned_by is null)
           and (returned_at is null) = (returned_as is null)),
  add constraint maintenance_unit_holds_returned_as_check
    check (returned_as is null or returned_as in ('dirty', 'clean', 'inspected')),
  add constraint maintenance_unit_holds_returned_after_taken
    check (returned_at is null or returned_at >= since);

comment on table public.maintenance_unit_holds is
  'Whether a maintenance request holds its Unit out of order (ADR 0032): held '
  'while returned_at is null. The Unit is out_of_service exactly while one of '
  'its requests holds it; the command that writes a hold writes the status in '
  'the same transaction, with the Unit row locked.';

alter table public.maintenance_unit_holds enable row level security;
alter table public.maintenance_unit_holds force row level security;

create policy maintenance_unit_holds_read_accessible_property
  on public.maintenance_unit_holds for select
  using (property_id in (select app.accessible_property_ids()));

grant select on public.maintenance_unit_holds to ranza_app;

-- Five gates. The capability is maintenance's; the permission is the one that
-- takes a room out of order and returns it (MT-S2-03).
create policy maintenance_unit_holds_insert_take_out_of_order
  on public.maintenance_unit_holds for insert
  with check (
    app.can_use_capability(property_id, 'maintenance', 'maintenance')
    and app.has_organization_permission(organization_id, 'maintenance.take_out_of_order')
  );

create policy maintenance_unit_holds_update_take_out_of_order
  on public.maintenance_unit_holds for update
  using (
    app.can_use_capability(property_id, 'maintenance', 'maintenance')
    and app.has_organization_permission(organization_id, 'maintenance.take_out_of_order')
  )
  with check (
    app.can_use_capability(property_id, 'maintenance', 'maintenance')
    and app.has_organization_permission(organization_id, 'maintenance.take_out_of_order')
  );

-- No delete: a released hold is a row with returned_at, and the audit record
-- keeps every take and return. Who took and returned it, when, and what the
-- room came back as are the trigger's; a caller says only which request, the
-- expected-back date, and whether it is being returned (returned_at, whose
-- value the trigger replaces with the time it happens).
grant insert (request_id, organization_id, property_id, expected_back_on)
  on public.maintenance_unit_holds to ranza_app;

grant update (expected_back_on, returned_at)
  on public.maintenance_unit_holds to ranza_app;

-- Who and when, and what a hold may be taken on.
--
-- Taking or taking again stamps since and taken_by and clears the return;
-- returning stamps returned_at and returned_by with now and the acting Staff
-- Member, whatever the caller put there, and returned_as with what the
-- Property's Maintenance setting says at that moment (MT-S2-17). returned_as
-- is in no grant: it is what the worker later writes to housekeeping status,
-- and a caller who could name it could mark a room inspected without
-- housekeeping.update_status.
--
-- A hold is taken only on a request that names a Unit and is neither done nor
-- cancelled (MT-S2-02), and an expected-back date is not before the Property's
-- today (MT-S2-13). An invoker: the acting Staff Member reaches the request, or
-- the policy refuses the write anyway.
--
-- Taking and cancelling serialise on the request through one transaction-scoped
-- advisory lock, and each reads the other only after taking it. Without that a
-- cancel and a take at the same moment each see the other's row as it was, and
-- a cancelled request ends up holding its room (MT-S2-16). A row lock on the
-- request would do the same and cannot be taken here: FOR SHARE applies the
-- request's update policy, which a front desk taking a room out does not pass.
create function app.maintenance_hold_is_stamped()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  acting uuid := app.current_user_id();
  request_status text;
  request_unit uuid;
  taking boolean;
begin
  if acting is null then
    raise exception 'taking a Unit out of order requires an acting Staff Member'
      using errcode = '42501';
  end if;

  taking := tg_op = 'INSERT'
    or (old.returned_at is not null and new.returned_at is null);

  if taking then
    perform pg_advisory_xact_lock(
      hashtextextended('maintenance_request:' || new.request_id::text, 0));

    select request.status, request.accommodation_unit_id
      into request_status, request_unit
      from public.maintenance_requests as request
     where request.id = new.request_id;

    if request_unit is null or request_status in ('done', 'cancelled') then
      raise exception using
        errcode = '55000',
        message = 'only an open request about a Unit takes it out of order';
    end if;

    new.since := now();
    new.taken_by := acting;
    new.returned_at := null;
    new.returned_by := null;
    new.returned_as := null;
  elsif old.returned_at is null and new.returned_at is not null then
    new.returned_at := now();
    new.returned_by := acting;
    new.returned_as := coalesce(
      (select setting.return_as
         from public.maintenance_settings as setting
        where setting.property_id = new.property_id),
      (select setting.return_as
         from public.maintenance_settings as setting
        where setting.organization_id = new.organization_id
          and setting.property_id is null),
      'dirty');
  else
    new.returned_at := old.returned_at;
    new.returned_by := old.returned_by;
    new.returned_as := old.returned_as;
  end if;

  if new.expected_back_on is not null
     and new.returned_at is null
     and new.expected_back_on is distinct from (case when tg_op = 'UPDATE' then old.expected_back_on end)
     and new.expected_back_on < app.property_today(new.property_id) then
    raise exception using
      errcode = '23514',
      message = 'the expected-back date is before today';
  end if;

  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger maintenance_unit_holds_stamped
  before insert or update on public.maintenance_unit_holds
  for each row execute function app.maintenance_hold_is_stamped();

-- MT-S2-16: a cancelled request never holds. The command releases the hold and
-- then cancels, in one transaction; a cancel that skipped the release is
-- refused here rather than leaving a room out of order behind a request
-- nobody will look at again. The advisory lock is the one a take holds, so a
-- take and a cancel at the same moment go one after the other.
create function app.maintenance_request_releases_before_cancelling()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    perform pg_advisory_xact_lock(
      hashtextextended('maintenance_request:' || new.id::text, 0));

    if exists (
      select 1 from public.maintenance_unit_holds as hold
       where hold.request_id = new.id
         and hold.returned_at is null
    ) then
      raise exception using
        errcode = '55000',
        message = 'a request that holds its Unit is released before it is cancelled';
    end if;
  end if;
  return new;
end;
$$;

create trigger maintenance_requests_release_before_cancelling
  before update of status on public.maintenance_requests
  for each row execute function app.maintenance_request_releases_before_cancelling();

-- ---------------------------------------------------------------------------
-- Which permission writes which Unit status
-- ---------------------------------------------------------------------------

-- The second way in. accommodation_units_update_configure admits a Staff
-- Member with accommodation.configure; this admits one with
-- maintenance.take_out_of_order at a Property with maintenance. Permissive
-- policies are OR-ed, so on its own this would let either do the other's work
-- (ADR 0029, ADR 0032).
create policy accommodation_units_update_out_of_order
  on public.accommodation_units for update
  using (
    app.can_use_capability(property_id, 'maintenance', 'maintenance')
    and app.has_organization_permission(organization_id, 'maintenance.take_out_of_order')
  )
  with check (
    app.can_use_capability(property_id, 'maintenance', 'maintenance')
    and app.has_organization_permission(organization_id, 'maintenance.take_out_of_order')
  );

-- And the narrowing that stops it (MT-S2-04). Restrictive, so it is AND-ed
-- with whichever permissive policy admitted the update, and the first in this
-- repository. USING reads the row as it was, WITH CHECK the row as it
-- becomes: leaving a value and entering it are both bounded by the value's own
-- permission, at a Property with that value's own capability. Nothing writes
-- occupied (RB-S1-04), so nothing may: an unnamed value is refused.
create policy accommodation_units_status_by_permission
  on public.accommodation_units
  as restrictive
  for update
  using (
    case status
      when 'blocked' then
        app.can_use_capability(property_id, 'front_office', 'front_desk')
        and app.has_organization_permission(organization_id, 'accommodation.configure')
      when 'out_of_service' then
        app.can_use_capability(property_id, 'maintenance', 'maintenance')
        and app.has_organization_permission(organization_id, 'maintenance.take_out_of_order')
      else true
    end
  )
  with check (
    case status
      when 'available' then true
      when 'blocked' then
        app.can_use_capability(property_id, 'front_office', 'front_desk')
        and app.has_organization_permission(organization_id, 'accommodation.configure')
      when 'out_of_service' then
        app.can_use_capability(property_id, 'maintenance', 'maintenance')
        and app.has_organization_permission(organization_id, 'maintenance.take_out_of_order')
      else false
    end
  );

-- A policy sees one row at a time, so the move straight between the two is a
-- trigger's (MT-S2-08). Each is entered from available: a blocked Unit is
-- already unsellable, and blocking one out of order would hide the fault.
create function app.unit_is_blocked_or_out_of_order_from_available()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (old.status = 'blocked' and new.status = 'out_of_service')
     or (old.status = 'out_of_service' and new.status = 'blocked') then
    raise exception using
      errcode = '55000',
      message = 'a Unit is blocked or taken out of order from available';
  end if;
  return new;
end;
$$;

create trigger accommodation_units_blocked_or_out_of_order_from_available
  before update of status on public.accommodation_units
  for each row execute function app.unit_is_blocked_or_out_of_order_from_available();

-- ---------------------------------------------------------------------------
-- A room out of order covers its beds
-- ---------------------------------------------------------------------------

-- MT-S2-06, MT-DIFF-02. The same function and signature as 20260916002900's, so
-- the trigger on stays follows without being recreated; it now reads the room
-- above a bed as well as the bed. A bed's own status is not rewritten, so a bed
-- blocked for its own reason stays blocked after its room comes back.
--
-- Both rows are locked FOR SHARE, the bed and then its room, so a check-in and
-- the room being taken out of order wait for each other rather than each
-- deciding on what the other has not committed (RB-S3-07's reason, for the
-- room). Two statements: FOR SHARE cannot lock the nullable side of an outer
-- join. Nothing locks a room and then one of its beds, so the order cannot
-- cycle.
create or replace function app.unit_is_in_service()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  unit_status text;
  room_id uuid;
  room_status text;
begin
  if new.status <> 'in_house' then
    return new;
  end if;

  select unit.status, unit.parent_id
    into unit_status, room_id
    from public.accommodation_units as unit
   where unit.id = new.accommodation_unit_id
     for share;

  if room_id is not null then
    select room.status
      into room_status
      from public.accommodation_units as room
     where room.id = room_id
       for share;
  end if;

  if unit_status in ('blocked', 'out_of_service')
     or room_status in ('blocked', 'out_of_service') then
    raise exception using
      errcode = '55000',
      message = 'that Accommodation Unit is not in service';
  end if;

  return new;
end;
$$;

comment on function app.unit_is_in_service() is
  'Refuses a Stay in house on a blocked or out-of-service Unit, or on a bed in '
  'a room that is, for every role (RB-S3-06, MT-S2-06).';

-- ---------------------------------------------------------------------------
-- The Maintenance setting
-- ---------------------------------------------------------------------------

-- Shaped like housekeeping_settings (20260916003200): one Organization default
-- (MT-S2-26), at most one override per Property, null meaning "use the
-- default". The product's own defaults, when neither says anything, are no
-- assignee required, return on done, and return dirty (MT-S2-22).
alter table public.maintenance_settings
  add constraint maintenance_settings_return_as_check
    check (return_as is null or return_as in ('dirty', 'clean', 'inspected')),
  add constraint maintenance_settings_says_something
    check (
      property_id is not null
      or assignee_required is not null
      or return_on_done is not null
      or return_as is not null
    );

comment on table public.maintenance_settings is
  'How maintenance works at a Property: an Organization default (no '
  'property_id) and Property overrides (null value = use the default).';

alter table public.maintenance_settings enable row level security;
alter table public.maintenance_settings force row level security;

-- Anybody in the Organization reads it: the board shows a Property what it
-- inherits, and the move that returns a room reads it.
create policy maintenance_settings_read_own_organization
  on public.maintenance_settings for select
  using (organization_id in (select app.accessible_organization_ids()));

grant select on public.maintenance_settings to ranza_app;

-- maintenance.manage, the permission that works the board, decides how the
-- board works. The default governs Properties the caller may not reach, so it
-- takes Organization-wide reach; an override takes reach to its Property
-- (MT-S2-23).
create policy maintenance_settings_insert_manage
  on public.maintenance_settings for insert
  with check (
    app.has_organization_permission(organization_id, 'maintenance.manage')
    and case
      when property_id is null then
        app.can_use_capability_in_organization(
          organization_id, 'maintenance', 'maintenance')
        and app.has_organization_wide_reach(organization_id)
      else
        app.can_use_capability(property_id, 'maintenance', 'maintenance')
    end
  );

create policy maintenance_settings_update_manage
  on public.maintenance_settings for update
  using (
    app.has_organization_permission(organization_id, 'maintenance.manage')
    and case
      when property_id is null then
        app.can_use_capability_in_organization(
          organization_id, 'maintenance', 'maintenance')
        and app.has_organization_wide_reach(organization_id)
      else
        app.can_use_capability(property_id, 'maintenance', 'maintenance')
    end
  )
  with check (
    app.has_organization_permission(organization_id, 'maintenance.manage')
    and case
      when property_id is null then
        app.can_use_capability_in_organization(
          organization_id, 'maintenance', 'maintenance')
        and app.has_organization_wide_reach(organization_id)
      else
        app.can_use_capability(property_id, 'maintenance', 'maintenance')
    end
  );

-- No delete: a reset clears a value, and the audit record keeps what it was.
grant insert (organization_id, property_id, assignee_required, return_on_done, return_as)
  on public.maintenance_settings to ranza_app;

grant update (assignee_required, return_on_done, return_as)
  on public.maintenance_settings to ranza_app;

create function app.maintenance_setting_is_stamped()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger maintenance_settings_stamped
  before insert or update on public.maintenance_settings
  for each row execute function app.maintenance_setting_is_stamped();

-- MT-S2-25: work does not start on a request nobody is assigned to, where the
-- setting says so. Unassigning a request already under way is the same state
-- reached the other way, so it is refused too. An invoker: the settings are
-- readable to everyone in the Organization, and the acting Staff Member is.
create function app.maintenance_work_starts_with_an_assignee()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status not in ('in_progress', 'waiting_for_parts')
     or new.assignee_id is not null then
    return new;
  end if;

  if coalesce(
       (select setting.assignee_required
          from public.maintenance_settings as setting
         where setting.property_id = new.property_id),
       (select setting.assignee_required
          from public.maintenance_settings as setting
         where setting.organization_id = new.organization_id
           and setting.property_id is null),
       false) then
    raise exception using
      errcode = '23514',
      message = 'work on a request starts with somebody assigned to it';
  end if;

  return new;
end;
$$;

create trigger maintenance_requests_work_starts_with_an_assignee
  before update of status, assignee_id on public.maintenance_requests
  for each row execute function app.maintenance_work_starts_with_an_assignee();

-- ---------------------------------------------------------------------------
-- A returned room comes back dirty, clean or inspected: one function, no grant
-- ---------------------------------------------------------------------------

-- The handler of unit.returned_to_service in apps/worker is this call and
-- nothing else, the shape of app.mark_unit_dirty_after_check_out
-- (20260916003000).
--
-- The event carries ids and nothing it would be dangerous to believe. Any
-- Staff Member may publish an event for their own Organization, so a payload
-- naming a status would let one mark a room inspected without
-- housekeeping.update_status. What the room comes back as is read from the
-- hold, where the release trigger stamped it, and only for a hold released at
-- the very moment the event says: returned_at and occurred_at are both now() in
-- the releasing transaction. A forged event names no such hold, and a stale
-- one — the room taken out again since — finds the release cleared.
--
-- In order: no worker context is refused, an event of another Organization is
-- refused (MT-S2-19); an event that is not a return, or that no release
-- matches, writes nothing; a Property without housekeeping writes nothing; a
-- status changed after the return is kept, which is also what makes a
-- redelivery harmless (MT-S2-17, MT-S2-18). The room holds the status for its
-- beds (ADR 0029), so a bed's return marks its room.
--
-- A room comes back no better than it was: the worse of its status and the
-- setting's (MT-S2-30). Fixing a sink does not clean a room, and without this
-- anybody who may take a room out of order could take a dirty one out and
-- return it at once to have it read inspected. A room with no row is clean.
create function app.mark_unit_returned_to_service(target_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_organization uuid := app.worker_organization_id();
  event_organization uuid;
  event_kind text;
  return_moment timestamptz;
  returned_request uuid;
  return_status text;
  holder uuid;
  holder_property uuid;
  written integer;
begin
  if acting_organization is null then
    raise exception 'returning a room requires a worker context'
      using errcode = '42501';
  end if;

  select event.organization_id, event.event_type, event.occurred_at,
         (event.payload ->> 'requestId')::uuid
    into event_organization, event_kind, return_moment, returned_request
    from outbox.events as event
   where event.id = target_event_id;

  if not found then
    return false;
  end if;

  if event_organization <> acting_organization then
    raise exception 'that event belongs to another Organization'
      using errcode = '42501';
  end if;

  if event_kind <> 'unit.returned_to_service' or returned_request is null then
    return false;
  end if;

  select coalesce(unit.parent_id, unit.id), unit.property_id, hold.returned_as
    into holder, holder_property, return_status
    from public.maintenance_unit_holds as hold
    join public.maintenance_requests as request
      on request.id = hold.request_id
    join public.accommodation_units as unit
      on unit.id = request.accommodation_unit_id
   where hold.request_id = returned_request
     and hold.organization_id = acting_organization
     and hold.returned_at = return_moment;

  if not found then
    return false;
  end if;

  if not app.capability_is_available(holder_property, 'housekeeping', 'housekeeping') then
    return false;
  end if;

  insert into public.housekeeping_unit_status
    (accommodation_unit_id, property_id, organization_id, status)
  values (holder, holder_property, acting_organization,
          case when return_status = 'inspected' then 'clean' else return_status end)
  on conflict (accommodation_unit_id) do update
     set status = case
           when 'dirty' in (public.housekeeping_unit_status.status, excluded.status)
             then 'dirty'
           when 'clean' in (public.housekeeping_unit_status.status, excluded.status)
             then 'clean'
           else 'inspected'
         end
   where public.housekeeping_unit_status.status_changed_at < return_moment;

  get diagnostics written = row_count;
  return written > 0;
end;
$$;

comment on function app.mark_unit_returned_to_service(uuid) is
  'Gives a room returned to service the housekeeping status its release '
  'recorded, unless its status changed since. The whole of what ranza_worker '
  'may do for a return (ADR 0032).';

revoke execute on function app.mark_unit_returned_to_service(uuid) from public;
grant execute on function app.mark_unit_returned_to_service(uuid) to ranza_worker;
