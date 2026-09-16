/**
 * The public vocabulary of the outbox.
 *
 * A reusable module (blueprint 9.8), so it knows nothing about what it carries.
 * An event type is a dotted string the publisher chooses, a payload is opaque
 * JSON, and a scope is an opaque organization id the module never learns the
 * meaning of. A host adapter gives those identifiers meaning.
 */

/** Matches `events_event_type_check`. Said here so a caller learns which field. */
const EVENT_TYPE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

/**
 * A fact that happened, for somebody else to react to.
 *
 * `payload` carries identifiers and facts, never personal data. This is the one
 * table a single process reads across every scope, so it is the one place where
 * a leak would not be bounded by tenancy — a handler that needs more reads it
 * under that scope's own context.
 */
export interface OutboxEvent {
  organizationId: string;
  /** Dotted and lower case, e.g. `order.placed`. Two parts at least. */
  eventType: string;
  payload?: Readonly<Record<string, unknown>>;
}

/** Something that could not be published. */
export class OutboxEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboxEventError";
  }
}

/**
 * Rejects an event the database would reject anyway.
 *
 * Both places on purpose, as everywhere else in this repository: the check
 * constraint is the boundary that holds when this code is wrong, and this is the
 * one that names the field before a constraint violation has to be decoded.
 */
export function assertPublishable(event: OutboxEvent): void {
  if (!EVENT_TYPE.test(event.eventType)) {
    throw new OutboxEventError(
      "an event type is dotted, lower case, and names a subject as well as a verb",
    );
  }
}
