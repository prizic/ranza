# Today at a dormitory

What the manager of a student dormitory reads on Today (RANZ-108, rows
`TD-S10-01` to `TD-S10-19` in [`edge-cases.csv`](edge-cases.csv)). The hotel's
Today is unchanged: every difference below is chosen by the Property's
operating model as a default, never as a rule (ADR 0057), and nothing in SQL
reads it. The two cards about the Residents themselves (instalments overdue and
tonight's roll call) are the exception that proves it: they follow the data,
so any Property that has a plan overdue or keeps a roll call draws them, hotel
or dormitory, and one that has neither draws neither (TD-S10-19).

```mermaid
flowchart LR
  P[Property.operating_model] -->|workingDay| D[deriveToday]
  R[reads: rooms, requests, maintenance, movements] --> D
  D -->|dormitory| B[Empty beds by block]
  D -->|dormitory| W[Requests and maintenance]
  D -->|dormitory and a day with nobody moving| Q[no arrivals, departures or flow]
  D -->|hotel| H[the Today it was]
  B -->|?show=free&admits=&block=| Rooms
  W --> GE[Student requests]
  W --> MT[Maintenance]
  P -->|screensFor| Rail[rail order: beds first]
```

## Decisions taken while designing

No person was available to grill, so each question carries the recommendation
built on. All rows are `proposed`.

1. **Does the open work card sit beside the hotel's Maintenance card or replace
   it?** Replace it at a dormitory. The same open and out-of-order counts would
   otherwise be drawn twice under two names. Common sense for the reader; no
   comparable system was checked (TD-S10-05).
2. **Is the maintenance figure "Faults"?** No: it counts every open
   maintenance request, faults and service work alike, so it is called
   Maintenance. A faults-only count is deferred until the category is a
   defined set (TD-S10-11).
3. **Does a dormitory have a mode that turns the bed figures on?** No. Bed
   counts follow whether beds exist (`byBed`), so a hotel that lets by the bed
   gets them too; only the words and the default cards follow the operating
   model (TD-S10-07, ADR 0057).
4. **What does `?block=` look like?** The building's name; `none` for rooms in
   no building; absent for the whole house. An unknown name narrows nothing
   rather than showing an empty list that reads as "no beds free". Carried by
   the awkward case (a renamed or removed building), not by a comparable
   system (TD-S10-02, TD-S10-03).
5. **Is the day with nobody arriving drawn as 0/0?** No at a dormitory, which
   is quiet most days; the figures return the moment somebody is due. A
   section that failed to read is never treated as quiet. A hotel keeps them:
   an empty arrivals list is news at a front desk. Carried by the dormitory's quiet days, not by a
   comparable system (TD-S10-06).
6. **Where do arrivals and departures hide?** On the timeline and the
   overview only, where they are figures and a flow. The house, next-up and
   night layouts list the arrivals and departures themselves as rows under
   their own lead question and are unchanged; the empty-beds and open-work
   cards were added beneath them (TD-S10-06, TD-S10-08).
7. **Does the rail change for a dormitory?** Order only. The beds, calendar and
   reservations come first, Close the day moves among the building's work. The
   set of pages and each page's gate are identical to a hotel's (ADR 0056,
   TD-S10-09).
8. **Overdue instalments?** Built once the instalments module landed, reading
   its one definition of overdue and recomputing nothing. The big numeral is
   the Residents, the money beside it is what is overdue and not what is owed
   in all, and nobody overdue is no card, so a Property without plans carries
   no standing zero (TD-S10-12).
9. **Who sees the money overdue?** The viewers who already see the money
   figures: a manager or finance viewer holding `finance.manage_folio` at a
   Property with billing. The read is not asked for anybody else. Carried by
   common sense: a balance is the most sensitive figure Today holds (TD-S10-15).
10. **Where does the overdue figure open?** Finance, as a list of the Residents
    it counts, because the instalments belong to a booking and the module names
    no Folio; a list of Folios could not give the number back. A new view in
    an existing screen, shown only through this figure (TD-S10-17).
11. **Is tonight's roll call a dormitory card?** No: it follows the data. Any
    Property that keeps a roll call, with somebody in house and a viewer who
    may take it or give leave, draws it, and so does the overdue card wherever
    a plan is overdue. The operating model chooses only the words (student for
    resident), as ADR 0057 allows. Each roll call figure opens the roll call
    screen, which takes no narrowing; narrowing it is deferred (TD-S10-16,
    TD-S10-18, TD-S10-19).
