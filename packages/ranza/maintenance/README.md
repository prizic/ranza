# @ranza/maintenance

A problem reported at a Property, and the work on it (blueprint 5.13 and 6.5).
Anyone at the Property reports; a few work the board. A request may hold its
room out of order until it is fixed, and the room comes back when the last
request holding it lets go.

## What this module owns

- `maintenance_requests`: one row per problem, numbered per Property (MT-12),
  never deleted. A mistaken report is cancelled with a reason.
- `maintenance_unit_holds`: whether a request holds its Unit out of order. A
  table of its own because a different permission writes it: moving a request
  is `maintenance.manage`, holding a room is `maintenance.take_out_of_order`,
  and each table's policies name one of them.
- `maintenance_settings`: an Organization default and Property overrides for
  whether work needs an assignee, whether a room returns when its request is
  done, and what it returns as.

The tables, policies and triggers are in
[`20260916004300_a_problem_is_reported_and_worked`](../../../prisma/migrations/20260916004300_a_problem_is_reported_and_worked/migration.sql)
and
[`20260916004400_a_request_takes_a_room_out_of_order`](../../../prisma/migrations/20260916004400_a_request_takes_a_room_out_of_order/migration.sql).
Why out of order is `accommodation_units.status` held by requests is
[ADR 0032](../../../docs/adr/0032-out-of-order-is-a-unit-status-a-maintenance-request-holds.md);
the design is [`docs/features/maintenance/`](../../../docs/features/maintenance/).

## Contract

```ts
import { createMaintenanceModule } from "@ranza/maintenance";

const maintenance = createMaintenanceModule({ db });
await maintenance.board(userId, propertyId);
await maintenance.report(userId, {
  propertyId,
  unitId,
  title,
  priority: "urgent",
});
await maintenance.move(userId, { requestId, from: "new", to: "in_progress" });
```

- `board`, `reportOptions`, `outOfOrderImpact`, `roomsView` and `settings` are
  reads; each carries the commercial gates in its own statement and returns
  nothing for a Property out of reach or without maintenance.
- `report`, `move`, `cancel`, `assign` and `prioritise` work a request. A move
  names the state the mover saw, and one that has left it is refused.
- `takeOutOfOrder` and `returnToService` hold and release a room. Taking one
  that somebody is in, or is booked on, waits for an acknowledgement and
  writes nothing until it comes.
- `setPropertySettings` and `setOrganizationSettings` change the setting.

## Rules

- Receives its client; never reads the environment (ADR 0006).
- The write policies bound every command; nothing here checks a permission.
- The Unit's status changes only through `@ranza/accommodation`'s write
  contract, with the Unit's row locked before any request row, in the
  transaction that writes the hold.
- `unit.returned_to_service` carries ids only. What the room comes back as is
  stamped on the hold by the database and read from there by the worker.

Verified against a real database by `tests/database/maintenance.test.sql` and
`tests/integration/maintenance.test.ts`.
