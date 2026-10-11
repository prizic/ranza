import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import type { WebhookDelivery } from "@ranza/integrations";
import { WEBHOOK_DELIVERY } from "./tokens";

/**
 * Sends the webhook deliveries that are due (ADR 0045).
 *
 * Like the outbox dispatcher and the export runner, this class decides *when*
 * and nothing else. Which deliveries are due, the secret each is signed with,
 * the schedule of retries and what an outcome does to the failure an operator
 * sees are the database's, reached through `@ranza/integrations`. Every replica
 * runs this interval; the lease on each delivery is what makes that safe.
 *
 * Every delivery that reached a final state is logged with its ids and its
 * code: a webhook that is delivered, or that has stopped being retried, is a
 * transition somebody may need to find in this log, and the row holds no more
 * of it than a code and a status. No URL, header, secret or body is written
 * here; the only exceptions that reach it are the database's.
 */
@Injectable()
export class WebhookDeliveryService implements OnApplicationShutdown {
  private readonly logger = new Logger(WebhookDeliveryService.name);
  private stopping = false;
  private pass: Promise<void> | null = null;

  constructor(
    @Inject(WEBHOOK_DELIVERY) private readonly delivery: WebhookDelivery,
  ) {}

  @Interval("webhooks.deliver", 3_000)
  async tick(): Promise<void> {
    if (this.stopping || this.pass) return;
    this.pass = this.run().finally(() => {
      this.pass = null;
    });
    await this.pass;
  }

  private async run(): Promise<void> {
    try {
      const report = await this.delivery.processDueDeliveries();
      for (const outcome of report.outcomes) {
        if (outcome.status === null) {
          this.logger.warn(
            `webhook.attempt_discarded: delivery ${outcome.deliveryId} was closed while its request was in flight`,
          );
        } else if (outcome.status === "retrying") {
          this.logger.warn(
            `webhook.attempt_failed: delivery ${outcome.deliveryId} of ${outcome.eventType} attempt ${outcome.attempt} as ${outcome.failure ?? "unknown"}${statusSuffix(outcome.statusCode)}, will retry`,
          );
        } else if (outcome.status === "failed") {
          this.logger.error(
            `webhook.delivery_failed: delivery ${outcome.deliveryId} of ${outcome.eventType} stopped after attempt ${outcome.attempt} as ${outcome.failure ?? "unknown"}${statusSuffix(outcome.statusCode)}`,
          );
        } else {
          this.logger.log(
            `webhook.delivered: delivery ${outcome.deliveryId} of ${outcome.eventType} on attempt ${outcome.attempt}`,
          );
        }
      }
      for (const lost of report.unrecorded) {
        this.logger.error(
          `webhook.outcome_unrecorded: delivery ${lost.deliveryId} will be leased again and sent with the same Idempotency-Key: ${describe(lost.error)}`,
        );
      }
    } catch (error) {
      // The pass could not even ask what is due — the database is unreachable,
      // or a grant has gone. Logged rather than thrown: a rejection in a
      // scheduled callback takes the process down.
      this.logger.error(`webhook.pass_failed: ${describe(error)}`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    await this.pass;
  }
}

function statusSuffix(statusCode: number | null): string {
  return statusCode === null ? "" : ` (HTTP ${statusCode})`;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
