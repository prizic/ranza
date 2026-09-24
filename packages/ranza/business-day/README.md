# @ranza/business-day

Closing a Property's business day — the night audit of blueprint 6.4, and the
finalized state of 18.2. A business day rolls at the Property's cutoff by the
clock ([ADR 0021](../../../docs/adr/0021-a-business-date-is-the-day-a-property-is-working.md));
this module finalizes a day the clock has already ended
([ADR 0034](../../../docs/adr/0034-a-business-day-closes-after-its-cutoff.md)).
The design is [`docs/features/close-the-day`](../../../docs/features/close-the-day/).

## What this module owns

`business_day_closes`: one append-only row per Property and business date, in
[`prisma/migrations/20260916005000_a_business_day_is_closed`](../../../prisma/migrations/20260916005000_a_business_day_is_closed/migration.sql).
The closer supplies the day and a reason. `app.business_day_close_is_stamped()`
supplies everything else — who closed it, the arrivals, departures and nights it
counted, the departed Guests whose Folio is still open, and the bookings and
Guests left open — and refuses a day that has not ended or waits for an earlier
one. The unique key on the Property and the day makes two closes one.

It also owns the refusals that keep a closed day closed: a Stay cannot begin,
end or be withdrawn on it — including a check-in or check-out that began before
the cutoff and commits after the close — a departed Stay cannot be re-dated onto
or off it, and a cutoff or time zone cannot move today back onto it. Both raise
`RZ001`.

## Contract

```ts
const days = createBusinessDayModule({ db }); // db: the ranza_app client (ADR 0006)
await days.getCloseTheDay(userId, propertyId); // the checklist, or null
await days.closeDay(userId, propertyId, "2026-09-23", reasonOrNull);
```

The worker closes a quiet day through the closer, which takes the
`ranza_worker` client and nothing else:

```ts
const closer = createDayCloser({ db }); // db: the ranza_worker client (ADR 0018)
const { due, closed, open, failures } = await closer.closeDueDays();
```

It reaches the table only through two functions granted to that role — which
days are due, across Organizations, and closing one inside an Organization's
context, only when nothing is open. ADR 0018 is amended for the first.

`closeDay` throws `DayAlreadyClosedError` when another desk or the worker got
there first, `CloseReasonRequiredError` when items are open and no reason was
given, and `BusinessDayCloseError` for everything else — out of reach, not
permitted, not ended, out of order — which are one answer on purpose.

Closing posts nothing. Room nights need a rate (RANZ-31) and are designed as
slice 3, blocked on PRE-01 and PRE-02 in the feature's edge cases.
