# @ranza/data-export

Data export on request and on a schedule (blueprint 7.5, 13.10, Phase 1 data lifecycle).
Exports are persistent records with requester attribution, state transitions (`pending`, `processing`, `ready`, `failed`), datasets, formats, retention metrics, and schedule management.

## What this module owns

The `data_exports` and `export_schedules` tables, constraints, security definers, and row-level security policies — in
[`prisma/migrations/20260916010100_data_export_and_schedules`](../../../prisma/migrations/20260916010100_data_export_and_schedules/migration.sql).

## Contract

```ts
import { createDataExportModule } from "@ranza/data-export";

const exportModule = createDataExportModule({ db });
await exportModule.listExports(userId);
await exportModule.getExport(userId, exportId);
await exportModule.requestExport(userId, {
  resourceTypes: ["residents_guests"],
  format: "csv",
});
await exportModule.listSchedules(userId);
await exportModule.createSchedule(userId, {
  name: "Weekly Export",
  resourceTypes: ["reservations_stays"],
  format: "json",
  frequency: "weekly",
});
await exportModule.updateScheduleStatus(userId, scheduleId, "paused");
await exportModule.processPendingExports();
await exportModule.processDueSchedules();
```

## Rules

- Receives its dependencies; never reads `process.env` (ADR 0006).
- Row-level security enforces tenant boundaries and permissions (`data_export.read`, `data_export.create`).
- An export is a persistent database record with an attribution and state lifecycle, never an ad-hoc throwaway file.
