# Lane D — routing and navigation layer (origin/main 49ae2cc4)

Paths are under `/Users/pcx/Developer/ranza-rooms-open-stay/apps/operator-workspace/src/` unless absolute. `(ws)` = `app/[locale]/(workspace)`.
Prior audit checked (`docs/ux-audit`): nothing below is listed there except where marked `known:`.

### D-01 · BACK · TWEAK · severity medium · verified

- Where: every inner page's back button, every `ScreenRefusal` "Go to Today", the rail brand/root link. `(ws)/workspace-page-bar.tsx:81` (`rootHref`), `(ws)/screen-denied.tsx:35`, `(ws)/inventory/page.tsx:63`, `(ws)/food-and-beverage/page.tsx:63`, `(ws)/layout.tsx:182`
- What happens: a Staff Member working at a Property where Today is switched off (the layout and `switchTarget` both say this exists: `layout.tsx` "a Property can have Today without the front desk", `lib/property-choice.ts` `switchTarget`) presses Back on, say, Housekeeping. Back always points at `/today?property=P`. `today/page.tsx:77-79` finds P is not in Today's list and redirects to bare `/today`, which picks the remembered/first Today Property, Q. The person lands on another Property's day and the switcher now names Q. A Property switch nobody asked for, from the one control ADR 0035 says must keep the Property. "Go to Today" in refusals and the Soon screens does the same (and the refusal one also drops `?property=` entirely).
- Why it is wrong: the rail already hides Today at P (`lib/nav.ts` `open()`), but the back arrow and the refusal button ignore `segmentsByProperty`, so they lead somewhere other than the stated parent.
- Fix: in `WorkspacePageBar` (it already receives `segmentsByProperty`) pick the up target with `switchTarget(undefined, segmentsByProperty[property])` (`lib/property-choice.ts`) when `"today"` is not in that list; do the same inside `ScreenRefusal` by passing the Property and the open segments, so the button reads the same as the rail.

### D-02 · DEAD-END · TWEAK · severity medium · verified

- Where: `(ws)/data-export/error.tsx:30`, `(ws)/portfolio/error.tsx:31`, `(ws)/room-calendar/error.tsx:30`, `(ws)/branding/error.tsx:30` versus `app/[locale]/route-error.tsx:25-29`
- What happens: when one of these four pages fails to render on the server, the screen shows a "Try again" button wired to the bare `reset`. The shared `RouteError` documents why that does nothing for a Server Component failure ("not undone by drawing the same payload again: the route is fetched afresh") and calls `router.refresh()` first. These four do not, so the button re-renders the same cached failure; the person keeps pressing it and the only exit is the rail.
- Why it is wrong: the retry affordance exists but cannot succeed for the failure class (database blip) the screens' own comments say they are for.
- Fix: delete the four bespoke `error.tsx` files, or make each render `RouteError` (`app/[locale]/route-error.tsx`) with its `event` name (`data_export.render_failed` etc.) and its own title/description keys; `(ws)/error.tsx` already shows the pattern.

### D-03 · GATE · TWEAK · severity medium · verified

- Where: Arrivals, "New booking" button, `(ws)/arrivals/page.tsx:116-123`; target `(ws)/reservations/page.tsx:103-120`
- What happens: the button is offered to everyone who can open Arrivals (`FRONT_DESK_WORK`: any of book, check in, check out, cancel, amend). A person who holds `front_desk.check_in` but not `front_desk.book` presses it, lands on `/reservations?new=1`, and sees a list with no dialog and no sentence about why: Reservations renders `!mayBook ? null` and ignores `?new=1`.
- Why it is wrong: a button offered to a viewer who cannot do what it promises, ending in a silent no-op deep link.
- Fix: in the Arrivals page compute `mayBook` the way Reservations does (`permittedProperties("front_desk.book")`, `reservations/page.tsx:99-101`) and render the button only when it holds.

### D-04 · GATE · TWEAK · severity medium · verified (existence of a role without the permission: inferred)

