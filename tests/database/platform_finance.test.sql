-- platform/finance: chart of accounts, journal entries, balanced postings,
-- append-only immutability, tenant isolation, and who may read and write the
-- ledger (blueprint 5.10, RANZ-41, ADR 0042).
--
-- Proves:
--   - the ledger's own invariants hold for anything that writes it: balance,
--     orphan headers, one entry per source, cross-Organization accounts,
--     append-only
--   - only the worker writes the ledger, through app.post_folio_line_to_ledger()
--     and no table grant; ranza_app holds SELECT and nothing else; ranza_worker
--     holds nothing on the tables (ACC-S1-01 .. ACC-S1-05)
--   - the function derives every posting from the Folio line, never from the
--     event payload, and refuses an event it cannot post (ACC-S1-06 .. ACC-S1-15)
--   - reading is the permission finance.view_ledger, whole-Organization reach,
--     and the commercial gates, all in the policies (ACC-S2-01 .. ACC-S2-09)
--   - folio_lines insert trigger notifies outbox with 'folio.line_posted'

begin;
select plan(78);

-- ---------------------------------------------------------------------------
-- Fixtures. Written as the table owner: ranza_app may not create Properties
-- or Stays, and nobody but the worker may write the ledger.
-- ---------------------------------------------------------------------------

insert into public.users (id, email) values
  ('e1000001-0000-4000-8000-000000000001', 'finance-owner-a@example.test'),
  ('e1000001-0000-4000-8000-000000000002', 'finance-owner-b@example.test'),
  ('e1000001-0000-4000-8000-000000000003', 'finance-wide-a@example.test'),
  ('e1000001-0000-4000-8000-000000000004', 'finance-assigned-a@example.test'),
  ('e1000001-0000-4000-8000-000000000005', 'frontdesk-a@example.test'),
  ('e1000001-0000-4000-8000-000000000006', 'housekeeping-a@example.test'),
  ('e1000001-0000-4000-8000-000000000007', 'auditor-a@example.test');

insert into public.organizations (id, name, status) values
  ('e2000002-0000-4000-8000-000000000001', 'Finance Org A', 'active'),
  ('e2000002-0000-4000-8000-000000000002', 'Finance Org B', 'active');

insert into public.properties (id, organization_id, name, currency) values
  ('e4000004-0000-4000-8000-000000000001', 'e2000002-0000-4000-8000-000000000001', 'Finance Property A', 'TRY'),
  ('e4000004-0000-4000-8000-000000000002', 'e2000002-0000-4000-8000-000000000002', 'Finance Property B', 'TRY');

insert into public.subscriptions (organization_id, status) values
  ('e2000002-0000-4000-8000-000000000001', 'active'),
  ('e2000002-0000-4000-8000-000000000002', 'active');

insert into public.entitlements (organization_id, module_key) values
  ('e2000002-0000-4000-8000-000000000001', 'billing_folios'),
  ('e2000002-0000-4000-8000-000000000002', 'billing_folios');

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('e4000004-0000-4000-8000-000000000001', 'e2000002-0000-4000-8000-000000000001', 'finance', true),
  ('e4000004-0000-4000-8000-000000000002', 'e2000002-0000-4000-8000-000000000002', 'finance', true);

-- A role an Organization wrote: it can read the ledger and do nothing else,
-- which is what makes the permission, not the role's name, the thing asked.
insert into public.staff_roles
  (scope_id, key, organization_id, name, permissions) values
  ('e2000002-0000-4000-8000-000000000001', 'ledger_reader',
   'e2000002-0000-4000-8000-000000000001', 'Night auditor',
   array['finance.view_ledger']);

