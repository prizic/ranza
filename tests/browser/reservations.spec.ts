import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { psql } from "./local-database";
import { signIn, testProperty } from "./front-desk";

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
