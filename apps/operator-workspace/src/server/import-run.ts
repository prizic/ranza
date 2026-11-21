import type { AccommodationModule } from "@ranza/accommodation";
import type { OperatingModel } from "@ranza/core";
import {
  IMPORT_BATCH,
  PEOPLE_COLUMNS,
  ROOM_COLUMNS,
  admissionOf,
  bookingOf,
  cellsByColumn,
  chosenMapping,
  matchColumns,
  placeOf,
  readPerson,
  readRoom,
  readTable,
  stagePeople,
  stageRooms,
  type ColumnMapping,
  type ColumnSpec,
  type ImportKind,
  type ImportRow,
  type ImportStatus,
  type ImportsModule,
  type PlaceOnFile,
  type RoomDefaults,
  type RowOutcome,
  type StagedRow,
} from "@ranza/imports";
import type { BookableUnit, ReservationsModule } from "@ranza/reservations";

/**
 * What turns a file into records (IMP-S1-*, IMP-S2-*, ADR 0065).
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
  reservations: Pick<
    ReservationsModule,
    | "checkIn"
    | "createReservation"
    | "listBookableUnits"
    | "listUnavailableUnits"
  >;
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

export interface PreviewInput {
  propertyId: string;
  fileName: string;
  bytes: Uint8Array;
  /** The columns a person chose, when the headings did not say. */
  chosen?: Readonly<Record<string, number | null>> | undefined;
}

/** By name and not `instanceof`: an action is bundled apart from the page. */
function isNamed(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}

/** What a refused booking is called in the result, by the error's name. */
const BOOKING_REFUSALS: Readonly<Record<string, string>> = {
  UnitUnavailableError: "bed_taken",
  GuestNotAdmittedError: "not_admitted",
  PriceChangedError: "price_changed",
  UnitNotInServiceError: "not_in_service",
  ReservationRefusedError: "not_permitted",
  GuestWriteError: "not_permitted",
  ReservationPeriodError: "invalid",
  GuestDetailsError: "invalid",
  GuestParticularsError: "invalid",
};

/** A bed by its room and its own name, or a room let whole. */
function placesOf(units: readonly BookableUnit[]): PlaceOnFile[] {
  return units.map((unit) => ({
    unitId: unit.unitId,
    room: unit.roomName ?? unit.unitName,
    bed: unit.roomName === null ? null : unit.unitName,
    admits: unit.admits,
  }));
}

/** What a batch of people is booked against, read afresh for each batch. */
interface PeopleBatch {
  today: string;
  places: readonly PlaceOnFile[];
  units: ReadonlyMap<string, BookableUnit>;
  residentByDefault: boolean;
}