insert into public.organization_memberships
  (organization_id, user_id, role, role_scope_id, access_scope) values
  ('e2000002-0000-4000-8000-000000000001', 'e1000001-0000-4000-8000-000000000001',
   'owner', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('e2000002-0000-4000-8000-000000000002', 'e1000001-0000-4000-8000-000000000002',
   'owner', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('e2000002-0000-4000-8000-000000000001', 'e1000001-0000-4000-8000-000000000003',
   'finance', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('e2000002-0000-4000-8000-000000000001', 'e1000001-0000-4000-8000-000000000004',
   'finance', '00000000-0000-0000-0000-000000000000', 'assigned_properties'),
  ('e2000002-0000-4000-8000-000000000001', 'e1000001-0000-4000-8000-000000000005',
   'front_desk', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('e2000002-0000-4000-8000-000000000001', 'e1000001-0000-4000-8000-000000000006',
   'housekeeping', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('e2000002-0000-4000-8000-000000000001', 'e1000001-0000-4000-8000-000000000007',
   'ledger_reader', 'e2000002-0000-4000-8000-000000000001', 'organization_wide');

insert into public.property_assignments (property_id, organization_id, user_id) values
  ('e4000004-0000-4000-8000-000000000001', 'e2000002-0000-4000-8000-000000000001',
   'e1000001-0000-4000-8000-000000000004');

insert into public.accommodation_units (id, property_id, organization_id, name, unit_type, capacity) values
  ('e5000005-0000-4000-8000-000000000001', 'e4000004-0000-4000-8000-000000000001', 'e2000002-0000-4000-8000-000000000001', 'FIN-101', 'room', 2),
  ('e5000005-0000-4000-8000-000000000002', 'e4000004-0000-4000-8000-000000000002', 'e2000002-0000-4000-8000-000000000002', 'FIN-201', 'room', 2);

insert into public.stays (id, property_id, organization_id, accommodation_unit_id, stay_type, status, starts_on, ends_on) values
  ('e6000006-0000-4000-8000-000000000001', 'e4000004-0000-4000-8000-000000000001', 'e2000002-0000-4000-8000-000000000001', 'e5000005-0000-4000-8000-000000000001', 'guest', 'in_house',
   app.property_today('e4000004-0000-4000-8000-000000000001'),
   app.property_today('e4000004-0000-4000-8000-000000000001') + 3),
  ('e6000006-0000-4000-8000-000000000002', 'e4000004-0000-4000-8000-000000000002', 'e2000002-0000-4000-8000-000000000002', 'e5000005-0000-4000-8000-000000000002', 'guest', 'in_house',
   app.property_today('e4000004-0000-4000-8000-000000000002'),
   app.property_today('e4000004-0000-4000-8000-000000000002') + 3);

insert into public.folios (id, property_id, organization_id, stay_id, currency) values
  ('e7000007-0000-4000-8000-000000000001', 'e4000004-0000-4000-8000-000000000001', 'e2000002-0000-4000-8000-000000000001', 'e6000006-0000-4000-8000-000000000001', 'TRY'),
  ('e7000007-0000-4000-8000-000000000002', 'e4000004-0000-4000-8000-000000000002', 'e2000002-0000-4000-8000-000000000002', 'e6000006-0000-4000-8000-000000000002', 'TRY');

-- One line of every kind the Folio can hold. A payment is negative and a
-- reversal is the opposite sign of the line it cancels, which is the shape the
-- function has to read the magnitude out of.
insert into public.folio_lines
  (id, organization_id, property_id, folio_id, line_type, description, amount_minor, payment_method, reverses_line_id, source, business_date)
values
  ('e8000008-0000-4000-8000-000000000001', 'e2000002-0000-4000-8000-000000000001', 'e4000004-0000-4000-8000-000000000001', 'e7000007-0000-4000-8000-000000000001', 'charge', 'L1 minibar charge', 3500, null, null, null, null),
  ('e8000008-0000-4000-8000-000000000002', 'e2000002-0000-4000-8000-000000000001', 'e4000004-0000-4000-8000-000000000001', 'e7000007-0000-4000-8000-000000000001', 'charge', 'L2 room night', 120000, null, null, 'room_night', app.property_today('e4000004-0000-4000-8000-000000000001') - 1),
  ('e8000008-0000-4000-8000-000000000003', 'e2000002-0000-4000-8000-000000000001', 'e4000004-0000-4000-8000-000000000001', 'e7000007-0000-4000-8000-000000000001', 'payment', 'L3 cash payment', -1000, 'cash', null, null, null),
  ('e8000008-0000-4000-8000-000000000004', 'e2000002-0000-4000-8000-000000000001', 'e4000004-0000-4000-8000-000000000001', 'e7000007-0000-4000-8000-000000000001', 'payment', 'L4 card payment', -2000, 'card', null, null, null),
  ('e8000008-0000-4000-8000-000000000005', 'e2000002-0000-4000-8000-000000000001', 'e4000004-0000-4000-8000-000000000001', 'e7000007-0000-4000-8000-000000000001', 'payment', 'L5 transfer payment', -3000, 'bank_transfer', null, null, null),
  ('e8000008-0000-4000-8000-000000000006', 'e2000002-0000-4000-8000-000000000001', 'e4000004-0000-4000-8000-000000000001', 'e7000007-0000-4000-8000-000000000001', 'payment', 'L6 other payment', -400, 'other', null, null, null),
  ('e8000008-0000-4000-8000-000000000007', 'e2000002-0000-4000-8000-000000000001', 'e4000004-0000-4000-8000-000000000001', 'e7000007-0000-4000-8000-000000000001', 'reversal', 'L7 reverses the minibar charge', -3500, null, 'e8000008-0000-4000-8000-000000000001', null, null),
  ('e8000008-0000-4000-8000-000000000008', 'e2000002-0000-4000-8000-000000000001', 'e4000004-0000-4000-8000-000000000001', 'e7000007-0000-4000-8000-000000000001', 'reversal', 'L8 reverses the card payment', 2000, null, 'e8000008-0000-4000-8000-000000000004', null, null),
  ('e8000008-0000-4000-8000-000000000009', 'e2000002-0000-4000-8000-000000000001', 'e4000004-0000-4000-8000-000000000001', 'e7000007-0000-4000-8000-000000000001', 'reversal', 'L9 reverses the room night', -120000, null, 'e8000008-0000-4000-8000-000000000002', null, null),
  ('e8000008-0000-4000-8000-000000000010', 'e2000002-0000-4000-8000-000000000001', 'e4000004-0000-4000-8000-000000000001', 'e7000007-0000-4000-8000-000000000001', 'charge', 'L10 late minibar', 5000, null, null, null, null),
  ('e8000008-0000-4000-8000-000000000011', 'e2000002-0000-4000-8000-000000000001', 'e4000004-0000-4000-8000-000000000001', 'e7000007-0000-4000-8000-000000000001', 'charge', 'L11 laundry', 7000, null, null, null, null),
  ('e8000008-0000-4000-8000-000000000012', 'e2000002-0000-4000-8000-000000000002', 'e4000004-0000-4000-8000-000000000002', 'e7000007-0000-4000-8000-000000000002', 'charge', 'LB1 other organization charge', 9900, null, null, null, null);

-- The events the trigger wrote, by the line they name. L10 and L11 are left
-- unposted on purpose: they are what the forged and the lapsed cases act on.
create temp table lg_events as
  select (payload ->> 'lineId')::uuid as line_id, id as event_id, organization_id
    from outbox.events
   where (payload ->> 'lineId')::uuid in (
     'e8000008-0000-4000-8000-000000000001', 'e8000008-0000-4000-8000-000000000002',
     'e8000008-0000-4000-8000-000000000003', 'e8000008-0000-4000-8000-000000000004',
     'e8000008-0000-4000-8000-000000000005', 'e8000008-0000-4000-8000-000000000006',
     'e8000008-0000-4000-8000-000000000007', 'e8000008-0000-4000-8000-000000000008',
     'e8000008-0000-4000-8000-000000000009', 'e8000008-0000-4000-8000-000000000010',
     'e8000008-0000-4000-8000-000000000011', 'e8000008-0000-4000-8000-000000000012');
grant select on lg_events to ranza_app, ranza_worker;

-- ---------------------------------------------------------------------------
-- 1. The permission and who ships with it
-- ---------------------------------------------------------------------------

select is(
  (select module_key from public.staff_permissions where key = 'finance.view_ledger'),
  'billing_folios',
  'ACC-S2-01: finance.view_ledger is in the catalogue under billing_folios'
);

select set_eq(
  $$select key from public.staff_roles
     where organization_id is null and 'finance.view_ledger' = any (permissions)$$,
  array['owner', 'manager', 'finance'],
  'ACC-S2-01: Owner, Manager and Finance hold finance.view_ledger; Front desk and Housekeeping do not'
);

-- ---------------------------------------------------------------------------
-- 2. The grants. Catalogue reads: no row is an assertion that fails cleanly.
-- ---------------------------------------------------------------------------

select is_empty(
  $$select table_name || ' ' || privilege_type
      from information_schema.table_privileges
     where table_schema = 'finance'
       and grantee = 'ranza_app'
       and privilege_type <> 'SELECT'
    union all
    select table_name || '.' || column_name || ' ' || privilege_type
      from information_schema.column_privileges
     where table_schema = 'finance'
       and grantee = 'ranza_app'
       and privilege_type <> 'SELECT'$$,
  'ACC-S1-01: ranza_app holds SELECT on the ledger tables and no INSERT, UPDATE, DELETE or TRUNCATE, at table or column level'
);

select is_empty(
  $$select table_name || ' ' || privilege_type
      from information_schema.table_privileges
     where table_schema = 'finance' and grantee = 'ranza_worker'
    union all
    select table_name || '.' || column_name || ' ' || privilege_type
      from information_schema.column_privileges
     where table_schema = 'finance' and grantee = 'ranza_worker'$$,
  'ACC-S1-02: ranza_worker holds no privilege on any ledger table (ADR 0027)'
);

select is_empty(
  $$select c.relname || ' ' || array_to_string(c.relacl, ',')
      from pg_class c
     where c.relnamespace = 'finance'::regnamespace
       and c.relkind = 'S'
       and c.relacl::text ~ '(ranza_app|ranza_worker)='$$,
  'ACC-S1-02: ranza_app and ranza_worker hold nothing on the ledger sequences'
);

select ok(
  not has_schema_privilege('ranza_worker', 'finance', 'USAGE'),
  'ACC-S1-02: ranza_worker cannot even resolve the finance schema'
);

select is_empty(
  $$select tablename || ' ' || policyname from pg_policies
     where schemaname = 'finance' and cmd <> 'SELECT'$$,
  'ACC-S1-03: no INSERT, UPDATE or DELETE policy remains on any ledger table'
);

select is_empty(
  $$select tablename || ' ' || policyname from pg_policies
     where schemaname = 'finance' and roles::text ~ 'ranza_worker'$$,
  'ACC-S1-03: no ledger policy names ranza_worker'
);

select set_eq(
  $$select coalesce(r.rolname, 'PUBLIC')
      from pg_proc p
      cross join lateral aclexplode(p.proacl) as acl
      left join pg_roles r on r.oid = acl.grantee
     where p.pronamespace = 'app'::regnamespace
       and p.proname = 'post_folio_line_to_ledger'
       and acl.privilege_type = 'EXECUTE'
       and acl.grantee <> p.proowner$$,
  array['ranza_worker'],
  'ACC-S1-04: only ranza_worker may execute app.post_folio_line_to_ledger()'
);

select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
     from pg_proc p
    where p.pronamespace = 'app'::regnamespace
      and p.proname = 'post_folio_line_to_ledger'),
  'ACC-S1-04: app.post_folio_line_to_ledger() is a security definer with an empty search_path'
);

select is_empty(
  $$select p.proname from pg_proc p
     where p.pronamespace = 'finance'::regnamespace
       and p.proname = 'ensure_default_accounts'
       and (p.proacl is null
            or exists (select 1 from aclexplode(p.proacl) as acl
                        where acl.privilege_type = 'EXECUTE'
                          and acl.grantee <> p.proowner))$$,
  'ACC-S1-04: finance.ensure_default_accounts() is executable by neither runtime role nor PUBLIC'
);

select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace = 'finance'::regnamespace
      and p.proname in ('verify_entry_balanced', 'verify_entry_has_lines')
      and p.prosecdef),
  2,
  'ACC-S1-15: the two commit-time checks run as their owner, because the worker that commits holds no read on the tables they read'
);

-- ---------------------------------------------------------------------------
-- 3. The policies name all four gates, in the policy and not beside it
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'finance' and cmd = 'SELECT'
      and roles::text = '{ranza_app}'
      and qual ~ 'accessible_organization_ids'
      and qual ~ 'has_organization_wide_reach\(organization_id\)'
      and qual ~ 'has_organization_permission\(organization_id, ''finance.view_ledger''::text\)'
      and qual ~ 'can_use_capability_in_organization\(organization_id, ''billing_folios''::text, ''finance''::text\)'),
  3,
  'ACC-S2-02: all three read policies ask membership, whole-Organization reach, finance.view_ledger and the Folio finance capability'
);

