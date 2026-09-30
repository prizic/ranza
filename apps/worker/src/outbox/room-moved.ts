import type { OutboxSubscription } from "@ranza/platform-outbox";

/**
 * A Guest moved out of a room makes it dirty (amend-booking slice 3, AB-S3-08),
 * as a departure does.
 *
 * It holds no rule of its own (ADR 0016). Which room was left, whether it was
 * only a move between beds of one room, whether housekeeping is available
 * there, and whether somebody marked the room since the move are all decided
 * by `app.mark_unit_dirty_after_move()`; this maps the event onto that call.
 *
 * It passes the event, not the room. The function reads the revision the
 * event names and takes the room from there, because a room in an outbox
 * payload is only a claim — `ranza_app` may write any payload.
 */

/** Stable forever: `outbox.deliveries` is keyed on it (ADR 0017). */
const CONSUMER = "housekeeping.markRoomDirtyOnMove";

export const roomMovedSubscription: OutboxSubscription = {
  consumer: CONSUMER,
  eventType: "stay.moved",
  async handle(tx, event) {
    await tx.$executeRawUnsafe(
      "select app.mark_unit_dirty_after_move($1::uuid)",
      event.eventId,
    );
  },
};
