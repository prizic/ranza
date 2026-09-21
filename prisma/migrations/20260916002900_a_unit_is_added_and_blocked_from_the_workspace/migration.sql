-- AlterTable
ALTER TABLE "accommodation_units" ADD COLUMN     "status_reason" TEXT;

-- ---------------------------------------------------------------------------
-- Hand-written from here down (RANZ-27, docs/features/rooms-and-beds)
-- ---------------------------------------------------------------------------

-- Rooms and beds are added and blocked from the Workspace. Until now nothing
-- under packages/ wrote an Accommodation Unit: every one came from a seed or a
-- test fixture, as the owner. That was honest while there was no screen — an
-- absent policy denies, and the absence was the decision (ADR 0012). This is
-- the screen arriving, so the policy arrives with it, carrying all five gates
-- from the start (ADR 0012 as amended by ADR 0026).
--
-- ON THE NUMBER. 002900, the next after main's last. feat/audit-log (#51) adds
-- no migration, and no other branch in flight does either.

-- ---------------------------------------------------------------------------
-- Blocked, and the reason it is
-- ---------------------------------------------------------------------------

-- `blocked` is one of blueprint 18.2's six states — available, occupied,
-- dirty, inspected, blocked, out of order — and it is added on its own rather
-- than with the other three because it is the one this slice has a command
-- for. The housekeeping lifecycle (RANZ-28) replaces this constraint with the
-- whole set; a bed blocked here and a bed blocked there are then one state,
-- which is the reason not to have reused `out_of_service` for it: that would
-- have left the later slice unable to tell a blocked bed from an out-of-order
-- room.
--
-- `occupied` stays in the list and nothing writes it. Occupancy is a fact
-- about Stays, and the Rooms screen reads it that way (RB-S1-04).
alter table public.accommodation_units
  drop constraint accommodation_units_status_check,
  add constraint accommodation_units_status_check
    check (status in ('available', 'occupied', 'out_of_service', 'blocked')),
  -- A blocked Unit says why, and an available one has nothing to say. Both
  -- directions, so a reason cannot linger after an unblock and read as
  -- current (RB-S3-02, RB-S3-08).
  add constraint accommodation_units_blocked_has_a_reason
    check ((status = 'blocked') = (status_reason is not null)),
  add constraint accommodation_units_status_reason_check
    check (status_reason is null
           or char_length(btrim(status_reason)) between 3 and 200);

comment on column public.accommodation_units.status_reason is
  'Why the Unit is blocked, in the words of whoever blocked it. Present exactly '
  'when status is blocked; the audit record keeps the history of it.';

-- ---------------------------------------------------------------------------
-- The permission
-- ---------------------------------------------------------------------------

-- Named for the command a person would recognise (20260916002300): adding
-- rooms and blocking a bed are configuring the Property's accommodation, and
-- nobody administering staff thinks of them as two things. `front_office` is
-- the Entitlement it lives under because the screen is gated by the front
-- desk's capability — blueprint 5.2 is its own module on paper and not yet a
-- module key anybody is entitled to, and inventing one here would be a key no
-- Organization holds for a screen every one of them needs.
insert into public.staff_permissions (key, module_key)
values ('accommodation.configure', 'front_office');

