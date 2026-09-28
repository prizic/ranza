import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { psql } from "./local-database";
import { signIn, testProperty } from "./front-desk";

/**
 * Changing a booking through the screen (ADR 0039, amend-booking slice 1).
 *
 * The pgTAP suite proves the command and the integration suite the races and
 * the preview's agreement with saving. This proves what only a browser sees:
 * Change booking is on the booking's own row, it previews the nights and the
 * Units before anything is saved, a save lands on the list, and a link from a
 * maintenance warning opens the same dialog — in Arabic laid out from the
 * right.
 *
 * Each test brings its own rooms and an unpriced booking on them, so nothing
 * here fixes the tests' Property's currency, and a change cannot collide with
 * another run's.
 */

let propertyId = "";

test.beforeAll(() => {
  propertyId = testProperty();
});

/** Two rooms and an unpriced booking on the first, ten days out. */
function aBooking(): {
  guestName: string;
  first: string;
  second: string;
  reservationId: string;
} {
  const tag = randomUUID().slice(0, 8);
  const guestName = `Change ${tag}`;
  const first = `E2E-AB-${tag}-1`;
  const second = `E2E-AB-${tag}-2`;
  const reservationId = psql(
    `with target as (
       select id, organization_id from public.properties where id = '${propertyId}'
     ), unit as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity)
       select id, organization_id, name, 'room', 2
         from target, (values ('${first}'), ('${second}')) as n(name)
       returning id, name, property_id, organization_id
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
            app.property_today(unit.property_id) + 10,
            app.property_today(unit.property_id) + 12
       from unit, guest
      where unit.name = '${first}'
     returning id`,
  );
  return { guestName, first, second, reservationId };
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

test("change_actions_are_where_the_desk_works: a booking moves to other nights and another room", async ({
  page,
}) => {
  const booking = aBooking();
  await signIn(page);
  await page.goto(`/en/reservations?property=${propertyId}`);

  await page.getByPlaceholder(/search/i).fill(booking.guestName);
  await page
    // The name is isolated for bidi, so it is matched around the marks.
    .getByRole("button", {
      name: new RegExp(`More actions for .?${booking.guestName}`),
    })
    .click();
  await page.getByRole("menuitem", { name: "Change booking" }).click();

  const dialog = page.getByRole("dialog", { name: "Change booking" });
  // As it stands, there is nothing to save yet.
  await expect(
    dialog.getByText(
      "The dates and the Unit are the same: there is nothing to change.",
    ),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Save change" }),
  ).toBeDisabled();

  await dialog.getByLabel("Unit").click();
  await page
    .getByRole("option", { name: new RegExp(`${booking.second}.*Free`) })
    .click();
  await dialog.getByRole("button", { name: /^Arrival/ }).click();
  await pickDay(page, propertyDay(11));
  await pickDay(page, propertyDay(13));
  // The calendar's own Done: Escape would close the dialog under it as well.
  const done = page.getByRole("button", { name: "Done" });
  if (await done.isVisible()) await done.click();
  await expect(
    dialog.getByText("Room has no price: the booking will be unpriced."),
  ).toBeVisible();
  await dialog.getByLabel("Note (optional)").fill("The Guest asked");
  await dialog.getByRole("button", { name: "Save change" }).click();

  await expect(dialog).toBeHidden();
  const row = page.getByRole("row", { name: new RegExp(booking.guestName) });
  await expect(row.getByText(booking.second)).toBeVisible();

  expect(
    psql(
      `select kind || ' ' || to_starts_on || ' ' || coalesce(note, '')
         from public.reservation_changes
        where reservation_id = '${booking.reservationId}'`,
    ),
  ).toBe(`amended ${propertyDay(11)} The Guest asked`);
});

test("an_affected_booking_opens_in_change_booking, laid out from the right in Arabic", async ({
  page,
}) => {
  const booking = aBooking();
  await signIn(page);
  await page.goto(
    `/ar/reservations?property=${propertyId}&change=${booking.reservationId}`,
  );

  const dialog = page.getByRole("dialog", { name: "تعديل الحجز" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("direction", "rtl");
  await expect(
    dialog.getByText("التواريخ والوحدة كما هي: لا يوجد ما يُعدَّل."),
  ).toBeVisible();

  // Closing it drops the link, so a refresh does not open it again.
  await dialog.getByRole("button", { name: "إبقاؤه كما كان" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/change=/);
});

test("an_in_house_guest_is_extended_from_departures", async ({ page }) => {
  const tag = randomUUID().slice(0, 8);
  const guestName = `Extend ${tag}`;
  psql(
    `with target as (
       select id, organization_id from public.properties where id = '${propertyId}'
     ), unit as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity)
       select id, organization_id, 'E2E-EX-${tag}', 'room', 2 from target
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
            app.property_today(unit.property_id) + 2
       from unit, guest`,
  );
  await signIn(page);

  await page.goto(`/en/arrivals?property=${propertyId}`);
  await page.getByRole("searchbox").fill(guestName);
  const arrival = page.getByRole("row").filter({ hasText: guestName });
  await arrival.getByRole("button", { name: "Check in" }).click();
  await expect(arrival.getByText("Checked in")).toBeVisible();

  await page.goto(`/en/departures?property=${propertyId}&view=in_house`);
  await page.getByRole("searchbox").fill(guestName);
  await page
    .getByRole("button", {
      name: new RegExp(`More actions for .?${guestName}`),
    })
    .click();
  await page.getByRole("menuitem", { name: "Change departure" }).click();

  const dialog = page.getByRole("dialog", { name: "Change departure" });
  await expect(
    dialog.getByText("That is already the departure."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: /^Departure/ }).click();
  await pickDay(page, propertyDay(4));
  await expect(dialog.getByText(/^2 more nights/)).toBeVisible();
  await dialog.getByRole("button", { name: "Save departure" }).click();
  await expect(dialog).toBeHidden();

  expect(
    psql(
      `select stay.ends_on = app.property_today(stay.property_id) + 4
              and reservation.ends_on = stay.ends_on
         from public.stays as stay
         join public.reservations as reservation on reservation.id = stay.reservation_id
         join public.guests as guest on guest.id = reservation.guest_id
        where guest.full_name = '${guestName}' and stay.status = 'in_house'`,
    ),
  ).toBe("t");
});

test("a_guest_is_moved_to_another_room from Departures", async ({ page }) => {
  const tag = randomUUID().slice(0, 8);
  const guestName = `Move ${tag}`;
  const from = `E2E-MV-${tag}-1`;
  const to = `E2E-MV-${tag}-2`;
  psql(
    `with target as (
       select id, organization_id from public.properties where id = '${propertyId}'
     ), unit as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity)
       select id, organization_id, name, 'room', 2
         from target, (values ('${from}'), ('${to}')) as n(name)
       returning id, name, property_id, organization_id
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
            app.property_today(unit.property_id) + 2
       from unit, guest
      where unit.name = '${from}'`,
  );
  await signIn(page);

  await page.goto(`/en/arrivals?property=${propertyId}`);
  await page.getByRole("searchbox").fill(guestName);
  const arrival = page.getByRole("row").filter({ hasText: guestName });
  await arrival.getByRole("button", { name: "Check in" }).click();
  await expect(arrival.getByText("Checked in")).toBeVisible();

  await page.goto(`/en/departures?property=${propertyId}&view=in_house`);
  await page.getByRole("searchbox").fill(guestName);
  await page
    .getByRole("button", {
      name: new RegExp(`More actions for .?${guestName}`),
    })
    .click();
  await page.getByRole("menuitem", { name: "Move Guest" }).click();

  const dialog = page.getByRole("dialog", { name: "Move Guest" });
  await dialog.getByLabel("Unit").click();
  await page.getByRole("option", { name: new RegExp(`${to}.*Free`) }).click();
  await dialog.getByRole("combobox", { name: "Reason" }).click();
  await page.getByRole("option", { name: "The room has a fault" }).click();
  await expect(
    dialog.getByText(
      /a move does not change the price|The booking has no price/,
    ),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Move Guest" }).click();
  await expect(dialog).toBeHidden();

  const row = page.getByRole("row", { name: new RegExp(guestName) });
  await expect(row.getByText(to)).toBeVisible();
  expect(
    psql(
      `select change.reason_kind || ' ' || left_unit.name
         from public.reservation_changes as change
         join public.accommodation_units as left_unit on left_unit.id = change.from_unit_id
         join public.stays as stay on stay.id = change.stay_id
         join public.reservations as reservation on reservation.id = stay.reservation_id
         join public.guests as guest on guest.id = reservation.guest_id
        where guest.full_name = '${guestName}' and change.kind = 'moved'`,
    ),
  ).toBe(`fault ${from}`);
});

test("change_actions_are_where_the_desk_works: a Guest is moved from the room calendar's drawer, which follows them", async ({
  page,
}) => {
  const tag = `E2E-DR-${randomUUID().slice(0, 6)}`;
  const guestName = `Drawer ${tag}`;
  const from = `${tag}-1`;
  const to = `${tag}-2`;
  psql(
    `with target as (
       select id, organization_id from public.properties where id = '${propertyId}'
     ), unit as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity)
       select id, organization_id, name, 'room', 2
         from target, (values ('${from}'), ('${to}')) as n(name)
       returning id, name, property_id, organization_id
     ), guest as (
       insert into public.guests (organization_id, full_name)
       select organization_id, '${guestName}' from target
       returning id
     ), arrived as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       select unit.organization_id, unit.property_id, unit.id, guest.id,
              'guest', 'checked_in',
              app.property_today(unit.property_id) - 1,
              app.property_today(unit.property_id) + 2
         from unit, guest
        where unit.name = '${from}'
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
  await page.goto(`/en/room-calendar?property=${propertyId}&q=${tag}`);

  const bar = page.getByRole("button", {
    name: new RegExp(`^${guestName}, In house`),
  });
  await bar.click();
  const drawer = page.getByRole("dialog", { name: guestName });
  await expect(drawer.getByText(from, { exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: "Move Guest" }).click();

  const dialog = page.getByRole("dialog", { name: "Move Guest" });
  await dialog.getByLabel("Unit").click();
  await page.getByRole("option", { name: new RegExp(`${to}.*Free`) }).click();
  await dialog.getByRole("combobox", { name: "Reason" }).click();
  await page.getByRole("option", { name: "The Guest asked" }).click();
  await dialog.getByRole("button", { name: "Move Guest" }).click();
  await expect(dialog).toBeHidden();

  // The drawer follows the Guest to the room they are in now, and says since
  // when; the night already slept stays drawn in the room they left.
  await expect(drawer.getByText(to, { exact: true })).toBeVisible();
  await expect(drawer.getByText("In this room since")).toBeVisible();
  await expect(drawer.getByText("In house")).toBeVisible();
});
