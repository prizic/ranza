import path from "node:path";

import { expect, type Page } from "@playwright/test";
import { createTranslator } from "next-intl";

import { test } from "./hydration";
import { OWNER_EMAIL, signIn, testProperty } from "./front-desk";
import { psql } from "./local-database";
import {
  aLogo,
  aLogoOf,
  brandTheOrganization,
  clearTheBrand,
  theOrganization,
} from "./portal";
import { messages } from "../../apps/operator-workspace/src/messages";

/**
 * The Configuration, Branding and Security findings of the 2026-10-24 audit
 * (CONFIGURATION-01 to -08, -11 to -16 and -18), through the screens as a
 * person meets them, in English and Arabic.
 *
 * What the unit tests prove is what each component does with an answer; this
 * proves the part only a browser can: that a file chosen in the real picker is
 * judged by the real image decoder, that a link followed from a dirty form is
 * stopped by the real `confirm`, that a phone really shows the preview beside
 * the colour field, and that a select really wraps rather than being cut.
 *
 * Screenshots are evidence for the audit record, not for a golden comparison.
 *
 * Breaks that were run, and what went red:
 *   the on-select check in choose() removed        the 300 x 64 test
 *   useUnsavedChangesGuard disarmed                the Back-with-a-draft test
 *   the reset dialog replaced by a direct reset()  the reset test (the brand was gone at once)
 *   DefaultReachLines not rendered                 the Organization default test
 *   the first-setup branch removed                 integrations.spec.ts INT-S1-51
 *   the city table emptied                         the Arabic time zone test and its unit test
 */

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit-2026-10-24/configuration",
);
const BURGUNDY = "#7a1e3c";
const THEME_GREEN_RGB = "rgb(18, 84, 75)";

const propertyId = (): string => testProperty();

test.describe.configure({ mode: "serial" });

test.beforeEach(() => {
  clearTheBrand(theOrganization());
});

function translate(locale: "en" | "ar") {
  return createTranslator({ locale, messages: messages[locale] as never });
}

async function refusesAShortLogo(page: Page, locale: "en" | "ar") {
  const t = translate(locale);
  await signIn(page, OWNER_EMAIL);
  await page.goto(`/${locale}/branding?property=${propertyId()}`);
  const save = page.getByRole("button", {
    name: t("branding.save"),
    exact: true,
  });
  const picker = page.getByLabel(t("branding.logoLabel"));

  // Chosen again until the page has taken it: a file offered before the page
  // hydrates is lost.
  await expect(async () => {
    await picker.setInputFiles({
      name: "short-logo.png",
      mimeType: "image/png",
      buffer: aLogoOf(300, 64),
    });
    await expect(
      page.getByText(
        t("branding.logoChosenErrors.too_small", {
          height: 64,
          minimum: 128,
        }),
      ),
    ).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await expect(save).toBeDisabled();
  await expect(page.getByText(t("branding.logoBlocksSave"))).toBeVisible();
  await expect(page.getByTestId("logo-facts")).toContainText("short-logo.png");
  await expect(page.getByText(t("branding.logoUsable"))).toHaveCount(0);
  await page.getByTestId("logo-facts").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(EVIDENCE, `branding-logo-too-short-${locale}.png`),
  });

  // A right-sized one replaces it, and Save is on.
  await picker.setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: aLogo(),
  });
  await expect(page.getByText(t("branding.logoUsable"))).toBeVisible();
  await expect(save).toBeEnabled();
  await expect(page.getByTestId("logo-facts")).toContainText("logo.png");
  const saved = psql(
    `select count(*) from public.organization_brand_logos
      where organization_id = '${theOrganization()}' and content is not null`,
  );
  expect(saved).toBe("0");
}

test("BR-S1-43: a logo below the minimum height is refused on the spot, with its size and the limit (CONFIGURATION-01, en)", async ({
  page,
}) => {
  await refusesAShortLogo(page, "en");
});

test("BR-S1-43: a logo below the minimum height is refused on the spot, with its size and the limit (CONFIGURATION-01, ar)", async ({
  page,
}) => {
  await refusesAShortLogo(page, "ar");
});

