# Backup and restore rehearsal

Run only in an isolated staging/restore project. Restoring is destructive and requires the incident commander to confirm the exact project reference and restore point in writing.

## Prepare

1. Record source project reference, target restore project reference, release SHA, UTC start time, expected RPO/RTO, and approver.
2. Confirm automated backups/PITR are enabled for the production plan. Record the latest restorable point.
3. Inventory Storage separately: database backups preserve Storage metadata, not deleted object contents. Verify private Operator export expiry independently.
4. Create a canary Operator/Branch/audit record in staging and record non-sensitive IDs/counts.

## Rehearse

1. Restore or clone the selected backup into the explicitly named disposable target project using the Supabase Dashboard/approved Management API procedure.
2. Reapply any documented custom-role credentials, then validate migration history before accepting traffic.
3. Run health, schema, RLS negative, scheduler, and primary journey smokes against the restored target.
4. Compare canary counts and immutable snapshot/audit history to the chosen restore point. Verify Storage objects through the separate object recovery procedure.
5. Record observed RPO/RTO, missing data interval, logs, failures, owner, and cleanup confirmation.

Never rehearse by overwriting production. Supabase documents current backup retention, PITR, downtime, role-password, and Storage limitations in its [backup guide](https://supabase.com/docs/guides/platform/backups).
