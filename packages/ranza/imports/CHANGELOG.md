# Changelog

All notable changes to `@ranza/imports` will be documented in this file.

Versions begin at the first publication, not before — see
[ADR 0011](../../../docs/adr/0011-module-anatomy-is-earned.md). Until then
everything lands under Unreleased.

## Unreleased

### Added

- Rooms from a spreadsheet: `imports` and `import_rows`, staged then run,
  `ROOM_COLUMNS`, `stageRooms`, the three files a person downloads, and the
  worker's sweep (IMP-S1-*, ADR 0065).
- People: `PEOPLE_COLUMNS`, `readPerson`, `readDay`, `stagePeople`,
  `bookingOf`, `placeOf` and `admissionOf`, for a file of people each booked
  into a room or bed (IMP-S2-*).
- `settleRowWithin(tx, …)`, to settle a row inside the command that made its
  record, and `businessDate(userId, propertyId)`.
