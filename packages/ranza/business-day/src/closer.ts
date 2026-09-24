import {
  CLOSE_JOB,
  type AutomaticCloseOutcome,
  type DayCloserReport,
} from "./contracts";
import type { DayCloserDeps } from "./ports";

/**
 * The worker's half of closing a day (ADR 0034, ADR 0018 amended).
 *
 * One pass asks which days are due — the one read the worker makes across
 * Organizations, ids and a date — and then closes each inside its own
 * Organization's context, one transaction per Property. Nothing here decides
 * whether a day may close: `app.close_business_day_automatically()` does, and
 * closes only a day with nothing open. A Property waiting on its desk is
 * answered `open_items` and asked again on the next pass.
 *
 * One day per Property per pass. A backlog of quiet days therefore clears at
 * one a pass, oldest first, which is the order days must close in anyway.
 */
const CLOSE_TRANSACTION = { maxWait: 15_000, timeout: 30_000 };

export function createDayCloser(deps: DayCloserDeps) {
  async function closeOne(due: {
    organizationId: string;
    propertyId: string;
    businessDate: string;
  }): Promise<AutomaticCloseOutcome> {
    // The bounds a request's transaction has (withOrganizationContext): a close
    // waits on the Property's lock behind check-ins, check-outs and a desk's
    // own close, and Prisma's five-second default is shorter than a request
    // may hold that lock.
    return deps.db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "select app.set_worker_context($1::uuid, $2)",
        due.organizationId,
        CLOSE_JOB,
      );
      const [row] = await tx.$queryRaw<{ outcome: AutomaticCloseOutcome }[]>`
        select app.close_business_day_automatically(
                 ${due.propertyId}::uuid, ${due.businessDate}::date
               ) as outcome
      `;
      // A function call returns one row. None would be a driver fault, and
      // it is reported as this Property's failure rather than read as a close.
      if (!row) {
        throw new Error("app.close_business_day_automatically returned no row");
      }
      return row.outcome;
    }, CLOSE_TRANSACTION);
  }

  async function closeDueDays(): Promise<DayCloserReport> {
    const due = await deps.db.$queryRaw<
      { organizationId: string; propertyId: string; businessDate: string }[]
    >`
      select organization_id                        as "organizationId",
             property_id                            as "propertyId",
             to_char(business_date, 'YYYY-MM-DD')   as "businessDate"
      from app.properties_due_for_close()
    `;

    const report: DayCloserReport = {
      due: due.length,
      closed: 0,
      open: 0,
      failures: [],
    };
    // One Property's failure is recorded and the pass goes on: a close that
    // raises at one Property says nothing about the next.
    for (const day of due) {
      try {
        const outcome = await closeOne(day);
        if (outcome === "closed") report.closed += 1;
        if (outcome === "open_items") report.open += 1;
      } catch (error) {
        report.failures.push({ propertyId: day.propertyId, error });
      }
    }
    return report;
  }

  return { closeDueDays };
}

export type DayCloser = ReturnType<typeof createDayCloser>;
