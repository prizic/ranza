-- platform/finance — chart of accounts, journal entries and double-entry general ledger (blueprint 5.10).
--
-- Owned by packages/platform/finance (ADR 0008). Reusable, host-agnostic module:
-- Knows nothing about hospitality or Folios. A host adapter in packages/adapters/ranza-finance
-- translates operational events into generic balanced journal postings.
--
-- Invariants enforced here:
-- 1. Double-entry balance: sum(debits) = sum(credits) > 0 for every journal entry.
-- 2. Append-only immutability: journal entries and journal lines cannot be updated or deleted.
-- 3. Idempotency: (organization_id, source_type, source_id) is unique.
-- 4. Tenancy isolation via RLS for both ranza_app and ranza_worker.

create schema finance;

comment on schema finance is
  'Owned by packages/platform/finance. Chart of accounts, journal entries and general ledger.';

-- ---------------------------------------------------------------------------
-- Chart of accounts
-- ---------------------------------------------------------------------------

create table finance.accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  code text not null check (code ~ '^[0-9]{4,6}$'),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  type text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  normal_balance text not null check (normal_balance in ('debit', 'credit')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),

  unique (organization_id, code)
);

create index accounts_organization_idx on finance.accounts (organization_id, code);

-- ---------------------------------------------------------------------------
-- Journal entries (header)
-- ---------------------------------------------------------------------------

create table finance.journal_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entry_number bigint generated always as identity,
  entry_date date not null default current_date,
  posted_at timestamptz not null default now(),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  description text not null check (char_length(btrim(description)) between 1 and 500),
  source_type text not null check (source_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  source_id uuid not null,
  created_by uuid,
  created_at timestamptz not null default now(),

  unique (organization_id, source_type, source_id),
  unique (organization_id, id)
);

create index journal_entries_org_date_idx on finance.journal_entries (organization_id, entry_date desc);
create index journal_entries_source_idx on finance.journal_entries (organization_id, source_type, source_id);

-- ---------------------------------------------------------------------------
-- Journal lines (legs)
-- ---------------------------------------------------------------------------

create table finance.journal_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  journal_entry_id uuid not null,
  account_id uuid not null,
  direction text not null check (direction in ('debit', 'credit')),
  amount_minor bigint not null check (amount_minor > 0),
  description text,
  line_number int not null default 1,
  created_at timestamptz not null default now(),

  foreign key (organization_id, journal_entry_id)
    references finance.journal_entries (organization_id, id)
    on delete restrict,
  foreign key (account_id)
    references finance.accounts (id)
    on delete restrict
);

create index journal_lines_entry_idx on finance.journal_lines (journal_entry_id);
create index journal_lines_account_idx on finance.journal_lines (account_id);

-- ---------------------------------------------------------------------------
-- Invariants: balanced entries & immutability
-- ---------------------------------------------------------------------------

create function finance.verify_entry_balanced()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_debit_sum bigint;
  v_credit_sum bigint;
  v_line_count int;
begin
  select
    coalesce(sum(amount_minor) filter (where direction = 'debit'), 0),
    coalesce(sum(amount_minor) filter (where direction = 'credit'), 0),
    count(*)
  into v_debit_sum, v_credit_sum, v_line_count
  from finance.journal_lines
  where journal_entry_id = NEW.journal_entry_id;

  if v_line_count < 2 then
    raise exception 'journal entry % must have at least two lines, got %',
      NEW.journal_entry_id, v_line_count
      using errcode = '23514';
  end if;

  if v_debit_sum != v_credit_sum then
    raise exception 'journal entry % is not balanced: debits (%) != credits (%)',
      NEW.journal_entry_id, v_debit_sum, v_credit_sum
      using errcode = '23514';
  end if;

  if v_debit_sum <= 0 then
    raise exception 'journal entry % has zero total amount',
      NEW.journal_entry_id
      using errcode = '23514';
  end if;

  return NEW;
end;
$$;

create constraint trigger journal_entry_balance_check
  after insert on finance.journal_lines
  deferrable initially deferred
  for each row
  execute function finance.verify_entry_balanced();

