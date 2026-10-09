import { expect, test, type Locator, type Page } from "@playwright/test";

import { messages } from "../../apps/operator-workspace/src/messages";
import {
  anArrivalToday,
  aPropertyTheViewerDoesNotReach,
  HOUSEKEEPER_EMAIL,
  portfolioProperty,
  signIn,
  testProperty,
} from "./front-desk";

/**
 * All Properties in a browser (docs/features/portfolio, slice 2).
 *
 * The read, its gates and its arithmetic are proved against a database in
 * tests/integration/portfolio.test.ts, and the screen's states against a given
 * portfolio in tests/unit/portfolio-view.test.tsx. What only a browser can
 * show: that two Properties are on one page at once, that the figure follows
 * the data, that "Open" leaves the viewer working in the Property it names,
 * that a reader without money sees it hidden, and that a phone does not scroll
 * sideways and Arabic mirrors.
 */

const words = messages.en.portfolio;
const PORTFOLIO_NAME = "E2E Test Property (portfolio)";

function portfolioUrl(propertyId: string, locale = "en"): string {
  return `/${locale}/portfolio?property=${propertyId}`;
}

function card(page: Page, name: string): Locator {
  return page.locator("main li[data-property-id]").filter({
    has: page.getByRole("heading", { exact: true, name }),
  });
}

function figure(card: Locator, label: string): Locator {
  return card.getByText(label, { exact: true }).locator("xpath=../dd");
}

async function arrivalsOf(card: Locator): Promise<number> {
  return Number(await figure(card, words.arrivals).innerText());
}

test("a Manager sets two Properties side by side, and a new arrival moves the figure", async ({
  page,
}) => {
  const propertyId = testProperty();
  const second = portfolioProperty();
  await signIn(page);

  await page.goto(portfolioUrl(propertyId));
  await expect(
    page.getByRole("heading", { exact: true, name: "All Properties" }),
  ).toBeVisible();
  // The rail offers it, because this Manager reaches several Properties.
  await expect(
    page.locator('aside a[href^="/en/portfolio"]').first(),
  ).toBeVisible();

  // Two Properties on one page, in view together: nothing was switched.
  const here = card(page, "E2E Test Property");
  const there = card(page, PORTFOLIO_NAME);
  await expect(here).toBeVisible();
  await expect(there).toBeVisible();
  await expect(here).toHaveAttribute("data-property-id", propertyId);
  await expect(there).toHaveAttribute("data-property-id", second);
  expect(
    await page.locator("main li[data-property-id]").count(),
  ).toBeGreaterThan(2);

  // Each Property is written in its own currency and the summary keeps them
  // apart: a euro line and a lira line, never one added figure.
  const owed = page.getByRole("group", { name: words.moneyOwedTitle });
  await expect(owed.locator('li[data-currency="EUR"]')).toContainText("€");
  await expect(owed.locator('li[data-currency="TRY"]')).toBeVisible();
  await expect(owed.getByRole("listitem")).toHaveCount(2);
  await expect(figure(there, words.moneyOwed)).toContainText("€");
  await expect(figure(here, words.moneyOwed)).not.toContainText("€");

  // The figure follows the data: one more Reservation due today at the euro
  // Property is one more arrival still to come on its card.
  const before = await arrivalsOf(there);
  anArrivalToday(second);
  await page.reload();
  expect(await arrivalsOf(card(page, PORTFOLIO_NAME))).toBe(before + 1);
});

test("Open a Property leaves the viewer working in it, on Today", async ({
  page,
  context,
}) => {
  const propertyId = testProperty();
  const second = portfolioProperty();
  await signIn(page);
  await page.goto(portfolioUrl(propertyId));

  await card(page, PORTFOLIO_NAME)
    .getByRole("link", { name: `Open ${PORTFOLIO_NAME}` })
    .click();
  await expect(page).toHaveURL(`/en/today?property=${second}`);

  // Remembered on this device, as the switcher does it, so a bare URL opens
  // on the same Property afterwards (OA-S3-05).
  const remembered = (await context.cookies()).find(
    (cookie) => cookie.name === "ranza_property",
  );
  expect(decodeURIComponent(remembered?.value ?? "")).toBe(second);
  await expect(
    page.getByRole("button", { name: messages.en.propertySwitcher }),
  ).toContainText(PORTFOLIO_NAME);
});

test("the back button leads to Today at the same Property", async ({
  page,
}) => {
  const propertyId = testProperty();
  await signIn(page);
  await page.goto(portfolioUrl(propertyId));

  const back = page.locator('header a[aria-label="Back"]');
  await expect(back).toHaveAttribute(
    "href",
    `/en/today?property=${propertyId}`,
  );
  await back.click();
  await expect(page).toHaveURL(`/en/today?property=${propertyId}`);
});

test("a Housekeeping reader without finance.manage_folio sees money hidden, never zero", async ({
  page,
}) => {
  // The Housekeeping colleague reaches this Property and a demo one, not the
  // browser tests' main Property (seed.setup.ts).
  const second = portfolioProperty();
  await signIn(page, HOUSEKEEPER_EMAIL);
  await page.goto(portfolioUrl(second));

  await expect(card(page, PORTFOLIO_NAME)).toBeVisible();
  await expect(page.getByRole("status")).toContainText(words.moneyHiddenNotice);
  for (const name of ["Deniz Otel Kadıköy", PORTFOLIO_NAME]) {
    const owed = figure(card(page, name), words.moneyOwed);
    await expect(owed).toContainText(words.hidden);
    await expect(owed).not.toContainText(/\d/);
  }
  const summary = page.getByRole("group", { name: words.moneyOwedTitle });
  await expect(summary).toContainText(words.hidden);
  await expect(summary.getByRole("listitem")).toHaveCount(0);
  // What the role may read is still there.
  expect(await arrivalsOf(card(page, PORTFOLIO_NAME))).toBeGreaterThanOrEqual(
    0,
  );
});

test("a Property named in the URL that the viewer does not reach compares nothing", async ({
  page,
}) => {
  testProperty();
  const unreached = aPropertyTheViewerDoesNotReach();
  await signIn(page);
  await page.goto(portfolioUrl(unreached));

  await expect(
    page.getByRole("heading", { name: messages.en.notEntitledTitle }),
  ).toBeVisible();
  await expect(page.locator("main li[data-property-id]")).toHaveCount(0);
});

test("All Properties in Arabic reads right to left, in Arabic", async ({
  page,
}) => {
  const propertyId = testProperty();
  await signIn(page);
  await page.goto(portfolioUrl(propertyId, "ar"));

  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("main")).toContainText(
    messages.ar.portfolio.occupancyTitle,
  );
  await expect(page.locator("main")).not.toContainText(words.occupancyTitle);
  await expect(
    page.getByRole("heading", { exact: true, name: "كل المنشآت" }),
  ).toBeVisible();
});

test("on a phone the cards stack and the page never scrolls sideways", async ({
  page,
}) => {
  const propertyId = testProperty();
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto(portfolioUrl(propertyId));

  const here = card(page, "E2E Test Property");
  const there = card(page, PORTFOLIO_NAME);
  await expect(there).toBeVisible();
  const boxes = [await here.boundingBox(), await there.boundingBox()];
  // One column: the second card starts where the first one does.
  expect(Math.abs(boxes[0]!.x - boxes[1]!.x)).toBeLessThan(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
});
