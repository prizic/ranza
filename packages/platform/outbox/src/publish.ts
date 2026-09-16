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

/** The transaction surface this statement needs. */
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
 */
export async function publishWithin(
  tx: OutboxWriteClient,
  event: OutboxEvent,
): Promise<{ eventId: string }> {
  assertPublishable(event);

  const rows = await tx.$queryRaw<{ id: string }[]>`
    insert into outbox.events (organization_id, event_type, payload)
    values (
      ${event.organizationId}::uuid,
      ${event.eventType},
      ${JSON.stringify(event.payload ?? {})}::jsonb
    )
    returning id
  `;

  const [row] = rows;
  if (!row) {
    // Reachable only if the insert policy denied: the actor cannot publish into
    // that scope.
    throw new Error("the event was not published");
  }
  return { eventId: row.id };
}
