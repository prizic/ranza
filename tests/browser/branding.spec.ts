import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

import { DESK_EMAIL, OWNER_EMAIL, signIn, testProperty } from "./front-desk";
import {
  aLogo,
  aResident,
  brandTheOrganization,
  clearTheBrand,
  PORTAL_URL,
  signInToThePortal,
  theOrganization,
} from "./portal";

/**
 * An Organization's colour and logo reach the Portal a Guest actually opens
 * (RANZ-47, BR-S1-*).
 *
 * The integration suite proves what the module stores and the pgTAP suite
 * proves who may; this proves the part neither can see: that the screen takes
 * a colour and a file, that the preview follows them, that what is saved is
 * what a Resident's Portal is drawn in on its next load, and that taking it
 * away puts the Portal back. The Resident is a real sign-in to the real
 * Portal, in a browser context of its own.
 *
 * What a colour "carries" is asserted in computed style rather than in a
 * class name: the active navigation item is the one `bg-primary` element
 * every Portal page has, and the shell holds the two tokens a brand sets.
 *
 * Every test starts from an Organization with no brand and brings a Resident
 * of its own, because a Stay is history that is never deleted.
 *
 * Breaks that were run, and what went red:
 *   the Portal shell's inline tokens removed         BR-S1-01 and BR-S1-12
 *     (the active item stayed the theme's green: rgb(18, 84, 75), not burgundy)
 *   the contrast limit lowered from 4.5 to 1          BR-S1-04 here, and its unit test
 */

const EVIDENCE = path.resolve(__dirname, "../../docs/evidence/m1/RANZ-47");
const BURGUNDY = "#7a1e3c";
const BURGUNDY_RGB = "rgb(122, 30, 60)";
const WHITE_RGB = "rgb(255, 255, 255)";

async function aPortalPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  return context.newPage();
}

/** What the active navigation item is painted in: the one `bg-primary` on every page. */
async function activeItem(
  page: Page,
): Promise<{ background: string; text: string }> {
  const item = page.locator('aside a[aria-current="page"]');
  await expect(item).toBeVisible();
  return item.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    text: getComputedStyle(element).color,
  }));
}

function shellOf(page: Page) {
  return page.locator("div.min-h-svh").first();
}

test.beforeEach(() => {
  clearTheBrand(theOrganization());
});

test("BR-S1-01: the Owner brands the Organization and the Resident's Portal carries the colour and the logo", async ({
  browser,
  page,
  request,
}) => {
  const resident = await aResident(request);
  const portal = await aPortalPage(browser);
  await signInToThePortal(portal, resident.email);
  const before = await activeItem(portal);
  await expect(portal.locator("header img")).toHaveCount(0);

  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/branding?property=${testProperty()}`);
  await expect(page.locator("h1")).toHaveText("Branding");
  // Every inner page has a way up (ADR 0035).
  await expect(page.getByRole("link", { name: "Back" })).toBeVisible();

  await page.getByLabel("Colour (#rrggbb)").fill(BURGUNDY);
  await expect(page.getByText(/Readable: white text on it/)).toBeVisible();
  await page.getByLabel("Logo file").setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: aLogo(),
  });

  // The preview follows the draft before anything is saved.
  const preview = page.getByTestId("brand-preview");
  await expect(preview.locator("img")).toBeVisible();
  await expect(
    preview.getByRole("button", { name: "Primary button" }),
  ).toHaveCSS("background-color", BURGUNDY_RGB);
  await expect(portal.locator("header img")).toHaveCount(0);

  await page.screenshot({
    fullPage: true,
    path: path.join(EVIDENCE, "branding-screen.png"),
  });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("Saved. Guests see it the next time they open a page."),
  ).toBeVisible();

  // The Resident's next load.
  await portal.reload();
  const logo = portal.locator("header img");
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute(
    "src",
    new RegExp(`^/api/brand/${resident.stayId}/logo\\?v=[0-9a-f]{64}$`),
  );
  await expect
    .poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);

  const after = await activeItem(portal);
  expect(after).toEqual({ background: BURGUNDY_RGB, text: WHITE_RGB });
  expect(before.background).not.toBe(BURGUNDY_RGB);
  await expect
    .poll(() =>
      shellOf(portal).evaluate((shell) =>
        getComputedStyle(shell).getPropertyValue("--primary").trim(),
      ),
    )
    .toBe(BURGUNDY);

  await portal.screenshot({ path: path.join(EVIDENCE, "portal-branded.png") });
});

test("BR-S1-12: reset returns the Portal to the default theme", async ({
  browser,
  page,
  request,
}) => {
  const resident = await aResident(request);
  const portal = await aPortalPage(browser);
  await signInToThePortal(portal, resident.email);
  const defaults = await activeItem(portal);

  brandTheOrganization(theOrganization(), BURGUNDY, aLogo());
  await portal.reload();
  expect((await activeItem(portal)).background).toBe(BURGUNDY_RGB);
  await expect(portal.locator("header img")).toBeVisible();

  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/branding?property=${testProperty()}`);
  await expect(page.getByLabel("Colour (#rrggbb)")).toHaveValue(BURGUNDY);
  await page.getByRole("button", { name: "Reset to default" }).click();
  await expect(page.getByText("Back to the default theme.")).toBeVisible();
  await expect(page.getByLabel("Colour (#rrggbb)")).toHaveValue("");

  await portal.reload();
  await expect(portal.locator("header img")).toHaveCount(0);
  expect(await activeItem(portal)).toEqual(defaults);
  await expect(shellOf(portal)).not.toHaveAttribute("style", /--primary/);
});

