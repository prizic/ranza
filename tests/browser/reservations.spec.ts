import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

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
 * A date the Property is working towards, as the date input wants it.
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
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Guest", { exact: true }).fill(guestName);
  await dialog.getByLabel("Email").fill(email);
  // A combobox rather than a native select: shadcn's Select is Radix, so the
  // option is a listbox row and not an <option>.
  await dialog.getByLabel("Unit").click();
  await page.getByRole("option", { name: new RegExp(unitName) }).click();
  await dialog.getByLabel("Arrival").fill(propertyDay(propertyId, 7));
  await dialog.getByLabel("Departure").fill(propertyDay(propertyId, 10));

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
