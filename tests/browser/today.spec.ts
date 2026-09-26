import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  anArrivalToday,
  aPropertyTheViewerDoesNotReach,
  signIn,
  testProperty,
} from "./front-desk";

/**
 * Today in a browser (docs/features/today-dashboard, slice 1).
 *
 * The derivation and the reads are proved elsewhere. What only a browser can
 * show: that a figure is a way in which keeps the Property and does not load a
 * new document, that a check-in somewhere else reaches the figure, that a
 * phone leads with the task and never scrolls sideways, and that Arabic mirrors.
 */

function arrivalsTile(page: Page, propertyId: string): Locator {
  return page
    .locator(`main a[href="/en/arrivals?property=${propertyId}"]`)
    .filter({ hasText: "Checked in" });
}

/** "7 / 18" read back from the tile, as numbers. */
async function checkedInOf(tile: Locator): Promise<[number, number]> {
  const text = (await tile.innerText()).replace(/\s+/g, " ");
  const match = /(\d+) \/ (\d+)/.exec(text);
  expect(match, `no figure in "${text}"`).not.toBeNull();
  return [Number(match![1]), Number(match![2])];
}

async function markDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as Window & { sameDocument?: boolean }).sameDocument = true;
  });
}

test("every figure on Today opens its list at the same Property", async ({
  page,
}) => {
  const propertyId = testProperty();
  await signIn(page);
  await page.goto(`/en/today?property=${propertyId}`);

  await expect(
    page.getByText(/^Good (morning|afternoon|evening|night),$/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Needs attention/ }),
  ).toBeAttached();

  // Every link in the page carries the Property.
  const hrefs = await page
    .locator("main a[href]")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(hrefs.length).toBeGreaterThan(3);
  for (const href of hrefs) expect(href).toContain(`property=${propertyId}`);

  // And following one is a client navigation, like the rail's.
  await markDocument(page);
  await arrivalsTile(page, propertyId).click();
  await expect(page).toHaveURL(`/en/arrivals?property=${propertyId}`);
  expect(
    await page.evaluate(
      () => (window as Window & { sameDocument?: boolean }).sameDocument,
    ),
  ).toBe(true);
});

test("a check-in on the arrivals screen reaches Today's figure", async ({
  page,
}) => {
  const propertyId = testProperty();
  const guestName = anArrivalToday(propertyId);
  await signIn(page);

  await page.goto(`/en/today?property=${propertyId}`);
  const [before, expected] = await checkedInOf(arrivalsTile(page, propertyId));

  await page.goto(`/en/arrivals?property=${propertyId}`);
  await page.getByRole("searchbox").fill(guestName);
  const row = page.getByRole("row").filter({ hasText: guestName });
  await row.getByRole("button", { name: "Check in" }).click();
  await expect(row.getByText("Checked in")).toBeVisible();

  // Back by the rail, a client navigation like any other move in the
  // workspace — not a fresh document, which would prove nothing about a
  // cache (TD-S1-26).
  await markDocument(page);
  await page
    .locator(`aside a[href="/en/today?property=${propertyId}"]`)
    .first()
    .click();
  await expect(page).toHaveURL(`/en/today?property=${propertyId}`);
  const tile = arrivalsTile(page, propertyId);
  await expect
    .poll(async () => (await checkedInOf(tile))[0], { timeout: 15_000 })
    .toBe(before + 1);
  expect((await checkedInOf(tile))[1]).toBe(expected);
  expect(
    await page.evaluate(
      () => (window as Window & { sameDocument?: boolean }).sameDocument,
    ),
  ).toBe(true);
});

test("on a phone Today leads with the task and never scrolls sideways", async ({
  page,
}) => {
  const propertyId = testProperty();
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto(`/en/today?property=${propertyId}`);

  const attention = page.locator("#today-attention");
  const movements = page.getByRole("heading", { name: "Today's movements" });
  const tile = arrivalsTile(page, propertyId);
  // The seeded account is a manager, whose figures open with occupancy and
  // then arrivals: the first two, which a phone sets side by side.
  const occupancy = page
    .locator(`main a[href="/en/rooms?property=${propertyId}"]`)
    .filter({ hasText: "In house" });
  await expect(movements).toBeVisible();
  const top = async (locator: Locator) => (await locator.boundingBox())!.y;
  // What needs somebody, then the list, then the figures (blueprint 18.8).
  expect(await top(attention)).toBeLessThan(await top(movements));
  expect(await top(movements)).toBeLessThan(await top(tile));
  // Two across: the first two figures share a row.
  expect(Math.abs((await top(tile)) - (await top(occupancy)))).toBeLessThan(2);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("Today in Arabic reads right to left, in Arabic", async ({ page }) => {
  const propertyId = testProperty();
  await signIn(page);
  await page.goto(`/ar/today?property=${propertyId}`);

  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("main")).toContainText("يحتاج إلى انتباه");
  await expect(page.locator("main")).not.toContainText("Needs attention");
});

test("a Property named in the URL that Today does not reach goes back to Today with none", async ({
  page,
}) => {
  testProperty();
  const unreached = aPropertyTheViewerDoesNotReach();
  await signIn(page);
  await page.goto(`/en/today?property=${unreached}`);
  await expect(page).toHaveURL(/\/en\/today$/);
  await expect(
    page.getByRole("heading", { name: /Needs attention/ }),
  ).toBeAttached();
});
