import { withOrganizationContext } from "@ranza/db";
import { recordWithin, type AuditClient } from "@ranza/platform-audit";
import {
  INSTALMENTS,
  REVISION_REASON,
  InstalmentAfterTermError,
  PaymentPlanInputError,
  PaymentPlanNotAllowedError,
  PaymentPlanRefusedError,
  PlanExistsError,
  type InstalmentStanding,
  type InstalmentState,
  type NewInstalment,
  type OverdueFigure,
  type OverdueResident,
  type PaymentPlan,
} from "./contracts";
import type { PaymentPlansDeps } from "./ports";

/**
 * A Resident pays by instalments (RANZ-96, ADR 0059).
 *
 * Like every Ranza module this owns no authorization logic and no rule the
 * database can hold. Who may make a plan and who may revise it, that it is a
 * Resident's with a departure date, that an instalment is due within the term
 * and is charged once, that a charged one is history, and what overdue means,
 * are the functions, triggers and policies of
 * `20260916013810_a_resident_pays_by_instalments`. This module checks the shape
 * a form can get wrong, asks for the writes, maps the database's refusals to
 * errors a screen can word, and records who did it.
 */

const INSUFFICIENT_PRIVILEGE = "42501";
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const INVALID_PARAMETER = "22023";
const NOT_A_RESIDENT = "RZP01";
const NO_DEPARTURE_DATE = "RZP02";
const AFTER_THE_TERM = "RZP03";
const BOOKING_ENDED = "RZP05";
const NO_BILLING = "RZP06";

/** As every module's: the code in Prisma's `meta`, or failing that the message. */
function raised(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { meta, message } = error as {
    meta?: { driverAdapterError?: { cause?: { code?: unknown } } };
    message?: unknown;
  };
  return (
    meta?.driverAdapterError?.cause?.code === code ||
    (typeof message === "string" && message.includes(code))
  );
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day: V8 reads 2026-02-30 as 2 March, so the round trip decides. */
function isDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value
  );
}

/** What the database would refuse, said before it has to be decoded. */
function assertSchedule(instalments: NewInstalment[]): void {
  if (
    instalments.length < INSTALMENTS.min ||
    instalments.length > INSTALMENTS.max
  ) {
    throw new PaymentPlanInputError(
      `a plan has ${INSTALMENTS.min} to ${INSTALMENTS.max} instalments`,
      "instalments",
    );
  }
  for (const instalment of instalments) {
    if (
      !Number.isSafeInteger(instalment.amountMinor) ||
      instalment.amountMinor <= 0
    ) {
      throw new PaymentPlanInputError(
        "an instalment is a positive amount",
        "amount",
      );
    }
    if (!isDay(instalment.dueOn)) {
      throw new PaymentPlanInputError(
        "an instalment falls due on a date",
        "dueOn",
      );
    }
  }
}

function translate(error: unknown, refusal: string): never {
  if (raised(error, NOT_A_RESIDENT)) {
    throw new PaymentPlanNotAllowedError(
      "only a Resident pays by instalments",
      "not_a_resident",
    );
  }
  if (raised(error, NO_DEPARTURE_DATE)) {
    throw new PaymentPlanNotAllowedError(
      "a payment plan needs the booking to have a departure date",
      "no_departure_date",
    );
  }
  if (raised(error, BOOKING_ENDED)) {
    throw new PaymentPlanNotAllowedError(
      "a booking that has ended takes no payment plan",
      "booking_ended",
    );
  }
  if (raised(error, NO_BILLING)) {
    throw new PaymentPlanNotAllowedError(
      "this Property keeps no Folios, so nothing could be charged",
      "no_billing",
    );
  }
  if (raised(error, AFTER_THE_TERM)) {
    throw new InstalmentAfterTermError(
      "an instalment cannot fall due after the term ends",
    );
  }
  if (raised(error, UNIQUE_VIOLATION)) {
    throw new PlanExistsError("that booking already has a payment plan");
  }
  if (raised(error, CHECK_VIOLATION)) {
    throw new PaymentPlanInputError(
      "an instalment is a positive amount",
      "amount",
    );
  }
  if (raised(error, INVALID_PARAMETER)) {
    throw new PaymentPlanInputError(
      `a plan has ${INSTALMENTS.min} to ${INSTALMENTS.max} instalments`,
      "instalments",
    );
  }
  if (raised(error, INSUFFICIENT_PRIVILEGE)) {
    throw new PaymentPlanRefusedError(refusal);
  }
  throw error;
}

