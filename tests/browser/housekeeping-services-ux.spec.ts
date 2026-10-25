import path from "node:path";

import { expect } from "@playwright/test";
import { test } from "./hydration";

import { EMAIL, aStaffMember, signIn } from "./front-desk";
import { psql } from "./local-database";
import { guestInHouse } from "./services-fixtures";
import { aPropertyWithRooms } from "./ux-rooms";

/**
 * Housekeeping, Maintenance and Guest Experience at a phone's width, and the
 * Maintenance drawer for somebody who may read it and not change it: the
 * 2026-10-24 audit's HOUSEKEEPING group (lane 06).
 *
 * Each test brings a Property of its own, because a Stay and a request are
 * history that is never deleted.
 */

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit-2026-10-24/housekeeping-services",
);

/** A request on a room, written by the owner connection as the seeded Manager. */
function aRequest(
  propertyId: string,
  roomName: string,
  title: string,
  assignedTo?: string,
): void {
  psql(
    `select app.set_request_context(
       (select id from public.users where lower(email) = lower('${EMAIL}')));
     insert into public.maintenance_requests
       (organization_id, property_id, title, accommodation_unit_id, priority)
     select unit.organization_id, unit.property_id, '${title}', unit.id, 'urgent'
       from public.accommodation_units as unit
      where unit.property_id = '${propertyId}' and unit.name = '${roomName}';
     ${
       assignedTo
         ? `update public.maintenance_requests
               set assignee_id = (select id from public.users
                                   where lower(email) = lower('${assignedTo}'))
             where title = '${title}' and property_id = '${propertyId}';`
         : ""
     }`,
  );
}

