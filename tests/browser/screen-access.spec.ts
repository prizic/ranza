import path from "node:path";

import { expect, type Page } from "@playwright/test";
import { test } from "./hydration";

import { aStaffMember, signIn, testProperty } from "./front-desk";

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit/RANZ-53",
);

/**
 * The rail and the page agree, and a denial names the real reason (RANZ-53,
 * INTEGRATIONS-01, DX-01, HR-01, PORTFOLIO-03).
 *
 * Every role of the matrix signs in, opens everything its rail offers and finds
 * a page, never a refusal; and a typed address a role may not open says why in
 * the language of the page. One person per role and run, made through the
 * application's own sign-up, so no shared account changes under another spec.
 *
 * The test Property has the front desk, finance, housekeeping, maintenance,
 * configuration and People on, and Integrations off — which is exactly the case
 * the audit found: an Owner offered a page that then said it was not in their
 * Subscription.
 */

const ROLES = [
  "owner",
  "manager",
  "front_desk",
  "finance",
  "housekeeping",
] as const;

/** The title of every way a screen says no, in English. */
const REFUSED =
  /isn't one you can open|not in your Subscription|isn't switched on at this Property|can't open this page|isn't available right now|can't read the audit log|isn't open to you at this Property|not open at this Property|not assigned to a Property/i;

async function settled(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
}

/** What the page's own refusal says, or nothing. */
async function refusal(page: Page): Promise<string[]> {
  await settled(page);
  return (await page.locator("main h2").allInnerTexts()).filter((title) =>
    REFUSED.test(title),
  );
}

/**
 * Every destination the role is offered, wherever the shell puts them: the
 * sidebar, with its groups opened, or the chips in the page bar for a role with
 * few enough pages to have no sidebar (ADR 0056).
 */
async function railLinks(page: Page): Promise<string[]> {
  const sidebar = page.locator("aside nav");
  if ((await sidebar.count()) === 0) {
    const chips = page.locator("header nav a[href]:visible");
    await expect(chips.first()).toBeVisible();
    return chips.evaluateAll((links) =>
      links.map(
        (link) => (link as HTMLAnchorElement).getAttribute("href") ?? "",
      ),
    );
  }
  await expect(sidebar).toBeVisible();
  for (const group of await sidebar
    .locator('button[aria-expanded="false"]')
    .all()) {
    await group.click();
  }
  return sidebar
    .locator("a[href]")
    .evaluateAll((links) =>
      links.map(
        (link) => (link as HTMLAnchorElement).getAttribute("href") ?? "",
      ),
    );
}

for (const role of ROLES) {
  test(`${role}: every page the rail offers opens`, async ({
    page,
    request,
    baseURL,
  }) => {
    test.setTimeout(300_000);
    const propertyId = testProperty();
    const { email } = await aStaffMember(request, baseURL!, propertyId, role);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, email);
    await page.goto(`/en/today?property=${propertyId}`);

    const hrefs = await railLinks(page);
    expect(hrefs.length, `${role} is offered pages`).toBeGreaterThan(1);

    for (const href of hrefs) {
      await page.goto(href);
      expect(
        await refusal(page),
        `${role} is offered ${href} and the page refuses`,
      ).toEqual([]);
    }
  });
}

test("the rail lists what each role can open and nothing else", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const propertyId = testProperty();
  await page.setViewportSize({ width: 1440, height: 900 });

  const rails: Record<string, string[]> = {};
  for (const role of ["owner", "front_desk"] as const) {
    const { email } = await aStaffMember(request, baseURL!, propertyId, role);
    await page.context().clearCookies();
    await signIn(page, email);
    await page.goto(`/en/today?property=${propertyId}`);
    rails[role] = (await railLinks(page)).map((href) =>
      href.replace(/^\/en\//, "").replace(/\?.*$/, ""),
    );
  }

  // The Owner holds every permission, and the Property has everything but
  // Integrations on: HR and the data export are offered, Integrations is not.
  expect(rails.owner).toEqual(
    expect.arrayContaining(["hr", "data-export", "audit-log", "configuration"]),
  );
  expect(rails.owner).not.toContain("integrations");
  // The Front desk holds none of those permissions.
  for (const closed of ["hr", "data-export", "audit-log", "integrations"]) {
    expect(
      rails.front_desk,
      `the Front desk is offered ${closed}`,
    ).not.toContain(closed);
  }
  expect(rails.front_desk).toEqual(
    expect.arrayContaining(["reservations", "arrivals", "departures"]),
  );
});

