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
