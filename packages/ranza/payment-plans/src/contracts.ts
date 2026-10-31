/**
 * The public vocabulary of a Resident's payment plan (RANZ-96,
 * docs/features/payment-plans, ADR 0059).
 *
 * A plan is N instalments, each an amount and a due date, against a Resident's
 * booking for a term. Money is an integer count of the Property's minor units.
 */

/** Taken from the booking: whoever may take it may make its plan. */
export const MAKE_PLAN_PERMISSION = "front_desk.book";

/** A revision schedules charges to somebody's bill, which is finance's. */
export const REVISE_PLAN_PERMISSION = "finance.post_charge";

/** The function's own bounds, so a form and the rule cannot drift. */
export const INSTALMENTS = { min: 1, max: 60 } as const;

/** The audit module's bounds on a reason. */
export const REVISION_REASON = { min: 3, max: 2000 } as const;

/** The name the worker's context carries while it charges instalments. */
export const POST_INSTALMENTS_JOB = "payment_plans.post";

/** One row of a schedule as it is typed: an amount and the day it falls due. */
export interface NewInstalment {
  /** A positive whole number of minor units. */
  amountMinor: number;
  /** `YYYY-MM-DD`, no later than the booking's departure date. */
  dueOn: string;
}

/**
 * Where an instalment stands, defined once in `app.payment_plan_standing()`.
 *
 * `overdue` is past its due date, in the Property's own time, and not paid in
 * full. It does not wait for the worker: an instalment is overdue by its date
 * and by what was paid, whether or not it has been charged to the Folio yet.
 */
export type InstalmentState =
  "waived" | "paid" | "overdue" | "due" | "upcoming";

export interface InstalmentStanding {
  instalmentId: string;
  /** 1-based, in due-date order among the live instalments. */
  number: number;
  dueOn: string;
  amountMinor: number;
  currency: string;
  /** Charged to the Resident's Folio. */
  posted: boolean;
  paidMinor: number;
  outstandingMinor: number;
  state: InstalmentState;
}

export interface PaymentPlan {
  planId: string;
  reservationId: string;
  propertyId: string;
  currency: string;
  /** 1 until the plan is revised. */
  revision: number;
  /** Live instalments only: a revised plan's withdrawn rows are history. */
  instalments: InstalmentStanding[];
  totalMinor: number;
  paidMinor: number;
  outstandingMinor: number;
}

/**
 * How many Residents are overdue at a Property and for how much, named for
 * what it counts so a screen cannot read it as the money owed in all: Today
 * shows `students` and opens `overdueResidents` for the rows it counts.
 */
export interface OverdueFigure {
  students: number;
  instalments: number;
  overdueMinor: number;
  currency: string;
}

/** One Resident with an overdue instalment: a row of the figure above. */
export interface OverdueResident {
  reservationId: string;
  /** Null when the viewer may not read the Guest. */
  residentName: string | null;
  instalments: number;
  overdueMinor: number;
  /** The first day any of them was overdue from. */
  oldestDueOn: string;
}

/** What one worker pass did at one Property. */
export interface PostedAtProperty {
  propertyId: string;
  /** Charged to a Folio on this pass. */
  posted: number;
  /** Due, live and not charged: no Folio yet, or one that cannot take it. */
  waiting: number;
}

export interface InstalmentPosterReport {
  /** Properties with something ready to charge. */
  due: number;
  posted: number;
  waiting: number;
  failures: { propertyId: string; error: unknown }[];
}

/** Refused for a reason the caller may be told. */
export class PaymentPlanRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentPlanRefusedError";
  }
}

/** The schedule is not a schedule; `field` names the part the form can mark. */
export class PaymentPlanInputError extends Error {
  constructor(
    message: string,
    readonly field: "instalments" | "amount" | "dueOn" | "reason",
  ) {
    super(message);
    this.name = "PaymentPlanInputError";
  }
}

/** The booking is not a Resident's, or has no departure date, or has ended. */
export class PaymentPlanNotAllowedError extends Error {
  constructor(
    message: string,
    readonly reason:
      "not_a_resident" | "no_departure_date" | "booking_ended" | "no_billing",
  ) {
    super(message);
    this.name = "PaymentPlanNotAllowedError";
  }
}

/** An instalment falls due after the term ends. */
export class InstalmentAfterTermError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstalmentAfterTermError";
  }
}

/** The booking already has a plan; a change is a revision of it. */
export class PlanExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanExistsError";
  }
}
