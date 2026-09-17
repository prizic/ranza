# 0025. A bed is a Unit under a room

Status: Accepted
Date: 2026-09-17

## Context

`accommodation_units` is flat. A Unit has a name, a type, a capacity and a
status, and nothing else — no building, no floor, no parent.

That was honest while the only workflow was checking somebody into a room. It
stopped being honest when taking a booking became a command, because the form
can only offer whole rooms, and `docs/design/ranza-mockup.html` assumes a bed is
sellable on nearly every screen it draws.

Two things are wrong with the flat shape, and they are not the same thing.

**`capacity` is a number nothing enforces.** `stays_no_double_booking` excludes
on `accommodation_unit_id`, so a Unit of capacity four holds exactly one Stay.
The column says four people sleep here and the database lets one. Nothing reads
it, which is the only reason it has not yet been believed.

**A dormitory cannot be sold.** [ADR 0004](0004-student-residence-is-a-property-configuration.md)
says a student residence is a Property configuration rather than a fork, and
blueprint section 2 says an Accommodation Unit "may be a room, bed, apartment,
suite, or another supported unit type". A Property whose Units are beds is
therefore already promised. What is missing is the relationship between the bed
and the room it is in — without it, bed `101-A` is a Unit whose name happens to
start with the room number, and nothing knows they are related.

## Decision

### A bed is an Accommodation Unit with a parent, not a second table

`accommodation_units` gains `parent_id`, a self-reference carried composite with
`property_id` and `organization_id` like every other key here, so a Unit
parented into another Property or another Organization is unrepresentable rather
than merely checked.

A second `beds` table was the alternative and is worse in every direction: it
duplicates the policies, the grants, the status lifecycle and the composite
keys; it makes every availability question a union of two tables; and it makes
`stays.accommodation_unit_id` either nullable-twice or polymorphic. A bed is a
sellable space, which is what an Accommodation Unit is.

The column is general and the constraint is narrow: **today only a bed may have
a parent, and only a room may be one.** That is where the current scope lives,
so widening it later — an apartment containing rooms, a suite containing a
lounge — is a constraint to change rather than a column to add, a backfill to
run and a foreign key to rewrite.

### A Unit is sellable when it has no children

Not a flag. `bookableBy` in the mockup is a per-room setting, and a setting that
can be wrong is a way to sell one bed twice: once on its own and once inside its
room.

Deriving it removes the state. A room with no beds under it is sold whole. Add
beds to it and the room stops being sellable and the beds start — which is the
same sentence an operator would say, and it cannot disagree with itself.

Two things follow, and both need enforcing in the database because both are
cross-row and neither can be a check constraint:

- a Stay or a Reservation may not name a Unit that has children
- a child may not be added to a Unit that a current Stay or Reservation names

Each is a trigger, on the `stays_withdrawal_is_free_of_charges` precedent, and
for the same reason that one is a trigger rather than an application check: it
has to bind every role, not only the one the product happens to use.

### A building and a floor are attributes, not Units

Blueprint 5.2 lists "buildings, floors, Accommodation Units" — three things, and
only the third is a Unit. So `building` and `floor` are nullable columns on the
Unit, and the tree is only ever room to bed.

Modelling them as Units would mean a four-storey block is one row, plus four,
plus forty, plus a hundred and twenty before anything can be sold, and every
availability query would walk a tree to answer a question about a leaf. The
mockup groups by both and addresses neither: no workflow blocks a floor, bills
one, or assigns housekeeping to one as a record rather than as a filter.

When one does — a floor closed for refurbishment, a housekeeping zone that is a
thing rather than a grouping — that is the workflow that earns the table, and it
is a table beside this one rather than a generalisation of it (blueprint section
13).

### `capacity` means people, and the hierarchy is what fixes it

The roadmap's complaint — a Unit of capacity four holds one Stay — is answered
by beds being Units. Four beds are four Units, four Stays, and the exclusion
constraint is right about each of them. The column is not what was broken; the
flat shape was.

So `capacity` stays and is redefined as **how many people this Unit sleeps**,
with one thing newly enforced: a bed sleeps one. Everything else about it is
still unenforced, and this decision does not pretend otherwise — what would
enforce it is a Stay that records how many people are in it, and a Stay has one
Guest. That is the change that would make `capacity` a rule rather than a fact,
and nothing has asked for it.

Keeping it rather than dropping it is deliberate. "How many does 101 sleep" is a
question a front desk asks about a room it is selling whole, and the answer is
not derivable from anywhere else once the room has no beds under it to count.

### A name is unique within its parent, not within the Property

`accommodation_units_property_id_name_key` is unique on `(property_id, name)`,
which makes bed `A` in room 101 and bed `A` in room 102 a collision.

Uniqueness moves to the parent. The detail that will bite whoever writes the
migration: `parent_id` is null for a room, and null is not equal to null in a
unique index, so `(property_id, parent_id, name)` would stop constraining rooms
at all. It needs `coalesce(parent_id, …)` or a pair of partial indexes, and
whichever is chosen needs an assertion that the room case still fails.

## Consequences

The booking form stops being a flat list. A Property of forty rooms with four
beds each is two hundred sellable Units, and a single select of two hundred
options is not a thing anybody can use — the Unit picker has to group beds under
their room, which is why that is its own task rather than a line in this one.

Housekeeping gains a question this decision does not answer: a room out of
order has beds that are individually available, and the mockup blocks individual
beds with their own reason. Whether a parent's status governs its children
belongs to the Unit lifecycle decision, which is being written next, and it
should assume this shape rather than re-open it.

Every existing Unit becomes a room with no parent and no children, so every
existing Stay and Reservation goes on naming a sellable Unit. The migration adds
a column and two triggers rather than moving any row, which is the reason this
shape was chosen over a separate table as much as any argument above it.

`packages/ranza/accommodation` has no query and no `module.ts` — its README says
a unit directory "belongs here when a screen needs it, not before". Two screens
now need it, so this is also the decision that gives that module its first read
and its first write.
