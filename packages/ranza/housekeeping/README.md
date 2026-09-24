# @ranza/housekeeping

Whether a room needs cleaning (blueprint 5.4, 18.2). Check-out makes a room
dirty on its own, and whoever is told "204 is done" marks it clean or inspected,
one room at a time or many at once. Housekeepers are not assumed to use the
app: the permission that marks a room is one the front desk holds too.

## What this module owns

The `housekeeping_unit_status` table: one row per **status holder**, a Unit with
no parent. A bed under a room answers to its room; a bed with no room above it
(ADR 0004) holds its own row. A holder with no row reads as clean. See
[ADR 0029](../../../docs/adr/0029-housekeeping-status-is-a-room-s-own-row.md)
for why this is a table of its own and not another value of
`accommodation_units.status`: whether a room needs cleaning and whether it is in
service are two facts that coexist.

The table, its triggers and its read policy are in
[`20260916003000_a_check_out_makes_the_room_dirty`](../../../prisma/migrations/20260916003000_a_check_out_makes_the_room_dirty/migration.sql).
The write policies and the permission are in
[`20260916003100_a_room_is_marked_from_the_workspace`](../../../prisma/migrations/20260916003100_a_room_is_marked_from_the_workspace/migration.sql).

## Contract

```ts
import { createHousekeepingModule } from "@ranza/housekeeping";

const housekeeping = createHousekeepingModule({ db });
await housekeeping.board(userId, propertyId);
await housekeeping.markUnits(userId, { unitIds, status: "clean" });
```

- `board` returns every holder at a Property with its status, whether it is
  ready, whether somebody is in house, and whether the reader may mark.
- `inspectionSettings`, `setPropertyInspection` and `setOrganizationInspection`
  read and change whether a cleaned room waits to be inspected before it is
  ready: an Organization default, and a Property override that is on, off, or
  "use the default". The setting changes what ready means, never what a room
  holds (`20260916003200_check_rooms_after_cleaning`).
- `markUnits` is all or nothing: a selection naming a Unit the caller cannot see
  is refused whole. Every room it reaches gets its own audit record,
  `housekeeping.status_changed`, carrying the status it replaced.

"Ready" is `app.unit_is_ready()` in the database, read by the board, the
arrivals list and check-in alike, so no screen can disagree with another about
it.

## What it does not do

A departure's mark is not here. `apps/worker` handles `stay.checked_out` by
calling `app.mark_unit_dirty_after_check_out()`, which is the whole of what
`ranza_worker` may do to this table (ADR 0027's shape).

## Rules

- Receives its client; never reads the environment (ADR 0006).
- The write policies bound every mark; nothing here checks a permission.
- `status_changed_at` and `status_changed_by` are stamped by the database and
  are in no grant, so a mark cannot claim somebody else made it.
