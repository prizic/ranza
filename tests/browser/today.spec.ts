import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  anArrivalToday,
  aPropertyTheViewerDoesNotReach,
  signIn,
  testProperty,
} from "./front-desk";
import {
  aKnownDay,
  aQuietProperty,
  OWED_OVERDUE,
  OWED_TODAY,
  type KnownDay,
} from "./known-day";
import { psql } from "./local-database";

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

  // Every link in the page carries the Property — except the Organization
  // strip, whose whole purpose is to name the others (TD-S3-03); each of those
  // names one.
  const hrefs = await page
    .locator("main a[href]:not([aria-labelledby='today-properties'] a)")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(hrefs.length).toBeGreaterThan(3);
  for (const href of hrefs) expect(href).toContain(`property=${propertyId}`);
  const others = await page
    .locator("[aria-labelledby='today-properties'] a")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  for (const href of others) expect(href).toMatch(/\?property=[0-9a-f-]{36}$/);

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

test("a Property named in the URL that Today does not reach goes back to Today on the Property it opens on", async ({
  page,
}) => {
  testProperty();
  const unreached = aPropertyTheViewerDoesNotReach();
  await signIn(page);
  await page.goto(`/en/today?property=${unreached}`);
  // Back to Today, which then names the Property it opens on (OA-S3-01) —
  // one the viewer reaches, never the one the URL asked for.
  // The address it was given already matches that shape, and the redirect
  // lands after the first paint, so wait on the id itself changing.
  await expect
    .poll(() => new URL(page.url()).searchParams.get("property"))
    .not.toBe(unreached);
  await expect(page).toHaveURL(/\/en\/today\?property=[0-9a-f-]+$/);
  await expect(
    page.getByRole("heading", { name: /Needs attention/ }),
  ).toBeAttached();
});

/**
 * Every number on Today opens the list that explains it (RANZ-22, TD-S1-22,
 * TD-S5-01).
 *
 * The figures are derived and the lists are read by different code, so the only
 * proof that they agree is to read the figure, follow it, and count what the
 * list shows. The day is built here from rows whose kind is known, in an
 * Organization no other spec touches, so a number can also be checked against
 * the day itself and not only against the list it opens.
 */