-- ---------------------------------------------------------------------------
-- 4. The ledger's own invariants, proved as the owner: they are the last line
--    when everything above is wrong.
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select finance.ensure_default_accounts('e2000002-0000-4000-8000-000000000001')$$,
  'ensure_default_accounts creates standard accounts'
);

select results_eq(
  $$select count(*)::integer from finance.accounts where organization_id = 'e2000002-0000-4000-8000-000000000001'$$,
  $$values (6)$$,
  'standard chart of accounts has 6 accounts'
);

select finance.ensure_default_accounts('e2000002-0000-4000-8000-000000000002');

create temp table test_b_acc as
  select id from finance.accounts
  where organization_id = 'e2000002-0000-4000-8000-000000000002' and code = '1200';

select lives_ok(
  $$
  with entry as (
    insert into finance.journal_entries
      (organization_id, currency, description, source_type, source_id)
    values
      ('e2000002-0000-4000-8000-000000000001', 'TRY', 'Valid balanced charge',
       'manual', 'e3000003-0000-4000-8000-000000000001')
    returning id, organization_id
  ),
  acc as (
    select id, code from finance.accounts
    where organization_id = 'e2000002-0000-4000-8000-000000000001'
  )
  insert into finance.journal_lines
    (organization_id, journal_entry_id, account_id, direction, amount_minor, line_number)
  select
    entry.organization_id,
    entry.id,
    case when leg.num = 1 then (select id from acc where code = '1200')
         else (select id from acc where code = '4000') end,
    case when leg.num = 1 then 'debit' else 'credit' end,
    50000,
    leg.num
  from entry
  cross join (values (1), (2)) as leg(num)
  $$,
  'a balanced journal entry posts without error'
);