test("BR-S1-04: an unreadable colour is refused with the reason", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/branding?property=${testProperty()}`);
  const field = page.getByLabel("Colour (#rrggbb)");
  const save = page.getByRole("button", { name: "Save", exact: true });

  await field.fill("#ffeb3b");
  await expect(
    page.getByText(/too light to read as text on white \(contrast 1\.\d : 1/),
  ).toBeVisible();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(save).toBeDisabled();

  await field.fill("rebeccapurple");
  await expect(page.getByText(/Write the colour like #0f5132/)).toBeVisible();
  await expect(save).toBeDisabled();

  await field.fill(BURGUNDY);
  await expect(page.getByText(/Readable: white text on it/)).toBeVisible();
  await expect(save).toBeEnabled();
});

test("BR-S1-23: the Portal's sign-in page stays Ranza's", async ({
  browser,
}) => {
  brandTheOrganization(theOrganization(), BURGUNDY, aLogo());
  const visitor = await aPortalPage(browser);
  await visitor.goto(`${PORTAL_URL}/en/sign-in`);

  const submit = visitor.getByRole("button", { name: "Sign in" });
  await expect(submit).toBeVisible();
  const background = await submit.evaluate(
    (button) => getComputedStyle(button).backgroundColor,
  );
  expect(background).not.toBe(BURGUNDY_RGB);
  await expect(visitor.locator("img[src*='/api/brand/']")).toHaveCount(0);
});

test("BR-S1-24: the Workspace stays Ranza's while the Organization is branded", async ({
  page,
}) => {
  brandTheOrganization(theOrganization(), BURGUNDY, aLogo());
  await signIn(page, OWNER_EMAIL);

  const item = page.locator('aside a[aria-current="page"]');
  await expect(item).toBeVisible();
  expect(
    await item.evaluate((element) => getComputedStyle(element).backgroundColor),
  ).not.toBe(BURGUNDY_RGB);
  await expect(shellOf(page)).not.toHaveAttribute("style", /--primary/);

  // Not even on the screen that sets the brand.
  await page.goto(`/en/branding?property=${testProperty()}`);
  await expect(page.getByLabel("Colour (#rrggbb)")).toHaveValue(BURGUNDY);
  await expect(shellOf(page)).not.toHaveAttribute("style", /--primary/);
  expect(
    await page
      .locator('aside a[aria-current="page"]')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).not.toBe(BURGUNDY_RGB);
});

test("BR-S1-29: a Staff Member without branding.manage does not see the Branding screen", async ({
  page,
}) => {
  await signIn(page, DESK_EMAIL);
  await expect(page.getByRole("link", { name: "Branding" })).toHaveCount(0);

  await page.goto(`/en/branding?property=${testProperty()}`);
  await expect(
    page.getByText("This module is not in your Subscription"),
  ).toBeVisible();
  await expect(page.getByLabel("Colour (#rrggbb)")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);

  // And the Owner, who does hold it, finds the entry in the rail.
  await page.context().clearCookies();
  await signIn(page, OWNER_EMAIL);
  await expect(
    page.getByRole("link", { name: "Branding" }).first(),
  ).toBeVisible();
});

test("BR-S1-33: the Branding screen reads right to left in Arabic with the colour field left to right", async ({
  page,
}) => {
  brandTheOrganization(theOrganization(), BURGUNDY, aLogo());
  await signIn(page, OWNER_EMAIL);
  await page.goto(`/ar/branding?property=${testProperty()}`);

  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("h1")).toHaveText("الهوية البصرية");
  const field = page.getByLabel(/^اللون/);
  await expect(field).toHaveAttribute("dir", "ltr");
  await expect(field).toHaveValue(BURGUNDY);
  await expect(page.getByText("لون العلامة")).toBeVisible();

  await page.screenshot({
    fullPage: true,
    path: path.join(EVIDENCE, "branding-screen-arabic.png"),
  });
});
