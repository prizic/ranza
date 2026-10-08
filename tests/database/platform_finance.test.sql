-- platform/finance: chart of accounts, journal entries, balanced postings,
-- append-only immutability, and tenant isolation (blueprint 5.10).
--
-- Proves:
--   - default accounts helper creates standard chart of accounts
--   - balanced journal entry posts cleanly
--   - unbalanced entry is refused by trigger
--   - append-only trigger prevents updates and deletes
--   - tenant isolation: Organization A cannot see Organization B's journal entries
--   - folio_lines insert trigger notifies outbox with 'folio.line_posted'

begin;
select plan(19);

insert into public.users (id, email) values
  ('e1000001-0000-4000-8000-000000000001', 'finance-a@example.test'),
  ('e1000001-0000-4000-8000-000000000002', 'finance-b@example.test');

insert into public.organizations (id, name, status) values
  ('e2000002-0000-4000-8000-000000000001', 'Finance Org A', 'active'),
  ('e2000002-0000-4000-8000-000000000002', 'Finance Org B', 'active');

insert into public.organization_memberships
  (organization_id, user_id, role, access_scope)
values
  ('e2000002-0000-4000-8000-000000000001',
   'e1000001-0000-4000-8000-000000000001', 'owner', 'organization_wide'),
  ('e2000002-0000-4000-8000-000000000002',
   'e1000001-0000-4000-8000-000000000002', 'owner', 'organization_wide');

-- ---------------------------------------------------------------------------
-- 1. Standard chart of accounts helper
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

-- Ensure Org B also has default accounts for cross-tenant testing
select finance.ensure_default_accounts('e2000002-0000-4000-8000-000000000002');

create temp table test_b_acc as
  select id from finance.accounts
  where organization_id = 'e2000002-0000-4000-8000-000000000002' and code = '1200';
grant select on test_b_acc to ranza_app;

-- ---------------------------------------------------------------------------
-- 2. Balanced journal entry insertion
-- ---------------------------------------------------------------------------

set local role ranza_app;
select app.set_request_context('e1000001-0000-4000-8000-000000000001');

select lives_ok(
  $$
  with entry as (
    insert into finance.journal_entries
      (organization_id, currency, description, source_type, source_id)
    values
      ('e2000002-0000-4000-8000-000000000001', 'TRY', 'Valid balanced charge',
       'folio_line', 'e3000003-0000-4000-8000-000000000001')
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
       'folio_line', 'e3000003-0000-4000-8000-000000000010', '2026-09-18'::date)
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

-- ---------------------------------------------------------------------------
-- 3. Composite foreign key prevents cross-tenant account pollution
-- ---------------------------------------------------------------------------

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
  'referencing another organization account is refused by composite foreign key'
);

-- ---------------------------------------------------------------------------
-- 4. Unique line number per entry
-- ---------------------------------------------------------------------------

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
  'duplicate line_number on journal entry is refused by unique constraint'
);

-- ---------------------------------------------------------------------------
-- 5. Unbalanced entry is rejected by trigger
-- ---------------------------------------------------------------------------

