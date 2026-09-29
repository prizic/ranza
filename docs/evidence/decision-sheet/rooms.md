# Rooms lane: sabotage record

Every boundary test added by the rooms lane was run red before it was trusted
(AGENTS.md, "Testing security claims"). Each run below names what was broken,
the object as it stood after the break, and which tests went red. Every break
was reverted and the reverted object compared with the original.

Suites: `tests/integration/rooms.test.ts` (IT), `tests/unit/accommodation-add-units.test.ts`
(UT), `tests/unit/rooms-view.test.tsx` (VT). Lane database on port 54491.

## Code breaks (edited, run, `git checkout` of the file)

For each of these the changed line was printed with `git diff --stat` showing the
file as modified before the suite ran.

| Row      | What was broken                                                                                      | Object after the break                                                                    | Red                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| RB-S1-01 | `entryOf` returns `beds: []`                                                                         | `module.ts` `entryOf`: `beds: [],`                                                        | IT: rooms lists every unit at the property with its beds; also RB-S1-05, RB-S1-06, RB-S1-09         |
| RB-S1-03 | the `app.can_use_capability(...)` clause deleted from `listUnits`                                    | five lines deleted from the `where` of the read                                           | IT: all three legs (capability off, subscription lapsed, entitlement revoked), each on its own      |
| RB-S1-04 | occupancy ignored (`row.stayId !== null && row.status === "occupied"`)                               | `stateOf` first branch                                                                    | IT: an in house stay makes a unit occupied; a stay with no reservation shows in house with no name  |
| RB-S1-05 | the `tonight` lateral loses `starts_on <= today.day` (a later booking again makes the Unit reserved) | lateral now `where ... status = 'confirmed' and (ends_on is null or ends_on > today.day)` | IT: a unit is reserved tonight only by a confirmed reservation that covers tonight; the counts test |
| RB-S1-06 | `state: stateOf(row)` for a room with beds                                                           | `entryOf`                                                                                 | IT: a room with beds is counted by its beds                                                         |
| RB-S1-07 | `select (now() at time zone 'utc')::date as day` instead of `app.property_today(...)`                | the `today` cross join                                                                    | IT: occupancy is measured against the property day                                                  |
| RB-S1-09 | `if (row.hasChildren) continue;` deleted from the count loop                                         | count loop                                                                                | IT: the counts partition the sellable units; a room with beds is counted by its beds                |
| RB-S2-01 | `addUnits` passes `null` for the building                                                            | insert parameter list                                                                     | IT: adding rooms writes them all; letting by the bed                                                |
| RB-S2-02 | `const letters: string[] = []`                                                                       | bed letters                                                                               | IT: letting by the bed writes one bed per sleeping place; a room let by the bed is refused a block  |
| RB-S2-08 | `input.letByTheBed && input.capacity > BEDS_PER_ROOM.max` replaced by `false`                        | guard in `addUnits`                                                                       | UT: a room holds at most twenty six beds                                                            |
| RB-S2-09 | the `UNIT_BATCH` bounds replaced by `false`                                                          | guard in `addUnits`                                                                       | UT: an add is between one and sixty rooms                                                           |
| RB-S2-12 | `input.letByTheBed && input.unitType !== "room"` replaced by `false`                                 | guard in `addUnits`                                                                       | UT: only a room is let by the bed                                                                   |
| RB-S3-13 | `createReservation`: `unit.status not in ('out_of_service')` (no `'blocked'`)                        | Unit query in `reservations/src/module.ts`                                                | IT: a blocked unit is not bookable                                                                  |
| RB-S3-13 | `listBookableUnits`: same, unit level                                                                | list query                                                                                | IT: a blocked unit is not bookable; a blocked unit is drawn blocked and leaves the booking form     |
| RB-S3-13 | `createReservation`: `room.status in ('out_of_service')` (a blocked room no longer covers its beds)  | room subquery                                                                             | IT: a blocked room hides the beds under it                                                          |
| RB-S3-13 | `listBookableUnits`: `room.status not in ('out_of_service')`                                         | list query                                                                                | IT: a blocked room hides the beds under it                                                          |
| RB-S1-05 | the Rooms tile: `false && state.kind === "free" && state.nextArrivalOn` (next arrival never shown)   | `renderUnitStateBadge` free branch                                                        | VT: says when the next arrival is beside a free room; the tr, en and ar word tests                  |
| RB-S1-09 | the Reserved tile shows `data.counts.free`                                                           | tile body                                                                                 | VT: counts reserved tonight apart from free                                                         |
| RB-S1-09 | the out of order note on the Beds tile suppressed                                                    | tile note                                                                                 | VT: counts reserved tonight apart from free, and out of order apart from both                       |

