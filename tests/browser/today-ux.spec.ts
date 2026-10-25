import { expect, test, type Page } from "@playwright/test";

import { signIn, whenHydrated } from "./front-desk";
import { aKnownDay, type Focus, type KnownDay } from "./known-day";
import { psql } from "./local-database";

/**
 * Today, as the UX audit of 2026-10-11 found it (RANZ-57, with the overdue
 * Guest of RANZ-51 and the one number for tonight of RANZ-52).
 *
 * The day is the known one: four Guests in house (one of them a day overdue),
 * three arrivals (one into a dirty room, one into a blocked one), and nine rooms
 * that can be let. A number is checked against that day and against the page
 * that shows the same fact elsewhere, never against itself.
 */

let day: KnownDay;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright }) => {
  test.setTimeout(240_000);
  const baseURL = test.info().project.use.baseURL!;
  const request = await playwright.request.newContext({ baseURL });
  day = await aKnownDay(request, new URL(baseURL).origin);
  await request.dispose();
});

const reported = new WeakMap<Page, string[]>();

test.afterEach(async ({ page }) => {
  expect(reported.get(page) ?? [], "the browser reported errors").toEqual([]);
});

async function signInAs(page: Page, focus: Focus, locale = "en") {
  const errors: string[] = [];
  reported.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  psql("delete from public.auth_rate_limit");
  await signIn(page, day.email[focus]);
  await page.goto(`/${locale}/today?property=${day.propertyId}`);
  await expect(page.locator("main")).toContainText(/\d/);
}

/**
 * The page is left before its session is taken away. Today is still asking its
 * own questions when a test is done with it, and one that lands after the
 * cookies are gone is a 401 this file would count as the page's error — which
 * it is not: a tab signed out underneath keeps its last good rows.
 */
async function signOut(page: Page) {
  await page.goto("about:blank");
  await page.context().clearCookies();
}

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `docs/evidence/ux-audit/RANZ-57/${name}.png`,
    animations: "disabled",
    caret: "initial",
  });
}

const percentIn = (text: string) => /(\d+)%/.exec(text)?.[1];

test("expected tonight and the first night of booked ahead are one number", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await signInAs(page, "manager");

  // In house 4 (one a day overdue, who stays), 2 of them go today, 2 arrivals
  // hold a room (the third is in a blocked room): 4 held. Of 11 rooms, one is
  // blocked and one out of order, so 9 can be let.
  const tile = page.getByRole("link", { name: /In house/ });
  await expect(tile).toContainText(
    "Expected tonight 4 / 9 available rooms (44%)",
  );

  const booked = page.getByRole("region", { name: "Booked ahead" });
  const first = booked.locator("table tbody tr").first();
  await expect(first).toContainText("4 of 9");
  // The tile's big numeral is who is in house now; tonight is in brackets.
  expect(percentIn(await first.innerText())).toBe(
    /\((\d+)%\)/.exec(await tile.innerText())?.[1],
  );
  await capture(page, "manager-today");

  // The calendar says the same of the same night: four rooms held of nine.
  await page.goto(`/en/room-calendar?property=${day.propertyId}`);
  const free = page
    .getByRole("row", { name: /^Free/ })
    .getByRole("cell")
    .nth(3);
  await expect(free).toHaveAccessibleName(/5 of 11 free|5 of 9 free/);
  await expect(free).toHaveText("5");
});

test("the overdue Guest is days late on the tile, the row and the card", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await signInAs(page, "front_desk");

  const tile = page.getByRole("link", { name: /Checked out/ });
  await expect(tile).toContainText("1 to leave, overdue 1 day");

  const card = page
    .getByRole("region", { name: "Needs attention" })
    .getByRole("link", { name: /Overdue departure/ });
  await expect(card).toContainText(/1 day overdue · was due to leave on/);

  await page.getByRole("tab", { name: /^Departures/ }).click();
  await expect(
    page.getByRole("tabpanel").getByText("Overdue · 1 day"),
  ).toBeVisible();
  await capture(page, "front-desk-overdue-guest");
});

