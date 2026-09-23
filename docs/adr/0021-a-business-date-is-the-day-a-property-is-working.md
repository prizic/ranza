# 0021. A business date is the day a Property is working, not the day it is

Status: Accepted — applied in `20260916003500_a_business_date_has_a_cutoff`
Date: 2026-09-16

Amended: 2026-09-22 — applied, with a different default and a bounded cutoff.
It is built ahead of the night audit because the front desk needed it first: at
a midnight rollover, a Guest landing at 00:30 for a one-night booking made for
the evening before could not be checked in (`ends_on > today` is false) and was
gone from the arrivals list. The default is **04:00**, not 00:00, because
hospitality dates a night by the evening it begins; a midnight default would
have kept the defect at every Property until somebody changed it. The cutoff is
constrained to **between 03:00 and 12:00**: the rule is wall-clock time less the
cutoff, wall-clock time runs backwards in a repeated hour, and every daylight
saving change happens before 03:00 local time, so a cutoff in that window is
crossed exactly once a day and no business date is ever skipped or repeated.
The rule is `app.business_date(instant, zone, cutoff)`, a pure function so the
boundary and the clock changes can be tested, and `app.property_today()` is it
applied to `now()`. The SQL below needs `cutoff::interval`: Postgres has no
`timestamp - time` operator.

## Context

Three places already ask what day it is at a Property, and all three answer it
the same way: `app.property_today(property_id)`, which is
`(now() at time zone property.timezone)::date`. The arrivals list, the
departures list and check-in use it, and it is correct for what they do today.

It is not what a hotel means by "today".

A front desk working a night shift at 02:00 is still working Tuesday. Charges
posted then belong to Tuesday, the departures list they are looking at is
Tuesday's, and a Guest who walks in at 01:30 arrived on Tuesday. Midnight is not
when the operating day rolls over; a cutoff the Property chooses is — typically
somewhere between 03:00 and 06:00, run as part of a night audit.

Getting this wrong is not a rounding error. A room charge dated by midnight
lands on the wrong day for every posting made during the night shift, and a
reconciliation against a bank statement then never balances by exactly the
night-shift traffic.

## Decision

### A business date is a Property-level fact with a cutoff

`properties.business_date_cutoff time not null default '04:00'`, constrained to
between 03:00 and 12:00 (see the amendment above), and `app.property_today()`
becomes:

```sql
(now() at time zone property.timezone - property.business_date_cutoff)::date
```

A cutoff of midnight makes it exactly what it is now, so adopting this changes
no behaviour anywhere until a Property sets one. That is deliberate: the
migration is safe to apply before anything depends on it, and the first Property
to set a cutoff is a configuration change rather than a deployment.

It sits beside `timezone` and `currency`, for the reason those are there: an
Organization may hold Properties that operate differently, so none of the three
can live one level up.

### `app.property_today()` stays the only place it is computed

It already is, which is why this ADR is one column and one function body rather
than a survey of call sites. That was the point of extracting it in
`20260916001300_check_in_on_the_day`: a definition of "today" that lives in four
query bodies is a definition that changes in three of them.

### Built for the front desk, ahead of the night audit

It was first recorded to be built with the night audit, which needs pricing
first. The front desk needed it sooner — a 00:30 arrival for last evening's
one-night booking could not be checked in — so it was applied in
`20260916003500_a_business_date_has_a_cutoff`. The night audit, when it comes,
rolls the day this defines rather than defining one of its own.

## Consequences

Every date comparison became a business-date comparison when it landed, because they all resolve through `app.property_today()`. That is the
intended blast radius and it is why the function was extracted before the
decision was needed rather than after.

`posted_at` on a Folio line stays a `timestamptz` — the instant something was
recorded is not the day it belongs to, and conflating them is how a correction
posted at 02:00 lands in the wrong period. A line will gain a business date of
its own when it gains a reason to have one.

A Property changing its cutoff re-dates nothing already posted, for the same
reason a Property changing currency does not restate a Folio (ADR 0015): a date
already written to a row is history.
