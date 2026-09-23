import type { OutboxSubscription } from "@ranza/platform-outbox";

/**
 * A departure makes the room dirty (RANZ-28, ADR 0029).
 *
 * It holds no rule of its own (ADR 0016). Which room, whether housekeeping is
 * available there, and whether somebody already changed the status since the
 * Guest left are all decided by `app.mark_unit_dirty_after_check_out()`; this
 * maps the event onto that call and nothing else.
 *
 * It passes the event, not the Stay. The function reads the Stay and the moment
 * of departure from the event itself, so what it compares against is the
 * event's own `occurred_at` — which never moves — rather than anything this
 * process could state.
 *
 * `ranza_worker` holds no grant on `housekeeping_unit_status`, as it holds
 * none on the credential tables (ADR 0027): the whole of what this process may
 * do to a room's status is name a departure and have the room marked.
 */

/** Stable forever: `outbox.deliveries` is keyed on it (ADR 0017). */
const CONSUMER = "housekeeping.markRoomDirtyOnCheckOut";

export const roomDirtySubscription: OutboxSubscription = {
  consumer: CONSUMER,
  eventType: "stay.checked_out",
  async handle(tx, event) {
    // Inside the dispatcher's transaction, with the delivery record, so the
    // mark and the record of having made it commit or roll back together.
    await tx.$executeRawUnsafe(
      "select app.mark_unit_dirty_after_check_out($1::uuid)",
      event.eventId,
    );
  },
};
