# Audit lane B: Today, Maintenance, Housekeeping, Guest Experience, Roll call, Ledger

Read at origin/main 49ae2cc4 in `/Users/pcx/Developer/ranza-rooms-open-stay`. Paths are relative to `apps/operator-workspace/src/`. Nothing was run; "verified" means read in the file.

### B-01 · DEAD-END · TWEAK · severity high · verified

- Where: Today, blocked arrivals and out-of-service rooms. `features/today/layouts/parts.tsx:190-200` (`blockerScreen`), `layouts/do-now.tsx:187-193`, `layouts/house-layout.tsx:449-458`, `layouts/next-up-layout.tsx:415-418`, `components/attention-queue.tsx:226-235`. Related prior finding: known `ux-audit/2026-10-24 TODAY-08` (same button, other wording).
- What happens: an arrival blocked by `unit_blocked` or `unit_out_of_service` gets a button "Open housekeeping". An attention item "Out of service" gets "Open board", which is Housekeeping. Housekeeping has only mark-clean/dirty/inspected and "Report a problem" (`features/housekeeping/components/columns.tsx:280-296`). It cannot lift a block or return a room from out-of-order, and it shows no reason or request number.
- Why it is wrong: this is the same defect as the Rooms "cannot block" dialog. The button promises the fix and lands on a screen that holds none of it.
- Fix: send `unit_blocked` to Rooms (`?unit=<unitId>`, handled by `app/[locale]/(workspace)/rooms/page.tsx` `targetUnitId`, where the block can be lifted). Send `unit_out_of_service` and the attention `out_of_service` item to Maintenance `?outOfOrder=1` (`maintenance-board.tsx:150`, already parsed). `UnitLabel` (`server/today-derive.ts:617`) carries no `unitId`, so add it to `ArrivalRow.unit` and `AttentionItem.unit`.

### B-02 · DEEPLINK · TWEAK · severity medium · verified

- Where: Maintenance board. `app/[locale]/(workspace)/maintenance/page.tsx:28-36` accepts only `property` and `report`. `features/maintenance/components/maintenance-board.tsx:131` keeps `selectedId` in local state. Callers: `features/today/components/attention-queue.tsx:174-179`, `maintenance-card.tsx`, `open-work-card.tsx`. Related prior finding: known `ux-audit/2026-10-11 MAINT-06`, TD-DEF-09.
- What happens: Today's attention item "MT-12 Leaking pipe, room 204" (urgent or overdue return) opens the whole board. The reader has to find MT-12 among four columns. Rooms (`rooms-view.tsx:177`) links to Maintenance the same way, so the missing parameter hurts more than one lane.
- Why it is wrong: the item names a request and the link does not go to it.
- Fix: add `?request=<number>` to `maintenance/page.tsx`, resolve it against `board.requests`, and pass it as the initial `selectedId`. `AttentionRequest.number` already exists (`server/today-derive.ts:362`). Ignore an unknown number, strip the parameter on close as `onReportingChange` does for `report` (`maintenance-board.tsx:226-237`), and keep it across a refresh.

### B-03 · NO-HOME · TWEAK · severity medium · verified

- Where: Maintenance. `features/maintenance/components/equipment-register.tsx:180-184` (open fault "MT-n" as plain text). `service-plan.tsx:95-101` (badge "Work order MT-n open"). `outcome-message.tsx:22` ("Reported MT-n"). `report-dialog.tsx:206-218` ("Already open for this room: MT-n · title · state").
- What happens: four places name a request number and none opens it. The report dialog's warning that a room already has an open request is the point where the reader most wants to open that request and does not report a duplicate. Equipment and Plan are separate tabs (`maintenance-board.tsx:402-414`, uncontrolled `Tabs defaultValue="requests"`), so the request is a tab switch plus a card hunt away.
- Why it is wrong: facts about a request with no way into the request.
- Fix: make each number a button that calls a board-level `openRequest(requestId)`, which switches to the Requests tab (control `Tabs` with `value`) and sets `selectedId`. In the report dialog it first closes the dialog. The items already carry `requestId` (`board.requests`, `openRequests` prop). The work-order badge and `item.openFault` need the id exposed; check `EquipmentItem`.

### B-04 · DEAD-END · TWEAK · severity medium · verified