select throws_ok(
  $$
  with entry as (
    insert into finance.journal_entries
      (organization_id, currency, description, source_type, source_id)
    values
      ('e2000002-0000-4000-8000-000000000001', 'TRY', 'Unbalanced charge',
       'folio_line', 'e3000003-0000-4000-8000-000000000002')
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
  'unbalanced entry is refused by balance check trigger'
);

select throws_ok(
  $$
  insert into finance.journal_entries
    (organization_id, currency, description, source_type, source_id)
  values
    ('e2000002-0000-4000-8000-000000000001', 'TRY', 'Orphan header without lines',
     'folio_line', 'e3000003-0000-4000-8000-000000000099');
  set constraints all immediate;
  $$,
  '23514', NULL,
  'a journal entry without at least two lines is refused by deferred trigger'
);

-- ---------------------------------------------------------------------------
-- 6. Idempotency: duplicate source posting refused
-- ---------------------------------------------------------------------------

select throws_ok(
  $$
  insert into finance.journal_entries
    (organization_id, currency, description, source_type, source_id)
  values
    ('e2000002-0000-4000-8000-000000000001', 'TRY', 'Duplicate posting',
     'folio_line', 'e3000003-0000-4000-8000-000000000001')
  $$,
  '23505', NULL,
  're-posting the same source record is refused by unique constraint'
);

-- ---------------------------------------------------------------------------
-- 7. Immutability: update, delete, and truncate are refused by triggers
-- ---------------------------------------------------------------------------

reset role;
set constraints all immediate;

select throws_ok(
  $$update finance.journal_entries set description = 'Tampered' where source_id = 'e3000003-0000-4000-8000-000000000001'$$,
  '42501', NULL,
  'updating a journal entry is refused by append-only trigger'
);

select throws_ok(
  $$delete from finance.journal_entries where source_id = 'e3000003-0000-4000-8000-000000000001'$$,
  '42501', NULL,
  'deleting a journal entry is refused by append-only trigger'
);

select throws_ok(
  $$truncate table finance.journal_lines$$,
  '42501', NULL,
  'truncating journal lines is refused by append-only trigger'
);

select throws_ok(
  $$truncate table finance.journal_entries, finance.journal_lines$$,
  '42501', NULL,
  'truncating journal entries is refused by append-only trigger'
);

-- ---------------------------------------------------------------------------
-- 8. Tenant isolation via RLS
-- ---------------------------------------------------------------------------

set local role ranza_app;
select app.set_request_context('e1000001-0000-4000-8000-000000000002'); -- Actor from Org B

select is_empty(
  $$select * from finance.journal_entries where organization_id = 'e2000002-0000-4000-8000-000000000001'$$,
  'an actor from Org B cannot read Org A journal entries'
);

select is_empty(
  $$select * from finance.accounts where organization_id = 'e2000002-0000-4000-8000-000000000001'$$,
  'an actor from Org B cannot read Org A accounts'
);

select throws_ok(
  $$
  insert into finance.journal_entries
    (organization_id, currency, description, source_type, source_id)
  values
    ('e2000002-0000-4000-8000-000000000001', 'TRY', 'Cross-tenant write',
     'folio_line', 'e3000003-0000-4000-8000-000000000099')
  $$,
  '42501', NULL,
  'writing into another organization journal is denied by RLS'
);

-- ---------------------------------------------------------------------------
-- 9. Folio lines outbox trigger notification
-- ---------------------------------------------------------------------------

reset role;

insert into public.properties (id, organization_id, name, currency)
values ('e4000004-0000-4000-8000-000000000001', 'e2000002-0000-4000-8000-000000000001', 'Finance Property', 'TRY');

insert into public.accommodation_units (id, property_id, organization_id, name, unit_type, capacity)
values ('e5000005-0000-4000-8000-000000000001', 'e4000004-0000-4000-8000-000000000001', 'e2000002-0000-4000-8000-000000000001', 'FIN-101', 'room', 2);

insert into public.stays (id, property_id, organization_id, accommodation_unit_id, stay_type, status, starts_on, ends_on)
values (
  'e6000006-0000-4000-8000-000000000001',
  'e4000004-0000-4000-8000-000000000001',
  'e2000002-0000-4000-8000-000000000001',
  'e5000005-0000-4000-8000-000000000001',
  'guest',
  'in_house',
  app.property_today('e4000004-0000-4000-8000-000000000001'),
  app.property_today('e4000004-0000-4000-8000-000000000001') + 1
);

insert into public.folios (id, property_id, organization_id, stay_id, currency)
values ('e7000007-0000-4000-8000-000000000001', 'e4000004-0000-4000-8000-000000000001', 'e2000002-0000-4000-8000-000000000001', 'e6000006-0000-4000-8000-000000000001', 'TRY');

insert into public.folio_lines (id, organization_id, property_id, folio_id, line_type, description, amount_minor)
values ('e8000008-0000-4000-8000-000000000001', 'e2000002-0000-4000-8000-000000000001', 'e4000004-0000-4000-8000-000000000001', 'e7000007-0000-4000-8000-000000000001', 'charge', 'Test Minibar Charge', 3500);

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

rollback;
