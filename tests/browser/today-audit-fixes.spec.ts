import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

import { anArrivalToday, signIn } from "./front-desk";
import { psql } from "./local-database";
import {
  anAuditDay,
  EARLY_IN_THE_DAY,
  LATE_IN_THE_DAY,
  type AuditDay,
} from "./today-audit-day";
import {
  layoutCookieName,
  type TodayLayout,
} from "../../apps/operator-workspace/src/features/today/layouts/model";

/**
 * Today as the 2026-10-24 UX audit met it (docs/ux-audit/2026-10-24/today):
 * a house with a pile of overdue Guests, arrivals with no time, one into a
 * dirty room, one blocked, one never confirmed, and ten days nobody closed.
 *
 * Each test is a finding or a group of them; the sentence of the test says
 * what the desk should be able to rely on. The numbers are compared across
 * layouts because the audit's complaint was that two cards on one page said two
 * different things.
 */

const EVIDENCE = "docs/evidence/ux-audit-2026-10-24/today";
let audit: AuditDay;

test.beforeAll(async ({ playwright }) => {
  test.setTimeout(240_000);
  const baseURL = test.info().project.use.baseURL;
  if (!baseURL) throw new Error("the project has a baseURL");
  const request = await playwright.request.newContext({ baseURL });
  audit = await anAuditDay(request, new URL(baseURL).origin);
  await request.dispose();
  mkdirSync(EVIDENCE, { recursive: true });
});

type Who = "manager" | "front_desk" | "housekeeping" | "finance";

async function openToday(
  page: Page,
  who: Who,
  layout: TodayLayout,
  locale: "en" | "ar" = "en",
) {
  // The sign-in route limits attempts; every test here signs in again.
  psql("delete from public.auth_rate_limit");
  await signIn(page, audit.day.email[who], layout);
  await page.goto(`/${locale}/today?property=${audit.day.propertyId}`);
  await expect(page.locator("main")).toContainText(/\d/);
}

/** The first whole number in a piece of text, or the n-th. */
function integer(text: string, index = 0): number {
  const found = text.replace(/,/g, "").match(/\d+/g) ?? [];
  const value = found[index];
  if (value === undefined) throw new Error(`no number ${index} in "${text}"`);
  return Number(value);
}

async function shoot(page: Page, name: string, target?: Locator) {
  const options = { path: `${EVIDENCE}/${name}.png`, animations: "disabled" };
  if (target) await target.screenshot(options as never);
  else await page.screenshot(options as never);
}

async function switchTo(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Layout" }).click();
  await page.getByRole("option", { name: new RegExp(name) }).click();
}

