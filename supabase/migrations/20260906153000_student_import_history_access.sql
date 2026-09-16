-- A view expression is privilege-checked as its caller. Wrap the current actor
-- check without accepting a caller-supplied identity, so import history remains
-- usable without exposing the general authorization predicate.

create function private.current_actor_can_manage_roster(
  target_operator_id uuid,
  target_branch_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.actor_can_manage_roster(
    auth.uid(),
    target_operator_id,
    target_branch_id
  );
$$;

revoke all on function private.current_actor_can_manage_roster(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function private.current_actor_can_manage_roster(uuid, uuid)
to authenticated;

create or replace view public.student_import_runs
with (security_invoker = false)
as
select
  batch.id,
  batch.operator_id,
  batch.branch_id,
  batch.import_key,
  batch.status,
  batch.row_count,
  batch.valid_count,
  batch.error_count,
  batch.imported_count,
  batch.created_by,
  batch.created_at,
  batch.completed_at,
  batch.error_reference
from private.roster_imports batch
where private.current_actor_can_manage_roster(
  batch.operator_id,
  batch.branch_id
);

revoke all on public.student_import_runs from public, anon;
grant select on public.student_import_runs to authenticated;
