import { randomUUID } from "node:crypto";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { psql } from "./local-database";
import {
  HOUSEKEEPER_EMAIL,
  portfolioProperty,
  signIn,
  testProperty,
} from "./front-desk";

/**
 * Taking a booking, through the screen a front desk actually uses.
 *
 * The integration suite proves the command and the pgTAP suite proves the
 * policies and the constraint. This proves the part neither of them can see:
 * that the form exists, that what a person types reaches the server action in
 * the shape the module wants, and that the booking is on the list afterwards.
 *
 * Watched go red before it was believed — with the submit button named anything
 * other than "Create reservation" it fails at the click rather than passing on
 * a selector that matches nothing.
 *
 * Like the arrivals suite, each run brings its own Unit and takes nothing back.
 * A Reservation is operational history and is never deleted, and a Guest even
 * less so.
 */

/** A Unit of this run's own, so two runs never contend for the same nights. */
function aFreeUnit(propertyId: string): string {
  const tag = randomUUID().slice(0, 8);
  const unitName = `E2E-BOOK-${tag}`;

  psql(
    `insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity)
     select id, organization_id, '${unitName}', 'room', 2
     from public.properties where id = '${propertyId}'`,
  );

  return unitName;
}

/**
 * A date the Property is working towards, as the calendar names its days.
 *
 * Computed by the database in the Property's timezone. A date built from the
 * runner's clock is the wrong day for half of every day, and the module refuses
 * a booking that starts before the Property's own today.
 */
function propertyDay(propertyId: string, days: number): string {
  return psql(
    `select to_char(app.property_today(id) + ${days}, 'YYYY-MM-DD')
     from public.properties where id = '${propertyId}'`,
  );
}

/**
 * Presses a day in the open date-range calendar, turning months forward until
 * it is shown. The day is found by its `data-day`, the ISO date, so the test
 * does not depend on how English spells a weekday; the outside-day echo of it
 * in a neighbouring month's grid is skipped.
 */
async function pickDay(page: Page, iso: string) {
  const day = page.locator(`td:not([data-outside]) [data-day="${iso}"]`);
  for (let turns = 0; turns < 12 && !(await day.isVisible()); turns++) {
    await page.getByRole("button", { name: /next month/i }).click();
  }
  await day.click();
}

test("a front desk takes a booking and finds it on the list", async ({
  page,
}) => {
  const propertyId = testProperty();
  const unitName = aFreeUnit(propertyId);
  const guestName = `Test Booking ${randomUUID().slice(0, 8)}`;
  const email = `${guestName.replaceAll(" ", ".").toLowerCase()}@example.test`;

  await signIn(page);
  await page.goto(`/en/reservations?property=${propertyId}`);

  await page.getByRole("button", { name: "New reservation" }).click();
  const dialog = page.getByRole("dialog", { name: "New reservation" });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Guest", { exact: true }).fill(guestName);
  await dialog.getByLabel("Email").fill(email);
  // A combobox rather than a native select: the Unit picker is the kit's
  // searchable one, so the option is a listbox row and not an <option>.
  // Submitted with no Unit, the booking stops at the Unit: its required value
  // is carried by a proxy input, and the refusal lands on the trigger.
  const unit = dialog.getByLabel("Unit");
  await dialog.getByRole("button", { name: "Create reservation" }).click();
  await expect(dialog).toBeVisible();
  await expect(unit).toHaveAttribute("aria-invalid", "true");
  await expect(unit).toBeFocused();
  await expect(unit).toHaveAccessibleDescription("Choose one to continue.");
  await expect(dialog.getByText("Choose one to continue.")).toBeVisible();
  // The arrow key opens it, as it opened the Select it replaced.
  await page.keyboard.press("ArrowDown");
  await page.getByRole("option", { name: new RegExp(unitName) }).click();
  await expect(unit).not.toHaveAttribute("aria-invalid", "true");
  // Submitted with no arrival, the booking stops and the calendar opens at
  // the arrival: the required start is carried by a proxy input the reader
  // never sees, so this is the only place its message can arrive.
  await dialog.getByRole("button", { name: "Create reservation" }).click();
  await expect(page.getByText("Choose the arrival day")).toBeVisible();
  await expect(dialog).toBeVisible();

  await pickDay(page, propertyDay(propertyId, 7));
  // A Guest booking needs a departure (RG-S1-11): left without one, the
  // submit stops the same way and the calendar reopens at the departure.
  await page.keyboard.press("Escape");
  await expect(page.getByText("Choose the departure day")).toBeHidden();
  await dialog.getByRole("button", { name: "Create reservation" }).click();
  // The calendar opens where the button was, so the pointer is left over one of
  // its days and the footer shows that hover's nights in place of the prompt.
  await page.mouse.move(0, 0);
  await expect(page.getByText("Choose the departure day")).toBeVisible();
  await expect(dialog).toBeVisible();
  await pickDay(page, propertyDay(propertyId, 10));
  // The range is complete: the calendar closes and focus is back on the half
  // just set, so a keyboard reader carries on from where they were.
  await expect(page.getByText("Choose the departure day")).toBeHidden();
  await expect(
    dialog.getByRole("button", { name: /^Departure/ }),
  ).toBeFocused();
  // The second day completes the range and closes the calendar by itself.
  await expect(
    dialog.getByRole("button", { name: /^Departure/ }),
  ).not.toHaveText("Open-ended");

  // Optional, and after the dates: the Guest stays first (RG-S4-19).
  await dialog.getByLabel("Expected arrival").fill("15:30");

  await dialog.getByRole("button", { name: "Create reservation" }).click();

  // The dialog closes by the booking having happened, so its absence is the
  // first thing that says the write went through.
  await expect(dialog).toBeHidden();

  await page.getByRole("searchbox").fill(guestName);
  const row = page.getByRole("row").filter({ hasText: guestName });
  await expect(row).toBeVisible();
  // The address is on the row because it is the only visible evidence that a
  // returning Guest would be recognized rather than duplicated.
  await expect(row).toContainText(email);
  await expect(row).toContainText(unitName);
  // The expected arrival travelled in with the booking (FD-S6-04).
  expect(
    psql(
      `select to_char(reservation.expected_arrival_time, 'HH24:MI')
         from public.reservations as reservation
         join public.guests as guest on guest.id = reservation.guest_id
        where guest.full_name = '${guestName}'`,
    ),
  ).toBe("15:30");
});

