import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import type { ExportRunner } from "@ranza/data-export";
import { DATA_EXPORT } from "./tokens";

/**
 * Produces the exports Staff Members asked for (ADR 0043).
 *
 * Like the outbox dispatcher and the day closer, this class decides *when* and
 * nothing else. Which exports are waiting, whether the requester may still have
 * what they asked for and what ends up in the file are the database's answers,
 * reached through `@ranza/data-export`. Every replica runs these intervals; the
 * claim on each export is what makes that safe, not these timers.
 *
 * Every export that did not finish is named here, with the reason the
 * database now holds for it and the exception behind it. The exception is the
 * only place the detail goes: the row says `internal_error` and nothing more,
 * so a failure nobody reads in this log is a failure nobody learns the cause of.
 */
@Injectable()
export class DataExportService implements OnApplicationShutdown {
  private readonly logger = new Logger(DataExportService.name);
  private stopping = false;
  private pendingPass: Promise<void> | null = null;
  private schedulePass: Promise<void> | null = null;
  private sweepPass: Promise<void> | null = null;

  constructor(@Inject(DATA_EXPORT) private readonly runner: ExportRunner) {}

  /** Produce the exports waiting, oldest first. */
  @Interval("data_export.pending", 15_000)
  async tickPending(): Promise<void> {
    if (this.stopping || this.pendingPass) return;
    this.pendingPass = this.runPending().finally(() => {
      this.pendingPass = null;
    });
    await this.pendingPass;
  }

  /** Start the exports that schedules say are due. */
  @Interval("data_export.schedules", 60_000)
  async tickSchedules(): Promise<void> {
    if (this.stopping || this.schedulePass) return;
    this.schedulePass = this.runSchedules().finally(() => {
      this.schedulePass = null;
    });
    await this.schedulePass;
  }

  /** Fail the exports a worker abandoned, and clear the ones past retention. */
  @Interval("data_export.sweep", 300_000)
  async tickSweep(): Promise<void> {
    if (this.stopping || this.sweepPass) return;
    this.sweepPass = this.runSweep().finally(() => {
      this.sweepPass = null;
    });
    await this.sweepPass;
  }

  private async runPending(): Promise<void> {
    try {
      const report = await this.runner.processPendingExports();
      if (report.processed > 0) {
        this.logger.log(
          `data_export.pass: ${report.processed} waiting, ${report.succeeded} finished, ${report.failures.length} failed`,
        );
      }
      for (const failure of report.failures) {
        this.logger.error(
          `data_export.failed: export ${failure.exportId} as ${failure.reason}: ${describe(failure.error)}`,
        );
      }
      for (const lost of report.unrecorded) {
        this.logger.error(
          `data_export.failure_unrecorded: export ${lost.exportId} is still not marked failed and will be swept: ${describe(lost.error)}`,
        );
      }
    } catch (error) {
      // The pass could not even ask what is waiting — the database is
      // unreachable, or a grant has gone. Logged rather than thrown: a
      // rejection in a scheduled callback takes the process down.
      this.logger.error(`data_export.pass_failed: ${describe(error)}`);
    }
  }

  private async runSchedules(): Promise<void> {
    try {
      const report = await this.runner.processDueSchedules();
      if (report.exportsTriggered > 0) {
        this.logger.log(
          `data_export.schedules: ${report.schedulesEvaluated} due, ${report.exportsTriggered} started`,
        );
      }
      for (const failure of report.failures) {
        this.logger.error(
          `data_export.schedule_failed: schedule ${failure.scheduleId}: ${describe(failure.error)}`,
        );
      }
    } catch (error) {
      this.logger.error(`data_export.schedules_failed: ${describe(error)}`);
    }
  }

  private async runSweep(): Promise<void> {
    try {
      const report = await this.runner.sweepExports();
      if (report.stalled > 0 || report.expired > 0) {
        this.logger.log(
          `data_export.sweep: ${report.stalled} abandoned failed, ${report.expired} expired`,
        );
      }
      for (const failure of report.failures) {
        this.logger.error(
          `data_export.sweep_failed: export ${failure.exportId}: ${describe(failure.error)}`,
        );
      }
    } catch (error) {
      this.logger.error(`data_export.sweep_pass_failed: ${describe(error)}`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    await Promise.all([this.pendingPass, this.schedulePass, this.sweepPass]);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
