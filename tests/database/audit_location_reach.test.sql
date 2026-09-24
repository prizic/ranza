-- The audit log's reach (20260916004200, ADR 0031): which records a Staff
-- Member may read is decided by the read policy — the Properties they reach,
-- the whole Organization only when their reach is the whole Organization, and
-- nothing but their own records without `audit.read`.
--
-- Asserted here rather than only through @ranza/core, because core asks the
-- permission again in its own statement and so would stay green with the
-- policy's half deleted. Here nothing stands in front of the policy.
--
-- Every assertion reads what it needs and returns rows or none; nothing here
-- raises on an object that is missing, so a broken migration reads as red
-- lines rather than as a suite that stopped counting.
begin;
select plan(20);

insert into public.users (id, email) values
  ('ab700001-0000-4000-8000-000000000001', 'reach-owner@example.test'),
  ('ab700001-0000-4000-8000-000000000002', 'reach-manager@example.test'),
  ('ab700001-0000-4000-8000-000000000003', 'reach-desk@example.test'),
  ('ab700001-0000-4000-8000-000000000004', 'reach-outsider@example.test');

insert into public.organizations (id, name, status) values
  ('ab700002-0000-4000-8000-000000000001', 'Reach Organization', 'active'),
  ('ab700002-0000-4000-8000-000000000002', 'Reach Other', 'active');

insert into public.properties (id, organization_id, name, status) values
  ('ab700004-0000-4000-8000-000000000001', 'ab700002-0000-4000-8000-000000000001', 'Reach A', 'active'),
  ('ab700004-0000-4000-8000-000000000002', 'ab700002-0000-4000-8000-000000000001', 'Reach B', 'active'),
  ('ab700004-0000-4000-8000-000000000003', 'ab700002-0000-4000-8000-000000000001', 'Reach Archived', 'archived'),
  ('ab700004-0000-4000-8000-000000000004', 'ab700002-0000-4000-8000-000000000002', 'Reach Elsewhere', 'active');

insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('ab700002-0000-4000-8000-000000000001', 'ab700001-0000-4000-8000-000000000001', 'owner', 'organization_wide'),
  ('ab700002-0000-4000-8000-000000000001', 'ab700001-0000-4000-8000-000000000002', 'manager', 'assigned_properties'),
  ('ab700002-0000-4000-8000-000000000001', 'ab700001-0000-4000-8000-000000000003', 'front_desk', 'assigned_properties'),
  ('ab700002-0000-4000-8000-000000000002', 'ab700001-0000-4000-8000-000000000004', 'owner', 'organization_wide');

insert into public.property_assignments (property_id, organization_id, user_id) values
  ('ab700004-0000-4000-8000-000000000001', 'ab700002-0000-4000-8000-000000000001', 'ab700001-0000-4000-8000-000000000002'),
  ('ab700004-0000-4000-8000-000000000001', 'ab700002-0000-4000-8000-000000000001', 'ab700001-0000-4000-8000-000000000003');

-- The records, written as the table owner so the read assertions are about
-- the read policy alone: one at A, one at B, one at the archived Property,
-- one about the whole Organization.
insert into audit.records
  (organization_id, location_id, actor_id, action, subject_type, subject_id)
values
  ('ab700002-0000-4000-8000-000000000001', 'ab700004-0000-4000-8000-000000000001',
   'ab700001-0000-4000-8000-000000000001', 'reach.at_a', 'thing', 'ab700009-0000-4000-8000-00000000000a'),
  ('ab700002-0000-4000-8000-000000000001', 'ab700004-0000-4000-8000-000000000002',
   'ab700001-0000-4000-8000-000000000001', 'reach.at_b', 'thing', 'ab700009-0000-4000-8000-00000000000b'),
  ('ab700002-0000-4000-8000-000000000001', 'ab700004-0000-4000-8000-000000000003',
   'ab700001-0000-4000-8000-000000000001', 'reach.archived', 'thing', 'ab700009-0000-4000-8000-00000000000c'),
  ('ab700002-0000-4000-8000-000000000001', null,
   'ab700001-0000-4000-8000-000000000001', 'reach.whole', 'thing', 'ab700009-0000-4000-8000-00000000000d');

-- ---------------------------------------------------------------------------
-- The Manager: audit.read, assigned to A
-- ---------------------------------------------------------------------------

set local role ranza_app;
select app.set_request_context('ab700001-0000-4000-8000-000000000002');

