# Pilot incident response

Trigger on a critical/high issue, failed finalization/export after supported retries, authentication-gateway spike, suspected disclosure, or missing final record.

1. Acknowledge and assign an incident commander. Preserve UTC time, release SHA, environment, actor class, Operator/Branch IDs when authorized, and correlation references—never copy secrets or sensitive payloads.
2. Contain via feature disable, scheduler stop, session revocation, or Operator suspension as appropriate.
3. Determine impact using audit/job records and tenant-scoped queries. Test cross-tenant exposure before declaring scope.
4. Recover with idempotent retry, forward fix, last-known-good deploy, or approved restore runbook.
5. Verify primary journeys and reconcile immutable snapshots/exports. Communicate status and workaround to the pilot owner.
6. Close only with timeline, root cause, affected records, evidence, corrective actions, owner/due date, and critical-error metric update.
