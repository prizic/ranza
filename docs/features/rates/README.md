# Rates

A Property's nightly price by the kind of Unit a night is spent in (ADR 0038). The
diagrams and `edge-cases.csv` are the specification; this page records only the
decisions taken while a slice was designed, with the recommendation each carried.

## Decisions taken while designing

### Slice 4: a bed's price follows its room (RANZ-111)

Designed without a human in the loop, so each question carries the answer built on and
the reason. Every answer is `proposed`; the owner approves by row number.

1. **What does a price for a bed depend on?** The beds its room has. Recommended
   because that is how a Turkish yurt writes its fee sheet (single, double, triple,
   quad), and it is a fact the room already states: `accommodation_units.capacity` is
   given when the room is added and no grant lets it change. Comparable systems: Mews
   and Cloudbeds price a bed in a dorm by the room type it belongs to; Apaleo prices by
   unit group.
2. **A new rate plan or a column on the existing price?** A nullable `room_capacity` on
   `property_rates`, for beds only (RT-S4-03). The general case of a second price
   dimension is deferred (RT-DEF-07): a building, a floor or a season is its own design,
   and one column keeps every hotel row exactly as it was.
3. **What does a bed in a room with no price of its own cost?** The price for a bed in
   any room (RT-S4-04). Without a fallback every new room size would book unpriced until
   somebody noticed, and the front desk is never blocked by a price list nobody has
   filled in (RT-S2-03).
4. **What does clearing a size's price mean?** That the size has no price of its own
   (RT-S4-05). Clearing is how a row is taken away in a product that deletes nothing, so
   an override that is cleared stops overriding.
5. **A size priced in a currency the Property has left?** It prices nothing, and its
   beds do not fall to the general price (RT-S4-10). A stale price that quietly gave way
   to another would charge a number nobody chose for that room.
6. **A booking moved to a room of another size?** It takes the new size's price while it
   is still to come, a lower one needing `rates.manage` (RT-S4-08, RT-S4-09). The
   alternative, keeping the quad's price in a single, would make the fee sheet wrong on
   exactly the booking the desk had just moved.
7. **One function for the price, or four joins?** One: `app.rate_for_unit()`. The stamp,
   the re-stamp on a move, the dialog's quote and the amendment's options all asked "the
   row for this Unit's kind" by joining the table; a second dimension in four places is
   four chances to disagree (RT-S4-12).
8. **Does the Configuration screen show sizes nobody has?** Only the sizes that exist at
   the Property, or that already hold a price (RT-S4-13). A form with sixty rows would
   bury the three the yurt has.