- Where: Configuration, "Elsewhere" card, `(ws)/configuration/page.tsx:125-135` (`showRooms`, `showPeople`) and `features/configuration/components/overview-cards.tsx:81-92`
- What happens: Rooms and People links are shown when the capability is on at the Property (`isOn("front_desk")`, `isOn("staff_administration")`). Configuration itself opens for `configuration.manage`, `accommodation.configure` or `rates.manage` (`lib/screens.ts` `CONFIGURATION_WORK`); Rooms needs `ROOM_WORK` and People needs `staff.administer`/`staff.define_roles`. A viewer with, for example, `rates.manage` only sees a "People" tile that opens a "your role cannot open this page" refusal.
- Why it is wrong: the link is offered by the capability gate alone; the page's own gate (rooms/page.tsx:51-52) also asks the permission.
- Fix: replace `isOn(...)` for these two with `screenProperties(gateOf("rooms"))` / `screenProperties(gateOf("people"))` filtered to the Property, exactly as `rooms/page.tsx:86-91` does for `hasHousekeeping`.

### D-05 · GATE · TWEAK · severity medium · verified

- Where: People, the "Human Resources" pointer, `(ws)/people/page.tsx:112,155-165`
- What happens: `mayViewHr = holds("hr.view")` is `permittedProperties("hr.view")` with no module and no capability and it matches on Organization, not on this Property. The HR screen's gate (`lib/screens.ts` segment `hr`) also needs the `human_resources` module bought and `staff_administration` on at the Property. An Organization without Human Resources, or a Property where it is off, shows the pointer to a person with `hr.view`, which opens "This module is not in your Subscription".
- Why it is wrong: a link built by hand from a weaker check than the destination's own gate.
- Fix: `const mayViewHr = (await screenProperties(gateOf("hr"))).some(p => p.propertyId === home.propertyId)`. Keep `employmentOfLogins` on the same boolean.

### D-06 · GATE · TWEAK · severity low · verified

- Where: HR, three links to People with no gate check: `features/hr/components/hr-view.tsx:63-67`, `features/hr/components/employees-table.tsx:309-312` ("has login"), `features/hr/components/terminate-employee-dialog.tsx:108-112`. People needs `staff.administer` or `staff.define_roles`; HR needs only `hr.view`.
- What happens: an HR-only viewer sees "See People", a key-icon link per employee and a link inside the terminate dialog, each opening a refusal.
- Why it is wrong: the mirror of D-05, links to a screen the viewer may not open.
- Fix: have `(ws)/hr/page.tsx` compute `peopleHref` from `screenProperties(gateOf("people"))` (null when closed) and pass it down; render the three links only when non-null.

### D-07 · GATE · TWEAK · severity low · verified (cross-lane with Rooms)

- Where: Rooms, `rooms/page.tsx:93-107` gates `housekeepingHref` and `reservationsHref` but `features/rooms/components/rooms-view.tsx:177` (`maintenanceHref`) and `:891` (`calendarHref`) are built by hand and offered always: "Maintenance" button in the hold branch (`block-unit-dialog.tsx:236`) and "Show on calendar" in all four branches (`block-unit-dialog.tsx:174-183`).
- What happens: Rooms opens for `accommodation.configure` alone (`ROOM_WORK`), the Calendar does not (`FRONT_DESK_WORK` only); Maintenance needs a `maintenance.*` permission. Those viewers get a refusal from a button in the very dialog that was just fixed for the same class.
- Why it is wrong: same defect class as the reported one; two of the four neighbouring links were gated, two were not.
- Fix: add `calendarHref` and `maintenanceHref` to `rooms/page.tsx` computed with `screenProperties(gateOf("room-calendar"))` and `screenProperties(gateOf("maintenance"))`, null when closed, and hide the links on null.

### D-08 · BACK · TWEAK · severity low · inferred (behaviour) / verified (code)

- Where: phone bottom dock, `packages/ui/src/components/nav.ts:63-71` (`toMobileNav`) and `app-rail.tsx:79-88,648` (`useActiveHref`)
- What happens: a group such as Front Office is one dock tile pointing at its first page. The tile is "active" only when the path equals that first page, so on Room calendar, Arrivals or Close the day (any page but the first) no tile is highlighted; the person has no marker of where they are in the dock (the page-bar `SectionTabs` does mark it).
- Why it is wrong: an unhighlighted dock reads as lost; also the tile promises "Front Office" but opens one child.
- Fix: in `toMobileNav` keep the group's child hrefs on the item and have `AppBottomNav` mark the tile active when any child matches.

