import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { messages } from "../../apps/operator-workspace/src/messages";
import { aComparedProperty } from "./compared-properties";
import { aFreshProperty } from "./fresh-property";
import {
  anArrivalToday,
  aPropertyTheViewerDoesNotReach,
  aStaffMember,
  aStaffMemberHolding,
  portfolioProperty,
  signIn,
  testProperty,
} from "./front-desk";
import { psql } from "./local-database";
import { assignToProperty } from "./reported-months";

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

const EVIDENCE = path.resolve(__dirname, "../../docs/evidence/m1/RANZ-43");
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

test("a ledger reader without finance.manage_folio sees money hidden, never zero", async ({
  page,
  request,
  baseURL,
}) => {
  // Reads the ledger, so is offered All Properties, and does not manage Folios,
  // so every money figure is withheld while the day's counts are still its own:
  // no shipped role is that (ADR 0056). It reaches this Property and the
  // browser tests' main one.
  const second = portfolioProperty();
  const reader = await aStaffMemberHolding(request, baseURL!, second, [
    "finance.view_ledger",
    "front_desk.check_in",
    "housekeeping.update_status",
    "maintenance.report",
  ]);
  assignToProperty(
    psql(
      `select id from public.properties
        where name = 'Deniz Otel Kadıköy'
          and organization_id = (
            select organization_id from public.properties where id = '${second}')`,
    ),
    reader.email,
  );
  await signIn(page, reader.email);
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
    page.getByRole("heading", { name: messages.en.denied.notReachableTitle }),
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

/**
 * What Today says of one Property, read from its own screen: the figures the
 * portfolio card claims to repeat. Arrivals and departures are "done / due" on
 * Today and "still to come" on the card, so the card's figure is the
 * difference.
 */
async function todayFiguresOf(page: Page, propertyId: string) {
  await page.goto(`/en/today?property=${propertyId}`);
  const main = page.locator("main");
  await expect(main).toContainText(/In house\s*·\s*\d+ \/ \d+/i);
  const text = await main.innerText();
  const pair = (pattern: RegExp): [number, number] => {
    const match = pattern.exec(text);
    if (!match) throw new Error(`Today does not say ${pattern}:\n${text}`);
    return [Number(match[1]), Number(match[2])];
  };
  const [occupied, sellable] = pair(/IN HOUSE · (\d+) \/ (\d+)/i);
  const [arrived, arrivalsDue] = pair(/Arrivals\s+(\d+) \/ (\d+)/);
  const [left, departuresDue] = pair(/Departures\s+(\d+) \/ (\d+)/);
  const openRequests = Number(/Open requests\s+(\d+)/.exec(text)?.[1]);
  const owed = /Leaves today · balance ([^\n]+)/.exec(text)?.[1] ?? null;
  return {
    occupied,
    sellable,
    arrivalsToCome: arrivalsDue - arrived,
    departuresToCome: departuresDue - left,
    openRequests,
    owed,
  };
}

/**
 * Two Properties whose portfolio figures are known before the screen is asked.
 * North, in lira: 6 rooms, 4 Guests in house (1 due out today), 2 arrivals
 * still to come, 3 open maintenance requests (one done and one cancelled
 * beside them, not counted), and 1,234.50 owed. South, in euros: 5 rooms, 1 in
 * house (due out today), 1 arrival, 2 open requests, 80.00 owed.
 */
function northAndSouth() {
  return {
    north: aComparedProperty("north", {
      currency: "TRY",
      rooms: 6,
      inHouse: 4,
      dueOutToday: 1,
      arrivalsToCome: 2,
      openMaintenance: 3,
      owedMinor: 123450,
    }),
    south: aComparedProperty("south", {
      currency: "EUR",
      rooms: 5,
      inHouse: 1,
      dueOutToday: 1,
      arrivalsToCome: 1,
      openMaintenance: 2,
      owedMinor: 8000,
    }),
  };
}

test("an Owner sets two Properties side by side and every figure on a card is the one that Property's own Today shows", async ({
  page,
  request,
  baseURL,
}) => {
  const { north, south } = northAndSouth();
  const owner = await aStaffMember(
    request,
    baseURL!,
    north.propertyId,
    "owner",
  );
  assignToProperty(south.propertyId, owner.email);
  await signIn(page, owner.email);

  await page.goto(portfolioUrl(north.propertyId));
  await expect(
    page.getByRole("heading", { exact: true, name: "All Properties" }),
  ).toBeVisible();
  // Offered, because this Owner reaches two Properties of one Organization.
  await expect(
    page.locator('aside a[href^="/en/portfolio"]').first(),
  ).toBeVisible();

  // Two cards in view at once, and no others: nothing was switched.
  await expect(page.locator("main li[data-property-id]")).toHaveCount(2);
  const northCard = card(page, north.name);
  const southCard = card(page, south.name);
  await expect(northCard).toBeVisible();
  await expect(southCard).toBeVisible();

  // The seeded truth, card by card.
  await expect(northCard).toContainText("4 of 6 units in use");
  await expect(northCard).toContainText("66.7%");
  await expect(figure(northCard, words.arrivals)).toHaveText("2");
  await expect(figure(northCard, words.departures)).toHaveText("1");
  await expect(figure(northCard, words.maintenance)).toHaveText("3");
  await expect(figure(northCard, words.moneyOwed)).toHaveText("TRY 1,234.50");
  await expect(southCard).toContainText("1 of 5 units in use");
  await expect(southCard).toContainText("20.0%");
  await expect(figure(southCard, words.arrivals)).toHaveText("1");
  await expect(figure(southCard, words.departures)).toHaveText("1");
  await expect(figure(southCard, words.maintenance)).toHaveText("2");
  await expect(figure(southCard, words.moneyOwed)).toHaveText("€80.00");

  // The summary is the cards added up as counts: 5 of 11 units, 5 requests,
  // and one line per currency, never one added figure.
  const occupancySummary = page.getByRole("group", {
    name: words.occupancyTitle,
  });
  await expect(occupancySummary).toContainText("5 / 11");
  await expect(occupancySummary).toContainText("45.5%");
  await expect(
    page.getByRole("group", { name: words.maintenanceTitle }),
  ).toContainText("5");
  const owed = page.getByRole("group", { name: words.moneyOwedTitle });
  await expect(owed.getByRole("listitem")).toHaveCount(2);
  await expect(owed.locator('li[data-currency="TRY"]')).toHaveText(
    "TRY 1,234.50",
  );
  await expect(owed.locator('li[data-currency="EUR"]')).toHaveText("€80.00");

  await page.screenshot({ path: path.join(EVIDENCE, "01-two-properties.png") });

  // Each Property's own screen says the same, so the comparison can be trusted
  // without opening either.
  for (const compared of [north, south]) {
    const own = await todayFiguresOf(page, compared.propertyId);
    expect(own.occupied).toBe(compared.inHouse);
    expect(own.sellable).toBe(compared.rooms);
    expect(own.arrivalsToCome).toBe(compared.arrivalsToCome);
    expect(own.departuresToCome).toBe(compared.dueOutToday);
    expect(own.openRequests).toBe(compared.openMaintenance);
    expect(own.owed).not.toBeNull();

    await page.goto(portfolioUrl(north.propertyId));
    const shown = card(page, compared.name);
    await expect(shown).toContainText(
      `${own.occupied} of ${own.sellable} units in use`,
    );
    await expect(figure(shown, words.arrivals)).toHaveText(
      String(own.arrivalsToCome),
    );
    await expect(figure(shown, words.departures)).toHaveText(
      String(own.departuresToCome),
    );
    await expect(figure(shown, words.maintenance)).toHaveText(
      String(own.openRequests),
    );
    await expect(figure(shown, words.moneyOwed)).toHaveText(own.owed!);
  }
});

test("the same comparison in Arabic keeps each figure with its Property and mirrors", async ({
  page,
  request,
  baseURL,
}) => {
  const { north, south } = northAndSouth();
  const owner = await aStaffMember(
    request,
    baseURL!,
    north.propertyId,
    "owner",
  );
  assignToProperty(south.propertyId, owner.email);
  await signIn(page, owner.email);
  await page.goto(portfolioUrl(north.propertyId, "ar"));

  const ar = messages.ar.portfolio;
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("main li[data-property-id]")).toHaveCount(2);
  const northCard = card(page, north.name);
  const southCard = card(page, south.name);
  await expect(northCard).toContainText("4 من 6 وحدة مشغولة");
  await expect(southCard).toContainText("1 من 5 وحدة مشغولة");
  await expect(figure(northCard, ar.maintenance)).toHaveText("3");
  await expect(figure(southCard, ar.maintenance)).toHaveText("2");
  // Direction marks and no-break spaces are the formatter's, so compare the
  // figure without them.
  const plain = async (locator: Locator) =>
    (await locator.innerText())
      .replace(/[‎‏؜⁦-⁩]/g, "")
      .replace(/[  \s]+/g, " ");
  const northOwed = await plain(figure(northCard, ar.moneyOwed));
  const southOwed = await plain(figure(southCard, ar.moneyOwed));
  expect(northOwed).toContain("1,234.50");
  expect(northOwed).toContain("TRY");
  expect(southOwed).toContain("80.00");
  expect(southOwed).toContain("€");

  // The first card sits at the right edge, where a reader starts.
  const first = await northCard.boundingBox();
  const second = await southCard.boundingBox();
  expect(first!.x).toBeGreaterThan(second!.x);

  await page.screenshot({
    path: path.join(EVIDENCE, "03-two-properties-arabic.png"),
  });
});

test("a viewer who reaches one Property is not offered All Properties and is told there is nothing to compare", async ({
  page,
  request,
  baseURL,
}) => {
  const only = aComparedProperty("only", {
    currency: "TRY",
    rooms: 3,
    inHouse: 1,
    dueOutToday: 0,
    arrivalsToCome: 1,
    openMaintenance: 1,
    owedMinor: 2500,
  });
  const manager = await aStaffMember(
    request,
    baseURL!,
    only.propertyId,
    "manager",
  );
  await signIn(page, manager.email);

  await expect(
    page.locator('aside a[href^="/en/today"]').first(),
  ).toBeVisible();
  await expect(page.locator('aside a[href^="/en/portfolio"]')).toHaveCount(0);

  // The typed address is not a boundary the rail hides; it says what it is.
  await page.goto(portfolioUrl(only.propertyId));
  await expect(
    page.getByRole("heading", { name: words.oneTitle }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText(only.name);
  await expect(page.locator("main li[data-property-id]")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: words.goToToday }),
  ).toHaveAttribute("href", `/en/today?property=${only.propertyId}`);

  await page.screenshot({ path: path.join(EVIDENCE, "02-one-property.png") });

  // Given a second Property the same person is offered it.
  const second = aFreshProperty("second", {
    capabilities: ["today", "analytics"],
  });
  assignToProperty(second.propertyId, manager.email);
  await page.goto(`/en/today?property=${only.propertyId}`);
  await expect(
    page.locator('aside a[href^="/en/portfolio"]').first(),
  ).toBeVisible();
});

test("two Properties without Analytics are not offered All Properties either", async ({
  page,
  request,
  baseURL,
}) => {
  const first = aFreshProperty("no analytics one", { capabilities: ["today"] });
  const second = aFreshProperty("no analytics two", {
    capabilities: ["today"],
  });
  const manager = await aStaffMember(
    request,
    baseURL!,
    first.propertyId,
    "manager",
  );
  assignToProperty(second.propertyId, manager.email);
  await signIn(page, manager.email);

  await expect(page.locator('aside a[href^="/en/portfolio"]')).toHaveCount(0);
  await page.goto(portfolioUrl(first.propertyId));
  await expect(
    page.getByRole("heading", { name: messages.en.denied.notEnabledTitle }),
  ).toBeVisible();
  await expect(page.locator("main li[data-property-id]")).toHaveCount(0);
});
