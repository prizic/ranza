# Lane A — front desk (reservations, arrivals, departures, close-day, rooms, room-calendar)

Read-only, `origin/main` 49ae2cc4, worktree `/Users/pcx/Developer/ranza-rooms-open-stay`.
Paths are under `apps/operator-workspace/src/` unless they start with `packages/`.
Prior audit checked with grep over `docs/ux-audit`; only A-09 and A-11 had near matches (noted).

### A-01 · MODAL · TWEAK · severity high · verified (code), UX consequence inferred

- Where: Reservations, detail sheet opened by clicking a row. `features/front-office/components/reservations-table.tsx:111-112` (state), `:263` (`onRowClick` stores the row object), `:296-303` (sheet reads that stored object); the `?open=` path at `:196-198` re-finds the row in `reservations` on every render.
- What happens: the desk opens a booking, presses Check in (or Undo, or Cancel/No-show/Change from the "…" in the sheet footer). The action revalidates the page and the list behind the sheet updates, but the sheet keeps the row as it was when clicked: status badge still "Confirmed", Check in button still there, Cancel still offered. A second press is refused ("already checked in" / "withdrawn").
- Why it is wrong: the sheet shows a snapshot while the same sheet opened from a link (`?open=`) shows live data, so the two disagree and the snapshot offers actions that are already done.
- Fix: keep only the selected `reservationId` in state and derive the row with `reservations.find(...)` exactly as `linkedSheet` does at `:196-198`; close (or show the "gone" state) when the row is no longer on the list.

### A-02 · DEAD-END · TWEAK · severity medium · verified

- Where: Arrivals row action cell `features/front-office/components/columns.tsx:545-558`; Reservations row `columns.tsx:1389-1398`; Reservations sheet notice `features/front-office/components/reservation-detail-sheet.tsx:315-320`; strings `checkInBlocked.*` in `messages.ts` (en ~7934-7937).
- What happens: where the Check in button would be, the row says "Somebody is still in the room. Check them out first." / "The Unit is blocked. Unblock it or choose another." / "The Unit is out of order. Choose another." Plain text; the occupant, the Departures page, the room tile and "Change booking" are not offered next to it (they are only reachable through the "…" menu, if the viewer thinks to look; "Check out (opens Departures)" is not even offered on these rows, since `checkOutDue` is not passed).
- Why it is wrong: it is the Rooms "occupied, cannot block" defect again: a refusal that names the next step in words and gives no way to take it.
- Fix: under the text, one link chosen by `checkInBlocker`: `unit_occupied` to `departures?property=` (the same link `row-menu.tsx:183-193` builds), `unit_blocked` / `unit_out_of_service` to `rooms?property=&unit=` (`row-menu.tsx:194-203`, `reach.rooms`), each gated by `reach` as the menu already is; on Reservations (which passes no `reach`, see A-06) reuse the same gate.

### A-03 · DEEPLINK · TWEAK · severity medium · verified

- Where: receiver `features/front-office/components/reservations-table.tsx:192-198` (`?change=`, `?open=`); sources include the calendar drawer `features/room-calendar/components/bar-drawer.tsx:263-268` and `:550-553`; the list's filter is `packages/ranza/reservations/src/module.ts:1812-1816` (`ends_on >= today` or still `requested/confirmed/checked_in`).
- What happens: on the room calendar, with "Show departed" on, open a Guest who left on an earlier day. The drawer's reference link and the main button ("Open Reservations") go to `reservations?open=<id>`. That booking is checked out and ended before today, so it is not on the list and the page opens as a plain list with no sheet and no word. Same silence for `?change=` (sent by `features/maintenance/components/impact-notice.tsx:67`) when the booking has since been checked in, cancelled, or is no longer changeable (`mayAmend` false).
- Why it is wrong: a link that the product itself built does nothing and says nothing when its target is outside the list.
- Fix: when `opening`/`changing` is set and no row matches, show a one-line notice ("That booking has ended and is no longer on this list" / "That booking can no longer be changed") above the table; better, have `reservations/page.tsx` read the one booking by id when it is not on the list so the sheet opens for past bookings too. Also hide the drawer link for a departed bar whose `endsOn` is before today.
- known: `docs/ux-audit/2026-10-25-fix-reports/lane-04-calendar-rooms.md` CALENDAR-07 added the link; the departed case was not considered there.

### A-04 · GATE · TWEAK · severity medium · verified

