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
  await dialog.getByRole("radio", { name: "Urgent" }).click();
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
