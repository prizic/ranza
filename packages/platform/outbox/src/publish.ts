import type { TenantClient } from "@ranza/db";
import { assertPublishable, type OutboxEvent } from "./contracts";

/**
 * Publishing, for a caller that owns the transaction.
 *
 * It takes the transaction instead of opening one, and that is the entire point
 * rather than a convenience. Either the fact and the record that it needs
 * delivering are one commit, or they are two things that can disagree: publish
 * after the commit and a crash in between loses the message with nothing saying
 * it was owed; publish before, and a rollback announces something that did not
 * happen.
 *
 * There is no `publish()` that opens its own transaction, deliberately. Adding
 * one would make the wrong thing the convenient thing.
 *
 * The caller is responsible for the request context. Without one the insert
 * policy sees a null acting user and denies, which is the safe direction.
 */

/**
 * The transaction surface this module needs.
 *
 * Both forms, because a handler receives this same client and will want the
 * template-literal one for its own statements.
 */
export interface OutboxWriteClient extends TenantClient {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/**
 * Records that something happened, inside the transaction where it happened.
 *
 * Returns the event id so a caller can name it in its own audit record. Throws
 * rather than returning null: unlike a capability a host may not have bought, a
 * failure to publish means a reaction that will never happen, and a silent one
 * is a message nobody knows is missing.
 *
 * The id is generated here rather than read back with `returning`, and that is
 * a consequence of the security model rather than a preference. A publisher has
 * no `SELECT` policy on this table — it may write into the queue and may not
 * read it — and PostgreSQL refuses `INSERT ... RETURNING` outright when there
 * is no `SELECT` policy to evaluate the returned row against. Reaching for
 * `returning` would have meant granting the read, which is the property the
 * whole arrangement rests on.
 */
export async function publishWithin(
  tx: OutboxWriteClient,
  event: OutboxEvent,
): Promise<{ eventId: string }> {
  assertPublishable(event);

  const eventId = crypto.randomUUID();
  const written = await tx.$executeRawUnsafe(
    `insert into outbox.events (id, organization_id, event_type, payload)
     values ($1::uuid, $2::uuid, $3, $4::jsonb)`,
    eventId,
    event.organizationId,
    event.eventType,
    JSON.stringify(event.payload ?? {}),
  );

  if (written !== 1) {
    // Not reachable through the policy, which raises rather than filtering an
    // insert. Here because "wrote nothing and said nothing" is the one outcome
    // this function must never have.
    throw new Error("the event was not published");
  }
  return { eventId };
}
