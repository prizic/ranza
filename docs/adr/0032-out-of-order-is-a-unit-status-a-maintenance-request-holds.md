# 0032. Out of order is a Unit status a maintenance request holds

Status: Accepted
Date: 2026-09-24
Amended: 2026-09-24 — "its own status" in the no-better rule is the room's state as `app.unit_housekeeping_state` reads it, after #60.
Amended: 2026-09-25 — a release is stamped `greatest(now(), since)` and the worker matches it at `greatest(occurred_at, since)`, so a clock that steps back cannot refuse a return (`20260916004900`, MT-S2-31).

## Context

Blueprint 6.5 has Staff report a fault against a Unit, Maintenance assess it,
and "Property Management … mark the unit unavailable through a controlled
transition", until "after repair and any required inspection, the unit returns
to service". Blueprint 18.2 names out of order as one of the six states a Unit
shows.

Three things were already decided around it:

- `accommodation_units.status` allows `out_of_service`, and nothing writes it
  (`20260916002900`). Check-in already refuses a Stay on it, and the booking
  form already leaves it out.
- [ADR 0029](0029-housekeeping-status-is-a-room-s-own-row.md) moved cleaning
  into a table of its own and left the column meaning "whether a Unit is in
  service", with "Maintenance (RANZ-33) extends that column, not this table".
- ADR 0029 also named the trap. `accommodation.configure` reaches that column
  through a permissive UPDATE policy. A second permissive policy for a
  maintenance permission would be OR-ed with it, and one column-level grant
  covers both — so whoever may take a room out of order could also block and
  unblock it, and the reverse.

The product owner's answers (RANZ-33, `docs/features/maintenance/`) add the
rest. Several requests may be open on one room at once. A done request may still
keep its room out of service when an Organization wants a confirmation before a
room is sold again. A room out of order makes every bed in it unsellable. A room
with a Guest in it, or with bookings on its coming nights, may still be taken
out of order once the desk has seen who is affected.

## Decision

### A request holds its Unit; the Unit is out of order while any request does

`maintenance_unit_holds` records, per request, whether it holds its Unit out of
order: a row with `returned_at` null. The Unit's status is `out_of_service`
exactly while at least one request holds it.

The hold is a table of its own rather than two columns on the request because a
different permission writes it. Moving a request is `maintenance.manage` and
holding a room is `maintenance.take_out_of_order`; on one row, telling them
apart would take a trigger comparing old and new values per column, which is the
check ADR 0012 moves out of code. On two tables it is each table's own policy.

The status is not derived at read time. Booking, check-in and Rooms already
read the column, and they belong to modules that must not learn about
maintenance. So the column stays the published fact, and Maintenance keeps it
true: taking a Unit out of order and releasing a hold both run in one
transaction that locks the Unit's row, writes the hold, counts the holds that
remain and writes the status. Two people acting at once take the lock in turn,
and the status agrees with the holds each time.

The write to the column goes through `lockUnitWithin`,
`takeUnitOutOfServiceWithin` and `returnUnitToServiceWithin`, a write contract
Accommodation exports, in Maintenance's transaction. Every command locks the
Unit before it touches a hold or a request, so two of them never wait on each
other in opposite orders.
[ADR 0020](0020-sync-inside-the-transaction-or-async-through-the-outbox.md)'s
test decides it: "for a few seconds a request held the room but the room could
still be sold" describes a broken system, not a slow one.

What the database cannot hold is the count itself: a Unit's policy cannot see
Maintenance's table without Accommodation depending on a later module. A direct
`update` of the status by anybody holding `maintenance.take_out_of_order` could
therefore still desync the two. No screen offers it, and edge case MT-S2-05
says where the guarantee sits. A desync never strands a request: returning a
Unit that is already available succeeds, so the request can still be returned
or cancelled.

Taking a room out and cancelling its request serialise on a per-request
advisory lock, taken by both triggers before either reads the other's row, so
the two at the same moment cannot leave a cancelled request holding. A check-in
locks the bed and then the room above it `FOR SHARE`, and taking a room out
reads who is affected only after it has locked the room, so the desk is told
about a Guest who arrived a moment earlier rather than missing them.

### Each status value is written by its own permission

One restrictive UPDATE policy on `accommodation_units` — the first in this
repository — says which permission may leave and enter which value:

- `blocked` needs `accommodation.configure` at a Property with `front_desk`;
- `out_of_service` needs `maintenance.take_out_of_order` at a Property with
  `maintenance`.

