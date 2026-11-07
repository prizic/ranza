# Lane C audit: staff/HR, finance, analytics, configuration, export, integrations, audit log, portfolio, branding, guest portal

Paths are relative to `/Users/pcx/Developer/ranza-rooms-open-stay/apps/`. `W` = `operator-workspace/src`, `P` = `guest-portal/src`.
All findings are read from code at origin/main 49ae2cc4; nothing was run.

### C-01 · DEAD-END · TWEAK · severity high · verified

- Where: guest portal, every signed-in page, `P/app/[locale]/(portal)/layout.tsx:76` and `:105`
- What happens: the Resident sees an avatar in the bar and the rail. It looks like an account menu, but pressing it does nothing, and there is no Sign out anywhere in the portal (`grep sign-out` in `P/` finds it only inside the invite form).
- Why it is wrong: `AccountMenu` renders a plain inert avatar when it has no children (`packages/ui/src/components/account-menu.tsx:~72`), so a Resident on a shared dormitory computer or phone cannot end the session; the workspace fixed exactly this as SIGN-01.
- Fix: pass the workspace's sign-out menu item (`W/app/[locale]/(workspace)/sign-out-item.tsx`, posts `/api/auth/sign-out`, then a full load to sign-in) as `AccountMenu` children in the portal layout. The owner may treat adding it to the portal as a PROPOSAL; the action itself already exists.

### C-02 · NO-HOME · TWEAK · severity medium · verified

- Where: Audit log list and record, `W/features/audit-log/components/audit-table.tsx:275-280`, `W/features/audit-log/links.ts:8-12` and `:27-43`, `record-panel.tsx:46-52`
- What happens: a record about a reservation or a stay shows "Reservation · R-1234" that opens the audit log narrowed to that subject. It never opens the booking. In the record panel the subject is not even a link, only the small "history" link under it.
- Why it is wrong: `links.ts` says "a reservation and a stay are not shown alone anywhere", which is stale: Reservations opens one booking by `?open=<reservationId>` (`W/app/[locale]/(workspace)/reservations/page.tsx:146`, and Analytics already uses it, `day-detail-sheet.tsx:215`).
- Fix: add `reservations` to `SubjectReach`, computed in `subjectReach()` (`audit-log/page.tsx:296`) with `screenProperties(gateOf("reservations"))` like the other four, and return `reservations?property=…&open=<id>` for `reservation` in `subjectHref`. Keep the history link as the second link. A `stay` subject has no booking id on the entry, so it keeps the history fallback.

### C-03 · NO-HOME · TWEAK · severity medium · verified

- Where: Audit log, `W/features/audit-log/links.ts:27-43`; subject types in `W/features/audit-log/actions.ts:156-177`
- What happens: only 5 of the 20 known subject types can open anywhere (folio, room or bed, property, organization, data export). `employee`, `leave_request`, `payroll_run`, `membership`, `role`, `business_day_close`, `maintenance_request`, `maintenance_equipment`, `webhook_endpoint`, `failed_operation`, `organization_brand` and `payment_plan` render as plain text although each has a screen.
- Why it is wrong: the log is where a manager lands asking "who did this to what", and the thing it names has a home that is one click away for anyone who can open it.
- Fix: extend `subjectHref` and `SubjectReach` with the screens `hr` (tab by type), `people`, `close-day`, `maintenance`, `integrations`, `branding`, each gated by `screenProperties(gateOf(..))` as `subjectReach()` already does. Screen-level links only; do not invent deep links the targets lack.

### C-04 · NO-HOME · TWEAK · severity medium · verified

- Where: Audit record detail table, `W/features/audit-log/components/context-facts.tsx:235-243` (`scalar`) and `:419-433`; keys in `context-keys.ts` (`stayId`, `reservationId`, `folioId`, `accommodationUnitId`, `fromUnitId`, `toUnitId`, `guestId`, `employeeId`, `userId`)
- What happens: the details table resolves each id to a name via `words.name(id)` and prints it as text. A check-out record names its Folio, its room and its booking, none of them links.
- Why it is wrong: the facts exist so a reader can follow what happened; naming a folio or a room and not linking it makes the reader search for it.
- Fix: pass `locale`, `propertyId` and `reach` into `ContextFacts` (`record-panel.tsx:120`) and wrap `folioId` / `accommodationUnitId` / `fromUnitId` / `toUnitId` / `reservationId` in the same `subjectHref` result as C-02/C-03. Guest and stay ids stay text (no screen shows them alone).

### C-05 · NO-HOME · TWEAK · severity medium · verified