test("a role with few pages has chips in the bar and no sidebar, and a role with many keeps the sidebar (SP-S6-07)", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const propertyId = testProperty();
  await page.setViewportSize({ width: 1440, height: 900 });

  const pages: Record<string, string[]> = {};
  const sidebars: Record<string, number> = {};
  for (const role of ["owner", "housekeeping"] as const) {
    const { email } = await aStaffMember(request, baseURL!, propertyId, role);
    await page.context().clearCookies();
    await signIn(page, email);
    await page.goto(`/en/today?property=${propertyId}`);
    pages[role] = (await railLinks(page)).map((href) =>
      href.replace(/^\/en\//, "").replace(/\?.*$/, ""),
    );
    sidebars[role] = await page.locator("aside").count();
  }

  expect(sidebars.owner).toBeGreaterThan(0);
  expect(sidebars.housekeeping).toBe(0);
  // Guest Experience is the role's too, but this Property has not switched it
  // on, so the Property's capability withholds it as it always did.
  expect(pages.housekeeping.sort()).toEqual(
    ["housekeeping", "maintenance", "today"].sort(),
  );
  for (const closed of [
    "finance",
    "people",
    "hr",
    "analytics",
    "configuration",
  ]) {
    expect(pages.housekeeping).not.toContain(closed);
  }
});

test("a typed address a role may not open says why, in English", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const propertyId = testProperty();
  const { email } = await aStaffMember(
    request,
    baseURL!,
    propertyId,
    "front_desk",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, email);

  await page.goto(`/en/data-export?property=${propertyId}`);
  await settled(page);
  await expect(
    page.getByRole("heading", { name: "Your role can't open this page" }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText(
    "“See and download data exports”",
  );
  await expect(page.locator("main")).toContainText("Owners and Managers can");
  await expect(
    page.locator("main"),
    "the Subscription is not why",
  ).not.toContainText("Subscription");
  await page.screenshot({ path: path.join(EVIDENCE, "no-permission-en.png") });

  await page.goto(`/en/hr?property=${propertyId}`);
  await settled(page);
  await expect(
    page.getByRole("heading", { name: "Your role can't open this page" }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText(
    "“See staff records and payroll”",
  );

  // Off at this Property for everybody, so that is the first thing said: it
  // is true for the Owner too, and no change to the role would open it.
  await page.goto(`/en/integrations?property=${propertyId}`);
  await settled(page);
  await expect(
    page.getByRole("heading", {
      name: "This module isn't switched on at this Property",
    }),
  ).toBeVisible();
});

test("a Property that has the module off says so, and a stale link says it is stale", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const propertyId = testProperty();
  const { email } = await aStaffMember(request, baseURL!, propertyId, "owner");
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, email);

  await page.goto(`/en/integrations?property=${propertyId}`);
  await settled(page);
  await expect(
    page.getByRole("heading", {
      name: "This module isn't switched on at this Property",
    }),
  ).toBeVisible();
  await page.screenshot({ path: path.join(EVIDENCE, "not-enabled-en.png") });

  const stale = "00000000-0000-4000-8000-00000000dead";
  await page.goto(`/en/portfolio?property=${stale}`);
  await settled(page);
  await expect(
    page.getByRole("heading", { name: "That Property isn't one you can open" }),
  ).toBeVisible();
  const links = await page
    .locator("a[href]")
    .evaluateAll((all) => all.map((a) => a.getAttribute("href") ?? ""));
  expect(
    links.filter((href) => href.includes(stale)),
    "no link away from a stale Property carries it forward",
  ).toEqual([]);
  await page.screenshot({ path: path.join(EVIDENCE, "stale-link-en.png") });
  await page.getByRole("link", { name: "Go to Today" }).click();
  await expect(page).toHaveURL(/\/en\/today\?property=[0-9a-f-]+$/);

  await page.goto(`/en/hr?property=not-an-id`);
  await settled(page);
  await expect(
    page.getByRole("heading", { name: "That Property isn't one you can open" }),
  ).toBeVisible();
});

test("a typed address says the same thing in Arabic, mirrored", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const propertyId = testProperty();
  const { email } = await aStaffMember(
    request,
    baseURL!,
    propertyId,
    "front_desk",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, email);

  await page.goto(`/ar/data-export?property=${propertyId}`);
  await settled(page);
  await expect(
    page.getByRole("heading", { name: "دورك لا يتيح فتح هذه الصفحة" }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText(
    "«عرض عمليات التصدير وتنزيلها»",
  );
  expect(await page.locator("html").getAttribute("dir")).toBe("rtl");
  await page.screenshot({ path: path.join(EVIDENCE, "no-permission-ar.png") });

  await page.goto(
    `/ar/portfolio?property=00000000-0000-4000-8000-00000000dead`,
  );
  await settled(page);
  await expect(
    page.getByRole("heading", { name: "لا يمكنك فتح هذه المنشأة" }),
  ).toBeVisible();
});
