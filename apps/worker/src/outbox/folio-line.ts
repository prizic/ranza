import type { OutboxSubscription } from "@ranza/platform-outbox";

/**
 * A posted Folio line produces a balanced journal entry in the general ledger
 * (blueprint 5.10, ADR 0042).
 *
 * It holds no rule of its own (ADR 0016). Which accounts a charge, a payment or
 * a reversal touches, and the amount, currency and date, are decided by
 * `app.post_folio_line_to_ledger()` from the Folio line itself. This maps the
 * event onto that call and nothing else.
 *
 * It passes the event, not the line and not the payload. The payload is a
 * snapshot that any member of the Organization can write, because `ranza_app`
 * may publish any event for its own Organization; a ledger posted from it would
 * be as forgeable as one `ranza_app` could write directly. The function reads
 * the line, which nothing can rewrite.
 *
 * `ranza_worker` holds no grant on a ledger table, as it holds none on the
 * credential tables (ADR 0027): the whole of what this process may do to the
 * books is name an event and have the entry that line owes posted.
 *
 * Every failure is a throw. An event that names no line, a line that is not
 * there, an Organization that is not this event's: each is a raise inside the
 * function, so the dispatcher records it in `outbox.events.last_error`, retries
 * on its schedule, and leaves the event dead rather than delivered. A handler
 * that returned quietly would mark the event delivered and leave the ledger
 * missing a line with nothing to say so.
 */

/** Stable forever: `outbox.deliveries` is keyed on it (ADR 0017). */
const CONSUMER = "finance.postFolioLineToLedger";

export const folioLinePostedSubscription: OutboxSubscription = {
  consumer: CONSUMER,
  eventType: "folio.line_posted",
  async handle(tx, event) {
    // Inside the dispatcher's transaction, with the delivery record, so the
    // entry and the record of having posted it commit or roll back together.
    await tx.$executeRawUnsafe(
      "select app.post_folio_line_to_ledger($1::uuid)",
      event.eventId,
    );
  },
};