/**
 * Where the browser puts focus when a submit is blocked with more than one
 * field empty. It fires `invalid` at every problem field and then focuses the
 * first whose handler did not cancel it, so a handler that cancels the event
 * hands focus, and the browser's bubble, to whichever field comes next — which
 * jsdom does not do, and which the unit suite therefore cannot see.
 */
test("a_booking_form_with_several_problems_asks_about_the_guest_first: the name is asked about first", async ({
  page,
}) => {
  const propertyId = testProperty();
  const unitName = aFreeUnit(propertyId);

  await signIn(page);
  await page.goto(`/en/reservations?property=${propertyId}`);
  await page.getByRole("button", { name: "New reservation" }).click();
  const dialog = page.getByRole("dialog", { name: "New reservation" });
  const guest = dialog.getByLabel("Guest", { exact: true });
  const create = dialog.getByRole("button", { name: "Create reservation" });

  /** Focus must be on something a reader can reach, never a proxy input. */
  const focusIsReal = () =>
    page.evaluate(
      () => document.activeElement?.closest("[aria-hidden='true']") === null,
    );

  // Everything empty.
  await create.click();
  await expect(guest).toBeFocused();
  await expect(dialog.getByText("Enter the Guest's name.")).toBeVisible();
  expect(await focusIsReal()).toBe(true);

  // A Unit chosen, still no name and no dates: the name is still first, and
  // the date proxy does not open its calendar over it.
  await dialog.getByLabel("Unit").click();
  await page.getByRole("option", { name: new RegExp(unitName) }).click();
  await create.click();
  await expect(guest).toBeFocused();
  await expect(page.getByText("Choose the arrival day")).toBeHidden();
  expect(await focusIsReal()).toBe(true);

  // Typing takes the message away.
  await guest.fill("Somebody");
  await expect(dialog.getByText("Enter the Guest's name.")).toBeHidden();
});

/**
 * A confirmed booking of this run's own on a Unit of its own, dated from the
 * Property's today so it lands in the same tab on whichever day this runs.
 */
