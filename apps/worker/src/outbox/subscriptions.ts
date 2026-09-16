import type { OutboxSubscription } from "@ranza/platform-outbox";

/**
 * Which consumer wants which event.
 *
 * Empty on purpose. The dispatcher, its lease, its idempotency and its retries
 * are worth landing and proving on their own — a handler added in the same
 * change would be the thing everyone read, and the machinery underneath it
 * would be taken on trust.
 *
 * A handler maps one event to one module `...Within(tx, ...)` call and holds no
 * rule of its own (ADR 0016). A consumer name is stable forever, because
 * `outbox.deliveries` is keyed on it: renaming one redelivers every event it has
 * ever handled.
 */
export const subscriptions: readonly OutboxSubscription[] = [];
