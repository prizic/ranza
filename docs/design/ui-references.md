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
