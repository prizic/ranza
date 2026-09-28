# 0038. A night is priced by its unit type and fixed when booked

Date: 2026-09-28

Status: Accepted — applied in `20260916008000_a_night_has_a_price`,
`20260916008100_a_booking_is_priced_when_it_is_taken` and
`20260916008200_a_night_is_charged_once`

Amends [ADR 0030](0030-a-check-out-confirms-the-bill-it-reviewed.md),
[ADR 0034](0034-a-business-day-closes-after-its-cutoff.md) and
[ADR 0036](0036-a-property-is-configured-and-its-currency-is-fixed-by-its-first-folio.md).

## Context

Nothing in the product had a price. Close the day counted the nights Guests
spent in house and posted nothing, because blueprint 15.10 forbids a feature
from inventing a pricing rule and none existed (close-the-day PRE-01, RANZ-31).
Check-out read a Folio that only ever held what somebody typed into it by hand.

Blueprint 5.16 gives rate plans, restrictions and pricing recommendations to
Distribution and Revenue, which is a later phase. A night still has to cost
something before then, and the owner chose the smallest rule that could be
true: one nightly price per kind of Unit at a Property, fixed on the booking
when it is taken, and charged when the day closes.

## Decision

**A price is per Property and unit type.** `property_rates` holds one row per
Property and kind — room, bed, apartment, suite — and a kind with no row, or
whose price was cleared, is unpriced. A price is cleared to no amount rather
than deleted: nothing in this product deletes a row. Only a Guest is priced by the night; a Resident is billed monthly,
which nothing builds yet. The caller names the Property, the kind and the
amount; a trigger states it in the Property's currency and names who set it,
for every role. A price left in a currency the Property has since left prices
nothing until it is set again. Setting a price takes a new permission,
`rates.manage`, on the shipped Owner and Manager roles: pricing is commercial
authority, separate from a Property's clock and name.

**A booking is priced by the database when it is taken.** A security definer
trigger stamps a Guest Reservation with the price of its Unit's kind and the
currency, overwriting anything supplied, and a second trigger refuses any later
change. No grant names either column. The price a Guest was quoted is the price
they are charged, whatever the list says later; re-pricing belongs to amending a
booking. An unset or stale price books the Guest unpriced rather than refusing:
the front desk is never blocked by a price list somebody has not filled in.

**A priced booking fixes the currency** (ADR 0036 amended). A booking that is
requested, confirmed or checked in with a price fixes the Property's currency as
a Folio already does, because it is money promised in that currency. The
stamping trigger locks the Property row `FOR SHARE`, so a booking and a currency
change cannot interleave.

**A night is charged once, by the close or by check-out** (ADR 0034 and ADR
0030 amended). A room night is a `charge` line marked `room_night` and dated by
the business date it belongs to, unique per Folio and date. Two security
definers post them, and they share one definition of a night — the one the
close already counts: a Guest Stay begun on D or before, in house now or
departed after D.

- The close of D posts every night of D inside its own insert, after the
  stamp's checks and lock, so a hand close and the worker's are one path and a
  second closer is refused before it posts anything. It records the count and
  total of every room night dated D, whoever posted them, and lists the nights
  it could not charge — unpriced, no Folio, a Folio closed, billing unavailable,
  another currency — without ever blocking on them.
- Check-out posts the departing Guest's nights that no close has reached yet,
  and the review it confirms now includes them: the count and amount posted
  must equal what the desk was shown.

A room night is never dated on a closed day, on today or later, for any role. A
reversed night is not posted again.

**Locks are taken Unit, then Property day, then Stay** — advisory namespaces 2,
3, 1. The close holds the Property's day and takes each Stay's lock to post;
check-out used to take the Stay's lock first and the day's second, which
deadlocks against it. Check-out and a withdrawn check-in now take the day's
lock, shared, before the Stay's. Namespace 4 is the price list's own.

## Consequences

- Close the day slice 3 is built, and its PRE-01 and PRE-02 are resolved.
- Until payments exist (check-out PRE-01), every priced check-out leaves a
  balance, so it is left open with a reason, as ADR 0030 already allows, and
  the dialog says payments cannot be taken yet. That is a real cost
  at the desk and it ends with the payments slice, not with a shortcut here.
- Bookings taken before this was deployed stay unpriced. Nothing is backfilled:
  a price nobody quoted is not one somebody agreed.
- A Property without billing lists every Guest night as not charged, every
  day. That is the truth, grouped by reason on the close screen.
- A price per Unit, a price typed at the desk, seasons, taxes and discounts are
  deferred rows in `docs/features/rates/edge-cases.csv`, not gaps.