test.describe("every number on Today opens the list that explains it", () => {
  let day: KnownDay;

  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ playwright }) => {
    test.setTimeout(240_000);
    const baseURL = test.info().project.use.baseURL!;
    const request = await playwright.request.newContext({ baseURL });
    day = await aKnownDay(request, new URL(baseURL).origin);
    await request.dispose();
  });

  /** The quiet Property, made the first time a test needs it and kept for the run. */
  let quietId: string | undefined;
  const quietProperty = () => (quietId ??= aQuietProperty(day));

  /** What the browser reported while a test ran: a page that errors is not Today working. */
  const reported = new WeakMap<Page, string[]>();

  test.afterEach(async ({ page }) => {
    expect(reported.get(page) ?? [], "the browser reported errors").toEqual([]);
  });

  async function signInAs(page: Page, focus: keyof KnownDay["email"]) {
    const errors: string[] = [];
    reported.set(page, errors);
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    // Sign-ins are limited to a few per ten seconds, and the limit lives in this
    // database.
    psql("delete from public.auth_rate_limit");
    await signIn(page, day.email[focus]);
    await expect(page).toHaveURL(
      new RegExp(`/en/today\\?property=${day.propertyId}$`),
    );
  }

  async function openToday(page: Page, locale = "en") {
    await page.goto(`/${locale}/today?property=${day.propertyId}`);
    await expect(page.locator("main")).toContainText(/\d/);
  }

  /** The whole numbers in a piece of text, in reading order. */
  function integers(text: string): number[] {
    return (text.replace(/[,.](?=\d{3}\b)/g, "").match(/\d+/g) ?? []).map(
      Number,
    );
  }

  /** A figure on Today: the link whose label says what it counts. */
  function figure(
    page: Page,
    segment: string,
    label: string | RegExp,
  ): Locator {
    return page
      .locator(`main a[href^="/en/${segment}?"]`)
      .filter({ hasText: label })
      .first();
  }

  async function follow(
    page: Page,
    link: Locator,
    propertyId = day.propertyId,
  ): Promise<void> {
    const href = await link.getAttribute("href");
    expect(href, "a figure is a link").not.toBeNull();
    expect(href).toContain(`property=${propertyId}`);
    await link.click();
    await expect(page).toHaveURL(href!);
  }

  /** What the open list says it holds, from its own footer. */
  async function listed(page: Page): Promise<number> {
    const results = page.getByText(/^\d+ results?$/);
    await expect(results).toBeVisible();
    const count = integers(await results.innerText())[0]!;
    // The first table: Departures keeps a second one, of who has gone, under it.
    await expect(page.locator("table").first().locator("tbody tr")).toHaveCount(
      count,
    );
    return count;
  }

  /** The notice a narrowed list opens with, as numbers. */
  async function notice(page: Page): Promise<{ count: number; text: string }> {
    const element = page.getByTestId("list-filter-notice");
    await expect(element).toBeVisible();
    const text = (await element.innerText()).replace(/\s+/g, " ");
    return { count: integers(text)[0]!, text };
  }

  async function capture(page: Page, name: string): Promise<void> {
    await page.screenshot({
      path: `docs/evidence/m1/RANZ-22/${name}.png`,
      animations: "disabled",
      // The default injects a style into inputs, which is a change to the page that
      // a hydration still under way reads as a mismatch.
      caret: "initial",
    });
  }

  test("the day is what the fixture says it is", async () => {
    expect(
      psql(
        `select count(*) from public.stays
        where property_id = '${day.propertyId}' and status = 'in_house'`,
      ),
    ).toBe("4");
    expect(OWED_TODAY).toBeGreaterThan(OWED_OVERDUE);
  });

  test("the front desk's arrivals figures open exactly the arrivals they count", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInAs(page, "front_desk");
    await openToday(page);
    await capture(page, "front-desk-today");

    const { arrivals } = day.expected;

    // "Checked in 1 / 4": the whole day's arrivals, one of them in.
    const tile = figure(page, "arrivals", "Checked in");
    expect(integers(await tile.innerText()).slice(0, 2)).toEqual([
      arrivals.checkedIn,
      arrivals.expected,
    ]);
    await follow(page, tile);
    expect(await listed(page)).toBe(arrivals.expected);
    await expect(page.getByText("Checked in", { exact: true })).toHaveCount(
      arrivals.checkedIn,
    );

    // "Rooms ready for waiting arrivals 1 / 3, 1 room not ready yet": only the
    // ones still to come, one of whose rooms is ready, one not, and one blocked.
    await openToday(page);
    const ready = figure(page, "arrivals", "Rooms ready");
    const readyText = await ready.innerText();
    expect(integers(readyText).slice(0, 3)).toEqual([
      arrivals.ready,
      arrivals.toCome,
      arrivals.notReady,
    ]);
    await follow(page, ready);
    expect(await listed(page)).toBe(arrivals.toCome);
    expect((await notice(page)).count).toBe(arrivals.toCome);
    await expect(page.getByText("Ready", { exact: true })).toHaveCount(
      arrivals.ready,
    );
    await expect(page.getByText("Not ready", { exact: true })).toHaveCount(
      arrivals.notReady,
    );
    await capture(page, "arrivals-to-come");

    // The movements card: its tab, and the link under it, say the same number.
    await openToday(page);
    const movements = page.getByRole("region", { name: "Today's movements" });
    await expect(
      movements.getByRole("button", { name: `Arrivals · ${arrivals.toCome}` }),
    ).toBeVisible();
    await follow(
      page,
      movements.getByRole("link", {
        name: `All ${arrivals.toCome} arrivals`,
      }),
    );
    expect(await listed(page)).toBe(arrivals.toCome);
  });

  test("the front desk's departures figures open exactly the departures they count", async ({
    page,
  }) => {
    await signInAs(page, "front_desk");
    await openToday(page);
    const { departures } = day.expected;

    // "Checked out 1 / 3, 1 overdue": three still to go (one overdue) in the
    // list, and the one who has gone in the list under it.
    const tile = figure(page, "departures", "Checked out");
    const text = await tile.innerText();
    expect(integers(text)).toEqual([
      departures.departed,
      departures.due,
      departures.overdue,
    ]);
    await follow(page, tile);
    expect(await listed(page)).toBe(
      departures.due - departures.departed + departures.overdue,
    );
    await expect(page.getByText(/^Overdue since /)).toHaveCount(
      departures.overdue,
    );
    const leftToday = page.getByTestId("left-today-count");
    await expect(leftToday).toHaveText(String(departures.departed));
    await expect(
      page.getByRole("region", { name: "Left today" }).locator("tbody tr"),
    ).toHaveCount(departures.departed);
    await capture(page, "departures-and-left-today");

    // The movements card's departures tab and link.
    await openToday(page);
    const movements = page.getByRole("region", { name: "Today's movements" });
    const stillHere = departures.due - departures.departed + departures.overdue;
    await movements
      .getByRole("button", { name: `Departures · ${stillHere}` })
      .click();
    await follow(
      page,
      movements.getByRole("link", { name: `All ${stillHere} departures` }),
    );
    expect(await listed(page)).toBe(stillHere);
  });

  test("the occupancy figure is the rooms screen's own count", async ({
    page,
  }) => {
    await signInAs(page, "front_desk");
    await openToday(page);
    const tile = figure(page, "rooms", "In house");
    // The big numeral is the percentage; the label under it says what of what.
    const said = /in house\s*·\s*(\d+)\s*\/\s*(\d+)/i.exec(
      await tile.innerText(),
    );
    expect(said, "the label names the count").not.toBeNull();
    const [inHouse, sellable] = [Number(said![1]), Number(said![2])];
    await follow(page, tile);

    const stat = (label: string) =>
      page
        .locator("div")
        .filter({ has: page.getByText(label, { exact: true }) })
        .filter({ hasText: /^\D*\d+\D*$/ })
        .last();
    expect(integers(await stat("Occupied").innerText())[0]).toBe(inHouse);
    expect(integers(await stat("Beds").innerText())[0]).toBe(sellable);
    expect(inHouse).toBe(4);
  });

  test("the manager's rooms card opens the rooms each count is of", async ({
    page,
  }) => {
    await signInAs(page, "manager");
    await openToday(page);

    const card = page.getByRole("region", { name: "Rooms", exact: true });
    const kinds = [
      { row: "Ready", filter: "ready", expected: 2 },
      { row: "Clean, awaiting inspection", filter: "awaiting", expected: 5 },
      { row: "Dirty", filter: "dirty", expected: 2 },
      { row: "Out of service", filter: "out", expected: 2 },
    ];
    for (const kind of kinds) {
      await openToday(page);
      const link = card.getByRole("link", { name: new RegExp(`^${kind.row}`) });
      expect(integers(await link.innerText())[0]).toBe(kind.expected);
      await follow(page, link);
      expect(await listed(page)).toBe(kind.expected);
      expect((await notice(page)).count).toBe(kind.expected);
    }

    // The ready-rooms figure: ready of the rooms in service.
    await openToday(page);
    const ready = figure(page, "housekeeping", "Ready rooms");
    expect(integers(await ready.innerText()).slice(0, 2)).toEqual([2, 9]);
    await follow(page, ready);
    expect(await listed(page)).toBe(9);
    expect((await notice(page)).text).toContain("2 ready");
    await capture(page, "housekeeping-in-service");

    // By floor: each floor's rooms, and how many of them are ready.
    await openToday(page);
    const floors = page.getByRole("region", { name: "Ready rooms by floor" });
    const floorLinks = floors.getByRole("link");
    const total = await floorLinks.count();
    expect(total).toBe(3);
    for (let index = 0; index < total; index += 1) {
      await openToday(page);
      const link = page
        .getByRole("region", { name: "Ready rooms by floor" })
        .getByRole("link")
        .nth(index);
      // "Floor 1" then "ready / rooms": the last two numbers.
      const [readyOnFloor, onFloor] = integers(await link.innerText()).slice(
        -2,
      );
      await follow(page, link);
      expect(await listed(page)).toBe(onFloor);
      expect((await notice(page)).text).toContain(`${readyOnFloor} ready`);
    }
  });

  test("the manager's maintenance figures are the maintenance board's own", async ({
    page,
  }) => {
    await signInAs(page, "manager");
    await openToday(page);
    const card = page.getByRole("region", { name: "Maintenance", exact: true });
    const read = async (label: string) =>
      integers(
        await card
          .getByRole("link")
          .filter({ hasText: label })
          .first()
          .innerText(),
      )[0]!;
    const figures = {
      open: await read("Open requests"),
      fresh: await read("New"),
      inProgress: await read("In progress"),
      waiting: await read("Waiting for parts"),
      outOfOrder: await read("Out of order"),
    };
    expect(figures).toEqual({
      open: 3,
      fresh: 1,
      inProgress: 1,
      waiting: 1,
      outOfOrder: 1,
    });

    await follow(
      page,
      card.getByRole("link").filter({ hasText: "Open requests" }).first(),
    );
    const stat = async (label: string) =>
      integers(
        await page
          .locator("div")
          .filter({ has: page.getByText(label, { exact: true }) })
          .filter({ hasText: /^\D*\d+\D*$/ })
          .last()
          .innerText(),
      )[0];
    expect(await stat("Open")).toBe(figures.open);
    expect(await stat("Out of order")).toBe(figures.outOfOrder);
    for (const [heading, count] of [
      ["New", figures.fresh],
      ["In progress", figures.inProgress],
      ["Waiting for parts", figures.waiting],
    ] as const) {
      const column = page.getByRole("heading", { name: heading, level: 3 });
      expect(integers(await column.innerText())[0]).toBe(count);
    }
  });

  test("the housekeeping figures open the rooms they count", async ({
    page,
  }) => {
    await signInAs(page, "housekeeping");
    await openToday(page);

    const figures: [string | RegExp, number, string][] = [
      ["To clean", 2, "housekeeping"],
      ["Awaiting inspection", 5, "housekeeping"],
      ["Arrivals waiting on a room", 1, "housekeeping"],
    ];
    for (const [label, expected, segment] of figures) {
      await openToday(page);
      const tile = figure(page, segment, label);
      expect(integers(await tile.innerText())[0]).toBe(expected);
      await follow(page, tile);
      expect(await listed(page)).toBe(expected);
      expect((await notice(page)).count).toBe(expected);
    }
    await openToday(page);
    const ready = figure(page, "housekeeping", "Ready rooms");
    expect(integers(await ready.innerText()).slice(0, 2)).toEqual([2, 9]);

    // The clean-first queue: its count and the link under it are the same rooms.
    await openToday(page);
    const queue = page.getByRole("link", { name: /^\d+ rooms?$/ });
    const queued = integers(await queue.innerText())[0]!;
    await follow(page, queue);
    expect(await listed(page)).toBe(queued);
    expect((await notice(page)).count).toBe(queued);
    await capture(page, "housekeeping-clean-first");
  });

  test("the finance figures open the Guests and the Folios they total", async ({
    page,
  }) => {
    await signInAs(page, "finance");
    await openToday(page);
    const { owing, openFolios } = day.expected;

    const owed = figure(page, "departures", "Balance on today's departures");
    const owedText = await owed.innerText();
    expect(integers(owedText).at(-1)).toBe(owing.guests);
    expect(owedText).toContain("255");
    await follow(page, owed);
    expect(await listed(page)).toBe(owing.guests);
    const owedNotice = await notice(page);
    expect(owedNotice.count).toBe(owing.guests);
    expect(owedNotice.text).toContain("255");
    await capture(page, "departures-owing");

    await openToday(page);
    const overdue = figure(page, "departures", "Overdue with a balance");
    expect(integers(await overdue.innerText())[0]).toBe(owing.overdueGuests);
    await follow(page, overdue);
    expect(await listed(page)).toBe(owing.overdueGuests);
    expect((await notice(page)).text).toContain("75");

    await openToday(page);
    const folios = figure(page, "finance", "Open Folios");
    expect(integers(await folios.innerText())[0]).toBe(openFolios);
    await follow(page, folios);
    expect(await listed(page)).toBe(openFolios);
    expect((await notice(page)).count).toBe(openFolios);

    await openToday(page);
    const balance = figure(page, "finance", "Balance across open Folios");
    await follow(page, balance);
    expect(await listed(page)).toBe(openFolios);
    expect((await notice(page)).text).toContain("255");
  });

  test("the Organization strip is absent with a single Property", async ({
    page,
  }) => {
    await signInAs(page, "manager");
    await openToday(page);
    await expect(
      page.getByRole("heading", { name: "Your Properties" }),
    ).toHaveCount(0);
  });

  test("charges today are charges less reversals, for the money figures' own focuses", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInAs(page, "manager");
    await openToday(page);
    const card = page.getByRole("region", { name: "Charges today" });
    // What the fixture posted today: 180.00 and 75.00 of Minibar.
    await expect(card).toContainText("255.00");
    await follow(page, card.getByRole("link"));
    await expect(page).toHaveURL(
      new RegExp(`/en/finance\\?property=${day.propertyId}$`),
    );

    // The finance focus has it too; a front desk, which also holds
    // finance.manage_folio, does not (TD-S1-02), and nor does housekeeping.
    await page.context().clearCookies();
    await signInAs(page, "finance");
    await openToday(page);
    await expect(
      page.getByRole("region", { name: "Charges today" }),
    ).toContainText("255.00");
    for (const focus of ["front_desk", "housekeeping"] as const) {
      await page.context().clearCookies();
      await signInAs(page, focus);
      await openToday(page);
      await expect(
        page.getByRole("region", { name: "Charges today" }),
      ).toHaveCount(0);
    }
  });

  test("booked ahead is the next fourteen nights of bookings and Stays, with the same values in a table", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInAs(page, "manager");
    await openToday(page);
    const card = page.getByRole("region", { name: "Booked ahead" });
    await expect(card).toBeVisible();
    const rows = card.locator("table tbody tr");
    await expect(rows).toHaveCount(14);
    // Tonight: the Guest in 103, the overdue Guest in 203 and the two
    // bookings arriving into 101 and 102 hold it. Two Guests due out today
    // do not, and 301 and 302 are out of use: four of the nine in use.
    await expect(rows.first()).toContainText("4 of 9");
    await expect(rows.first()).toContainText("44%");
    await follow(page, card.getByRole("link"));
    await expect(page).toHaveURL(
      new RegExp(`/en/room-calendar\\?property=${day.propertyId}$`),
    );
    await openToday(page);
    await capture(page, "manager-today-depth");
  });

  test("on a quiet day every figure reads zero and still opens its list", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const quiet = quietProperty();
    await signInAs(page, "manager");
    await page.goto(`/en/today?property=${quiet}`);
    await expect(page.getByText("Nothing needs attention.")).toBeVisible();
    await capture(page, "quiet-day-today");

    const zero = async (segment: string, label: string | RegExp) => {
      const tile = page
        .locator(`main a[href^="/en/${segment}?"]`)
        .filter({ hasText: label })
        .first();
      expect(integers(await tile.innerText()).slice(0, 2)).toEqual([0, 0]);
    };
    await zero("arrivals", "Checked in");
    await zero("departures", "Checked out");
    await zero("housekeeping", "Ready rooms");
    // The occupancy figure and the booked line both say there is nothing to let.
    await expect(page.getByText("No units to let").first()).toBeVisible();
    await expect(page.getByText("Nobody arrives today")).toBeVisible();

    // Each count in the rooms card is zero and opens a list that says so.
    const rows = [
      "Ready",
      "Clean, awaiting inspection",
      "Dirty",
      "Out of service",
    ];
    for (const label of rows) {
      await page.goto(`/en/today?property=${quiet}`);
      const link = page
        .getByRole("region", { name: "Rooms", exact: true })
        .getByRole("link", { name: new RegExp(`^${label}`) });
      expect(integers(await link.innerText())[0]).toBe(0);
      await follow(page, link, quiet);
      expect((await notice(page)).count).toBe(0);
      await expect(page.getByText("No rooms here yet")).toBeVisible();
    }
  });

  test("a count of one and a count of many read right in every language", async ({
    page,
  }) => {
    const departures = `property=${day.propertyId}`;
    const cases: Record<string, { many: string; one: string; zero: string }> = {
      en: {
        many: "2 Guests leaving with a balance",
        one: "1 overdue departure with a balance",
        zero: "0 Guests leaving with a balance",
      },
      tr: {
        many: "2 misafir bakiyeyle ayrılıyor",
        one: "1 gecikmiş çıkış, bakiyeli",
        zero: "0 misafir bakiyeyle ayrılıyor",
      },
      ar: {
        many: "ضيفان يغادران برصيد",
        one: "مغادرة متأخرة واحدة برصيد",
        zero: "لا ضيوف يغادرون برصيد",
      },
    };
    await signInAs(page, "finance");
    const quiet = quietProperty();
    for (const [locale, words] of Object.entries(cases)) {
      await page.goto(`/${locale}/departures?${departures}&show=owing`);
      expect((await notice(page)).text).toContain(words.many);
      await page.goto(`/${locale}/departures?${departures}&show=overdue_owing`);
      expect((await notice(page)).text).toContain(words.one);
      await page.goto(`/${locale}/departures?property=${quiet}&show=owing`);
      expect((await notice(page)).text).toContain(words.zero);
    }
  });

  /**
   * The numbers on Today that are not themselves a way in, and why each is fine.
   * Anything else with a digit in it that is not a link or a control fails here,
   * so a figure cannot be added to Today without somewhere to go.
   */
  const NOT_A_WAY_IN = [
    // The Property's clock and the working day it is in.
    /^\d{1,2}:\d{2}/,
    /\d{4}$/,
    /^Updated \d/,
    // How many items the "Needs attention" row below it holds; each one is a link.
    /^\d+$/,
  ];

  test("every number on Today is a way in, or says what it counts", async ({
    page,
  }) => {
    for (const focus of [
      "manager",
      "front_desk",
      "housekeeping",
      "finance",
    ] as const) {
      await signInAs(page, focus);
      await openToday(page);
      const strays = await page.evaluate(() => {
        const found: string[] = [];
        const walker = document.createTreeWalker(
          document.querySelector("main")!,
          NodeFilter.SHOW_TEXT,
        );
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = (node.textContent ?? "").trim();
          if (!/\d/.test(text)) continue;
          // A number inside a link or a control is a way in (or the control that
          // switches the list under it).
          if (node.parentElement?.closest("a, button")) continue;
          found.push(text);
        }
        return found;
      });
      for (const stray of strays) {
        expect(
          NOT_A_WAY_IN.some((allowed) => allowed.test(stray)),
          `${focus}: "${stray}" is a number on Today that opens nothing`,
        ).toBe(true);
      }
      await page.context().clearCookies();
    }
  });

  // From here the tests change the day, so each reads what it needs from the
  // page as it finds it and none counts on the figures above staying as they were.

  /** "Check ⁨Guest⁩ out": the button names the Guest, set apart for a reader. */
  const CHECK_OUT = /^Check .+ out$/;

  /** A row in the movements card, by the Guest on it. */
  function movementRow(page: Page, guest: string): Locator {
    return (
      page
        .getByRole("region", { name: "Today's movements" })
        .getByRole("listitem")
        // From the start: "Ready" is also the end of "NotReady".
        .filter({ hasText: new RegExp(`^${guest}`) })
    );
  }

  async function checkedInFigure(page: Page): Promise<number> {
    return integers(
      await figure(page, "arrivals", "Checked in").innerText(),
    )[0]!;
  }

  test("no action is offered without its permission", async ({ page }) => {
    // Holds check-in and not check-out: arrivals have a button, departures none.
    await signInAs(page, "checks_in_only");
    await openToday(page);
    await expect(
      movementRow(page, day.guest.ready).getByRole("button", {
        name: "Check in",
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^Departures/ }).click();
    await expect(movementRow(page, day.guest.owing)).toBeVisible();
    await expect(
      movementRow(page, day.guest.owing).getByRole("button"),
    ).toHaveCount(0);

    // The other half: departures have a button, arrivals none; and the way in
    // is still there on every row.
    await page.context().clearCookies();
    await signInAs(page, "checks_out_only");
    await openToday(page);
    await expect(movementRow(page, day.guest.ready)).toBeVisible();
    await expect(
      movementRow(page, day.guest.ready).getByRole("button"),
    ).toHaveCount(0);
    await expect(
      movementRow(page, day.guest.ready).getByRole("link"),
    ).toHaveCount(1);
    await page.getByRole("button", { name: /^Departures/ }).click();
    await expect(
      movementRow(page, day.guest.owing).getByRole("button", {
        name: CHECK_OUT,
      }),
    ).toBeVisible();
    // They hold no finance permission, so Today itself carries no balance for
    // them (TD-S1-03): the money in the dialog is the Departures screen's.
    await expect(movementRow(page, day.guest.owing)).not.toContainText("180");
  });

  test("check in from Today is the arrivals command, warning included", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInAs(page, "front_desk");
    await openToday(page);
    const before = await checkedInFigure(page);
    const stays = () =>
      Number(
        psql(
          `select count(*) from public.stays
          where property_id = '${day.propertyId}' and status = 'in_house'`,
        ),
      );
    const inHouse = stays();

    // A room that is ready: one press.
    await movementRow(page, day.guest.ready)
      .getByRole("button", { name: "Check in" })
      .click();
    await expect(movementRow(page, day.guest.ready)).toHaveCount(0);
    await expect.poll(() => checkedInFigure(page)).toBe(before + 1);

    // A room housekeeping has not made ready: the same question the Arrivals
    // screen asks, answered in the row.
    const dirty = movementRow(page, day.guest.notReady);
    await dirty.getByRole("button", { name: "Check in" }).click();
    await expect(dirty.getByText(/isn't ready yet/)).toBeVisible();
    await capture(page, "check-in-from-today-warns");
    await dirty.getByRole("button", { name: "Check in anyway" }).click();
    await expect(movementRow(page, day.guest.notReady)).toHaveCount(0);
    await expect.poll(() => checkedInFigure(page)).toBe(before + 2);
    expect(stays()).toBe(inHouse + 2);

    // A booking that cannot be checked in offers no button, only the way in.
    await expect(
      movementRow(page, day.guest.blocked).getByRole("button"),
    ).toHaveCount(0);
    await expect(
      movementRow(page, day.guest.blocked).getByRole("link"),
    ).toHaveCount(1);
  });

  test("mark from Today is the board command, and an occupied room is not marked", async ({
    page,
  }) => {
    await signInAs(page, "housekeeping");
    await openToday(page);
    const queue = page.getByRole("region", { name: "Clean these first" });
    const rowOf = (room: string) =>
      queue.getByRole("listitem").filter({ hasText: new RegExp(`^${room}`) });

    // A Guest still in the room: no button, and the row says why.
    await expect(rowOf("201")).toBeVisible();
    await expect(rowOf("201").getByRole("button")).toHaveCount(0);
    await expect(rowOf("201")).toContainText("A Guest is still in it");

    // A dirty room is marked clean from the row, and the board agrees.
    const dirtyBefore = integers(
      await figure(page, "housekeeping", "To clean").innerText(),
    )[0]!;
    await rowOf("204").getByRole("button", { name: "Mark clean" }).click();
    await expect(rowOf("204")).toHaveCount(0);
    await expect
      .poll(
        async () =>
          integers(
            await figure(page, "housekeeping", "To clean").innerText(),
          )[0],
      )
      .toBe(dirtyBefore - 1);
    expect(
      psql(
        `select status from public.housekeeping_unit_status
        where property_id = '${day.propertyId}'
          and accommodation_unit_id = (
            select id from public.accommodation_units
             where property_id = '${day.propertyId}' and name = '204')`,
      ),
    ).toBe("clean");
    await capture(page, "mark-from-today");
  });

  test("check out from Today is the departures command, balance review included", async ({
    page,
  }) => {
    await signInAs(page, "front_desk");
    await openToday(page);
    await page.getByRole("button", { name: /^Departures/ }).click();
    const departedBefore = integers(
      await figure(page, "departures", "Checked out").innerText(),
    )[0]!;

    // Nothing owed: the review, then done.
    const free = movementRow(page, day.guest.leavesFree);
    await free.getByRole("button", { name: CHECK_OUT }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(day.guest.leavesFree);
    await dialog.getByRole("button", { name: "Confirm check-out" }).click();
    await expect(movementRow(page, day.guest.leavesFree)).toHaveCount(0);
    await expect
      .poll(
        async () =>
          integers(
            await figure(page, "departures", "Checked out").innerText(),
          )[0],
      )
      .toBe(departedBefore + 1);

    // A balance: the review shows the bill and will not go through without a
    // reason, exactly as on the Departures screen.
    await movementRow(page, day.guest.owing)
      .getByRole("button", { name: CHECK_OUT })
      .click();
    const owing = page.getByRole("dialog");
    await expect(owing).toContainText("180");
    await owing
      .getByLabel("Why the balance stays open")
      .fill("Agreed with the manager");
    await capture(page, "check-out-from-today-review");
    await owing.getByRole("button", { name: "Confirm check-out" }).click();
    await expect(movementRow(page, day.guest.owing)).toHaveCount(0);
    await expect
      .poll(
        async () =>
          integers(
            await figure(page, "departures", "Checked out").innerText(),
          )[0],
      )
      .toBe(departedBefore + 2);
    expect(
      psql(
        `select count(*) from public.stays
        where property_id = '${day.propertyId}' and status = 'departed'`,
      ),
    ).toBe(String(1 + 2));
  });

  test("recent activity follows audit.read, and each row opens its record", async ({
    page,
  }) => {
    await signInAs(page, "manager");
    await openToday(page);
    const card = page.getByRole("region", { name: "Recent activity" });
    // The check-ins, marks and check-outs above left records.
    const rows = card.getByRole("listitem");
    await expect.poll(() => rows.count()).toBeGreaterThan(0);
    expect(await rows.count()).toBeLessThanOrEqual(5);
    const first = rows.first().getByRole("link");
    const href = (await first.getAttribute("href"))!;
    expect(href).toMatch(
      new RegExp(
        `/en/audit-log\\?property=${day.propertyId}&record=[0-9a-f-]{36}$`,
      ),
    );
    await follow(page, first);
    await expect(
      page.getByRole("heading", { name: /Record|Details/i }).first(),
    ).toBeVisible();

    // Nobody without audit.read is sent it.
    for (const focus of ["front_desk", "finance"] as const) {
      await page.context().clearCookies();
      await signInAs(page, focus);
      await openToday(page);
      await expect(
        page.getByRole("region", { name: "Recent activity" }),
      ).toHaveCount(0);
    }
  });

  test("the Organization strip shows only with several Properties, and choosing one is a full load", async ({
    page,
  }) => {
    const quiet = quietProperty();
    await signInAs(page, "manager");
    await openToday(page);
    const strip = page.getByRole("region", { name: "Your Properties" });
    await expect(strip.getByRole("listitem")).toHaveCount(2);
    // This Property's own attention count, as its Today says it.
    const attention = integers(
      await page.locator("#today-attention").innerText(),
    )[0]!;
    const here = strip.getByRole("link", { name: /E2E Day Property/ });
    await expect(here).toHaveAttribute("aria-current", "true");
    await expect(here).toContainText(
      attention === 1
        ? "1 thing needs attention"
        : `${attention} things need attention`,
    );
    // The quiet one reads nothing needing attention, and no occupancy to give.
    const other = strip.getByRole("link", { name: /E2E Quiet Property/ });
    await expect(other).toContainText("Nothing needs attention");
    await capture(page, "organization-strip");

    // A full load: the document is replaced, not navigated within.
    await markDocument(page);
    await other.click();
    await expect(page).toHaveURL(new RegExp(`/en/today\\?property=${quiet}$`));
    await expect(
      page.getByRole("heading", { name: /Needs attention/ }),
    ).toBeAttached();
    expect(
      await page.evaluate(
        () => (window as Window & { sameDocument?: boolean }).sameDocument,
      ),
    ).toBeUndefined();
  });

  test("a role that leads nowhere is told so, with no figure to follow", async ({
    page,
  }) => {
    await signInAs(page, "nowhere");
    await openToday(page);
    await expect(page.locator("main")).toContainText(
      "There is nothing here for your role at this Property yet.",
    );
    await expect(page.locator("main a[href*='property=']")).toHaveCount(0);
  });
});
