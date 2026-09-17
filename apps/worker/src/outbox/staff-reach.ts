import type { OutboxSubscription } from "@ranza/platform-outbox";

/**
 * A reach change ends every session that Staff Member holds.
 *
 * The first handler in the product, and it is the one that makes the rest of
 * Staff and permissions mean anything: without it a role cut at nine keeps
 * working until the session lapses, and the screen would say one thing while
 * the database said another.
 *
 * It holds no rule of its own (ADR 0016). Whether a session should end was
 * decided by the transaction that changed the reach, which is why the event
 * exists; this maps that event onto one call and nothing else.
 *
 * **Every** session, not the one making the request (SP-S4-02). A Staff Member
 * signed in at a desk terminal and on a phone has two, and ending one would
 * leave the other holding the answer that was just withdrawn.
 *
 * The call is `app.end_sessions_for()` rather than a statement, because
 * `ranza_worker` is granted nothing on `auth_session` and this does not change
 * that (ADR 0027). The whole of what this process may do to a credential table
 * is name a Ranza user and have their sessions end.
 */

/** Stable forever: `outbox.deliveries` is keyed on it (ADR 0017). */
const CONSUMER = "staff.endSessionsOnReachChange";

interface ReachChanged {
  userId?: unknown;
}

export const staffReachSubscription: OutboxSubscription = {
  consumer: CONSUMER,
  eventType: "staff.reach_changed",
  async handle(tx, event) {
    const { userId } = (event.payload ?? {}) as ReachChanged;
    if (typeof userId !== "string" || userId.length === 0) {
      // Loud rather than quiet. A payload without a user is a publisher defect,
      // and treating it as "nothing to do" would mark the event delivered and
      // leave somebody signed in under permissions they no longer have.
      throw new Error(
        `${CONSUMER}: staff.reach_changed carried no userId to sign out`,
      );
    }

    // Inside the dispatcher's transaction, with the delivery record, so the two
    // commit or roll back together: a handler that opened its own connection
    // could end the sessions and then be recorded as never having run, or be
    // recorded as having run without ending them.
    await tx.$executeRawUnsafe("select app.end_sessions_for($1::uuid)", userId);
  },
};