-- Owner and manager. Not front desk: taking a booking is the desk's job and
-- deciding what there is to book is not. The trigger that keeps a role's
-- permissions inside the catalogue fires here too, which is why the insert
-- above comes first.
update public.staff_roles
   set permissions = array_append(permissions, 'accommodation.configure'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager')
   and not ('accommodation.configure' = any (permissions));

-- ---------------------------------------------------------------------------
-- The policies: five gates, from the first write
-- ---------------------------------------------------------------------------

-- Subscription, Entitlement, Property capability and reach are inside
-- app.can_use_capability; the permission is the fifth conjunct. The
-- capability is the front desk's, because that is the screen this is done
-- from and hiding a Property's rooms from a desk that can book them would be
-- a strange kind of honesty.
create policy accommodation_units_insert_configure
  on public.accommodation_units for insert
  with check (
    app.can_use_capability(property_id, 'front_office', 'front_desk')
    and app.has_organization_permission(organization_id, 'accommodation.configure')
  );

create policy accommodation_units_update_configure
  on public.accommodation_units for update
  using (
    app.can_use_capability(property_id, 'front_office', 'front_desk')
    and app.has_organization_permission(organization_id, 'accommodation.configure')
  )
  with check (
    app.can_use_capability(property_id, 'front_office', 'front_desk')
    and app.has_organization_permission(organization_id, 'accommodation.configure')
  );

-- No delete policy and no delete grant. A Unit is named by Stays, by
-- Reservations, by Folios through those Stays and by audit records through
-- all three; one added by mistake is blocked with a reason and stays
-- (RB-S3-12). Removing a Unit nothing has ever named is a later command.

-- ---------------------------------------------------------------------------
-- The grants: a column list, never the table (20260916002150)
-- ---------------------------------------------------------------------------

-- Every column below is read off the statement in @ranza/accommodation that
-- writes it. `status`, `status_reason`, `id` and `created_at` are withheld on
-- INSERT: a Unit is born available with nothing to say, and blocking it is a
-- command with its own trigger, which INSERT must not be a second way around
-- (RB-S2-10).
grant insert (organization_id, property_id, name, unit_type, capacity,
              building, floor, parent_id, parent_unit_type)
  on public.accommodation_units to ranza_app;

-- A policy bounds rows; a grant bounds columns. The update policy above would
-- let a Staff Member rename a room, move it to another floor, re-parent a bed
-- or grow a capacity underneath somebody — the row is the same Organization
-- before and after. These three columns are what a block and an unblock
-- write, and they are the whole of what an update may touch (RB-S3-10).
grant update (status, status_reason, updated_at)
  on public.accommodation_units to ranza_app;

-- ---------------------------------------------------------------------------
-- A Unit somebody is in, or one let by the bed, cannot be blocked
-- ---------------------------------------------------------------------------

-- Both halves are cross-row, so neither is a check constraint. A trigger for
-- the same reason app.unit_is_sellable() is one: the rule has to bind every
-- role rather than only the one this product uses. security definer, so the
-- Stays it consults are all of them and not the ones the caller's policies
-- let through — a Staff Member who cannot read a Stay must still be refused
-- the bed it is in.
--
-- The first refusal: let by the bed, so the room is not sellable and its beds
-- are what a block means; out of order for a whole room is the housekeeping
-- lifecycle's (RB-S3-04). The second: the person in it is not going anywhere
-- because of a status (RB-S3-03). A confirmed Reservation arriving later is
-- allowed to stand — nothing in the product can move it yet — and what the
-- block does to it is refuse the check-in (RB-S3-05, RB-S3-06).
--
-- `old.status = 'blocked'` returns early so a block that is re-stated (the
-- same status with a different reason, or a retried request) is not refused
-- by a Guest who arrived in between: the bed was already blocked when they
-- did, which is the case the trigger on stays exists for.
--
-- No prose inside the body. tests/database/insert_grants.test.sql reads every
-- app definer's source for the words a write would use, and a comment saying
-- "update" would count as one.
create function app.unit_can_be_blocked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'blocked' or old.status = 'blocked' then
    return new;
  end if;

  if exists (
    select 1
    from public.accommodation_units as child
    where child.parent_id = new.id
  ) then
    raise exception using
      errcode = '55000',
      message = 'that Accommodation Unit is let by the bed; block the bed';
  end if;

  if exists (
    select 1
    from public.stays as stay
    where stay.accommodation_unit_id = new.id
      and stay.status = 'in_house'
  ) then
    raise exception using
      errcode = '55000',
      message = 'somebody is in that Accommodation Unit';
  end if;

  return new;
end;
$$;

comment on function app.unit_can_be_blocked() is
  'Refuses blocking a Unit that has beds under it or a Stay in house (RB-S3-03, RB-S3-04).';

create trigger accommodation_units_can_be_blocked
  before update of status on public.accommodation_units
  for each row execute function app.unit_can_be_blocked();

-- ---------------------------------------------------------------------------
-- A Stay in house cannot begin on a Unit that is not in service
-- ---------------------------------------------------------------------------

-- The other direction, without which a block is a word on a screen: the
-- booking form stops offering a blocked bed (RB-S3-13), but a Reservation
-- taken before the block still arrives, and check-in would happily open a
-- Stay on it. This refuses that for every role (RB-S3-06).
--
-- `for share` is what makes the two triggers agree under contention
-- (RB-S3-07). PostgreSQL locks the target tuple before a BEFORE ROW trigger
-- on an UPDATE fires, so a block in flight holds the Unit's row exclusively;
-- this share lock conflicts with that, waits for the block to commit or roll
-- back, and — the function being volatile, as a trigger function must be here
-- — reads the status it left in a fresh snapshot. In the other order this
-- share lock is what the block's UPDATE waits on, and by the time its trigger
-- runs the Stay it must refuse for is committed and visible.
--
-- `for share` and not `for key share`. The foreign key from stays to
-- accommodation_units already takes a key-share lock on the Unit, and a
-- non-key UPDATE — which is what a status change is — does not conflict with
-- one. Relying on the foreign key would be a lock that never waits, and a
-- blocked bed would end up with somebody in it.
--
-- A raw caller without front_desk.check_in learns from this trigger that a
-- Unit is blocked (55000) before the policy tells them they may not check in
-- (42501): a BEFORE trigger runs before WITH CHECK. Accepted — the module
-- cannot reach this insert without first passing the policy-bounded update
-- of the Reservation, and the Unit's status is not a secret from anybody who
-- reaches the Property.
create function app.unit_is_in_service()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  unit_status text;
begin
  if new.status <> 'in_house' then
    return new;
  end if;

  select unit.status into unit_status
  from public.accommodation_units as unit
  where unit.id = new.accommodation_unit_id
  for share;

  if unit_status in ('blocked', 'out_of_service') then
    raise exception using
      errcode = '55000',
      message = 'that Accommodation Unit is not in service';
  end if;

  return new;
end;
$$;

comment on function app.unit_is_in_service() is
  'Refuses a Stay in house on a blocked or out-of-service Unit, for every role (RB-S3-06).';

-- `accommodation_unit_id` as well as `status`: a transfer is refused by a
-- column grant today, and the day it is allowed this rule must already be
-- standing on that door too (20260916001300 states check-in's rule on both
-- write paths for the same reason).
create trigger stays_unit_is_in_service
  before insert or update of status, accommodation_unit_id on public.stays
  for each row execute function app.unit_is_in_service();
