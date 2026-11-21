import { SWEEP_IMPORTS_JOB, type SweepImportsReport } from "./contracts";
import type { ImportSweeperDeps } from "./ports";

/**
 * The worker's half (ADR 0018, IMP-S1-15): after seven days untouched an
 * import's rows are deleted, and one still open is closed so it stops holding
 * its Property. Which imports those are, and that the worker's Organization is
 * the import's, are the database's answers; this decides the order.
 */
export function createImportSweeper({ db }: ImportSweeperDeps) {
  async function sweep(): Promise<SweepImportsReport> {
    const due = await db.$queryRaw<
      { importId: string; organizationId: string }[]
    >`
      select import_id as "importId", organization_id as "organizationId"
        from app.imports_past_retention()`;

    const report: SweepImportsReport = {
      due: due.length,
      forgotten: 0,
      failures: [],
    };
    for (const { importId, organizationId } of due) {
      try {
        const forgotten = await db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            "select app.set_worker_context($1::uuid, $2)",
            organizationId,
            SWEEP_IMPORTS_JOB,
          );
          const [row] = await tx.$queryRaw<{ forgotten: boolean }[]>`
            select app.forget_import_rows(${importId}::uuid) as "forgotten"`;
          return row?.forgotten ?? false;
        });
        if (forgotten) report.forgotten += 1;
      } catch (error) {
        report.failures.push({ importId, error });
      }
    }
    return report;
  }

  return { sweep };
}

export type ImportSweeper = ReturnType<typeof createImportSweeper>;
