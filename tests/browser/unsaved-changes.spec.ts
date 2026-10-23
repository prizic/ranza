import path from "node:path";

import { expect } from "@playwright/test";
import { test } from "./hydration";

import { aStaffMember, signIn, testProperty } from "./front-desk";

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit/RANZ-76",
);

/**
 * Leaving the Configuration screen with an edit that was not saved asks first
 * (RANZ-76, CONFIG-03): by a link and by closing the tab,
 * and not when there is nothing to lose.
 */
const WARNING =
  "You have changes that are not saved. Leave without saving them?";

test("an unsaved edit is asked about before a link takes it away", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const { email } = await aStaffMember(
    request,
    baseURL!,
    testProperty(),
    "owner",
  );
  await signIn(page, email);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .locator("aside")
    .getByRole("link", { name: "Configuration" })
    .click();
  await expect(page).toHaveURL(/\/en\/configuration/);

  const name = page.locator("#property-name");
  await expect(name).toBeEnabled();
  const original = await name.inputValue();
  await name.fill(`${original} annex`);

  const asked: string[] = [];
  let answer: "dismiss" | "accept" = "dismiss";
  page.on("dialog", async (dialog) => {
    asked.push(dialog.message());
    await (answer === "dismiss" ? dialog.dismiss() : dialog.accept());
  });

  // A link in the rail: asked, and refused, and the draft is still there.
  await page.locator("aside").getByRole("link", { name: "Today" }).click();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]).toBe(WARNING);
  await expect(page).toHaveURL(/\/en\/configuration/);
  await expect(name).toHaveValue(`${original} annex`);
  await page.screenshot({
    path: path.join(EVIDENCE, "unsaved-draft-kept.png"),
  });

  // Discarding is the answer to the question: nothing is asked afterwards.
  await page.getByRole("button", { name: "Discard" }).first().click();
  await expect(name).toHaveValue(original);
  await page.locator("aside").getByRole("link", { name: "Today" }).click();
  await expect(page).toHaveURL(/\/en\/today/);
  expect(asked).toHaveLength(1);
});

test("saying yes to the question leaves", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const { email } = await aStaffMember(
    request,
    baseURL!,
    testProperty(),
    "owner",
  );
  await signIn(page, email);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .locator("aside")
    .getByRole("link", { name: "Configuration" })
    .click();
  const name = page.locator("#property-name");
  await expect(name).toBeEnabled();
  await name.fill(`${await name.inputValue()} annex`);

  page.on("dialog", (dialog) => dialog.accept());
  await page.locator("aside").getByRole("link", { name: "Today" }).click();
  await expect(page).toHaveURL(/\/en\/today/);
});

test("closing the tab with an unsaved edit uses the browser's own prompt", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const { email } = await aStaffMember(
    request,
    baseURL!,
    testProperty(),
    "owner",
  );
  await signIn(page, email);
  await page
    .locator("aside")
    .getByRole("link", { name: "Configuration" })
    .click();
  const name = page.locator("#property-name");
  await expect(name).toBeEnabled();
  await name.fill(`${await name.inputValue()} annex`);

  const prompted = page.waitForEvent("dialog");
  const closed = page.waitForEvent("close");
  await page.close({ runBeforeUnload: true });
  const dialog = await prompted;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.accept();
  // `close` does not wait for the page to go once it has run `beforeunload`,
  // and the hydration check that follows every test asks the page whether it
  // is still there.
  await closed;
});
