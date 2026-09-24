-- A room is marked dirty, clean or inspected from the Workspace (RANZ-28,
-- docs/features/housekeeping). Hand-written throughout: nothing here changes a
-- table's shape, so Prisma has nothing to generate.
--
-- ON THE NUMBER. 003100, after 003000 in the same change.
--
-- 20260916003000 made the table and left it without a write policy, because a
-- departure writes through one function and no Staff Member had a command. This
-- is the command, so the policy arrives with it, carrying all five gates from
-- the start (ADR 0012 as amended by ADR 0026).

-- ---------------------------------------------------------------------------
-- The permission
-- ---------------------------------------------------------------------------

-- Its own permission rather than accommodation.configure. Housekeepers mostly do
-- not use the app: whoever hears "204 is done" records it, usually the front
-- desk, and a desk that may mark a room clean must not thereby be able to add
-- rooms or block them (ADR 0029).
insert into public.staff_permissions (key, module_key)
values ('housekeeping.update_status', 'housekeeping');

-- Owner, manager, front desk and housekeeping. Not finance. The housekeeping
-- role gains its first command here, which 20260916002300 said room status
-- would give it. The catalogue trigger fires on this update, which is why the
-- insert above comes first.
update public.staff_roles
   set permissions = array_append(permissions, 'housekeeping.update_status'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager', 'front_desk', 'housekeeping')
   and not ('housekeeping.update_status' = any (permissions));

-- ---------------------------------------------------------------------------
-- The policies: five gates
-- ---------------------------------------------------------------------------

-- Subscription, Entitlement, Property capability and reach are inside
-- app.can_use_capability; the permission is the fifth conjunct. The capability
-- is housekeeping's own: a Property that never bought housekeeping has no board
-- to mark from, and a departure there marks nothing either (HK-S1-09).
--
-- An upsert needs both: the insert policy for a room with no row yet, and the
-- update policy — USING and WITH CHECK — for one that has a row.
create policy housekeeping_unit_status_insert_update_status
  on public.housekeeping_unit_status for insert
  with check (
    app.can_use_capability(property_id, 'housekeeping', 'housekeeping')
    and app.has_organization_permission(organization_id, 'housekeeping.update_status')
  );

create policy housekeeping_unit_status_update_update_status
  on public.housekeeping_unit_status for update
  using (
    app.can_use_capability(property_id, 'housekeeping', 'housekeeping')
    and app.has_organization_permission(organization_id, 'housekeeping.update_status')
  )
  with check (
    app.can_use_capability(property_id, 'housekeeping', 'housekeeping')
    and app.has_organization_permission(organization_id, 'housekeeping.update_status')
  );

-- No delete policy and no delete grant. A status is changed, never removed; the
-- audit record keeps what it was.

-- ---------------------------------------------------------------------------
-- The grants: a column list, never the table (20260916002150)
-- ---------------------------------------------------------------------------

-- A policy bounds rows; a grant bounds columns. status_changed_at,
-- status_changed_by, created_at and updated_at are withheld on both, because the
-- stamping trigger writes them and a caller naming them would be claiming who
-- acted and when (HK-S2-09). There is no transition rule: any status may follow
-- any other, because a correction is one tap with no reason, and inspected is
-- allowed whether or not inspection is switched on, because switching it must
-- never rewrite or strand a stored status.
grant insert (accommodation_unit_id, property_id, organization_id, status)
  on public.housekeeping_unit_status to ranza_app;

grant update (status)
  on public.housekeeping_unit_status to ranza_app;
