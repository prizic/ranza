-- platform/audit: a record is written once, read only inside its own scope, and
-- can never be rewritten — not by the runtime role, and not by the role that
-- runs migrations.
--
-- The second of those is the one worth proving, and it is where this suite
-- earned its place. Revoked grants stop the application. Row level security,
-- even FORCE, does not stop a superuser or a BYPASSRLS role, so the first
-- version of assertion 8 passed a rewrite straight through. A trigger is what
-- makes the claim true.
begin;
select plan(10);

insert into public.users (id, email)
values
  ('d0000001-0000-4000-8000-000000000001', 'audit-a@example.test'),
  ('d0000001-0000-4000-8000-000000000002', 'audit-b@example.test');

insert into public.organizations (id, name, status)
values
  ('d0000002-0000-4000-8000-000000000001', 'Audit Organization A', 'active'),
  ('d0000002-0000-4000-8000-000000000002', 'Audit Organization B', 'active');

insert into public.organization_memberships
  (organization_id, user_id, role, access_scope)
values
  ('d0000002-0000-4000-8000-000000000001',
   'd0000001-0000-4000-8000-000000000001', 'owner', 'organization_wide'),
  ('d0000002-0000-4000-8000-000000000002',
   'd0000001-0000-4000-8000-000000000002', 'owner', 'organization_wide');

-- ---------------------------------------------------------------------------
-- As the runtime role, acting as A
-- ---------------------------------------------------------------------------

set local role ranza_app;
select app.set_request_context('d0000001-0000-4000-8000-000000000001');

select lives_ok(
  $$insert into audit.records
      (organization_id, actor_id, action, subject_type, subject_id)
    values ('d0000002-0000-4000-8000-000000000001',
            'd0000001-0000-4000-8000-000000000001',
            'organization.created', 'organization',
            'd0000002-0000-4000-8000-000000000001')$$,
  'an actor records an action in a scope they reach'
);

select throws_ok(
  $$insert into audit.records
      (organization_id, actor_id, action, subject_type, subject_id)
    values ('d0000002-0000-4000-8000-000000000002',
            'd0000001-0000-4000-8000-000000000001',
            'organization.created', 'organization',
            'd0000002-0000-4000-8000-000000000002')$$,
  '42501', NULL,
  'writing into another Organization''s scope is denied'
);

select throws_ok(
  $$insert into audit.records
      (organization_id, actor_id, action, subject_type, subject_id)
    values ('d0000002-0000-4000-8000-000000000001',
            'd0000001-0000-4000-8000-000000000002',
            'organization.created', 'organization',
            'd0000002-0000-4000-8000-000000000001')$$,
  '42501', NULL,
  'an action cannot be attributed to somebody else'
);

select results_eq(
  $$select action from audit.records$$,
  $$values ('organization.created')$$,
  'the acting user reads back what they recorded'
);

select throws_ok(
  $$update audit.records set action = 'tampered.record'$$,
  '42501', NULL,
  'the runtime role cannot update a record'
);

select throws_ok(
  $$delete from audit.records$$,
  '42501', NULL,
  'the runtime role cannot delete a record'
);

reset role;

-- ---------------------------------------------------------------------------
-- As the runtime role, acting as B
-- ---------------------------------------------------------------------------

set local role ranza_app;
select app.set_request_context('d0000001-0000-4000-8000-000000000002');
select is_empty(
  $$select 1 from audit.records$$,
  'another Organization sees no records at all'
);
reset role;

-- ---------------------------------------------------------------------------
-- As the table owner
-- ---------------------------------------------------------------------------

select app.set_request_context('d0000001-0000-4000-8000-000000000001');

-- The first version of this suite asserted that FORCE row level security was
-- enough here, and it was wrong: this role is a superuser locally and a
-- BYPASSRLS role on a hosted database, so the update succeeded. The trigger is
-- what makes the claim true, and this is the assertion that caught it.
select throws_ok(
  $$update audit.records set action = 'tampered.record'$$,
  '42501', 'audit.records is append-only',
  'the migration role cannot rewrite a record either'
);

select is_empty(
  $$select 1 from pg_policies
    where schemaname = 'audit' and cmd in ('UPDATE', 'DELETE', 'ALL')$$,
  'no policy anywhere grants update or delete'
);

-- Asserted separately from the two statements above, which the trigger would
-- satisfy on its own: a granted-but-triggered table still reads as protected
-- until somebody disables the trigger. Both halves have to be checked.
select is_empty(
  $$select 1 from information_schema.role_table_grants
    where table_schema = 'audit' and table_name = 'records'
      and grantee = 'ranza_app'
      and privilege_type in ('UPDATE', 'DELETE')$$,
  'the runtime role holds no update or delete grant'
);

select * from finish();
rollback;