## Database breaks (run as the owner on the lane database, then restored)

### RB-S2-06 and RB-S2-11: the partial unique index

Before:

```
CREATE UNIQUE INDEX accommodation_units_property_id_name_key ON public.accommodation_units USING btree (property_id, name) WHERE (parent_id IS NULL)
```

`drop index public.accommodation_units_property_id_name_key`, then
`select count(*) from pg_indexes where indexname = ...` returned `0`.

Red: `a room name already at the property refuses the whole add (RB-S2-06)` and
`two people adding the same numbers at once leave one add and one refusal (RB-S2-11)`.

The break left duplicate room names in this run's own throwaway Properties, so
the index could not be rebuilt until the five duplicates the sabotage itself
wrote were deleted. It was then recreated and `pg_indexes` printed the identical
definition.

### RB-S3-09: the update policies

`accommodation_units_update_configure` before:

```
using: (app.can_use_capability(property_id, 'front_office', 'front_desk') AND app.has_organization_permission(organization_id, 'accommodation.configure'))
```

Break A: `alter policy ... using (true) with check (true)`, printed
`using: true with check: true`, restrictive policy `accommodation_units_status_by_permission`
left in place.

- IT: **stays green** (24 of 24). The restrictive policy's WITH CHECK still refuses
  blocking without `accommodation.configure`, with 42501, and the module maps 42501
  to the same `UnitRefusedError` sentence. The module-level answer is the same
  under either layer, so the integration test cannot tell them apart. That is the
  finding: two layers bind, and the module test sits above both.
- pgTAP `rooms_and_beds.test.sql`: **red**. The UPDATE now raises
  `new row violates row-level security policy "accommodation_units_status_by_permission"`
  instead of finding no row, and the assertion `nor block one: the update finds no
row and the Unit is as it was` cannot run (the transaction is aborted).

Break B: as A, and the restrictive policy's `with check (true)` printed as
`restrictive with check: true`.

- IT: **red**. `blocking without the permission is answered as a unit that cannot be
blocked (RB-S3-09)` and `nothing can write occupied to a unit (RB-S1-04)`.

Both policies were then restored from the expressions read before the break, and
the restored `pg_get_expr` output compared equal to the original (`yes`, `yes`).

### RB-S1-04: nothing writes occupied

The restrictive policy's WITH CHECK, `ELSE false` rewritten to `ELSE true`
(printed: `CASE status WHEN 'available' THEN true WHEN 'blocked' THEN (...) ... ELSE true END`).
Red: `nothing can write occupied to a unit (RB-S1-04)`. Restored and compared equal.

### RB-S3-04: the trigger

`drop trigger accommodation_units_can_be_blocked on public.accommodation_units`;
the pg_trigger count printed `0`. Red: `only a room let by the bed is refused a
block, whole (RB-S3-04)`, and `a block waits for a check-in that has not committed
and then refuses (RB-S3-07)` (which relies on the same trigger refusing a Unit
with somebody in it). Recreated; `pg_get_triggerdef` printed
`CREATE TRIGGER accommodation_units_can_be_blocked BEFORE UPDATE OF status ON public.accommodation_units FOR EACH ROW EXECUTE FUNCTION app.unit_can_be_blocked()`.

### RB-S3-07: `for share` in `app.unit_is_in_service()`

`prosrc` before contained `for share` twice (the bed's row and its room's). The
function was redefined without both. Printed after: the two selects
(`select unit.status, unit.parent_id ... from public.accommodation_units as unit`
and `select room.status ... from public.accommodation_units as room`) with no
lock clause, and `for share occurrences after: 0`.

Red: both

- `a block waits for a check-in that has not committed and then refuses (RB-S3-07)`
- `a check-in waits for a block that has not committed and then refuses (RB-S3-07)`

The original definition was reapplied; `for share` occurrences 2 and
`prosecdef = t` again. No definer was added or altered in the repository: this
was a change to the lane database only, reverted.

A third test, a module-level loop racing `checkIn` against `blockUnit`, was
written first and **did not go red** with `for share` removed: the window between
the trigger's read and the commit is too short to hit on demand. It could not
fail, so it was deleted rather than kept as reassurance. The two tests above hold
one side's transaction open and start the other, so they do not depend on timing
luck: with the lock the second side is seen waiting for 1.5 s and is then refused
after the first commits; without it the second side does not wait.

## Not sabotaged, and why

- `a stay with no reservation shows in house with no name` (RB-S1-04) is red under
  the same `stateOf` break as the occupancy test; it documents behaviour the row
  now states and would fail if the module ever started guessing a name.
