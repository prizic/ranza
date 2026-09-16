-- Preserve the service-only credential boundary all the way through the private
-- helpers, and expose Student home context through one identity-checked wrapper.

revoke all on function private.issue_student_activation(uuid, text)
from public, anon, authenticated, service_role;
revoke all on function private.recover_student_credential(uuid, text)
from public, anon, authenticated, service_role;

create or replace function public.student_home_context()
returns table (
  student_id uuid,
  display_name text,
  access_id text,
  preferred_locale text,
  operator_id uuid,
  branch_id uuid,
  branch_name text,
  branch_timezone text
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.student_home_context();
$$;

revoke all on function public.student_home_context()
from public, anon;
grant execute on function public.student_home_context()
to authenticated;
