# 0063. A room in use is cleaned on a schedule, read from the day and never a status

Date: 2026-10-31

Status: Proposed

Builds on [ADR 0029](0029-housekeeping-status-is-a-room-s-own-row.md) and
[ADR 0057](0057-a-propertys-operating-model-sets-its-defaults-and-its-words-never-its-rules.md).
The rows are `HK-S4-01` to `HK-S4-21` in
[`docs/features/housekeeping/edge-cases.csv`](../features/housekeeping/edge-cases.csv);
the reasoning behind each choice is in that folder's README.

## Context

Housekeeping knows one kind of cleaning: a Guest left, the room is dirty
(ADR 0029). Nothing cleans a room somebody is still in. A hotel needs it every
day and a student dormitory once a week, and the dormitory has eighty students
in rooms none of whom ever check out in term, so its board would never have a
dirty room at all.

The tempting answer is another status, `due`, beside `dirty`. It is wrong: the
board, the arrivals list, check-in and the room calendar all read one
definition of ready, and a room somebody is in that is due a clean is not
something to refuse a check-in of the bed beside it over.

## Decision

### Stayover cleaning is a read over a schedule, not a status and not a job

`app.housekeeping_stayover_rooms()` lists the occupied rooms that are due a
clean today, from the Property's schedule, the day each room's cycle began
and the last time it was cleaned. Nothing about turnover reads it and it
writes no status. A room due for a clean is clean, ready to let and never
blocks a check-in.

It is computed when read rather than marked by the worker each business day. A
mark needs a job, and a job can stall unseen; it goes stale as soon as the
schedule changes; it needs a catch-up for a day the worker missed. A read
re-draws the whole list the moment a schedule changes, loses no overdue room,
and costs one statement per board. What it does not keep is a history of what
was due on a day gone by: only what was cleaned is recorded.

### The schedule is a setting of any Property; the model only picks the default

`housekeeping_stayover_settings` holds, per Property, `none`, `every_n_days`
(one to fourteen) or `weekly` (an ISO weekday), or a null cadence meaning "the
default". The application resolves the default (a hotel every day, a
dormitory one weekday a week) and passes the answer down; no policy, trigger
or function reads `operating_model`, which ADR 0057 and its pgTAP assertion
require. The setting is changed under `accommodation.configure`, with the same
gates as the inspection setting's Property override.

### A clean is a row, undone by stamping it

`housekeeping_stayover_cleanings` records each press. Its date and actor are
stamped by the database. Pressing twice records once. Undo stamps the row and
is allowed on the day of the press only; nothing is ever deleted. A press is
written under `housekeeping.update_status`, which the housekeeping role, the
desk, managers and owners already hold, and only against a room, never a bed
under one.

## Alternatives rejected

- **A `due` housekeeping status.** See Context.
- **A worker that marks rooms each business day.** See above; it also needs a
  terminal event to be observable, which a read does not need.
- **A schedule per Organization.** A hotel and a dormitory in one Organization
  clean differently.
- **A bed's own status now (HK-DEF-02).** It changes the readers of hotel
  turnover; it stays a deferred row.

## Consequences

Every Property with housekeeping and no schedule of its own starts at its
model's default, so a hotel's Housekeeping page gains a Stayover due tab with
the rooms it has staying guests in. A Property that does not want it chooses
never, and its board is exactly as it was.