- Where: Arrivals `app/[locale]/(workspace)/arrivals/page.tsx:106-118` ("New booking" link, unconditional); Reservations `app/[locale]/(workspace)/reservations/page.tsx:97-122` (the dialog exists only when `mayBook`); `features/front-office/components/new-reservation-dialog.tsx:201` (`startOpen` is initial state only).
- What happens: Arrivals is open to anyone with any of the five front-desk permissions (`lib/screens.ts:122-128, 221-229`). A viewer with `front_desk.check_in` but not `front_desk.book` is shown "New booking"; it lands on `reservations?new=1`, where nothing is rendered for them: no dialog, no button, no explanation. Separately, `?new=1` is never removed when the dialog closes (compare `change` and `open`, which are removed at `reservations-table.tsx:200-210, 284-292`), so a reload or a copied link reopens the form.
- Why it is wrong: a button offered to a viewer who cannot use it, ending in silence; and a one-shot parameter that behaves as a permanent one.
- Fix: in `arrivals/page.tsx` compute `mayBook` with `permittedProperties("front_desk.book")` exactly as `reservations/page.tsx:96-98` does and render the link only then; in the dialog's `onOpenChange(false)` do `router.replace` without `new`.

### A-05 · NO-HOME · TWEAK · severity medium · verified

- Where: Close the day `features/front-office/components/close-day-view.tsx:258-316` (not-arrived rows), `:326-379` (not-departed rows), menu call at `:299-313`; `features/front-office/components/row-menu.tsx:105, 115, 194-203`.
- What happens: each row that holds the day open names a Guest, a reference and a room, but none is a link. The not-arrived row's "…" menu is built without `reservationId` and `unitId`, so there is no "Open reservation", and "Show on room map" is still offered (reach defaults to everything) and opens the unfiltered map. The not-departed rows have no menu at all, only Check out / Extend. Only the "room nights not charged" list (`:460-476`) links to the booking. The data is there: `OpenArrival` and `OpenDeparture` both carry `reservationId` (`packages/ranza/business-day/src/contracts.ts:55-65`).
- Why it is wrong: the screen exists to resolve named bookings, yet the booking cannot be opened from the row, and one menu item promises a room it does not select.
- Fix: pass `reservationId` and `unitId` (add `unitId` to the contract rows or drop the room-map item when there is none) into `FrontDeskRowMenu`, and render the guest name as the same `?open=` link `GuestName` uses (`columns.tsx:238-271`), gated by the reservations gate.

### A-06 · GATE · TWEAK · severity medium · inferred (role contents), verified (code)

- Where: `features/front-office/components/columns.tsx:1069-1125` (`ReservationMenu` passes no `reach`, so `REACHES_EVERYTHING` applies, `reach.ts:13-18`); `reservation-detail-sheet.tsx:132-134, 302-311` (Folio link unconditional); `close-day-view.tsx:519-525` ("Open folio"), `:294` (Open arrivals), `:463` (Open booking); `close-day-check-out.tsx:52-58` and `room-calendar/components/bar-drawer.tsx:575-581` (`CheckOutDialog` without `canOpenFolio`, default true, `check-out-dialog.tsx:84`).
- What happens: Arrivals and Departures compute `frontDeskReach` (`server/front-desk.ts:83-105`) so a menu never offers a page the viewer cannot open (ARRIVALS-15). Reservations, the sheet, Close the day and the calendar drawer do not: they offer "Open folio" / "Review folio" to anyone, and Finance is a separate screen gate (`lib/screens.ts:323-334`). Close the day's gate is `front_desk.close_day` alone (`:241-249`), so a viewer holding only that is also offered Arrivals and Reservations links that their gate (`FRONT_DESK_WORK`) refuses.
- Why it is wrong: same class as the Rooms `reservationsHref` fix; the menus rely on a default that is wrong on exactly the screens that did not opt in.
- Fix: call `frontDeskReach(property.propertyId)` in `reservations/page.tsx`, `close-day/page.tsx` and pass it down (Reservations table to `ReservationMenu` and the sheet; close-day to its links and `CheckOutDialog canOpenFolio`); the calendar can take `reach.folio` from its page the same way.
- note: I did not read the seeded role permission sets, so whether Front Desk lacks finance is not verified; the code path is.

### A-07 · DEAD-END · TWEAK · severity medium · verified

