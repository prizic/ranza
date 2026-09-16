-- Install the append-only trigger that 20260916000300_platform_audit describes
-- but never delivered to every database.
--
-- That migration was edited after it had already been applied to the hosted
-- database. The checksum recorded there is 9de6321b…; the file is now
-- 9081d8e4…. `prisma migrate deploy` neither re-runs an applied migration nor
-- refuses one whose contents have changed, so it reported success and moved on.
--
-- The result was silent and exactly the wrong shape: the guarantee held in the
-- repository, in tests/database/platform_audit.test.sql, and in every database
-- built from scratch — and did not hold in production. audit.records was
-- rewritable there by any role with BYPASSRLS, which is the migration role,
-- while blueprint 7.4 requires audit records to be tamper-resistant. It was
-- found by running the pgTAP suites against the hosted database rather than
-- only against a local one.
--
-- Two rules follow, and this file obeys both:
--
--   1. An applied migration is never edited. A correction is a new migration.
--   2. A correction is written so that applying it is safe everywhere — it
--      creates what is missing and leaves what is already right untouched.

create or replace function audit.forbid_rewrite()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'audit.records is append-only'
    using errcode = '42501';
end;
$$;

-- Dropped first so this is idempotent: a database built from scratch after the
-- edit already has the trigger, and re-creating it there must not fail.
drop trigger if exists records_append_only on audit.records;

create trigger records_append_only
  before update or delete on audit.records
  for each statement
  execute function audit.forbid_rewrite();
