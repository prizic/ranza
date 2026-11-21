# @ranza/imports

Rooms, and the people who live in them, from a spreadsheet: read, previewed
row by row, then made one command at a time under the uploader's own session
(blueprint 19.1).
[ADR 0065](../../../docs/adr/0065-an-import-is-a-record-of-a-file-and-each-row-is-made-by-its-uploader.md)
says why; [`docs/features/guided-import/`](../../../docs/features/guided-import/edge-cases.csv)
says what it owes.

## What this module owns

`imports` and `import_rows`, their triggers, grants and policies, and the
worker's two sweep functions, in
[`20260916014600_an_import_is_staged_then_run_by_its_uploader`](../../../prisma/migrations/20260916014600_an_import_is_staged_then_run_by_its_uploader/migration.sql).
Who may import, that only the uploader reads and settles the rows, that a row
is settled once and an import only moves forward, that one import runs at a
Property at a time, and the counts, are the database's.

It owns no room, booking or Guest. The host makes each row with the module that
owns it (`accommodation.addUnits` for a room, `reservations.createReservation`
and `checkIn` for a person) and tells this module what came of it. That is what
keeps an import from doing anything its uploader could not do by hand. A person
is settled with `settleRowWithin`, inside the booking's own transaction, so the
booking and its row commit together.

## Contract

```ts
const imports = createImportsModule({ db }); // db: the ranza_app client (ADR 0006)

await imports.mayImport(userId, propertyId); // the screen's gate
const table = await readTable(bytes, fileName); // xlsx or csv; ImportFileError names why not
const match = matchColumns(table.headers, ROOM_COLUMNS); // headings in tr, en or ar
const id = await imports.stageImport(userId, {
  propertyId,
  kind: "rooms",
  fileName,
  rows: stageRooms(
    cellsByColumn(table, match.mapping),
    existingNames,
    defaults,
  ),
});

await imports.startImport(userId, id); // ImportAlreadyRunningError while another runs
const { rows } = await imports.nextReadyRows(userId, id, IMPORT_BATCH);
await imports.settleRow(userId, id, row.rowNumber, {
  state: "imported",
  resultId,
});
await imports.settleRowWithin(tx, userId, id, rowNumber, outcome); // in a command's own transaction
await imports.businessDate(userId, propertyId); // the day a person is booked from
await imports.stopImport(userId, id); // anybody who may import there
await imports.discardImport(userId, id); // its uploader, before it starts

await imports.listImports(userId, propertyId); // newest first, counts, no rows
await imports.getImport(userId, id); // rows only for the uploader, while held

const sweeper = createImportSweeper({ db }); // db: the ranza_worker client
await sweeper.sweep(); // forgets the rows of imports untouched for seven days
```

A people file is read with `PEOPLE_COLUMNS` and staged with
`stagePeople(rows, { today, places, taken, residentByDefault })`: each row names
a room, and a bed where the room is let by the bed, and is checked against the
places the Property has, who they admit and which are already promised over
those nights. `readDay` reads `31.12.2026` and `2026-12-31` and refuses a date
that reads two ways. `bookingOf` says the nights a person is booked for and
whether they are checked in at once.

`templateRows`, `resultRows`, `rowsToFix` and `workbookOf` build the three files
a person downloads: the template in their language, every row with its outcome,
and the rows to fix in the template's own columns.

## Rules

- Only `index.ts` and `contracts.ts` are importable; `contracts.ts` holds what a
  browser bundle may import (limits, kinds, error names) and nothing that
  reaches a database.
- It receives its client and never constructs one, and never reads
  `process.env` ([ADR 0006](../../../docs/adr/0006-modules-take-dependencies-by-injection.md)).
- No cell of a file is written to the audit log or to a log line; an import is
  recorded by its counts.
- The uploaded file is read and never stored.

## What is deliberately not here

Payment plans and carried-over balances (slice 3), undoing a whole import,
matching a Guest by identity number, booking the nights before the import and
the setup checklist are rows in the feature's table, `IMP-S3-*` and
`IMP-DEF-*`.

Verified against a real database by
[`tests/database/guided_import.test.sql`](../../../tests/database/guided_import.test.sql)
and [`tests/integration/guided-import.test.ts`](../../../tests/integration/guided-import.test.ts).
