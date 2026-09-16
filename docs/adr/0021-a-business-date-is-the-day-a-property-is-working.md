# 0021. A business date is the day a Property is working, not the day it is

Status: Accepted — not yet applied
Date: 2026-09-16

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

`properties.business_date_cutoff time not null default '00:00'`, and
`app.property_today()` becomes:

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

### It is decided now and built when something needs it

Nothing in the product posts anything per night, because nothing has a rate —
`folio_lines.amount_minor` is supplied by whoever posts a charge, and there is no
rate plan, no tariff and no price column anywhere. A night audit therefore has
nothing to post, and a business date with no automatic posting is a column
nobody reads.

Blueprint section 13 forbids building the table ahead of the workflow that needs
it. So this records the shape, and the migration is written when the first
workflow needs a day that is not a calendar day — which is the night audit, and
the night audit needs pricing first.

## Consequences

Recorded in `docs/roadmap.md` under decisions not yet applied, so neither this
ADR nor that table is a claim about code that exists.

When it lands, every existing date comparison silently becomes a business-date
comparison, because they all resolve through `app.property_today()`. That is the
intended blast radius and it is why the function was extracted before the
decision was needed rather than after.

`posted_at` on a Folio line stays a `timestamptz` — the instant something was
recorded is not the day it belongs to, and conflating them is how a correction
posted at 02:00 lands in the wrong period. A line will gain a business date of
its own when it gains a reason to have one.

A Property changing its cutoff re-dates nothing already posted, for the same
reason a Property changing currency does not restate a Folio (ADR 0015): a date
already written to a row is history.
