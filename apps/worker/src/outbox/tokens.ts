/**
 * Injection tokens.
 *
 * Separate from the module so that a provider and a consumer can import the
 * same symbol without importing each other, which is the circular import Nest
 * would otherwise invite.
 */
export const OUTBOX_DISPATCHER = Symbol("worker.outbox.dispatcher");
export const SUBSCRIPTIONS = Symbol("worker.outbox.subscriptions");
