# Operator lifecycle worker

## Trigger and ownership

The deployment scheduler sends `POST /api/jobs/operator-data` with `Authorization: Bearer $RANZA_SCHEDULER_SECRET`. The service-role key exists only in the server deployment. The Platform Admin owns policy approval and dry-run/execution authorization; the scheduler owns execution; the incident commander owns exhausted-run recovery.

## Execution contract

1. A Platform Admin approves versioned retention periods, archives one exact Operator UUID, creates a dry-run manifest, reviews it, and queues that exact run with an idempotency key.
2. The worker discovers only queued or due failed runs below three attempts.
3. The database atomically locks and claims the run with `FOR UPDATE SKIP LOCKED`, increments the persisted attempt, and revalidates the archived Operator, current policy version, scheduled state, and due time.
4. Anonymization deactivates Students, revokes their sessions through the existing trigger, removes credential hashes, breaks Auth links, replaces direct Student/Auth identifiers with tombstones, and archives Operator memberships.
5. Deletion is allowed only after a successful anonymization run and its separately approved deadline. It removes retained Wi-Fi secrets/tokens and leaves referential tombstones plus audit history rather than violating immutable operational records.
6. Success records a result summary and one completion audit. Repeated/concurrent calls cannot claim a succeeded run.

## Failure and retry

An execution error rolls back the destructive subtransaction but preserves the outer claim. The run becomes `failed` with a redacted error reference and one-minute then five-minute backoff. The third failed attempt becomes `exhausted`; it is never auto-retried. Every failed attempt is audited without SQL text or personal data.

For an exhausted run, diagnose by correlation/error reference, correct the policy or code, then require a new dry-run and explicit Platform Admin execution. Never update attempt counters or lifecycle state by hand. During rehearsal, verify the old exhausted run remains immutable and the replacement run targets the same single Operator UUID intentionally.

## Verification

Run `supabase db reset && supabase test db`. The lifecycle worker pgTAP suite covers service-only execution, due-date enforcement, successful anonymization and deletion, idempotent replay, persisted retry/backoff, exhaustion, and audit evidence. In staging, run the scheduler twice concurrently and confirm one completion audit and one attempt for the successful run.