Its `using` clause reads the row as it was and its `with check` the row as it
becomes, so it bounds both leaving a value and entering one. The permissive
policies — the existing one for `accommodation.configure` and a new one for
`maintenance.take_out_of_order` — still decide who may update a Unit at all; a
restrictive policy only ever narrows them. That keeps
[ADR 0012](0012-a-write-is-bounded-by-a-policy-not-a-check.md) true: the bound
is a policy, not a condition in code.

A policy cannot see the old and new rows together, so one small trigger refuses
the direct move between `blocked` and `out_of_service`. Each is entered from
`available` only. A blocked Unit is already unsellable; its problem is reported
without a hold.

### A room covers its beds

`app.unit_is_in_service()` reads the room above a bed as well as the bed, and
the booking queries do the same. A bed's own status is never rewritten when its
room goes out of order, so a bed blocked for its own reason stays blocked after
the room comes back. A room with beds may be taken out of order, although it
may not be blocked (RB-S3-04): blocking is a statement about selling one Unit,
while out of order is a statement about the whole physical room.

### Coming back is a fact published to Housekeeping

Releasing the last hold publishes `unit.returned_to_service`. The worker applies
it to `housekeeping_unit_status` through one security-definer function, on the
same terms as a check-out (`app.mark_unit_dirty_after_check_out`): nothing where
housekeeping is not available, nothing if a person changed the status after the
return, and nothing on a second delivery. This one is async on purpose — a
returned room whose cleaning status lags by a few seconds is slow, not broken.

The event carries ids only, and that is a security decision rather than a
style. Any Staff Member may publish an event for their own Organization, so a
payload naming a status would let one write any status without
`housekeeping.update_status`. What the room comes back as is stamped on the
hold by the release trigger, from the Maintenance setting at that moment, in a
column no grant names; the worker reads it from the hold, and only for a hold
whose `returned_at` is `greatest(occurred_at, since)` — the release is stamped
`greatest(now(), since)` and the event's `occurred_at` is `now()`, in the one
releasing transaction, so the two agree. The clamp is there because `now()` is
a transaction's start on a clock that steps: a step back between the take and
the return made the return look earlier than the take, and
`returned_after_taken` refused it. For a return that was not clamped the match
is the plain equality, and a forged event — `occurred_at` is in no insert
grant (`20260916002150`), so an event carries its own transaction's `now()` —
matches no release. For a clamped return (`returned_at = since`) it matches
every return event for that request dated no later than `since`: the release's
own, and any other whose transaction began before `since`. What such an event
can do is bounded, and pgTAP pins it (MT-S2-31): it applies only that
release's recorded status, worst-of with the room's state, and never over a
status set after the event's own `occurred_at` — the guard compares with the
event's moment, not the clamped stamp the clock has not reached yet.

A stale event, for a room another request has since taken out, still matches
its release and writes a housekeeping status the room's next return
overwrites; cleaning and being in service coexist (ADR 0029), so that is noise
rather than harm.

The setting still hands `maintenance.manage` a say over housekeeping status:
"returns inspected" is exactly that. So a room comes back **no better than it
was** — the worse of its own state and the setting's, its state being what
`app.unit_housekeeping_state` says (ADR 0029 as amended by #60): dirty when a
Guest has left it since its status was set, even while the row still reads
clean, and clean when it has no status at all. Fixing a sink does not clean a room, and without the
rule anybody who may take a room out of order could take a dirty one out and
return it at once to have it read inspected, stepping around both
`housekeeping.update_status` and the inspection setting. That rule was decided
while this ADR was written, after review, and is MT-S2-30; the product owner,
Albaraa Zain, signed it off on 2026-09-24 with the rest of the rows.

### The setting

`maintenance_settings` has the shape of `housekeeping_settings`: one
Organization default, one override per Property, and null meaning "follow the
default". It says whether an assignee is required before work starts, whether a
room returns when its request is done or only by confirmation, and what a
returned room comes back as. A setting decides what the next move does, never
what is already held.

## Consequences

- `20260916002900`'s and `packages/ranza/accommodation`'s comments that give out
  of order to the housekeeping lifecycle are wrong from here on. The migration
  is applied and is not edited; the code comment is corrected.
- The Rooms screen labels `out_of_service` as Out of order, as Arrivals already
  does.
- Planned out-of-order periods on future dates are deferred (MT-DEF-01). They
  would make availability read a second table — the cross-table question an
  exclusion constraint cannot ask, which the roadmap already names for
  Reservations and Stays.
- Moving a Reservation off a room taken out of order is not built. The desk is
  shown each affected booking and decides.
- Nothing here is a Maintenance role. An Organization composes one from the
  four maintenance permissions.