test("on a phone the board is one short row of counts, says who is in each room, and reports from the row menu", async ({
  page,
}) => {
  const { propertyId } = aPropertyWithRooms("hk phone", [
    { name: "101", status: "dirty" },
    { name: "102", status: "dirty" },
    { name: "103", status: "clean" },
  ]);
  guestInHouse(propertyId, "102", "Ada Occupant");
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  await page.goto(`/en/housekeeping?property=${propertyId}`);

  // HOUSEKEEPING-05: the three status counts are the chips below, said once.
  await expect(page.locator("p", { hasText: /^Rooms$/ }).first()).toBeVisible();
  for (const label of ["Dirty", "Clean", "Inspected"]) {
    await expect(
      page.locator("p", { hasText: new RegExp(`^${label}$`) }),
    ).toBeHidden();
  }
  const first = page.getByRole("row", { name: /101/ });
  expect((await first.boundingBox())!.y).toBeLessThan(560);

  // HOUSEKEEPING-04: whether to knock is on the first screen of every row.
  await expect(first).toContainText("Vacant");
  await expect(page.getByRole("row", { name: /102/ })).toContainText(
    "Guest in house",
  );
  await page.screenshot({
    path: path.join(EVIDENCE, "phone-board-counts-and-occupancy.png"),
  });

  // HOUSEKEEPING-03: the bar over the list is icons in one short row, with
  // every button still a thumb's size and still named.
  // A row's tick is named for its room; the header's reads "Select all …".
  await page
    .getByRole("checkbox", { name: /^Select (?!all)/ })
    .first()
    .click();
  const bar = page.locator("div.sticky", { hasText: "Clear selection" });
  await expect(bar).toBeVisible();
  expect((await bar.boundingBox())!.height).toBeLessThan(130);
  // Two rows, not three, on a 360-wide phone as well: at 375 the count and
  // "Select all 3 rooms in this filter" left eleven pixels to spare, which a
  // narrower screen or the Linux build's text metrics (CI) used up, wrapping
  // the sentence onto a row of its own.
  await page.setViewportSize({ width: 360, height: 812 });
  expect((await bar.boundingBox())!.height).toBeLessThan(130);
  await page.setViewportSize({ width: 375, height: 812 });
  for (const name of ["Mark clean", "Mark inspected", "Mark dirty"]) {
    const button = page.getByRole("button", { name });
    const box = (await button.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeLessThan(80);
  }
  await page.screenshot({
    path: path.join(EVIDENCE, "phone-bulk-bar-one-row.png"),
  });
  await page.getByRole("button", { name: "Clear selection" }).click();

  // HOUSEKEEPING-06: Report a problem is in the row menu, not a grey line
  // beside the tick, and it opens the form on that room.
  await expect(
    first.getByRole("link", { name: "Report a problem" }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Actions for 101" }).click();
  await page.getByRole("menuitem", { name: "Report a problem" }).click();
  await expect(page).toHaveURL(/\/en\/maintenance\?property=.*&report=/);

  // HOUSEKEEPING-09: the form's masthead is short on a phone, so the first
  // field is on the first screen, and the heading is whole.
  const dialog = page.getByRole("dialog", { name: "Report a problem" });
  await expect(dialog.getByText("What needs fixing?")).toBeVisible();
  const field = dialog.getByRole("textbox", { name: "What is wrong?" });
  await expect(field).toBeVisible();
  const fieldBox = (await field.boundingBox())!;
  expect(fieldBox.y + fieldBox.height).toBeLessThanOrEqual(812);
  await page.screenshot({
    path: path.join(EVIDENCE, "phone-report-form-first-field-on-screen.png"),
  });
});

test("the board reads in Arabic on a phone: occupancy under the room, nothing sideways on the page", async ({
  page,
}) => {
  const { propertyId } = aPropertyWithRooms("hk phone ar", [
    { name: "101", status: "dirty" },
    { name: "102", status: "dirty" },
  ]);
  guestInHouse(propertyId, "102", "Ada Occupant");
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  await page.goto(`/ar/housekeeping?property=${propertyId}`);

  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("row", { name: /102/ })).toContainText(
    "نزيل مقيم",
  );
  const widths = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  expect(widths[0]).toBeLessThanOrEqual(widths[1]!);
  await page.getByRole("button", { name: /101/ }).last().click();
  await expect(
    page.getByRole("menuitem", { name: "الإبلاغ عن مشكلة" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(EVIDENCE, "phone-board-arabic.png"),
  });
});

test("somebody who may read a request and not change it sees text, not greyed selects, and the reason once", async ({
  page,
  request,
  baseURL,
}) => {
  const { propertyId } = aPropertyWithRooms("hk drawer", [{ name: "209" }]);
  const { email } = await aStaffMember(
    request,
    baseURL!,
    propertyId,
    "housekeeping",
  );
  aRequest(propertyId, "209", "Window will not close at all", email);
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, email);
  await page.goto(`/en/maintenance?property=${propertyId}`);

  await page
    .getByRole("button", { name: /^Open MT-\d+$/ })
    .filter({ hasText: "Window will not close at all" })
    .click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText(
    "You can read this request but not change it",
  );
  await expect(
    sheet.getByRole("combobox", { name: "Assigned to" }),
  ).toHaveCount(0);
  await expect(sheet.getByRole("combobox", { name: "Priority" })).toHaveCount(
    0,
  );
  await expect(sheet).toContainText("Urgent");

  // HOUSEKEEPING-09: the title that says which request this is is whole, not
  // cut off behind the drawing.
  await page.screenshot({
    path: path.join(EVIDENCE, "phone-drawer-read-only-title-whole.png"),
  });
  const title = sheet.locator("header p").first();
  const [titleBox, sheetBox] = [
    (await title.boundingBox())!,
    (await sheet.boundingBox())!,
  ];
  expect(titleBox.width).toBeGreaterThan(sheetBox.width * 0.7);
  expect(
    await title.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
});

test("the room's Guest and the day they leave are on screen before the first press that takes it out of order", async ({
  page,
}) => {
  const { propertyId } = aPropertyWithRooms("hk impact", [{ name: "310" }]);
  guestInHouse(propertyId, "310", "Ada Occupant");
  aRequest(propertyId, "310", "Shower will not drain");
  await signIn(page);
  await page.goto(`/en/maintenance?property=${propertyId}`);

  await page
    .getByRole("button", { name: /^Open MT-\d+$/ })
    .filter({ hasText: "Shower will not drain" })
    .click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Take room out of order" }).click();

  // Nothing has been sent yet, and the sentence is there.
  await expect(sheet).toContainText("Ada Occupant");
  await expect(sheet).toContainText("Take it out of order anyway");
  await page.screenshot({
    path: path.join(EVIDENCE, "drawer-names-the-guest-before-the-press.png"),
  });

  await sheet
    .getByRole("button", { name: "Take it out of order anyway" })
    .click();
  await expect(sheet).toContainText("Out of order");
});

test("on a phone the Guest Experience tabs share the width, and all three are whole", async ({
  page,
}) => {
  const { propertyId } = aPropertyWithRooms("hk gx tabs", [{ name: "101" }]);
  psql(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     select id, organization_id, 'guest_experience', true
       from public.properties where id = '${propertyId}'
     on conflict do nothing`,
  );
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  await page.goto(`/en/guest-experience?property=${propertyId}`);

  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(3);
  for (const index of [0, 1, 2]) {
    const box = (await tabs.nth(index).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
  }
  const list = page.getByRole("tablist");
  expect(
    await list.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: path.join(EVIDENCE, "phone-guest-experience-tabs.png"),
  });

  await page.goto(`/ar/guest-experience?property=${propertyId}`);
  await expect(page.getByRole("tab")).toHaveCount(3);
  const arabic = page.getByRole("tablist");
  expect(
    await arabic.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
});
