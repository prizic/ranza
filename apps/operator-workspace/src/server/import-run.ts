import type { AccommodationModule } from "@ranza/accommodation";
import type { OperatingModel } from "@ranza/core";
import {
  IMPORT_BATCH,
  ROOM_COLUMNS,
  cellsByColumn,
  chosenMapping,
  matchColumns,
  readRoom,
  readTable,
  stageRooms,
  type ColumnMapping,
  type ImportRow,
  type ImportStatus,
  type ImportsModule,
  type RoomDefaults,
  type RowOutcome,
} from "@ranza/imports";

/**
 * What turns a file into records (IMP-S1-*, ADR 0065).
 *
 * The imports module keeps the record of a file; this makes each row through
 * the command a person would have used by hand, under the same user's
 * session, and tells the record what came of it. So an import can do nothing
 * its uploader could not: there is no other way into any table from here.
 *
 * Free of the framework on purpose, so the integration suite runs it against a
 * real database as the application does.
 */
export interface ImportRunDeps {
  imports: ImportsModule;
  accommodation: Pick<AccommodationModule, "addUnits" | "listUnits">;
  operatingModel(
    userId: string,
    propertyId: string,
  ): Promise<OperatingModel | null>;
  /** Told of a row that failed for a reason nobody named. */
  report(event: string, context: Record<string, unknown>, error: unknown): void;
}

export type PreviewOutcome =
  | { status: "staged"; importId: string; sheetsIgnored: number }
  | {
      /** A required column no heading matched: the person says which it is. */
      status: "needsMapping";
      headers: readonly string[];
      mapping: ColumnMapping;
      missing: readonly string[];
    };

/** By name and not `instanceof`: an action is bundled apart from the page. */
function isNamed(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}

export function createImportRun(deps: ImportRunDeps) {
  async function roomDefaults(
    userId: string,
    propertyId: string,
  ): Promise<RoomDefaults> {
    return {
      letByTheBed:
        (await deps.operatingModel(userId, propertyId)) === "dormitory",
    };
  }

  /**
   * Reads a file of rooms and records the preview. The file itself is not
   * kept: what is stored is its rows, which the sweep forgets (IMP-S1-15).
   */
  async function previewRooms(
    userId: string,
    input: {
      propertyId: string;
      fileName: string;
      bytes: Uint8Array;
      /** The columns a person chose, when the headings did not say. */
      chosen?: Readonly<Record<string, number | null>> | undefined;
    },
  ): Promise<PreviewOutcome> {
    const table = await readTable(input.bytes, input.fileName);
    const match = input.chosen
      ? chosenMapping(input.chosen, table.headers, ROOM_COLUMNS)
      : matchColumns(table.headers, ROOM_COLUMNS);
    const rows = cellsByColumn(table, match.mapping);
    if (match.missing.length > 0) {
      return {
        status: "needsMapping",
        headers: table.headers,
        mapping: match.mapping,
        missing: match.missing,
      };
    }

    const [existing, defaults] = await Promise.all([
      deps.accommodation.listUnits(userId, input.propertyId),
      roomDefaults(userId, input.propertyId),
    ]);
    const importId = await deps.imports.stageImport(userId, {
      propertyId: input.propertyId,
      kind: "rooms",
      fileName: input.fileName,
      rows: stageRooms(
        rows,
        new Set(existing.units.map((unit) => unit.name)),
        defaults,
      ),
    });
    return { status: "staged", importId, sheetsIgnored: table.sheetsIgnored };
  }

  /** One room, by accommodation's own command; what it answered, as an outcome. */
  async function importRoom(
    userId: string,
    propertyId: string,
    row: ImportRow,
    defaults: RoomDefaults,
  ): Promise<RowOutcome> {
    const { room } = readRoom(row.cells, defaults);
    if (room === null) return { state: "refused", outcome: "invalid" };
    try {
      const added = await deps.accommodation.addUnits(userId, {
        ...room,
        propertyId,
        count: 1,
      });
      return { state: "imported", resultId: added.unitIds[0] ?? null };
    } catch (error) {
      // Added by somebody since the preview: decided by the unique name.
      if (isNamed(error, "UnitNameTakenError")) {
        return { state: "skipped", outcome: "already_there" };
      }
      if (isNamed(error, "UnitRefusedError")) {
        return { state: "refused", outcome: "not_permitted" };
      }
      if (isNamed(error, "UnitConfigurationError")) {
        return { state: "refused", outcome: "invalid" };
      }
      deps.report(
        "import.row_failed",
        { propertyId, userId, rowNumber: row.rowNumber },
        error,
      );
      return { state: "refused", outcome: "failed" };
    }
  }

  /**
   * Imports the next few ready rows and answers where the import stands, so a
   * page asks again until it is finished and a closed tab only pauses it
   * (IMP-S1-11). A row is settled the moment its command answers: one that
   * was imported is never offered again.
   */
  async function importNext(
    userId: string,
    importId: string,
  ): Promise<ImportStatus> {
    const { kind, propertyId, rows } = await deps.imports.nextReadyRows(
      userId,
      importId,
      IMPORT_BATCH,
    );
    if (kind !== "rooms" || rows.length === 0) {
      return (
        (await deps.imports.getImport(userId, importId))?.status ?? "finished"
      );
    }
    const defaults = await roomDefaults(userId, propertyId);
    let status: ImportStatus = "importing";
    for (const row of rows) {
      if (status !== "importing") break;
      const outcome = await importRoom(userId, propertyId, row, defaults);
      try {
        status = await deps.imports.settleRow(
          userId,
          importId,
          row.rowNumber,
          outcome,
        );
      } catch (error) {
        // Settled already by the same person's other tab, or the import was
        // stopped under this request: the record is right, so read it and go on.
        if (!isNamed(error, "ImportStateError")) throw error;
        status =
          (await deps.imports.getImport(userId, importId))?.status ??
          "finished";
      }
    }
    return status;
  }

  return { importNext, previewRooms };
}

export type ImportRun = ReturnType<typeof createImportRun>;
