import path from "node:path";

import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./hydration";

import { EMAIL, OWNER_EMAIL, signIn } from "./front-desk";
import { psql } from "./local-database";
import { aServicesProperty, archiveProperties } from "./services-fixtures";

/**
 * The Maintenance and Rooms fixes of the 2026-10-11 UX audit (RANZ-66).
 *
 * Each test is one finding's "done when", walked through the real screens: the
 * room dialog that leads with reporting and says what a block is (ROOMS-07,
 * MAINT-01), the board that orders, searches, remembers its filters in the
 * address and shows people by name (MAINT-04..06, MAINT-11), the Done button
 * that says what it does to the room first (MAINT-03), a report form that
 * starts on the problem and knows what is already open (MAINT-08), and settings
 * that are saved when somebody says so and name their scope (MAINT-13).
 */

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit/RANZ-66",
);

const made: string[] = [];

test.afterAll(() => archiveProperties(made));

function aProperty() {
  const created = aServicesProperty("Maintenance UX");
  made.push(created.propertyId);
  return created;
}

/** Requests written by the owner connection, as the seeded manager. */
function requests(
  propertyId: string,
  roomName: string,
  rows: readonly { title: string; priority: string; status?: string }[],
): void {
  const statements = rows.map(
    ({ title, priority, status }) =>
      `insert into public.maintenance_requests
         (organization_id, property_id, title, accommodation_unit_id, priority)
       select unit.organization_id, unit.property_id, '${title}', unit.id, '${priority}'
         from public.accommodation_units as unit
        where unit.property_id = '${propertyId}' and unit.name = '${roomName}';
       ${
         status
           ? `update public.maintenance_requests set status = '${status}',
                     assignee_id = (select id from public.users
                                     where lower(email) = lower('${EMAIL}'))
               where title = '${title}' and property_id = '${propertyId}';`
           : ""
       }`,
  );
  psql(
    `select app.set_request_context(
       (select id from public.users where lower(email) = lower('${EMAIL}')));
     ${statements.join("\n")}`,
  );
}

function titles(column: Locator): Promise<string[]> {
  return column
    .getByRole("button", { name: /^Open MT-\d+$/ })
    .evaluateAll((cards) =>
      cards.map(
        (card) => card.querySelector("p.line-clamp-2")?.textContent ?? "",
      ),
    );
}

test("a room's dialog leads with reporting and says that a block tells maintenance nothing", async ({
  page,
}) => {
  const { propertyId, roomName } = aProperty();
  await signIn(page);

  await page.goto(`/en/rooms?property=${propertyId}`);
  const tile = page.locator('[data-slot="card"]').filter({ hasText: roomName });
  await tile.getByRole("button").first().click();

  // ROOMS-07: the room is called a room, and the title is its name.
  const dialog = page.getByRole("dialog", { name: roomName });
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toContainText(/\bbed\b/i);

  // MAINT-01: the way to report a broken thing comes first, and the block is
  // the quieter second step that says maintenance is not told.
  const report = dialog.getByRole("link", { name: "Report a problem" });
  const block = dialog.getByRole("button", { name: "Block room" });
  await expect(report).toBeVisible();
  await expect(block).toBeVisible();
  const [reportBox, blockBox] = await Promise.all([
    report.boundingBox(),
    block.boundingBox(),
  ]);
  expect(reportBox!.y).toBeLessThan(blockBox!.y);
  await expect(dialog).toContainText("maintenance is not told");
  await expect(dialog.getByLabel("Reason for block")).toHaveAttribute(
    "placeholder",
    /held for a group/,
  );
  await page.screenshot({ path: path.join(EVIDENCE, "room-dialog.png") });

  // MAINT-08: reporting from here starts on the problem, with the room chosen.
  await report.click();
  const form = page.getByRole("dialog", { name: "Report a problem" });
  await expect(
    form.getByRole("combobox", { name: "Room or bed" }),
  ).toContainText(roomName);
  await expect(
    form.getByRole("textbox", { name: "What is wrong?" }),
  ).toBeFocused();
});

