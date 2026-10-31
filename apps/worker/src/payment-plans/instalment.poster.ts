import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import type { InstalmentPoster } from "@ranza/payment-plans";
import { INSTALMENT_POSTER } from "./tokens";

/**
 * Charges each Resident's instalments to their Folio on the day they fall due
 * (ADR 0059).
 *
 * Like the day closer, this class decides *when* and nothing else. Which
 * instalments are ready, whether one may be charged and what it records are
 * the database's answers, reached through `@ranza/payment-plans`. Every replica
 * runs this interval; the unique key on the instalment a Folio line names is
 * what makes that safe, not this timer.
 *
 * A minute, because a Resident who checks in with an instalment already due
 * expects it on their Folio soon after, not at the next day. A pass over
 * Properties with nothing ready costs one query.
 */
@Injectable()
export class InstalmentPosterService implements OnApplicationShutdown {
  private readonly logger = new Logger(InstalmentPosterService.name);
  private stopping = false;
  private pass: Promise<void> | null = null;

  constructor(
    @Inject(INSTALMENT_POSTER) private readonly poster: InstalmentPoster,
  ) {}

  /** One pass at a time in a process, for the dispatcher's reason. */
  @Interval("payment_plans.post", 60_000)
  async tick(): Promise<void> {
    if (this.stopping || this.pass) return;
    this.pass = this.run().finally(() => {
      this.pass = null;
    });
    await this.pass;
  }

  private async run(): Promise<void> {
    try {
      const report = await this.poster.postDueInstalments();
      // Quiet when nothing happened: an instalment waiting for a Resident who
      // has not arrived is asked about every minute, and a line a minute about
      // it would bury the ones that matter.
      if (report.posted > 0 || report.failures.length > 0) {
        this.logger.log(
          `Properties ${report.due}, charged ${report.posted}, waiting ${report.waiting}, failed ${report.failures.length}`,
        );
      }
      for (const failure of report.failures) {
        this.logger.error(
          `charging instalments at Property ${failure.propertyId} failed: ${describe(failure.error)}`,
        );
      }
    } catch (error) {
      // The pass could not even ask what is ready — the database is
      // unreachable, or a grant has gone. Logged rather than thrown, for the
      // dispatcher's reason: a rejection in a scheduled callback takes the
      // process down.
      this.logger.error(`instalment pass failed: ${describe(error)}`);
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
