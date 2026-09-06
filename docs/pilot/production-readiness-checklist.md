# Production and formal-pilot readiness gate

This checklist is the release record for one immutable commit SHA. `pnpm readiness:report` must say `ready`; `blocked_external` is not approval to launch.

| Gate                                            | Required evidence                                                  | Owner                       | Status           |
| ----------------------------------------------- | ------------------------------------------------------------------ | --------------------------- | ---------------- |
| Fresh migration and authorization matrix        | CI database job URL; every pgTAP suite green                       | Engineering                 | Pending staging  |
| Student and Operator journeys                   | Production-like Playwright run plus device/browser matrix          | Engineering + pilot manager | Pending staging  |
| Turkish, English, Arabic/RTL, WCAG and keyboard | Automated report and signed manual keyboard notes                  | QA                          | Pending staging  |
| 1,000-Student performance                       | SQL plan output, p75 page and mutation measurements                | Engineering                 | Pending staging  |
| Security and redaction                          | Completed security runbook with advisor output                     | Security owner              | Pending staging  |
| Backup and restore                              | Timestamped rehearsal record with RPO/RTO                          | Incident commander          | Pending staging  |
| Scheduler retry and incident references         | Injected failure/retry evidence for Attendance, Meals, and exports | Engineering                 | Pending staging  |
| Rollback and feature disable                    | Timestamped rehearsal against the release SHA                      | Release owner               | Pending staging  |
| 14-day measurement                              | Completed tester log and computed metrics                          | Pilot manager               | Pending pilot    |
| Written launch approvals                        | All signatures in `launch-approvals.md` with document links        | Accountable approvers       | Pending approval |

## Automated commands

1. `pnpm install --frozen-lockfile`
2. `pnpm check`
3. `pnpm db:start && pnpm db:reset && pnpm db:test`
4. `pnpm readiness:security`
5. Run `supabase/tests/performance/1000-student-operator.sql` with `psql` against a disposable staging-equivalent database and attach its output.
6. `pnpm readiness:report -- --output artifacts/readiness.json`

Do not put credentials, Student names, Wi-Fi secrets, Balance descriptions, or session values in evidence. Record CI/run URLs, commit SHA, sanitized query plans, timestamps, pass/fail, and owner.

## Production-like journey matrix

- Student mobile: activate, set PIN, sign in, Attendance, Meals including zero selection, Announcement acknowledgment, Balance history, protected and QR Wi-Fi, sign out/cache check.
- Operator desktop: switch Branch, roster/import/transfer, staff scope, finalization/correction/export for Attendance and Meals, Announcement revision/follow-up, Balance reversal/export, Wi-Fi rotation.
- Platform desktop: Operator/Branch lifecycle, entitlement disable, MFA support context, export request/download, suspension denial.
- Negative matrix: anonymous, inactive Student, transferred Student, expired credential, unentitled feature, copied cross-Branch URL, cross-Operator UUID, another requester's export ID, expired QR/export, and support context after expiry.
- Browsers: current stable Safari/iOS, Chrome/Android, Chrome desktop, Edge, Firefox. Turkish is full depth; English and Arabic/RTL are smoke depth.

For every failure, capture the visible support/correlation reference and create a severity-tagged issue. No unresolved critical data error may enter the formal pilot.
