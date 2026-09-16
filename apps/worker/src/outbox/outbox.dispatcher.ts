import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import type { OutboxDispatcher } from "@ranza/platform-outbox";
import { OUTBOX_DISPATCHER, SUBSCRIPTIONS } from "./tokens";
import type { OutboxSubscription } from "@ranza/platform-outbox";

/**
 * The only thing this class does is decide *when*.
 *
 * Claiming, the lease, idempotency and the retry schedule all live in
 * `@ranza/platform-outbox`, and that split is the rule rather than a preference:
 * a Nest provider wraps something the composition root already built, and holds
 * no logic of its own (ADR 0016). If this file ever contains a query, the
 * boundary has been crossed.
 */
@Injectable()
export class OutboxDispatcherService implements OnApplicationShutdown {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private stopping = false;
  private pass: Promise<void> | null = null;

  constructor(
    @Inject(OUTBOX_DISPATCHER) private readonly outbox: OutboxDispatcher,
    @Inject(SUBSCRIPTIONS)
    private readonly subscriptions: readonly OutboxSubscription[],
  ) {}

  /**
   * Overlap is prevented by `pass`, not by the interval being longer than the
   * work. Two passes in one process would claim the same rows — `for update
   * skip locked` protects one worker from another, and nothing protects a
   * process from itself.
   */
  @Interval("outbox.dispatch", 2_000)
  async tick(): Promise<void> {
    if (this.stopping || this.pass) return;
    this.pass = this.run().finally(() => {
      this.pass = null;
    });
    await this.pass;
  }

  private async run(): Promise<void> {
    try {
      const report = await this.outbox.dispatch(this.subscriptions);
      if (report.claimed > 0) {
        this.logger.log(
          `claimed ${report.claimed}, published ${report.published}, failed ${report.failed}, dead ${report.dead}`,
        );
      }
      if (report.dead > 0) {
        // An event nobody will retry again. Loud, because nothing else will
        // ever mention it: a dead letter is not deleted, and is also not read
        // by anything that would notice.
        this.logger.error(
          `${report.dead} event(s) left dead after the attempt cap`,
        );
      }
    } catch (error) {
      // A pass that could not even claim — the database is unreachable, or a
      // grant has gone. Logged rather than thrown: an unhandled rejection in a
      // scheduled callback takes the process down, and a worker that exits on a
      // transient failure is a worker that is down for as long as the failure
      // lasts plus however long it takes somebody to notice.
      this.logger.error(
        `dispatch pass failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Stop claiming, and finish what is claimed.
   *
   * Exiting mid-pass would not lose an event — the lease expires and another
   * worker takes it — but it would leave one waiting two minutes for no reason,
   * on every deploy.
   */
  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    await this.pass;
  }
}
