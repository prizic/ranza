import { withOrganizationContext } from "@ranza/db";
import { recordWithin, type AuditClient } from "@ranza/platform-audit";
import {
  IMPORT_KINDS,
  ImportAlreadyRunningError,
  ImportRefusedError,
  ImportStateError,
  type ImportCounts,
  type ImportDetail,
  type ImportKind,
  type ImportRow,
  type ImportStatus,
  type ImportSummary,
  type NewImport,
  type RowOutcome,
} from "./contracts";
import type { ImportsDeps } from "./ports";

type ImportAction =
  "import.started" | "import.finished" | "import.stopped" | "import.discarded";

/**
 * The record of an import (IMP-S1-*, ADR 0065).
 *
 * This writes no room, booking or Guest. It keeps what a file held and what
 * became of each row, and the host makes each record through the command a
 * person would have used by hand, under the uploader's own session. Who may
 * import where, which way an import may move, who may settle a row and how
 * the counts follow are the policies and triggers of
 * `20260916014600_an_import_is_staged_then_run_by_its_uploader`.
 */

const INSUFFICIENT_PRIVILEGE = "42501";
const UNIQUE_VIOLATION = "23505";
const IMPORT_MOVE_REFUSED = "RZI01";
const ROW_SETTLE_REFUSED = "RZI02";

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

interface SummaryRow extends Omit<ImportSummary, "counts"> {
  organizationId: string;
  readyCount: number;
  wrongCount: number;
  skippedCount: number;
  importedCount: number;
  refusedCount: number;
  leftCount: number;
}

function summaryOf(
  row: SummaryRow,
): ImportSummary & { organizationId: string } {
  const {
    readyCount,
    wrongCount,
    skippedCount,
    importedCount,
    refusedCount,
    leftCount,
    ...rest
  } = row;
  const counts: ImportCounts = {
    ready: readyCount,
    wrong: wrongCount,
    skipped: skippedCount,
    imported: importedCount,
    refused: refusedCount,
    left: leftCount,
  };
  return { ...rest, counts };
}

