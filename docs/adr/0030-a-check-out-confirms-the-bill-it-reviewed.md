# 0030. A check-out confirms the bill it reviewed

Status: Accepted
Date: 2026-09-23

## Context

A check-out ended the Stay and did nothing else. The Reservation stayed
`checked_in` forever, the Folio was never read, a Guest leaving four nights
early left without anybody saying so, and one press on the wrong row of a
column of identical buttons sent an in-house Guest home and freed their room.

The design in `docs/features/check-out/` asks for a zero balance before a
check-out. Nothing in the product can make a balance zero once a charge is on
it: `folio_lines` holds charges and their reversals and no payments (PRE-01).
Built as designed, a check-out would be impossible for every Guest who was ever
charged anything.

## Decision

A check-out is confirmed against the review the desk was shown, and the module
compares the review with what is true under the Stay's advisory lock — the lock
every posting to that Stay's Folio takes — before anything is written.

- **The bill.** The review carries the Folio's line count. Lines are only ever
  added, so the count changes on every posting, a charge and its correction
  included; a review of a bill that has since changed is refused, and the desk
  looks again.
- **An early departure** must be acknowledged, and the acknowledgement is in the
  audit record.
- **A balance** — until payments exist — is left on an open Folio with a reason,
  which is the audit record's `reason`. No column is added to `folios` and no
  permission is invented for it: leaving a Folio open deliberately, with limits
  and a manager's review, is slice 2 of the design and still open. A zero
  balance closes the Folio in the same transaction.

The Reservation moves to `checked_out` with its Stay, and a deferred constraint
trigger refuses a pair that disagrees at commit.

A front-desk role may close a Folio only when its Stay has departed and its
balance is zero, or its Stay was withdrawn and it has no lines; everything else
stays `finance.manage_folio`'s, enforced by a trigger that reads the lines.

## Consequences

- A charge racing a check-out either lands first — and the check-out is refused
  as a changed bill — or waits, and is refused because the Folio closed; when
  the Folio was left open, it lands there, which is where a late charge belongs.
- The departures screen shows the bill before the button that ends the Stay,
  and asks for more only when there is more to decide.
- When a payment line exists, the reason-to-leave-open branch becomes the
  exception it was designed as, and CO-S1-11 becomes enforceable: refuse a
  balance that is not zero unless it is left open deliberately.
- Undoing a check-out is still not built. The review is the guard.