test("a block names the room it blocks and gives it back by the same name", async ({
  page,
}) => {
  const { propertyId, roomName } = aProperty();
  await signIn(page);
  await page.goto(`/en/rooms?property=${propertyId}`);
  const tile = () =>
    page.locator('[data-slot="card"]').filter({ hasText: roomName });

  await tile().getByRole("button").first().click();
  const dialog = page.getByRole("dialog", { name: roomName });
  await dialog.getByLabel("Reason for block").fill("Held for a group");
  await dialog.getByRole("button", { name: "Block room" }).click();
  await expect(dialog).toBeHidden();

  await tile().getByRole("button").first().click();
  const unblock = page.getByRole("dialog", { name: roomName });
  await expect(unblock).toContainText("Held for a group");
  await unblock.getByRole("button", { name: "Unblock room" }).click();
  await expect(unblock).toBeHidden();
});

test("the board puts the urgent and the longest waiting first, finds a request, and keeps its filters in the address", async ({
  page,
}) => {
  const { propertyId, roomName } = aProperty();
  requests(propertyId, roomName, [
    { title: "UX can wait leak", priority: "can_wait" },
    { title: "UX urgent smoke", priority: "urgent" },
    { title: "UX this week paint", priority: "this_week" },
    { title: "UX mine hinge", priority: "this_week", status: "in_progress" },
  ]);
  await signIn(page);
  await page.goto(`/en/maintenance?property=${propertyId}`);

  // MAINT-04: urgent first, then by how long it has waited.
  const newColumn = page.locator('section[aria-labelledby="column-new"]');
  expect(await titles(newColumn)).toEqual([
    "UX urgent smoke",
    "UX this week paint",
    "UX can wait leak",
  ]);

  // MAINT-05: how long each has waited is on the card.
  await expect(newColumn).toContainText(/Reported .* ago/);

  // MAINT-11: people are named, not addressed.
  const inProgress = page.locator(
    'section[aria-labelledby="column-in_progress"]',
  );
  await expect(inProgress).toContainText("Deniz");
  await expect(inProgress).not.toContainText("@");

  // MAINT-04: a search finds a card by what is on it.
  await page.getByRole("searchbox", { name: "Search requests" }).fill("smoke");
  await expect(
    newColumn.getByRole("button", { name: /^Open MT-/ }),
  ).toHaveCount(1);
  await page
    .getByRole("searchbox", { name: "Search requests" })
    .fill("nothing like it");
  // Filtered to nothing is not an empty Property: it says so and offers the way back.
  await expect(page.getByRole("status")).toContainText("No request matches");
  await page.getByRole("button", { name: "Show all requests" }).click();
  await expect(
    newColumn.getByRole("button", { name: /^Open MT-/ }),
  ).toHaveCount(3);

  // MAINT-06: a filter is in the address, so it can be sent and survives a reload.
  await page.getByRole("combobox", { name: "Priority" }).click();
  await page.getByRole("option", { name: "Urgent" }).click();
  await expect(page).toHaveURL(/priority=urgent/);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Priority" })).toContainText(
    "Urgent",
  );
  await expect(
    newColumn.getByRole("button", { name: /^Open MT-/ }),
  ).toHaveCount(1);
  await page.getByRole("combobox", { name: "Priority" }).click();
  await page.getByRole("option", { name: "Any priority" }).click();
  await expect(page).not.toHaveURL(/priority=/);

  // "Assigned to me" is one choice, not a hunt through the roster.
  await page.getByRole("combobox", { name: "Assignee" }).click();
  await page.getByRole("option", { name: "Assigned to me" }).click();
  await expect(page).toHaveURL(/assignee=me/);
  await expect(
    newColumn.getByRole("button", { name: /^Open MT-/ }),
  ).toHaveCount(0);
  await expect(
    inProgress.getByRole("button", { name: /^Open MT-/ }),
  ).toHaveCount(1);
  await page.screenshot({ path: path.join(EVIDENCE, "board-filtered.png") });
});

