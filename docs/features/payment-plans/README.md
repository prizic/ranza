# Payment plans

A Resident pays a term's fee in parts, and the worker charges each part to their Folio on
its due date (RANZ-96, [ADR 0059](../../adr/0059-a-resident-pays-by-instalments-the-worker-charges-on-their-due-dates.md)).
The diagrams and `edge-cases.csv` are the specification; this page records only the
decisions taken while it was designed, with the recommendation each carried.

## Decisions taken while designing

Designed without a human in the loop, so each question carries the answer built on and the
reason. Every answer is `proposed`; the owner approves by row number.

1. **A schedule or a monthly rent?** A schedule: N instalments, each an amount and a due
   date. Recommended because monthly payments and four senets are both cases of it
   (yurt-first decision 2), and the cost of the general case is one more row per payment.
   Comparable systems: Turkish yurt programs track senets as dated amounts; Odoo's payment
   terms are a list of lines with a due date; Mews and Cloudbeds bill a long stay through
   scheduled charges, not a rate.
2. **Where does the plan live?** On the booking, one per booking (PP-S1-02), made in the
   booking's own transaction. A plan made after a booking in a second call would leave a
   registered student with no schedule whenever the second call failed.
3. **Is the end date a rule of the operating model?** No: of the plan (PP-S1-04). A
   booking that has a plan has a departure date, for a hotel's long-stay Resident as for a
   student. The model only decides whether the dialog opens the section (PP-S2-02).
4. **May an instalment fall due after the term?** No (PP-S1-05): it would be charged to a
   Folio the check-out has closed. Before the term starts, yes: the first payment is
   often made at registration.
5. **When does an instalment become a charge?** On its due date by the Property's own
   calendar, by the worker, through a function it alone may execute (PP-S1-14, PP-S1-20).
   The nightly close does not carry it: nothing about an instalment depends on a business
   day's cutoff, and a plan must still be charged when a Property forgets to close.
6. **What makes it exactly once?** A unique index on `folio_lines.instalment_id`
   (PP-S1-15), not a check. Two workers, a retried pass and a pass that crashed after the
   insert all end with one line.
7. **Where is "charged" stored?** Nowhere on the instalment: it is the line that names it.
   A flag would disagree with the Folio the first time somebody reversed the line.
8. **A Resident who has not arrived?** The instalment waits (PP-S1-17) and is charged on
   the pass after the Folio exists, dated the day it fell due. It is overdue by its date.
   The alternative, creating the Folio early, changes check-in for every Property.
9. **What is overdue?** Past its due date in the Property's own calendar, not paid in full
   (PP-S1-25), read from one function. The day after, so an instalment due on the 1st is
   still due all of the 1st. Payments settle the oldest instalment first (PP-S1-26); a
   payment toward another charge is laid over instalments all the same, recorded as
   PP-DEF-01. Mews and Cloudbeds report an "outstanding balance"; this is that balance cut
   by instalment, so the desk sees which payment is late, not only that the account is.
10. **What is a revision?** The uncharged instalments are withdrawn and the new ones
    written beside them (PP-S1-11). Nothing is edited or deleted, so what was agreed and
    when it changed is always readable, and the plan names who revised it and when. The
    reason goes to the audit record, as for every other reasoned change.
11. **Who makes and who revises?** The front desk makes it, with the booking
    (`front_desk.book`); finance revises it (`finance.post_charge`) (PP-S1-08, PP-S1-12).
    A new permission was rejected: two already say it, and a third would have to be given
    to every role of every Organization. Recommended because money agreements should not
    be edited by whoever happens to be at the desk, and the desk makes the agreement at
    registration anyway.
12. **A booking that ends?** Its uncharged instalments are withdrawn (PP-S1-24), including
    at check-out. Recommended over leaving them live: a Folio that is closed cannot be
    charged, so they would wait for ever and show overdue for a Resident who has left.
13. **Is an instalment revenue?** Accommodation revenue (PP-S1-31), as a room night is.
    Posting it to Other Revenue would understate what a yurt earns from its beds.
14. **What does the dialog total start as?** The price-list price of the bed times the
    nights, split monthly from the start date, the remainder on the first (PP-S2-01). The
    remainder goes first because the first payment is the one most often late to be
    collected, so the smaller later ones are the ones that can slip. Every row is
    editable and a total that differs from the price list is shown, not refused
    (PP-S2-03): the desk negotiates with the family.
15. **A bed with no price?** The section starts empty and the desk types the total
    (PP-S2-07), because inventing a schedule from a price that is not there would put a
    number on a contract nobody chose.
16. **A Property with no billing?** No plan section (PP-S2-08) and the database refuses
    one (PP-S1-08): a plan nothing could charge would look agreed and never be charged.
