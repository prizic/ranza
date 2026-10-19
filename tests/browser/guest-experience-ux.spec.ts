import path from "node:path";

import { expect, type Page } from "@playwright/test";
import { test } from "./hydration";

import { EMAIL, HOUSEKEEPER_EMAIL, signIn } from "./front-desk";
import { psql } from "./local-database";
import {
  aServicesProperty,
  archiveProperties,
  assignToProperty,
  guestInHouse,
} from "./services-fixtures";

/**
 * The Guest Experience fixes of the 2026-10-11 UX audit (RANZ-64).
 *
 * Walked through the real screen: a request is assigned and found again as
 * "mine" (GX-01), a cancelled one reopens and says what became of it
 * (GX-02, GX-03, GX-09), an answer the server gives is shown (GX-08), the
 * queue is ordered by urgency (GX-04), somebody who may only log requests is
 * told so and is not offered buttons that cannot work (GX-05), a search that
 * finds nothing does not claim the queue is empty (GX-10), and the page works
 * on a phone and in Arabic (GX-06).
 */

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit/RANZ-64",
);

const made: string[] = [];

test.afterAll(() => archiveProperties(made));

function aProperty() {
  const created = aServicesProperty("Guest Experience UX");
  made.push(created.propertyId);
  return created;
}

/** Requests written by the owner connection, as the seeded manager. */
function requests(
  propertyId: string,
  rows: readonly { title: string; priority: string }[],
): void {
  const statements = rows.map(
    ({ title, priority }) =>
      `insert into public.service_requests
         (organization_id, property_id, title, priority, category)
       select organization_id, id, '${title}', '${priority}', 'amenities'
         from public.properties where id = '${propertyId}';`,
  );
  psql(
    `select app.set_request_context(
       (select id from public.users where lower(email) = lower('${EMAIL}')));
     ${statements.join("\n")}`,
  );
}

const row = (page: Page, title: string) =>
  page.getByRole("row").filter({ hasText: title });

test("the queue puts the urgent first, a request is assigned, and mine can be found again", async ({
  page,
}) => {
  const { propertyId } = aProperty();
  requests(propertyId, [
    { title: "GX low pillow", priority: "low" },
    { title: "GX urgent water leak", priority: "urgent" },
    { title: "GX normal towels", priority: "normal" },
  ]);
  await signIn(page);
  await page.goto(`/en/guest-experience?property=${propertyId}`);

  // GX-04: urgent first, not whichever status sorts first alphabetically.
  const titles = await page
    .locator("tbody tr td:nth-child(2) span.font-medium")
    .allTextContents();
  expect(titles).toEqual([
    "GX urgent water leak",
    "GX normal towels",
    "GX low pillow",
  ]);
  await expect(row(page, "GX urgent water leak")).toContainText(/ago/);

  // GX-01: assigned from the row, by name.
  await row(page, "GX normal towels")
    .getByRole("button", { name: "Assign to me" })
    .click();
  await expect(
    row(page, "GX normal towels").getByRole("combobox", { name: "Assign to" }),
  ).toContainText("Deniz");
  await expect(row(page, "GX normal towels")).not.toContainText("@");

  await page.getByRole("combobox", { name: "Assigned to" }).click();
  await page.getByRole("option", { name: "Assigned to me" }).click();
  await expect(page.getByRole("row", { name: /GX/ })).toHaveCount(1);
  await page.getByRole("combobox", { name: "Assigned to" }).click();
  await page.getByRole("option", { name: "Unassigned" }).click();
  await expect(page.getByRole("row", { name: /GX/ })).toHaveCount(2);

  // GX-04: the Urgent tile is a filter, and says it is on.
  await page.getByRole("combobox", { name: "Assigned to" }).click();
  await page.getByRole("option", { name: "Anyone" }).click();
  await page.getByRole("button", { name: /Urgent, open/ }).click();
  await expect(page.getByRole("row", { name: /GX/ })).toHaveCount(1);
  await expect(page.getByRole("row", { name: /GX/ })).toContainText(
    "GX urgent water leak",
  );
  await page.screenshot({
    path: path.join(EVIDENCE, "queue-urgent-filter.png"),
  });
});