export function createImportsModule(deps: ImportsDeps) {
  /** The imports the caller may read, newest first; one of them when asked. */
  async function summaries(
    tx: AuditClient,
    userId: string,
    where: { propertyId: string } | { importId: string },
  ): Promise<(ImportSummary & { organizationId: string })[]> {
    const propertyId = "propertyId" in where ? where.propertyId : null;
    const importId = "importId" in where ? where.importId : null;
    const rows = await tx.$queryRaw<SummaryRow[]>`
      select import.id                          as "id",
             import.organization_id             as "organizationId",
             import.property_id                 as "propertyId",
             import.kind                        as "kind",
             import.status                      as "status",
             import.file_name                   as "fileName",
             import.uploaded_by                 as "uploadedBy",
             uploader.email                     as "uploaderEmail",
             import.uploaded_by = ${userId}::uuid as "mine",
             import.created_at                  as "createdAt",
             import.closed_at                   as "closedAt",
             import.rows_forgotten_at is not null as "rowsForgotten",
             import.ready_count                 as "readyCount",
             import.wrong_count                 as "wrongCount",
             import.skipped_count               as "skippedCount",
             import.imported_count              as "importedCount",
             import.refused_count               as "refusedCount",
             import.left_count                  as "leftCount"
        from public.imports as import
        left join public.users as uploader on uploader.id = import.uploaded_by
       where (${propertyId}::uuid is null or import.property_id = ${propertyId}::uuid)
         and (${importId}::uuid is null or import.id = ${importId}::uuid)
       order by import.created_at desc
       limit 50
    `;
    return rows.map(summaryOf);
  }

  /** One record per move of an import: how many rows, and no cell of the file. */
  async function audit(
    tx: AuditClient,
    {
      userId,
      summary,
      action,
    }: {
      userId: string;
      summary: ImportSummary & { organizationId: string };
      action: ImportAction;
    },
  ): Promise<void> {
    await recordWithin(tx, {
      organizationId: summary.organizationId,
      locationId: summary.propertyId,
      actorId: userId,
      action,
      subjectType: "import",
      subjectId: summary.id,
      context: {
        kind: summary.kind,
        fileName: summary.fileName,
        ready: summary.counts.ready,
        wrong: summary.counts.wrong,
        skipped: summary.counts.skipped,
        imported: summary.counts.imported,
        refused: summary.counts.refused,
        left: summary.counts.left,
      },
    });
  }

  /** Whether the caller may import at the Property: the screen's gate. */
  async function mayImport(
    userId: string,
    propertyId: string,
  ): Promise<boolean> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const [row] = await tx.$queryRaw<{ may: boolean }[]>`
        select app.has_organization_permission(property.organization_id, 'import.run') as "may"
          from public.properties as property
         where property.id = ${propertyId}::uuid
           and property.id in (select app.accessible_property_ids())
      `;
      return row?.may ?? false;
    });
  }

  /**
   * Records a previewed file: the import and its rows in one transaction, so
   * a preview is whole or absent. Nothing else is written (IMP-S1-01).
   */
  async function stageImport(
    userId: string,
    input: NewImport,
  ): Promise<string> {
    if (!IMPORT_KINDS.includes(input.kind)) {
      throw new ImportStateError("that is not a kind of import");
    }
    const fileName = input.fileName.trim().slice(0, 200) || "import";
    try {
      return await withOrganizationContext(deps.db, { userId }, async (tx) => {
        const [created] = await tx.$queryRaw<
          { id: string; organizationId: string }[]
        >`
          insert into public.imports
            (organization_id, property_id, kind, file_name, uploaded_by)
          select property.organization_id, property.id, ${input.kind},
                 ${fileName}, ${userId}::uuid
            from public.properties as property
           where property.id = ${input.propertyId}::uuid
          returning id, organization_id as "organizationId"
        `;
        if (!created) throw new ImportRefusedError();

        const rows = JSON.stringify(
          input.rows.map((row) => ({
            n: row.rowNumber,
            s: row.state,
            c: row.cells,
            p: row.problems,
          })),
        );
        await tx.$executeRaw`
          insert into public.import_rows
            (import_id, row_number, organization_id, property_id, state, cells, problems)
          select ${created.id}::uuid, (row ->> 'n')::int,
                 ${created.organizationId}::uuid, ${input.propertyId}::uuid,
                 row ->> 's', row -> 'c', row -> 'p'
            from jsonb_array_elements(${rows}::jsonb) as row
        `;
        return created.id;
      });
    } catch (error) {
      if (raised(error, INSUFFICIENT_PRIVILEGE)) throw new ImportRefusedError();
      throw error;
    }
  }

  async function listImports(
    userId: string,
    propertyId: string,
  ): Promise<ImportSummary[]> {
    return withOrganizationContext(deps.db, { userId }, (tx) =>
      summaries(tx, userId, { propertyId }),
    );
  }

  /** One import; its rows when the caller uploaded it and they are still held. */
  async function getImport(
    userId: string,
    importId: string,
  ): Promise<ImportDetail | null> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const [summary] = await summaries(tx, userId, { importId });
      if (!summary) return null;
      const rows = await tx.$queryRaw<ImportRow[]>`
        select row_number as "rowNumber", state, cells, problems, outcome
          from public.import_rows
         where import_id = ${importId}::uuid
         order by row_number
      `;
      return { ...summary, rows };
    });
  }

  /** staged to importing, by its uploader, with a ready row (IMP-S1-06, IMP-S1-07). */
  async function startImport(userId: string, importId: string): Promise<void> {
    try {
      await withOrganizationContext(deps.db, { userId }, async (tx) => {
        const moved = await tx.$executeRaw`
          update public.imports set status = 'importing'
           where id = ${importId}::uuid and status = 'staged'
        `;
        if (moved === 0) throw new ImportStateError();
        const [summary] = await summaries(tx, userId, { importId });
        if (!summary) throw new ImportRefusedError();
        await audit(tx, {
          userId,
          summary,
          action: "import.started",
        });
      });
    } catch (error) {
      if (raised(error, UNIQUE_VIOLATION))
        throw new ImportAlreadyRunningError();
      if (raised(error, IMPORT_MOVE_REFUSED)) throw new ImportStateError();
      throw error;
    }
  }

  /** The next rows still to import, in the file's order. The uploader's only. */
  async function nextReadyRows(
    userId: string,
    importId: string,
    limit: number,
  ): Promise<{ kind: ImportKind; propertyId: string; rows: ImportRow[] }> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const [summary] = await summaries(tx, userId, { importId });
      if (!summary || !summary.mine) throw new ImportRefusedError();
      if (summary.status !== "importing") {
        return { kind: summary.kind, propertyId: summary.propertyId, rows: [] };
      }
      const rows = await tx.$queryRaw<ImportRow[]>`
        select row_number as "rowNumber", state, cells, problems, outcome
          from public.import_rows
         where import_id = ${importId}::uuid and state = 'ready'
         order by row_number
         limit ${limit}
      `;
      return { kind: summary.kind, propertyId: summary.propertyId, rows };
    });
  }

  /**
   * Says what became of one ready row, in the caller's transaction. The last
   * one finishes the import, and the finish is audited here, in the
   * transaction that caused it. A host settles a row inside the command that
   * made its record, so the two commit together or not at all (IMP-S2-01).
   */
  async function settleRowWithin(
    tx: AuditClient,
    userId: string,
    importId: string,
    rowNumber: number,
    outcome: RowOutcome,
  ): Promise<ImportStatus> {
    try {
      const settled = await tx.$queryRaw<{ rowNumber: number }[]>`
        update public.import_rows
           set state = ${outcome.state},
               outcome = ${outcome.outcome ?? null},
               result_id = ${outcome.resultId ?? null}::uuid
         where import_id = ${importId}::uuid and row_number = ${rowNumber}
        returning row_number as "rowNumber"
      `;
      if (settled.length === 0) throw new ImportRefusedError();
      const [summary] = await summaries(tx, userId, { importId });
      if (!summary) throw new ImportRefusedError();
      if (summary.status === "finished") {
        await audit(tx, {
          userId,
          summary,
          action: "import.finished",
        });
      }
      return summary.status;
    } catch (error) {
      if (raised(error, ROW_SETTLE_REFUSED)) throw new ImportStateError();
      throw error;
    }
  }

  /** The same, in a transaction of its own. */
  async function settleRow(
    userId: string,
    importId: string,
    rowNumber: number,
    outcome: RowOutcome,
  ): Promise<ImportStatus> {
    return withOrganizationContext(deps.db, { userId }, (tx) =>
      settleRowWithin(tx, userId, importId, rowNumber, outcome),
    );
  }

  /**
   * The Property's business date (ADR 0021): the day an import books from.
   * Null for a Property out of the caller's reach.
   */
  async function businessDate(
    userId: string,
    propertyId: string,
  ): Promise<string | null> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const [row] = await tx.$queryRaw<{ day: string }[]>`
        select to_char(app.property_today(property.id), 'YYYY-MM-DD') as "day"
          from public.properties as property
         where property.id = ${propertyId}::uuid
           and property.id in (select app.accessible_property_ids())
      `;
      return row?.day ?? null;
    });
  }

  async function close(
    userId: string,
    importId: string,
    { from, action }: { from: "importing" | "staged"; action: ImportAction },
  ): Promise<void> {
    const to = from === "importing" ? "finished" : "discarded";
    try {
      await withOrganizationContext(deps.db, { userId }, async (tx) => {
        const moved = await tx.$executeRaw`
          update public.imports set status = ${to}
           where id = ${importId}::uuid and status = ${from}
        `;
        if (moved === 0) throw new ImportStateError();
        const [summary] = await summaries(tx, userId, { importId });
        if (!summary) throw new ImportRefusedError();
        await audit(tx, { userId, summary, action });
      });
    } catch (error) {
      if (raised(error, IMPORT_MOVE_REFUSED)) throw new ImportStateError();
      throw error;
    }
  }

  /** Any importer at the Property; what is still ready is left unimported (IMP-S1-12). */
  const stopImport = (userId: string, importId: string) =>
    close(userId, importId, {
      from: "importing",
      action: "import.stopped",
    });

  /** Its uploader, before anything was imported (IMP-S1-13). */
  const discardImport = (userId: string, importId: string) =>
    close(userId, importId, {
      from: "staged",
      action: "import.discarded",
    });

  return {
    businessDate,
    discardImport,
    getImport,
    listImports,
    mayImport,
    nextReadyRows,
    settleRow,
    settleRowWithin,
    stageImport,
    startImport,
    stopImport,
  };
}

export type ImportsModule = ReturnType<typeof createImportsModule>;
