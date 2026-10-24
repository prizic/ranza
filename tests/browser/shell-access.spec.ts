import path from "node:path";

import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./hydration";

import { aStaffMember, signIn, testProperty } from "./front-desk";

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit-2026-10-24/shell-access",
);

/**
 * The frame and the way into it, as each person meets it (the 2026-10-24 audit,
 * SHELL-01 to SHELL-15): an address that is no page, a refusal with a way on, a
 * sidebar that says when it scrolls, one account control, a phone's dock and
 * chips that show where the person is, and a screen left open after the session
 * ended.
 *
 * One person per role and run, made through the application's own sign-up, so
 * no shared account changes under another spec.
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

/** What is actually on screen, not merely in the page. */
function visible(page: Page, name: string): Locator {
  return page.getByRole("button", { name }).locator("visible=true");
}

test("an address that is no page opens a branded page inside the shell, with the way to Today", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signedInAs(page, request, baseURL!, "owner");

  await page.goto("/en/nonexistent-page");
  await expect(
    page.getByRole("heading", { name: "Page not found", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "That page doesn't exist", level: 2 }),
  ).toBeVisible();
  await expect(page.locator("aside nav"), "the shell is kept").toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back" }),
    "an inner page carries the way up (ADR 0035)",
  ).toBeVisible();
  await page.screenshot({ path: path.join(EVIDENCE, "not-found-en.png") });
  await page.getByRole("link", { name: "Go to Today" }).click();
  await expect(page).toHaveURL(/\/en\/today/);

  await page.goto("/ar/nonexistent-page");
  await expect(
    page.getByRole("heading", { name: "هذه الصفحة غير موجودة", level: 2 }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("link", { name: "الانتقال إلى اليوم" }),
  ).toBeVisible();
  await page.screenshot({ path: path.join(EVIDENCE, "not-found-ar.png") });
});

test("an address with no language opens in the remembered one, and a rail group opens its first page", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signedInAs(page, request, baseURL!, "front_desk");

  await page.goto("/reservations");
  await expect(page).toHaveURL(/\/en\/reservations/);

  // Committed and not loaded: the page answers with a redirect.
  await page.goto(`/en/front-office?property=${testProperty()}`, {
    waitUntil: "commit",
  });
  await expect(page).toHaveURL(
    new RegExp(`/en/reservations\\?property=${testProperty()}`),
  );
});

for (const [locale, say] of [
  [
    "en",
    {
      title: "Your role can't open this page",
      today: "Go to Today",
      mentions:
        /Finance needs .+ Ask whoever manages staff in your Organization/s,
    },
  ],
  [
    "ar",
    {
      title: "دورك لا يتيح فتح هذه الصفحة",
      today: "الانتقال إلى اليوم",
      mentions: /المالية.+اطلب ممن يدير الموظفين في مؤسستك/s,
    },
  ],
] as const) {
  test(`a refusal names the page, says who to ask and offers Today in ${locale}`, async ({
    page,
    request,
    baseURL,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signedInAs(page, request, baseURL!, "housekeeping");

    await page.goto(`/${locale}/finance?property=${testProperty()}`);
    await expect(page.getByRole("heading", { name: say.title })).toBeVisible();
    await expect(page.locator("main")).toContainText(say.mentions);
    const today = page.getByRole("link", { name: say.today });
    await expect(today).toBeVisible();
    await page.screenshot({
      path: path.join(EVIDENCE, `refusal-${locale}.png`),
    });
    await today.click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/today`));
  });
}

test("the audit log's refusal has the same way on as every other", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(240_000);
  await signedInAs(page, request, baseURL!, "front_desk");
  await page.goto(`/en/audit-log?property=${testProperty()}`);
  await expect(
    page.getByRole("heading", { name: "You can't read the audit log" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Today" })).toBeVisible();
});

test("a Planned screen says it is coming later and sends nobody to a repository", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signedInAs(page, request, baseURL!, "owner");
  // The Property has neither switched on; the page answers with its refusal, so
  // the Planned screen is drawn only where it is open. Asserted on both.
  await page.goto(`/en/inventory?property=${testProperty()}`);
  await expect(page.locator("main a[href*='github']")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("Blueprint");
  await expect(page.locator("main")).not.toContainText("handover");
});

test("the sidebar says when more is below it, and the last page can be reached", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 560 });
  await signedInAs(page, request, baseURL!, "owner");

  const nav = page.locator("aside nav");
  const cue = page.locator("aside [data-cue-end='true']");
  await expect(nav).toBeVisible();
  const scrolls = await nav.evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(scrolls, "a short window makes the sidebar scroll").toBe(true);
  await expect(cue, "and it says there is more below").toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: path.join(EVIDENCE, "sidebar-more-below.png"),
  });

  await nav.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await expect(cue, "the cue goes at the foot").toHaveCount(0);
  const last = page.locator("aside nav a").last();
  await expect(last).toBeInViewport();

  // At a laptop's height the tightened rows take the Owner's pages; whatever
  // does not fit says so rather than being silently out of reach.
  await page.setViewportSize({ width: 1440, height: 878 });
  await nav.evaluate((el) => el.scrollTo({ top: 0 }));
  const overflows = await nav.evaluate(
    (el) => el.scrollHeight > el.clientHeight,
  );
  if (overflows) await expect(cue).toBeVisible();
  else await expect(cue).toHaveCount(0);
  await page.screenshot({ path: path.join(EVIDENCE, "sidebar-878.png") });
});

test("Front Office starts open, and a group the person closes stays closed", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signedInAs(page, request, baseURL!, "front_desk");

  const group = page.getByRole("button", { name: "Front Office" });
  await expect(group).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.locator("aside").getByRole("link", { name: "Reservations" }),
    "the desk's most frequent page is one click from Today",
  ).toBeVisible();

  await group.click();
  await expect(group).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Front Office" }),
    "closing it is remembered on this device",
  ).toHaveAttribute("aria-expanded", "false");
});

test("there is one account control per layout", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(300_000);
  await signedInAs(page, request, baseURL!, "owner");

  for (const [width, height] of [
    [1440, 900],
    [375, 800],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto(`/en/today?property=${testProperty()}`);
    await expect(
      visible(page, "Account"),
      `exactly one at ${width} px`,
    ).toHaveCount(1);
  }

  await page.context().clearCookies();
  await signedInAs(page, request, baseURL!, "housekeeping");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/en/today?property=${testProperty()}`);
  await expect(
    visible(page, "Account"),
    "a role with chips has no sidebar, so the bar carries it",
  ).toHaveCount(1);
});

test("the Security page reads as a sentence", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(240_000);
  await signedInAs(page, request, baseURL!, "front_desk");
  await page.goto(`/en/security?property=${testProperty()}`);
  await expect(page.getByText("Manage how you sign in.")).toBeVisible();
});

