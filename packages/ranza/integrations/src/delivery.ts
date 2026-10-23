import type { PrismaClient } from "@ranza/db";
import type { WebhookDeliveryDeps } from "./ports";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, signDelivery } from "./signing";
import type { TargetPolicy } from "./target";
import { attempt, type AttemptResult } from "./transport";

/**
 * The worker's half of an outbound webhook (ADR 0045, ADR 0018, ADR 0027).
 *
 * It decides nothing about what is sent, to whom, or what happens next. The
 * database does, in the functions it calls: which deliveries are due, the
 * signing secret of the one being sent, and what an outcome does to the
 * delivery and to the failure an operator is shown. What is left here is
 * making the request and saying how it went.
 *
 * Delivery is at least once. A worker that dies between receiving a reply and
 * recording it leaves a lease that expires, and the delivery is sent again with
 * the same `Idempotency-Key`; that header is what lets a receiver treat the
 * second as the first.
 */

/**
 * How many deliveries one round leases, how many are on the wire at once, and
 * how many rounds a pass makes. A round sends at most one delivery to any
 * endpoint (the database offers no more), so a burst for one endpoint is
 * worked through a round at a time rather than waiting for the next tick.
 */
const BATCH_SIZE = 20;
const CONCURRENCY = 5;
const MAX_ROUNDS = 10;

const JOB = "integrations.deliverWebhooks";

interface DueDelivery {
  deliveryId: string;
  organizationId: string;
}

interface ClaimedDelivery {
  url: string;
  eventId: string | null;
  eventType: string;
  body: unknown;
  attempt: number;
  leaseId: string;
}

export type DeliveryStatus = "delivered" | "retrying" | "failed";

export interface DeliveryOutcome {
  readonly deliveryId: string;
  readonly organizationId: string;
  readonly eventType: string;
  readonly attempt: number;
  /** Null when the delivery was closed by a person while the request was in flight. */
  readonly status: DeliveryStatus | null;
  readonly statusCode: number | null;
  readonly failure: AttemptResult["failure"];
}

export interface DeliveryReport {
  /** How many deliveries were due when the pass began. */
  readonly due: number;
  readonly outcomes: readonly DeliveryOutcome[];
  /** Sent, but the outcome could not be written: the lease will expire and it is sent again. */
  readonly unrecorded: readonly { deliveryId: string; error: unknown }[];
}

type WorkerTransaction = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];

export function createWebhookDelivery({
  db,
  allowLoopbackHttp = false,
}: WebhookDeliveryDeps) {
  const policy: TargetPolicy = { allowLoopbackHttp };

  function inContext<T>(
    organizationId: string,
    run: (tx: WorkerTransaction) => Promise<T>,
  ): Promise<T> {
    return db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "select app.set_worker_context($1::uuid, $2)",
        organizationId,
        JOB,
      );
      return run(tx);
    });
  }

  /** Null when another replica took the lease first. */
  async function deliver({
    deliveryId,
    organizationId,
  }: DueDelivery): Promise<DeliveryOutcome | null> {
    const [claimed] = await inContext(
      organizationId,
      (tx) =>
        tx.$queryRaw<ClaimedDelivery[]>`
          select url, event_id as "eventId", event_type as "eventType", body,
                 attempt, lease_id as "leaseId"
            from app.claim_webhook_delivery(${deliveryId}::uuid)`,
    );
    if (!claimed) return null;

    const [row] = await inContext(
      organizationId,
      (tx) =>
        tx.$queryRaw<{ secret: string | null }[]>`
          select app.webhook_delivery_secret(
                   ${deliveryId}::uuid, ${claimed.leaseId}::uuid) as secret`,
    );
    if (!row?.secret) {
      return {
        deliveryId,
        organizationId,
        eventType: claimed.eventType,
        attempt: claimed.attempt,
        status: null,
        statusCode: null,
        failure: null,
      };
    }

    const body = JSON.stringify(claimed.body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const result = await attempt({
      url: claimed.url,
      body,
      policy,
      headers: {
        "User-Agent": "Ranza-Webhooks/1",
        "Idempotency-Key": claimed.eventId ?? deliveryId,
        "X-Ranza-Event": claimed.eventType,
        "X-Ranza-Event-Id": claimed.eventId ?? deliveryId,
        "X-Ranza-Delivery": deliveryId,
        "X-Ranza-Attempt": String(claimed.attempt),
        [TIMESTAMP_HEADER]: timestamp,
        [SIGNATURE_HEADER]: signDelivery(row.secret, timestamp, body),
      },
    });

    const [recorded] = await inContext(
      organizationId,
      (tx) =>
        tx.$queryRaw<{ status: DeliveryStatus | null }[]>`
          select app.record_webhook_attempt(
                   ${deliveryId}::uuid, ${claimed.leaseId}::uuid, ${result.outcome}::text,
                   ${result.statusCode}::int, ${result.failure}::text,
                   ${result.excerpt}::text, ${result.durationMs}::int) as status`,
    );

    return {
      deliveryId,
      organizationId,
      eventType: claimed.eventType,
      attempt: claimed.attempt,
      status: recorded?.status ?? null,
      statusCode: result.statusCode,
      failure: result.failure,
    };
  }

  /** Sends every delivery that is due, a few at a time, a round after round. */
  async function processDueDeliveries(): Promise<DeliveryReport> {
    const outcomes: DeliveryOutcome[] = [];
    const unrecorded: { deliveryId: string; error: unknown }[] = [];
    let dueCount = 0;

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const due = await db.$queryRaw<DueDelivery[]>`
        select delivery_id as "deliveryId", organization_id as "organizationId"
          from app.due_webhook_deliveries(${BATCH_SIZE}::int)`;
      if (due.length === 0) break;
      dueCount += due.length;

      const sentBefore = outcomes.length + unrecorded.length;
      for (let start = 0; start < due.length; start += CONCURRENCY) {
        await Promise.all(
          due.slice(start, start + CONCURRENCY).map(async (item) => {
            try {
              const outcome = await deliver(item);
              if (outcome !== null) outcomes.push(outcome);
            } catch (error: unknown) {
              unrecorded.push({ deliveryId: item.deliveryId, error });
            }
          }),
        );
      }
      if (outcomes.length + unrecorded.length === sentBefore) break;
    }

    return { due: dueCount, outcomes, unrecorded };
  }

  return { processDueDeliveries };
}

export type WebhookDelivery = ReturnType<typeof createWebhookDelivery>;
