# Leave and the nightly roll call

Leave (izin) and the nightly roll call (yoklama) of a student dormitory
(RANZ-101, Stage 2 of [`docs/yurt-first-plan.html`](../../yurt-first-plan.html)),
and the figures Today shows from them (RANZ-108). The decision is
[ADR 0064](../../adr/0064-leave-and-the-roll-call-are-records-added-to-and-never-changed.md);
the rows are [`edge-cases.csv`](edge-cases.csv), prefix `LA`.

## Decisions taken while designing

There is no design partner yet (RANZ-104), so every answer below is the general
case, with the recommendation that carried it. Comparable systems are Mews,
Cloudbeds, Opera Cloud and Apaleo, which keep no roll call at all, and the
Turkish yurt programs, which keep both as a paper form (izin kağıdı) and a
nightly list. Nothing here is approved: every row is `proposed`.

1. **Whose is a leave?** A Resident's Stay, for nights. Recommended because the
   bed and the term are on the Stay, a Guest has none, and a student on a
   second contract is away from one Stay and not the other. Yurt programs
   record "çıkış" and "dönüş" dates, which are nights.
2. **Is a night a date or a time?** A date: the business night that begins on
   it (ADR 0021). Recommended because a roll call is one list per night, and a
   leave of "22:00 to 07:00" is a time-of-day rule for a later row (LA-DEF-09).
3. **Is a reason required?** Yes, two to three hundred characters. Recommended
   because the guardian will ask, and a form without one is the thing a desk
   already refuses to sign.
4. **Who reads the reason?** Only `leave.grant`, in a table of its own. Recommended
   because a reason can be medical or a family matter of a seventeen-year-old
   (KVKK), the night warden needs to know who is away and not why, and a column
   grant cannot vary by role under one runtime role (ADR 0058 reasoned the same).
5. **Can a leave be deleted or edited?** Neither. It is cancelled while no night
   of it has passed, and ended once one has; changing its dates is cancel and
   give again (LA-DEF-07). Recommended because the history is what a guardian
   dispute is settled on.
6. **Can one Resident be away twice on a night?** No, by an exclusion constraint
   in the database. Recommended because two overlapping leaves cannot both be
   true, and a database rule beats a check that two desks can race past.
7. **What is a roll call?** The answers sharing a Property and a night, with no
   header row. One row per answer, never changed; the latest of a Resident's is
   the current one. Recommended because "one roll call per Property per night"
   then needs no uniqueness to keep, "who and when" is on every row, and a
   correction is a row above the old rather than a rewrite.
8. **How is a correction kept?** As another row, with who and when. Recommended
   for the reason above, and because Postgres cannot refuse a rewrite to the
   owner unless a trigger does.
9. **Present is how many taps?** One, on the row itself. Absent is one more
   button on the same row. Recommended because most of a floor is in at the
   curfew, and "mark the rest present" for a floor finishes the common case in
   one more tap. The keyboard path is the arrow keys and `P` or `A`.
10. **What happens to a Resident on leave?** Shown as on leave and not offered
    for marking; leave outranks a mark, so a leave granted after a mistaken
    "absent" settles it and a cancelled one brings it back. Recommended because
    the alternative is a warden calling a student the desk already knows is away.
11. **What is missing?** Absent and not on leave. A figure, not a state: the
    database stores answers and leaves, and the count is made from them.
12. **When is a Resident "not yet called"?** Always until answered; the figure
    is _flagged_ only after the Property's curfew. Recommended because before
    the curfew nobody has been late, and an alarm for the whole evening is one
    that is ignored by ten.
13. **Where is the curfew?** A Property setting, `attendance_settings`, set by
    whoever holds `configuration.manage`. No row means the application's
    default: 23:00 for a dormitory, none for a hotel. A row with no time means
    no curfew, on purpose. Recommended because ADR 0057 lets the model choose a
    default and never a rule, so the default lives in the application and no
    function reads the model. A curfew earlier than the Property's cutoff
    (00:30) belongs to the next calendar day.
14. **Who may do what?** Two permissions, `attendance.take` and `leave.grant`,
    held by the shipped Owner, Manager and Front desk; a night warden is a role
    an Organization writes with only the first. Housekeeping and Finance hold
    neither: a cleaner needs a name on a room. Recommended because the people
    who call the roll at night are often not the people who sign leave by day.
15. **Where does the roll call live?** Under Front Office, offered where the
    Property has the `attendance` capability and to a role holding either
    permission. A capability, not the operating model, so a hostel gets it
    too; a dormitory has it on from the start (ADR 0057).
16. **Which Residents are called?** Residents in house, by stay type. A
    hotel Guest in a dormitory's summer is not (LA-DEF-03). Recommended because
    attendance is a rule about students, and the Stay type already says who is
    one.
17. **May a past night be called?** The database accepts any night of the Stay
    up to tonight, as a late roll call is still one; the screen offers tonight.
    Recommended because refusing last night's roll call after a power cut helps
    no one, and the mark says when it was made.
18. **Is the guardian told?** No, here: RANZ-112 sends messages and needs the
    delivery foundation (RANZ-85). The figures name who is missing; the
    message is LA-DEF-01.

## Open facts

- Whether the partner yurt keeps a second roll call, in the morning (an
  `yoklama` at wake-up). The records would hold it as a mark for the same
  night; the screen and the figures would need to say which. (RANZ-104.)
- Whether a yurt must keep these records for a retention period under KVKK
  or the regulation counsel names (RANZ-104).