- Where: `features/front-office/components/undo-check-in-dialog.tsx:106-116`; strings `stayHasCharges`, `checkInDayClosed`, `checkInMoved`, `undoCheckInRefused` (`messages.ts` en ~7871-7878).
- What happens: Undo check-in refused: "Charges have been posted ... Correct the charges in Finance." / "... check them out on the departures screen." The dialog shows the sentence and nothing else; it is not given the Folio or the Property, so it cannot link. `undoCheckInRefused` ("That check-in cannot be withdrawn.") gives no reason at all.
- Why it is wrong: the refusal tells the desk where to go and does not take them.
- Fix: pass `propertyId` (all three callers have it: `columns.tsx:1403`, `:538`, sheet `:360`) and `folioId` (the row has it, `columns.tsx:1105`), and show a Folio link (gated by `reach.folio`) for `charges` and a Departures link for `dayClosed`/`moved`.

### A-08 · GATE · TWEAK · severity low · verified

- Where: Rooms `features/rooms/components/rooms-view.tsx:891` (`calendarHref`), `:898` (`maintenanceHref`) into `block-unit-dialog.tsx:174-183` and `:231-239`; compare `app/[locale]/(workspace)/rooms/page.tsx:63-95` where `housekeepingHref` and `reservationsHref` are gated and these two are not.
- What happens: Rooms is gated by `ROOM_WORK = FRONT_DESK_WORK + accommodation.configure` (`lib/screens.ts:130, 211-218`) but the room calendar by `FRONT_DESK_WORK` only (`:200-208`). A viewer who can open Rooms through `accommodation.configure` alone is offered "Show on calendar" in every room dialog and is refused on arrival. The out-of-order dialog's "Maintenance" button likewise has no maintenance gate (`MAINTENANCE_WORK`, `:144-149`) and goes to the list, not to the request it names.
- Why it is wrong: GATE class; two of the four outbound links on the screen were gated and two were not.
- Fix: in `rooms/page.tsx` compute `calendarHref` and `maintenanceHref` with `screenProperties(gateOf("room-calendar"))` / `gateOf("maintenance")`, null when not reachable, and have the dialog omit them.

### A-09 · NO-HOME · TWEAK · severity low · verified

- Where: Departures, "Left today" `features/front-office/components/live-left-today.tsx:98-168`; contract `packages/ranza/reservations/src/contracts.ts:199-220` (`DepartedStay` has no `reservationId` or `folioId`).
- What happens: the table of Guests who left names guest, reference and room, and "Needs cleaning" as a badge; none is a link. This is where the desk goes to check a Guest who "just left" owes nothing.
- Why it is wrong: entity named, no link to where it lives; the live rows above it link both.
- Fix: add `reservationId` (and `folioId`) to `DepartedStay`'s query and link the name to `reservations?open=` / the badge to `housekeeping?property=` when reachable. (A same-day departure is still on the Reservations list, `ends_on >= today`, so the sheet opens.)
- known: `docs/ux-audit/2026-10-11/departures/report.html` (asked for a room-status chip, which exists; the links were not raised).

### A-10 · DEAD-END · TWEAK · severity low · verified

- Where: `features/rooms/components/room-admits.tsx:128-131` (`admitsStillHeld`: "Somebody booked into this room, or staying in it, would no longer be admitted. Move them first, or open the room to anyone."); `block-unit-dialog.tsx:113-121` (`blockOccupied`: "Check them out first").
- What happens: the refusal says who must be moved but not who they are, and offers no route to them.
- Why it is wrong: next step named, not offered.
- Fix: add the same "Show on calendar" link the block dialog builds (`block-unit-dialog.tsx:174-183`, `calendarHref` + `&q=<room>`) under the refusal, and `departures` for the occupied block case.

### A-11 · DEAD-END · TWEAK (walk-in) / PROPOSAL (reserved) · severity low · verified

- Where: `features/rooms/components/block-unit-dialog.tsx:167-172` (`stayHref` null without a reservation) and `:130-133, 254` (reserved notice); `packages/ranza/accommodation/src/contracts.ts:100` (`reserved` carries only `arrivesOn`).
- What happens: (a) a Guest in house on a walk-in Stay has no reservation, so the Room details dialog ends at "A Guest is in this room ... check them out" with a Show on calendar link and no Departures link, where the Stay lives. (b) a reserved tile's dialog says "Reserved from 12 Nov" with no booking to open.
- Why it is wrong: same class as the fixed in-house case; two states still end flat.
- Fix: (a) when `stayHref` is null and `occupied`, offer `departures?property=` (gate it like `reservationsHref`). (b) adding `reservationId` to the reserved state is new data on a tile; it is the already-proposed `RB-S2-23` (tile opens the booking), so leave it to that row.
- known: `docs/ux-audit/2026-10-25-fix-reports/lane-04-calendar-rooms.md` (CALENDAR-10 splits the guest-name link into proposal `RB-S2-23`).

