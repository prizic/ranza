# Platform Finance Module

Host-agnostic general ledger and accounting foundation (blueprint 5.10).

Owns chart of accounts, double-entry journal entries, and balanced postings.
Operational modules provide approved posting events; they do not write arbitrary journal entries directly.

## Module rules

A reusable platform module must not import or reference domain-specific host vocabulary (blueprint 9.8).
Translation between operational concepts and generic financial postings belongs in host adapters.
