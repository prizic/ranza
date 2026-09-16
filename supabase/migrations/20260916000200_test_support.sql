-- Test support only. pgTAP is required by supabase/tests and is intentionally
-- kept out of the foundation migration so the schema itself carries no test
-- dependency.
create extension if not exists pgtap with schema extensions;