select results_eq(
  $$
  with entry as (
    insert into finance.journal_entries
      (organization_id, currency, description, source_type, source_id, entry_date)
    values
      ('e2000002-0000-4000-8000-000000000001', 'TRY', 'Dated charge',
       'manual', 'e3000003-0000-4000-8000-000000000010', '2026-09-18'::date)
    returning id, organization_id, entry_date
  ),
  acc as (
    select id, code from finance.accounts
    where organization_id = 'e2000002-0000-4000-8000-000000000001'
  ),
  lines as (
    insert into finance.journal_lines
      (organization_id, journal_entry_id, account_id, direction, amount_minor, line_number)
    select
      entry.organization_id,
      entry.id,
      case when leg.num = 1 then (select id from acc where code = '1200')
           else (select id from acc where code = '4000') end,
      case when leg.num = 1 then 'debit' else 'credit' end,
      12000,
      leg.num
    from entry
    cross join (values (1), (2)) as leg(num)
  )
  select entry_date from entry;
  $$,
  $$values ('2026-09-18'::date)$$,
  'journal entry explicitly records business entry_date'
);

select throws_ok(
  $$
  insert into finance.journal_lines
    (organization_id, journal_entry_id, account_id, direction, amount_minor, line_number)
  values
    ('e2000002-0000-4000-8000-000000000001',
     (select id from finance.journal_entries where source_id = 'e3000003-0000-4000-8000-000000000001'),
     (select id from test_b_acc),
     'debit', 50000, 99)
  $$,
  '23503', NULL,
  'ACC-S1-18: referencing another organization account is refused by composite foreign key'
);

select throws_ok(
  $$
  insert into finance.journal_lines
    (organization_id, journal_entry_id, account_id, direction, amount_minor, line_number)
  values
    ('e2000002-0000-4000-8000-000000000001',
     (select id from finance.journal_entries where source_id = 'e3000003-0000-4000-8000-000000000001'),
     (select id from finance.accounts where organization_id = 'e2000002-0000-4000-8000-000000000001' and code = '1200'),
     'debit', 50000, 1)
  $$,
  '23505', NULL,
  'ACC-S1-19: duplicate line_number on journal entry is refused by unique constraint'
);

select throws_ok(
  $$
  with entry as (
    insert into finance.journal_entries
      (organization_id, currency, description, source_type, source_id)
    values
      ('e2000002-0000-4000-8000-000000000001', 'TRY', 'Unbalanced charge',
       'manual', 'e3000003-0000-4000-8000-000000000002')
    returning id, organization_id
  ),
  acc as (
    select id from finance.accounts
    where organization_id = 'e2000002-0000-4000-8000-000000000001' and code = '1200'
  )
  insert into finance.journal_lines
    (organization_id, journal_entry_id, account_id, direction, amount_minor, line_number)
  select
    entry.organization_id,
    entry.id,
    acc.id,
    'debit',
    50000,
    1
  from entry, acc;
  set constraints all immediate;
  $$,
  '23514', NULL,
  'ACC-S1-16: unbalanced entry is refused by balance check trigger'
);

select throws_ok(
  $$
  insert into finance.journal_entries
    (organization_id, currency, description, source_type, source_id)
  values
    ('e2000002-0000-4000-8000-000000000001', 'TRY', 'Orphan header without lines',
     'manual', 'e3000003-0000-4000-8000-000000000099');
  set constraints all immediate;
  $$,
  '23514', NULL,
  'ACC-S1-17: a journal entry without at least two lines is refused by deferred trigger'
);

