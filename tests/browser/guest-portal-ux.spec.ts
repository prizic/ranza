import path from "node:path";

import { expect } from "@playwright/test";
import { test } from "./hydration";

import { psql } from "./local-database";
import { aResident, PORTAL_URL, signInToThePortal } from "./portal";

/**
 * The Guest Portal fixes of the 2026-10-11 UX audit (RANZ-77).
 *
 * The Portal is the one screen a Guest sees, and these are the places it let
 * them down: nowhere to go when the password is forgotten (GP-01), a stay that
 * was over described as one nobody had set up (GP-02), a link with no language
 * answered in Turkish whatever the browser asked for (GP-03), a bare 404
 * (GP-04), and the small things a Guest reads on the Stay page (GP-06, GP-07)
 * and meets while signing in (GP-08, GP-10).
 */

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit/RANZ-77",
);

test("a Guest who cannot sign in is told who can help, and the reset addresses are not a 404", async ({
  page,
}) => {
  await page.goto(`${PORTAL_URL}/en/sign-in`);
  await expect(
    page.getByText(
      "No account, or forgot your password? Ask the front desk at your property.",
    ),
  ).toBeVisible();
  await expect(page).toHaveTitle("Sign in · Ranza");
  await page.screenshot({ path: path.join(EVIDENCE, "sign-in-help.png") });

  for (const address of ["forgot-password", "reset-password"]) {
    const response = await page.goto(`${PORTAL_URL}/ar/${address}`);
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("link", { name: "العودة إلى تسجيل الدخول" }),
    ).toBeVisible();
  }

  await page.goto(`${PORTAL_URL}/en/forgot-password`);
  await expect(
    page.getByRole("heading", { name: "Getting back in" }),
  ).toBeVisible();
  await expect(
    page.getByText("Ask the front desk at your property"),
  ).toBeVisible();
  await expect(page).toHaveTitle("Getting back in · Ranza");
  await page.getByRole("link", { name: "Back to sign in" }).click();
  await expect(page).toHaveURL(/\/en\/sign-in$/);
});

test("a refused or empty sign-in says so in the page's language and puts focus back in the form", async ({
  page,
}) => {
  await page.goto(`${PORTAL_URL}/en/sign-in`);

  // GP-10: the browser's own bubble is not the page's language.
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByText("Enter your email and your password."),
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toBeFocused();

  // GP-08: after a refusal the button that had focus is disabled; focus returns.
  await page.getByLabel("Email").fill("nobody@example.test");
  await page.getByLabel("Password", { exact: true }).fill("not the password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByText("That email and password did not match."),
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toBeFocused();

  // GP-09: the show-password control is a touch target.
  const box = await page
    .getByRole("button", { name: "Show password" })
    .boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test("a link with no language opens in the one the browser asked for, then in the one last chosen", async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: "en-GB" });
  const page = await context.newPage();
  const bare = await context.request.get(`${PORTAL_URL}/`, {
    maxRedirects: 0,
    headers: { "accept-language": "ar-EG,ar;q=0.9,en;q=0.5" },
  });
  expect(bare.status()).toBe(307);
  expect(bare.headers()["location"]).toMatch(/\/ar\/stay$/);

  // No language in the address and none remembered: the browser's.
  await page.goto(`${PORTAL_URL}/stay`);
  await expect(page).toHaveURL(/\/en\/sign-in$/);

  // A guest who switches to Arabic is not given English the next time.
  await page.goto(`${PORTAL_URL}/ar/sign-in`);
  await page.goto(PORTAL_URL);
  await expect(page).toHaveURL(/\/ar\/sign-in$/);
  await context.close();
});

test("a missing page is the Portal's own, in the language of the address", async ({
  page,
}) => {
  const response = await page.goto(`${PORTAL_URL}/ar/nothing-here`);
  expect(response?.status()).toBe(404);
  await expect(page.getByText("هذه الصفحة غير موجودة")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.screenshot({ path: path.join(EVIDENCE, "not-found-arabic.png") });
});

test("a Guest sees the stay they are in first, read in plain words, and a finished one is not called unset-up", async ({
  page,
  request,
}) => {
  const { email, stayId } = await aResident(request);
  // A later booking, which a newest-first list drew above the room they are in.
  psql(
    `with source as (
       select organization_id, property_id, user_id
         from public.stays where id = '${stayId}'
     ), unit as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity)
       select property_id, organization_id, 'E2E-PX-${stayId.slice(0, 8)}', 'room', 1
         from source
       returning id
     )
     insert into public.stays
       (organization_id, property_id, accommodation_unit_id, user_id,
        stay_type, status, starts_on, ends_on)
     select source.organization_id, source.property_id, unit.id, source.user_id,
            'guest', 'reserved', date '2027-03-01', date '2027-03-05'
       from source, unit`,
  );
  await signInToThePortal(page, email);

  await expect(page).toHaveTitle("My stay · Ranza");
  const sections = page.locator("section");
  await expect(sections).toHaveCount(2);
  // GP-07: where they are now comes first, and the booking after it is set apart.
  await expect(sections.first()).toContainText("Staying now");
  await expect(sections.last()).toContainText("Reserved");
  await expect(page.locator(`[data-slot="separator"]`)).toHaveCount(1);
  // GP-06: the type is "Stay type: Resident", and an open end is not "Open-ended".
  await expect(sections.first()).toContainText("Stay type");
  await expect(sections.first()).toContainText("Resident");
  await expect(sections.first()).toContainText("No end date");
  await expect(sections.first()).not.toContainText("Open-ended");
  await page.screenshot({ path: path.join(EVIDENCE, "two-stays.png") });

  // GP-02: once both are over, the page does not say nobody set them up.
  psql(
    `update public.stays set status = 'departed' where user_id =
       (select user_id from public.stays where id = '${stayId}') and status = 'in_house'`,
  );
  psql(
    `update public.stays set status = 'cancelled' where user_id =
       (select user_id from public.stays where id = '${stayId}') and status = 'reserved'`,
  );
  await page.goto(`${PORTAL_URL}/en/stay`);
  await expect(page.getByText("You have no current stay")).toBeVisible();
  await expect(
    page.getByText("If you expected one, contact the property."),
  ).toBeVisible();
  await expect(page.getByText(/set up your stay/)).toHaveCount(0);
});

test("on a touch screen every language in the menu is a touch target", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 800 },
  });
  const page = await context.newPage();
  await page.goto(`${PORTAL_URL}/en/sign-in`);
  await page.getByRole("button", { name: /English/ }).click();
  const items = page.getByRole("menuitem");
  await expect(items).toHaveCount(3);
  for (const item of await items.all()) {
    const box = await item.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await context.close();
});
