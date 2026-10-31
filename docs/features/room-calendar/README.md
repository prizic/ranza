# Room calendar

Diagrams: `use-case.mmd`, `states.mmd`. Rows: `edge-cases.csv`.

## Decisions taken while designing: slice 7, a term and the empty beds (RANZ-109)

Written by the lane that built them, with no one to ask. Each is the recommended
answer, taken as the direction; each row it produced is `proposed` until the
owner approves it.

1. **How long is a term, and where does it start?** 305 days from the 1st of
   September of the academic year today falls in (from July on, this year;
   before it, last year). Recommended because a Turkish dormitory year runs
   September to June, a Resident is booked for all of it, and the desk needs both
   ends of the booking on one screen. From memory and not checked against their
   products, Mews and Cloudbeds draw a month or two because a hotel stay is
   nights; a yurt lets a bed for a year (RC-S7-01, RC-S7-02).
2. **Is a term another allowed length or a separate view?** Another entry in the
   allowed lengths, so the address, the cookie and the toolbar keep one idea of
   "length", and any other number still falls back to the default (RC-DEF-08).
   The alternative, a second view with its own route, would need the filters,
   the drawer and the live refresh written twice.
3. **Does the term read nights?** No. The read returns bars and the free-row
   figures, never a row per night per bed, so its cost does not grow with the
   window the way the screen's cells would. Measured on the seeded 120-bed yurt
   under heavy machine load (load average 570): best of twenty 180 ms for 305
   days, 171 ms for 30, 167 ms for 14. The medians (310, 252, 277 ms) overlap
   entirely. There is no "before" for 305 days, since the read refused it, so the
   comparison is with the longest window that existed.
4. **What does the screen draw at that scale?** A cell a month, today marked, the
   month's smallest free count in the free row, and a folded room's peak of beds
   taken. A day is under three pixels, so a cell a day would be tens of thousands
   of nodes on a 120-bed yurt. Nothing is dragged at term; pressing a bar opens
   the drawer, whose Move and End keep dates (RC-S7-03). A drag that snaps to a
   week is deferred (RC-DEF-13).
5. **Who opens on a term?** The operating model picks the default and nothing
   else (ADR 0057): a dormitory opens on Term whatever length the browser
   remembers, a hotel on its remembered days and never on a term. No SQL reads
   the model (RC-S7-04).
6. **Block and gender filters on the board?** Yes, as chips with the empty beds
   each choice would leave, said before the press, and a sentence naming the
   narrowing with Show all (the ListFilterNotice pattern, as on Rooms). The
   figures above the grid stay the house's; the free row counts the rooms on
   screen. A block the Property has not got narrows nothing (RC-S7-05).
7. **How can the calendar count empty beds without a second definition?** It
   does not count them. The count is the places the Rooms read calls free
   tonight (`freePlaces`), the same ones Today's Empty beds card and the Rooms
   tiles use. Where that read cannot answer, the chips show no counts rather than
   different ones. An integration test holds the two to each other (RB-S6-03).
