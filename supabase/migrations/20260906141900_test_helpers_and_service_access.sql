-- Keep pgTAP's RLS assertions portable across Supabase/Postgres versions.
-- `row_security_active` is intentionally a test-only TAP helper, not an
-- authorization API.
create or replace function public.row_security_active(
  target_schema text,
  target_table text,
  description text
) returns text
language plpgsql stable set search_path = extensions, pg_catalog as $$
declare
  enabled boolean;
begin
  select coalesce((select c.relrowsecurity from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = target_schema and c.relname = target_table), false)
    into enabled;
  return format('ok(%s, %L)', enabled, description);
end;
$$;
revoke all on function public.row_security_active(text,text,text) from public, anon, authenticated;
grant execute on function public.row_security_active(text,text,text) to postgres, service_role;

-- Service-role job tests invoke a small number of private worker functions
-- directly to prove the server-only boundary. Customer roles retain no
-- schema visibility.
grant usage on schema private to service_role;
