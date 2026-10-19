import { randomUUID } from "node:crypto";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { psql } from "./local-database";
import { signIn, testProperty } from "./front-desk";

/**
 * Rooms & beds through the screens a front desk actually uses (RANZ-27).
 *
 * "A shared room is sold by the bed, and a blocked bed cannot be let." The
 * integration suite proves the module and the pgTAP suite proves the policies,
 * the triggers and the constraint. This proves the chain a person walks: rooms
 * added in bulk on Rooms, two Guests booked into two beds of one room for the
 * same nights, one bed blocked with a reason, and the booking form no longer
 * offering it — to a form opened afterwards, and to one that was already open
 * when the block was made.
 *
 * Each run brings rooms of its own under a building of its own, because a room
 * is never deleted and a booking is history; the shared test Property would
 * otherwise collect them.
 */

const EVIDENCE = path.resolve(__dirname, "../../docs/evidence/m1/RANZ-27");

/** Eight digits, so two runs never ask the Property for the same room name. */
function aFirstRoomNumber(): number {
  return 10_000_000 + Math.floor(Math.random() * 80_000_000);
}

/** The Property's own day, offset, in the form the calendar names its days. */
function propertyDay(propertyId: string, days: number): string {
  return psql(
    `select to_char(app.property_today(id) + ${days}, 'YYYY-MM-DD')
     from public.properties where id = '${propertyId}'`,
  );
}

/** One of the figures at the head of Rooms: the number beside its label. */
function figure(page: Page, label: string): Locator {
  return page
    .locator("p", { hasText: new RegExp(`^${label}$`) })
    .locator("xpath=preceding-sibling::p")
    .locator("span")
    .first();
}

async function figures(page: Page) {
  const read = async (label: string) =>
    Number(await figure(page, label).innerText());
  return {
    rooms: await read("Rooms"),
    beds: await read("Beds"),
    reserved: await read("Reserved tonight"),
    empty: await read("Empty beds tonight"),
    blocked: await read("Blocked"),
  };
}

/** Presses a day in the open date-range calendar, turning months as needed. */
async function pickDay(page: Page, iso: string) {
  const day = page.locator(`td:not([data-outside]) [data-day="${iso}"]`);
  for (let turns = 0; turns < 12 && !(await day.isVisible()); turns++) {
    await page.getByRole("button", { name: /next month/i }).click();
  }
  await day.click();
}

/**
 * The booking form, filled down to the bed and the nights, not yet submitted.
 * Returns the dialog and the Unit picker so the caller can read what it offers.
 */
