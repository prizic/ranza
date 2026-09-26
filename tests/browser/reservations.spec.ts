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
  await pickDay(page, propertyDay(propertyId, 10));
  // The range is complete: the calendar closes and focus is back on the half
  // just set, so a keyboard reader carries on from where they were.
  await expect(
    page.getByText("Choose the departure, or leave it open"),
  ).toBeHidden();
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
