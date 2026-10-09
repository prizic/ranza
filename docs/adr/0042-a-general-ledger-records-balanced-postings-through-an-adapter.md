# 0042. A general ledger records balanced postings through an adapter

Date: 2026-10-08

Status: Proposed

Proposed amendment: 2026-10-09 (RANZ-41), pending the owner. Decision 2 (a TypeScript
adapter maps Folio lines) and the "synchronous posting" sentence of decision 3 are
replaced by the section "Proposed amendment: who reads, who posts" below; decision 1
stands. The original text is left as written so the owner can see what changes.

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

## Proposed amendment: who reads, who posts

Status: Proposed. Applied in
`20260916010600_the_ledger_is_read_by_permission_and_posted_by_the_worker`, so the
owner can accept it as built or have it reversed.

### Context

A review of the ledger as shipped found two holes that decision 1 claimed were
closed ("tenant isolation"):

1. **Any member read and posted the books.** The ledger tables' policies asked
   only for membership, and `ranza_app` held INSERT on all three tables. A
   housekeeper could read every journal entry and write one.
2. **Closing those grants was not enough.** The worker posted what the
   `folio.line_posted` payload said. `ranza_app` may publish any event for its own
   Organization (`events_publish_own_scope`), so a forged event was a forged entry
   by another route.

### Decision

1. **Reading is a permission, behind the commercial gates.** `finance.view_ledger`,
   a catalogue permission of Billing and Folios, shipped on Owner, Manager and
   Finance. The read policies on all three tables ask membership,
   **whole-Organization reach**, the permission, and
   `can_use_capability_in_organization()` on the Folio `finance` capability. An entry carries no Property (blueprint 9.8), so
   reach follows ADR 0031's rule for a record with no location: a reader assigned to
   one Property reads nothing. No accounting capability exists to ask, so the closest
   existing gate is used. A suspended or cancelled Subscription denies; `past_due`
   does not (ADR 0040).
2. **Nothing writes the ledger but the worker, through one function and no table
   grant** (ADR 0027). `ranza_app` holds SELECT only; `ranza_worker` holds nothing on
   the tables. `app.post_folio_line_to_ledger(event_id)` is a security definer,
   executable by `ranza_worker` alone.
3. **The function derives the entry from the Folio line, never from the
   payload.** It takes the event id, checks the event is a `folio.line_posted` of
   the worker's own Organization, and reads the line from `folio_lines`, which is
   append-only. A forged payload can at worst name a real line, and that line owes
   exactly one entry. Every refusal is a raise, so the outbox records it, retries it
   and leaves it dead rather than delivering it.
4. **The mapping moves into that function.** The accounts are the ones decision 2
   named; they now live beside the function that applies them instead of in a
   TypeScript adapter that had to be handed the line by a process allowed to lie
   about it. `packages/adapters/ranza-finance` is removed, and `packages/platform/finance`
   is a read-only contract (`…Within` reads, ADR 0028). The adapter tier stays, empty,
   for mappings that can be done in TypeScript.

### Consequences

- Posting is asynchronous only. A screen cannot show a posting in the transaction
  that made the line (ACC-DEF-07).
- A change to the mapping is a migration that replaces the function, not a code
  change. The pgTAP suite pins every case.
- The two commit-time checks (`verify_entry_balanced`, `verify_entry_has_lines`) became
  security definers. They are deferred to COMMIT and run as whoever commits, which is
  the worker, now without a read on the tables.
- A Finance member assigned to one Property reads no ledger until entries carry a
  location (ACC-DEF-01). Owner to confirm that is the intended default.
- Not built: periods and close, statements, a ledger screen, chart-of-accounts
  maintenance, an Accounting Entitlement, and payroll as a second source
  (`docs/features/accounting/edge-cases.csv`, `ACC-NB-*` and `ACC-DEF-*`).
