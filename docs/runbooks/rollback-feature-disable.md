# Rollback and feature-disable rehearsal

## Default containment order

1. Identify release SHA, Operator/Branch, capability, incident severity, and correlation references.
2. Disable the affected capability through the audited Entitlement/configuration boundary. Confirm denial at UI, API, and database RPC boundaries while unaffected capabilities remain usable.
3. Stop the affected scheduler with the deployment control; do not delete job history. Retry only idempotent jobs through supported operations.
4. If code rollback is required, redeploy the last known-good immutable artifact. Do not reverse applied database migrations or rewrite Git history.
5. If the current schema is incompatible, ship a reviewed forward-only compatibility migration before routing traffic.
6. Run health, authorization negatives, and the affected critical journey. Record recovery time and decision owner.

## Rehearsal record

Capture staging environment, old/new SHA, capability state before/after, job backlog, exact containment and restore timestamps, validation URLs, residual risk, and explicit release-owner sign-off. A feature-disable UI change alone is insufficient; mutation RPC denial must be proven.