test("BR-S1-44: following Back with an unsaved colour asks first, and keeps the draft on no (CONFIGURATION-02)", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/branding?property=${propertyId()}`);
  const field = page.getByLabel("Colour (#rrggbb)");
  await field.fill(BURGUNDY);
  await expect(page.getByText(/Buttons and filled areas/)).toBeVisible();

  const asked: string[] = [];
  page.once("dialog", async (dialog) => {
    asked.push(dialog.message());
    await dialog.dismiss();
  });
  await page.getByRole("link", { name: "Back" }).click();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]).toBe(messages.en.unsavedChanges);
  await expect(page).toHaveURL(/\/branding/);
  await expect(field).toHaveValue(BURGUNDY);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page).not.toHaveURL(/\/branding/);
});

test("BR-S1-45: Reset names what goes, changes nothing until it is confirmed, and is off when there is nothing to reset (CONFIGURATION-04)", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/branding?property=${propertyId()}`);
  await expect(
    page.getByRole("button", { name: "Reset to default" }),
  ).toBeDisabled();

  brandTheOrganization(theOrganization(), BURGUNDY, aLogo());
  await page.reload();
  await page.getByRole("button", { name: "Reset to default" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(messages.en.branding.resetConsequence);
  await expect(dialog).toContainText(messages.en.branding.resetLogoLine);
  await expect(dialog).toContainText(BURGUNDY);
  await page.screenshot({
    path: path.join(EVIDENCE, "branding-reset-confirm.png"),
  });

  await dialog.getByRole("button", { name: "Keep the brand" }).click();
  await expect(dialog).toBeHidden();
  expect(
    psql(
      `select primary_color from public.organization_brands where organization_id = '${theOrganization()}'`,
    ),
  ).toBe(BURGUNDY);

  await page.getByRole("button", { name: "Reset to default" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Reset the brand" })
    .click();
  await expect(page.getByText("Back to the default theme.")).toBeVisible();
  expect(
    psql(
      `select coalesce(primary_color, 'none') from public.organization_brands where organization_id = '${theOrganization()}'`,
    ),
  ).toBe("none");
});

test("BR-S1-46: no colour is a dashed theme-green well, the verdict is in plain words with the numbers a click away, and the preview is a Portal (CONFIGURATION-05, -06, -03)", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/en/branding?property=${propertyId()}`);

  const well = page.getByTestId("brand-color-well");
  await expect(well).toHaveClass(/border-dashed/);
  await expect(well.locator("span").first()).toHaveCSS(
    "background-color",
    THEME_GREEN_RGB,
  );

  const field = page.getByLabel("Colour (#rrggbb)");
  await field.fill("#ffeb3b");
  await expect(
    page.getByText("Buttons and filled areas use this colour with black text."),
  ).toBeVisible();
  await expect(page.getByText(/slightly darker shade/)).toBeVisible();
  // No ratio is on the screen until it is asked for.
  await expect(page.locator("details li:visible")).toHaveCount(0);
  await page.getByText("Contrast details").click();
  await expect(page.locator("details li:visible")).toHaveCount(2);

  const preview = page.getByTestId("brand-preview");
  await expect(preview.getByText("My stay").first()).toBeVisible();
  await expect(
    preview.getByRole("button", { name: "Primary button" }),
  ).toHaveCSS("background-color", "rgb(255, 235, 59)");
  // No logo chosen or saved: the preview draws none, rather than a stand-in.
  await expect(preview.locator("img")).toHaveCount(0);
  await page.screenshot({
    path: path.join(EVIDENCE, "branding-plain-words-preview.png"),
  });
});

test("BR-S1-47: on a phone the preview is in view while the colour is typed (CONFIGURATION-07)", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(`/en/branding?property=${propertyId()}`);
  const field = page.getByLabel("Colour (#rrggbb)");
  await field.fill("#e67e22");
  await field.evaluate((element) =>
    element.scrollIntoView({ block: "start", behavior: "instant" }),
  );
  const preview = page.getByTestId("brand-preview");
  // Drawn in the typed colour, which the server has judged: the picture is of
  // the answer, not of the moment before it.
  await expect(
    preview.getByRole("button", { name: "Primary button" }),
  ).toHaveCSS("background-color", "rgb(230, 126, 34)");
  const box = await preview.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(667);
  await page.screenshot({
    path: path.join(EVIDENCE, "branding-phone-preview.png"),
  });
});

test("BR-S1-43: the logo field is a button, in Arabic too, and says which file is chosen (CONFIGURATION-08)", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  await page.goto(`/ar/branding?property=${propertyId()}`);
  const t = translate("ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.locator("label", { hasText: t("branding.logoChoose") }),
  ).toBeVisible();
  await expect(page.getByText(t("branding.logoNoFile"))).toBeVisible();
  await page.getByLabel(t("branding.logoLabel")).setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: aLogo(),
  });
  await expect(page.getByTestId("logo-facts")).toContainText("logo.png");
  await expect(
    page.locator("label", { hasText: t("branding.logoChange") }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(EVIDENCE, "branding-ar.png"),
    fullPage: true,
  });
});

test.describe("Configuration", () => {
  const SUFFIX = Date.now().toString(36);
  const KEEPER = `Reach Keeper ${SUFFIX}`;
  let keeperId = "";

  test.beforeAll(() => {
    keeperId = psql(
      `with p as (
         insert into public.properties (organization_id, name, timezone)
         values ('${theOrganization()}', '${KEEPER}', 'Europe/Istanbul')
         returning id
       ), c as (
         insert into public.property_capabilities
           (property_id, organization_id, capability_key, enabled)
         select id, '${theOrganization()}', 'housekeeping', true from p
       )
       insert into public.housekeeping_settings
         (organization_id, property_id, inspect_after_cleaning)
       select '${theOrganization()}', id, true from p
       returning property_id`,
    );
  });

  test.afterAll(() => {
    psql(
      `delete from public.housekeeping_settings where property_id = '${keeperId}'`,
    );
    psql(
      `delete from public.property_capabilities where property_id = '${keeperId}'`,
    );
    psql(`delete from public.properties where id = '${keeperId}'`);
  });

  test("CONFIGURATION-11: the Organization's default says how many Properties it changes and which keep their own answer", async ({
    page,
  }) => {
    await signIn(page, OWNER_EMAIL);
    await page.goto(`/en/configuration?property=${propertyId()}`);
    const housekeeping = page.locator("#housekeeping");
    const organizationDefault = housekeeping.getByRole("combobox", {
      name: "For the whole Organization",
    });
    // The other answer than the one in force, whatever an earlier run left.
    const other =
      (await organizationDefault.textContent())?.trim() === "On" ? "Off" : "On";
    await organizationDefault.click();
    await page.getByRole("option", { name: other, exact: true }).click();
    await housekeeping
      .getByRole("button", { name: "Save for every Property" })
      .click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Change the Organization's default?");
    await expect(dialog).toContainText(
      /Propert(y|ies) follows? the default and will change/,
    );
    await expect(dialog).toContainText(/keeps? (its|their) own answer/);
    await expect(dialog).toContainText(KEEPER);
    await page.screenshot({
      path: path.join(EVIDENCE, "configuration-default-reach.png"),
    });
    await dialog.getByRole("button", { name: "Keep editing" }).click();
  });

  test("CONFIGURATION-12, -16: one sentence says why a setting is read-only, and People keeps the Property", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/en/configuration?property=${propertyId()}`);
    const sentence =
      "This applies to every Property, so only an Owner, or a role with access to every Property, can change it.";
    await expect(page.getByText(sentence).first()).toBeVisible();
    await expect(
      page.getByText("Only someone who reaches every Property"),
    ).toHaveCount(0);
    await expect(page.getByText("Changing the default needs")).toHaveCount(0);

    const people = page
      .locator("#elsewhere")
      .getByRole("link", { name: /People/ });
    await expect(people).toHaveAttribute(
      "href",
      new RegExp(`/people\\?property=${propertyId()}`),
    );
  });

  test("CONFIGURATION-14, -15: in Arabic the city is Arabic, and a Property is the same word in every card", async ({
    page,
  }) => {
    expect(
      psql(
        `select timezone from public.properties where id = '${propertyId()}'`,
      ),
    ).toBe("Europe/Istanbul");
    await signIn(page, OWNER_EMAIL);
    await page.goto(`/ar/configuration?property=${propertyId()}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("#property-timezone")).toContainText("إسطنبول");
    await expect(page.locator("#property-timezone")).not.toContainText(
      "Istanbul",
    );
    await expect(page.locator("main")).not.toContainText("العقار");
    await page.screenshot({
      path: path.join(EVIDENCE, "configuration-ar.png"),
      fullPage: true,
    });
  });

  test("CONFIGURATION-13: on a phone a long choice wraps and is read whole", async ({
    page,
  }) => {
    await signIn(page, OWNER_EMAIL);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/en/configuration?property=${propertyId()}`);
    const trigger = page.locator("#assigneeRequired-property");
    await trigger.scrollIntoViewIfNeeded();
    const clipped = await trigger.evaluate((element) => {
      const value =
        element.querySelector('[data-slot="select-value"]') ?? element;
      return value.scrollWidth > value.clientWidth + 1;
    });
    expect(clipped).toBe(false);
    await page.screenshot({
      path: path.join(EVIDENCE, "configuration-phone-selects.png"),
    });
  });
});

test("CONFIGURATION-18: the Security page says what it does not hold yet", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  await page.goto("/en/security");
  await expect(page.getByText(messages.en.securityMissing)).toBeVisible();
});
