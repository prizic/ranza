/**
 * What the Integrations screen needs at run time from `@ranza/integrations`.
 *
 * Restated rather than imported: nothing outside `src/server/` may import a
 * Ranza domain module (ADR 0007), as doing so risks importing server and Prisma
 * code into the browser bundle. `tests/unit/integrations-view.test.tsx` fails
 * if this list and the module's drift apart.
 */
export const WEBHOOK_EVENT_TYPES = [
  "reservation.created",
  "reservation.cancelled",
  "reservation.no_show",
  "stay.checked_in",
  "stay.checked_out",
  "folio.line_posted",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/** The codes a delivery failure is said with; anything else is shown as it was written. */
export const DELIVERY_FAILURES = [
  "http_error",
  "timeout",
  "connection_failed",
  "tls_failed",
  "blocked_address",
  "invalid_target",
  "redirect_refused",
] as const;

export type DeliveryFailureCode = (typeof DELIVERY_FAILURES)[number];

export function isDeliveryFailure(code: string): code is DeliveryFailureCode {
  return (DELIVERY_FAILURES as readonly string[]).includes(code);
}

export function isWebhookEventType(type: string): type is WebhookEventType {
  return (WEBHOOK_EVENT_TYPES as readonly string[]).includes(type);
}

/**
 * The key an event type is said with. next-intl reads a dot in a key as
 * nesting, so `stay.checked_in` is `stay_checked_in` in the catalogue.
 */
export function eventKey(type: WebhookEventType) {
  return type.replace(".", "_") as EventKey;
}

export type EventKey =
  | "reservation_created"
  | "reservation_cancelled"
  | "reservation_no_show"
  | "stay_checked_in"
  | "stay_checked_out"
  | "folio_line_posted";
