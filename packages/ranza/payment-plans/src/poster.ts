import {
  POST_INSTALMENTS_JOB,
  type InstalmentPosterReport,
  type PostedAtProperty,
} from "./contracts";
import type { InstalmentPosterDeps } from "./ports";

/**
 * The worker's half of a payment plan (ADR 0059, ADR 0018 amended).
 *
 * One pass asks which Properties have an instalment ready to charge — the one
 * read the worker makes across Organizations, ids and nothing else — and then
 * charges each inside its own Organization's context, one transaction per
 * Property. Nothing here decides whether an instalment may be charged:
 * `app.post_due_instalments()` does, once, however often this runs, and an
 * instalment whose Resident has no open Folio yet is counted as waiting and
 * charged on the pass after they check in.
 */
const POST_TRANSACTION = { maxWait: 15_000, timeout: 30_000 };

export function createInstalmentPoster(deps: InstalmentPosterDeps) {
  async function postOne(due: {
    organizationId: string;
    propertyId: string;
  }): Promise<PostedAtProperty> {
    return deps.db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "select app.set_worker_context($1::uuid, $2)",
        due.organizationId,
        POST_INSTALMENTS_JOB,
      );
      const [row] = await tx.$queryRaw<{ posted: number; waiting: number }[]>`
        select posted, waiting
          from app.post_due_instalments(${due.propertyId}::uuid)
      `;
      // A function call returns one row. None would be a driver fault, and it
      // is reported as this Property's failure rather than read as nothing due.
      if (!row) {
        throw new Error("app.post_due_instalments returned no row");
      }
      return { propertyId: due.propertyId, ...row };
    }, POST_TRANSACTION);
  }

  async function postDueInstalments(): Promise<InstalmentPosterReport> {
    const due = await deps.db.$queryRaw<
      { organizationId: string; propertyId: string }[]
    >`
      select organization_id as "organizationId",
             property_id     as "propertyId"
        from app.properties_with_instalments_due()
    `;

    const report: InstalmentPosterReport = {
      due: due.length,
      posted: 0,
      waiting: 0,
      failures: [],
    };
    // One Property's failure is recorded and the pass goes on: an instalment
    // that cannot be charged at one Property says nothing about the next.
    for (const property of due) {
      try {
        const outcome = await postOne(property);
        report.posted += outcome.posted;
        report.waiting += outcome.waiting;
      } catch (error) {
        report.failures.push({ propertyId: property.propertyId, error });
      }
    }
    return report;
  }

  return { postDueInstalments };
}

export type InstalmentPoster = ReturnType<typeof createInstalmentPoster>;