create function finance.forbid_rewrite()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'finance records are append-only'
    using errcode = '42501';
end;
$$;

create trigger journal_entries_append_only
  before update or delete on finance.journal_entries
  for each row
  execute function finance.forbid_rewrite();

create trigger journal_lines_append_only
  before update or delete on finance.journal_lines
  for each row
  execute function finance.forbid_rewrite();

-- ---------------------------------------------------------------------------
-- Standard chart of accounts helper
-- ---------------------------------------------------------------------------

create function finance.ensure_default_accounts(p_organization_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into finance.accounts (organization_id, code, name, type, normal_balance)
  values
    (p_organization_id, '1000', 'Cash on Hand', 'asset', 'debit'),
    (p_organization_id, '1010', 'Bank Account', 'asset', 'debit'),
    (p_organization_id, '1020', 'Payment Card Clearing', 'asset', 'debit'),
    (p_organization_id, '1200', 'Accounts Receivable', 'asset', 'debit'),
    (p_organization_id, '4000', 'Accommodation Revenue', 'revenue', 'credit'),
    (p_organization_id, '4100', 'Other Revenue', 'revenue', 'credit')
  on conflict (organization_id, code) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Outbox notification trigger on folio_lines
-- ---------------------------------------------------------------------------

create function public.notify_folio_line_posted()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into outbox.events (organization_id, event_type, payload)
  values (
    NEW.organization_id,
    'folio.line_posted',
    jsonb_build_object('lineId', NEW.id, 'folioId', NEW.folio_id)
  );
  return NEW;
end;
$$;

create trigger folio_lines_notify_posted
  after insert on public.folio_lines
  for each row
  execute function public.notify_folio_line_posted();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table finance.accounts enable row level security;
alter table finance.accounts force row level security;
alter table finance.journal_entries enable row level security;
alter table finance.journal_entries force row level security;
alter table finance.journal_lines enable row level security;
alter table finance.journal_lines force row level security;

-- Policies for ranza_app
create policy accounts_read_app
  on finance.accounts for select
  to ranza_app
  using (organization_id in (select app.accessible_organization_ids()));

create policy accounts_insert_app
  on finance.accounts for insert
  to ranza_app
  with check (organization_id in (select app.accessible_organization_ids()));

create policy entries_read_app
  on finance.journal_entries for select
  to ranza_app
  using (organization_id in (select app.accessible_organization_ids()));

create policy entries_insert_app
  on finance.journal_entries for insert
  to ranza_app
  with check (organization_id in (select app.accessible_organization_ids()));

create policy lines_read_app
  on finance.journal_lines for select
  to ranza_app
  using (organization_id in (select app.accessible_organization_ids()));

create policy lines_insert_app
  on finance.journal_lines for insert
  to ranza_app
  with check (organization_id in (select app.accessible_organization_ids()));

-- Policies for ranza_worker
create policy accounts_read_worker
  on finance.accounts for select
  to ranza_worker
  using (organization_id = app.worker_organization_id());

create policy accounts_insert_worker
  on finance.accounts for insert
  to ranza_worker
  with check (organization_id = app.worker_organization_id());

create policy entries_read_worker
  on finance.journal_entries for select
  to ranza_worker
  using (organization_id = app.worker_organization_id());

create policy entries_insert_worker
  on finance.journal_entries for insert
  to ranza_worker
  with check (organization_id = app.worker_organization_id());

create policy lines_read_worker
  on finance.journal_lines for select
  to ranza_worker
  using (organization_id = app.worker_organization_id());

create policy lines_insert_worker
  on finance.journal_lines for insert
  to ranza_worker
  with check (organization_id = app.worker_organization_id());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant usage on schema finance to ranza_app, ranza_worker;
grant select, insert on finance.accounts to ranza_app, ranza_worker;
grant select, insert on finance.journal_entries to ranza_app, ranza_worker;
grant select, insert on finance.journal_lines to ranza_app, ranza_worker;
grant usage on all sequences in schema finance to ranza_app, ranza_worker;
grant execute on function finance.ensure_default_accounts(uuid) to ranza_app, ranza_worker;
