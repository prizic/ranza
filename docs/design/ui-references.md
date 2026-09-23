# Interface references

Products to study before designing a Ranza screen. All of them are real
hospitality or accommodation software — not dashboard concepts. The point of
each row is the **pattern**, not the palette.

## Hospitality

| Product                                                                       | Pattern to study                               | What Ranza takes                                                     |
| ----------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| [Mews](https://www.mews.com/)                                                 | Navigation and task-focused screens            | Calm hierarchy, fewer borders, one obvious primary action per screen |
| [RoomRaccoon](https://roomraccoon.com/)                                       | Reservation calendar, drag-and-drop allocation | The room rack: a timeline with compact reservation bars              |
| [Cloudbeds](https://www.cloudbeds.com/)                                       | Front-office workflow navigation               | Fast movement between Reservations, Guests and Folios                |
| [OPERA Cloud](https://docs.oracle.com/en/industries/hospitality/opera-cloud/) | Configurable role-based dashboards             | A different arrangement for a manager, a receptionist and accounting |
| [Little Hotelier](https://www.littlehotelier.com/)                            | Simplicity for small operators                 | A daily operations screen that needs no training                     |
| [Hotelogix](https://www.hotelogix.com/)                                       | Dense front-desk grid                          | Live Unit and Reservation status without wasting space               |
| [RMS Cloud](https://www.rmscloud.com/)                                        | Rates, restrictions, performance               | Occupancy, pricing and availability in one usable grid               |

## Student residence

Relevant because a dormitory is a Property configuration rather than a separate
product ([ADR 0004](../adr/0004-student-residence-is-a-property-configuration.md)),
so these patterns have to fit the same screens as the hotel ones.

| Product                                                                  | Pattern to study                                    | What Ranza takes                                      |
| ------------------------------------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------- |
| [Warden](https://www.wardenera.com/)                                     | Portfolio occupancy, collections, resident requests | The Organization-level view across several Properties |
| [PG+](https://www.pgplus.co.in/homepage)                                 | Visual floor, room and bed availability             | Bed-level detail when a room is expanded              |
| [StarRez](https://www.starrez.com/)                                      | Student housing lifecycle                           | Resident assignment, room selection, billing          |
| [Ulyses Cloud](https://www.softwaredoit.es/ulysescloud/ulysescloud.html) | Room-status tiles grouped by floor                  | A readable floor grid: number, status, pending tasks  |

## Our own products

Two internal applications set the visual language, rather than the layouts
above. Neither is public, so the pattern is described instead of linked.

| Product        | Pattern to study                                           | What Ranza takes                                                                   |
| -------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Leaders portal | Floating glass rail and bar, large light titles, card rows | The workspace shell and the palette, recorded in `visual-reference.md`             |
| EduBoard       | Sign-in                                                    | A framed sheet: the form on the start half, a showcase panel inset on the end half |

## The direction

Combine: **Mews** for visual calm, **RoomRaccoon** for the reservation calendar,
**OPERA Cloud** for role-based dashboards, **Warden** for multi-Property
metrics, **PG+** for floor and bed visualisation, **StarRez** for the residence
workflows.

**The next screen worth designing is the Room Rack** — a RoomRaccoon-style
timeline, with PG+-style bed detail when a room is expanded. Blueprint 18.6
already specifies most of it: filters, conflict preview before a move, a
persistent side drawer, and an action cluster for confirm, assign, check in,
move, extend, cancel, no-show and check out.

## What these references do not settle

They are about layout and interaction. The palette and typography are in
[`visual-reference.md`](visual-reference.md), and how the components are
organised is
[ADR 0013](../adr/0013-an-interface-is-shadcn-a-feature-folder-and-a-shared-kit.md).

## The mockup

[`ranza-mockup.html`](ranza-mockup.html) — open it in a browser. Every screen of
the product as one interactive artefact: seven roles to sign in as, all three
languages with RTL, light and dark, the Operator Workspace, the resident Portal,
the Storefront and the Prizic Control Plane. Nothing behind it is real; state
lasts until the page reloads.

Its `:root` still carries the teal palette that
[`visual-reference.md`](visual-reference.md) replaced with the Leaders direction
on 2026-09-22, so read it for layout and density, not colour.

**It is a shape reference, not a specification.** It shows what a screen wants to
be once the module under it exists — not what may be built now. Where it and the
blueprint disagree the blueprint wins, and where it shows something no approved
specification covers it is an idea rather than a commitment. Two things it
invents outright: KBS guest reporting, and a room's men/women/mixed occupancy
rule. Neither appears in the blueprint.

What it settles, because it is easier to see than to argue about:

- **A bed is a place a Stay goes.** A room is a container with labelled beds, and
  a shared room is sold per bed. Blueprint 2 already allows this — an
  Accommodation Unit "may be a room, bed, apartment, suite" — and the mockup is
  what that reads like at a front desk.
- **A Guest and a Resident are one record with a kind**, carrying documents, a
  guardian, an emergency contact and a balance. Blueprint 2 says a Student is a
  Resident type; the profile screen is the same statement about Guests.
- **The daily loop is five destinations** — today, front desk, reservations, the
  rack, night audit — and the other twenty are things you visit, not things you
  work in.