- Where: Guest Experience. `features/guest-experience/components/guest-experience-view.tsx:70,98-111` (Urgent tile toggles `urgentOnly`). `features/guest-experience/components/requests-table.tsx:153-158` (`showAll`) and `:176-191` (empty state).
- What happens: pressing the "Urgent open" tile filters the list. If nothing matches, or the reader is on the Resolved tab, the empty state offers "Show all", whose handler resets tab, query, assignee and category but not `urgentOnly`. That state lives in the parent and arrives as a prop. The button appears to do nothing and the list stays empty. The only way out is to find the tile again. The tile is a bare `<button>` around a `Stat` and its `title` exists only once the filter is on (`:99`), so the gesture also has no visible affordance.
- Why it is wrong: the empty state's escape hatch cannot clear the filter that caused it. The filter has no visible control.
- Fix: lift `urgentOnly` handling so `showAll` clears it (pass `onClearUrgent`, or move the state into `RequestsTable`). Show the filter as a removable chip beside the tabs, as the other filters are, and add a pressed style or hint on the tile.

### B-05 · DEEPLINK · TWEAK · severity medium · verified

- Where: Ledger. `app/[locale]/(workspace)/ledger/page.tsx:149-152,168` (`withoutCursor` is passed to `JournalTable` as `search`). `features/ledger/components/journal-table.tsx:107-110` (entry link built from it). Back goes to the list via `DETAIL_KEYS` (`workspace-page-bar.tsx:23`).
- What happens: the reader pages "Older" three times, opens an entry, and Back returns to the newest page, not the page they were on, because the entry link does not carry `cursor`.
- Why it is wrong: ADR 0035 Back should return to the list the reader came from; position is lost.
- Fix: build the entry href from `{ ...search, cursor: search.cursor, entry }`. Keep `withoutCursor` only for `olderHref` and `newestHref`.

### B-06 · DEEPLINK · TWEAK · severity medium · verified

- Where: Today roll-call card `features/today/components/roll-call-card.tsx:20-24,88-95`; Roll call page `app/[locale]/(workspace)/roll-call/page.tsx:27-33` (takes only `property`); filter state `features/attendance/components/roll-call-view.tsx:99` (`useState<RollFilter>("all")`).
- What happens: the card shows "On leave 2 / Missing 3 / Not called 5" and all three open the same unfiltered roll call. The card's doc comment says the screen "takes no narrowing", but the screen's five figures are filter buttons (`figures-strip.tsx:57-88`, LA-S2-04). From "Missing 3" the warden presses Missing again.
- Why it is wrong: the card tells the reader the figure opens the people it counts and lands on the full list.
- Fix: accept `?show=on_leave|absent|not_called` in `roll-call/page.tsx`, validated against `NightStatus`, and pass it as the initial `filter` to `RollCallView`. Add `show` to `todayHref` calls in `roll-call-card.tsx`. Fix the stale comment.

### B-07 · NO-HOME · TWEAK · severity medium · verified

- Where: Today. `features/today/components/movements-card.tsx:273,380` (every arrival and departure row links to `href`/the list). `features/today/components/clean-first-card.tsx:104-111` (every row links to the whole board). `components/attention-queue.tsx` (item names room and guest, opens a list).
- What happens: a row reads "Ayşe Demir · 204 · Not ready" and pressing it opens the Arrivals list. The reader has to find Ayşe again among the rows. Clean-first rows open the Housekeeping board, which has no per-room target.
- Why it is wrong: the entity is named and its link goes to a list. The row comment (TD-S1-22) chose the list on purpose, but `ArrivalRow.reservationId` and `DepartureRow.folioId` are already in the row and are unused for navigation.
- Fix: arrival rows to `reservations?open=<reservationId>` (supported, `reservations/page.tsx:146`). Departure rows with `folioId` to `finance?folio=<folioId>` as `money-cards.tsx:67-69` already does. Keep the list as the "All N" link. The Arrivals list carries the Check in button, so keep that beside the row. Likely needs the owner's nod because it reverses TD-S1-22's wording; still a link-target tweak.

### B-08 · DEAD-END · TWEAK · severity medium · verified

