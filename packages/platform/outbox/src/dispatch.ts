import { type OutboxWriteClient } from "./publish";
import type { OutboxDeps } from "./ports";

/**
 * Draining the queue.
 *
 * The algorithm is here rather than in the host because it is the part that is
 * easy to get subtly wrong — the lease, the delivery row inside the handler's
 * own transaction, the bookkeeping written outside the transaction it describes.
 * A host schedules it and supplies the handlers; it does not re-implement any of
 * this (ADR 0017).
 */

/** One claimed event, as a handler sees it. */
export interface DeliveredEvent {
  eventId: string;
  organizationId: string;
  eventType: string;
  payload: Readonly<Record<string, unknown>>;
  /** How many times delivery has already been attempted and failed. */
  attempts: number;
}

/**
 * What a consumer does with an event.
 *
 * It receives the transaction, not a client, so its writes and the delivery row
 * commit or roll back together. A handler that opened its own transaction could
 * succeed and then be recorded as never having run.
 */
export type OutboxHandler = (
  tx: OutboxWriteClient,
  event: DeliveredEvent,
) => Promise<void>;

export interface OutboxSubscription {
  /**
   * Stable forever, e.g. `billing.onSomethingHappened`. The delivery table is
   * keyed on this name, so renaming a consumer redelivers every event it has
   * ever handled. That is a constraint on refactoring and it is deliberate: the
   * alternative is an identifier nobody can read in a dead-letter query.
   */
  consumer: string;
  eventType: string;
  handle: OutboxHandler;
}

export interface DispatchOptions {
  /** How many events one pass claims. */
  batchSize?: number;
  /** How long a claim is held before another worker may take it. */
  leaseSeconds?: number;
  /** Attempts before an event is left dead rather than retried. */
  maxAttempts?: number;
}

export interface DispatchReport {
  claimed: number;
  published: number;
  failed: number;
  dead: number;
}

const DEFAULTS = {
  batchSize: 20,
  leaseSeconds: 120,
  maxAttempts: 8,
} as const;

interface ClaimedRow {
  id: string;
  organizationId: string;
  eventType: string;
  payload: Record<string, unknown>;
  attempts: number;
}

