import type { OutboxSubscription } from "@ranza/platform-outbox";
import { staffReachSubscription } from "./staff-reach";

/**
 * Which consumer wants which event.
 *
 * One. `staff.reach_changed` ends every session that Staff Member holds — the
 * handler that makes Staff and permissions mean anything, because without it a
 * role cut at nine keeps working until the session lapses.
 *
 * `stay.checked_in` and `stay.checked_out` are still published and still
 * unconsumed; the dispatcher marks each one delivered and moves on. That
 * remains a position rather than an omission. Every candidate handler for them
 * needs a blueprint 5.x workflow that does not exist, and blueprint section 13
 * forbids building the table ahead of the workflow that needs it:
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
 *     business date first (ADR 0021) and, before that, something with a rate to
 *     charge. Nothing has a price column anywhere.
 *
 * The machinery landed before any of them on purpose. The lease, the
 * idempotency and the retry schedule are proved by
 * `tests/integration/outbox.test.ts` against a handler that exists only in that
 * file; a domain handler in the same change would have been the thing everyone
 * read, and the machinery underneath it would have been taken on trust.
 *
 * What a handler here must be: one event mapped onto one call, holding no rule
 * of its own (ADR 0016); a consumer name that is stable forever, because
 * `outbox.deliveries` is keyed on it; and an explicit grant for anything it
 * touches. The default is nothing at all, which is the friction that makes each
 * one deliberate — `staff.reach_changed` reaches the credential tables through
 * a single function and no table grant, which is what that friction bought
 * (ADR 0027).
 */
export const subscriptions: readonly OutboxSubscription[] = [
  staffReachSubscription,
];
