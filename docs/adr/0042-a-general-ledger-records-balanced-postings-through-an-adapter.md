# 0042. A general ledger records balanced postings through an adapter

Date: 2026-10-08

Status: Proposed

Builds on [ADR 0008](0008-a-module-owns-a-schema-not-a-migration-history.md),
[ADR 0015](0015-money-is-an-integer-a-balance-is-a-sum-and-a-correction-is-a-line.md),
[ADR 0017](0017-cross-module-facts-travel-through-a-transactional-outbox.md), and
[ADR 0020](0020-sync-inside-the-transaction-or-async-through-the-outbox.md).

## Context

Blueprint section 5.10 specifies Accounting and Finance: chart of accounts,
journal entries, accounting periods, and financial statements. Operational
modules (such as Billing and Folios, section 5.9) provide approved posting
events; they must not write arbitrary journal entries directly.

Blueprint section 9.8 establishes module tiers:

- `packages/platform/finance`: Host-agnostic platform module. Must not reference
  hospitality-specific domain vocabulary.
- `packages/adapters/ranza-finance`: Host adapter translating operational
  events into generic balanced postings.
- `packages/ranza/folios`: Operational billing module, unwidened by accounting
  concepts.

When a financial line is recorded on a billing account, it must reach the general
ledger without requiring manual re-entry.

## Decision

### 1. General ledger lives in a host-agnostic platform module

`packages/platform/finance` owns the `finance` PostgreSQL schema (ADR 0008). It
holds `finance.accounts` (chart of accounts), `finance.journal_entries`, and
`finance.journal_lines`.

It enforces:

- **Double-entry balance:** Total debits must equal total credits for every
  journal entry ($\sum \text{debits} = \sum \text{credits} > 0$). A database
  constraint trigger rejects any unbalanced entry.
- **Append-only immutability:** Update and delete are forbidden by trigger and
  by row-level security. Corrections must be made by reversing entries.
- **Idempotency:** Unique index on `(organization_id, source_type, source_id)`
  prevents duplicate postings from the same operational source event.
- **Tenant isolation:** Separate RLS policies for `ranza_app` and `ranza_worker`.

### 2. Operational translation lives in a dedicated host adapter

`packages/adapters/ranza-finance` maps operational lines to standard chart of
accounts entries:

- Charges map to: Debit Accounts Receivable (1200), Credit Revenue (4000/4100).
- Payments map to: Debit Cash/Bank (1000/1010/1020), Credit Accounts Receivable (1200).
- Reversals mirror the cancelled transaction legs exactly.

### 3. Automatic delivery via outbox and worker

An `after insert` trigger on `public.folio_lines` emits `folio.line_posted` into
`outbox.events`. The background worker (`apps/worker`) claims the event and
executes `postFolioLineToLedgerWithin` via the adapter, ensuring every line
reaches the general ledger without manual re-entry.
Synchronous posting is also supported via `postFolioLineToLedgerWithin`.

## Consequences

- Folio operations remain decoupled from general ledger accounting internals.
- No human operator needs to re-enter billing transactions into the accounting
  system.
- Re-running the posting function is strictly idempotent.
