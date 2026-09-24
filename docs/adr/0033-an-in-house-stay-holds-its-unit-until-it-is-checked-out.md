# 0033. An in-house Stay holds its Unit until it is checked out

Status: Accepted
Date: 2026-09-23

## Context

Two rules decided whether a Unit was free, and both reasoned about planned
dates. `stays_no_double_booking` refused two current Stays whose planned ranges
overlapped, and `reservations_no_double_booking` refused two confirmed
Reservations whose ranges overlapped. A front desk runs on something else:
who is in the room.

The difference was reproduced against a real database, twice.

- A Guest due out on Tuesday who was still in the room on Thursday held
  nothing: their planned range had ended. A second Guest was checked in on top
  of them.
- A checked-in Reservation leaves `reservations_no_double_booking` on purpose,
  because its Stay holds the nights instead — ADR 0024. Nothing compared a new
  booking with that Stay, so a room somebody was sleeping in could be promised
  over their remaining nights. `docs/roadmap.md` named this gap and left it
  undecided; the refusal arrived at the desk, on the day, with the Guest
  standing there.

## Decision

### One in-house Stay per Unit, whatever the dates say

A partial unique index, `stays_one_in_house_per_unit`. An in-house Stay's dates
are a plan and the room is a fact, so the index ignores the dates. The next
Guest is checked in once the last one is checked out, which is the order a
front desk works in anyway.

### A booking does not promise nights somebody is staying for

`app.unit_holds_one_occupancy()`, a trigger on both `reservations` and `stays`,
refuses a confirmed booking over nights a current Stay holds, and a Stay over
nights another confirmed booking holds. It raises 55006 (object in use), which
is a different answer from 23P01 (another booking has those nights): the desk
solves the first by checking somebody out and the second by moving a booking.

The nights an in-house Stay holds are its plan, with two exceptions:

- **Open-ended** — a Resident who has not said when they leave holds every
  night from their arrival.
- **Overdue** — once the business date has passed their planned departure and
  they are still in, they hold tonight, because nobody knows whether they leave
  today or stay another night.

**Not** the day they are due out. A hotel sells tonight in a room whose Guest
leaves this morning; that is most of any day's arrivals. The booking is
accepted and the check-in waits for the check-out, through the unique index.

### It is an admission rule, not an invariant

The Stay's side grows with today, so a booking that was legal when it was taken
can later overlap a Guest who overstayed. The trigger therefore fires only when
a row starts holding nights or moves them — a booking becoming confirmed, a Stay
becoming in house, a Unit or dates changing — and never on an unrelated update.
Otherwise that booking could not be cancelled or amended for a reason it did not
cause. The overlap surfaces where it can be acted on: at check-in, as a Unit
that is occupied.

### Serialised per Unit

A trigger that reads another table is write skew: a booking and a check-in on
one Unit at the same moment each read before the other commits, and both
commit. Both sides take `pg_advisory_xact_lock(2, hashtext(unit))` first —
namespace 2, since 1 is the Stay's (`20260916001700`).

The order is namespace 2 before namespace 1, and before any row lock on `stays`
or `reservations`. Advisory-against-advisory is not the whole hazard. A check-in
into a Unit whose Stay another transaction is withdrawing waits on that
transaction inside the unique index, which is not a lock this code holds; if the
withdrawal then asked for namespace 2 while the check-in held it, each would
wait on the other and Postgres would kill one. That was reproduced — `40P01` on
every run of the test below with the protections removed.

Two things prevent it, and one of them is what binds. The trigger does not fire
on the way back from checked in, so a withdrawal never asks for namespace 2 at
all. `checkIn` and `reverseCheckIn` also take it first themselves, which keeps
the order right if that arrow is ever checked again; removing that alone
produces no red, because the first reason already holds.

## Consequences

- A Unit with somebody in it is refused at the booking, not at the desk.
- An overstaying Guest blocks tonight's arrival in their room with an answer
  the desk can act on, and the arrivals list can say so before anybody presses
  the button.
- The trigger is `security definer`: whether a room is free must not depend on
  which rows the actor's policies let them see. It returns nothing but a
  refusal.
- The race is tested on two connections in `tests/integration/front-office.test.ts`
  and goes red without the lock. The separate lock `checkIn` takes first guards
  an interleaving the test cannot force reliably, so it is argued here rather
  than proved there.
