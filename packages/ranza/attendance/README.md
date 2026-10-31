# @ranza/attendance

Leave (izin) and the nightly roll call (yoklama) of a student dormitory, and the
figures Today shows from them (RANZ-101, RANZ-108).
[ADR 0064](../../../docs/adr/0064-leave-and-the-roll-call-are-records-added-to-and-never-changed.md)
says why; [`docs/features/leave-and-attendance/`](../../../docs/features/leave-and-attendance/edge-cases.csv)
says what it owes.

## What this module owns

`attendance_leaves`, `attendance_leave_reasons`, `attendance_marks` and
`attendance_settings`, their constraints, triggers, grants and policies — in
[`20260916014400_a_yurt_keeps_leave_and_a_roll_call`](../../../prisma/migrations/20260916014400_a_yurt_keeps_leave_and_a_roll_call/migration.sql).
Which Resident may be called on which night, that leave never overlaps and is
never deleted, who may call the roll and who may read why a student is away, and
who said what and when, are the database's. This module reads the night and
asks for the writes.

## Contract

```ts
const attendance = createAttendanceModule({ db }); // db: the ranza_app client (ADR 0006)

await attendance.rollCall(userId, propertyId); // tonight, or null: no roll call for this viewer
await attendance.figuresTonight(userId, propertyId); // the same count, for Today
await attendance.record(userId, propertyId, night, [
  { stayId, mark: "present" },
]);
await attendance.markTheRestPresent(userId, propertyId, stayIds);
await attendance.grantLeave(userId, { stayId, fromNight, toNight, reason });
await attendance.returnFromLeave(userId, leaveId); // "ended" or "cancelled"
await attendance.cancelLeave(userId, leaveId);
await attendance.setCurfew(userId, propertyId, "23:00"); // or null: none
```

`rollCall` and `figuresTonight` answer null for a Property out of the viewer's
reach, one without the `attendance` capability, and a viewer holding neither
`attendance.take` nor `leave.grant`: three reasons that read as one, so a screen
is not an oracle for who holds what. Leave outranks a mark, and a figure is
counted from the rows listed, so the two cannot disagree.

## Rules

- Only `index.ts` is importable.
- It receives its client and never constructs one, and never reads
  `process.env` ([ADR 0006](../../../docs/adr/0006-modules-take-dependencies-by-injection.md)).
- Nothing here reads the Property's operating model: the default curfew is
  `DEFAULT_CURFEW`, applied by the module, and no SQL knows the model
  ([ADR 0057](../../../docs/adr/0057-a-propertys-operating-model-sets-its-defaults-and-its-words-never-its-rules.md)).

## What is deliberately not here

Messages to the guardian, visitors and parcels, a Portal request for leave and a
report of absences are deferred rows (`LA-DEF-*`).

Verified against a real database by
[`tests/database/leave_and_attendance.test.sql`](../../../tests/database/leave_and_attendance.test.sql)
and [`tests/integration/leave-and-attendance.test.ts`](../../../tests/integration/leave-and-attendance.test.ts).