test("a report knows what is already open for the room, and Done says what it does to the room before it is pressed", async ({
  page,
}) => {
  const { propertyId, roomName } = aProperty();
  requests(propertyId, roomName, [
    { title: "UX already reported tap", priority: "this_week" },
  ]);
  await signIn(page);
  await page.goto(`/en/maintenance?property=${propertyId}`);

  await page.getByRole("button", { name: "New request" }).first().click();
  const form = page.getByRole("dialog", { name: "Report a problem" });
  // MAINT-02: the promise is one the product keeps.
  await expect(form).toContainText("Nobody is notified");
  await form.getByRole("combobox", { name: "Room or bed" }).click();
  await page.getByRole("option", { name: roomName }).click();
  // MAINT-04: somebody about to file a duplicate is shown the first.
  await expect(form.getByRole("note")).toContainText("UX already reported tap");
  await form
    .getByRole("textbox", { name: "What is wrong?" })
    .fill("UX shower will not drain");
  await form
    .getByRole("checkbox", { name: "Take it out of order until it is fixed" })
    .click();
  // MAINT-16: the hint speaks to whoever is reading it.
  await expect(form).toContainText("Nobody will be able to sell it");
  await form.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText(/Request MT-\d+ sent\./)).toBeVisible();

  // MAINT-03: the sentence is there before the click.
  await page
    .getByRole("button", { name: /^Open MT-\d+$/ })
    .filter({ hasText: "UX shower will not drain" })
    .click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText(
    `Done also puts ${roomName} back on sale, as Dirty.`,
  );

  // MAINT-11: nobody is assigned, and the viewer can take it in one press.
  await sheet.getByRole("button", { name: "Assign to me" }).click();
  await expect(
    sheet.getByRole("combobox", { name: "Assigned to" }),
  ).toContainText("Deniz");
  await expect(sheet.getByRole("button", { name: "Assign to me" })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: path.join(EVIDENCE, "done-names-the-room.png"),
  });
});

test("a setting is saved when somebody says so, and the Organization's names every Property", async ({
  page,
}) => {
  const { propertyId } = aProperty();
  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/maintenance?property=${propertyId}`);
  await page.getByRole("tab", { name: "Settings" }).click();

  const ownAnswer = page.locator("#assigneeRequired-property");
  const orgAnswer = page.locator("#assigneeRequired-organization");
  const saveProperty = page.getByRole("button", {
    name: "Save for this Property",
  });
  const saveOrganization = page.getByRole("button", {
    name: "Save for every Property",
  });

  // MAINT-13: choosing changes nothing until Save.
  await expect(saveProperty).toBeDisabled();
  await ownAnswer.click();
  await page.getByRole("option", { name: "Yes", exact: true }).click();
  await expect(
    page.getByText("You have changes that are not saved yet."),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Settings" }).click();
  await expect(ownAnswer).not.toContainText(/^Yes$/);

  await ownAnswer.click();
  await page.getByRole("option", { name: "Yes", exact: true }).click();
  await saveProperty.click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Settings" }).click();
  await expect(ownAnswer).toContainText("Yes");

  // The Organization's answer governs every Property, and says so first.
  await orgAnswer.click();
  await page.getByRole("option", { name: "Yes", exact: true }).click();
  await saveOrganization.click();
  const confirm = page.getByRole("dialog", {
    name: "Change this for every Property?",
  });
  await expect(confirm).toContainText(
    "This changes Somebody is assigned before work starts for every Property",
  );
  await page.screenshot({
    path: path.join(EVIDENCE, "organization-confirm.png"),
  });
  await confirm.getByRole("button", { name: "Keep editing" }).click();
  await expect(confirm).toBeHidden();
  await page.reload();
  await page.getByRole("tab", { name: "Settings" }).click();
  await expect(orgAnswer).not.toContainText(/^Yes$/);

  // Put the one answer this test wrote back.
  await ownAnswer.click();
  await page.getByRole("option", { name: /^Use the Organization's/ }).click();
  await saveProperty.click();
  await expect(page.getByText("Saved.")).toBeVisible();
});

test("the room dialog and the board read right to left in Arabic", async ({
  page,
}: {
  page: Page;
}) => {
  const { propertyId, roomName } = aProperty();
  await signIn(page);
  await page.goto(`/ar/rooms?property=${propertyId}`);
  const tile = page.locator('[data-slot="card"]').filter({ hasText: roomName });
  await tile.getByRole("button").first().click();
  const dialog = page.getByRole("dialog", { name: roomName });
  await expect(dialog).toContainText("ولا يُبلَّغ فريق الصيانة");
  await expect(
    dialog.getByRole("button", { name: "إغلاق الغرفة" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});
