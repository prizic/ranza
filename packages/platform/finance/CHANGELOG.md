# Changelog

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