- Where: Finance, Today's overdue figure view `?show=overdue`, `W/features/finance/components/overdue-residents.tsx:40-57`, route `W/app/[locale]/(workspace)/finance/page.tsx:152-168`
- What happens: the list names each Resident who is overdue, with the amount and the oldest due date, and nothing opens. The row has the `reservationId` (`getRowId`, `:131`) but the name is plain text and the page computes no Reservations reach.
- Why it is wrong: this is the screen for chasing money, and the person to chase has no link to their booking (where the payment plan lives) or their folio.
- Fix: compute `reservationsHref` in the `show === "overdue"` branch exactly as `analytics/page.tsx:97-107` does and link the name to `${reservationsHref}&open=${reservationId}`; render plain text when null.

### C-06 · DEAD-END · TWEAK · severity medium · verified

- Where: Guest portal invitation link, refused state, `P/app/[locale]/invite/[token]/invite-form.tsx:225-240`; copy `P/messages.ts:385-388`
- What happens: a Resident signed in as the wrong account opens their invitation and is refused with "This account is connected to someone else. Create an account with a different email, or ask the front desk". The only button is "Go to my stay", which opens the wrong person's stay.
- Why it is wrong: the copy tells them to switch account and the screen offers no way to do it; the sign-out button (`useAnotherAccount`, `:205-218`) exists only in the pre-refusal view, which the refused view replaces.
- Fix: in the refused view, for `another_guest`, render the existing `useAnotherAccount` button, and have it clear `refused` (`setRefused(null)`) so the form reappears in sign-in/create mode.

### C-07 · GATE · TWEAK · severity medium · verified

- Where: Configuration, "Managed on their own screens" card, `W/app/[locale]/(workspace)/configuration/page.tsx:134-135` and `:269-271`, `W/features/configuration/components/overview-cards.tsx:78-92`
- What happens: Rooms and People links are offered whenever the Property has `front_desk` or `staff_administration` switched on. A Manager who may configure but holds none of the staff permissions is offered People and lands on a denial; likewise Rooms for a role without room work.
- Why it is wrong: `showRooms`/`showPeople` check only the capability, not the viewer's permission (the gates are `ROOM_WORK` / `STAFF_WORK`, `lib/screens.ts:~100,355`). This is the `rooms/page.tsx:71-72` pattern done halfway.
- Fix: compute both with `screenProperties(gateOf("rooms"))` and `screenProperties(gateOf("people"))` filtered to this Property, as `rooms/page.tsx` does for `reservationsHref`.

### C-08 · GATE · TWEAK · severity medium · verified

