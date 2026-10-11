import type { OutboxSubscription } from "@ranza/platform-outbox";
import { WEBHOOK_EVENT_TYPES } from "@ranza/integrations";

/**
 * An event an Organization subscribed an endpoint to is queued for delivery to
 * it (ADR 0045).
 *
 * It holds no rule of its own (ADR 0016). Which endpoints want the event, which
 * Property it is at, and what of its payload may leave the building are decided
 * by `app.enqueue_webhook_deliveries()`, which is handed the event and not the
 * payload for the reason the ledger handler gives: any member of an
 * Organization can publish an event with any payload for it.
 *
 * It queues and nothing more. The request to the endpoint is made afterwards by
 * `apps/worker/src/webhooks`, outside this transaction, because a receiver that
 * is slow to answer must not hold a connection and a row lock while it thinks.
 * An event with no endpoint waiting for it queues nothing and the event is
 * published, as any event nobody wants is.
 *
 * One consumer name for every event type: `outbox.deliveries` is keyed on
 * (consumer, event), and an event has one type.
 */

/** Stable forever: `outbox.deliveries` is keyed on it (ADR 0017). */
const CONSUMER = "integrations.queueWebhookDeliveries";

export const webhookSubscriptions: readonly OutboxSubscription[] =
  WEBHOOK_EVENT_TYPES.map((eventType) => ({
    consumer: CONSUMER,
    eventType,
    async handle(tx, event) {
      await tx.$executeRawUnsafe(
        "select app.enqueue_webhook_deliveries($1::uuid)",
        event.eventId,
      );
    },
  }));
