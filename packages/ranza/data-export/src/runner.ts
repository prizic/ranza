import {
  EXPORT_FILE_LIMIT_BYTES,
  EXPORT_JOBS,
  EXPORT_RESOURCE_TYPES,
  ExportTooLargeError,
  type ExportFailure,
  type ExportFailureReason,
  type ExportFormat,
  type ExportResourceType,
  type ProcessExportsReport,
  type ProcessSchedulesReport,
  type SweepExportsReport,
} from "./contracts";
import { DATASETS, readDataset } from "./datasets";
import type { DataExportDeps, ExportClient } from "./ports";
import { renderCsv, renderJson, type Dataset } from "./render";

/**
 * The worker's half of exporting (ADR 0043, ADR 0018).
 *
 * This decides nothing about who may have what. The database does, in the
 * functions it calls: which exports are waiting, claiming one, reading each
 * dataset for the export's requester as they are now, and finishing, failing or
 * expiring it. What is left here is order and file format.
 *
 * An export is claimed in a transaction of its own, so it leaves the queue the
 * moment a job takes it: one that then fails cannot sit at the front of the
 * oldest fifty and hide the rest. It is built and finished in a second
 * transaction, at one snapshot so that two datasets in one file agree, and a
 * failure there is written down in a third. Anything the third cannot write is
 * reported and left for the stalled sweep, which fails it when it has been
 * quiet for half an hour.
 */
const TRANSACTION = { maxWait: 15_000, timeout: 120_000 };

/** The SQLSTATE-free way a reader says "the requester may no longer export this". */
const REFUSED = /export_refused:(requester_not_permitted)/;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The reason an export failed, from the exception that stopped it. Only the
 * three the worker knows by name are anything but `internal_error`; the rest of
 * the exception is the log's business.
 */
export function failureReasonOf(error: unknown): ExportFailureReason {
  if (error instanceof ExportTooLargeError) return "too_large";
  const message = messageOf(error);
  if (REFUSED.test(message)) return "requester_not_permitted";
  if (message.includes("data_exports_file_is_bounded")) return "too_large";
  return "internal_error";
}

/** The datasets an export names, in the order the catalogue lists them. */
function inCatalogueOrder(named: readonly string[]): ExportResourceType[] {
  return EXPORT_RESOURCE_TYPES.filter((type) => named.includes(type));
}