test("days waiting to be closed lead what needs attention and open Close the day (CLOSE-06)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await signInAs(page, "front_desk");

  const card = page
    .getByRole("region", { name: "Needs attention" })
    .getByRole("listitem")
    .first()
    .getByRole("link");
  await expect(card).toContainText("Days not closed");
  const waiting = /(\d+) days? waiting to be closed/.exec(
    await card.innerText(),
  )?.[1];
  expect(waiting, "the card says how many days wait").toBeDefined();
  await capture(page, "days-waiting-to-be-closed");

  // The same number the screen that closes them counts.
  await card.click();
  await expect(page).toHaveURL(
    new RegExp(`/en/close-day\\?property=${day.propertyId}`),
  );
  await expect(page.locator("main")).toContainText(
    new RegExp(`\\b${waiting} days? waiting`),
  );
});

test("housekeeping is not told about days waiting to be closed", async ({
  page,
}) => {
  await signInAs(page, "housekeeping");
  await expect(
    page.getByRole("region", { name: "Needs attention" }),
  ).toBeVisible();
  await expect(page.getByText("Days not closed")).toHaveCount(0);
});

test("a room not ready says why, and a desk that may mark rooms is sent to the board", async ({
  page,
}) => {
  await signInAs(page, "front_desk");
  const card = page
    .getByRole("region", { name: "Needs attention" })
    .getByRole("link", { name: /Room not ready/ });
  // 102 is dirty on the board, not waiting for an inspection.
  await expect(card).toContainText("the room has not been cleaned yet");
  await expect(card).toHaveAttribute(
    "href",
    new RegExp(
      `/en/housekeeping\\?property=${day.propertyId}&show=for_arrival$`,
    ),
  );
  await card.click();
  await expect(page).toHaveURL(/show=for_arrival/);
  await expect(page.getByTestId("list-filter-notice")).toBeVisible();
});

test("housekeeping is not told twice about a room the clean-first queue lists", async ({
  page,
}) => {
  await signInAs(page, "housekeeping");
  await expect(
    page.getByRole("heading", { name: "Clean these first" }),
  ).toBeVisible();
  await expect(page.getByRole("list").getByText("102").first()).toBeVisible();
  // 102 is in the queue above, with its own button. 302 is blocked, which no
  // amount of cleaning ready: that is the one thing left to say.
  const attention = page.getByRole("region", { name: "Needs attention" });
  await expect(attention.getByText("102")).toHaveCount(0);
  await expect(attention).toContainText("302");
  await expect(attention).toContainText(
    "Arriving today; the room is blocked or out of service.",
  );
});

test("recent activity names who and what about, without an address, and starts from yesterday", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await signInAs(page, "manager");
  const activity = page.getByRole("region", { name: "Recent activity" });
  await expect(activity).toContainText("Nothing recorded since yesterday.");

  // A check-in at the desk is the first thing to be recorded since.
  psql("delete from public.auth_rate_limit");
  await signOut(page);
  await signIn(page, day.email.front_desk);
  await page.goto(`/en/arrivals?property=${day.propertyId}`);
  const row = page
    .getByRole("row")
    .filter({ hasText: day.guest.ready })
    .filter({ hasNotText: day.guest.notReady });
  const checkIn = row.getByRole("button", { name: "Check in" });
  // A press before the page has hydrated sends nothing, which is how this
  // failed on CI: no request, and the row still offering Check in.
  await whenHydrated(checkIn);
  await checkIn.click();
  await expect(row.getByText("Checked in")).toBeVisible();

  psql("delete from public.auth_rate_limit");
  await signOut(page);
  await signIn(page, day.email.manager);
  await page.goto(`/en/today?property=${day.propertyId}`);
  const rows = page.getByRole("region", { name: "Recent activity" });
  await expect(rows).toContainText(day.guest.ready);
  const text = await rows.innerText();
  // The desk's person as a colleague says it: no @ and no domain.
  expect(text).not.toContain("@");
  expect(text).not.toContain("example.test");
  expect(text).toContain(
    `e2e-day-${day.email.front_desk.split("-")[2]}-front_desk`,
  );
  await capture(page, "manager-recent-activity");
});

test("a tab that goes offline says its figures are old, without waiting for a refresh to fail", async ({
  page,
  context,
}) => {
  await signInAs(page, "front_desk");
  await expect(page.getByRole("status").first()).toContainText(/^Updated/);
  await context.setOffline(true);
  await expect(page.getByRole("status").first()).toContainText(
    "Couldn't refresh",
  );
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("status").first()).toContainText(/^Updated/);
  // A request the page had under way when the network went is reported by the
  // browser as lost, which is what going offline does and not a fault of the
  // page. Whether one was under way depends on the moment, so it is the one
  // error this test caused itself and is not asked about.
  reported.set(
    page,
    (reported.get(page) ?? []).filter(
      (message) => !message.includes("ERR_INTERNET_DISCONNECTED"),
    ),
  );
});

