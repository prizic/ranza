# @ranza/rates

What a night costs at a Property, by the kind of Unit it is spent in — a room,
a bed, an apartment or a suite
([ADR 0038](../../../docs/adr/0038-a-night-is-priced-by-its-unit-type-and-fixed-when-booked.md)).
The design is [`docs/features/rates`](../../../docs/features/rates/).

This is the smallest price blueprint 15.10 lets a feature decide. Rate plans,
seasons and restrictions are Distribution and Revenue's (blueprint 5.16);
discounts and taxes are Billing's (5.9). Neither is here.

## What this module owns

`property_rates`: one row per Property and unit type, in
[`prisma/migrations/20260916008000_a_night_has_a_price`](../../../prisma/migrations/20260916008000_a_night_has_a_price/migration.sql).
The caller names the Property, the type and the amount — none, to clear it,
since a row is never deleted; a trigger states the
price in the Property's currency and names who set it. A price left in a
currency the Property no longer trades in is stale and prices nothing until it
is set again. Setting, changing and clearing need `rates.manage` and the
Configuration capability at the Property; whoever reaches the Property reads it.

What a booking and a night do with a price is not this module's: a Reservation
is stamped with its price by `@ranza/reservations`' table, and a night is
charged to a Folio by the close of the day and by check-out.

## Contract

```ts
const rates = createRatesModule({ db }); // db: the ranza_app client (ADR 0006)
await rates.getPriceList(userId, propertyId); // the list, or null
await rates.setPrices(userId, propertyId, {
  version,
  prices: [{ unitType: "room", amountMinor: 150000 }],
});
```

`setPrices` is serialised per Property by advisory lock namespace 4 and refuses
a list that changed since it was read (`RatesStaleError`, carrying the current
list). One `price_list.changed` audit record per save, with every type's price
before and after.