select throws_ok(
  $$
  insert into finance.journal_entries
    (organization_id, currency, description, source_type, source_id)
  values
    ('e2000002-0000-4000-8000-000000000001', 'TRY', 'Duplicate posting',
     'manual', 'e3000003-0000-4000-8000-000000000001')
  $$,
  '23505', NULL,
  'ACC-S1-19: re-posting the same source record is refused by unique constraint'
);

set constraints all immediate;

select throws_ok(
  $$update finance.journal_entries set description = 'Tampered' where source_id = 'e3000003-0000-4000-8000-000000000001'$$,
  '42501', NULL,
  'ACC-S1-20: updating a journal entry is refused by append-only trigger'
);

select throws_ok(
  $$delete from finance.journal_entries where source_id = 'e3000003-0000-4000-8000-000000000001'$$,
  '42501', NULL,
  'ACC-S1-20: deleting a journal entry is refused by append-only trigger'
);

select throws_ok(
  $$truncate table finance.journal_lines$$,
  '42501', NULL,
  'ACC-S1-20: truncating journal lines is refused by append-only trigger'
);

select throws_ok(
  $$truncate table finance.journal_entries, finance.journal_lines$$,
  '42501', NULL,
  'ACC-S1-20: truncating journal entries is refused by append-only trigger'
);

-- The checks above ran immediate so each refusal arrives with its statement.
-- Everything below runs as the application does: deferred to COMMIT.
set constraints all deferred;

-- ---------------------------------------------------------------------------
-- 5. Nothing writes the ledger but the worker's function
-- ---------------------------------------------------------------------------

-- Spoken as the Owner, who holds every permission there is: a refusal here is
-- the grant, not a missing permission.
set local role ranza_app;
select app.set_request_context('e1000001-0000-4000-8000-000000000001');

select throws_ok(
  $$insert into finance.journal_entries
      (organization_id, currency, description, source_type, source_id)
    values ('e2000002-0000-4000-8000-000000000001', 'TRY', 'Forged revenue',
            'folio_line', 'e3000003-0000-4000-8000-000000000098')$$,
  '42501', NULL,
  'ACC-S1-01: an Owner speaking through ranza_app cannot insert a journal entry'
);

select throws_ok(
  $$insert into finance.journal_lines
      (organization_id, journal_entry_id, account_id, direction, amount_minor, line_number)
    select organization_id, id,
           (select id from finance.accounts where organization_id = 'e2000002-0000-4000-8000-000000000001' and code = '1200'),
           'debit', 1, 50
      from finance.journal_entries
     where source_id = 'e3000003-0000-4000-8000-000000000001'$$,
  '42501', NULL,
  'ACC-S1-01: an Owner speaking through ranza_app cannot insert a journal line'
);

select throws_ok(
  $$insert into finance.accounts (organization_id, code, name, type, normal_balance)
    values ('e2000002-0000-4000-8000-000000000001', '9999', 'Slush fund', 'asset', 'debit')$$,
  '42501', NULL,
  'ACC-S1-01: an Owner speaking through ranza_app cannot add an account'
);

select throws_ok(
  $$update finance.journal_entries set description = 'Tampered'$$,
  '42501', NULL,
  'ACC-S1-01: ranza_app cannot update a journal entry'
);

select throws_ok(
  $$delete from finance.journal_lines$$,
  '42501', NULL,
  'ACC-S1-01: ranza_app cannot delete a journal line'
);

select throws_ok(
  $$select app.post_folio_line_to_ledger((select event_id from lg_events limit 1))$$,
  '42501', NULL,
  'ACC-S1-04: ranza_app cannot execute the posting function'
);

select throws_ok(
  $$select finance.ensure_default_accounts('e2000002-0000-4000-8000-000000000001')$$,
  '42501', NULL,
  'ACC-S1-04: ranza_app cannot execute ensure_default_accounts'
);

reset role;
set local role ranza_worker;

select throws_ok(
  $$select count(*) from finance.journal_entries$$,
  '42501', NULL,
  'ACC-S1-02: ranza_worker cannot read the ledger'
);

select throws_ok(
  $$insert into finance.journal_entries
      (organization_id, currency, description, source_type, source_id)
    values ('e2000002-0000-4000-8000-000000000001', 'TRY', 'Forged revenue',
            'folio_line', 'e3000003-0000-4000-8000-000000000097')$$,
  '42501', NULL,
  'ACC-S1-02: ranza_worker cannot insert into the ledger directly'
);

select throws_ok(
  $$select app.post_folio_line_to_ledger((select event_id from lg_events limit 1))$$,
  '42501', NULL,
  'ACC-S1-05: the posting function refuses a caller with no worker context'
);

-- ---------------------------------------------------------------------------
-- 6. The worker posts what the Folio lines owe
-- ---------------------------------------------------------------------------

select app.set_worker_context('e2000002-0000-4000-8000-000000000001', 'ledger-test');

select lives_ok(
  $$select app.post_folio_line_to_ledger(event_id)
      from lg_events
     where organization_id = 'e2000002-0000-4000-8000-000000000001'
       and line_id not in ('e8000008-0000-4000-8000-000000000010',
                           'e8000008-0000-4000-8000-000000000011')$$,
  'ACC-S1-06: the worker posts every delivered Folio line'
);

-- COMMIT, early. The balance and two-line checks are deferred to commit, and
-- they run as the role that commits: the worker, which can read no ledger table.
select lives_ok(
  $$set constraints all immediate$$,
  'ACC-S1-15: the deferred balance and two-line checks pass when the worker is the one committing'
);
set constraints all deferred;