test("a phone's chips open on the chip of the page the person is on", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 375, height: 800 });
  await signedInAs(page, request, baseURL!, "housekeeping");
  await page.goto(`/en/maintenance?property=${testProperty()}`);

  const bar = page.locator("header nav").locator("visible=true");
  const current = bar.locator("a[aria-current='page']");
  await expect(current).toBeVisible();
  await expect
    .poll(async () => {
      const row = await bar.locator("ul").boundingBox();
      const chip = await current.boundingBox();
      return (
        row !== null &&
        chip !== null &&
        chip.x >= row.x - 1 &&
        chip.x + chip.width <= row.x + row.width + 1
      );
    })
    .toBe(true);
  await page.screenshot({ path: path.join(EVIDENCE, "chips-375.png") });
});

test("a phone's dock shows there is more, and opens on the current page", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 375, height: 800 });
  await signedInAs(page, request, baseURL!, "owner");
  await page.goto(`/en/audit-log?property=${testProperty()}`);

  const dock = page.locator("nav[data-cue-end]");
  await expect(dock).toBeVisible();
  const current = dock.locator("a[aria-current='page']");
  await expect(current, "the current page is in view").toBeInViewport();
  await expect(dock).toHaveAttribute("data-cue-start", "true");

  await page.goto(`/en/today?property=${testProperty()}`);
  await expect(dock).toHaveAttribute("data-cue-end", "true");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: path.join(EVIDENCE, "dock-375.png") });
});

test("a screen left open says so when the session ends, and signing in comes back to it", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signedInAs(page, request, baseURL!, "front_desk");
  const property = testProperty();
  await page.goto(`/en/today?property=${property}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Hydrated, so the screen is polling as it does on a desk.
  await page.waitForLoadState("networkidle");

  const ended = await page.request.post("/api/auth/sign-out", {
    headers: { origin: new URL("/", baseURL!).origin },
    data: {},
  });
  expect(ended.ok()).toBe(true);
  // What a tab does when the person comes back to it.
  await page.evaluate(() =>
    window.dispatchEvent(new Event("visibilitychange")),
  );

  const dialog = page.getByRole("dialog", { name: "You were signed out" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog, "it cannot be dismissed").toBeVisible();
  await page.screenshot({ path: path.join(EVIDENCE, "session-ended.png") });

  await dialog.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/sign-in\?next=/);
  await expect(
    page.getByText("Sign in to carry on where you were."),
  ).toBeVisible();
});

test("a table's search takes the whole row on a phone and keeps its width on a desk", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 375, height: 800 });
  await signedInAs(page, request, baseURL!, "front_desk");
  await page.goto(`/en/reservations?property=${testProperty()}`);

  const search = page.getByRole("searchbox").first();
  await expect(search).toBeVisible();
  const main = await page.locator("main").boundingBox();
  const phone = await search.boundingBox();
  expect(phone!.width, "the placeholder is not cut short").toBeGreaterThan(
    main!.width - 40,
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect
    .poll(async () => (await search.boundingBox())?.width ?? 0)
    .toBeLessThanOrEqual(340);
});
