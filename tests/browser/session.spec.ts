import path from "node:path";

import { expect, type Page } from "@playwright/test";
import { test } from "./hydration";

import { aStaffMember, PASSWORD, testProperty } from "./front-desk";

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit/RANZ-76",
);

/**
 * Signing in and out (RANZ-76): a sign-out that ends the session on the server,
 * a deep link that survives signing in, the person's name instead of a cut-off
 * address, a title per page, and the language the bare address opens in.
 */

async function signInTo(
  page: Page,
  email: string,
  locale: "en" | "ar" = "en",
): Promise<void> {
  await page
    .getByLabel(locale === "en" ? "Email" : "البريد الإلكتروني")
    .fill(email);
  await page
    .getByLabel(locale === "en" ? "Password" : "كلمة المرور", { exact: true })
    .fill(PASSWORD);
  await page
    .getByRole("button", { name: locale === "en" ? "Sign in" : "تسجيل الدخول" })
    .click();
}

for (const [locale, label] of [
  ["en", "Sign out"],
  ["ar", "تسجيل الخروج"],
] as const) {
  test(`signing out ends the session on the server in ${locale}`, async ({
    page,
    browser,
    request,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const { email } = await aStaffMember(
      request,
      baseURL!,
      testProperty(),
      "front_desk",
    );
    await page.goto(`/${locale}/sign-in`);
    await signInTo(page, email, locale);
    await expect(page).toHaveURL(new RegExp(`/${locale}/today`));

    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name.includes("session_token"))).toBe(true);

    await page
      .getByRole("button", { name: /^(Account|الحساب)$/ })
      .first()
      .click();
    await page.screenshot({
      path: path.join(EVIDENCE, `account-menu-${locale}.png`),
    });
    await page.getByRole("menuitem", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in$`));

    // The session is gone on the server, not just forgotten by this tab: the
    // cookie as it was before signing out opens nothing.
    const replay = await browser.newContext({
      baseURL,
      storageState: { cookies, origins: [] },
    });
    const copied = await replay.newPage();
    await copied.goto(`/${locale}/today`);
    await expect(copied).toHaveURL(new RegExp(`/${locale}/sign-in\\?next=`));
    await replay.close();

    // And the tab itself is signed out: Today asks to sign in.
    await page.goto(`/${locale}/today`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in\\?next=`));
  });
}

test("a deep link survives signing in, and only to somewhere in this application", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const propertyId = testProperty();
  const { email } = await aStaffMember(
    request,
    baseURL!,
    propertyId,
    "front_desk",
  );

  await page.goto(`/en/reservations?property=${propertyId}`);
  await expect(page).toHaveURL(/\/en\/sign-in\?next=/);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Sign in to carry on where you were." }),
  ).toBeVisible();
  await page.screenshot({ path: path.join(EVIDENCE, "deep-link-sign-in.png") });
  await signInTo(page, email);
  await expect(page).toHaveURL(`/en/reservations?property=${propertyId}`);

  for (const hostile of [
    "https://evil.example/en/today",
    "//evil.example/en/today",
    "/tr/today",
    "/en/sign-in",
  ]) {
    await page.context().clearCookies();
    await page.goto(`/en/sign-in?next=${encodeURIComponent(hostile)}`);
    await signInTo(page, email);
    await expect(page, `signing in with next=${hostile}`).toHaveURL(
      /\/en\/today(\?property=[0-9a-f-]+)?$/,
    );
  }
});

test("the language switcher on the sign-in page keeps where they were going", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const propertyId = testProperty();
  const { email } = await aStaffMember(
    request,
    baseURL!,
    propertyId,
    "front_desk",
  );

  await page.goto(`/en/reservations?property=${propertyId}`);
  await page.getByRole("button", { name: /Language/ }).click();
  await page.getByRole("menuitem", { name: /العربية/ }).click();
  await expect(page).toHaveURL(/\/ar\/sign-in\?next=/);
  await signInTo(page, email, "ar");
  await expect(page).toHaveURL(`/ar/reservations?property=${propertyId}`);
});

test("the account shows who is signed in by name, and each page has its own title", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const propertyId = testProperty();
  const { email } = await aStaffMember(
    request,
    baseURL!,
    propertyId,
    "front_desk",
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/sign-in");
  await expect(page).toHaveTitle("Sign in · Ranza");
  await signInTo(page, email);
  await expect(page).toHaveURL(/\/en\/today/);
  await expect(page).toHaveTitle("Today · Ranza");

  const account = page
    .locator("aside")
    .getByRole("button", { name: "Account" });
  await expect(account).toContainText("front_desk");
  await expect(account).toContainText(email);

  // A client navigation: the tab names where they are without a reload.
  await page
    .locator("aside")
    .getByRole("link", { name: "Housekeeping" })
    .click();
  await expect(page).toHaveTitle("Housekeeping · Ranza");
  await page.goto(`/ar/security?property=${propertyId}`);
  await expect(page).toHaveTitle("الأمان · Ranza");
});

test("the bare address opens in the language last used, then the browser's, then Turkish", async ({
  request,
}) => {
  const opened = async (headers: Record<string, string>) => {
    const response = await request.get("/", { headers, maxRedirects: 0 });
    expect(response.status()).toBe(307);
    return new URL(response.headers()["location"]!, "http://x").pathname;
  };

  expect(await opened({})).toBe("/tr/today");
  expect(await opened({ "accept-language": "en-US,en;q=0.9" })).toBe(
    "/en/today",
  );
  expect(await opened({ "accept-language": "de,ar;q=0.5" })).toBe("/ar/today");
  expect(
    await opened({ "accept-language": "en", cookie: "ranza_locale=ar" }),
  ).toBe("/ar/today");
});

test("choosing a language is remembered by the next visit to the bare address", async ({
  page,
}) => {
  await page.goto("/ar/sign-in");
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === "ranza_locale")?.value).toBe("ar");
  await page.goto("/");
  await expect(page).toHaveURL(/\/ar\/(today|sign-in)/);
});