reset role;

-- The same event again is the entry that already exists, not a second one and
-- not an error: a redelivery, or a rival worker, finds the books already kept.
create temp table lg_first_entry as
  select id from finance.journal_entries
   where source_id = 'e8000008-0000-4000-8000-000000000001';
grant select on lg_first_entry to ranza_worker;

set local role ranza_worker;
select app.set_worker_context('e2000002-0000-4000-8000-000000000001', 'ledger-test');

select is(
  (select app.post_folio_line_to_ledger(event_id) from lg_events
    where line_id = 'e8000008-0000-4000-8000-000000000001'),
  (select id from lg_first_entry),
  'ACC-S1-14: posting the same event again returns the entry that exists'
);

reset role;

select is(
  (select count(*)::int from finance.journal_entries
    where source_type = 'folio_line' and organization_id = 'e2000002-0000-4000-8000-000000000001'),
  9,
  'ACC-S1-14: one entry per Folio line posted'
);

select results_eq(
  $$select fl.description,
           (select a.code from finance.journal_lines jl join finance.accounts a on a.id = jl.account_id
             where jl.journal_entry_id = je.id and jl.direction = 'debit'),
           (select a.code from finance.journal_lines jl join finance.accounts a on a.id = jl.account_id
             where jl.journal_entry_id = je.id and jl.direction = 'credit'),
           (select sum(jl.amount_minor)::bigint from finance.journal_lines jl
             where jl.journal_entry_id = je.id and jl.direction = 'debit')
      from finance.journal_entries je
      join public.folio_lines fl on fl.id = je.source_id
     where je.source_type = 'folio_line'
       and je.organization_id = 'e2000002-0000-4000-8000-000000000001'
     order by fl.description$$,
  $$values
    ('L1 minibar charge', '1200', '4100', 3500::bigint),
    ('L2 room night', '1200', '4000', 120000::bigint),
    ('L3 cash payment', '1000', '1200', 1000::bigint),
    ('L4 card payment', '1020', '1200', 2000::bigint),
    ('L5 transfer payment', '1010', '1200', 3000::bigint),
    ('L6 other payment', '1000', '1200', 400::bigint),
    ('L7 reverses the minibar charge', '4100', '1200', 3500::bigint),
    ('L8 reverses the card payment', '1200', '1020', 2000::bigint),
    ('L9 reverses the room night', '4000', '1200', 120000::bigint)$$,
  'ACC-S1-06: a charge debits Receivables and credits revenue, a payment debits where it settles, a reversal mirrors the line it cancels'
);

select results_eq(
  $$select je.entry_date, je.currency::text
      from finance.journal_entries je
     where je.source_id = 'e8000008-0000-4000-8000-000000000002'$$,
  $$select app.property_today('e4000004-0000-4000-8000-000000000001') - 1, 'TRY'::text$$,
  'ACC-S1-07: a room night is dated by its own business date, in the Folio''s currency'
);

select results_eq(
  $$select je.entry_date
      from finance.journal_entries je
      join public.folio_lines fl on fl.id = je.source_id
      join public.properties p on p.id = fl.property_id
     where je.source_id = 'e8000008-0000-4000-8000-000000000001'$$,
  $$select app.business_date(fl.posted_at, p.timezone, p.business_date_cutoff)
      from public.folio_lines fl
      join public.properties p on p.id = fl.property_id
     where fl.id = 'e8000008-0000-4000-8000-000000000001'$$,
  'ACC-S1-07: any other line is dated by the business date its Property was working when the line was posted'
);

select is(
  (select count(*)::int from (
     select journal_entry_id from finance.journal_lines
      where organization_id = 'e2000002-0000-4000-8000-000000000001'
      group by journal_entry_id
     having sum(amount_minor) filter (where direction = 'debit')
         <> sum(amount_minor) filter (where direction = 'credit')) as unbalanced),
  0,
  'ACC-S1-06: every posted entry balances'
);

-- ---------------------------------------------------------------------------
-- 7. The worker posts from the Folio line, never from the event
-- ---------------------------------------------------------------------------

create temp table lg_forged (name text, event_id uuid);
grant select on lg_forged to ranza_worker, ranza_app;

-- Each of these is something ranza_app may write today: an event in its own
-- Organization, with any payload.
with forged as (
  insert into outbox.events (organization_id, event_type, payload) values
    ('e2000002-0000-4000-8000-000000000001', 'folio.line_posted', '{}'::jsonb),
    ('e2000002-0000-4000-8000-000000000001', 'folio.line_posted',
     '{"lineId": "e8000008-0000-4000-8000-000000000099"}'::jsonb),
    ('e2000002-0000-4000-8000-000000000001', 'stay.checked_out',
     '{"lineId": "e8000008-0000-4000-8000-000000000010"}'::jsonb),
    ('e2000002-0000-4000-8000-000000000001', 'folio.line_posted',
     '{"lineId": "e8000008-0000-4000-8000-000000000012"}'::jsonb),
    ('e2000002-0000-4000-8000-000000000001', 'folio.line_posted',
     '{"lineId": "e8000008-0000-4000-8000-000000000010", "lineType": "payment", "amountMinor": 99999999, "paymentMethod": "cash", "currency": "USD"}'::jsonb)
  returning id, event_type, payload)
insert into lg_forged
  select case
           when payload = '{}'::jsonb then 'no line'
           when payload ->> 'lineId' = 'e8000008-0000-4000-8000-000000000099' then 'missing line'
           when event_type = 'stay.checked_out' then 'wrong kind'
           when payload ->> 'lineId' = 'e8000008-0000-4000-8000-000000000012' then 'other organization line'
           else 'forged amount'
         end,
         id
    from forged;

