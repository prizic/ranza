import type { OutboxSubscription } from "@ranza/platform-outbox";

/**
 * Which consumer wants which event.
 *
 * Empty, and that is a position rather than an omission. `stay.checked_in` and
 * `stay.checked_out` are published; nothing consumes them yet, so the dispatcher
 * marks each one delivered and moves on.
 *
 * Every candidate for a first handler needs a blueprint 5.x workflow that does
 * not exist, and blueprint section 13 forbids building the table ahead of the
 * workflow that needs it:
 *
 *   - **Mark the Unit dirty on departure.** `accommodation_units.status` allows
 *     `available`, `occupied` and `out_of_service`; blueprint 18.2 names six
 *     states. Adding one here would be deciding the housekeeping lifecycle in a
 *     worker, and `docs/roadmap.md` already records that check-out deliberately
 *     does not fire it.
 *   - **Close the Folio on departure.** ADR 0015 is explicit that folio closure
 *     rules are blueprint 5.9's own concern and that a rule invented at this
 *     point would be inventing that workflow.
 *   - **Send the confirmation.** Notifications are blueprint 5.12 and there is
 *     no module. A provider, a template and a delivery record are three
 *     decisions, not a handler.
 *   - **Post the nightly room charge.** That is the night audit, which needs a
 *     business date first — see `docs/handover/worker-and-react-query.md`.
 *
 * So the machinery landed without one on purpose. The lease, the idempotency
 * and the retry schedule are proved by `tests/integration/outbox.test.ts`
 * against a handler that exists only in that file; a domain handler in the same
 * change would have been the thing everyone read, and the machinery underneath
 * it would have been taken on trust.
 *
 * When one arrives: it maps an event to one module `...Within(tx, ...)` call and
 * holds no rule of its own (ADR 0016), its consumer name is stable forever
 * because `outbox.deliveries` is keyed on it, and `ranza_worker` needs an
 * explicit policy and grant for every table it writes — the default is nothing
 * at all, which is the friction that makes each one deliberate.
 */
export const subscriptions: readonly OutboxSubscription[] = [];
