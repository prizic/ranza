/**
 * Why an integrations command did not happen.
 *
 * Two classes and a reason on each, so the host can choose the words in the
 * reader's language and this module never has to write any. An error that is
 * neither is a defect or an outage, and the host reports it.
 */

export type EndpointInputRejection =
  | { field: "name"; reason: "empty" | "too_long" }
  | {
      field: "url";
      reason:
        | "invalid"
        | "too_long"
        | "not_https"
        | "has_credentials"
        | "blocked_host";
    }
  | { field: "events"; reason: "none" | "unknown" };

/** What the caller supplied that cannot be used. Raised before any statement runs. */
export class EndpointInputError extends Error {
  constructor(readonly rejection: EndpointInputRejection) {
    super(`${rejection.field} cannot be used: ${rejection.reason}`);
    this.name = "EndpointInputError";
  }
}

export type ClosureInputRejection = "reason_too_short" | "reason_too_long";

export class ClosureInputError extends Error {
  constructor(readonly reason: ClosureInputRejection) {
    super(`a reason cannot be used: ${reason}`);
    this.name = "ClosureInputError";
  }
}

export type RefusalReason =
  /** A gate said no, or the row is out of reach or does not exist. One answer for all. */
  | "not_permitted"
  | "duplicate_url"
  | "too_many_endpoints"
  | "test_in_flight"
  /** The database refused a missing or too-short reason, which the module's own check should have caught first. */
  | "reason_required"
  /** The failure is closed, or its endpoint no longer takes deliveries. */
  | "unavailable";

export class IntegrationsRefusedError extends Error {
  constructor(
    readonly reason: RefusalReason,
    options?: ErrorOptions,
  ) {
    super(`that integrations change was refused: ${reason}`, options);
    this.name = "IntegrationsRefusedError";
  }
}
