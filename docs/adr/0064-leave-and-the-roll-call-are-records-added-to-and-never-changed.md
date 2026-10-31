# 0064. Leave and the roll call are records added to and never changed, and a Property chooses to keep them

Date: 2026-10-31

Status: Proposed

Builds on [ADR 0012](0012-a-write-is-bounded-by-a-policy-not-a-check.md),
[ADR 0021](0021-a-business-date-is-the-day-a-property-is-working.md),
[ADR 0057](0057-a-propertys-operating-model-sets-its-defaults-and-its-words-never-its-rules.md)
and [ADR 0058](0058-a-guests-particulars-are-read-by-permission-apart-from-the-guest.md).
The rows are [`docs/features/leave-and-attendance/edge-cases.csv`](../features/leave-and-attendance/edge-cases.csv).

## Context

A Turkish dormitory keeps a nightly roll call (yoklama) and lets a student be
away for a night or more with permission (izin). A student not in by the curfew
and not on leave is missing, and the yurt may have to tell the guardian
(RANZ-101, RANZ-112). A guardian's dispute is settled on what was written down
that night, so the records must be able to say who said what, and when, after
the fact.

Three things in the product pull against each other. The desk that signs leave
by day is not the warden who calls the roll at night. A reason for leave can be
a medical or a family matter of somebody who is seventeen. And ADR 0057 forbids
the operating model choosing a rule: attendance has to be something any Property
can keep, with the model only choosing its default.

## Decision

- **Leave** (`attendance_leaves`) belongs to a Resident's Stay, for business
  nights, with a reason. It is **ended or cancelled, never deleted**: cancelled
  while no night of it has passed, ended once one has, which shortens it and
  keeps the nights already spent away. An exclusion constraint keeps one
  Resident from being away twice on a night. Who gave it and who closed it, and
  when, are the database's.
- **The reason** is a table of its own (`attendance_leave_reasons`), read only
  with `leave.grant`. The roll call must know who is away and not why, and a
  column grant cannot vary by role under one runtime role (ADR 0058).
- **The roll call** (`attendance_marks`) is one row per answer, never changed.
  A Property's roll call for a night is the answers sharing the two, and the
  latest of a Resident's is the current one: a correction is a row above the old,
  with who and when. There is no header, so there is nothing to keep unique.
  The identity column orders revisions.
- **Leave outranks a mark**, derived at read: a leave given after a mistaken
  "absent" settles it, and one cancelled brings it back. Nothing is rewritten.
- **Two permissions**, `attendance.take` and `leave.grant`, held by the shipped
  Owner, Manager and Front desk. A night warden is a role an Organization writes
  with the first only. Housekeeping and Finance hold neither.
- **A Property capability**, `attendance`, under Front Office, gates both: a
  dormitory has it on from the start (ADR 0057 lets the model choose which
  capabilities start on), a hotel or a hostel is given it like any other. It is
  gate 3 of blueprint 3.5, in the policies and in the rail.
- **The curfew** is a Property setting (`attendance_settings`), set with
  `configuration.manage`. No row means the application's default, 23:00 for a
  dormitory and none for a hotel; a row with no time means none, on purpose. The
  default is applied in the application, so **no policy, trigger or function
  reads `operating_model`** and the operating-model suite still passes over the
  new ones. A curfew earlier than the cutoff belongs to the next calendar day.
- **The figures** (in house, on leave, present, absent, not yet called) are
  counted from the rows the roll call lists, in one snapshot, and are one read
  of the module for Today.
- **A Resident is called only on a night of their Stay**, up to tonight, and
  leave is given only to a Resident's Stay; both are triggers.

## Alternatives rejected

- **A header row per Property and night.** It adds a uniqueness to keep and a
  place for state ("open", "closed") nobody asked for, and a header closed
  early would need a rule for the answers that arrive after it.
- **An attendance column on the Stay.** It rewrites on every correction and
  keeps no history.
- **The reason on the leave, hidden by the screen.** A check in the application
  is not a boundary in this repository.
- **An `attendance` rule in the operating model.** ADR 0057 rules it out, and a
  hostel would then need a third model.
- **Leave by the hour.** A roll call is a list per night; leave in whole nights
  is the general case, and the hour is a specialisation for the partner yurt.

## Consequences

- Four more tables and no new definer function: every write
  is an insert or a bounded update under a policy, so the definer inventory of
  `insert_grants.test.sql` is unchanged.
- A Property needs the capability row. The migration gives it to the dormitories
  that exist; `db:seed:yurt` gives it to a new one. A Property without it reads
  as having no roll call, not as an empty one.
- A student who never answers is "not yet called" and is not marked absent by
  the passing of the curfew: the figure is flagged, the record is not written.
- Messages to the guardian, the guardian's number on a missing student's row,
  Guests' attendance, visitors, a report and a Portal request for leave are
  deferred rows (LA-DEF-01 to LA-DEF-10), not decisions made here.