- Where: Today House layout, room detail `features/today/layouts/house-layout.tsx:535-578`.
- What happens: pressing an occupied tile shows "In house: Ayşe Demir, leaves 12 Nov" and nothing else; a room with `state === "in_house"` and no `endsOn` shows an empty line. An out-of-service tile shows `outOfServiceNote` with no link. Only dirty/awaiting rooms get "Open housekeeping", and only ready rooms with `mayBook` get a link.
- Why it is wrong: this is the Rooms occupied-tile defect again, on Today.
- Fix: for an in-house tile link to the stay (`reservations?open=`, gated by the same `screenProperties(gateOf("reservations"))` test as `rooms/page.tsx:73-80`; `DeskRoom` needs the reservation id) and to Departures for the folio. For out of service link to Maintenance `?outOfOrder=1`.

### B-09 · LABEL · TWEAK · severity medium · verified

- Where: `features/today/components/today-header.tsx:115-122` and `features/today/layouts/house-layout.tsx:565-571` ("New booking"). Prior finding: none found.
- What happens: "New booking" opens the Reservations list, not the new-booking dialog. `reservations/page.tsx:136` opens the dialog only when `?new=1`, which these links do not send. The desk's most frequent job costs an extra click.
- Why it is wrong: a verb label that lands one step short.
- Fix: add `new: "1"` in the `todayHref(...)` extra for both links (`todayHref` takes `extra`, `features/today/links.ts`).

### B-10 · NO-HOME · TWEAK · severity medium · verified

- Where: Housekeeping rows. `features/housekeeping/components/columns.tsx:143-157` (room name), `:52-60,121-134` (`DayBadge`, `OccupancyBadge`). Prior finding: known `ux-audit/2026-10-24 HOUSEKEEPING-16` (request or fault not shown on the row).
- What happens: a room row shows "Out of service", "Arriving", "Leaving" and "In house" badges, none of which link anywhere, and the room name does not open Rooms. Out of service gives no reason or request number. The reader of a "Leaving" row cannot reach the stay.
- Why it is wrong: facts about a booking or hold with no way to the thing.
- Fix: room name to `rooms?unit=<unitId>` where the viewer may open Rooms (compute the href in `housekeeping/page.tsx` like `reportHref`). Out of service badge to Maintenance `?outOfOrder=1` when the viewer may open it. Arrival/leaving badge to `reservations?open=` (the id is in `days`/arrival rows read at `housekeeping/page.tsx:79-84`).

### B-11 · NO-HOME · TWEAK · severity low · verified

- Where: Maintenance request sheet `features/maintenance/components/request-sheet.tsx:249-258` (`where` fact), `request-money.tsx:194-205` (charge lines).
- What happens: the room or bed and equipment a request is about are plain text; posted charge lines show amount and guest with no Folio link.
- Why it is wrong: the sheet names a room and a guest with no route to them.
- Fix: room to Rooms `?unit=<request.unit.unitId>` (available), gated as in `rooms/page.tsx:73-80`; pass a nullable `roomsHref` prop as `block-unit-dialog.tsx` does. Charge lines need `folioId` added to the line to link to `finance?folio=`.

### B-12 · NO-HOME · TWEAK · severity medium · verified

- Where: `features/maintenance/components/impact-notice.tsx:50-58` (in-house list), `packages/ranza/maintenance/src/contracts.ts:183-188` (`OutOfOrderImpact.inHouse` has no reservation or stay id).
- What happens: taking a room out of order lists the guest in it ("Ayşe Demir is in 204 until 12 Nov"). The booking rows below get a "Change booking" link; the in-house rows get nothing. The desk must leave the form and find the guest by hand.
- Why it is wrong: the more urgent half of the warning is the half without a way forward.
- Fix: add `reservationId` (and `mayAmend`) to `inHouse` entries as `reservations` already has, and offer the same new-tab link (`reservations?open=`).

### B-13 · GATE · TWEAK · severity low · inferred

- Where: Today. `server/today-derive.ts:549-585` (`needsFor`: arrivals/departures/units read for `manager` focus; `rooms` read on the capability, not the permission), against `lib/screens.ts:48-65,180-250` (screen permissions). Links in `today-dashboard.tsx` (`Tiles`) and `rooms-card.tsx`.
- What happens: a composed role with `staff.administer` or `audit.read` but no front-desk commands gets the Arrivals, Departures and Rooms tiles; one with a capability but not `housekeeping.update_status` gets the Rooms card. Their links lead to `ScreenDenied`. Migration `20260916003100` gives `housekeeping.update_status` to all four shipped roles, so only custom roles are affected.
- Why it is wrong: a link is offered to a viewer who cannot open it.
- Fix: derive the link or tile from the destination's gate (`gateOf(...)` against the viewer's permissions, as `rooms/page.tsx:73-80` does) or render the figure unlinked. I did not read the permission set of any real composed role.

