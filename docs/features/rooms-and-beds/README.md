# Rooms and beds

Diagrams: `use-case.mmd`, `states.mmd`. Rows: `edge-cases.csv`.

## Decisions taken while designing: slice 6, narrowing the map (RANZ-109)

Written by the lane that built them, with no one to ask. Each is the recommended
answer, taken as the direction; each row it produced is `proposed` until the
owner approves it.

1. **Should Rooms offer block and gender choices?** Yes, but only where they mean
   something: two groups of chips, Building (a dormitory's words say Block) and
   Rooms for, each shown only when the Property has two or more buildings or any
   room that admits one gender. A single-building hotel sees neither (RB-S6-01).
   From memory and not checked, Mews filters by room type and floor in one
   panel; a yurt asks by block first because the desk assigns by block and gender.
2. **What number sits on each chip?** The empty beds it would leave given the
   other group's choice, so Women in Blok B reads 0 before it is pressed. Counted
   from the places Today's Empty beds card and the Rooms tiles already call free
   (RB-S5-19, RB-S5-20); nothing counts a second way (RB-S6-03).
3. **How does a link narrow Rooms?** `?block=` sits beside `?show=` and
   `?admits=`, which Today's per-block figure opens, in the grammar the Today
   lane set: a building's name, or `none` for the rooms in no building, which
   the chips call Other rooms. A block the Property has not got is no narrowing,
   as an unknown `show` is none, so an old or hand-typed link opens the whole
   map. The shared filter notice says what it is narrowed to, with the figure
   in words and the way back (RB-S6-02). One definition of both, not two.
4. **What stays unbuilt?** Choosing by floor, and saved filters, are not here;
   floor is already a field on every room and can be one more chip group later
   without changing the definition of free.
