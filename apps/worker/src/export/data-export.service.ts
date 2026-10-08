import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import type { createDataExportModule } from "@ranza/data-export";
import { DATA_EXPORT } from "./tokens";

type DataExportModuleInstance = ReturnType<typeof createDataExportModule>;

@Injectable()
export class DataExportService implements OnApplicationShutdown {
  private readonly logger = new Logger(DataExportService.name);
  private stopping = false;
  private pendingPass: Promise<void> | null = null;
  private schedulePass: Promise<void> | null = null;

  constructor(
    @Inject(DATA_EXPORT)
    private readonly dataExport: DataExportModuleInstance,
  ) {}

  /** Process pending on-demand and scheduled export jobs */
  @Interval("data_export.pending", 15_000)
  async tickPending(): Promise<void> {
    if (this.stopping || this.pendingPass) return;
    this.pendingPass = this.runPending().finally(() => {
      this.pendingPass = null;
    });
    await this.pendingPass;
  }

  /** Evaluate recurring export schedules and trigger runs */
  @Interval("data_export.schedules", 60_000)
  async tickSchedules(): Promise<void> {
    if (this.stopping || this.schedulePass) return;
    this.schedulePass = this.runSchedules().finally(() => {
      this.schedulePass = null;
    });
    await this.schedulePass;
  }

  private async runPending(): Promise<void> {
    try {
      const report = await this.dataExport.processPendingExports();
      if (report.processed > 0) {
        this.logger.log(
          `processed ${report.processed} exports: succeeded ${report.succeeded}, failed ${report.failed}`,
        );
      }
    } catch (error) {
      this.logger.error(`export processing pass failed: ${describe(error)}`);
    }
  }

  private async runSchedules(): Promise<void> {
    try {
      const report = await this.dataExport.processDueSchedules();
      if (report.exportsTriggered > 0) {
        this.logger.log(
          `evaluated ${report.schedulesEvaluated} schedules, triggered ${report.exportsTriggered} exports`,
        );
      }
    } catch (error) {
      this.logger.error(`export schedule pass failed: ${describe(error)}`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    await Promise.all([this.pendingPass, this.schedulePass]);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