test.describe("one number for tonight, for the checked-out count and for dirty rooms", () => {
  test("tonight, checked out and dirty rooms say the same on every layout (TODAY-01, 02, 03, 04)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openToday(page, "front_desk", "timeline");

    // Timeline: "N expected tonight, of M rooms" and the sentence that says
    // overdue Guests are counted as staying.
    const inHouse = page.getByRole("link", { name: /In house now/ });
    const tonightText = await inHouse.innerText();
    const tonight = integer(tonightText.split("expected tonight")[0] ?? "", 1);
    const available = Number(
      /of (\d+) rooms/.exec(tonightText)?.[1] ?? Number.NaN,
    );
    expect(tonightText).toContain(
      `Counts ${audit.overdue} overdue guests as staying until checked out.`,
    );
    // The overdue guests are in house tonight: nobody has checked them out.
    expect(tonight).toBeGreaterThanOrEqual(audit.overdue);

    // Checked out: of the Guests due today, the overdue ones apart (TODAY-02).
    const checkedOut = await page
      .getByRole("link", { name: /Checked out/ })
      .innerText();
    expect(checkedOut).toContain(`${audit.overdue} departures overdue`);
    const gone = 1;
    const dueToday = gone + audit.leavingToday;
    expect(checkedOut.replace(/\s/g, "")).toContain(`${gone}/${dueToday}`);

    const timelineRooms = await page
      .getByRole("link", { name: /Rooms ready to sell/ })
      .innerText();
    const awaiting = integer(timelineRooms, 2);
    const dirty = integer(timelineRooms, 3);
    await shoot(
      page,
      "timeline-figures",
      page.locator("ul", { has: inHouse }).first(),
    );

    // Rooms card on the same Timeline: "N vacant rooms tonight, M ready".
    const roomsCard = page.getByRole("region", { name: "Rooms", exact: true });
    const vacantLine = await roomsCard
      .getByText(/vacant rooms? tonight/)
      .innerText();
    expect(integer(vacantLine)).toBe(integer(timelineRooms) + awaiting + dirty);

    // Overview: the same three numbers.
    await switchTo(page, "Overview");
    const overviewTonight = await page
      .getByText(/Expected tonight \d+ \/ \d+ available rooms/)
      .innerText();
    expect(integer(overviewTonight)).toBe(tonight);
    expect(integer(overviewTonight, 1)).toBe(available);
    expect(overviewTonight).toContain(
      `Counts ${audit.overdue} overdue Guests as staying until checked out.`,
    );
    const overviewDeparted = await page
      .getByRole("link", { name: /Checked out/ })
      .innerText();
    expect(overviewDeparted.replace(/\s/g, "")).toContain(
      `${gone}/${dueToday}`,
    );
    const rooms = page.getByRole("region", { name: "Rooms", exact: true });
    expect(
      integer(
        await rooms
          .getByRole("link", { name: /^Clean, awaiting inspection/ })
          .innerText(),
      ),
    ).toBe(awaiting);
    expect(
      integer(await rooms.getByRole("link", { name: /^Dirty/ }).innerText()),
    ).toBe(dirty);
    await shoot(page, "overview-tonight-and-rooms");

    // Night desk: the same line and the same last bar.
    await switchTo(page, "Night desk");
    const line = await page.getByText(/rooms tonight, \d+%/).innerText();
    expect(integer(line)).toBe(tonight);
    expect(integer(line, 1)).toBe(available);
    await expect(
      page.getByText(`${audit.overdue} overdue guests are counted as staying`),
    ).toBeVisible();
    const steps = page
      .getByRole("list", { name: "How the house moved today" })
      .getByRole("listitem");
    expect(integer(await steps.nth(5).innerText())).toBe(tonight);
  });

  test("the housekeeping figures leave the rooms a Guest is leaving to the end (TODAY-05)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openToday(page, "housekeeping", "overview");
    const toClean = page.getByRole("link", { name: /To clean/ });
    await expect(toClean).toContainText("waiting on");
    const queue = page.getByRole("region", { name: "Clean these first" });
    const kinds = await queue.locator("li").allInnerTexts();
    const divider = kinds.findIndex((text) =>
      text.includes("Waiting for the Guest to leave"),
    );
    // Every room after the divider is one a Guest is still in.
    if (divider >= 0) {
      for (const after of kinds.slice(divider + 1)) {
        expect(after).toContain("Leaving today");
      }
      for (const before of kinds.slice(0, divider)) {
        expect(before).not.toContain("Leaving today");
      }
    }
    await shoot(page, "housekeeping-clean-first");
  });
});

test.describe("the arrivals the desk still has to do", () => {
  test("every arrival still to come is a row with its command or its reason (TODAY-07, 08, 09)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openToday(page, "front_desk", "timeline");
    const rows = page.getByRole("region", { name: "Still to arrive" });
    const row = (guest: string) =>
      rows
        .getByRole("listitem")
        .filter({ has: page.getByText(guest, { exact: true }) });

    // Into a ready room: a plain Check in.
    await expect(
      row(audit.day.guest.ready).getByRole("button", { name: /Check in/ }),
    ).toBeVisible();
    // Into a dirty room: still offered, and the question is asked in place.
    const dirty = row(audit.day.guest.notReady);
    await expect(dirty).toContainText("Room: Dirty.");
    await dirty.getByRole("button", { name: /Check in/ }).click();
    await expect(
      dirty.getByRole("button", { name: "Check in anyway" }),
    ).toBeVisible();
    await dirty.getByRole("button", { name: "Not now" }).click();
    // Into a blocked room: why, and the screen that mends it, no Check in.
    const blocked = row(audit.day.guest.blocked);
    await expect(blocked).toContainText("The room is blocked.");
    await expect(
      blocked.getByRole("link", { name: "Open Housekeeping" }),
    ).toBeVisible();
    await expect(blocked.getByRole("button", { name: /Check in/ })).toHaveCount(
      0,
    );
    // A booking nobody confirmed: Arrivals owns it.
    const requested = row(audit.requestedGuest);
    await expect(requested).toContainText("The booking is not confirmed yet.");
    await expect(
      requested.getByRole("link", { name: "Open Arrivals" }),
    ).toBeVisible();
    // Without a time: said in words, not a bare link.
    await expect(rows.getByText("No expected time").first()).toBeVisible();
    await shoot(page, "timeline-arrivals-to-come", rows);
  });

  test("with no time on any arrival there is no chart; with one the axis keeps its labels (TODAY-22)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openToday(page, "front_desk", "timeline");
    const flow = page.getByRole("region", { name: "Today's flow" });
    await expect(flow.getByRole("button", { name: "Whole day" })).toHaveCount(
      0,
    );
    await expect(flow.getByText("On time", { exact: true })).toHaveCount(0);

    // One time that has certainly passed and one that has not, whatever the hour
    // the suite runs at: the line must draw both, at either edge of the day.
    anArrivalToday(audit.day.propertyId, EARLY_IN_THE_DAY);
    anArrivalToday(audit.day.propertyId, LATE_IN_THE_DAY);
    await page.reload();
    await expect(flow.getByRole("button", { name: "Whole day" })).toBeVisible();
    // The "Now" pill and the hour labels are on rows of their own.
    const now = await flow.getByText("Now", { exact: true }).boundingBox();
    const labels = await flow.locator("span.font-mono").evaluateAll((nodes) =>
      nodes
        .map((node) => node.getBoundingClientRect())
        .filter((box) => box.width > 0)
        .map((box) => ({ x: box.x, y: box.y, w: box.width, h: box.height })),
    );
    expect(now).not.toBeNull();
    for (const label of labels.filter((l) => l.y < (now?.y ?? 0) + 60)) {
      const overlaps =
        label.x < (now?.x ?? 0) + (now?.width ?? 0) &&
        label.x + label.w > (now?.x ?? 0) &&
        label.y < (now?.y ?? 0) + (now?.height ?? 0) &&
        label.y + label.h > (now?.y ?? 0);
      expect(overlaps, "an hour label sits under the Now pill").toBe(false);
    }
    await shoot(page, "timeline-axis", flow);
  });
});

