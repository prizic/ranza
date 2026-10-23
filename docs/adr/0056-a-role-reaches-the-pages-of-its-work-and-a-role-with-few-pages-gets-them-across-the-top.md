# 0056. A role reaches the pages of its work, and a role with few pages gets them across the top

Date: 2026-10-19

Status: Proposed

Proposed amendment to the approved rows named under "What this reverses". Builds
on [ADR 0031](0031-an-audit-record-carries-its-location-and-is-read-by-permission.md)
and [ADR 0047](0047-a-destination-has-one-gate-and-the-proxy-tells-a-page-where-it-was-going.md).

## Context

A capture of the hosted workspace as each of the five shipped roles found the
interface nearly the same for all of them. The rail differed in three entries;
what changed with the role was whether a button was drawn. A Housekeeping Staff
Member could open Finance (every Folio, with the Guest's name and balance),
People (every colleague's address and role), HR, Analytics and Configuration,
and the rail offered all of them. Permission stood in front of every write
([ADR 0012](0012-a-write-is-bounded-by-a-policy-not-a-check.md)) and in front of
a read only for the audit log, data export, integrations and the ledger.

That was decided screen by screen, in approved rows, as reading without changing:
a reader of Configuration sees every value (CF-S3-01), a reader of Housekeeping
sees every status (HK-S2-12), and Analytics withholds money while showing the
rest (AN-S1-09). The owner's request now is the opposite: each role should be
offered the pages of its work only.

## Decision

### A page is opened by the permissions of its work

Each destination in `lib/screens.ts` names the permissions that open it; a role
holding any one of them is offered it, and the Subscription, Entitlement and
Property capability still apply as before (ADR 0047's `ScreenGate`). A role gains
a page by being given a command in it and loses it by losing the last one.

| Page                                              | Opened by any of                                                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Today                                             | everybody                                                                                                      |
| Reservations, Room calendar, Arrivals, Departures | `front_desk.book`, `.check_in`, `.check_out`, `.cancel`, `.amend`                                              |
| Rooms and beds                                    | those, and `accommodation.configure`                                                                           |
| Close the day                                     | `front_desk.close_day`                                                                                         |
| Guest Experience                                  | `guest_services.create_request`, `.manage_requests`                                                            |
| Housekeeping                                      | `housekeeping.update_status`                                                                                   |
| Maintenance                                       | `maintenance.report`, `.manage`, `.take_out_of_order`, `.equipment`                                            |
| Finance                                           | `finance.manage_folio`, `.post_charge`, `.reverse_charge`, `.post_payment`, `.reverse_payment`, `.view_ledger` |
| People                                            | `staff.administer`, `staff.define_roles`                                                                       |
| HR and Payroll                                    | `hr.view` (unchanged)                                                                                          |
| Analytics, and All Properties with it             | `finance.view_ledger`                                                                                          |
| Configuration                                     | `configuration.manage`, `accommodation.configure`, `rates.manage`                                              |
| Food and Beverage, Inventory (unbuilt)            | `configuration.manage`                                                                                         |
| Integrations, Data export, Audit log, Branding    | unchanged                                                                                                      |

The shipped roles then reach: Housekeeping, Today, Guest Experience, Housekeeping
and Maintenance; Finance, Today, Departures, Maintenance, Finance, Analytics and Data export;
Front desk, the six Front Office pages and Guest Experience, Housekeeping,
Maintenance and Finance; Owner and Manager, everything.

The shell asks every gate in one read (`listPermittedPropertiesByGate`), because
one read per destination and permission is a connection each and a full page
load would ask for dozens at once. A page asks the same gate for itself
(`screenProperties`), and a link from one page to another is offered only where
the target's gate opens, so a role is not sent to a page that refuses it.

### Few pages are chips, not a sidebar

A role that reaches six pages or fewer has no sidebar and no dock: its pages are
chips in the page bar, and the page takes the width the sidebar held
(`navModeFor`, `TOP_NAV_MAX_PAGES`). More than six keeps the sidebar, as an
Owner, a Manager and a Front desk Staff Member do. The count is of destinations
the role reaches in any Property it reaches.

Six, not four: the shipped Finance role reaches six, and a sidebar for six links gives up
a column to say little. Four would put Finance in a sidebar for no reason a
person could state.

### What it does not do

This is the application's gate, enforced in the rail and in every page, on the
server. It is not a row-level policy: a role denied a page can still be sent its
data by another screen that reads it for its own purpose (the Balance column of
Arrivals reads Folios), and the database still lets a member read what their
reach allows. Gating reads in the policies, table by table, is the stronger
change and the larger one, and wants its own decision. Writes are unchanged: the
database refuses every command a role does not hold.

## What this reverses

Rows that said a reader without the permission opens the page and sees it
read-only, which no longer holds where the role holds nothing in that page's work:
CF-S3-01 (Configuration), HK-S2-12 (Housekeeping board), MT-S1-12 and MT-S3-08
(Maintenance board and register, for a role with none of the four permissions),
CD-S1-43 (Close the day), and AN-S1-09 (Analytics now closed to a role without
`finance.view_ledger`, rather than opened with money withheld). A viewer who holds
one permission of a page's work still opens it read-only where they lack another;
those rows stand for them. Each is a proposed row in
`docs/features/staff-and-permissions/edge-cases.csv` (SP-S6-12 to SP-S6-16), and
none of the approved rows is edited here.

## Costs and what is left open

- The threshold of six, the permission lists above, and Maintenance being open to
  every role that can report a problem are the owner's to change; each is a
  constant or a list in `lib/screens.ts` and `lib/nav-mode.ts`.
- Food and Beverage and Inventory, which have nothing behind them, are offered
  only to a role that configures the Property.
- Finance keeps its neutral refusal for an unreachable or switched-off Property
  (FO-S9-01) and names the permission only when the role lacks it, so a forged
  address and a switched-off Property still answer alike.
- A role with one or two pages is a page bar with one chip. That is correct and
  may look bare; an Organization-authored role can be that small.