function aConfirmedBooking(
  propertyId: string,
  guestName: string,
  firstNight: number,
  lastNight: number,
  contact: { email: string; phone: string },
): { reservationId: string; reference: string; unitName: string } {
  const unitName = `E2E-LIST-${randomUUID().slice(0, 8)}`;
  const reservationId = psql(
    `with target as (
       select id, organization_id from public.properties where id = '${propertyId}'
     ), unit as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity)
       select id, organization_id, '${unitName}', 'room', 2 from target
       returning id, property_id, organization_id
     ), guest as (
       insert into public.guests (organization_id, full_name, email, phone)
       select organization_id, '${guestName}', '${contact.email}', '${contact.phone}'
         from target
       returning id
     )
     insert into public.reservations
       (organization_id, property_id, accommodation_unit_id,
        guest_id, stay_type, status, starts_on, ends_on)
     select unit.organization_id, unit.property_id, unit.id,
            guest.id, 'guest', 'confirmed',
            app.property_today(unit.property_id) + ${firstNight},
            app.property_today(unit.property_id) + ${lastNight}
       from unit, guest
     returning id`,
  );
  const reference = psql(
    `select reference from public.reservations where id = '${reservationId}'`,
  );
  return { reservationId, reference, unitName };
}

/** Seven digits, so a telephone typed in full is found by nothing else. */
function sevenDigits(): string {
  return String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
}