export function createImportRun(deps: ImportRunDeps) {
  async function isDormitory(
    userId: string,
    propertyId: string,
  ): Promise<boolean> {
    return (await deps.operatingModel(userId, propertyId)) === "dormitory";
  }

  /**
   * Reads a file and records the preview. The file itself is not kept: what
   * is stored is its rows, which the sweep forgets (IMP-S1-15).
   */
  async function preview(
    userId: string,
    kind: ImportKind,
    input: PreviewInput,
    columns: readonly ColumnSpec[],
    stage: (
      rows: { rowNumber: number; cells: Record<string, string> }[],
    ) => Promise<StagedRow[]>,
  ): Promise<PreviewOutcome> {
    const table = await readTable(input.bytes, input.fileName);
    const match = input.chosen
      ? chosenMapping(input.chosen, table.headers, columns)
      : matchColumns(table.headers, columns);
    if (match.missing.length > 0) {
      return {
        status: "needsMapping",
        headers: table.headers,
        mapping: match.mapping,
        missing: match.missing,
      };
    }
    const rows = await stage(cellsByColumn(table, match.mapping));
    const importId = await deps.imports.stageImport(userId, {
      propertyId: input.propertyId,
      kind,
      fileName: input.fileName,
      rows,
    });
    return { status: "staged", importId, sheetsIgnored: table.sheetsIgnored };
  }

  function previewRooms(userId: string, input: PreviewInput) {
    return preview(userId, "rooms", input, ROOM_COLUMNS, async (rows) => {
      const [existing, letByTheBed] = await Promise.all([
        deps.accommodation.listUnits(userId, input.propertyId),
        isDormitory(userId, input.propertyId),
      ]);
      return stageRooms(
        rows,
        new Set(existing.units.map((unit) => unit.name)),
        { letByTheBed },
      );
    });
  }

  /**
   * People, each checked against the beds the Property has and the ones
   * already promised over their nights, as the booking dialog marks them.
   */
  function previewPeople(userId: string, input: PreviewInput) {
    return preview(userId, "people", input, PEOPLE_COLUMNS, async (rows) => {
      const batch = await peopleBatch(userId, input.propertyId);
      const periods = new Map<
        string,
        { startsOn: string; endsOn: string | null }
      >();
      for (const { cells } of rows) {
        const { person } = readPerson(cells, batch);
        if (person === null) continue;
        const nights = bookingOf(person, batch.today);
        periods.set(`${nights.startsOn}|${nights.endsOn ?? ""}`, nights);
      }
      const taken = new Map<string, ReadonlySet<string>>();
      for (const [key, nights] of periods) {
        const unavailable = await deps.reservations.listUnavailableUnits(
          userId,
          input.propertyId,
          nights.startsOn,
          nights.endsOn,
        );
        taken.set(key, new Set(unavailable.map((unit) => unit.unitId)));
      }
      return stagePeople(rows, {
        ...batch,
        taken: (startsOn, endsOn) =>
          taken.get(`${startsOn}|${endsOn ?? ""}`) ?? new Set(),
      });
    });
  }

  async function peopleBatch(
    userId: string,
    propertyId: string,
  ): Promise<PeopleBatch> {
    const [today, units, residentByDefault] = await Promise.all([
      deps.imports.businessDate(userId, propertyId),
      deps.reservations.listBookableUnits(userId, propertyId),
      isDormitory(userId, propertyId),
    ]);
    if (today === null) throw new Error("that Property is out of reach");
    return {
      today,
      places: placesOf(units),
      units: new Map(units.map((unit) => [unit.unitId, unit])),
      residentByDefault,
    };
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
   * One person, booked by reservations' own command and checked in when they
   * already live there (IMP-S2-01, IMP-S2-05). A booking that is taken settles
   * its row inside the booking's own transaction, so a closed tab can never
   * leave a booking whose row still says ready and would book it twice; a
   * stopped import refuses the settle and the booking with it.
   */
  async function importPerson(
    userId: string,
    importId: string,
    propertyId: string,
    row: ImportRow,
    batch: PeopleBatch,
  ): Promise<RowOutcome | ImportStatus> {
    const { person } = readPerson(row.cells, batch);
    if (person === null) return { state: "refused", outcome: "invalid" };
    if (person.leaving !== null && person.leaving <= batch.today) {
      return { state: "refused", outcome: "already_left" };
    }
    const found = placeOf(person, batch.places);
    if ("problem" in found)
      return { state: "refused", outcome: "no_such_place" };
    if (admissionOf(person, found.place)) {
      return { state: "refused", outcome: "not_admitted" };
    }
    const unit = batch.units.get(found.place.unitId);
    const byTheNight = person.stayType === "guest";
    const nights = bookingOf(person, batch.today);

    // Set by the booking's own transaction; a closure TypeScript cannot follow.
    let settled = null as ImportStatus | null;
    let reservationId: string;
    try {
      ({ reservationId } = await deps.reservations.createReservation(
        userId,
        {
          propertyId,
          accommodationUnitId: found.place.unitId,
          guestName: person.fullName,
          guestEmail: person.email,
          guestPhone: person.phone,
          guestGender: person.gender,
          particulars: person.particulars,
          stayType: person.stayType,
          startsOn: nights.startsOn,
          endsOn: nights.endsOn,
          // Quoted as the booking dialog quotes it (ADR 0038): a Guest at
          // the bed's price, a Resident never by the night.
          quotedRateMinor: byTheNight ? (unit?.nightlyRateMinor ?? null) : null,
          quotedCurrency: byTheNight ? (unit?.rateCurrency ?? null) : null,
        },
        async (tx, booking) => {
          settled = await deps.imports.settleRowWithin(
            tx,
            userId,
            importId,
            row.rowNumber,
            { state: "imported", resultId: booking.reservationId },
          );
        },
      ));
    } catch (error) {
      if (isNamed(error, "ImportStateError")) throw error;
      const refusal = Object.entries(BOOKING_REFUSALS).find(([name]) =>
        isNamed(error, name),
      );
      if (refusal) return { state: "refused", outcome: refusal[1] };
      deps.report(
        "import.row_failed",
        { propertyId, userId, rowNumber: row.rowNumber },
        error,
      );
      return { state: "refused", outcome: "failed" };
    }

    if (nights.checkInNow) {
      try {
        // They already sleep there: the desk's "Check in anyway".
        await deps.reservations.checkIn(userId, reservationId, {
          readinessAcknowledged: true,
        });
      } catch (error) {
        // The booking stands and they are on today's arrivals for the desk.
        deps.report(
          "import.check_in_failed",
          { propertyId, userId, rowNumber: row.rowNumber, reservationId },
          error,
        );
      }
    }
    return settled ?? "importing";
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
    if (rows.length === 0) {
      return (
        (await deps.imports.getImport(userId, importId))?.status ?? "finished"
      );
    }

    const importRow =
      kind === "rooms"
        ? await roomRunner(userId, propertyId)
        : await peopleRunner(userId, importId, propertyId);

    let status: ImportStatus = "importing";
    for (const row of rows) {
      if (status !== "importing") break;
      try {
        const done = await importRow(row);
        status =
          typeof done === "string"
            ? done
            : await deps.imports.settleRow(
                userId,
                importId,
                row.rowNumber,
                done,
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

  async function roomRunner(userId: string, propertyId: string) {
    const defaults = { letByTheBed: await isDormitory(userId, propertyId) };
    return (row: ImportRow) => importRoom(userId, propertyId, row, defaults);
  }

  async function peopleRunner(
    userId: string,
    importId: string,
    propertyId: string,
  ) {
    const batch = await peopleBatch(userId, propertyId);
    return (row: ImportRow) =>
      importPerson(userId, importId, propertyId, row, batch);
  }

  return { importNext, previewPeople, previewRooms };
}

export type ImportRun = ReturnType<typeof createImportRun>;
