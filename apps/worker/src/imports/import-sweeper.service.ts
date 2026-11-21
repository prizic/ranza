import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import type { ImportSweeper } from "@ranza/imports";
import { IMPORT_SWEEPER } from "./tokens";

/**
 * Forgets the rows of imports nobody has touched for seven days, and closes
 * the ones still open so they stop holding their Property (ADR 0065).
 *
 * This class decides *when* and nothing else. Which imports are past their
 * time is the database's answer, reached through `@ranza/imports`. Every
 * replica runs this interval; forgetting rows that are already forgotten
 * changes nothing, which is what makes that safe.
 *
 * An hour, because the promise is seven days and nobody is waiting on the
 * minute it is kept. A pass with nothing due costs one query.
 */
@Injectable()
export class ImportSweeperService implements OnApplicationShutdown {
  private readonly logger = new Logger(ImportSweeperService.name);
  private stopping = false;
  private pass: Promise<void> | null = null;

  constructor(
    @Inject(IMPORT_SWEEPER) private readonly sweeper: ImportSweeper,
  ) {}

  /** One pass at a time in a process, for the dispatcher's reason. */
  @Interval("imports.sweep", 3_600_000)
  async tick(): Promise<void> {
    if (this.stopping || this.pass) return;
    this.pass = this.run().finally(() => {
      this.pass = null;
    });
    await this.pass;
  }

  private async run(): Promise<void> {
    try {
      const report = await this.sweeper.sweep();
      if (report.due > 0) {
        this.logger.log(
          `imports past retention ${report.due}, forgotten ${report.forgotten}, failed ${report.failures.length}`,
        );
      }
      for (const failure of report.failures) {
        this.logger.error(
          `forgetting the rows of import ${failure.importId} failed: ${describe(failure.error)}`,
        );
      }
    } catch (error) {
      // The pass could not even ask what is due. Logged rather than thrown: a
      // rejection in a scheduled callback takes the process down.
      this.logger.error(`import sweep failed: ${describe(error)}`);
    }
  }

  /** Stop starting passes, and let the current one finish. */
  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    await this.pass;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
