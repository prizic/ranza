# 0029. Housekeeping status is a room's own row

Date: 2026-09-22

Status: Accepted

Amended: 2026-09-23 — inspection (slice 3), and what a room with no row means under it.

## Context

Blueprint 18.2 names six states for an Accommodation Unit: available, occupied,
dirty, inspected, blocked and out of order. `accommodation_units.status` holds
four of them today, and `20260916002900` predicted that the housekeeping
lifecycle "replaces this constraint with the whole set". This decides that it
does not.

Two facts make one column the wrong shape.

**They coexist.** A room can be blocked and dirty at the same time, and when it
is unblocked the desk still needs to know it is dirty. One column holds one
value, so either the block erases the dirt or the dirt blocks the unblock. The
code shipped under RANZ-27 already relies on the column meaning service alone:

- `blockUnit` matches `status = 'available'`, so a departed room could never be
  blocked;
- `unblockUnit` writes `available`, so an unblock would clean a dirty room;
- the Rooms map would show `dirty` where it shows free or reserved.

**The two permissions cannot be told apart on one column.** The update grant to
`ranza_app` is `(status, status_reason, updated_at)`. A second permissive
update policy for cleaning would OR with the one for `accommodation.configure`,
and the grant is role-wide. Whoever may mark a room clean could then block it.
A restrictive policy could separate them, but only by repeating which values
each permission may write, and that buys nothing over a table of its own.

Housekeepers mostly do not use the app. Whoever hears "204 is done" records it,
usually the front desk, so the permission that marks a room must be one the
desk can hold without holding the Property's configuration.

## Decision

Housekeeping status lives in `public.housekeeping_unit_status`, one row per
**status holder**, owned by `@ranza/housekeeping` (blueprint 5.4).

- **The holder is the room.** It is a Unit with no parent, so a bed under a room
  answers to the room. A bed with no room above it, the dormitory
  configuration of ADR 0004, is its own holder. This is the question ADR
  0025's consequences said would be owed. A trigger refuses a row for a Unit
  with a parent, and relaxing that trigger is how per-bed status would arrive.
- **No row reads as clean.** Every Unit that exists today gets no row and no
  back-fill. A room is born ready, and only a departure or a person makes it
  anything else.
- **"Ready" is read, never stored.** `app.unit_is_ready()` is the one
  definition, and the board, the arrivals list and check-in all use it.
  Inspection changes what the function answers, not what any row holds, so
  switching inspection on or off moves no room between states.
- **Who and when are the database's to write.** `status_changed_at` and
  `status_changed_by` are stamped by a trigger and appear in no grant, so a
  write cannot claim somebody else did it.
- **A departure dirties the room through one function and no grant.**
  `apps/worker` handles `stay.checked_out` by calling
  `app.mark_unit_dirty_after_check_out(event_id)`. It is a security definer
  that only `ranza_worker` may execute. The pattern is ADR 0027's, reused as a
  new function rather than by widening an existing one. The function:
  - refuses without a worker context;
  - refuses an event of another Organization;
  - reads the Stay and the departure time from the event itself;
  - writes nothing where housekeeping is not available;
  - leaves alone a status that somebody changed after the departure.

  `ranza_worker` holds no grant on the table.

- **The departure time is the event's `occurred_at`.** Stays carry no timestamp
  for it, and `stays.updated_at` would move if anything later touched a
  departed Stay. An outbox event is never updated after it is written.

## Consequences

- `accommodation_units.status` keeps meaning whether a Unit is in service, and
  nothing about RANZ-27 changes. Maintenance (RANZ-33) extends that column, not
  this table.
- The worker's mark writes no audit record, because the worker has no audit
  identity (`audit.records.actor_id` is a Staff Member). The departure is
  audited as `stay.checked_out`, and the row's null `status_changed_by` reads
  as "the check-out did it". A system actor is a separate decision.
- A room let by the bed turns wholly dirty when any one bed's Guest leaves. That
  is right for hotels and most residences, and is the part to revisit for
  hostel-style rooms.

## Amendment — inspection (2026-09-23)

Whether a cleaned room is inspected before it is ready is an Organization
default with a Property override, in `housekeeping_settings`
(`20260916003200_check_rooms_after_cleaning`). It changes what
`app.unit_is_ready()` answers and nothing any row holds.

**A room with no row is clean under inspection too, and so it waits.** The
alternative, where only rooms cleaned after inspection was switched on wait,
was cheaper but would have shown two rooms as "Clean" on the board and treated
them differently at check-in. So switching inspection on means every room waits
until it is inspected, and each clears as it is (HK-S3-11). The board says
"waiting for inspection" under such a room, because the status alone no longer
answers whether it can be let.

`app.housekeeping_inspection_required()` is a definer, like the other gates
readiness reads. An invoker version would read a setting the caller cannot see
as "off", and so call a room ready: the wrong direction for a check to fail.
