import path from "node:path";

import { expect, type Page } from "@playwright/test";
import { test } from "./hydration";

import { aStaffMember, signIn, testProperty } from "./front-desk";

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit-2026-10-24/shell-orphans",
);

/**
 * What the shell lane's later hand-offs left (CALENDAR-18, CALENDAR-15,
 * FINANCE-07, ARRIVALS-16): a refusal for a page that any of several
 * permissions opens, the page called by one noun in the rail and the bar, and
 * chips that say when there are more of them.
 *
 * One person per role and run, made through the application's own sign-up.
 */

async function signedInAs(
  page: Page,
  request: Parameters<typeof aStaffMember>[0],
  baseURL: string,
  role: string,
): Promise<void> {
  const { email } = await aStaffMember(request, baseURL, testProperty(), role);
  await signIn(page, email);
}

const FRONT_DESK_WORK = {
  en: [
    "Take a booking",
    "Check somebody in",
    "Check somebody out",
    "Cancel a booking or record a no-show",
    "Change bookings and stays, and move Guests",
  ],
  ar: ["أخذ حجز"],
} as const;

for (const role of ["finance", "housekeeping"] as const) {
  test(`${role}: the room calendar names every permission that would open it, not one`, async ({
    page,
    request,
    baseURL,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await signedInAs(page, request, baseURL!, role);
    await page.goto(`/en/room-calendar?property=${testProperty()}`);

    const reason = page.getByText(/opens for a role that holds any of/);
    await expect(reason).toBeVisible();
    for (const permission of FRONT_DESK_WORK.en) {
      await expect(reason).toContainText(`“${permission}”`);
    }
    await expect(
      page.getByText(/needs “Take a booking”/),
      "it does not blame one permission of five",
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Go to Today" })).toBeVisible();
    if (role === "housekeeping") {
      await page.screenshot({
        path: path.join(EVIDENCE, "room-calendar-refused-housekeeping.png"),
      });
    }
  });
}

test("the refusal reads in Arabic, with every permission set off by the language's own quotes", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await signedInAs(page, request, baseURL!, "finance");
  await page.goto(`/ar/rooms?property=${testProperty()}`);

  const reason = page.getByText(/للدور الذي يملك أيًّا من/);
  await expect(reason).toBeVisible();
  await expect(reason).toContainText(`«${FRONT_DESK_WORK.ar[0]}»`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("a page that one permission opens still names that one", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await signedInAs(page, request, baseURL!, "front_desk");
  await page.goto(`/en/hr?property=${testProperty()}`);

  await expect(page.getByText(/needs “.+”, and your role/)).toBeVisible();
  await expect(page.getByText(/holds any of/)).toHaveCount(0);
});

for (const [locale, rooms] of [
  ["en", "Rooms"],
  ["ar", "الغرف"],
] as const) {
  test(`${locale}: the rail and the page bar call the page ${rooms}`, async ({
    page,
    request,
    baseURL,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signedInAs(page, request, baseURL!, "front_desk");
    await page.goto(`/${locale}/rooms?property=${testProperty()}`);

    await expect(
      page.getByRole("heading", { name: rooms, level: 1, exact: true }),
    ).toBeVisible();
    await expect(
      page
        .locator("header nav a[href*='/rooms'], aside nav a[href*='/rooms']")
        .first(),
    ).toHaveText(rooms);
    if (locale === "en") {
      await page.screenshot({
        path: path.join(EVIDENCE, "rooms-named-rooms.png"),
      });
    }
  });
}

for (const locale of ["en", "ar"] as const) {
  test(`${locale}: a phone's chips fade the edge that has more, and only that edge`, async ({
    page,
    request,
    baseURL,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 375, height: 800 });
    await signedInAs(page, request, baseURL!, "finance");
    await page.goto(`/${locale}/finance?property=${testProperty()}`);

    const chips = page.locator("header nav").locator("visible=true");
    const row = chips.locator("ul");
    await expect(chips.locator("a[aria-current='page']")).toBeVisible();

    const overflows = await row.evaluate(
      (node) => node.scrollWidth > node.clientWidth,
    );
    expect(overflows, "six chips do not fit 375 px").toBe(true);
    // The current chip is centred, so there is more on both sides unless it
    // is the first or last; either way one edge at least says so.
    await expect
      .poll(async () => {
        const start = await chips.getAttribute("data-fade-start");
        const end = await chips.getAttribute("data-fade-end");
        return start === "true" || end === "true";
      })
      .toBe(true);

    const towardsEnd = locale === "ar" ? -1 : 1;
    await row.evaluate((node, direction) => {
      node.scrollBy({ left: direction * 10_000 });
    }, towardsEnd);
    await expect(chips).toHaveAttribute("data-fade-start", "true");
    await expect(chips).toHaveAttribute("data-fade-end", "false");

    await row.evaluate((node, direction) => {
      node.scrollBy({ left: -direction * 10_000 });
    }, towardsEnd);
    await expect(chips).toHaveAttribute("data-fade-start", "false");
    await expect(chips).toHaveAttribute("data-fade-end", "true");
    if (locale === "en") {
      await page.screenshot({
        path: path.join(EVIDENCE, "chips-fade-375.png"),
      });
    }
  });
}
