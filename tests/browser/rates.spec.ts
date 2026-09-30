import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { psql } from "./local-database";
import { signIn, testProperty } from "./front-desk";

/**
 * Nightly rates through the screen (ADR 0038).
 *
 * The pgTAP suites prove the price list, the booking's stamp and the room
 * nights; the integration suite proves the commands and the races. This proves
 * what only a browser sees: a price is typed as a person writes an amount and
 * saved from the Configuration screen, and the booking dialog then quotes it —
 * a night, and the total for the nights chosen — before anything is taken.
 *
 * The dialog is never submitted: a priced booking would fix the tests'
 * Property's currency and charge every later suite's Guests. The price is
 * cleared after each test, whatever happened.
 */

let propertyId = "";

test.beforeAll(() => {
  propertyId = testProperty();
});

test.afterEach(() => {
  psql(
    `update public.property_rates set amount_minor = null
      where property_id = '${propertyId}'`,
  );
});

/** A room of this run's own, so the dialog can offer it whatever else is booked. */
function aRoom(): string {
  const name = `E2E-RATE-${randomUUID().slice(0, 8)}`;
  psql(
    `insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity)
     select id, organization_id, '${name}', 'room', 2
     from public.properties where id = '${propertyId}'`,
  );
  return name;
}

function propertyDay(days: number): string {
  return psql(
    `select to_char(app.property_today(id) + ${days}, 'YYYY-MM-DD')
     from public.properties where id = '${propertyId}'`,
  );
}

async function pickDay(page: Page, iso: string) {
  const day = page.locator(`td:not([data-outside]) [data-day="${iso}"]`);
  for (let turns = 0; turns < 12 && !(await day.isVisible()); turns++) {
    await page.getByRole("button", { name: /next month/i }).click();
  }
  await day.click();
}

test("a price is set on Configuration, and the booking dialog quotes it", async ({
  page,
}) => {
  const room = aRoom();
  await signIn(page);
  await page.goto(`/en/configuration?property=${propertyId}`);

  const rates = page.locator("#rates");
  await expect(rates.getByText("Nightly rates")).toBeVisible();
  const field = rates.getByLabel("Price per night for Room");
  await expect(field).toHaveValue("");
  await expect(
    rates
      .getByText(
        "Bookings of this kind are taken without a price, and their nights are not charged.",
      )
      .first(),
  ).toBeVisible();

  // More decimals than the currency has is refused at the field and kept.
  await field.fill("1500.555");
  await rates.getByRole("button", { name: "Save changes" }).click();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toHaveValue("1500.555");

  await field.fill("1500,5");
  await rates.getByRole("button", { name: "Save changes" }).click();
  await expect(rates.getByText("Saved")).toBeVisible();
  await expect(field).toHaveValue("1500.5");

  await page.goto(`/en/reservations?property=${propertyId}`);
  await page.getByRole("button", { name: "New reservation" }).click();
  const dialog = page.getByRole("dialog", { name: "New reservation" });
  await dialog.getByLabel("Unit").click();
  await page.getByRole("option", { name: new RegExp(room) }).click();
  await expect(dialog.getByText(/1,500\.50 a night$/)).toBeVisible();

  await dialog.getByRole("button", { name: /^Arrival/ }).click();
  await pickDay(page, propertyDay(3));
  await pickDay(page, propertyDay(5));
  await expect(
    dialog.getByText(/1,500\.50 a night · 2 nights: .*3,001\.00 in total$/),
  ).toBeVisible();
});

test("a kind with no price says so before a booking is taken", async ({
  page,
}) => {
  const room = aRoom();
  await signIn(page);
  await page.goto(`/en/reservations?property=${propertyId}`);
  await page.getByRole("button", { name: "New reservation" }).click();
  const dialog = page.getByRole("dialog", { name: "New reservation" });
  await dialog.getByLabel("Unit").click();
  await page.getByRole("option", { name: new RegExp(room) }).click();
  await expect(
    dialog.getByText(
      "No price is set for Room here, so this booking is taken without one and its nights are not charged.",
    ),
  ).toBeVisible();
});
