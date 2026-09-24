import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { psql } from "./local-database";
import { signIn, testProperty } from "./front-desk";

/**
 * Checking a Guest out, and ending a booking, as a front desk does it.
 *
 * The check-out dialog carries three things no other layer can test: the
 * Folio's line count travelling back hidden, the early-departure checkbox
 * producing the form value the server action reads, and a required reason the
 * browser holds back until it is filled. Each run brings its own Unit and
 * Guest, because a check-out is not an act that repeats.
 */

/** A Guest arriving today for three nights on a Unit of this run's own. */
function anArrival(propertyId: string): {
  guestName: string;
  unitName: string;
} {
  const tag = randomUUID().slice(0, 8);
  const guestName = `Test Departure ${tag}`;
  const unitName = `E2E-D-${tag}`;
  psql(
    `with target as (
       select id, organization_id from public.properties where id = '${propertyId}'
     ), unit as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity)
       select id, organization_id, '${unitName}', 'room', 2 from target
       returning id, property_id, organization_id
     ), guest as (
       insert into public.guests (organization_id, full_name)
       select organization_id, '${guestName}' from target
       returning id
     )
     insert into public.reservations
       (organization_id, property_id, accommodation_unit_id,
        guest_id, stay_type, status, starts_on, ends_on)
     select unit.organization_id, unit.property_id, unit.id,
            guest.id, 'guest', 'confirmed',
            app.property_today(unit.property_id),
            app.property_today(unit.property_id) + 3
     from unit, guest`,
  );
  return { guestName, unitName };
}

/** A charge on the Guest's open Folio, posted behind the desk's back. */
function charge(guestName: string, amountMinor: number): void {
  psql(
    `insert into public.folio_lines
       (organization_id, property_id, folio_id, line_type, description, amount_minor)
     select folio.organization_id, folio.property_id, folio.id, 'charge', 'Minibar', ${amountMinor}
     from public.folios as folio
     join public.stays as stay on stay.id = folio.stay_id
     join public.reservations as reservation on reservation.id = stay.reservation_id
     join public.guests as guest on guest.id = reservation.guest_id
     where guest.full_name = '${guestName}' and folio.status = 'open'`,
  );
}

async function checkIn(page: Page, propertyId: string, guestName: string) {
  await page.goto(`/en/arrivals?property=${propertyId}`);
  await page.getByRole("searchbox").fill(guestName);
  const row = page.getByRole("row").filter({ hasText: guestName });
  await row.getByRole("button", { name: "Check in" }).click();
  await expect(row.getByText("Checked in")).toBeVisible();
}

async function openCheckOut(page: Page, propertyId: string, guestName: string) {
  // Leaving three nights early, so only the in-house view lists them.
  await page.goto(`/en/departures?property=${propertyId}&view=in_house`);
  await page.getByRole("searchbox").fill(guestName);
  const row = page.getByRole("row").filter({ hasText: guestName });
  await row.getByRole("button", { name: /^Check .* out$/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(guestName)).toBeVisible();
  return { row, dialog };
}

test("an early departure with money owed is checked out with a reason", async ({
  page,
}) => {
  const propertyId = testProperty();
  const { guestName } = anArrival(propertyId);

  await signIn(page);
  await checkIn(page, propertyId, guestName);
  charge(guestName, 4500);

  const { row, dialog } = await openCheckOut(page, propertyId, guestName);
  // Twice: the balance, and the sentence saying it stays open.
  await expect(dialog.getByText("TRY 45.00").first()).toBeVisible();

  // Neither the acknowledgement nor the reason is given: the browser holds the
  // form back and nothing reaches the server.
  await dialog.getByRole("button", { name: "Confirm check-out" }).click();
  await expect(dialog).toBeVisible();

  await dialog.getByRole("checkbox").click();
  await dialog
    .getByLabel("Why the balance stays open")
    .fill("the company pays by transfer");
  await dialog.getByRole("button", { name: "Confirm check-out" }).click();

  await expect(dialog).toBeHidden();
  await expect(row).toHaveCount(0);

  // What the database recorded, which is what the desk was promised.
  expect(
    psql(
      `select reservation.status || '|' || folio.status || '|' || record.reason
         || '|' || (record.context->>'earlyDeparture')
       from public.reservations as reservation
       join public.guests as guest on guest.id = reservation.guest_id
       join public.stays as stay on stay.reservation_id = reservation.id
       join public.folios as folio on folio.stay_id = stay.id
       join audit.records as record
         on record.subject_id = stay.id and record.action = 'stay.checked_out'
       where guest.full_name = '${guestName}'`,
    ),
  ).toBe("checked_out|open|the company pays by transfer|true");
});

test("a bill that changed while the dialog was open is not settled", async ({
  page,
}) => {
  const propertyId = testProperty();
  const { guestName } = anArrival(propertyId);

  await signIn(page);
  await checkIn(page, propertyId, guestName);

  const { dialog } = await openCheckOut(page, propertyId, guestName);
  // Reviewed with nothing owed; a charge lands before the button is pressed.
  charge(guestName, 1200);
  await dialog.getByRole("checkbox").click();
  await dialog.getByRole("button", { name: "Confirm check-out" }).click();

  await expect(
    dialog.getByText(/Something was posted to the bill while you were looking/),
  ).toBeVisible();
  expect(
    psql(
      `select stay.status from public.stays as stay
       join public.reservations as reservation on reservation.id = stay.reservation_id
       join public.guests as guest on guest.id = reservation.guest_id
       where guest.full_name = '${guestName}'`,
    ),
  ).toBe("in_house");
});

test("a booking is cancelled from the arrivals row, with a reason", async ({
  page,
}) => {
  const propertyId = testProperty();
  const { guestName } = anArrival(propertyId);

  await signIn(page);
  await page.goto(`/en/arrivals?property=${propertyId}`);
  await page.getByRole("searchbox").fill(guestName);
  const row = page.getByRole("row").filter({ hasText: guestName });
  await row.getByRole("button", { name: /More actions for/ }).click();
  await page.getByRole("menuitem", { name: "Cancel booking" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Reason").fill("the guest phoned to cancel");
  await dialog.getByRole("button", { name: "Cancel booking" }).click();

  await expect(dialog).toBeHidden();
  await expect(row).toHaveCount(0);
  expect(
    psql(
      `select reservation.status from public.reservations as reservation
       join public.guests as guest on guest.id = reservation.guest_id
       where guest.full_name = '${guestName}'`,
    ),
  ).toBe("cancelled");
});
