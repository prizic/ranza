import path from "node:path";

import { expect, type Page } from "@playwright/test";
import { test } from "./hydration";

import { aStaffMember, signIn } from "./front-desk";
import { psql } from "./local-database";
import {
  aResident,
  PORTAL_URL,
  signInToThePortal,
  theOrganization,
} from "./portal";

/**
 * The Portal, the sign-in pages and the placeholder screens of the 2026-10-24
 * UX audit (PORTAL-01 to PORTAL-09).
 *
 * Nothing here depends on another spec's rows: the Property the Planned
 * screens are opened at, the Owner and the Resident are all made by the test
 * that uses them, and nothing reads the clock.
 */

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit-2026-10-24/portal-placeholders",
);

/**
 * A Property with Food and Beverage and Inventory switched on, which is what
 * opens the Planned screens. Given only those, an Owner there reaches few
 * enough pages to be offered chips across the top; given the front office's
 * work as well, the same Owner has a sidebar.
 */
function aPropertyWithPlannedScreens(layout: "chips" | "sidebar"): string {
  const name =
    layout === "chips"
      ? "E2E Planned Screens"
      : "E2E Planned Screens (sidebar)";
  const capabilities =
    layout === "chips"
      ? ["today", "food_and_beverage", "inventory"]
      : [
          "today",
          "food_and_beverage",
          "inventory",
          "front_desk",
          "housekeeping",
          "maintenance",
          "finance",
          "configuration",
        ];
  const organizationId = theOrganization();
  psql(
    `insert into public.entitlements (organization_id, module_key, status)
     select '${organizationId}', module, 'active'
       from unnest(array['food_and_beverage', 'inventory']) as module
     on conflict (organization_id, module_key) do nothing`,
  );
  const propertyId = psql(
    `with existing as (
       select id from public.properties
        where organization_id = '${organizationId}' and name = '${name}'
     ), created as (
       insert into public.properties (organization_id, name)
       select '${organizationId}', '${name}'
        where not exists (select 1 from existing)
       returning id
     ), target as (
       select id from existing union all select id from created
     ), capability as (
       insert into public.property_capabilities
         (property_id, organization_id, capability_key, enabled)
       select target.id, '${organizationId}', wanted.key, true
         from target,
              unnest(array[${capabilities.map((key) => `'${key}'`).join(", ")}]) as wanted (key)
        where not exists (
          select 1 from public.property_capabilities as held
           where held.property_id = target.id and held.capability_key = wanted.key
        )
     )
     select id from target`,
  );
  expect(propertyId).toMatch(/^[0-9a-f-]{36}$/);
  return propertyId;
}

async function anOwnerOf(
  page: Page,
  request: Parameters<typeof aStaffMember>[0],
  baseURL: string,
  propertyId: string,
): Promise<void> {
  const { email } = await aStaffMember(request, baseURL, propertyId, "owner");
  await signIn(page, email);
}

test("the Workspace sign-in says who can help with a password, in every language", async ({
  page,
}) => {
  const help = {
    en: "Forgot your password, or can't sign in? Contact Prizic support.",
    tr: "Parolanızı mı unuttunuz ya da giriş yapamıyor musunuz? Prizic desteğiyle iletişime geçin.",
    ar: "نسيت كلمة المرور أو لا تستطيع الدخول؟ تواصل مع دعم Prizic.",
  } as const;
  for (const [locale, sentence] of Object.entries(help)) {
    await page.goto(`/${locale}/sign-in`);
    const line = page.getByText(sentence);
    await expect(line).toBeVisible();
    const button = page.locator("form button[type='submit']");
    const lineBox = await line.boundingBox();
    const buttonBox = await button.boundingBox();
    expect(
      lineBox!.y,
      "the line sits under the button it is about",
    ).toBeGreaterThan(buttonBox!.y + buttonBox!.height - 1);
  }
  await page.goto("/ar/sign-in");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("main")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: path.join(EVIDENCE, "workspace-sign-in-ar.png"),
  });
});