export function createExportRunner({ db }: DataExportDeps) {
  async function inContext<T>(
    organizationId: string,
    job: string,
    run: (tx: ExportClient) => Promise<T>,
    options: { isolationLevel?: "RepeatableRead" } = {},
  ): Promise<T> {
    return db.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          "select app.set_worker_context($1::uuid, $2)",
          organizationId,
          job,
        );
        return run(tx);
      },
      { ...TRANSACTION, ...options },
    );
  }

  async function build(
    tx: ExportClient,
    exportId: string,
    resourceTypes: readonly string[],
    format: ExportFormat,
  ): Promise<void> {
    const datasets: Dataset[] = [];
    const recordCounts: Record<string, number> = {};
    for (const type of inCatalogueOrder(resourceTypes)) {
      const rows = await readDataset(tx, type, exportId);
      datasets.push({ key: type, columns: DATASETS[type].columns, rows });
      recordCounts[type] = rows.length;
    }

    const content =
      format === "json" ? renderJson(datasets) : renderCsv(datasets);
    if (Buffer.byteLength(content, "utf8") > EXPORT_FILE_LIMIT_BYTES) {
      throw new ExportTooLargeError("export");
    }

    await tx.$executeRaw`
      select app.complete_data_export(
               ${exportId}::uuid, ${content}, ${JSON.stringify(recordCounts)}::jsonb)`;
  }

  async function recordFailure(
    organizationId: string,
    exportId: string,
    reason: ExportFailureReason,
  ): Promise<void> {
    await inContext(
      organizationId,
      EXPORT_JOBS.run,
      (tx) =>
        tx.$queryRaw<{ failed: boolean }[]>`
        select app.fail_data_export(${exportId}::uuid, ${reason}) as failed`,
    );
  }

  /** Every pending export, oldest first, one at a time. */
  async function processPendingExports(): Promise<ProcessExportsReport> {
    const pending = await db.$queryRaw<
      { exportId: string; organizationId: string }[]
    >`
      select export_id as "exportId", organization_id as "organizationId"
        from app.pending_data_exports()`;

    const report: ProcessExportsReport = {
      processed: pending.length,
      succeeded: 0,
      failures: [],
      unrecorded: [],
    };

    for (const { exportId, organizationId } of pending) {
      let claimed: { resourceTypes: string[]; format: ExportFormat } | null;
      try {
        const [row] = await inContext(
          organizationId,
          EXPORT_JOBS.run,
          (tx) =>
            tx.$queryRaw<{ resourceTypes: string[]; format: ExportFormat }[]>`
              select resource_types as "resourceTypes", format
                from app.claim_data_export(${exportId}::uuid)`,
        );
        claimed = row ?? null;
      } catch (error) {
        await fail(report, organizationId, exportId, error);
        continue;
      }
      // Another replica has it.
      if (!claimed) continue;

      try {
        await inContext(
          organizationId,
          EXPORT_JOBS.run,
          (tx) => build(tx, exportId, claimed.resourceTypes, claimed.format),
          { isolationLevel: "RepeatableRead" },
        );
        report.succeeded += 1;
      } catch (error) {
        await fail(report, organizationId, exportId, error);
      }
    }
    return report;
  }

  async function fail(
    report: ProcessExportsReport,
    organizationId: string,
    exportId: string,
    error: unknown,
  ): Promise<void> {
    const failure: ExportFailure = {
      exportId,
      reason: failureReasonOf(error),
      error,
    };
    try {
      await recordFailure(organizationId, exportId, failure.reason);
      report.failures.push(failure);
    } catch (recordingError) {
      report.unrecorded.push({ exportId, error: recordingError });
      report.failures.push(failure);
    }
  }

  /** Every due schedule starts its export, once. */
  async function processDueSchedules(): Promise<ProcessSchedulesReport> {
    const due = await db.$queryRaw<
      { scheduleId: string; organizationId: string }[]
    >`
      select schedule_id as "scheduleId", organization_id as "organizationId"
        from app.export_schedules_due()`;

    const report: ProcessSchedulesReport = {
      schedulesEvaluated: due.length,
      exportsTriggered: 0,
      failures: [],
    };
    for (const { scheduleId, organizationId } of due) {
      try {
        const [row] = await inContext(
          organizationId,
          EXPORT_JOBS.schedule,
          (tx) =>
            tx.$queryRaw<{ started: string | null }[]>`
              select app.run_export_schedule(${scheduleId}::uuid) as started`,
        );
        if (row?.started) report.exportsTriggered += 1;
      } catch (error) {
        report.failures.push({ scheduleId, error });
      }
    }
    return report;
  }

  /**
   * Fails the exports a worker claimed and never finished, and clears the
   * content of the ones past their retention.
   */
  async function sweepExports(): Promise<SweepExportsReport> {
    const report: SweepExportsReport = { stalled: 0, expired: 0, failures: [] };

    const stalled = await db.$queryRaw<
      { exportId: string; organizationId: string }[]
    >`
      select export_id as "exportId", organization_id as "organizationId"
        from app.stalled_data_exports()`;
    for (const { exportId, organizationId } of stalled) {
      try {
        await recordFailure(organizationId, exportId, "worker_stopped");
        report.stalled += 1;
      } catch (error) {
        report.failures.push({ exportId, error });
      }
    }

    const expired = await db.$queryRaw<
      { exportId: string; organizationId: string }[]
    >`
      select export_id as "exportId", organization_id as "organizationId"
        from app.expired_data_exports()`;
    for (const { exportId, organizationId } of expired) {
      try {
        const [row] = await inContext(
          organizationId,
          EXPORT_JOBS.sweep,
          (tx) =>
            tx.$queryRaw<{ expired: boolean }[]>`
              select app.expire_data_export(${exportId}::uuid) as expired`,
        );
        if (row?.expired) report.expired += 1;
      } catch (error) {
        report.failures.push({ exportId, error });
      }
    }
    return report;
  }

  return { processPendingExports, processDueSchedules, sweepExports };
}

export type ExportRunner = ReturnType<typeof createExportRunner>;
