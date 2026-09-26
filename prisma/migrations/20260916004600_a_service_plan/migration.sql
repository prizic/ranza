-- AlterTable
ALTER TABLE "maintenance_requests" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'fault';

-- ---------------------------------------------------------------------------
-- Hand-written from here down (RANZ-33 slice 4, docs/features/maintenance)
-- ---------------------------------------------------------------------------

-- A service plan raises work orders (MT-S4-*). A work order is a request whose
-- kind is `service`: it is worked on the same board, and moving it to done
-- records the service on its item, in the same statement, from a trigger.
--
-- ON THE NUMBER. 004600, after 004500 in the same change.

alter table public.maintenance_requests
  add constraint maintenance_requests_kind_check
    check (kind in ('fault', 'service')),
  -- A service is of something.
  add constraint maintenance_requests_service_is_of_equipment
    check (kind = 'fault' or equipment_id is not null);

-- MT-S4-03: one open work order per item. Partial, so done and cancelled work
-- orders are history and the next one may be raised.
create unique index maintenance_requests_one_open_work_order
  on public.maintenance_requests (equipment_id)
  where kind = 'service' and status not in ('done', 'cancelled');

grant insert (kind) on public.maintenance_requests to ranza_app;

-- MT-S4-04: done records the service. The write is the database's rather than
-- the module's because the two permissions are separate on purpose: working
-- the board is maintenance.manage, keeping the register is
-- maintenance.equipment, and an Organization may give them to different
-- people. Written under the register's own policy, a technician who may finish
-- a work order but not edit the register had the whole move to done refused.
--
-- A definer, so the write reaches a row the register's policy would hide from
-- that technician, and only this column of it, only on this transition. The
-- status change it follows was already bound by the request's own update
-- policy; the definer asks the same question again itself before it writes
-- (IG-12). No acting Staff Member means a role that bypasses the policies —
-- the owner, in a migration or a fixture — and it records the service too.
create function app.maintenance_service_is_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.current_user_id() is not null
     and not app.has_organization_permission(
       new.organization_id, 'maintenance.manage') then
    raise exception 'finishing a work order requires maintenance.manage'
      using errcode = '42501';
  end if;

  update public.maintenance_equipment
     set last_serviced_on = app.property_today(property_id)
   where id = new.equipment_id
     and property_id = new.property_id
     and organization_id = new.organization_id;
  return null;
end;
$$;

revoke execute on function app.maintenance_service_is_recorded() from public;

create trigger maintenance_requests_record_the_service
  after update of status on public.maintenance_requests
  for each row
  when (new.kind = 'service'
        and new.status = 'done'
        and old.status is distinct from 'done')
  execute function app.maintenance_service_is_recorded();