test("a Planned screen says it is not available yet, what comes first, and leads back to Today", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const propertyId = aPropertyWithPlannedScreens("chips");
  await anOwnerOf(page, request, baseURL!, propertyId);

  await page.goto(`/en/food-and-beverage?property=${propertyId}`);
  const main = page.locator("main");
  await expect(main).toContainText("Coming later");
  await expect(main).toContainText("Not available yet.");
  await expect(main).toContainText(
    "come after Inventory is in use and a Guest's Folio can take their charges",
  );
  await expect(main.locator("a[href*='github']")).toHaveCount(0);
  await page.screenshot({
    path: path.join(EVIDENCE, "planned-food-and-beverage-en.png"),
  });

  await page.goto(`/en/inventory?property=${propertyId}`);
  await expect(main).toContainText("Not available yet.");
  await expect(main).toContainText(
    "Nothing needs to be set up on your side first.",
  );
  await main.getByRole("link", { name: "Go to Today" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/en/today\\?property=${propertyId}`),
  );

  const lead = { tr: "Henüz kullanılamıyor.", ar: "غير متاح بعد." } as const;
  for (const [locale, sentence] of Object.entries(lead)) {
    await page.goto(`/${locale}/inventory?property=${propertyId}`);
    await expect(main).toContainText(sentence);
  }
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.screenshot({
    path: path.join(EVIDENCE, "planned-inventory-ar.png"),
  });
});

test("the sidebar and the chips keep the unbuilt destinations and mark them as coming soon", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  const sidebar = aPropertyWithPlannedScreens("sidebar");
  await anOwnerOf(page, request, baseURL!, sidebar);
  await page.goto(`/en/today?property=${sidebar}`);
  const rail = page.locator("aside nav");
  await expect(
    rail.getByRole("link", { name: /Food & Beverage/ }),
  ).toContainText("Soon");
  await expect(rail.getByRole("link", { name: /Inventory/ })).toContainText(
    "Soon",
  );
  await expect(
    rail.getByRole("link", { name: /^Finance/ }),
    "a built destination carries no mark",
  ).not.toContainText("Soon");
  await page.screenshot({ path: path.join(EVIDENCE, "rail-soon-en.png") });

  await page.goto(`/ar/today?property=${sidebar}`);
  await expect(
    page.locator("aside nav").getByRole("link", { name: /المخزون/ }),
  ).toContainText("قريبًا");

  const chips = aPropertyWithPlannedScreens("chips");
  await page.context().clearCookies();
  await anOwnerOf(page, request, baseURL!, chips);
  await page.goto(`/en/today?property=${chips}`);
  const row = page.getByRole("navigation", { name: "Main navigation" });
  await expect(row.getByRole("link", { name: /Inventory/ })).toContainText(
    "Soon",
  );
  await expect(row.getByRole("link", { name: /^Today/ })).not.toContainText(
    "Soon",
  );
  await page.screenshot({ path: path.join(EVIDENCE, "chips-soon-en.png") });
});

test("the Portal sign-in answers a forgotten password where the Guest is, with no link to a page that says it again", async ({
  page,
}) => {
  await page.goto(`${PORTAL_URL}/en/sign-in`);
  await expect(
    page.getByText(
      "No account, or forgot your password? Ask the front desk at your property.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Forgot your password?" }),
  ).toHaveCount(0);
  await expect(page.locator("main a")).toHaveCount(0);

  await page.goto(`${PORTAL_URL}/ar/sign-in`);
  await expect(
    page.getByText(
      "ليس لديك حساب أو نسيت كلمة المرور؟ اطلب المساعدة من مكتب الاستقبال في منشأتك.",
    ),
  ).toBeVisible();
  await expect(page.locator("main")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: path.join(EVIDENCE, "portal-sign-in-ar.png") });

  // The address a bookmark or a mail would carry still lands somewhere useful.
  const response = await page.goto(`${PORTAL_URL}/en/forgot-password`);
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Getting back in" }),
  ).toBeVisible();
});

test("changing language on the help page keeps the page and what its address carries", async ({
  page,
}) => {
  async function languageLinks(address: string): Promise<(string | null)[]> {
    await page.goto(`${PORTAL_URL}${address}`);
    await page.getByRole("button", { name: /Language/ }).click();
    return Promise.all(
      ["Türkçe", "العربية"].map((name) =>
        page.getByRole("menuitem", { name }).getAttribute("href"),
      ),
    );
  }

  expect(
    await languageLinks("/en/reset-password?token=abc%7Blocale%7D&step=1"),
  ).toEqual([
    "/tr/reset-password?token=abc%7Blocale%7D&step=1",
    "/ar/reset-password?token=abc%7Blocale%7D&step=1",
  ]);
  expect(await languageLinks("/en/reset-password")).toEqual([
    "/tr/reset-password",
    "/ar/reset-password",
  ]);
  expect(await languageLinks("/en/forgot-password")).toEqual([
    "/tr/forgot-password",
    "/ar/forgot-password",
  ]);

  await page.goto(`${PORTAL_URL}/en/reset-password?token=abc`);
  await page.getByRole("button", { name: /Language/ }).click();
  await page.getByRole("menuitem", { name: "Türkçe" }).click();
  await expect(page).toHaveURL(/\/tr\/reset-password\?token=abc$/);
});

test("an address that is no page is drawn in the Portal's frame, titled, and leads the visitor where they can go", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const response = await page.goto(`${PORTAL_URL}/en/rooms`);
  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle("This page doesn't exist · Ranza");
  await expect(page.getByRole("banner").getByText("Ranza")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Language: English/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "This page doesn't exist" }),
  ).toBeVisible();
  const signIn = page.getByRole("link", { name: "Sign in" });
  await expect(
    page.getByRole("link", { name: "Go to my stay" }),
    "a signed-out visitor is not promised a stay",
  ).toHaveCount(0);
  const box = await signIn.boundingBox();
  expect(
    box!.height,
    "a phone's button is a touch target",
  ).toBeGreaterThanOrEqual(44);
  await expect(page.locator("main")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: path.join(EVIDENCE, "portal-404-en-375.png") });

  await page.goto(`${PORTAL_URL}/ar/rooms`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page).toHaveTitle("هذه الصفحة غير موجودة · Ranza");
  await page.getByRole("button", { name: /اللغة/ }).click();
  await expect(page.getByRole("menuitem", { name: "English" })).toHaveAttribute(
    "href",
    "/en/sign-in",
  );
  await expect(page.locator("main")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: path.join(EVIDENCE, "portal-404-ar-375.png") });
});

test("a signed-in Guest on an address that is no page is led back to their stay", async ({
  page,
  request,
}) => {
  const { email } = await aResident(request);
  await signInToThePortal(page, email);
  await page.goto(`${PORTAL_URL}/en/rooms`);
  await expect(
    page.getByRole("heading", { name: "This page doesn't exist" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  await page.getByRole("link", { name: "Go to my stay" }).click();
  await expect(page).toHaveURL(/\/en\/stay$/);
});

test("at a phone's width every language in the menu is a touch target, even under a mouse", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`${PORTAL_URL}/en/sign-in`);
  await page.getByRole("button", { name: /Language/ }).click();
  const items = page.getByRole("menuitem");
  await expect(items).toHaveCount(3);
  for (const item of await items.all()) {
    const box = await item.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});

test("the Guest's corner names them, not their address", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { email } = await aResident(request);
  const local = email.split("@")[0]!;

  // An account created with no name: the part before the @ stands in.
  psql(`update auth_user set name = '' where lower(email) = lower('${email}')`);
  await signInToThePortal(page, email);
  const account = page.locator("aside").getByText(local, { exact: true });
  await expect(account).toBeVisible();
  await expect(
    page.locator("aside").getByText(email, { exact: true }),
  ).toBeVisible();

  // An account with a name: the name leads, the address sits beneath it.
  psql(
    `update auth_user set name = 'Layla Hassan' where lower(email) = lower('${email}')`,
  );
  await page.reload();
  await expect(page.locator("aside").getByText("Layla Hassan")).toBeVisible();
  await expect(
    page.locator("aside").getByText(email, { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: path.join(EVIDENCE, "portal-account-en.png") });

  // A name that is itself an address is not printed twice.
  psql(
    `update auth_user set name = '${email}' where lower(email) = lower('${email}')`,
  );
  await page.reload();
  await expect(
    page.locator("aside").getByText(email, { exact: true }),
  ).toHaveCount(1);
});
