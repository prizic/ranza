import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { psql } from "./local-database";
import { signIn, testProperty } from "./front-desk";

/**
 * Maintenance through the screens a front desk actually uses (RANZ-33).
 *
 * The pgTAP suite proves the policies and the worker's function, and the
 * integration suite proves the module, the holds and the races. This proves
 * what neither can see: that Rooms hands a problem over to the report form,
 * that the room then reads Out of order where the desk looks, and that moving
 * the request to Done gives the room back.
 *
 * Each run brings its own room, as the housekeeping suite does, because a
 * report and a return are history that is never deleted.
 */

function aRoom(propertyId: string): string {
  const unitName = `E2E-MT-${randomUUID().slice(0, 8)}`;
  psql(
    `insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity)
     select id, organization_id, '${unitName}', 'room', 2
       from public.properties where id = '${propertyId}'`,
  );
  return unitName;
}

test("a problem reported from Rooms takes the room out of order until it is done", async ({
  page,
}) => {
  const propertyId = testProperty();
  const unitName = aRoom(propertyId);
  const title = `The window will not close ${unitName}`;

  await signIn(page);

  // MT-S1-24: Rooms hands the problem over, with the room already chosen.
  await page.goto(`/en/rooms?property=${propertyId}`);
  const tile = page.locator('[data-slot="card"]').filter({ hasText: unitName });
  await tile.getByRole("button").first().click();
  await page.getByRole("link", { name: "Report a problem" }).click();

  const dialog = page.getByRole("dialog", { name: "Report a problem" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("combobox", { name: "Room or bed" }),
  ).toContainText(unitName);

  // MT-S2-01: reported and taken out of order in one step.
  await dialog.getByRole("textbox", { name: "What is wrong?" }).fill(title);
  await dialog.getByRole("button", { name: "Urgent" }).click();
  await expect(dialog.getByRole("button", { name: "Urgent" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await dialog
    .getByRole("checkbox", { name: "Take it out of order until it is fixed" })
    .click();
  await dialog.getByRole("button", { name: "Send request" }).click();

  await expect(page.getByText(/Request MT-\d+ sent\./)).toBeVisible();

  // A sent report does not come back: the next one starts empty.
  await page.getByRole("button", { name: "New request" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Report a problem" })
      .getByRole("textbox", { name: "What is wrong?" }),
  ).toHaveValue("");
  await page.keyboard.press("Escape");
  const card = page.getByRole("button", { name: /^Open MT-\d+$/ }).filter({
    hasText: title,
  });
  await expect(card).toContainText("Out of order");
  await expect(card).toContainText("Urgent");

  // MT-S1-29: a priority filter hides a card that does not match it, and
  // "Out of order only" keeps one that holds its room.
  await page.getByRole("combobox", { name: "Priority" }).click();
  await page.getByRole("option", { name: "Can wait" }).click();
  await expect(card).toBeHidden();
  await page.getByRole("combobox", { name: "Priority" }).click();
  await page.getByRole("option", { name: "Any priority" }).click();
  await page.getByRole("checkbox", { name: "Out of order only" }).click();
  await expect(card).toBeVisible();
  await page.getByRole("checkbox", { name: "Out of order only" }).click();

  // MT-S2-28, MT-DIFF-01: Rooms says so, in the words Arrivals uses.
  await page.goto(`/en/rooms?property=${propertyId}`);
  await expect(
    page.locator('[data-slot="card"]').filter({ hasText: unitName }),
  ).toContainText(/Out of order · MT-\d+/);

  // MT-S1-11, MT-S2-14: done gives the room back.
  await page.goto(`/en/maintenance?property=${propertyId}`);
  await page
    .getByRole("button", { name: /^Open MT-\d+$/ })
    .filter({ hasText: title })
    .click();
  // A move that is not to done keeps the room out and says nothing more.
  await page.getByRole("button", { name: "Move to In progress" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.getByRole("button", { name: "Move to Done" }).click();
  await expect(page.getByText("The room is back in service.")).toBeVisible();

  await page.goto(`/en/rooms?property=${propertyId}`);
  await expect(
    page.locator('[data-slot="card"]').filter({ hasText: unitName }),
  ).not.toContainText("Out of order");
});

test("taking out a room somebody is booked into asks first, and the answer keeps the form", async ({
  page,
}) => {
  const propertyId = testProperty();
  const unitName = aRoom(propertyId);
  const guestName = `Test Maintenance ${unitName.slice(-8)}`;
  psql(
    `with guest as (
       insert into public.guests (organization_id, full_name)
       select organization_id, '${guestName}'
         from public.properties where id = '${propertyId}'
       returning id
     )
     insert into public.reservations
       (organization_id, property_id, accommodation_unit_id,
        guest_id, stay_type, status, starts_on, ends_on)
     select unit.organization_id, unit.property_id, unit.id,
            guest.id, 'guest', 'confirmed',
            app.property_today(unit.property_id),
            app.property_today(unit.property_id) + 2
       from public.accommodation_units as unit, guest
      where unit.property_id = '${propertyId}' and unit.name = '${unitName}'`,
  );

  await signIn(page);
  await page.goto(`/en/maintenance?property=${propertyId}`);
  await page.getByRole("button", { name: "New request" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Report a problem" });
  const room = dialog.getByRole("combobox", { name: "Room or bed" });
  await room.click();
  await page.getByRole("option", { name: unitName }).click();
  await expect(room).toContainText(unitName);
  await dialog
    .getByRole("textbox", { name: "What is wrong?" })
    .fill("Broken window latch");
  const outOfOrder = dialog.getByRole("checkbox", {
    name: "Take it out of order until it is fixed",
  });
  await outOfOrder.click();
  await dialog.getByRole("button", { name: "Send request" }).click();

  // MT-S2-10: who is booked, before anything is written — and the room and
  // the switch are still what was sent. React resets a form after its action,
  // and Radix answered that reset by clearing both, so the confirmation below
  // either never appeared or sent a report that left the room in service.
  await expect(dialog.getByText("Somebody is affected")).toBeVisible();
  await expect(dialog).toContainText(guestName);
  await expect(room).toContainText(unitName);
  await expect(outOfOrder).toBeChecked();

  await dialog
    .getByRole("button", { name: "Take it out of order anyway" })
    .click();
  await expect(page.getByText(/Request MT-\d+ sent\./)).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: /^Open MT-\d+$/ })
      .filter({ hasText: "Broken window latch" })
      .filter({ hasText: unitName }),
  ).toContainText("Out of order");
  // Nothing was cancelled: the desk moves the booking, not the form.
  expect(
    psql(
      `select reservation.status from public.reservations as reservation
         join public.guests as guest on guest.id = reservation.guest_id
        where guest.full_name = '${guestName}'`,
    ),
  ).toBe("confirmed");
});

test("the board reads right to left in Arabic", async ({ page }) => {
  const propertyId = testProperty();
  await signIn(page);
  await page.goto(`/ar/maintenance?property=${propertyId}`);

  // MT-S1-27.
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { level: 1, name: /^الصيانة في/ }),
  ).toBeVisible();

  // And the board inside the tabs mirrors too: a Radix primitive takes its
  // direction from context, not from <html dir>, so New — the first column —
  // is the rightmost one.
  const first = await page
    .getByRole("heading", { level: 2, name: /جديد/ })
    .boundingBox();
  const last = await page
    .getByRole("heading", { level: 2, name: /منجز/ })
    .boundingBox();
  expect(first && last && first.x > last.x).toBe(true);
});

test("equipment is registered, serviced through a work order, and retired", async ({
  page,
}) => {
  const propertyId = testProperty();
  const name = `E2E boiler ${randomUUID().slice(0, 8)}`;

  await signIn(page);
  await page.goto(`/en/maintenance?property=${propertyId}`);
  await page.getByRole("tab", { name: "Equipment" }).click();

  // MT-S3-01, MT-S3-02: an item in a named place. Never serviced, so its first
  // service is due today — no fixture date to drift.
  await page.getByRole("button", { name: "Add equipment" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add equipment" });
  await dialog.getByRole("textbox", { name: "Name" }).fill(name);
  await dialog.getByRole("textbox", { name: "Category" }).fill("Heating");
  await dialog.getByRole("textbox", { name: "Place" }).fill("Boiler room");
  await dialog
    .getByRole("spinbutton", { name: "Serviced every (months)" })
    .fill("6");
  await dialog.getByRole("button", { name: "Save" }).click();
  // The first action this suite sends from the Equipment tab, which a cold
  // `next dev` compiles on submission (see playwright.config.ts): measured at
  // over fifteen seconds cold and under five warm.
  await expect(dialog).toBeHidden({ timeout: 45_000 });

  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("Service due");
  await expect(row).toContainText("Boiler room");

  // MT-S4-01, MT-S4-02: the plan raises a work order, and then shows it
  // instead of the button (MT-S4-03).
  await page.getByRole("tab", { name: "Service plan" }).click();
  const planned = page.getByRole("listitem").filter({ hasText: name });
  await expect(planned).toContainText("Due today");
  await planned.getByRole("button", { name: "Create work order" }).click();
  await expect(planned).toContainText(/Work order MT-\d+ open/);

  // MT-S5-01: what it cost, in the drawer, as a person types it.
  await page.getByRole("tab", { name: "Requests" }).click();
  const card = page
    .getByRole("button", { name: /^Open MT-\d+$/ })
    .filter({ hasText: `Service: ${name}` });
  await card.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText("Service");
  await expect(sheet).toContainText(name);
  await sheet.getByRole("textbox", { name: /^Cost/ }).fill("450,5");
  await sheet.getByRole("textbox", { name: "Done by" }).fill("Boğaz Teknik");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByText("Saved.")).toBeVisible();

  // MT-S4-04: done records the service, so the item is working again.
  // "Saved." is already on the drawer from the cost, so it proves nothing
  // here: wait for the move itself, or the reload below races it.
  await sheet.getByRole("button", { name: "Move to Done" }).click();
  await expect(
    sheet.getByRole("button", { name: "Move to Done" }),
  ).toBeHidden();
  await page.keyboard.press("Escape");

  await page.reload();
  await page
    .getByRole("button", { name: /^Open MT-\d+$/ })
    .filter({ hasText: `Service: ${name}` })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("textbox", { name: /^Cost/ }),
  ).toHaveValue("450.5");
  await page.keyboard.press("Escape");

  await page.getByRole("tab", { name: "Equipment" }).click();
  await expect(row).toContainText("Working");

  // MT-S3-06: retired, not deleted — gone from the register until asked for.
  await row.getByRole("button", { name: "Retire" }).click();
  await expect(row).toBeHidden();
  await page.getByRole("checkbox", { name: "Show retired" }).click();
  await expect(row).toContainText("Retired");
});
