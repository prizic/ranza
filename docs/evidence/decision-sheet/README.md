# The 2026-09-28 decision sheet — what was built, and where it departs

The owner accepted every recommendation on the sheet of 2026-09-28. This folder
is the evidence that each row is true: one sabotage record per lane
([rooms](rooms.md), [folios](folios.md), [front desk](front-desk.md),
[access](access.md), [rates tests](rates-tests.md)), each break printed before
its red result was counted.

Every accepted row now carries its status: Approve and Approve after a fix are
`approved` with the test that pins them; Revise rows carry the revised wording,
built; IG-09, CI-NB-02 and FO-S3-03 are `deferred` with their reason. Rows the
sheet only confirmed as still open are unchanged.

## Where a row departs from what the sheet proposed

The owner approved the sheet's wording. These rows say something different,
because the proposed wording was not true of the code once it was read, or
because building it literally would have broken something. Each row now says
what holds.

**False premises**

- **FO-S1-05.** Nothing built. The database already refuses a Folio in another
  currency than its Property's (`app.folio_currency_is_its_propertys()`,
  CF-S1-20). The proposed stamp would have closed no gap and refused check-ins
  during a deploy.
- **RG-S1-08.** Not "refuse any date before today" in the database: that breaks
  the seed and every record of a past arrival. The database refuses a booking
  on a closed business day (RZ001, `reservations_want_an_open_day`); the module
  keeps the stricter before-today rule.
- **IG-12, IG-14.** The counts and the caller list are read from the catalogue,
  not from the sheet: nine callers of `capability_is_available`, not five. The
  proposed "function bodies carry no prose" was false, so the sweep strips
  comments instead, and a guard asserts the stripping hides no code.

**Narrower or wider than proposed**

- **RB-S1-05, RB-S1-09.** Reserved means tonight, so in house, reserved, free
  and blocked partition the Units, with out of service apart and the next
  arrival shown on a free Unit. "A checked-in Reservation is neither" cannot be
  tested — such a Unit always reads in house — and the row says so.
- **RB-S2-01, RB-S3-07, RB-S3-09.** RB-S2-01 no longer claims one transaction
  for everything; one statement writes the rooms. RB-S3-07's race never went red
  and was deleted rather than kept green; RB-S3-09 is bound by its pgTAP
  assertion, since both policies refuse in the same words.
- **RG-S1-11.** A Guest booking needs a departure, and the form asks for it as it
  asks for every missing field. A booking already finished — checked out,
  cancelled or a no-show — is excused, because nothing can give it a departure
  any more and a database holding one could otherwise never take the rule.
- **CI-S1-07, CI-S1-09, CI-S2-04, CI-S2-14.** CI-S1-07's answer is reached only
  from a stale row; whether Arrivals should list next-day bookings before the
  cutoff is a new question, CI-S1-21, left `open` with a recommendation.
  CI-S1-09's 55006 case was unreachable and is reworded; CI-S2-04 is bound by
  its catalogue pin; CI-S2-14 is enforced by triggers.
- **FO-S4-10.** Reversing a charge is its own permission, and every role that
  could post a charge was also given it, so nobody lost an ability on deploy.
- **OA-S3-05, OA-S3-02.** A remembered Property is used when the URL names
  none; with no `?property=`, a page resolves it and the switcher, the rail and
  the page then name the same one.
- **OA-S1-05.** The Workspace and the Portal refuse a privileged connection at
  start, and also refuse an auth URL equal to the owner URL.
- **CO-S4-04.** Was an open question the sheet's OA-S1-14 decided: past_due is a
  grace period, and the notice goes to the Organization's Owners, not the desk.
  Approved with that wording.

## Before this reaches staging

Staging holds one Guest booking with no departure, R96J74P, still in house.
The departure constraint refuses to be added over it. Give it a departure first
— Change departure arrives with the amend-booking work, so deploy that before
this, give R96J74P its departure, and confirm no open-ended Guest booking is
left confirmed or in house. Checked out instead, it is excused.