set local role ranza_worker;
select app.set_worker_context('e2000002-0000-4000-8000-000000000001', 'ledger-test');

select throws_ok(
  $$select app.post_folio_line_to_ledger((select event_id from lg_forged where name = 'no line'))$$,
  '22023', NULL,
  'ACC-S1-08: a folio.line_posted event that names no line is refused loudly, not delivered'
);

select throws_ok(
  $$select app.post_folio_line_to_ledger((select event_id from lg_forged where name = 'missing line'))$$,
  'P0002', NULL,
  'ACC-S1-09: an event naming a Folio line that does not exist is refused'
);

select throws_ok(
  $$select app.post_folio_line_to_ledger((select event_id from lg_forged where name = 'wrong kind'))$$,
  '22023', NULL,
  'ACC-S1-10: an event of another kind is refused'
);

select throws_ok(
  $$select app.post_folio_line_to_ledger((select event_id from lg_forged where name = 'other organization line'))$$,
  'P0002', NULL,
  'ACC-S1-11: an event cannot make the worker post another Organization''s Folio line'
);

select throws_ok(
  $$select app.post_folio_line_to_ledger(gen_random_uuid())$$,
  'P0002', NULL,
  'ACC-S1-09: an event that does not exist is refused'
);

select app.set_worker_context('e2000002-0000-4000-8000-000000000002', 'ledger-test');

select throws_ok(
  $$select app.post_folio_line_to_ledger((select event_id from lg_events where line_id = 'e8000008-0000-4000-8000-000000000010'))$$,
  '42501', NULL,
  'ACC-S1-12: the worker cannot post an event that belongs to an Organization it is not scoped to'
);

select app.set_worker_context('e2000002-0000-4000-8000-000000000001', 'ledger-test');

select lives_ok(
  $$select app.post_folio_line_to_ledger((select event_id from lg_forged where name = 'forged amount'))$$,
  'ACC-S1-13: an event whose payload lies about its line still posts, as the line'
);

reset role;

select results_eq(
  $$select a_debit.code, a_credit.code, jl.amount_minor, je.currency::text
      from finance.journal_entries je
      join finance.journal_lines jl on jl.journal_entry_id = je.id and jl.direction = 'debit'
      join finance.accounts a_debit on a_debit.id = jl.account_id
      join finance.journal_lines jc on jc.journal_entry_id = je.id and jc.direction = 'credit'
      join finance.accounts a_credit on a_credit.id = jc.account_id
     where je.source_id = 'e8000008-0000-4000-8000-000000000010'$$,
  $$values ('1200'::text, '4100'::text, 5000::bigint, 'TRY'::text)$$,
  'ACC-S1-13: a forged payload cannot change the amount, the accounts or the currency posted: the Folio line decides'
);

-- The real event for the same line arrives afterwards: same entry, no second.
create temp table lg_forged_entry as
  select id from finance.journal_entries
   where source_id = 'e8000008-0000-4000-8000-000000000010';
grant select on lg_forged_entry to ranza_worker;

set local role ranza_worker;
select app.set_worker_context('e2000002-0000-4000-8000-000000000001', 'ledger-test');

select is(
  (select app.post_folio_line_to_ledger(event_id) from lg_events where line_id = 'e8000008-0000-4000-8000-000000000010'),
  (select id from lg_forged_entry),
  'ACC-S1-14: the genuine event for a line a forged event already posted finds that entry'
);

reset role;

select is(
  (select count(*)::int from finance.journal_entries where source_id = 'e8000008-0000-4000-8000-000000000010'),
  1,
  'ACC-S1-14: a line is posted once however many events name it'
);

-- A lapsed Subscription does not stop the books being kept (ADR 0040).
update public.subscriptions set status = 'suspended'
 where organization_id = 'e2000002-0000-4000-8000-000000000001';

set local role ranza_worker;
select app.set_worker_context('e2000002-0000-4000-8000-000000000001', 'ledger-test');

select lives_ok(
  $$select app.post_folio_line_to_ledger((select event_id from lg_events where line_id = 'e8000008-0000-4000-8000-000000000011'))$$,
  'ACC-S1-21: a suspended Subscription does not stop a Folio line reaching the ledger'
);

reset role;

update public.subscriptions set status = 'active'
 where organization_id = 'e2000002-0000-4000-8000-000000000001';

-- Organization B has one entry of its own, so isolation is not an empty table.
set local role ranza_worker;
select app.set_worker_context('e2000002-0000-4000-8000-000000000002', 'ledger-test');
select lives_ok(
  $$select app.post_folio_line_to_ledger(event_id) from lg_events
     where line_id = 'e8000008-0000-4000-8000-000000000012'$$,
  'the worker, scoped to the other Organization, posts that Organization''s line'
);
reset role;

-- ---------------------------------------------------------------------------
-- 8. Reading: the permission, the reach, the commercial gates
-- ---------------------------------------------------------------------------

-- Every reader is asked the same three questions, so a denial can only be the
-- gate under test. The Owner is the control: if it read nothing, every empty
-- result below would be vacuous.
set local role ranza_app;
select app.set_request_context('e1000001-0000-4000-8000-000000000001');

select is(
  (select count(*)::int from finance.journal_entries where source_type = 'folio_line'),
  11,
  'ACC-S2-03: an Owner reads the Organization''s entries'
);