function toEvent(row: ClaimedRow): DeliveredEvent {
  return {
    eventId: row.id,
    organizationId: row.organizationId,
    eventType: row.eventType,
    payload: row.payload,
    attempts: row.attempts,
  };
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

export function createOutboxDispatcher(deps: OutboxDeps) {
  /**
   * Takes a batch, in its own short transaction.
   *
   * The lease is what makes two workers safe together without either knowing
   * about the other: `for update skip locked` hands them disjoint rows, and a
   * worker that dies holding a claim releases it by `claimed_until` passing
   * rather than by anybody noticing it died.
   *
   * Holding the row lock for the length of a handler was the alternative. It is
   * shorter and it fails at the first slow call out: the transaction stays open,
   * the connection is pinned, and a pooled deployment runs out of connections
   * while appearing to be idle.
   */
  async function claim(batchSize: number, leaseSeconds: number) {
    return deps.db.$queryRawUnsafe<ClaimedRow[]>(
      `with ready as (
         select id from outbox.events
          where published_at is null
            and dead_at is null
            and available_at <= now()
            and (claimed_until is null or claimed_until < now())
          order by occurred_at
          limit $1::int
          for update skip locked
       )
       update outbox.events as event
          set claimed_until = now() + make_interval(secs => $2::int)
         from ready
        where event.id = ready.id
       returning
         event.id,
         event.organization_id as "organizationId",
         event.event_type      as "eventType",
         event.payload,
         event.attempts`,
      batchSize,
      leaseSeconds,
    );
  }

  /**
   * Runs one consumer against one event, in one transaction.
   *
   * The delivery row goes in first and `on conflict do nothing` is the whole of
   * the idempotency: no row returned means this consumer has already handled
   * this event, so the transaction ends having done nothing. Because that row
   * and the handler's writes share a transaction, a crash halfway through leaves
   * neither, and the event is simply claimed again.
   *
   * Returns false when the handler was skipped as already delivered, which the
   * caller treats as success — it is.
   */
  async function deliver(
    subscription: OutboxSubscription,
    event: DeliveredEvent,
  ): Promise<boolean> {
    return deps.db.$transaction(async (tx) => {
      const client = tx as unknown as OutboxWriteClient;
      await client.$executeRawUnsafe(
        "select app.set_worker_context($1::uuid, $2)",
        event.organizationId,
        subscription.consumer,
      );

      const recorded = await client.$queryRaw<{ eventId: string }[]>`
        insert into outbox.deliveries (consumer, event_id, organization_id)
        values (
          ${subscription.consumer},
          ${event.eventId}::uuid,
          ${event.organizationId}::uuid
        )
        on conflict (consumer, event_id) do nothing
        returning event_id as "eventId"
      `;
      if (recorded.length === 0) return false;

      await subscription.handle(client, event);
      return true;
    });
  }

  /**
   * Records a failure, outside the transaction that failed.
   *
   * It has to be outside: written inside, it would roll back with the handler
   * and a repeatedly failing event would look untouched forever.
   *
   * `attempts` on the right of the assignment is the value before this failure,
   * which is what makes the backoff double each time without the caller
   * tracking anything.
   */
  async function recordFailure(
    eventId: string,
    error: unknown,
    maxAttempts: number,
  ): Promise<{ dead: boolean }> {
    const rows = await deps.db.$queryRawUnsafe<{ dead: boolean }[]>(
      `update outbox.events
          set attempts = attempts + 1,
              last_error = $2,
              claimed_until = null,
              available_at = now() + make_interval(
                secs => least(power(2, attempts)::int, 3600)
              ),
              dead_at = case when attempts + 1 >= $3::int then now() else null end
        where id = $1::uuid
       returning dead_at is not null as "dead"`,
      eventId,
      describe(error).slice(0, 2000),
      maxAttempts,
    );
    return { dead: rows[0]?.dead === true };
  }

  /** Nothing more wants this event. */
  async function markPublished(eventId: string): Promise<void> {
    await deps.db.$executeRawUnsafe(
      `update outbox.events
          set published_at = now(), claimed_until = null, last_error = null
        where id = $1::uuid`,
      eventId,
    );
  }

  /**
   * One pass: claim a batch, deliver each event to every consumer that wants it,
   * and settle the outcome.
   *
   * One transaction per event rather than one per batch, because Prisma's
   * interactive transactions have no savepoints — a batch-wide rollback would
   * undo the events that had already succeeded.
   *
   * An event nothing subscribes to is published immediately. Left pending it
   * would be claimed on every pass forever, which is a queue that never drains
   * and a log nobody can read.
   */
  async function dispatch(
    subscriptions: readonly OutboxSubscription[],
    options: DispatchOptions = {},
  ): Promise<DispatchReport> {
    const batchSize = options.batchSize ?? DEFAULTS.batchSize;
    const leaseSeconds = options.leaseSeconds ?? DEFAULTS.leaseSeconds;
    const maxAttempts = options.maxAttempts ?? DEFAULTS.maxAttempts;

    const claimed = await claim(batchSize, leaseSeconds);
    const report: DispatchReport = {
      claimed: claimed.length,
      published: 0,
      failed: 0,
      dead: 0,
    };

    for (const row of claimed) {
      const event = toEvent(row);
      const wanted = subscriptions.filter(
        (subscription) => subscription.eventType === event.eventType,
      );

      let settled = true;
      for (const subscription of wanted) {
        try {
          await deliver(subscription, event);
        } catch (error) {
          settled = false;
          const { dead } = await recordFailure(
            event.eventId,
            error,
            maxAttempts,
          );
          report.failed += 1;
          if (dead) report.dead += 1;
          // The remaining consumers are not attempted this pass. Their delivery
          // rows are unwritten, so the retry picks them up with no double work.
          break;
        }
      }

      if (settled) {
        await markPublished(event.eventId);
        report.published += 1;
      }
    }

    return report;
  }

  return { dispatch };
}

export type OutboxDispatcher = ReturnType<typeof createOutboxDispatcher>;