async function openBookingForm(
  page: Page,
  propertyId: string,
  guestName: string,
) {
  await page.goto(`/en/reservations?property=${propertyId}`);
  await page.getByRole("button", { name: "New reservation" }).click();
  const dialog = page.getByRole("dialog", { name: "New reservation" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Guest", { exact: true }).fill(guestName);
  await dialog.getByLabel("Unit").click();
  return dialog;
}

async function chooseNights(page: Page, dialog: Locator, propertyId: string) {
  await dialog.getByRole("button", { name: /^Arrival/ }).click();
  await pickDay(page, propertyDay(propertyId, 0));
  await pickDay(page, propertyDay(propertyId, 2));
}

test("a shared room is sold by the bed, and a blocked bed cannot be let", async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  const propertyId = testProperty();
  const tag = randomUUID().slice(0, 8);
  const building = `E2E Beds ${tag}`;
  const first = aFirstRoomNumber();
  const roomOne = String(first);
  const roomTwo = String(first + 1);
  const guestA = `Test Bed A ${tag}`;
  const guestB = `Test Bed B ${tag}`;
  const guestC = `Test Bed C ${tag}`;
  const reason = `mattress being replaced ${tag}`;

  await signIn(page);

  // RB-S1-09, RB-S2-02: two rooms, three beds each, added in one go.
  await page.goto(`/en/rooms?property=${propertyId}`);
  const before = await figures(page);

  await page.getByRole("button", { name: "Add rooms" }).click();
  const addDialog = page.getByRole("dialog", { name: "Add rooms" });
  await addDialog.getByLabel("Building (optional)").fill(building);
  await addDialog.getByLabel("Floor (optional)").fill("4");
  await addDialog.getByLabel("First room number").fill(roomOne);
  await addDialog.getByLabel("Number of rooms").fill("2");
  await addDialog.getByLabel("Capacity per room (guests)").fill("3");
  await addDialog.getByRole("checkbox", { name: "Let by the bed" }).click();
  await expect(addDialog.getByTestId("add-rooms-preview")).toContainText(
    `Adds 2 rooms: ${roomOne} to ${roomTwo}, floor 4, ${building}, 3 beds per room, A to C`,
  );
  await addDialog.getByRole("button", { name: "Add 2 rooms" }).click();
  await expect(addDialog).toBeHidden();
  await expect(page.getByRole("status")).toContainText(
    `Added 2 rooms: ${roomOne} to ${roomTwo}.`,
  );

  // The bed map: both rooms under the building, three beds each, all free.
  const buildingHeading = page.getByRole("heading", { name: building });
  await expect(buildingHeading).toBeVisible();
  const card = (room: string) =>
    page.locator('[data-slot="card"]').filter({ hasText: room });
  for (const room of [roomOne, roomTwo]) {
    await expect(card(room)).toContainText("3 beds");
    for (const bed of ["A", "B", "C"]) {
      await expect(
        card(room).getByRole("button", { name: new RegExp(`^${bed} Free`) }),
      ).toBeVisible();
    }
  }
  // Occupancy counts count the beds, never the room that holds them.
  expect(await figures(page)).toEqual({
    ...before,
    rooms: before.rooms + 2,
    beds: before.beds + 6,
    empty: before.empty + 6,
  });

  // The same beds in the list, named by their room.
  await page.getByRole("button", { name: "Bed list" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: `${roomOne} — C` }),
  ).toContainText("Bed");
  await page.getByRole("button", { name: "Bed map" }).click();

  // RB-S3-13: the parent is not sellable. The form offers each bed, named by
  // its room, and no option is the room itself.
  const form = await openBookingForm(page, propertyId, guestA);
  await page.keyboard.type(roomOne);
  for (const bed of ["A", "B", "C"]) {
    await expect(
      page.getByRole("option", { name: new RegExp(`^${roomOne} · ${bed}`) }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("option", { name: new RegExp(`^${roomOne}(?! ·)`) }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await form.getByRole("button", { name: "Cancel", exact: true }).click();

  // RB-S2-02: two Guests, two beds of one room, the same nights. Both succeed.
  for (const [guest, bed] of [
    [guestA, "A"],
    [guestB, "B"],
  ] as const) {
    const booking = await openBookingForm(page, propertyId, guest);
    await page.keyboard.type(`${roomOne} · ${bed}`);
    await page
      .getByRole("option", { name: new RegExp(`^${roomOne} · ${bed}`) })
      .click();
    await chooseNights(page, booking, propertyId);
    await booking.getByRole("button", { name: "Create reservation" }).click();
    await expect(booking).toBeHidden();
    await page.getByRole("searchbox").fill(guest);
    await expect(
      page.getByRole("row").filter({ hasText: guest }),
    ).toContainText(`${roomOne} · ${bed}`);
  }
  expect(
    psql(
      `select string_agg(unit.name, ',' order by unit.name)
         from public.reservations as reservation
         join public.guests as guest on guest.id = reservation.guest_id
         join public.accommodation_units as unit
           on unit.id = reservation.accommodation_unit_id
        where guest.full_name in ('${guestA}', '${guestB}')
          and reservation.status = 'confirmed'`,
    ),
  ).toBe("A,B");

  await page.goto(`/en/rooms?property=${propertyId}`);
  expect(await figures(page)).toEqual({
    ...before,
    rooms: before.rooms + 2,
    beds: before.beds + 6,
    reserved: before.reserved + 2,
    empty: before.empty + 4,
  });

  // A booking form opened now, with bed C still on offer, and kept open.
  const stale = await context.newPage();
  const staleForm = await openBookingForm(stale, propertyId, guestC);
  await stale.keyboard.type(`${roomOne} · C`);
  await stale
    .getByRole("option", { name: new RegExp(`^${roomOne} · C`) })
    .click();
  await chooseNights(stale, staleForm, propertyId);

  // RB-S3-01: bed C is blocked from the map, with a reason.
  await card(roomOne)
    .getByRole("button", { name: /^C Free/ })
    .click();
  const blockDialog = page.getByRole("dialog", {
    name: new RegExp(`^Bed C · ${roomOne}$`),
  });
  await blockDialog.getByLabel("Reason for block").fill(reason);
  await blockDialog.getByRole("button", { name: "Block bed" }).click();
  await expect(blockDialog).toBeHidden();
  // The reason is what the bed says, on the map, and the counts follow it.
  const blockedBed = card(roomOne).getByRole("button", { name: /^C / });
  await expect(blockedBed).toContainText(reason);
  // A reason longer than the tile wraps inside it and is read in full, rather
  // than running out of the card where it is clipped.
  const reasonBox = await blockedBed.getByText(reason).boundingBox();
  const cardBox = await card(roomOne).boundingBox();
  expect(reasonBox && cardBox).toBeTruthy();
  expect(reasonBox!.x + reasonBox!.width).toBeLessThanOrEqual(
    cardBox!.x + cardBox!.width,
  );
  expect(await figures(page)).toEqual({
    ...before,
    rooms: before.rooms + 2,
    beds: before.beds + 6,
    reserved: before.reserved + 2,
    empty: before.empty + 3,
    blocked: before.blocked + 1,
  });
  await card(roomOne).scrollIntoViewIfNeeded();
  await card(roomOne).screenshot({
    path: path.join(EVIDENCE, "bed-c-blocked-with-reason.png"),
  });
  await page
    .locator("p", { hasText: /^Blocked$/ })
    .locator("xpath=ancestor::div[contains(@class,'grid-cols-3')][1]")
    .screenshot({ path: path.join(EVIDENCE, "occupancy-counts.png") });

  // RB-S3-13, the direct attempt: the form that was already open still names
  // bed C, and the booking is refused all the same.
  await staleForm.getByRole("button", { name: "Create reservation" }).click();
  await expect(
    staleForm.getByText("That booking cannot be taken."),
  ).toBeVisible();
  expect(
    psql(
      `select count(*) from public.reservations as reservation
         join public.guests as guest on guest.id = reservation.guest_id
        where guest.full_name = '${guestC}'`,
    ),
  ).toBe("0");
  await stale.close();

  // And a form opened afterwards does not offer it: bed A and the other room's
  // beds are there, bed C and the room are not.
  const fresh = await openBookingForm(page, propertyId, guestC);
  await page.keyboard.type(roomOne);
  await expect(
    page.getByRole("option", { name: new RegExp(`^${roomOne} · A`) }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: new RegExp(`^${roomOne} · C`) }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("option", { name: new RegExp(`^${roomOne}(?! ·)`) }),
  ).toHaveCount(0);
  await page.screenshot({
    path: path.join(EVIDENCE, "booking-form-does-not-offer-bed-c.png"),
  });
  await page.keyboard.press("Escape");
  await fresh.getByRole("button", { name: "Cancel", exact: true }).click();

  // RB-S3-08: unblocking gives the bed back to the form.
  await page.goto(`/en/rooms?property=${propertyId}`);
  await card(roomOne).getByRole("button", { name: /^C / }).click();
  const unblockDialog = page.getByRole("dialog", {
    name: new RegExp(`^Bed C · ${roomOne}$`),
  });
  await expect(unblockDialog).toContainText(reason);
  await unblockDialog.getByRole("button", { name: "Unblock bed" }).click();
  await expect(unblockDialog).toBeHidden();
  await expect(
    card(roomOne).getByRole("button", { name: /^C / }),
  ).toContainText("Free");

  await openBookingForm(page, propertyId, guestC);
  await page.keyboard.type(`${roomOne} · C`);
  await expect(
    page.getByRole("option", { name: new RegExp(`^${roomOne} · C`) }),
  ).toBeVisible();
});