### D-09 · LABEL · TWEAK · severity low · verified

- Where: phone dock, `packages/ui/src/components/app-rail.tsx:675-701` renders no badge; the sidebar (`:416-425`) and chips (`nav-chips.tsx:80`) do. `lib/nav.ts:129` sets `badge: soon` for Food and beverage and Inventory.
- What happens: on a phone a configuration manager sees "Food and Beverage" and "Inventory" tiles that look as built as Today and open a "Not available yet" screen. On desktop the same entries say "Soon".
- Why it is wrong: "unbuilt is a position" is read honestly on two surfaces and not the third.
- Fix: render `badge` in `AppBottomNav` as the other two surfaces do (a small dot or the word, per the dock's width).

### D-10 · DEEPLINK · TWEAK · severity low · verified

- Where: Finance `?folio=`, `(ws)/finance/page.tsx:95-134` (`<p>{property.propertyName}</p>` at the folio branch) vs `selected.propertyId`
- What happens: `folio(search.folio)` reads by id alone, so `/finance?property=P&folio=<folio of Q>` (a stale bookmark, an edited link) renders Q's folio, its permissions and timezone, under P's name in the page and P in the switcher. App-built links all pass the folio's own Property (`ledger/journal-table.tsx:151`, `row-menu.tsx:175`) so only hand-made URLs hit it.
- Why it is wrong: the page and the switcher disagree about where the viewer is working, the class HK-S1-24 closed for lists.
- Fix: when `selected.propertyId !== property.propertyId`, `redirect(withProperty(finance, search, selected.propertyId))` using `server/front-desk.ts:62`, or show the folio as not found.

### D-11 · DEEPLINK · TWEAK · severity low · verified

- Where: `(ws)/front-office/page.tsx:30-35`; `(ws)/inventory/page.tsx:50-57,63`; `(ws)/food-and-beverage/page.tsx:50-57,63`
- What happens: (a) `/front-office?property=P` redirects to the first child open at ANY Property and forwards P unvalidated; if that child is closed at P the person lands on a refusal even though another Front Office page opens at P. A dormitory also gets Reservations first although its rail starts with Rooms (`DORMITORY_FRONT_OFFICE`). (b) The two Soon screens test `properties.length === 0` over all Properties, so naming a Property where the module is off still shows "Not available yet" instead of "not switched on at this Property", and neither calls `frontDeskProperty`, so their URL carries no `?property=` and the Today button forwards a raw, unchecked value.
- Why it is wrong: a named Property is ignored in the redirect/gate check, the rule `chooseProperty` documents.
- Fix: in front-office, test each child with `screenProperties(...)` filtered to `property` when one is named, and use `screensFor(model)` order; in the Soon pages use `frontDeskProperty` like built screens.

### D-12 · NO-HOME · TWEAK · severity low · verified

- Where: Configuration, "Switched on" card, `features/configuration/components/overview-cards.tsx:41-60`
- What happens: each switched-on module is drawn as an icon row, the same pattern as the Elsewhere links directly below it, but is inert text. Nine to twelve rows that look clickable and go nowhere.
- Why it is wrong: a hidden non-affordance; the page that holds the module is one click away in the rail but this list does not offer it.
- Fix: render each row as a `Link` to `?property=<id>` when `screenProperties(gateOf(segment))` opens it at this Property, else plain text (the card already receives the filtered list from the page).

### D-13 · DEAD-END · TWEAK · severity low · verified

- Where: `app/[locale]/error.tsx` via `route-error.tsx:48-62`
- What happens: when the workspace layout itself fails (database read in `layout.tsx`), the person gets title, description, "Try again", and a digest. No rail, no sign-out, no Today link, no reload-elsewhere; if the read keeps failing the screen is a loop. (Inside the shell, `(ws)/error.tsx` is fine because the rail stays.)
- Why it is wrong: the one place with no navigation has no exit.
- Fix: add a "Go to sign-in" or "Go to Today" link beside the retry in `RouteError` when rendered at `[locale]` level.

### D-14 · DEAD-END · PROPOSAL · severity low · verified

- Where: `(ws)/billing-notice.tsx:19-40`, copy `messages.ts:7728-7731` ("Please settle the payment.")
- What happens: an Owner whose Organization is past due sees a warning on every page that tells them to pay and gives no way: no link, no contact, no amount. The audit already recorded that no support contact exists (SHELL-11, `docs/ux-audit/2026-10-25-fix-reports/lane-01-shell-access.md`, owner decision).
- Why it is wrong: an instruction with no next action.
- Fix: nothing without an owner decision on where payment is made; comparable systems (Mews, Cloudbeds) link to a billing page. Recommend recording it as a `proposed` row.

## Searchparams matrix (question 2) — only the findings that matter

Every Property-scoped page I read resolves `?property=` through `frontDeskProperty` (`server/front-desk.ts:44`): a named but unreachable Property shows the refusal, an absent one is written into the URL. Property switch (`property-switcher.tsx:73-77`) deliberately keeps the page and drops every other param; locale switch (`workspace-language-switcher.tsx:26-28`) keeps the whole query. Both are correct and documented.
Accepted and validated: rooms `unit view show admits block` (unknown values fall back, `knownBlock` checks the building); housekeeping `floor show view`; maintenance `report` (checked against offered Units, `maintenance/page.tsx:73-77`); departures `view show`; data-export `dataset from to unavailable` (validated, `data-export/page.tsx:25-39`); hr `tab period week` (`openingTab`); integrations `view page` (page clamped to last); finance `folio show` (unknown folio gives a notice, unknown tab falls back); analytics `month range day` (day ignored outside the month by design); portfolio `sort view`.
Accepted and handed to a feature lane (not traced here): reservations `open change new`, room-calendar window params, audit-log filters, ledger filters.
Silently ignored by design: rooms `unit` only scrolls and rings the tile and never opens its dialog; a unit that is filtered out by `show`/`block` is simply not shown (`rooms-view.tsx:150-169`) with no message. Left to the Rooms lane.

## Checked and fine

- ADR 0035 back button: automatic for every non-Today route through `WorkspacePageBar`, a `Link` (`packages/ui/.../back-button.tsx`) with `rtl:rotate-180`, never `history.back()`. Detail keys `record`, `folio`, `entry` return to the list with every other param kept (`workspace-page-bar.tsx:84-94`). Not-found screens also get it (`workspace-page-bar.tsx:76-80`). Today alone has none. Security gets it (to Today).
- Rail, switcher and pages share one gate (`gateOf`); `screenProperties`-style gating is used for the links in rooms (housekeeping, reservations), analytics (finance, reservations), audit-log (finance, rooms, configuration, data-export, `subjectReach`), finance (audit, reservation), front-office rows (`reach`), room-calendar drawer targets (same gate), close-day (analytics `mayCloseDay`), portfolio (`peopleHref`).
- `ScreenDenied`/`ScreenRefusal` always carry an action; `not-found` and `[...missing]` sit inside the shell and ask for sign-in first; `SessionEndedDialog` is non-dismissable on purpose with a sign-in link that returns to the address.
- `loading.tsx` states are shapes only, no stuck state; `portfolio`/`analytics` have their own.
- Locale switch keeps the query; property switch is a full load by ADR 0019 and remembers the choice.
- Soon items (Food and beverage, Inventory) read honestly on the sidebar and chips: "Soon" badge, gated like built screens, and open a "Not available yet" page with a way out (D-09 is the phone dock only).
- `localizeHref(locale, "hr?property=...")` works because `localizeHref` is pure concatenation (`packages/i18n/src/index.ts:44-50`).

UX tweaks made: none (read-only audit).
UX proposals: (1) a billing page or contact for the past-due notice (D-14), after the owner decides where payment happens, comparable Mews/Cloudbeds; (2) a one-line "this room is filtered out" notice when `?unit=` names a hidden Unit (Rooms lane).