test.describe("overdue departures appear once", () => {
  test("a Guest overdue to leave is one row with one Check out, and the plan says where they are (TODAY-11)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openToday(page, "front_desk", "timeline");
    const guest = audit.day.guest.overdue;
    const flow = page.getByRole("region", { name: "Today's flow" });
    // Seven overdue Guests fold to six rows; the one we look for is among all.
    await flow.getByRole("button", { name: /^Show \d+ more$/ }).click();
    await expect(flow.getByText(guest)).toHaveCount(1);
    await expect(
      flow.getByRole("button", {
        name: new RegExp(`^Check .*${guest}.* out$`),
      }),
    ).toHaveCount(1);
    const plan = page.getByRole("region", { name: "Do these next" });
    await expect(plan.getByText(guest)).toHaveCount(0);
    await expect(plan.getByText(/Overdue departures/)).toHaveCount(0);
    await expect(plan.getByText("Departures are listed above.")).toBeVisible();
    await shoot(page, "timeline-plan-without-overdue");
  });

  test("the night hand-over names the overdue Guests, longest first (TODAY-10)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openToday(page, "manager", "night");
    const hand = page.getByRole("region", { name: "Before you hand over" });
    await expect(
      hand.getByText(`${audit.overdue} guests are overdue to leave`),
    ).toBeVisible();
    await expect(hand.getByText(/^Longest: .*days? late\./)).toBeVisible();
    await expect(
      hand.getByRole("link", { name: "Open Departures" }),
    ).toBeVisible();
    await shoot(page, "night-hand-over", hand);
  });
});

test.describe("the Night desk and Days not closed", () => {
  test("days not closed past the pills say how many more, and the seven nights fit their card (TODAY-16, 24)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openToday(page, "manager", "night");
    const more = audit.unclosedDays - 8;
    await expect(
      page.getByText(`+${more}`, { exact: true }).first(),
    ).toBeVisible();

    const card = page.getByRole("region", { name: "Rooms held" });
    const box = await card.boundingBox();
    const columns = card.locator("ol > li");
    expect(await columns.count()).toBe(7);
    for (let index = 0; index < 7; index += 1) {
      const column = await columns.nth(index).boundingBox();
      expect(column).not.toBeNull();
      expect((column?.x ?? 0) + (column?.width ?? 0)).toBeLessThanOrEqual(
        (box?.x ?? 0) + (box?.width ?? 0) + 0.5,
      );
    }
    // A short weekday and the day of the month, not "FRIDAY" and a bare 0.
    await expect(columns.first()).toContainText(/[A-Z][a-z]{2}/);
    await shoot(page, "night-seven-nights", card);
  });
});