select results_eq(
  $$select action from audit.records
     where organization_id = 'ab700002-0000-4000-8000-000000000001'
     order by action$$,
  $$values ('reach.at_a')$$,
  'an assigned reader reads their Property''s record and no other'
);

-- Whether their own writes still come back: `insert … returning` must pass
-- the read policy, and this record has no location an assigned reader
-- reaches.
select lives_ok(
  $$insert into audit.records
      (organization_id, actor_id, action, subject_type, subject_id)
    values ('ab700002-0000-4000-8000-000000000001',
            'ab700001-0000-4000-8000-000000000002',
            'reach.own_whole', 'thing', 'ab700009-0000-4000-8000-00000000000e')
    returning id$$,
  'a writer reads back a whole-Organization record it wrote'
);

select throws_ok(
  $$insert into audit.records
      (organization_id, location_id, actor_id, action, subject_type, subject_id)
    values ('ab700002-0000-4000-8000-000000000001',
            'ab700004-0000-4000-8000-000000000004',
            'ab700001-0000-4000-8000-000000000002',
            'reach.crossed', 'thing', 'ab700009-0000-4000-8000-00000000000f')$$,
  '42501', NULL,
  'a record cannot name another Organization''s Property'
);

select throws_ok(
  $$insert into audit.records
      (organization_id, location_id, actor_id, action, subject_type, subject_id,
       occurred_at)
    values ('ab700002-0000-4000-8000-000000000001',
            'ab700004-0000-4000-8000-000000000001',
            'ab700001-0000-4000-8000-000000000002',
            'reach.backdated', 'thing', 'ab700009-0000-4000-8000-000000000010',
            now() - interval '30 days')$$,
  '42501', NULL,
  'a record cannot be backdated: occurred_at is not a column the runtime role may write'
);

reset role;

-- ---------------------------------------------------------------------------
-- The Owner: audit.read, the whole Organization
-- ---------------------------------------------------------------------------

set local role ranza_app;
select app.set_request_context('ab700001-0000-4000-8000-000000000001');

select results_eq(
  $$select action from audit.records
     where organization_id = 'ab700002-0000-4000-8000-000000000001'
       and action like 'reach.%' and action <> 'reach.own_whole'
     order by action$$,
  $$values ('reach.archived'), ('reach.at_a'), ('reach.at_b'), ('reach.whole')$$,
  'an Organization-wide reader reads every Property, the archived one, and the whole-Organization record'
);

select results_eq(
  $$select name from app.audit_location_names(
      array['ab700004-0000-4000-8000-000000000003']::uuid[])$$,
  $$values ('Reach Archived')$$,
  'and the archived Property is named, which the ordinary Property policy would hide'
);

reset role;

-- ---------------------------------------------------------------------------
-- Front desk: no audit.read, assigned to A
-- ---------------------------------------------------------------------------

set local role ranza_app;
select app.set_request_context('ab700001-0000-4000-8000-000000000003');

select is_empty(
  $$select 1 from audit.records
     where organization_id = 'ab700002-0000-4000-8000-000000000001'$$,
  'without audit.read the Organization''s records are closed, even at the reader''s own Property'
);

select lives_ok(
  $$insert into audit.records
      (organization_id, location_id, actor_id, action, subject_type, subject_id)
    values ('ab700002-0000-4000-8000-000000000001',
            'ab700004-0000-4000-8000-000000000001',
            'ab700001-0000-4000-8000-000000000003',
            'reach.desk_wrote', 'thing', 'ab700009-0000-4000-8000-000000000011')
    returning id$$,
  'but a writer without audit.read still records, and reads back what it wrote'
);

select results_eq(
  $$select action from audit.records
     where organization_id = 'ab700002-0000-4000-8000-000000000001'$$,
  $$values ('reach.desk_wrote')$$,
  'and sees only that: its own record, nobody else''s'
);

select is_empty(
  $$select 1 from app.audit_location_names(
      array['ab700004-0000-4000-8000-000000000004']::uuid[])$$,
  'a Property outside the caller''s reach is not named'
);

reset role;

-- ---------------------------------------------------------------------------
-- Another Organization
-- ---------------------------------------------------------------------------

set local role ranza_app;
select app.set_request_context('ab700001-0000-4000-8000-000000000004');

select is_empty(
  $$select 1 from audit.records
     where organization_id = 'ab700002-0000-4000-8000-000000000001'$$,
  'an owner of another Organization reads none of these'
);

