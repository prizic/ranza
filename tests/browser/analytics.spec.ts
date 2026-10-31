import path from "node:path";

import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./hydration";

import { messages } from "../../apps/operator-workspace/src/messages";
import { aStaffMember, aStaffMemberHolding, signIn } from "./front-desk";
import { aFreshProperty } from "./fresh-property";
import {
  aSettledMonth,
  anOpenMonth,
  assignToProperty,
} from "./reported-months";

/**
 * Reports in a browser (docs/features/analytics, RANZ-44): "a month can be
 * explained from this screen without exporting anything."
 *
 * The arithmetic is proved against a database in
 * tests/integration/analytics.test.ts. What only a browser can show is that a
 * person reading the screen reaches the same numbers: every figure of a month
 * whose history was written down before the screen was asked equals that
 * history, the day-by-day rows add up to the headline, and the comparison, the
 * open month, the empty month, the masked reader and the Arabic reader each
 * see what their row says.
 *
 * The fixtures are in reported-months.ts, and each test's sums are written out
 * beside the assertion so the figure can be checked by hand.
 */

const EVIDENCE = path.resolve(__dirname, "../../docs/evidence/m1/RANZ-44");
const words = messages.en.analytics.month;

function say(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{${key}}`, String(value)),
    template,
  );
}

function reportUrl(
  propertyId: string,
  month: string | null,
  locale = "en",
): string {
  const month_ = month ? `&month=${month}` : "";
  return `/${locale}/analytics?property=${propertyId}${month_}`;
}

function headline(page: Page, label: string): Locator {
  return page.locator("[data-figure]").filter({ hasText: label });
}

function row(page: Page, label: string): Locator {
  return page
    .locator("[data-row]")
    .filter({ has: page.getByText(label, { exact: true }) });
}

function dayRow(page: Page, date: string): Locator {
  return page.locator(`tr[data-date="${date}"]`);
}

function section(page: Page, name: string): Locator {
  return page.getByRole("region", { name, exact: true });
}

/** `34500` minor units as the screen writes lira: `TRY 345.00`. */
function lira(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  return `${sign}TRY ${(Math.abs(minor) / 100).toFixed(2)}`;
}

function percent(value: number): string {
  return `${(Math.round(value * 10) / 10).toFixed(1)}%`;
}

function monthName(month: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
}

async function aManagerOf(
  request: Parameters<typeof aStaffMember>[0],
  baseURL: string,
  propertyId: string,
  role = "manager",
): Promise<string> {
  const { email } = await aStaffMember(request, baseURL, propertyId, role);
  return email;
}

test("a settled month is explained to the unit: every figure equals the history behind it", async ({
  page,
  request,
  baseURL,
}) => {
  // February 2026 beside January 2026, seeded in reported-months.ts:
  //   nights   A 3 + B 2 + C 1 Guest, D 3 Resident = 9 occupied of 3 x 28 = 84
  //   charged  A 3 x 100.00, B 2 x 120.00, C 1 x 200.00 = 740.00; the 3 Feb
  //            night of A reversed, -100.00; net 640.00
  //   ADR      640.00 / 6 charged Guest nights = 106.67
  //   RevPAR   640.00 / 84 available nights = 7.62
  //   other    30.00 + 20.00 - 20.00 reversed = 30.00
  //   paid     cash 150.00 (the 40.00 reversed leaves it), card 200.00,
  //            bank transfer 90.00, other 10.00 = 450.00
  //   owed     670.00 booked - 450.00 collected = 220.00
  // January: 4 nights of 3 x 31 = 93, 4 x 80.00 = 320.00, paid 200.00 by card.
  const property = aSettledMonth();
  await signIn(page, await aManagerOf(request, baseURL!, property.propertyId));
  await page.goto(reportUrl(property.propertyId, "2026-02"));

  await expect(
    page.getByRole("heading", { name: "February 2026" }),
  ).toBeVisible();
  // A settled month is not "month to date", and it is as of today because a
  // correction can still move it (AN-S2-04, AN-S2-09).
  await expect(page.locator("main")).not.toContainText("Month to date");
  await expect(page.locator("main")).toContainText("As of ");

  const occupancy = headline(page, words.occupancy);
  await expect(occupancy).toContainText("10.7%");
  await expect(occupancy).toContainText("9 occupied ÷ 84 available nights");
  await expect(occupancy).toContainText("+6.4 points vs January 2026: 4.3%");

  const adr = headline(page, words.adr);
  await expect(adr).toContainText("TRY 106.67");
  await expect(adr).toContainText("TRY 640.00 room revenue ÷ 6 charged Guest");
  await expect(adr).toContainText("+33.3% vs January 2026: TRY 80.00");

  const revPar = headline(page, words.revPar);
  await expect(revPar).toContainText("TRY 7.62");
  await expect(revPar).toContainText(
    "TRY 640.00 room revenue ÷ 84 available nights",
  );
  await expect(revPar).toContainText("+121.5% vs January 2026: TRY 3.44");

  await expect(row(page, words.roomNightsCharged)).toContainText("TRY 740.00");
  await expect(row(page, words.corrections)).toContainText("-TRY 100.00");
  const net = row(page, words.netRoomRevenue);
  await expect(net).toContainText("TRY 640.00");
  await expect(net).toContainText("+100.0% vs January 2026: TRY 320.00");
  const other = row(page, words.otherRevenue);
  await expect(other).toContainText("TRY 30.00");
  // Nothing to compare against is a dash, never infinity (AN-S2-07).
  await expect(other).toContainText("— vs January 2026: TRY 0.00");
  await expect(row(page, words.totalRevenue)).toContainText("TRY 670.00");
  await expect(row(page, words.revenueBooked)).toContainText("TRY 670.00");
  const collected = row(page, words.moneyCollected);
  await expect(collected).toContainText("TRY 450.00");
  await expect(collected).toContainText("+125.0% vs January 2026: TRY 200.00");
  await expect(row(page, words.owedChange)).toContainText("TRY 220.00");

  const cash = messages.en.analytics.cash;
  const card = messages.en.analytics.card;
  const bank = messages.en.analytics.bankTransfer;
  await expect(row(page, cash)).toContainText("TRY 150.00");
  await expect(row(page, card)).toContainText("TRY 200.00");
  await expect(row(page, bank)).toContainText("TRY 90.00");
  await expect(row(page, messages.en.analytics.other)).toContainText(
    "TRY 10.00",
  );

  // Nights, and the Resident nights that earned no charge (AN-S3-01).
  await expect(section(page, words.nights)).toContainText(
    /Available nights\s*84\s*Occupied nights\s*9\s*Guest nights\s*6\s*Resident nights\s*3/,
  );
  await expect(section(page, words.uncharged)).toContainText(
    /Resident Stay, not charged by the night\s*3 nights/,
  );

  // The unit types add up to the headline (AN-S3-02).
  const types = section(page, words.unitTypes);
  const cells = (label: string) =>
    types
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: label, exact: true }) })
      .getByRole("cell");
  await expect(cells("Room")).toContainText([
    "Room",
    "56",
    "8",
    "14.3%",
    "TRY 440.00",
    "TRY 88.00",
  ]);
  await expect(cells("Suite")).toContainText([
    "Suite",
    "28",
    "1",
    "3.6%",
    "TRY 200.00",
    "TRY 200.00",
  ]);
  await expect(cells(words.monthTotal)).toContainText([
    words.monthTotal,
    "84",
    "9",
    "10.7%",
    "TRY 640.00",
    "TRY 106.67",
  ]);

  // Day by day: every day has a row (AN-S2-14), a correction sits on the night
  // it corrects, and the rows sum to the headline.
  await expect(page.locator("tr[data-date]")).toHaveCount(28);
  await expect(dayRow(page, "2026-02-01").getByRole("cell")).toHaveText([
    /^1 Sun/,
    "0",
    "0.0%",
    "TRY 0.00",
    "",
  ]);
  await expect(dayRow(page, "2026-02-02").getByRole("cell")).toHaveText([
    /^2 Mon/,
    "1",
    "33.3%",
    "TRY 100.00",
    "",
  ]);
  // A's 3 Feb night was charged 100.00 and corrected -100.00 on 2 Mar.
  await expect(dayRow(page, "2026-02-03").getByRole("cell")).toHaveText([
    /^3 Tue/,
    "1",
    "33.3%",
    "TRY 0.00",
    "",
  ]);
  // B (120.00) and C (200.00) on the same night.
  await expect(dayRow(page, "2026-02-10").getByRole("cell")).toHaveText([
    /^10 Tue/,
    "2",
    "66.7%",
    "TRY 320.00",
    "",
  ]);
  // A Resident night is occupied and earned nothing.
  await expect(dayRow(page, "2026-02-21").getByRole("cell")).toHaveText([
    /^21 Sat/,
    "1",
    "33.3%",
    "TRY 0.00",
    "",
  ]);

  const rows = page.locator("tr[data-date]");
  const occupiedNights = (await rows.locator("td:nth-child(2)").allInnerTexts())
    .map(Number)
    .reduce((sum, value) => sum + value, 0);
  const revenue = (await rows.locator("td:nth-child(4)").allInnerTexts())
    .map((text) => Number(text.replace(/[^\d.-]/g, "")))
    .reduce((sum, value) => sum + value, 0);
  expect(occupiedNights).toBe(9);
  expect(revenue).toBeCloseTo(640, 2);
  await expect(
    section(page, words.days).locator("tfoot tr").getByRole("cell"),
  ).toHaveText([words.monthTotal, "9", "10.7%", "TRY 640.00", ""]);

  // Opening a day shows the same count its row does (AN-S3-04).
  await dayRow(page, "2026-02-10").locator("[data-day-link]").click();
  await expect(page).toHaveURL(/day=2026-02-10/);
  await expect(page.getByText("Occupied nights").last()).toBeVisible();
  const detail = page.locator("body");
  await expect(detail).toContainText("Tuesday, Feb 10, 2026");
  await expect(detail).toContainText(/Occupied nights\s*2\s*Charged Guest/);
  await expect(detail).toContainText("TRY 120.00");
  await expect(detail).toContainText("TRY 200.00");

  await page.goto(reportUrl(property.propertyId, "2026-02"));
  await expect(headline(page, words.occupancy)).toContainText("10.7%");
  await page.screenshot({
    path: path.join(EVIDENCE, "01-month-explained.png"),
  });
  await section(page, words.days).screenshot({
    path: path.join(EVIDENCE, "02-month-by-day.png"),
  });
});

test("the month before it compares against January, and January has no earlier month", async ({
  page,
  request,
  baseURL,
}) => {
  const property = aSettledMonth();
  await signIn(page, await aManagerOf(request, baseURL!, property.propertyId));
  await page.goto(reportUrl(property.propertyId, "2026-02"));

  await page.getByRole("link", { name: words.previousMonth }).first().click();
  await expect(page).toHaveURL(/month=2026-01/);
  await expect(
    page.getByRole("heading", { name: "January 2026" }),
  ).toBeVisible();

  // 4 nights of 3 x 31 = 93; 4 x 80.00 = 320.00; RevPAR 320.00 / 93 = 3.44.
  await expect(headline(page, words.occupancy)).toContainText("4.3%");
  await expect(headline(page, words.occupancy)).toContainText(
    "4 occupied ÷ 93 available nights",
  );
  await expect(headline(page, words.adr)).toContainText("TRY 80.00");
  await expect(headline(page, words.revPar)).toContainText("TRY 3.44");
  await expect(row(page, words.moneyCollected)).toContainText("TRY 200.00");
  await expect(row(page, messages.en.analytics.card)).toContainText(
    "TRY 200.00",
  );
  // December had no Stay and no charge, so there is nothing to compare with:
  // no percentage is invented (AN-S2-07).
  await expect(page.locator("main")).toContainText(
    say(words.noPrior, { month: "December 2025" }),
  );
  await expect(page.locator("[data-figure]").first()).not.toContainText(
    "vs December",
  );
});

test("an open month says month to date, counts closed days only, and compares the same elapsed days", async ({
  page,
  request,
  baseURL,
}) => {
  // Two rooms older than both months, every day before today closed:
  //   this month  one Guest night on the 1st @ 100.00
  //   last month  a Guest night on the 1st and one on the 28th, each @ 80.00
  // so with N closed days this month has 1 occupied of 2N, and last month's
  // elapsed days hold the 28th only once N reaches it.
  const open = anOpenMonth();
  const { closedDays: closed, daysInMonth, daysInPriorMonth } = open;
  await signIn(page, await aManagerOf(request, baseURL!, open.propertyId));
  await page.goto(reportUrl(open.propertyId, null));

  await expect(
    page.getByRole("heading", { name: monthName(open.month) }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText(
    say(words.monthToDate, { closed, total: closed + 1 }),
  );
  await expect(page.locator("main")).toContainText(words.openNote);

  // Occupancy counts every day so far, today included; revenue's nights are
  // the closed days'.
  const available = 2 * (closed + 1);
  const closedAvailable = 2 * closed;
  const currentOccupancy = Math.round(1000 / available) / 10;
  const elapsed = Math.min(closed, daysInPriorMonth);
  const priorOccupied = closed >= 28 ? 2 : 1;
  const priorAvailable = 2 * elapsed;
  const priorDays = Math.min(closed + 1, daysInPriorMonth);
  const priorNights = closed + 1 >= 28 ? 2 : 1;
  const priorOccupancy =
    Math.round((priorNights / (2 * priorDays)) * 1000) / 10;
  const points = Math.round((currentOccupancy - priorOccupancy) * 10) / 10;
  const signed =
    points === 0
      ? "0.0"
      : `${points > 0 ? "+" : "-"}${Math.abs(points).toFixed(1)}`;
  const priorName = monthName(open.priorMonth);

  const occupancy = headline(page, words.occupancy);
  await expect(occupancy).toContainText(percent(currentOccupancy));
  await expect(occupancy).toContainText(
    `1 occupied ÷ ${available} available nights`,
  );
  await expect(occupancy).toContainText(
    `${signed} points vs ${priorName}: ${percent(priorOccupancy)}`,
  );
  // ADR is the one 100.00 night; RevPAR spreads it over the closed days.
  const revParMinor = Math.round(10000 / closedAvailable);
  await expect(headline(page, words.adr)).toContainText("TRY 100.00");
  await expect(headline(page, words.revPar)).toContainText(lira(revParMinor));
  const priorRevParMinor = Math.round((8000 * priorOccupied) / priorAvailable);
  await expect(headline(page, words.revPar)).toContainText(
    `vs ${priorName}: ${lira(priorRevParMinor)}`,
  );
  await expect(headline(page, words.adr)).toContainText(
    `+25.0% vs ${priorName}: TRY 80.00`,
  );
  await expect(page.locator("main")).toContainText(
    say(words.sameElapsedDays, { month: priorName }),
  );

  // Today is open and counts toward no revenue; days to come carry no figure.
  const today = dayRow(page, open.today);
  await expect(today).toHaveAttribute("data-day-state", "open");
  await expect(today).toContainText(words.openDay);
  await expect(today).toContainText(words.notYetCharged);
  await expect(page.locator('tr[data-day-state="closed"]')).toHaveCount(closed);
  await expect(page.locator('tr[data-day-state="future"]')).toHaveCount(
    daysInMonth - closed - 1,
  );
  await expect(section(page, words.days).locator("tfoot tr")).toContainText(
    percent(currentOccupancy),
  );

  await page.screenshot({ path: path.join(EVIDENCE, "03-open-month.png") });
});

test("a month before the Property had any Stay says nothing happened, not zero percent", async ({
  page,
  request,
  baseURL,
}) => {
  const property = aSettledMonth();
  await signIn(page, await aManagerOf(request, baseURL!, property.propertyId));
  await page.goto(reportUrl(property.propertyId, "2025-11"));

  await expect(
    page.getByText(say(words.noActivityTitle, { month: "November 2025" })),
  ).toBeVisible();
  await expect(page.locator("[data-figure]")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("0.0%");
  await expect(page.locator("tr[data-date]")).toHaveCount(0);
});

test("a reader without finance.manage_folio sees the nights and no money anywhere", async ({
  page,
  request,
  baseURL,
}) => {
  const property = aSettledMonth();
  // Reads the ledger and does not manage Folios: the one role that opens
  // Analytics with the money withheld (ADR 0056). No shipped role is that.
  const { email } = await aStaffMemberHolding(
    request,
    baseURL!,
    property.propertyId,
    ["finance.view_ledger"],
  );
  await signIn(page, email);
  await page.goto(reportUrl(property.propertyId, "2026-02"));

  const main = page.locator("main");
  await expect(headline(page, words.occupancy)).toContainText("10.7%");
  await expect(headline(page, words.occupancy)).toContainText(
    "9 occupied ÷ 84 available nights",
  );
  await expect(page.getByRole("status")).toContainText(
    messages.en.analytics.financialsMaskedNotice,
  );
  await expect(page.locator("[data-figure]")).toHaveCount(1);
  await expect(main).not.toContainText("TRY");
  await expect(main).not.toContainText(words.revenueCol);
  await expect(section(page, words.nights)).toContainText("Guest nights");
  await expect(section(page, words.uncharged)).toContainText(
    "Resident Stay, not charged by the night",
  );

  await page.screenshot({ path: path.join(EVIDENCE, "04-without-money.png") });

  // A day opened by this reader holds the Stays and no amount.
  await page.goto(
    `${reportUrl(property.propertyId, "2026-02")}&day=2026-02-10`,
  );
  await expect(page.locator("body")).toContainText("Tuesday, Feb 10, 2026");
  await expect(page.locator("body")).not.toContainText("TRY");
});

test("a Property that has not bought analytics is not offered and its address refuses", async ({
  page,
  request,
  baseURL,
}) => {
  const unbought = aFreshProperty("no analytics", { capabilities: [] });
  const email = await aManagerOf(request, baseURL!, unbought.propertyId);
  await signIn(page, email);

  await expect(page.locator('aside a[href^="/en/analytics"]')).toHaveCount(0);
  await page.goto(reportUrl(unbought.propertyId, null));
  await expect(
    page.getByRole("heading", { name: messages.en.denied.notEnabledTitle }),
  ).toBeVisible();
  await expect(page.locator("[data-figure]")).toHaveCount(0);
});

test("a Property the viewer is not assigned to is not shown, and the one they are assigned to is", async ({
  page,
  request,
  baseURL,
}) => {
  const mine = aSettledMonth();
  const elsewhere = aSettledMonth();
  const email = await aManagerOf(request, baseURL!, mine.propertyId);
  await signIn(page, email);
  await expect(
    // The sidebar, or the chips of a role with few pages (ADR 0056).
    page.locator('nav a[href^="/en/analytics"]:visible').first(),
  ).toBeVisible();

  await page.goto(reportUrl(elsewhere.propertyId, "2026-02"));
  await expect(
    page.getByRole("heading", { name: messages.en.denied.notReachableTitle }),
  ).toBeVisible();
  await expect(page.locator("[data-figure]")).toHaveCount(0);

  assignToProperty(elsewhere.propertyId, email);
  await page.goto(reportUrl(elsewhere.propertyId, "2026-02"));
  await expect(headline(page, words.occupancy)).toContainText("10.7%");
});

test("the month in Arabic reads right to left, with its figures and currency intact", async ({
  page,
  request,
  baseURL,
}) => {
  const property = aSettledMonth();
  await signIn(page, await aManagerOf(request, baseURL!, property.propertyId));
  await page.goto(reportUrl(property.propertyId, "2026-02", "ar"));

  const ar = messages.ar.analytics.month;
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("main")).toContainText(ar.revenue);
  await expect(page.locator("main")).not.toContainText(words.revenue);

  // Direction marks and no-break spaces are the formatter's, so compare the
  // figure without them.
  const plain = async (locator: Locator) =>
    (await locator.innerText())
      .replace(/[\u200e\u200f\u061c\u2066-\u2069]/g, "")
      .replace(/[\u00a0\u202f\s]+/g, " ");
  expect(await plain(headline(page, ar.occupancy))).toContain("10.7%");
  expect(await plain(headline(page, ar.occupancy))).toContain(
    say(ar.occupancyArithmetic, { occupied: 9, available: 84 }),
  );
  expect(await plain(headline(page, ar.adr))).toContain("106.67 TRY");
  expect(await plain(headline(page, ar.revPar))).toContain("7.62 TRY");
  expect(await plain(row(page, ar.netRoomRevenue))).toContain("640.00 TRY");
  expect(await plain(row(page, ar.moneyCollected))).toContain("450.00 TRY");

  // Money and percentages stay one unit inside the right-to-left line.
  await expect(headline(page, ar.adr).locator("bdi").first()).toBeVisible();

  // The first column of the table starts at the right edge.
  const head = page.locator("thead th");
  const first = await head.first().boundingBox();
  const last = await head.last().boundingBox();
  expect(first!.x).toBeGreaterThan(last!.x);

  await page.screenshot({ path: path.join(EVIDENCE, "05-month-arabic.png") });
});
