# Platform Finance Module

Host-agnostic general ledger (blueprint 5.10): the chart of accounts and
double-entry journal entries.

**This module reads the ledger; it does not write it.** Journal entries are
created by one database function that only the background worker may execute
(`app.post_folio_line_to_ledger`, ADR 0042 and ADR 0027). Operational modules
publish approved posting events and never write journal entries directly; no
application role can. Reads run under the caller's row-level security and need
the `finance.view_ledger` permission.

## Module rules

A reusable platform module must not import or reference domain-specific host vocabulary (blueprint 9.8).
Translation between operational concepts and ledger postings belongs to the host,
here the `app.*` function above, not to this package.
