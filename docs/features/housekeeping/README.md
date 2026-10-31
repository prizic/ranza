# Housekeeping

The edge cases are `edge-cases.csv`; the lifecycles are `states.mmd`; who does
what is `use-case.mmd`. This file records the decisions taken while designing
slice 4, cleaning rooms somebody is staying in (RANZ-83, ADR 0063), because
there was no person to grill. Each is a question with the answer built and the
reason; every row it produced is `proposed`.

## Decisions taken while designing slice 4

1. **Is a room due for a stayover clean a status?** No. It is read from the
   schedule, the arrival and the last clean, and it writes nothing to
   `housekeeping_unit_status`. A fifth status would make an occupied room "not
   ready", warn or refuse a check-in of the bed beside it, and change what
   Today, the arrivals list and the room calendar say about a hotel that has
   done nothing. Comparable: Opera Cloud and Mews keep stayover and departure
   cleaning as separate tasks over one occupancy fact; none sells a stayover
   room as dirty. (HK-S4-05)
2. **Computed when read, or marked by the worker each business day?** Computed
   when read. A mark would need a job, and a job can stall with no one the
   wiser (the autonomy that matters here is that nothing can). It would go stale
   the moment the schedule changed, would need a catch-up for a day the worker
   missed, and would have to be reconciled with an arrival mid-cycle. A read has
   none of that, costs one statement per board, and a changed schedule re-draws
   the list at once. The cost is that "overdue" is also read, not recorded:
   history of what was due on a past day is not kept, only what was cleaned.
   (HK-S4-01, HK-S4-05)
3. **What is the schedule?** Never, every N days (one to fourteen; one is every
   day), or one weekday a week. These cover a hotel's daily service, a hostel's
   every-third-day and a dormitory's weekly clean with three controls, and no
   rule engine. Per Property, not per Organization: a hotel and a dormitory in
   one Organization clean differently, and a default for the Organization would
   need a reach check the Property does not. Cleaning on specific dates, per
   room type or per block is a deferred row. (HK-S4-02, HK-S4-03)
4. **Where does the operating model come in?** Only as the default, and only in
   the application: a hotel starts at every day, a dormitory at one weekday a
   week (Monday). The module and the database function are handed the resolved
   schedule and read no model; the pgTAP suite for ADR 0057 would go red if
   they did. (HK-S4-17)
5. **When does a cycle begin?** At the latest of the arrival of the earliest
   person still in the room, the last time the room was marked clean or
   inspected, and the last stayover clean. A turnover clean therefore also
   counts as the stayover clean, and a guest is not asked to be cleaned around
   on the day they arrive. A room let by the bed is one line: the cycle is the
   room's, not a bed's. (HK-S4-01, HK-S4-09)
6. **What is never listed?** A dirty room (turnover owns it; cleaning it starts
   the cycle over), a room out of service, and a room everyone in it leaves
   today. A room cleaned today is always listed so the press can be seen and
   undone. (HK-S4-06, HK-S4-07)
7. **Who may mark one done, and what does undo cost?** Whoever may already mark
   a room clean (`housekeeping.update_status`: the housekeeping role, the desk,
   manager, owner). One press on the card, no dialog, no reason: the gesture
   carries everything, and the database stamps the date and the actor. Undo is
   one press, the same day only, and stamps the row rather than deleting it.
   Mews and Cloudbeds both mark a stayover done from the task itself.
   (HK-S4-08, HK-S4-13, HK-S4-14, HK-S4-16)
8. **Bulk marking?** Not built. Selecting a floor and marking it done is a real
   wish at 24 rooms and a proposal, not a tweak. (see UX proposals in the
   handoff)
9. **Per-bed status in a shared room (HK-DEF-02)?** Not built, and the reason is
   recorded on the row: it changes the readers of hotel turnover, which this
   slice promises not to touch. Stayover cleaning does not need it.