test.describe("next up and the house map", () => {
  test("the queue folds at five and the arrows are beside the title (TODAY-14)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openToday(page, "front_desk", "next-up");
    const queue = page
      .getByRole("heading", { name: "Waiting on you" })
      .locator("xpath=ancestor::section[1]");
    await expect(queue.getByRole("listitem")).toHaveCount(5);
    await queue.getByRole("button", { name: /^Show \d+ more$/ }).click();
    expect(await queue.getByRole("listitem").count()).toBeGreaterThan(5);
    const next = page.getByRole("button", { name: "Next", exact: true });
    const hero = page
      .getByText(/Overdue departure/)
      .first()
      .locator("xpath=ancestor::section[1]");
    const heroBox = await hero.boundingBox();
    const nextBox = await next.boundingBox();
    // In the hero's first row, not at its foot.
    expect((nextBox?.y ?? 0) - (heroBox?.y ?? 0)).toBeLessThan(120);
    await shoot(page, "next-up-folded-queue");
  });

  test("a room tile names the room, the guest and what is happening (TODAY-15)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openToday(page, "front_desk", "house");
    const map = page.getByRole("region", { name: "The house" });
    const tile = map.getByRole("button", {
      name: new RegExp(`${audit.day.guest.overdue}`),
    });
    await expect(tile).toHaveAccessibleName(/, Overdue$/);
    await expect(
      map.getByRole("button", {
        name: new RegExp(`, ${audit.day.guest.ready},`),
      }),
    ).toHaveAccessibleName(/, Arrival$/);
    await shoot(page, "house-map-tiles", map);
  });
});

test.describe("what leads for each role, and the layout switcher", () => {
  test("Finance and Housekeeping start with their own work, the desk with its Guests (TODAY-06)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const firstBadge = async () =>
      (
        await page
          .getByRole("region", { name: /Needs attention/ })
          .getByRole("link")
          .first()
          .innerText()
      ).split("\n")[0];

    await openToday(page, "finance", "overview");
    expect(await firstBadge()).not.toMatch(/Urgent repair/i);
    await shoot(page, "attention-finance");
    await page.context().clearCookies();

    await openToday(page, "housekeeping", "overview");
    expect(await firstBadge()).toMatch(/not ready|Days not closed/i);
    await page.context().clearCookies();

    await openToday(page, "front_desk", "overview");
    // Folded: the first card of each kind, not eight of one.
    const region = page.getByRole("region", { name: /Needs attention/ });
    const cards = await region.getByRole("link").allInnerTexts();
    const badges = cards.map((text) => text.split("\n")[0]);
    expect(new Set(badges).size).toBeGreaterThan(1);
    expect(cards.length).toBeLessThanOrEqual(4 + 1);
  });

  test("the switcher says what each layout is for and where the choice is kept (TODAY-23)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openToday(page, "front_desk", "timeline");
    await page.getByRole("combobox", { name: "Layout" }).click();
    await expect(
      page.getByText("The most urgent job, one at a time"),
    ).toBeVisible();
    await expect(page.getByText("Saved on this device.")).toBeVisible();
    await shoot(page, "layout-switcher");
  });
});

test.describe("the first paint and the phone", () => {
  test("the first HTML already has the Check out buttons (TODAY-20)", async ({
    page,
  }) => {
    await openToday(page, "front_desk", "timeline");
    const response = await page.request.get(
      `/en/today?property=${audit.day.propertyId}`,
    );
    const html = await response.text();
    // Named by Guest in the label ("Check <Guest> out"), so match the verb.
    expect(
      html.match(/aria-label="Check [^"]+ out"/g)?.length ?? 0,
    ).toBeGreaterThan(0);
  });

  test("on a phone the due-out list leads and nothing scrolls sideways (TODAY-21)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openToday(page, "front_desk", "timeline");
    const flow = await page
      .getByRole("region", { name: "Today's flow" })
      .boundingBox();
    expect(flow?.y ?? 9999).toBeLessThan(420);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await shoot(page, "timeline-phone");
  });
});

test.describe("in Arabic", () => {
  test("the timeline, the night desk and the overview read right to left with the new copy", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openToday(page, "front_desk", "timeline", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(
      page.getByRole("region", { name: "لم يصلوا بعد" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /تسجيل وصول/ }).first(),
    ).toBeVisible();
    await shoot(page, "timeline-ar");

    await page.context().clearCookies();
    await openToday(page, "manager", "night", "ar");
    await expect(page.getByText(/تأخروا عن المغادرة/).first()).toBeVisible();
    await shoot(page, "night-ar");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test("the layout cookie is still the choice of the person (the switcher is not a new preference)", async ({
  page,
}) => {
  await openToday(page, "front_desk", "timeline");
  await switchTo(page, "House map");
  const cookies = await page.context().cookies();
  const userId = psql(
    `select id from public.users where lower(email) = lower('${audit.day.email.front_desk}')`,
  );
  expect(cookies.find((c) => c.name === layoutCookieName(userId))?.value).toBe(
    "house",
  );
});
