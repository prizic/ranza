# @ranza/accommodation

Accommodation Units — the sellable or assignable spaces inside a Property
(blueprint sections 2 and 5.2). A Unit is a room, a bed, an apartment or a
suite; which of those a Property uses is configuration rather than a separate
product ([ADR 0004](../../../docs/adr/0004-student-residence-is-a-property-configuration.md)).

## What this module owns

The `accommodation_units` table, its check constraints, and its row-level
security policies — all in
[`prisma/migrations/20260916000300_accommodation_units`](../../../prisma/migrations/20260916000300_accommodation_units/migration.sql)
and in the migration that adds the Resident policy alongside it. No other module
writes to that table.

A Unit carries `organization_id` next to `property_id` so a composite foreign
key can prove the pair belongs together. "This Unit belongs to another
Organization's Property" is therefore unrepresentable rather than merely
checked, which is what blueprint 7.1 asks for. It carries a second composite key
on `(id, property_id, organization_id)` so a Stay can reference all three at
once and prove the same thing about itself.

## Contract

```ts
import type { AccommodationUnitType } from "@ranza/accommodation";
```

Types only, for now. Both unions mirror check constraints in the migration, and
the database stays the authority: widening a union here without widening the
constraint fails at insert time, which is the safe direction.

There is deliberately no query yet. Nothing reads a Unit except through a Stay,
and [`@ranza/stays`](../stays/README.md) joins it inside the one statement that
all of blueprint 3.5's gates apply to. A unit directory — the read Housekeeping
and the front desk will want — belongs here when a screen needs it, not before.

## Rules

- Only `index.ts` is importable.
- If a query is added it receives its client; it never constructs one and never
  reads `process.env` ([ADR 0006](../../../docs/adr/0006-modules-take-dependencies-by-injection.md)).

Verified against a real database by
[`tests/database/resident_access_path.test.sql`](../../../tests/database/resident_access_path.test.sql),
which covers who reaches a Unit from both directions: a Staff Member through
their Property assignment, a Resident through their own Stay and no further.