select is(
  (select count(*)::int from finance.journal_lines where journal_entry_id in
     (select id from finance.journal_entries where source_type = 'folio_line')),
  22,
  'ACC-S2-03: an Owner reads the Organization''s journal lines'
);

select is(
  (select count(*)::int from finance.accounts),
  6,
  'ACC-S2-03: an Owner reads the chart of accounts, and only their own Organization''s'
);

select app.set_request_context('e1000001-0000-4000-8000-000000000003');
select is(
  (select count(*)::int from finance.journal_entries where source_type = 'folio_line'),
  11,
  'ACC-S2-03: a Finance member with whole-Organization reach reads the ledger'
);

select app.set_request_context('e1000001-0000-4000-8000-000000000007');
select is(
  (select count(*)::int from finance.journal_entries where source_type = 'folio_line'),
  11,
  'ACC-S2-03: an Organization''s own role holding only finance.view_ledger reads the ledger: the permission is composable'
);

select app.set_request_context('e1000001-0000-4000-8000-000000000005');
select is_empty(
  $$select id from finance.journal_entries$$,
  'ACC-S2-04: a Front desk member reads no journal entry, though reach and subscription both admit them'
);
select is_empty(
  $$select id from finance.journal_lines$$,
  'ACC-S2-04: a Front desk member reads no journal line'
);
select is_empty(
  $$select id from finance.accounts$$,
  'ACC-S2-04: a Front desk member reads no account'
);

select app.set_request_context('e1000001-0000-4000-8000-000000000006');
select is_empty(
  $$select id from finance.journal_entries$$,
  'ACC-S2-04: a Housekeeping member reads no journal entry'
);
select is_empty(
  $$select id from finance.journal_lines$$,
  'ACC-S2-04: a Housekeeping member reads no journal line'
);
select is_empty(
  $$select id from finance.accounts$$,
  'ACC-S2-04: a Housekeeping member reads no account'
);

select app.set_request_context('e1000001-0000-4000-8000-000000000004');
select is_empty(
  $$select id from finance.journal_entries$$,
  'ACC-S2-05: a Finance member assigned to one Property reads nothing, because an entry has no Property to narrow to'
);

select app.set_request_context('e1000001-0000-4000-8000-000000000002');
select is(
  (select count(*)::int from finance.journal_entries),
  1,
  'ACC-S2-06: another Organization''s Owner reads their own single entry and none of the 11 beside it'
);
select is_empty(
  $$select id from finance.journal_lines where organization_id = 'e2000002-0000-4000-8000-000000000001'$$,
  'ACC-S2-06: another Organization''s Owner reads none of this Organization''s journal lines'
);
select is_empty(
  $$select id from finance.accounts where organization_id = 'e2000002-0000-4000-8000-000000000001'$$,
  'ACC-S2-06: another Organization''s Owner reads none of this Organization''s accounts'
);

-- The commercial gates, on the Owner who read everything above.
reset role;
update public.subscriptions set status = 'suspended'
 where organization_id = 'e2000002-0000-4000-8000-000000000001';
set local role ranza_app;
select app.set_request_context('e1000001-0000-4000-8000-000000000001');
select is_empty(
  $$select id from finance.journal_entries$$,
  'ACC-S2-07: an Owner whose Subscription is suspended reads no journal entry'
);
select is_empty(
  $$select id from finance.journal_lines$$,
  'ACC-S2-07: a suspended Subscription denies the journal lines too'
);

reset role;
update public.subscriptions set status = 'past_due'
 where organization_id = 'e2000002-0000-4000-8000-000000000001';
set local role ranza_app;
select app.set_request_context('e1000001-0000-4000-8000-000000000001');
select is(
  (select count(*)::int from finance.journal_entries where source_type = 'folio_line'),
  11,
  'ACC-S2-08: a past_due Subscription is a grace period and still reads the ledger (ADR 0040)'
);

reset role;
update public.subscriptions set status = 'active'
 where organization_id = 'e2000002-0000-4000-8000-000000000001';
update public.property_capabilities set enabled = false
 where property_id = 'e4000004-0000-4000-8000-000000000001' and capability_key = 'finance';
set local role ranza_app;
select app.set_request_context('e1000001-0000-4000-8000-000000000001');
select is_empty(
  $$select id from finance.journal_entries$$,
  'ACC-S2-09: an Organization that has switched Folio finance off reads no journal entry'
);

reset role;
update public.property_capabilities set enabled = true
 where property_id = 'e4000004-0000-4000-8000-000000000001' and capability_key = 'finance';

-- ---------------------------------------------------------------------------
-- 9. Folio lines outbox trigger notification
-- ---------------------------------------------------------------------------

select results_eq(
  $$select event_type from outbox.events where (payload->>'lineId')::uuid = 'e8000008-0000-4000-8000-000000000001'$$,
  $$values ('folio.line_posted'::text)$$,
  'folio_lines insert trigger automatically writes folio.line_posted outbox event'
);

select results_eq(
  $$select (payload->>'lineId')::uuid from outbox.events where (payload->>'lineId')::uuid = 'e8000008-0000-4000-8000-000000000001'$$,
  $$values ('e8000008-0000-4000-8000-000000000001'::uuid)$$,
  'outbox event carries the exact folio line id'
);

select results_eq(
  $$select (payload->>'amountMinor')::bigint, payload->>'currency'
    from outbox.events where (payload->>'lineId')::uuid = 'e8000008-0000-4000-8000-000000000001'$$,
  $$values (3500::bigint, 'TRY'::text)$$,
  'outbox event carries the complete immutable line snapshot'
);

select * from finish();
rollback;