test("arrivals and departures are tabs, and the arrow keys move between them", async ({
  page,
}) => {
  await signInAs(page, "front_desk");
  const tabs = page.getByRole("tablist");
  const arrivals = tabs.getByRole("tab", { name: /^Arrivals/ });
  const departures = tabs.getByRole("tab", { name: /^Departures/ });
  await expect(arrivals).toHaveAttribute("aria-selected", "true");
  await arrivals.focus();
  await page.keyboard.press("ArrowRight");
  await expect(departures).toBeFocused();
  await expect(departures).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveAccessibleName(/Departures/);
  await page.keyboard.press("ArrowLeft");
  await expect(arrivals).toBeFocused();
});

test("the time zone is named in the reader's language, not spelled as its identifier", async ({
  page,
}) => {
  await signInAs(page, "manager");
  await expect(page.locator("main")).not.toContainText(/europe\/istanbul/i);
  for (const locale of ["en", "tr", "ar"]) {
    await page.goto(`/${locale}/today?property=${day.propertyId}`);
    const zone = page.getByTitle("Europe/Istanbul");
    await expect(zone).toBeVisible();
    expect((await zone.innerText()).toLowerCase()).not.toContain("europe");
  }
});

test("the booked-ahead line has day ticks and says a night's figure where it is pointed at", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await signInAs(page, "manager");
  const booked = page.getByRole("region", { name: "Booked ahead" });
  // Until React has taken the link over, a pointer over it does nothing.
  await expect
    .poll(() =>
      booked
        .locator("a")
        .first()
        .evaluate((node) =>
          Object.keys(node).some((key) => key.startsWith("__reactProps")),
        ),
    )
    .toBe(true);
  const chart = booked.locator("svg.h-20");
  await chart.scrollIntoViewIfNeeded();
  const box = (await chart.boundingBox())!;
  // The ticks: a day number for each of the fourteen nights.
  await expect(booked.locator("[aria-hidden='true'] > span > bdi")).toHaveCount(
    14,
  );
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, {
    steps: 5,
  });
  const readout = booked.locator("a").first();
  await expect(readout).toContainText(/ · \d+ of \d+ · \d+%/);
  await capture(page, "booked-ahead-reads-a-night");
  await page.mouse.move(5, 5);
  await expect(readout).not.toContainText(/ · \d+ of \d+ · \d+%/);
});

test("on a phone the figures come straight after what needs attention", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAs(page, "front_desk");
  const region = page.getByRole("region", { name: "Needs attention" });
  await expect(region.getByRole("listitem").first()).toBeVisible();
  // The layout switcher says its name and nothing else. Left to Radix it filled
  // in the name and the hint under it once the page was up, which grew the
  // header by a line after the list had been measured (CI saw 56px too many).
  await expect(page.getByRole("combobox", { name: "Layout" })).toHaveText(
    "Overview",
  );
  // Folded, so the figures are not two thousand pixels down: four rooms
  // before "more", and the one card for days waiting to be closed, which no
  // fold hides.
  const cards = region
    .getByRole("listitem")
    .filter({ hasNot: page.getByRole("button", { name: /^\d+ more$/ }) });
  expect(await cards.count()).toBeLessThanOrEqual(4 + 1);
  const attention = await region.boundingBox();
  const tile = await page
    .getByRole("link", { name: /Checked in/ })
    .boundingBox();
  const movements = await page
    .getByRole("heading", { name: "Today's movements" })
    .boundingBox();
  // Straight after: nothing between the list and the first figure but the
  // page's own gap of 1.5 rem.
  expect(tile!.y - (attention!.y + attention!.height)).toBeCloseTo(24, 0);
  expect(tile!.y).toBeLessThan(movements!.y);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await capture(page, "phone-today");
});

test("in Arabic a fraction is read with a word, and the overdue count with its days", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await signInAs(page, "front_desk", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const main = page.locator("main");
  await expect(main).toContainText(/\d\s*من\s*\d/);
  await expect(main).toContainText("مغادرة واحدة متأخرة منذ يوم");
  await capture(page, "front-desk-today-arabic");
});
