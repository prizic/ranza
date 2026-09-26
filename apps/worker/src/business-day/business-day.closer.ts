import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import type { DayCloser } from "@ranza/business-day";
import { DAY_CLOSER } from "./tokens";

/**
 * Closes each Property's quiet day a little after its cutoff (ADR 0034).
 *
 * Like the outbox dispatcher, this class decides *when* and nothing else.
 * Which days are due, whether one may close and what it records are the
 * database's answers, reached through `@ranza/business-day`. Every replica
 * runs this interval; the unique close per Property and day is what makes
 * that safe, not this timer.
 *
 * A minute, because a day becomes due at its cutoff and a desk resolving the
 * last open item at 09:00 expects the day closed soon after, not at the next
 * cutoff. A pass over Properties with nothing due costs one query.
 */
@Injectable()
export class BusinessDayCloserService implements OnApplicationShutdown {
  private readonly logger = new Logger(BusinessDayCloserService.name);
  private stopping = false;
  private pass: Promise<void> | null = null;

  constructor(@Inject(DAY_CLOSER) private readonly closer: DayCloser) {}

  /** One pass at a time in a process, for the dispatcher's reason. */
  @Interval("business_day.close", 60_000)
  async tick(): Promise<void> {
    if (this.stopping || this.pass) return;
    this.pass = this.run().finally(() => {
      this.pass = null;
    });
    await this.pass;
  }

  private async run(): Promise<void> {
    try {
      const report = await this.closer.closeDueDays();
      // Quiet when nothing happened: a Property waiting on its desk is asked
      // every minute, and a line a minute about it would bury the ones that
      // matter.
      if (report.closed > 0 || report.failures.length > 0) {
        this.logger.log(
          `due ${report.due}, closed ${report.closed}, waiting on their desk ${report.open}, failed ${report.failures.length}`,
        );
      }
      for (const failure of report.failures) {
        this.logger.error(
          `closing the business day at Property ${failure.propertyId} failed: ${describe(failure.error)}`,
        );
      }
    } catch (error) {
      // The pass could not even ask what is due — the database is unreachable,
      // or a grant has gone. Logged rather than thrown, for the dispatcher's
      // reason: a rejection in a scheduled callback takes the process down.
      this.logger.error(`close pass failed: ${describe(error)}`);
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
