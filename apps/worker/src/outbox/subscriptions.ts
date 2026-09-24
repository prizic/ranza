import type { OutboxSubscription } from "@ranza/platform-outbox";
import { roomDirtySubscription } from "./room-dirty";
import { staffReachSubscription } from "./staff-reach";

/**
 * Which consumer wants which event.
 *
 * Two.
 *
 *   - `staff.reach_changed` ends every session that Staff Member holds — the
 *     handler that makes Staff and permissions mean anything, because without
 *     it a role cut at nine keeps working until the session lapses.
 *   - `stay.checked_out` makes the room the Guest left dirty, which is the
 *     housekeeping lifecycle's first command (ADR 0029). It writes a status of
 *     its own table, not `accommodation_units.status`: whether a room needs
 *     cleaning and whether it is in service are two facts that coexist.
 *
 * `stay.checked_in` is still published and still unconsumed, and the other
 * candidates for `stay.checked_out` are still waiting for workflows that do
 * not exist, which blueprint section 13 forbids building ahead of:
 *
 *   - **Close the Folio on departure.** ADR 0015 is explicit that folio closure
 *     rules are blueprint 5.9's own concern and that a rule invented at this
 *     point would be inventing that workflow.
 *   - **Send the confirmation.** Notifications are blueprint 5.12 and there is
 *     no module. A provider, a template and a delivery record are three
 *     decisions, not a handler.
 *   - **Post the nightly room charge.** Closing the day is built (ADR 0034) and
 *     is a scheduled job, not a handler; posting room nights is its third
 *     slice, and still needs something with a rate to charge. Nothing has a
 *     price column anywhere.
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
 * one deliberate — both handlers reach their tables through a single function
 * and no table grant, which is what that friction bought (ADR 0027).
 */
export const subscriptions: readonly OutboxSubscription[] = [
  staffReachSubscription,
  roomDirtySubscription,
];
