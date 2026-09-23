# 0031. An audit record carries its location, and is read by permission

Date: 2026-09-23

Status: Accepted

Amends [ADR 0028](0028-an-organization-wide-read-is-gated-through-the-property-it-is-opened-from.md).

## Context

The audit log shipped (ADR 0028) as the Organization's records, gated by a
Property capability called `audit`. A review of it against how a hotel or a
dormitory actually uses an audit trail found four things wrong, and each was
a clause of the blueprint rather than a preference:

1. **Everybody read everything.** The read policy on `audit.records` was
   membership-wide, and a record carried no Property. A Front desk or
   Housekeeping member assigned to one hotel read every hotel's check-ins,
   Folio reversals and their reasons, and every staff change. Blueprint 7.4
   lists Property among what a sensitive action records; the table could not
   say it.
2. **No permission stood in front of the read.** Blueprint 3.5's gate 4 — the
   Staff Member's permission — was in every write policy and in no read.
3. **The gate was commercial.** Audit is a baseline right no package
   selection may remove (3.6), but it was a per-Property capability row that
   no hosted Organization had, so the screen did not exist in production.
4. **A reader could not tell who, or what.** Colleagues and subjects were
   8-character uuid fragments, and search and filters ran over the 200 rows
   on the screen, so a record older than those read as though it had never
   happened. ADR 0028 blamed the first on `users_read_self`, but that policy
   had already been replaced by `users_read_self_and_colleagues` in
   `20260916002200`; nothing was blocking it.

## Decision

1. **A record carries a location.** `audit.records.location_id`, nullable.
   The column is not `property_id` because the table belongs to
   `packages/platform/audit`, which may not name a Property (blueprint 9.8).
   The host decides what a location is — for Ranza, a Property — in three
   `app.audit_*` functions that the policies call. Those functions are the SQL
   counterpart of a host adapter. Null means the action is about the whole
   Organization: a role, a membership.
2. **The read policy narrows to reach, and asks the permission.**
   `records_read_by_reach` admits a record if you wrote it; or you hold
   `audit.read` in its Organization and either it happened at a Property you
   reach, or it has no location and your reach is the whole Organization. The
   permission is in the policy, not only in the host, because a policy is the
   boundary here and a check beside it is not (ADR 0012). Every future reader
   of the table inherits it without remembering to.
3. **Your own records need no permission.** A writer must read back what it
   wrote — `insert … returning` passes the read policy — and seeing what you
   yourself did is not reading the Organization's log.
4. **Reading the log is `audit.read`, and nothing commercial.** A catalogue
   permission of Platform Core, shipped on Owner and Manager and composable
   into any role an Organization writes. No Subscription, Entitlement or
   capability gate, extending ADR 0026's "money does not block security" from
   writes that take reach away to this read. The per-Property `audit`
   capability is gone from the rail, the code and the seed.
5. **A record's location is checked for integrity, not reach.** The insert
   policy refuses a location that is not a Property of the record's
   Organization. It does not re-ask whether the writer reaches it: the acting
   module's own write policy already decided that, and a second, different
   question here could refuse a write that policy allowed.
6. **Names are resolved when the log is read, never copied into it.**
   `@ranza/core` names actors, Guests, rooms, Reservations, Stays, Folios,
   roles and Properties in the read's own transaction, bounded by row-level
   security. A Guest's name in an append-only table would be personal data
   nothing could erase; read at read time, an erased Guest leaves the record
   standing and nameless. Reading sibling modules' `public` tables from core is
   permitted; reaching a module-owned schema (`audit`, `outbox`) is not
   (ADR 0008).
7. **The server filters and pages.** Action, Property, a day range in the
   opened Property's clock, and free text; keyset pages on
   `(occurred_at, id)`, with the cursor in whole microseconds so a page
   boundary cannot step past records written in the same millisecond. The
   total is its own count without the cursor. Free text matches the reason,
   and `@ranza/core` translates it into the actors and subjects it could mean
   — a Guest's name, a room, a colleague's address — so the platform module
   stays ignorant of all three.
8. **A record's time is written by the database alone.** The runtime role's
   insert grant is a column list without `id` or `occurred_at`.

## Consequences

- Records written before `20260916004200` have no location, and stay that
  way: filling it in would mean disabling the append-only trigger and
  rewriting history. They are visible to Organization-wide readers and to
  whoever wrote them. That is a narrowing, and it is the safe direction.
- Every writer names its location: reservations, stays, Folios and units by
  their Property; staff assignments by the Property assigned. Staff commands
  now name the membership by its own id — `staff.invited` always did — with
  the person in `context.userId`.
- Editing what a role allows is `staff.role_permissions_changed`, recording
  what was added and removed. Records written before as `staff.role_changed`
  on a `role` subject are read as that by the screen. A role change records
  what it changed from. A Folio reversal records the amount, currency and
  description it took off; a closure, the balance it closed on.
- The Property switcher on the log offers Properties where the viewer holds
  `audit.read`, and the rail shows the log to exactly those viewers.
- Two `insert_grants` inventory numbers move: 23 → 28 definers.
- Sign-in events are not in this log. They carry no Organization — a failed
  sign-in has none — and belong to security logging (blueprint 7.6).