test("a_booking_is_found_by_tab_by_phone_and_by_reference", async ({
  page,
}) => {
  const propertyId = testProperty();
  const tag = randomUUID().slice(0, 8);
  const arriving = `Tabs Arriving ${tag}`;
  const upcoming = `Tabs Upcoming ${tag}`;
  const digits = sevenDigits();
  const arrivingBooking = aConfirmedBooking(propertyId, arriving, 0, 2, {
    email: `tabs.arriving.${tag}@example.test`,
    phone: `+90 555 ${sevenDigits()}`,
  });
  aConfirmedBooking(propertyId, upcoming, 20, 22, {
    email: `tabs.upcoming.${tag}@example.test`,
    // Written with spaces, found by its digits alone.
    phone: `+90 555 ${digits.slice(0, 3)} ${digits.slice(3)}`,
  });

  await signIn(page);
  await page.goto(`/en/reservations?property=${propertyId}`);

  const search = page.getByRole("searchbox");
  const row = (name: string) => page.getByRole("row").filter({ hasText: name });

  // All is where the list opens: nothing is hidden until somebody asks.
  await search.fill(tag);
  await expect(page.getByRole("tab", { name: /^All/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(row(arriving)).toBeVisible();
  await expect(row(upcoming)).toBeVisible();

  await page.getByRole("tab", { name: /^Arriving today/ }).click();
  await expect(row(arriving)).toBeVisible();
  await expect(row(upcoming)).toBeHidden();

  await page.getByRole("tab", { name: /^Upcoming/ }).click();
  await expect(row(upcoming)).toBeVisible();
  await expect(row(arriving)).toBeHidden();

  // Nobody is in house under this search: neither booking has arrived.
  await page.getByRole("tab", { name: /^In house/ }).click();
  await expect(row(arriving)).toBeHidden();
  await expect(row(upcoming)).toBeHidden();

  await page.getByRole("tab", { name: /^All/ }).click();
  await expect(row(arriving)).toBeVisible();
  await expect(row(upcoming)).toBeVisible();

  // The telephone is found by its digits, typed without the spaces it was
  // written with.
  await search.fill(`555${digits}`);
  await expect(row(upcoming)).toBeVisible();
  await expect(row(arriving)).toBeHidden();

  // And a booking is found by the reference it was given.
  await search.fill(arrivingBooking.reference);
  await expect(row(arriving)).toBeVisible();
  await expect(row(upcoming)).toBeHidden();
});

test("a_row_opens_the_bookings_detail_sheet: and the sheet closes back to the list", async ({
  page,
}) => {
  const propertyId = testProperty();
  const guestName = `Detail Guest ${randomUUID().slice(0, 8)}`;
  const email = `${guestName.replaceAll(" ", ".").toLowerCase()}@example.test`;
  const phone = `+90 555 ${sevenDigits()}`;
  const booking = aConfirmedBooking(propertyId, guestName, 5, 8, {
    email,
    phone,
  });

  await signIn(page);
  await page.goto(`/en/reservations?property=${propertyId}`);
  await page.getByRole("searchbox").fill(guestName);
  const row = page.getByRole("row").filter({ hasText: guestName });
  await expect(row).toBeVisible();

  // Pressed on text in the row, not on a control inside it.
  await row.getByText(booking.unitName).click();
  const sheet = page.getByRole("dialog", { name: guestName });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Stay timeline")).toBeVisible();
  await expect(sheet.getByText(booking.reference)).toBeVisible();
  await expect(sheet.getByText(booking.unitName)).toBeVisible();
  await expect(sheet.getByRole("link", { name: email })).toBeVisible();
  await expect(sheet.getByRole("link", { name: phone })).toBeVisible();
  await expect(
    sheet.getByRole("link", { name: "Show on the room map" }),
  ).toHaveAttribute("href", /\/rooms\?property=.*&unit=/);

  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();

  // The row is a keyboard target as well, and Escape closes the sheet. Focus
  // starts on Copy reference, whose tooltip takes the first Escape.
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(sheet).toBeVisible();
  await expect(async () => {
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden({ timeout: 1_000 });
  }).toPass();
});

test("choosing_from_a_rows_menu_opens_that_action_and_not_the_sheet", async ({
  page,
}) => {
  const propertyId = testProperty();
  const guestName = `Menu Guest ${randomUUID().slice(0, 8)}`;
  aConfirmedBooking(propertyId, guestName, 5, 8, {
    email: `${guestName.replaceAll(" ", ".").toLowerCase()}@example.test`,
    phone: `+90 555 ${sevenDigits()}`,
  });

  await signIn(page);
  await page.goto(`/en/reservations?property=${propertyId}`);
  await page.getByRole("searchbox").fill(guestName);
  const row = page.getByRole("row").filter({ hasText: guestName });
  await expect(row).toBeVisible();

  // The menu and the dialog it opens are portals, but React still bubbles
  // their clicks through the row. No sheet is opened first, because one closed
  // just before arms a guard that would hide the fault.
  await row
    .getByRole("button", {
      name: new RegExp(`More actions for .?${guestName}`),
    })
    .click();
  await page.getByRole("menuitem", { name: "Change booking" }).click();
  const change = page.getByRole("dialog", { name: "Change booking" });
  await expect(change).toBeVisible();
  // Pressing inside the dialog, on text rather than a control, is not a press
  // on the row either.
  await change.getByText("Stay dates").click();
  await expect(change).toBeVisible();
  await expect(page.getByRole("dialog", { name: guestName })).toBeHidden();
});

/**
 * RANZ-24's evidence: the key states of a booking's life, saved only when asked
 * for, so an ordinary run leaves the working tree alone.
 */
async function evidence(page: Page, name: string): Promise<void> {
  if (process.env.RANZA_EVIDENCE !== "1") return;
  await page.screenshot({
    path: path.resolve(__dirname, "../../docs/evidence/m1/RANZ-24", name),
    type: "png",
  });
}

/** A Unit of this run's own, with a name nobody else's run can match. */
function aUnitNamed(propertyId: string, label: string): string {
  const unitName = `E2E-${label}-${randomUUID().slice(0, 8)}`;
  psql(
    `insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity)
     select id, organization_id, '${unitName}', 'room', 2
     from public.properties where id = '${propertyId}'`,
  );
  return unitName;
}

/**
 * Opens the date field's calendar from its arrival half, and does not go on
 * until it is open: pressed while a menu is still handing focus back, the
 * first press can be undone by it, and the day looked for would never appear.
 */
async function openTheCalendar(page: Page, dialog: Locator): Promise<void> {
  await expect(async () => {
    if (!(await page.getByRole("grid").first().isVisible())) {
      await dialog.getByRole("button", { name: /^Arrival/ }).click();
    }
    await expect(page.getByRole("grid").first()).toBeVisible({
      timeout: 1_000,
    });
  }).toPass();
}

/** The calendar's own Done, when it is still open: Escape would close the dialog under it. */
async function closeCalendar(page: Page): Promise<void> {
  const done = page.getByRole("button", { name: "Done" });
  if (await done.isVisible()) await done.click();
}

/**
 * A booking taken through the dialog, as the desk takes it, and the row it
 * leaves on the list.
 */
async function takeBookingThroughTheScreen(
  page: Page,
  propertyId: string,
  booking: { guestName: string; unitName: string; from: number; to: number },
): Promise<Locator> {
  await page.goto(`/en/reservations?property=${propertyId}`);
  await page.getByRole("button", { name: "New reservation" }).click();
  const dialog = page.getByRole("dialog", { name: "New reservation" });
  await dialog.getByLabel("Guest", { exact: true }).fill(booking.guestName);
  await dialog.getByLabel("Unit").click();
  await page
    .getByRole("option", { name: new RegExp(booking.unitName) })
    .click();
  await openTheCalendar(page, dialog);
  await pickDay(page, propertyDay(propertyId, booking.from));
  await pickDay(page, propertyDay(propertyId, booking.to));
  await closeCalendar(page);
  await dialog.getByRole("button", { name: "Create reservation" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("searchbox").fill(booking.guestName);
  const row = page.getByRole("row").filter({ hasText: booking.guestName });
  await expect(row).toBeVisible();
  return row;
}

/** What a row says about its nights, read from the dates it prints. */
async function expectNights(row: Locator, from: string, to: string) {
  await expect(row.locator("time").nth(0)).toHaveAttribute("datetime", from);
  await expect(row.locator("time").nth(1)).toHaveAttribute("datetime", to);
}

async function openRowMenu(row: Locator, page: Page, guestName: string) {
  await row
    .getByRole("button", {
      name: new RegExp(`More actions for .?${guestName}`),
    })
    .click();
  return page.getByRole("menu");
}

test("a_booking_is_taken_changed_moved_and_cancelled_through_the_screen: every step is on the list afterwards", async ({
  page,
}) => {
  const propertyId = testProperty();
  const first = aUnitNamed(propertyId, "LC-1");
  const second = aUnitNamed(propertyId, "LC-2");
  const guestName = `Lifecycle ${randomUUID().slice(0, 8)}`;
  const day = (offset: number) => propertyDay(propertyId, offset);

  await signIn(page);
  const row = await takeBookingThroughTheScreen(page, propertyId, {
    guestName,
    unitName: first,
    from: 7,
    to: 9,
  });
  await expect(row.getByText("Confirmed", { exact: true })).toBeVisible();
  await expect(row).toContainText(first);
  await expectNights(row, day(7), day(9));

  // The dates change, on the Unit it has.
  let menu = await openRowMenu(row, page, guestName);
  await menu.getByRole("menuitem", { name: "Change booking" }).click();
  const change = page.getByRole("dialog", { name: "Change booking" });
  await openTheCalendar(page, change);
  await pickDay(page, day(8));
  await pickDay(page, day(11));
  await closeCalendar(page);
  await change.getByRole("button", { name: "Save change" }).click();
  await expect(change).toBeHidden();
  await expectNights(row, day(8), day(11));
  await expect(row).toContainText(first);

  // And then the room: the nights stay, the Unit is the other one.
  menu = await openRowMenu(row, page, guestName);
  await menu.getByRole("menuitem", { name: "Change booking" }).click();
  await change.getByLabel("Unit").click();
  await page
    .getByRole("option", { name: new RegExp(`${second}.*Free`) })
    .click();
  await change.getByRole("button", { name: "Save change" }).click();
  await expect(change).toBeHidden();
  await expect(row).toContainText(second);
  await expect(row).not.toContainText(first);
  await expectNights(row, day(8), day(11));
  await evidence(page, "01-booking-changed-and-moved.png");

  // Cancelled with a reason, which the form insists on.
  const reason = `The Guest phoned to cancel ${randomUUID().slice(0, 8)}`;
  menu = await openRowMenu(row, page, guestName);
  await menu.getByRole("menuitem", { name: "Cancel booking" }).click();
  const cancel = page.getByRole("dialog", { name: "Cancel this booking" });
  await cancel.getByRole("button", { name: "Cancel booking" }).click();
  await expect(cancel).toBeVisible();
  await cancel.getByLabel("Reason").fill(reason);
  await cancel.getByRole("button", { name: "Cancel booking" }).click();
  await expect(cancel).toBeHidden();

  // It is no longer an active booking: it says so, it has left the view of
  // bookings still to come, and the row offers nothing that could change it.
  await expect(row.getByText("Cancelled", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /^Upcoming/ }).click();
  await expect(row).toBeHidden();
  await page.getByRole("tab", { name: /^All/ }).click();
  await expect(row).toBeVisible();
  await evidence(page, "02-booking-cancelled-on-the-list.png");
  menu = await openRowMenu(row, page, guestName);
  await expect(
    menu.getByRole("menuitem", { name: "Change booking" }),
  ).toHaveCount(0);
  await expect(
    menu.getByRole("menuitem", { name: "Cancel booking" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(
    psql(
      `select count(*) from public.reservations as reservation
         join public.guests as guest on guest.id = reservation.guest_id
        where guest.full_name = '${guestName}' and reservation.status = 'confirmed'`,
    ),
  ).toBe("0");

  // And the reason is on the record, where a manager reads it.
  await page.goto(`/en/audit-log?property=${propertyId}`);
  await page.getByRole("searchbox", { name: "Search" }).fill(reason);
  await page.getByRole("button", { name: "Apply" }).click();
  const record = page.getByRole("row").filter({ hasText: reason });
  await expect(record).toBeVisible();
  await expect(record).toContainText("cancelled");
  await evidence(page, "03-cancellation-reason-on-the-record.png");
});

test("a_booking_nobody_came_for_is_marked_a_no_show: and leaves the arrivals", async ({
  page,
}) => {
  const propertyId = testProperty();
  const unitName = aUnitNamed(propertyId, "NS");
  const guestName = `No Show ${randomUUID().slice(0, 8)}`;

  await signIn(page);
  const row = await takeBookingThroughTheScreen(page, propertyId, {
    guestName,
    unitName,
    from: 0,
    to: 2,
  });
  await expect(row.getByText("Confirmed", { exact: true })).toBeVisible();

  const menu = await openRowMenu(row, page, guestName);
  await menu.getByRole("menuitem", { name: "Mark as no-show" }).click();
  const dialog = page.getByRole("dialog", { name: "Mark as a no-show" });
  await dialog.getByRole("button", { name: "Mark as no-show" }).click();
  await expect(dialog).toBeHidden();

  await expect(row.getByText("No show", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /^Arriving today/ }).click();
  await expect(row).toBeHidden();
  await page.getByRole("tab", { name: /^All/ }).click();
  await expect(row).toBeVisible();

  await page.goto(`/en/arrivals?property=${propertyId}`);
  await page.getByRole("searchbox").fill(guestName);
  await expect(
    page.getByRole("row").filter({ hasText: guestName }),
  ).toHaveCount(0);
});

test("a_booking_for_today_is_checked_in_moved_while_in_house_and_checked_out: each step is on the screen that does it", async ({
  page,
}) => {
  const propertyId = testProperty();
  const first = aUnitNamed(propertyId, "IH-1");
  const second = aUnitNamed(propertyId, "IH-2");
  const guestName = `In House ${randomUUID().slice(0, 8)}`;

  await signIn(page);
  const booked = await takeBookingThroughTheScreen(page, propertyId, {
    guestName,
    unitName: first,
    from: 0,
    to: 3,
  });
  await expect(booked).toContainText(first);

  // Arrivals: checked in from the row.
  await page.goto(`/en/arrivals?property=${propertyId}`);
  await page.getByRole("searchbox").fill(guestName);
  const arrival = page.getByRole("row").filter({ hasText: guestName });
  await expect(arrival).toContainText(first);
  await arrival.getByRole("button", { name: "Check in" }).click();
  await expect(arrival.getByText("Checked in")).toBeVisible();

  // The same booking now says so on the Reservations list.
  await page.goto(`/en/reservations?property=${propertyId}`);
  await page.getByRole("searchbox").fill(guestName);
  const listed = page.getByRole("row").filter({ hasText: guestName });
  await expect(listed.getByText("Checked in", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /^In house/ }).click();
  await expect(listed).toBeVisible();

  // Moved to the other room while in house.
  await page.goto(`/en/departures?property=${propertyId}&view=in_house`);
  await page.getByRole("searchbox").fill(guestName);
  const inHouse = page.getByRole("row").filter({ hasText: guestName });
  await expect(inHouse).toContainText(first);
  const menu = await openRowMenu(inHouse, page, guestName);
  await menu.getByRole("menuitem", { name: "Move Guest" }).click();
  const move = page.getByRole("dialog", { name: "Move Guest" });
  await move.getByLabel("Unit").click();
  await page
    .getByRole("option", { name: new RegExp(`${second}.*Free`) })
    .click();
  await move.getByRole("combobox", { name: "Reason" }).click();
  await page.getByRole("option", { name: "The Guest asked" }).click();
  await move.getByRole("button", { name: "Move Guest" }).click();
  await expect(move).toBeHidden();
  await expect(inHouse).toContainText(second);
  await expect(inHouse).not.toContainText(first);

  // The Reservations list follows the Guest to the room they are in now.
  await page.goto(`/en/reservations?property=${propertyId}`);
  await page.getByRole("searchbox").fill(guestName);
  await expect(listed).toContainText(second);
  await expect(listed.getByText("Checked in", { exact: true })).toBeVisible();
  await evidence(page, "04-in-house-guest-in-the-other-room.png");

  // Checked out, early, from Departures.
  await page.goto(`/en/departures?property=${propertyId}&view=in_house`);
  await page.getByRole("searchbox").fill(guestName);
  await inHouse.getByRole("button", { name: /^Check .* out$/ }).click();
  const checkOut = page.getByRole("dialog");
  await expect(checkOut.getByText(guestName)).toBeVisible();
  await checkOut.getByRole("checkbox").click();
  await checkOut.getByRole("button", { name: "Confirm check-out" }).click();
  await expect(checkOut).toBeHidden();
  await expect(inHouse).toHaveCount(0);

  await page.goto(`/en/reservations?property=${propertyId}`);
  await page.getByRole("searchbox").fill(guestName);
  await expect(listed.getByText("Checked out", { exact: true })).toBeVisible();
  await expect(listed).toContainText(second);
});

test("a_booking_over_nights_that_are_taken_is_refused_in_the_desks_words", async ({
  page,
}) => {
  const propertyId = testProperty();
  const booked = aConfirmedBooking(
    propertyId,
    `Holds Nights ${randomUUID().slice(0, 8)}`,
    7,
    10,
    {
      email: `holds.${randomUUID().slice(0, 8)}@example.test`,
      phone: `+90 555 ${sevenDigits()}`,
    },
  );

  await signIn(page);
  await page.goto(`/en/reservations?property=${propertyId}`);
  await page.getByRole("button", { name: "New reservation" }).click();
  const dialog = page.getByRole("dialog", { name: "New reservation" });
  await dialog
    .getByLabel("Guest", { exact: true })
    .fill(`Second Booking ${randomUUID().slice(0, 8)}`);
  // The Unit first, then dates that overlap its booking: the picker marks it
  // taken once the nights are chosen, and the desk who presses anyway is
  // refused by the database's own constraint.
  await dialog.getByLabel("Unit").click();
  await page.getByRole("option", { name: new RegExp(booked.unitName) }).click();
  await openTheCalendar(page, dialog);
  await pickDay(page, propertyDay(propertyId, 8));
  await pickDay(page, propertyDay(propertyId, 9));
  await closeCalendar(page);
  await expect(
    dialog.getByText(
      "This Unit is taken for the nights you chose. Pick another Unit or other dates.",
    ),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Create reservation" }).click();

  await expect(
    dialog.getByText("That Unit is already booked for those nights."),
  ).toBeVisible();
  await expect(dialog).toBeVisible();
  await evidence(page, "05-double-booking-refused.png");
});

test("a_booking_over_the_nights_of_somebody_in_house_is_refused_in_the_desks_words", async ({
  page,
}) => {
  const propertyId = testProperty();
  const unitName = aUnitNamed(propertyId, "OCC");
  const occupant = `Occupant ${randomUUID().slice(0, 8)}`;
  psql(
    `with unit as (
       select id, name, property_id, organization_id
         from public.accommodation_units where name = '${unitName}'
     ), guest as (
       insert into public.guests (organization_id, full_name)
       select organization_id, '${occupant}' from unit
       returning id
     ), arrived as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       select unit.organization_id, unit.property_id, unit.id, guest.id,
              'guest', 'checked_in',
              app.property_today(unit.property_id) - 1,
              app.property_today(unit.property_id) + 3
         from unit, guest
       returning id, organization_id, property_id, accommodation_unit_id,
                 starts_on, ends_on
     )
     insert into public.stays
       (organization_id, property_id, accommodation_unit_id, reservation_id,
        stay_type, status, starts_on, ends_on)
     select organization_id, property_id, accommodation_unit_id, id,
            'guest', 'in_house', starts_on, ends_on
       from arrived`,
  );

  await signIn(page);
  await page.goto(`/en/reservations?property=${propertyId}`);
  await page.getByRole("button", { name: "New reservation" }).click();
  const dialog = page.getByRole("dialog", { name: "New reservation" });
  await dialog
    .getByLabel("Guest", { exact: true })
    .fill(`Over The Occupant ${randomUUID().slice(0, 8)}`);
  await dialog.getByLabel("Unit").click();
  await page.getByRole("option", { name: new RegExp(unitName) }).click();
  await openTheCalendar(page, dialog);
  await pickDay(page, propertyDay(propertyId, 1));
  await pickDay(page, propertyDay(propertyId, 2));
  await closeCalendar(page);
  await dialog.getByRole("button", { name: "Create reservation" }).click();

  await expect(
    dialog.getByText(
      "Somebody is staying in that Unit for some of those nights.",
    ),
  ).toBeVisible();
  await expect(dialog).toBeVisible();
});

test("a_viewer_who_may_not_book_or_amend_is_offered_neither (RG-S3-05)", async ({
  page,
}) => {
  const propertyId = portfolioProperty();
  const guestName = `Read Only ${randomUUID().slice(0, 8)}`;
  aConfirmedBooking(propertyId, guestName, 20, 22, {
    email: `${guestName.replaceAll(" ", ".").toLowerCase()}@example.test`,
    phone: `+90 555 ${sevenDigits()}`,
  });

  await signIn(page, HOUSEKEEPER_EMAIL);
  await page.goto(`/en/reservations?property=${propertyId}`);
  await page.getByRole("searchbox").fill(guestName);
  const row = page.getByRole("row").filter({ hasText: guestName });
  await expect(row).toBeVisible();

  // Nothing to take a booking with.
  await expect(
    page.getByRole("button", { name: "New reservation" }),
  ).toHaveCount(0);

  // The row still opens its menu for what the viewer may do, which is not this.
  const menu = await openRowMenu(row, page, guestName);
  await expect(
    menu.getByRole("menuitem", { name: "Show on the room map" }),
  ).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Change booking" }),
  ).toHaveCount(0);
  await expect(
    menu.getByRole("menuitem", { name: "Cancel booking" }),
  ).toHaveCount(0);
  await expect(
    menu.getByRole("menuitem", { name: "Mark as no-show" }),
  ).toHaveCount(0);
  await evidence(page, "06-viewer-without-booking-rights.png");
});

test("an_email_too_short_to_be_one_is_said_under_the_field (RG-S1-42): from the browser and from the server, in English and Arabic", async ({
  page,
}) => {
  const propertyId = testProperty();
  const unitName = aUnitNamed(propertyId, "EM");

  await signIn(page);
  await page.goto(`/en/reservations?property=${propertyId}`);
  await page.getByRole("button", { name: "New reservation" }).click();
  const dialog = page.getByRole("dialog", { name: "New reservation" });
  const email = dialog.getByLabel("Email");
  const message =
    "Enter a valid email address, such as name@example.com, or leave it empty.";

  await dialog.getByLabel("Guest", { exact: true }).fill("Short Email");
  await email.fill("a");
  await dialog.getByLabel("Unit").click();
  await page.getByRole("option", { name: new RegExp(unitName) }).click();
  await openTheCalendar(page, dialog);
  await pickDay(page, propertyDay(propertyId, 30));
  await pickDay(page, propertyDay(propertyId, 31));
  await closeCalendar(page);

  // The browser refuses it, and the message is ours, under the field.
  await dialog.getByRole("button", { name: "Create reservation" }).click();
  await expect(dialog.getByText(message)).toBeVisible();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toBeFocused();
  await evidence(page, "07-short-email-said-under-the-field.png");

  // Typing takes it away.
  await email.fill("ab");
  await expect(dialog.getByText(message)).toBeHidden();

  // A form that skipped the browser's checks is told the same thing by the
  // server: two emoji are two characters to the database and four units to
  // the module, so this one is the database's refusal, mapped to the field.
  await email.fill("\u{1F600}\u{1F600}");
  await dialog.evaluate((element) => {
    element.querySelector("form")!.noValidate = true;
  });
  await dialog.getByRole("button", { name: "Create reservation" }).click();
  await expect(dialog.getByText(message)).toBeVisible();
  await expect(email).toBeFocused();
  await expect(
    dialog.getByText(
      "Check the Guest's name, email address and telephone number.",
    ),
  ).toHaveCount(0);
  expect(
    psql(`select count(*) from public.guests where full_name = 'Short Email'`),
  ).toBe("0");

  // The same sentence in Arabic, from the browser's refusal.
  await page.goto(`/ar/reservations?property=${propertyId}`);
  await page.getByRole("button", { name: "حجز جديد" }).click();
  const arabic = page.getByRole("dialog", { name: "حجز جديد" });
  await arabic.getByLabel("البريد الإلكتروني").fill("a");
  await arabic.getByRole("button", { name: "إنشاء الحجز" }).click();
  await expect(
    arabic.getByText(
      "أدخل بريدًا إلكترونيًا صالحًا مثل name@example.com، أو اتركه فارغًا.",
    ),
  ).toBeVisible();
});