- Where: HR, three links to People: `W/features/hr/components/hr-view.tsx:62-67` (always shown), `employees-table.tsx:305-319` ("Has a login" on each row), `terminate-employee-dialog.tsx:107-113` (in the End employment dialog)
- What happens: an HR manager (role holds `hr.view`/`hr.manage`) is shown "Staff & permissions" links on every HR tab and in the End employment dialog. If the role lacks `staff.administer` and `staff.define_roles` (People's gate, `lib/screens.ts:349-358`) each lands on a permission denial.
- Why it is wrong: the links are unconditional and `hr/page.tsx` computes no People reach. The End employment dialog is the worst place: it tells the user to go and remove login access there, a step they may not be able to take.
- Fix: compute `peopleHref` once in `hr/page.tsx` via `screenProperties(gateOf("people"))` (null when the Property is not in the list) and pass it down; when null show the same sentence without the link (and in the dialog name who can).

### C-09 · GATE · TWEAK · severity low · verified (module part inferred)

- Where: People, "HR & payroll" pointer, `W/app/[locale]/(workspace)/people/page.tsx:87` and `:155-165`
- What happens: the pointer is shown when the Organization-wide check `holds("hr.view")` passes. HR also needs the `human_resources` module and the `staff_administration` capability at the Property (`lib/screens.ts:362-375`), and the link carries `home.propertyId`. An Organization without the HR module, or a Property that lacks it, gets a link to a "not enabled" refusal.
- Why it is wrong: `permittedProperties("hr.view")` asks the permission only; the page's own gate is `gateOf("hr")`.
- Fix: replace `mayViewHr` for the link with `(await screenProperties(gateOf("hr"))).some(p => p.propertyId === home.propertyId)`. `employmentOfLogins` can keep its own check.

### C-10 · GATE · TWEAK · severity low · inferred

- Where: Portfolio cards and table, `W/features/portfolio/components/property-card.tsx:60-69`, `:93-110`, `property-table.tsx:38-53`, `:144-160`; component `property-link.tsx:6-14`
- What happens: Arrivals, Departures, Maintenance and Money-owed figures are links to those screens at each Property. A count of `null` (module off at that Property) is already "not available", but a viewer whose role cannot open the destination (analytics holders without front-desk or maintenance permissions) still gets a link that ends in a denial.
- Why it is wrong: `property-link.tsx` documents "a screen that is switched off turns the viewer away itself; nothing here decides that", which holds for the Property case but not the role case. Inferred because I did not read what `portfolio()` nulls per role.
- Fix: have `portfolio/page.tsx` pass, per Property, which of the four segments the viewer reaches (`screenProperties(gateOf(segment))`) and render the figure as plain text when it does not.

### C-11 · LABEL · TWEAK · severity low · verified

- Where: Finance folio detail, `W/app/[locale]/(workspace)/finance/page.tsx:114-117` and `:128`
- What happens: for a viewer who reaches several Properties, opening `?folio=` of a Folio at another Property shows the sub-heading of the active `?property=` ("Hotel A") above a folio that is at Hotel B; the back button then returns to Hotel A's list.
- Why it is wrong: `folioProperty` is already resolved two lines above (and used for the time zone) but the heading uses `property.propertyName`.
- Fix: print `folioProperty.propertyName` at `:128`.

### C-12 · DEAD-END · TWEAK · severity low · verified · known: `2026-10-24/finance-analytics-portfolio` FINANCE-08

- Where: Finance folio, unpriced booking note, `W/features/finance/components/folio-panel.tsx:243-247`; copy `finance.nightsUnpriced`
- What happens: "This booking has no price… Add a price to the booking from the Reservations screen." is plain text. The booking link exists only as the small "Reservation REF" reference at the top (`:178-192`), and only when the folio has a reference.
- Why it is wrong: the sentence names the next step and the link to it is elsewhere, so the shortest path is two eye-moves away (and absent without a reference).
- Fix: make the sentence's "Reservations" a link to `reservationHref` (`folio-panel.tsx:137-140`, built from `folio.reservationId`, not the reference) when `mayOpenReservation`.

### C-13 · DEAD-END · TWEAK · severity low · verified (frequency inferred)

- Where: People header, `W/app/[locale]/(workspace)/people/page.tsx:114`
- What happens: when a viewer holds `staff.administer` but `invitableRoles` is empty, the Invite button is not rendered and nothing says why (`staff.readOnly` appears only when the viewer holds neither permission, `:151-156`).
- Why it is wrong: a missing button with no reason reads as broken; the dialog's own `rolesWithheld` note never gets drawn.
- Fix: when `mayAdminister && invitableRoles.length === 0`, show one muted line "Your role cannot invite anyone at your level or above" in the same place, as the disabled-button-reason pattern from DATA-12.

### C-14 · NO-HOME · TWEAK · severity low · verified

- Where: Staff roster, `W/features/staff/components/roster-table.tsx:413-433`
- What happens: a member whose employment ended gets a warning badge "Left HR on 5 Oct" (the cue to revoke login). The employee's name from HR is shown but neither the badge nor the name leads to HR.
- Why it is wrong: the warning exists to prompt action at the People row (revoke is in the row menu, which is fine), but the record that explains it is one invisible step away.
- Fix: when HR is reachable (see C-09 fix), make the badge a link to `hr?property=…&tab=employees`.

### C-15 · STEPS · PROPOSAL · severity low · verified

- Where: Analytics, "Nights with no charge" section, `W/features/analytics/components/uncharged-section.tsx:33-58`; copy `unchargedAction`
- What happens: the section lists counts per reason (no price, no folio, closed folio…) and says "Open a day from the table to see which bookings, then open a booking to add its price." Three steps and no link to the first.
- Why it is wrong: it knows the nights are uncharged but not which days, so it cannot link; the reader hunts the days table for them.
- Fix: propose adding the first affected day (or a day list per reason) to `UnchargedNights` so each row links to `?day=` (Mews and Opera Cloud reconcile revenue exceptions this way). Needs a read change, so owner approval.

### C-16 · DEEPLINK · TWEAK · severity low · verified

- Where: Audit log subject links, `W/features/audit-log/links.ts:34-39`
- What happens: a `data_export` record opens Data export at its default tab, not the export; `property` and `organization` records open Configuration at the top, not the section.
- Why it is wrong: the data-export screen already has a "show this run" mechanism (`shownRun`, `data-export-view.tsx:96-98,176-179`) and Configuration has section anchors, but the log passes no target.
- Fix: for `data_export`, accept `?show=<exportId>` in `data-export/page.tsx` and seed `shownRun`/`panel`; for `property`, append `#property`. Low value, listed for completeness.

### C-17 · DEAD-END · TWEAK · severity low · verified

- Where: Finance folio, in-house note, `W/features/finance/components/folio-panel.tsx:381-395`
- What happens: "The Guest is still in house, so the Folio stays open… It can be closed after check-out." is the only content where Close would be; there is no link to the Departures list or the stay.
- Why it is wrong: the reason is right, but the next action (check the Guest out) is on another screen with no pointer.
- Fix: link "check-out" to `departures?property=…` when the viewer reaches it (`gateOf("departures")`), plain text otherwise.

### C-18 · NO-HOME · TWEAK · severity low · verified

- Where: Configuration, "What this Property uses", `W/features/configuration/components/overview-cards.tsx:41-55`
- What happens: the card lists the switched-on modules as inert tiles with icons, in the same grid style as the link tiles in the card below.
- Why it is wrong: tiles that look like destinations and are not links; each is a rail screen the viewer may or may not open.
- Fix: link the tiles the viewer reaches (same gate as C-07) or drop the tile styling; low priority.

### C-19 · STEPS · PROPOSAL · severity low · verified

- Where: Integrations endpoint cards, `W/features/integrations/components/endpoint-cards.tsx:105-113`
- What happens: each card shows "Open failures N" and the failures table above names the endpoint per row, with no way to narrow the table to one endpoint.
- Why it is wrong: with several endpoints the number on the card cannot be followed to its rows.
- Fix: propose `?endpoint=<id>` on Integrations with the card's count linking to it (Stripe and Mews webhook consoles do this). New behaviour, so a proposal.

## Checked and fine

- Audit log: `?record=` back keeps filters via `DETAIL_KEYS` and `listParams` (`workspace-page-bar.tsx:27,69-77`); filters submit by GET and keep `property`/`subject` (`audit-filters.tsx:102-107`); paging links keep every filter (`audit-log/page.tsx:178-189`); export link is gated on screen and permission (`:206-218`); folio and room subject links gated by `reach`.
- Finance: folio list rows link by `folioHref` that keeps `?show=` (`columns.tsx:67-72`); back from a folio keeps tab and property; `reservationHref`, audit link and charge/payment/reverse buttons are individually gated (`finance/page.tsx:95-130`); unknown or forbidden `?folio=` falls through to one notice (`folio-not-found.tsx`); ChargeForm, PaymentDialog, ReverseDialog, CloseDialog each have their own state reset on success.
- Analytics: month/range/day links all go through `analyticsHref` (keeps `property`, drops stale day); the day sheet links to booking and folio only where reachable (`day-detail-sheet.tsx:205-231`), closes with focus back on the row, steps day to day with `replace`; chevrons mirror with `rtl:rotate-180`.
- Staff: retire role with holders is not a dead end (`HoldersOf` → `onShowHolders` switches tab and sets the role filter, `permission-matrix.tsx:572-581`); role-change confirm explains each refusal and keeps focus; roster empty/no-match states offer "show all".
- HR: tab, period and week in the URL (`hr-view.tsx:36-41`, `openingTab`); payroll blockers each have a next step (`payroll-card.tsx:263-292`); "Go to employees" empty states on rota, leave and payroll; payslip sheet and leave/approve dialogs are single-level.
- Configuration: unsaved-changes guard on every card (`save-bar.tsx:42-46`); refusal copy explains stale, currency-fixed and closed-day; section nav is hash anchors.
- Data export: audit log hand-off prefills `?dataset=&from=&to=`; "request again" prefill; schedule "show run"; download refusals explain themselves (`recent-exports-table.tsx:298-316`); polling uses `router.refresh()` and keeps client state.
- Integrations: view/page in URL with clamp for a vanished page; add-endpoint dialog sits in one place so the new secret survives; retry-all and endpoint-remove dialogs are single-level.
- Portfolio: sort/view links keep `property` (`portfolio-controls.tsx:17`); one-Property case offers People only if the viewer reaches it (`portfolio/page.tsx:97-103`); `OpenProperty` remembers the Property and does a full load.
- Branding: unsaved guard, reset has a confirm dialog, reach refusal says who can.
- Guest portal: not-found, invite refusals (other than C-06), help pages and sign-in offer the way on that this visitor can use; error boundary retries; language switch keeps invite token and reset query (`help-page.tsx`).