### B-14 · STEPS · TWEAK · severity low · verified

- Where: Guest Experience create dialog `features/guest-experience/components/create-request-dialog.tsx:80-90`, list `requests-table.tsx` (tab/assignee/category state).
- What happens: after "Submit" the dialog closes with no message. If the reader is on the Resolved tab or filtered to "Mine", the new request is not visible, so they cannot tell whether it saved.
- Why it is wrong: the page confirms nothing when the result is hidden by the current view.
- Fix: on `done` show a short "Request #N logged" status with an "Open requests" action that sets tab to Open and clears the filters (`showAll`-style).

### B-15 · LABEL · TWEAK · severity low · verified

- Where: Roll call leaves list `features/attendance/components/roll-call-view.tsx:349`.
- What happens: `leave.residentName ?? leave.stayId` prints a raw UUID when the name is missing.
- Why it is wrong: an internal id shown as a name.
- Fix: fall back to the room/bed (`placeOf`) as `roll-call-row.tsx:61` does, via a lookup in `rows`.

### B-16 · NO-HOME · TWEAK · severity low · verified

- Where: Ledger accounts tab `features/ledger/components/accounts-table.tsx:61-83`; entry lines `features/ledger/components/entry-panel.tsx:103-112`.
- What happens: a balance on the Accounts tab and an account on an entry's lines cannot be traced to the entries behind them, though the journal already filters by `?account=` (`features/ledger/query.ts:34`, `ledgerHref`).
- Why it is wrong: a figure with no route to its explanation.
- Fix: make the account cell a link to `ledgerHref(route, propertyId, { account: balance.accountId, from, to, currency })`; entry lines the same.

### B-17 · OTHER (hooks order) · TWEAK · severity low · verified

- Where: `features/today/components/booked-ahead-card.tsx:80-89`.
- What happens: `Line` returns early when `nights` are all unused and then calls `useState` below it. The summary refetches every 60 s (`today-dashboard.tsx`); if a refresh moves a Property from "no units in use" to some, React throws "Rendered more hooks than during the previous render" and the card's error boundary takes the page (inferred). Not a routing defect; found while tracing the card's link.
- Why it is wrong: conditional hook call.
- Fix: move the `useState` above the early return.

## Checked and fine

- Today tiles and `StatTile` (`today-dashboard.tsx`, `stat-tile.tsx`): every link carries `?property=` via `todayHref`; filter keys (`show=owing|overdue_owing|open|to_come|in_service|...`) all exist in `features/today/views.ts` and in the receiving pages' parsers; RTL arrows use `rtl:rotate-180`.
- Money lists and charges/overdue cards: folio links reach `finance?folio=` (`finance/page.tsx:91`), `show=overdue` handled.
- Activity card: `audit-log?record=` rows, `record` is a Back detail key.
- Empty-beds card and Rooms card filter links: `show/admits/block/floor` all parsed by `rooms/page.tsx` and `housekeeping/page.tsx`.
- Organization strip: deliberate full load; remembers the Property.
- Movements card: tablist with arrow keys, check-in/out buttons beside the row link rather than nested.
- Maintenance: report dialog keeps its draft on a refused submit and warns per room; `?report=` is stripped on close; the request sheet's out-of-order flow shows impact before the press; the board refreshes on tab return; cancel-while-holding explains why it is disabled; filters live in the URL.
- Housekeeping board: narrowing notice "Show all" link keeps `?property=`; `reportHref` is offered only if `maintenance.mayReport`; stayover cards use optimistic mark/undo.
- Guest Experience: resolve/cancel dialogs keep what was typed on refusal; refusal reason is lifted out of the row.
- Roll call: optimistic marks revert with reason; keyboard path exists; give-leave dialog prefills from the row and unmounts its form on close.
- Ledger: `?entry=` is id-based and states "not found" for absent or unreadable; Folio link only when openable; filters and pages are URL state.
- Back button: provided centrally by `workspace-page-bar.tsx:96-98` for every non-Today page, with `entry`, `folio`, `record` as detail keys keeping the query.
