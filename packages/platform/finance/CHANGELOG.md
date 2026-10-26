# Changelog

## 0.2.0

- Reads for a ledger screen: `listJournalEntriesWithin` (newest first, narrowed
  by date, source, currency and account, paged by position) and
  `listCurrenciesWithin`.
- `getAccountBalancesWithin` takes a span of entry dates, and narrowing by
  currency no longer drops an account nothing was posted to in that currency:
  it is listed at nothing.

## 0.1.0

- The ledger is read by permission (`finance.view_ledger`) and written only by
  the worker's `app.post_folio_line_to_ledger()`. The write API
  (`postJournalEntryWithin`, `ensureDefaultAccountsWithin`, `assertPostableEntry`
  and the entry-input types and errors that served them) is removed: no runtime
  role holds the grants it needed.

## 0.0.0

- Platform finance foundations (blueprint 5.10).
- Schema `finance`: chart of accounts, journal entries, journal lines.
- Enforced double-entry balance invariant: sum of debits must equal sum of credits.
- Append-only immutability triggers on journal entries and journal lines.