test("cancelling needs a reason and says what happens, and a cancelled request reopens to New", async ({
  page,
}) => {
  const { propertyId } = aProperty();
  requests(propertyId, [{ title: "GX cancel me", priority: "normal" }]);
  await signIn(page);
  await page.goto(`/en/guest-experience?property=${propertyId}`);

  await row(page, "GX cancel me")
    .getByRole("button", { name: "Cancel request" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Cancel request" });
  // GX-09: one button keeps it, the other cancels it, and neither is "Cancel".
  await expect(
    dialog.getByRole("button", { name: "Keep request" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Cancel request" }),
  ).toBeDisabled();
  await expect(dialog).toContainText("Nothing is sent to the guest");
  // GX-03: the database wants three characters, so two is not offered.
  await dialog.getByLabel("Cancellation Reason").fill("no");
  await expect(
    dialog.getByRole("button", { name: "Cancel request" }),
  ).toBeDisabled();
  await dialog.getByLabel("Cancellation Reason").fill("logged twice");
  await page.screenshot({ path: path.join(EVIDENCE, "cancel-dialog.png") });
  await dialog.getByRole("button", { name: "Cancel request" }).click();
  await expect(dialog).toBeHidden();
  await expect(row(page, "GX cancel me")).toHaveCount(0);

  // GX-10: nothing is open, which is not the same as nothing logged.
  await expect(page.getByText("Nothing is open")).toBeVisible();
  await expect(
    page.getByText("1 request is resolved or cancelled."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show closed requests" }).click();
  await expect(row(page, "GX cancel me")).toContainText("logged twice");

  // GX-02: reopening a cancelled request goes to New, and it comes back to Open.
  await row(page, "GX cancel me")
    .getByRole("button", { name: "Reopen" })
    .click();
  await page.getByRole("tab", { name: /Open Requests/ }).click();
  await expect(row(page, "GX cancel me")).toContainText("New");
  await expect(row(page, "GX cancel me")).not.toContainText("logged twice");
});

test("a refusal from the server is shown, and the page that was out of date says so", async ({
  page,
}) => {
  const { propertyId } = aProperty();
  requests(propertyId, [{ title: "GX stale", priority: "normal" }]);
  await signIn(page);
  await page.goto(`/en/guest-experience?property=${propertyId}`);

  // Somebody else cancels it after this page was read.
  psql(
    `update public.service_requests
        set status = 'cancelled', cancel_reason = 'cancelled elsewhere'
      where title = 'GX stale' and property_id = '${propertyId}'`,
  );
  await row(page, "GX stale")
    .getByRole("button", { name: "Start Working" })
    .click();
  // GX-03, GX-08: the reason, not silence and not "Status - Cancel".
  await expect(
    page.getByText("A cancelled request can only be reopened to New."),
  ).toBeVisible();
});

test("somebody who may only log requests is told so and is not offered buttons that cannot work", async ({
  page,
}) => {
  const { propertyId } = aProperty();
  requests(propertyId, [{ title: "GX housekeeping view", priority: "normal" }]);
  assignToProperty(propertyId, HOUSEKEEPER_EMAIL);
  await signIn(page, HOUSEKEEPER_EMAIL);
  await page.goto(`/en/guest-experience?property=${propertyId}`);

  // GX-05: what this role may do is on the page, and the row has no actions.
  await expect(
    page.getByText(/You can log new requests here\. Working on them/),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "New Request" })).toBeVisible();
  const request = row(page, "GX housekeeping view");
  await expect(request).toBeVisible();
  await expect(request.getByRole("button")).toHaveCount(0);
  await page.screenshot({ path: path.join(EVIDENCE, "log-only-role.png") });
});

test("a search that finds nothing says so and offers every request, and the page reads in Arabic", async ({
  page,
}) => {
  const { propertyId } = aProperty();
  requests(propertyId, [{ title: "GX searchable", priority: "normal" }]);
  await signIn(page);
  await page.goto(`/en/guest-experience?property=${propertyId}`);

  await page.getByRole("searchbox").fill("zzz nothing");
  await expect(page.getByText("No request matches")).toBeVisible();
  await expect(page.getByText("No requests yet")).toHaveCount(0);
  await page.getByRole("button", { name: "Show all requests" }).click();
  await expect(row(page, "GX searchable")).toBeVisible();

  await page.goto(`/ar/guest-experience?property=${propertyId}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("button", { name: "إلغاء الطلب" })).toBeVisible();
});

test("on a phone the queue is cards that fit the screen", async ({ page }) => {
  const { propertyId } = aProperty();
  requests(propertyId, [{ title: "GX phone card", priority: "high" }]);
  await page.setViewportSize({ width: 375, height: 800 });
  await signIn(page);
  await page.goto(`/en/guest-experience?property=${propertyId}`);

  await expect(page.getByRole("table")).toBeHidden();
  await expect(
    page.getByRole("listitem").filter({ hasText: "GX phone card" }),
  ).toBeVisible();
  // GX-06: nothing makes the page scroll sideways, and the tabs are all there.
  const widths = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  expect(widths[0]).toBeLessThanOrEqual(widths[1]!);
  await expect(page.getByRole("tab", { name: /All Requests/ })).toBeAttached();
  await page.screenshot({ path: path.join(EVIDENCE, "phone-cards.png") });
});

test("a request for a room is logged for the guest in it, and the form says so before it is sent", async ({
  page,
}) => {
  const { propertyId, roomName } = aProperty();
  guestInHouse(propertyId, roomName, "Ada Occupant");
  await signIn(page);
  await page.goto(`/en/guest-experience?property=${propertyId}`);

  await page.getByRole("button", { name: "New Request" }).click();
  const dialog = page.getByRole("dialog", { name: "Create Service Request" });
  await dialog.getByLabel("Title").fill("GX extra pillows");
  await dialog.getByRole("combobox", { name: "Room" }).click();
  await page.getByRole("option", { name: new RegExp(roomName) }).click();
  // GX-07: who is in the room, before the request is sent.
  await expect(dialog).toContainText(
    "In house: Ada Occupant. The request is logged for them.",
  );
  await dialog.getByRole("button", { name: "Log Request" }).click();
  await expect(dialog).toBeHidden();
  await expect(row(page, "GX extra pillows")).toContainText("Ada Occupant");
});
