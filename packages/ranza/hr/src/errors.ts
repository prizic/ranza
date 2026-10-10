/**
 * Why an HR command did not happen.
 *
 * Two classes and a reason on each, so that the host can choose the words in
 * the reader's language (ADR 0023) and this module never has to write any. An
 * error that is neither is a defect or an outage, and the host reports it.
 */

/** What the caller typed that cannot be used. Raised before any statement runs. */
export type HrField =
  | "name"
  | "department"
  | "position"
  | "email"
  | "grossPay"
  | "currency"
  | "iban"
  | "period"
  | "dates"
  | "terminatedOn"
  | "shiftTime";

export class HrInputError extends Error {
  constructor(readonly field: HrField) {
    super(`${field} cannot be used`);
    this.name = "HrInputError";
  }
}

export type HrRefusalReason =
  /**
   * A policy or a grant said no, or the row is out of reach or does not exist.
   * One answer for all of them, because telling them apart would tell a caller
   * what exists where they cannot see.
   */
  | "not_permitted"
  /** The employee is terminated, and a terminated record takes no new work. */
  | "employee_terminated"
  | "already_terminated"
  /** A shift at a Property the employee is not assigned to. */
  | "other_property"
  /** Approved leave already covers some of those days (HR-S1-10). */
  | "leave_overlap"
  /** A leave request is decided once. */
  | "leave_decided"
  /** Payroll is the whole Organization's, so it takes whole-Organization reach. */
  | "payroll_needs_organization_reach"
  | "payroll_no_employees"
  | "payroll_mixed_currency"
  /** A run is locked once approved, so a period that is still running is not approved (HR-S1-45). */
  | "payroll_period_not_ended"
  /** A draft run is already open for the period, which only a hand-made row can cause. */
  | "payroll_draft_exists";

export class HrRefusedError extends Error {
  constructor(
    readonly reason: HrRefusalReason,
    options?: ErrorOptions,
  ) {
    super(`that HR change was refused: ${reason}`, options);
    this.name = "HrRefusedError";
  }
}
