# 0065. An import is a record of a file, and each row is made by its uploader's own command

Date: 2026-11-21

Status: Proposed

Builds on [ADR 0006](0006-modules-take-dependencies-by-injection.md),
[ADR 0012](0012-a-write-is-bounded-by-a-policy-not-a-check.md) and
[ADR 0057](0057-a-propertys-operating-model-sets-its-defaults-and-its-words-never-its-rules.md).
The rows are [`docs/features/guided-import/edge-cases.csv`](../features/guided-import/edge-cases.csv).

## Context

A dormitory or a hotel moving to Ranza arrives with its rooms, and later its
Residents and what they owe, in a spreadsheet. Typing a few hundred of them
in by hand is the first week of the product for a new customer, and the week
in which they decide whether to stay. Blueprint 19.1 makes import a product
workflow: a template, column matching, locale-aware reading, a preview with
row-level errors, an explicit commit, an audit record and a result file. It
also says an import must never silently overwrite a trusted record.

Three things pull against each other. An import writes many records at once,
and every table it writes already has its own policies, triggers and audit
under the command a person uses by hand. A file of Residents holds identity
numbers, which nobody should keep longer than the import needs them. And a file of
two thousand rows does not fit in one request.

## Decision

- **An import writes no record of its own kind.** `imports` records who
  uploaded which file, when, its state and its counts; `import_rows` records
  what each row held and what became of it. Every room is made by
  `accommodation.addUnits`, the command the Rooms screen uses, under the
  uploader's own session. So an import does nothing its uploader could not
  do by hand (IMP-S1-05), and every room it makes is audited to them as if
  they had added it.
- **Staged, then run.** Uploading reads the file and records a preview:
  each row ready, already there, or wrong with the column and the reason.
  Nothing else is written (IMP-S1-01). The uploader then imports the ready
  rows or discards the preview. `staged → importing → finished` and
  `staged → discarded` are the only moves, kept by a trigger; an import is
  never deleted or moved back (IMP-S1-14).
- **The page runs the import, twenty rows at a time.** Each request makes the
  next `IMPORT_BATCH` ready rows and settles each the moment its command
  answers, then says where the import stands; the page asks again until it
  is finished. A closed tab pauses the import, and carrying on resumes it. A
  room made but not settled when the tab closed is tried again, and the unique
  room name settles it as already there, so nothing is made twice (IMP-S1-11).
- **One import runs at a Property at a time**, by a partial unique index
  (IMP-S1-07). Only the uploader starts an import or settles its rows
  (IMP-S1-10). Anybody who may import at the Property may stop one, which
  leaves its ready rows unimported and frees the Property (IMP-S1-12).
- **The rows are the uploader's alone, and forgotten after seven days.**
  `import_rows` is read only by whoever uploaded it, because slice 2's rows
  hold identity numbers. The file itself is never stored. A worker sweep
  deletes the rows of an import untouched for seven days, closing it first if
  it was still open. The import and its counts stay; the counts are kept on
  `imports` by a trigger so that they outlive the rows (IMP-S1-15).
- **A permission, `import.run`**, held by the shipped Owner and Manager. The
  desk adds rooms one screen at a time, where it may at all.
- **Limits**: 2 MB and 2,000 rows per file (`IMPORT_LIMITS`). The file
  travels in a server action, whose body the workspace caps at 4 MB. A file
  over that cap fails in transit with an error nobody can read as a reason,
  so the limit sits well under it and the browser states it before sending.
- **Audit**: `import.started`, `import.finished`, `import.stopped` and
  `import.discarded`, each with the kind, the file's name and the counts, and
  no cell of the file (IMP-S1-16).
- **What a row may default** comes from the operating model, in the
  application: a dormitory's room is let by the bed unless the row says
  otherwise. No SQL reads the model (ADR 0057).
- **A person is booked by the booking command.** A row of a people file is
  one Guest and one booking, taken by `reservations.createReservation` under
  the uploader's session, with the Guest's particulars recorded in the same
  transaction, as the booking dialog takes them. So an importer who may not
  book books nobody and records no identity document (IMP-S2-07). The row is
  settled inside that booking's own transaction, through the `alongside`
  hook, so a booking and the row that made it commit together: a closed tab
  cannot leave a booking whose row still says ready (IMP-S2-01).
- **Booked from the Property's today.** A booking cannot start before the
  business date (ADR 0021), so somebody who already lives there is booked
  from today and checked in at once, with readiness acknowledged as the desk's
  "Check in anyway" does; the first night the file gave stays in the row
  (IMP-S2-05). Booking the nights already lived is IMP-DEF-07.
- **Quoted as the dialog quotes.** A Guest is quoted the bed's nightly price
  and booked at it, and a price changed meanwhile refuses the row. A Resident
  is never priced by the night (`reservations_resident_is_not_priced_by_the_night`),
  so a Resident is quoted nothing (IMP-S2-08).
- **A Guest on file is matched by exact email**, as the booking command
  matches, and not edited (IMP-S2-02). Matching by identity number is
  IMP-DEF-06: ADR 0058 keeps document numbers behind their own permission.

## Alternatives rejected

- **The worker runs the import.** This was the grill's answer 17, and it is
  reversed here. The worker connects as `ranza_worker` and acts for no
  person. To make a room as the uploader it would need either to impersonate
  a user, which is a new privileged path into every table an import touches,
  or a second set of policies on each of those tables for itself. Both widen
  the boundary that RLS is. The cost of the page running it is that an import
  moves only while somebody has it open; it never loses its place when they
  close it.
- **One transaction for the whole file.** Two thousand commands in one
  request outlast its timeout and hold their locks throughout, and one bad
  row would undo the good ones before it. The preview already separates the
  wrong rows from the ready ones.
- **Writing the tables directly in bulk.** That is a second way into every
  table, past the command's own checks and its audit, and the next
  constraint added to accommodation would have to be remembered here too.
- **Keeping the uploaded file** for a result report or for a re-run. It holds
  everything the rows hold and more, for as long as somebody remembers to
  delete it. The result file is built from the rows instead, while they are
  held.
- **Undoing a whole import.** Each room it made is an ordinary room, corrected
  as any room is. A bulk undo is deferred (IMP-DEF-01), because undoing a
  room somebody has since booked is not a decision an import can make.

## Consequences

- Four security-definer functions: two triggers that keep the counts and
  close the rows, each checking that its caller reaches the import or is the
  worker, and two for the worker's sweep. `insert_grants.test.sql` lists them.
- An import runs only while its page is open. A long one shows its progress
  and asks nothing more of the person than to leave the tab open or come back.
- Slice 2's `people` kind needed no change to either table, and no
  migration. Slice 3 adds a payment plan and a carried-over balance under the
  same rule.
- A check-in that fails after its booking committed leaves the booking, and
  the row says imported: the person is on today's arrivals for the desk, and
  the failure is reported. Settling the row after the check-in instead would
  let a closed tab leave a booking behind a row that still says ready.
- `createReservation` now names a policy refusal on the Guest it writes as
  `ReservationRefusedError`, as it names every other refusal; it used to
  surface the database's error.
- The setup checklist, staff and payment history, inviting every imported
  Resident to the Portal, and rooms numbered with letters are deferred rows
  (IMP-DEF-01 to IMP-DEF-05), not decisions made here.
