# 0058. A Guest's particulars are read by permission, apart from the Guest

Date: 2026-10-31

Status: Proposed

Builds on [ADR 0012](0012-a-write-is-bounded-by-a-policy-not-a-check.md),
[ADR 0024](0024-a-guest-belongs-to-an-organization-and-a-reservation-holds-its-nights.md)
and [ADR 0057](0057-a-propertys-operating-model-sets-its-defaults-and-its-words-never-its-rules.md).
The rows are [`docs/features/guest-particulars/edge-cases.csv`](../features/guest-particulars/edge-cases.csv).

## Context

A dormitory registers a student with a date of birth, a university and year, a
guardian (veli) and an emergency contact (RANZ-110, RANZ-99). Many students are
seventeen, so these are personal data of minors under KVKK.

Every Staff Member of an Organization reads its Guests: housekeeping needs a
name on a room, and `guests_read_own_organization` says so on purpose. Columns
on `guests` would therefore be read by housekeeping too. A column grant cannot
narrow that, because everybody connects as one runtime role, and a check in the
application is not a boundary in this repository — row-level security is.

## Decision

- The particulars are a table of their own, `guest_particulars`, one row per
  Guest, owned by the Guest's Organization through a composite foreign key.
- Its read policy carries a permission, `guests.read_particulars`, held by the
  shipped Owner, Manager and Front desk roles. An Organization gives it to a
  role of its own, or takes it away, like any other.
- It is written only through `app.record_guest_particulars`, which asks
  `front_desk.book`. A plain upsert would make the writer pass the read policy
  too, and a role allowed to book but not to read would fail on every returning
  student.
- A blank keeps what is on file. Clearing a value is an edit, for a screen that
  says so.
- The screens read them for one booking, when it is opened, never with a list,
  so a page never carries every student's particulars to the browser.
- Nothing about them reads `operating_model`: a hotel's long stay uses the
  same fields, and every one is optional (ADR 0057).

## Consequences

- A housekeeper, and any role without the permission, sees the Guest and not
  their particulars; the database refuses it, not the screen.
- One more definer function writes, the thirty-first, and one more permission
  sits in the catalogue and on the People screen.
- Correcting particulars, offering a returning student's at booking, requiring
  a minor's guardian, exporting them and anonymizing them are deferred rows
  (GP-DEF-01 to GP-DEF-04), not decisions made here.
