import type { OutboxSubscription } from "@ranza/platform-outbox";

/**
 * A room back in service comes back dirty, clean or inspected (RANZ-33,
 * ADR 0032).
 *
 * It holds no rule of its own (ADR 0016). Whether a release really happened,
 * what the room comes back as, whether housekeeping is available there, and
 * whether somebody changed the status since are all decided by
 * `app.mark_unit_returned_to_service()`; this maps the event onto that call and
 * nothing else.
 *
 * It passes the event, not the Unit, and the event carries ids only. Anybody
 * may publish an event for their own Organization, so what the room comes back
 * as is read from the release the database stamped, never from the payload.
 */

/** Stable forever: `outbox.deliveries` is keyed on it (ADR 0017). */
const CONSUMER = "housekeeping.markRoomOnReturnToService";

export const roomReturnedSubscription: OutboxSubscription = {
  consumer: CONSUMER,
  eventType: "unit.returned_to_service",
  async handle(tx, event) {
    // Inside the dispatcher's transaction, with the delivery record, so the
    // mark and the record of having made it commit or roll back together.
    await tx.$executeRawUnsafe(
      "select app.mark_unit_returned_to_service($1::uuid)",
      event.eventId,
    );
  },
};