### A-12 · DEAD-END · TWEAK · severity low · verified

- Where: calendar drawer `features/room-calendar/components/bar-drawer.tsx:406-425` (`overlapNote`, `clashNote`, `clashStayNote`, `blockedNote`); calendar row header `features/room-calendar/components/calendar-grid.tsx:714-763` (room name, "Blocked / Out of service · MR-n" as plain text and tooltip).
- What happens: a booking whose room is blocked or out of order says "its check-in will be refused until it is released", and the calendar row says "Out of service · MR-12"; neither links to the Rooms tile (`rooms?property=&unit=`) where it is released, or to the request. The overlap and clash notes do not say with which booking.
- Why it is wrong: the cause is named and unreachable, on the screen whose job is to resolve it.
- Fix: in the drawer, append a "Show on room map" link built like `row-menu.tsx:194-203` to the `blockedNote`; make the row header's lock label a link to the same address. Naming the clashing booking in `overlapNote` needs the other bar's id in the read; leave that.

### A-13 · STEPS · TWEAK · severity low · verified

- Where: reservation sheet footer `features/front-office/components/reservation-detail-sheet.tsx:344-351` (the whole booking menu is a "…" button), `row-menu.tsx:146-160`.
- What happens: Change booking, Mark no-show, Cancel booking, Change departure and Move guest live only behind an unlabelled "…" in the sheet's action bar, which has room for buttons and shows only Check in / Undo as buttons.
- Why it is wrong: the sheet is where a desk reads a booking and then acts on it, and the common edit costs a hidden menu plus a click. Visible, not new behaviour.
- Fix: show Change booking (and Change departure for a stay) as an outline button beside Check in, keep Cancel and No-show in the menu (consequential, stays one step further).

### A-14 · NO-HOME · TWEAK · severity low · verified

- Where: `features/front-office/components/change-departure-dialog.tsx:325-329` (`changeDepartureBlocked`), `change-booking-dialog.tsx:~402` (`unitChipBooked` with a reference), `features/room-calendar/components/move-dialogs.tsx:50-72` (`moveConflict.booked` names a Guest and dates).
- What happens: dialogs say another booking blocks the change and give its reference or Guest as plain text.
- Why it is wrong: the blocker is named and cannot be opened; leaving the dialog loses the form, so a link would need to open in a new tab (as `check-out-dialog.tsx:117-126` does for the Folio).
- Fix: render the reference as a `target=_blank` link to `reservations?open=` (the booking is on the list by construction: it overlaps future nights).

## Checked and fine

- `front-office/page.tsx`: redirects to the first reachable child and keeps `?property=`.
- Reservations page: `mayBook`/units/`today` gating, `NoBookableUnit` with `roomsHref` gated by `accommodation.configure`; tabs, empty states, row click opens the sheet, rows are keyboard-reachable (`packages/ui/.../data-table.tsx:467-505`); highlight of a changed row.
- Row menu on Arrivals and Departures: gated by `frontDeskReach`; focus returns to the trigger after a dialog (`row-menu.tsx:125-141`); Open reservation links use `?open=` with `?property=`.
- Departures chips (all / owing / overdue / in house) keep `?property=`; filter notice has a way back; check-out dialog's Folio link is gated (`canOpenFolio`) and opens in a new tab when money is owed.
- `CheckInAction` "room not ready" two-step is inline and has a "Not now".
- Close the day dialog: form state survives a refusal (controlled reason), dismiss refreshes, no nested dialog.
- Rooms: occupied tile now leads to the stay; filters, URL mirroring of `view/admits/block`; auto refresh paused while the block dialog is open (`rooms-view.tsx:245-257`); `AddRoomsDialog` nested discard dialog is intentional; `RoomAdmits` resets its choice on open.
- Room calendar: view is mirrored in URL with `property`; failed window/refresh keeps the last grid; `QuickConfirm` is a non-modal popover and hands anything unclear to the full dialog; drawer follows its bar by key and says when it is gone; end-handle pill is visible on hover; `ListFilterNotice` uses `onShowAll`, so its `allHref` is not followed.
- ADR 0035: back button is supplied centrally by `workspace-page-bar.tsx:85-98` for every non-Today route and keeps the property; I found no page in the lane without it. Detail sheets reached by `?open=` fall back to Today rather than the list (the sheet is a modal and Escape drops the parameter), which I did not count as a defect.
