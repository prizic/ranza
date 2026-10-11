/**
 * The vocabulary of an outbound webhook (blueprint 13 Phase 5, ADR 0045).
 *
 * Nothing here is English: the host chooses the words in the reader's language
 * (ADR 0023) from the codes below.
 */

/**
 * The outbox events an endpoint can subscribe to. The database holds the same
 * list (`app.webhook_event_keys`) and `tests/integration/webhook-delivery.test.ts`
 * fails if the two disagree.
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

/** Why an attempt did not arrive: a code from a fixed list, never receiver text. */
export type DeliveryFailure =
  | "http_error"
  | "timeout"
  | "connection_failed"
  | "tls_failed"
  | "blocked_address"
  | "invalid_target"
  | "redirect_refused";

/** `failed_operations.status`: what an operator is asked about, and how it ended. */
export type OperationStatus = "failed" | "retrying" | "resolved" | "cancelled";

/** How an endpoint is doing, from the deliveries the viewer can read. */
export type EndpointHealth = "failing" | "delivering" | "unused";

export interface WebhookEndpointRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly url: string;
  readonly eventTypes: readonly string[];
  readonly createdAt: Date;
  readonly health: EndpointHealth;
  readonly lastDeliveredAt: Date | null;
  readonly queued: number;
  readonly openFailures: number;
}

export interface EndpointsView {
  readonly endpoints: readonly WebhookEndpointRecord[];
  /** Whether the viewer may register, remove and test endpoints. */
  readonly mayManage: boolean;
}

export interface FailedOperationRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly endpointId: string | null;
  readonly endpointName: string;
  /** The event type that was being delivered. */
  readonly operation: string;
  /** A `DeliveryFailure` for a delivery; free text only on a row older than ADR 0045. */
  readonly error: string;
  readonly status: OperationStatus;
  readonly attempts: number;
  readonly nextAttemptAt: Date | null;
  /**
   * Whether the next attempt is due, by the database's clock: the one the
   * worker keeps. A browser's clock is not, and a retry set for "now" would
   * read as a minute away on one that runs behind.
   */
  readonly due: boolean;
  readonly lastAttemptAt: Date;
  readonly lastStatusCode: number | null;
  readonly lastResponseExcerpt: string | null;
}

export interface RegisterEndpointInput {
  readonly organizationId: string;
  readonly name: string;
  readonly url: string;
  readonly eventTypes: readonly string[];
}

export interface RegisteredEndpoint {
  readonly endpointId: string;
  /** Shown once. It cannot be read again by anything the workspace holds. */
  readonly secret: string;
}

export interface SendTestInput {
  readonly endpointId: string;
  readonly propertyId: string;
}

export interface OperationCommandInput {
  readonly operationId: string;
}

export interface OperationClosureInput extends OperationCommandInput {
  readonly reason: string;
}

export const INTEGRATIONS_CAPABILITY = {
  moduleKey: "platform_core",
  capabilityKey: "integrations",
} as const;