select is(
  app.audit_location_is_in_scope('ab700002-0000-4000-8000-000000000001',
                                 'ab700004-0000-4000-8000-000000000001'),
  false,
  'nor can they ask whether a Property belongs to an Organization they are not in'
);

reset role;

-- ---------------------------------------------------------------------------
-- A role the Organization composed, and what taking from it does
-- ---------------------------------------------------------------------------

-- The Front desk member is given a role of the Organization's own that holds
-- audit.read, so the permission — not the shipped role — is what opens A.
insert into public.staff_roles (scope_id, key, organization_id, name, permissions, status)
values ('ab700002-0000-4000-8000-000000000001', 'night_audit',
        'ab700002-0000-4000-8000-000000000001', 'Night audit', array['audit.read'], 'active');
update public.organization_memberships
   set role = 'night_audit', role_scope_id = 'ab700002-0000-4000-8000-000000000001'
 where user_id = 'ab700001-0000-4000-8000-000000000003';

set local role ranza_app;
select app.set_request_context('ab700001-0000-4000-8000-000000000003');
select ok(
  exists (select 1 from audit.records where action = 'reach.at_a'),
  'a composed role holding audit.read opens the reader''s Property'
);
reset role;

-- Not asserted: a retired role that still lists audit.read. The
-- `role.status = 'active'` clause in app.audit_reader_organization_ids() never
-- diverges from anything, because app.role_is_not_held() refuses to retire a
-- role anybody holds — as the owner too — so no reader can hold a retired
-- role. That trigger is what binds; the clause stays so the definer does not
-- depend on it.

update public.staff_roles set permissions = '{}'
 where scope_id = 'ab700002-0000-4000-8000-000000000001' and key = 'night_audit';

set local role ranza_app;
select app.set_request_context('ab700001-0000-4000-8000-000000000003');
select is_empty(
  $$select 1 from audit.records where action = 'reach.at_a'$$,
  'taking audit.read out of the role closes the log, in the read policy itself'
);
reset role;

-- The same member, revoked. Their own record was readable to them above; a
-- membership that ended takes that with it.
update public.organization_memberships
   set status = 'revoked', revoked_at = now()
 where user_id = 'ab700001-0000-4000-8000-000000000003';

set local role ranza_app;
select app.set_request_context('ab700001-0000-4000-8000-000000000003');
select is_empty(
  $$select 1 from audit.records where action = 'reach.desk_wrote'$$,
  'a revoked Staff Member no longer reads even the records they wrote'
);
reset role;

-- ---------------------------------------------------------------------------
-- The permission, the grants and the policy text
-- ---------------------------------------------------------------------------

select set_eq(
  $$select key from public.staff_roles
     where organization_id is null and 'audit.read' = any (permissions)$$,
  array['owner', 'manager'],
  'audit.read ships with Owner and Manager and with no other role'
);

select is_empty(
  $$select column_name from information_schema.column_privileges
     where table_schema = 'audit' and table_name = 'records'
       and grantee = 'ranza_app' and privilege_type = 'INSERT'
       and column_name in ('id', 'occurred_at')$$,
  'the runtime role may not write a record''s id or its time'
);

select set_eq(
  $$select column_name from information_schema.column_privileges
     where table_schema = 'audit' and table_name = 'records'
       and grantee = 'ranza_app' and privilege_type = 'INSERT'$$,
  array['organization_id', 'location_id', 'actor_id', 'action',
        'subject_type', 'subject_id', 'reason', 'context'],
  'and may write exactly the eight columns a record is made of'
);

-- The definers must not be callable by PUBLIC: each answers a question about
-- its caller, and a role that could call it without a request context would
-- get an answer about nobody — harmless today, and the kind of thing that
-- stops being harmless. Read from proacl so a missing function fails
-- cleanly rather than raising.
select is_empty(
  $$select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app' and p.proname like 'audit\_%'
       and (p.proacl is null or exists (
             select 1 from aclexplode(p.proacl) as grant_row
              where grant_row.grantee = 0 and grant_row.privilege_type = 'EXECUTE'))$$,
  'no audit definer is executable by PUBLIC'
);

select ok(
  (select qual from pg_policies
    where schemaname = 'audit' and tablename = 'records'
      and policyname = 'records_read_by_reach') like '%audit_reader_organization_ids%',
  'the read policy itself asks for audit.read'
);

select * from finish();
rollback;