interface StandingRow {
  instalmentId: string;
  number: number;
  dueOn: string;
  amountMinor: string;
  currency: string;
  posted: boolean;
  paidMinor: string;
  outstandingMinor: string;
  state: InstalmentState;
}

function wanted(instalments: NewInstalment[]): string {
  return JSON.stringify(
    instalments.map(({ amountMinor, dueOn }) => ({ amountMinor, dueOn })),
  );
}

export function createPaymentPlansModule(deps: PaymentPlansDeps) {
  /**
   * Makes the plan inside a transaction the caller already holds, so a booking
   * and its plan are one act: a plan the database refuses rolls the booking
   * back with it. The audit record is written here, in the same transaction.
   */
  async function createPaymentPlanWithin(
    tx: AuditClient,
    userId: string,
    reservationId: string,
    instalments: NewInstalment[],
  ): Promise<{ planId: string }> {
    assertSchedule(instalments);

    let made: {
      planId: string;
      organizationId: string;
      propertyId: string;
      count: number;
      totalMinor: string;
      currency: string;
    };
    try {
      const [row] = await tx.$queryRaw<(typeof made)[]>`
        select plan_id               as "planId",
               plan_organization_id  as "organizationId",
               plan_property_id      as "propertyId",
               instalment_count      as "count",
               total_minor::text     as "totalMinor",
               plan_currency         as "currency"
          from app.create_payment_plan(
                 ${reservationId}::uuid, ${wanted(instalments)}::jsonb)
      `;
      if (!row) {
        throw new Error("app.create_payment_plan returned no row");
      }
      made = row;
    } catch (error: unknown) {
      translate(error, "that payment plan cannot be made");
    }

    await recordWithin(tx, {
      organizationId: made.organizationId,
      locationId: made.propertyId,
      actorId: userId,
      action: "payment_plan.created",
      subjectType: "payment_plan",
      subjectId: made.planId,
      context: {
        reservationId,
        instalments: made.count,
        totalMinor: Number(made.totalMinor),
        currency: made.currency,
      },
    });
    return { planId: made.planId };
  }

  async function createPaymentPlan(
    userId: string,
    reservationId: string,
    instalments: NewInstalment[],
  ): Promise<{ planId: string }> {
    assertSchedule(instalments);
    return withOrganizationContext(deps.db, { userId }, (tx) =>
      createPaymentPlanWithin(tx, userId, reservationId, instalments),
    );
  }

  /**
   * Withdraws what was not charged and writes `instalments` in its place, as
   * the plan's next revision. What was charged stays; one that was wrong is
   * reversed on the Folio and reads as waived. The reason is required and goes
   * on the audit record, because a revision changes what somebody is billed.
   */
  async function revisePaymentPlan(
    userId: string,
    reservationId: string,
    instalments: NewInstalment[],
    reason: string,
  ): Promise<{ revision: number }> {
    assertSchedule(instalments);
    const said = reason.trim();
    if (
      [...said].length < REVISION_REASON.min ||
      [...said].length > REVISION_REASON.max
    ) {
      throw new PaymentPlanInputError(
        `a reason is ${REVISION_REASON.min} to ${REVISION_REASON.max} characters`,
        "reason",
      );
    }

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      let revised: {
        planId: string;
        organizationId: string;
        propertyId: string;
        revision: number;
        withdrawn: number;
        added: number;
        totalMinor: string;
      };
      try {
        const [row] = await tx.$queryRaw<(typeof revised)[]>`
          select plan_id              as "planId",
                 plan_organization_id as "organizationId",
                 plan_property_id     as "propertyId",
                 plan_revision        as "revision",
                 withdrawn_count      as "withdrawn",
                 added_count          as "added",
                 total_minor::text    as "totalMinor"
            from app.revise_payment_plan(
                   ${reservationId}::uuid, ${wanted(instalments)}::jsonb)
        `;
        if (!row) {
          throw new Error("app.revise_payment_plan returned no row");
        }
        revised = row;
      } catch (error: unknown) {
        translate(error, "that payment plan cannot be revised");
      }

      await recordWithin(tx, {
        organizationId: revised.organizationId,
        locationId: revised.propertyId,
        actorId: userId,
        action: "payment_plan.revised",
        subjectType: "payment_plan",
        subjectId: revised.planId,
        reason: said,
        context: {
          reservationId,
          revision: revised.revision,
          instalmentsWithdrawn: revised.withdrawn,
          instalmentsAdded: revised.added,
          totalMinor: Number(revised.totalMinor),
        },
      });
      return { revision: revised.revision };
    });
  }

  /** A booking's plan with where each instalment stands, or null: none, or out of reach. */
  async function readPaymentPlan(
    userId: string,
    reservationId: string,
  ): Promise<PaymentPlan | null> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const [plan] = await tx.$queryRaw<
        {
          planId: string;
          propertyId: string;
          currency: string;
          revision: number;
        }[]
      >`
        select plan.id             as "planId",
               plan.property_id    as "propertyId",
               trim(plan.currency) as "currency",
               plan.revision       as "revision"
          from public.payment_plans as plan
         where plan.reservation_id = ${reservationId}::uuid
      `;
      if (!plan) return null;

      const rows = await tx.$queryRaw<StandingRow[]>`
        select standing.instalment_id            as "instalmentId",
               standing.number                   as "number",
               to_char(standing.due_on, 'YYYY-MM-DD') as "dueOn",
               standing.amount_minor::text       as "amountMinor",
               standing.currency                 as "currency",
               standing.posted                   as "posted",
               standing.paid_minor::text         as "paidMinor",
               standing.outstanding_minor::text  as "outstandingMinor",
               standing.state                    as "state"
          from app.payment_plan_standing(
                 ${plan.propertyId}::uuid, ${reservationId}::uuid) as standing
         order by standing.number
      `;
      const instalments: InstalmentStanding[] = rows.map((row) => ({
        instalmentId: row.instalmentId,
        number: row.number,
        dueOn: row.dueOn,
        amountMinor: Number(row.amountMinor),
        currency: row.currency,
        posted: row.posted,
        paidMinor: Number(row.paidMinor),
        outstandingMinor: Number(row.outstandingMinor),
        state: row.state,
      }));
      return {
        planId: plan.planId,
        reservationId,
        propertyId: plan.propertyId,
        currency: plan.currency,
        revision: plan.revision,
        instalments,
        totalMinor: instalments.reduce((sum, i) => sum + i.amountMinor, 0),
        paidMinor: instalments.reduce((sum, i) => sum + i.paidMinor, 0),
        outstandingMinor: instalments.reduce(
          (sum, i) => sum + i.outstandingMinor,
          0,
        ),
      };
    });
  }

  /**
   * How many Residents are overdue at the Property, on how many instalments,
   * and for how much money. Read from the one definition of overdue, so the
   * close, Today and a booking's schedule cannot disagree.
   */
  async function overdueFigure(
    userId: string,
    propertyId: string,
  ): Promise<OverdueFigure> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const [row] = await tx.$queryRaw<
        {
          students: number;
          instalments: number;
          overdueMinor: string;
          currency: string;
        }[]
      >`
        select students,
               instalments,
               outstanding_minor::text as "overdueMinor",
               currency
          from app.payment_plans_overdue(${propertyId}::uuid)
      `;
      if (!row) {
        throw new Error("app.payment_plans_overdue returned no row");
      }
      return { ...row, overdueMinor: Number(row.overdueMinor) };
    });
  }

  /** The rows `overdueFigure` counts, the longest overdue first. */
  async function overdueResidents(
    userId: string,
    propertyId: string,
  ): Promise<OverdueResident[]> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const rows = await tx.$queryRaw<
        {
          reservationId: string;
          residentName: string | null;
          instalments: number;
          overdueMinor: string;
          oldestDueOn: string;
        }[]
      >`
        select standing.reservation_id                       as "reservationId",
               guest.full_name                               as "residentName",
               count(*)::int                                 as "instalments",
               sum(standing.outstanding_minor)::text         as "overdueMinor",
               to_char(min(standing.due_on), 'YYYY-MM-DD')   as "oldestDueOn"
          from app.payment_plan_standing(${propertyId}::uuid) as standing
          join public.reservations as reservation
            on reservation.id = standing.reservation_id
          left join public.guests as guest on guest.id = reservation.guest_id
         where standing.state = 'overdue'
         group by standing.reservation_id, guest.full_name
         order by min(standing.due_on), guest.full_name
      `;
      return rows.map((row) => ({
        ...row,
        overdueMinor: Number(row.overdueMinor),
      }));
    });
  }

  return {
    createPaymentPlan,
    createPaymentPlanWithin,
    revisePaymentPlan,
    readPaymentPlan,
    overdueFigure,
    overdueResidents,
  };
}

export type PaymentPlansModule = ReturnType<typeof createPaymentPlansModule>;
