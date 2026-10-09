# @ranza/data-export

Data export on request and on a schedule (blueprint 7.5, 13.10, Phase 1 data
lifecycle). An export is a record with a requester and a state — `pending`,
`processing`, `ready`, `failed`, `expired` — produced by the worker for the
requester as they are when it runs, and downloaded by whoever the database lets
have it. [ADR 0043](../../../docs/adr/0043-an-export-is-a-record-the-worker-reads-for-its-requester-as-they-are-now.md)
says why; [`docs/features/data-export/`](../../../docs/features/data-export/edge-cases.csv)
says what it owes.

## What this module owns

The `data_exports` and `export_schedules` tables, their constraints, state
machine, grants and policies, and the functions the worker produces an export
through — in
[`20260916010100_data_export_and_schedules`](../../../prisma/migrations/20260916010100_data_export_and_schedules/migration.sql),
[`20260916010700_an_export_is_a_record_with_a_state`](../../../prisma/migrations/20260916010700_an_export_is_a_record_with_a_state/migration.sql)
and
[`20260916010710_the_worker_exports_through_functions`](../../../prisma/migrations/20260916010710_the_worker_exports_through_functions/migration.sql).

## Two halves

```ts
// The Staff Member's, on the runtime connection (apps/operator-workspace).
import { createDataExportModule } from "@ranza/data-export";

const exports = createDataExportModule({ db });
await exports.listExports(userId, propertyId); // never a file
await exports.requestExport(userId, propertyId, {
  resourceTypes: ["residents_guests"],
  format: "csv",
  requesterName: "Dilara Yılmaz", // or null: the address, cut to dilara@***
});
await exports.downloadExport(userId, exportId); // the file, audited, or null
await exports.createSchedule(userId, propertyId, {
  name: "Weekly",
  resourceTypes: ["rooms_beds"],
  format: "json",
  frequency: "weekly",
  creatorName: null,
});
await exports.updateScheduleStatus(userId, scheduleId, "paused");

// The worker's, on its own connection (apps/worker).
import { createExportRunner } from "@ranza/data-export";

const runner = createExportRunner({ db: workerDb });
await runner.processPendingExports(); // claim, read, finish or fail
await runner.processDueSchedules(); // start what is due, as the creator
await runner.sweepExports(); // fail the abandoned, clear the expired
```

## Rules

- Receives its dependencies; never reads `process.env` (ADR 0006).
- Decides nothing about who may. The insert policy and `app.may_export()` decide
  what may be asked for; `app.export_*()` read for the requester as they are now
  and refuse one who has lost the right; `app.read_data_export_file()` asks the
  downloader again. A refusal is one error that cannot be told from there being
  nothing.
- A request is five fields. The runtime role cannot set a status, bring a file
  or select one; `ranza_worker` holds no table privilege at all.
- Nothing swallows an error. A failure is a reason code on the row and the
  exception in the worker's log; a request and a download are in the audit log.
- A CSV cell that is text and would run as a formula is written as text.
