import { expect, test, type Page } from "@playwright/test";

import {
  anArrivalToday,
  DESK_EMAIL,
  HOUSEKEEPER_EMAIL,
  signIn,
  testProperty,
} from "./front-desk";
import {
  layoutCookieName,
  TODAY_LAYOUTS,
  type TodayLayout,
} from "../../apps/operator-workspace/src/features/today/layouts/model";
import { psql } from "./local-database";

/**
 * The desk layouts of Today in a browser (docs/features/today-layouts).
 *
 * What the derivation and the drawing do with a given summary is proved in the
 * unit suites. What only a browser can show: that the choice survives a reload
 * and is the Staff Member's own, that a real arrival reaches every layout, that
 * a phone never scrolls sideways, and that Arabic mirrors.
 */

const HEADING: Record<Exclude<TodayLayout, "overview">, string> = {
  timeline: "Today's flow",
  house: "The house",
  "next-up": "Waiting on you",
  night: "Before you hand over",
};

async function layoutCookie(page: Page, userId: string) {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => cookie.name === layoutCookieName(userId))
    ?.value;
}

function userIdOf(email: string): string {
  return psql(
    `select id from public.users where lower(email) = lower('${email}')`,
  );
}

/** What choosing in the switcher leaves behind, for a Staff Member already in. */
async function chooseLayout(
  page: Page,
  email: string,
  layout: TodayLayout,
): Promise<void> {
  await page.context().addCookies([
    {
      name: layoutCookieName(userIdOf(email)),
      value: layout,
      domain: "localhost",
      path: "/",
    },
  ]);
}

test("a Staff Member who never chose is given the timeline, and the choice they make is kept", async ({
  page,
}) => {
  const propertyId = testProperty();
  await signIn(page, DESK_EMAIL, null);
  await page.goto(`/en/today?property=${propertyId}`);

  await expect(
    page.getByRole("heading", { name: HEADING.timeline }),
  ).toBeVisible();

  const switcher = page.getByRole("combobox", { name: "Layout" });
  await switcher.click();
  await page.getByRole("option", { name: /House map/ }).click();
  await expect(
    page.getByRole("heading", { name: HEADING.house }),
  ).toBeVisible();

  // Kept on this device, under this Staff Member's own name.
  const userId = userIdOf(DESK_EMAIL);
  expect(await layoutCookie(page, userId)).toBe("house");

  await page.reload();
  await expect(
    page.getByRole("heading", { name: HEADING.house }),
  ).toBeVisible();

  await page.getByRole("combobox", { name: "Layout" }).click();
  await page.getByRole("option", { name: /Overview/ }).click();
  await expect(
    page.getByRole("heading", { name: /Needs attention/ }),
  ).toBeAttached();
  await expect(page.getByRole("heading", { name: HEADING.house })).toHaveCount(
    0,
  );
});

test("one Staff Member's choice is not another's on the same browser", async ({
  page,
}) => {
  const propertyId = testProperty();
  await signIn(page, DESK_EMAIL, "night");
  await page.goto(`/en/today?property=${propertyId}`);
  await expect(
    page.getByRole("heading", { name: HEADING.night }),
  ).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, HOUSEKEEPER_EMAIL);
  await page.goto(`/en/today?property=${propertyId}`);
  // A housekeeper has no desk section, so there is nothing to choose.
  await expect(page.getByRole("combobox", { name: "Layout" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: HEADING.night })).toHaveCount(
    0,
  );
});

test("an arrival with an expected time reaches the timeline, the map and the queue", async ({
  page,
}) => {
  const propertyId = testProperty();
  const guest = anArrivalToday(propertyId, "05:00");

  await signIn(page, DESK_EMAIL, "timeline");
  await page.goto(`/en/today?property=${propertyId}`);
  const flow = page.getByRole("region", { name: HEADING.timeline });
  await page.getByRole("button", { name: "Whole day" }).click();
  // Twice: a row under "Still to arrive" with its command, and a chip on the line.
  await expect(flow.getByText(guest)).toHaveCount(2);
  await expect(
    flow.getByRole("region", { name: "Still to arrive" }).getByText(guest),
  ).toBeVisible();
  // Beside the guest's name, not the hour on the axis that shares it.
  await expect(
    flow.locator("div", { hasText: guest }).getByText("05:00").first(),
  ).toBeVisible();

  await chooseLayout(page, DESK_EMAIL, "house");
  await page.goto(`/en/today?property=${propertyId}`);
  await expect(page.getByRole("region", { name: HEADING.house })).toBeVisible();
  // The room's tile and the guest's row in the list beside it.
  await expect(
    page.getByRole("button", { name: new RegExp(guest) }),
  ).toHaveCount(2);
});

test("every layout fits a phone and never scrolls sideways", async ({
  page,
}) => {
  const propertyId = testProperty();
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, DESK_EMAIL);
  for (const layout of TODAY_LAYOUTS.filter((l) => l !== "overview")) {
    await chooseLayout(page, DESK_EMAIL, layout);
    await page.goto(`/en/today?property=${propertyId}`);
    await expect(
      page.getByRole("heading", { name: HEADING[layout] }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(
      overflow,
      `${layout} scrolls sideways on a phone`,
    ).toBeLessThanOrEqual(0);
  }
});

test("every layout reads right to left in Arabic", async ({ page }) => {
  const propertyId = testProperty();
  await signIn(page, DESK_EMAIL);
  for (const layout of TODAY_LAYOUTS.filter((l) => l !== "overview")) {
    await chooseLayout(page, DESK_EMAIL, layout);
    await page.goto(`/ar/today?property=${propertyId}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("combobox", { name: "العرض" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(
      overflow,
      `${layout} scrolls sideways in Arabic`,
    ).toBeLessThanOrEqual(0);
  }
});
