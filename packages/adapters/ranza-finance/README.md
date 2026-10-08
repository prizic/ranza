# Ranza Finance Adapter

Connects Ranza Folio operational records to the generic `@ranza/platform-finance` general ledger (blueprint 5.10, 9.8).

Translates Folio lines (charges, payments, reversals) into balanced double-entry journal postings:

- Charge: Debit Accounts Receivable (1200), Credit Revenue (4000/4100)
- Payment: Debit Cash/Bank (1000/1010/1020), Credit Accounts Receivable (1200)
- Reversal: Exact mirror cancellation of the reversed line
