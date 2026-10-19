import { expect, test } from "@playwright/test";

import { psql } from "./local-database";
import path from "node:path";

import { DESK_EMAIL, OWNER_EMAIL, signIn, testProperty } from "./front-desk";

/**
 * Configuration through the screen (ADR 0036).
 *
 * The pgTAP suite proves the policies, grants and triggers; the integration
 * suite proves the module, the stale-version refusal and the race with a first
 * Folio. This proves what only a browser sees: a save refreshes the whole
 * workspace — the Property switcher names the Property by its new name — and a
 * changed cutoff shows the business date it would make before anything is
 * saved.
 *
 * The seeded Staff Member is a Manager reaching assigned Properties, so the
 * Organization's name is read-only for them, with the reason.
 */

const NAME = "E2E Test Property";
let propertyId = "";

test.beforeAll(() => {
  propertyId = testProperty();
});

// The tests' Property is found by its name, so a spec that dies after renaming
// it would leave every other spec creating a new one. Put the name back, and
// the clock, whatever happened.
test.afterEach(() => {
  psql(
    `update public.properties
        set name = '${NAME}', business_date_cutoff = time '04:00'
      where id = '${propertyId}'`,
  );
  // The inspection setting the last spec changes, back to following the
  // Organization, as the housekeeping suite expects to find it.
  psql(
    `update public.housekeeping_settings set inspect_after_cleaning = null
      where property_id = '${propertyId}'`,
  );
});

test("renames this Property, and the workspace follows", async ({ page }) => {
  await signIn(page);
  await page.goto(`/en/configuration?property=${propertyId}`);

  const property = page.locator("#property");
  const save = property.getByRole("button", { name: "Save changes" });
  await expect(save).toBeDisabled();

  await page.getByLabel("Property name").fill(`${NAME} Renamed`);
  await expect(save).toBeEnabled();
  await save.click();

  await expect(property.getByText("Saved")).toBeVisible();
  await expect(save).toBeDisabled();
  await expect(page.getByRole("button", { name: "Properties" })).toContainText(
    `${NAME} Renamed`,
  );
});

test("shows the business date a new cutoff would make, before saving", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/en/configuration?property=${propertyId}`);

  const time = page.locator("#time");
  await expect(time.getByText("Business date now")).toBeVisible();
  await expect(time.getByText("After saving", { exact: true })).toHaveCount(0);

  await page.getByRole("combobox", { name: "Today rolls over at" }).click();
  await page.getByRole("option", { name: "11:45" }).click();
  await expect(time.getByText("After saving", { exact: true })).toBeVisible();

  await time.getByRole("button", { name: "Discard" }).click();
  await expect(time.getByText("After saving", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Today rolls over at" }),
  ).toHaveText("04:00");
});

test("says why the Organization cannot be renamed from here", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/en/configuration?property=${propertyId}`);

  await expect(page.getByLabel("Organization name")).toBeDisabled();
  await expect(
    page.getByText(
      "Only someone who reaches every Property can rename the Organization.",
    ),
  ).toBeVisible();
});

test("a_setting_saved_on_configuration_stays_shown", async ({ page }) => {
  await signIn(page);
  await page.goto(`/en/configuration?property=${propertyId}`);

  const housekeeping = page.locator("#housekeeping");
  const control = housekeeping.getByRole("combobox", {
    name: "For this Property",
  });
  await control.click();
  await page.getByRole("option", { name: "On", exact: true }).click();
  await housekeeping
    .getByRole("button", { name: "Save for this Property" })
    .click();
  await expect(housekeeping.getByText("Saved")).toBeVisible();

  // The save has ended and the page has had its refresh. The control is
  // optimistic, so a save that refreshed nothing would put it back to "Use the
  // Organization's setting" here — seen, when revalidateHousekeeping did
  // nothing. Configuration needs no path of its own in that list: an action
  // that revalidates anything refreshes the page it was called from.
  await expect(control).toHaveText("On");
  await page.reload();
  await expect(
    page
      .locator("#housekeeping")
      .getByRole("combobox", { name: "For this Property" }),
  ).toHaveText("On");
});

test("goes back one level by the header alone (ADR 0035)", async ({ page }) => {
  await signIn(page);
  await page.goto(`/en/configuration?property=${propertyId}`);

  const back = page.getByRole("link", { name: "Back" });
  await expect(back).toHaveCount(1);
  await expect(back).toHaveAttribute(
    "href",
    `/en/today?property=${propertyId}`,
  );
  // Nothing in the page itself leads back up: its links go across, to Rooms
  // and People, or down, to its own sections. Asserted once the page has
  // rendered — a count of none is true of the loading state too, which is how
  // the first version of this passed with a duplicate link on the page.
  await expect(page.getByLabel("Property name")).toBeVisible();
  await expect(
    page.locator("main").getByRole("link", { name: /^(Back|All |Today)/ }),
  ).toHaveCount(0);
});

const SCREENSHOTS = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit/RANZ-73",
);

test("a choice about every Property is asked about first, and nothing is saved until it is confirmed", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/configuration?property=${propertyId}`);

  const housekeeping = page.locator("#housekeeping");
  await housekeeping
    .getByRole("combobox", { name: "For the whole Organization" })
    .click();
  await page.getByRole("option", { name: "On", exact: true }).click();
  await expect(housekeeping.getByText("Not saved yet.")).toBeVisible();

  // Leaving with the choice unsaved is asked about (CONFIG-03).
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    await dialog.dismiss();
  });
  await page.getByRole("link", { name: "Today" }).first().click();
  await expect(page).toHaveURL(/\/configuration/);

  await housekeeping
    .getByRole("button", { name: "Save for every Property" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Change this for every Property?");
  await expect(dialog).toContainText(
    "This changes Check rooms after cleaning for every Property: from “Off” to “On”.",
  );
  await page.screenshot({
    path: path.join(SCREENSHOTS, "every-property-confirm.png"),
  });
  await dialog.getByRole("button", { name: "Keep editing" }).click();

  // The Organization's default is exactly what it was.
  expect(
    psql(
      `select coalesce(inspect_after_cleaning::text, 'none')
         from public.housekeeping_settings
        where property_id is null and organization_id =
              (select organization_id from public.properties where id = '${propertyId}')`,
    ) || "none",
  ).not.toBe("true");
});

test("a time zone is found by its country, and named in the reader's language", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/en/configuration?property=${propertyId}`);

  await page.getByRole("combobox", { name: "Time zone" }).click();
  const search = page.getByPlaceholder("Search time zones");
  await search.fill("Turkey");
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("option")).toContainText("Istanbul, Türkiye");
  await search.fill("Los Angeles");
  await expect(page.getByRole("option").first()).toContainText("Los Angeles");
  await page.keyboard.press("Escape");

  await page.goto(`/ar/configuration?property=${propertyId}`);
  await expect(
    page.getByRole("combobox", { name: "المنطقة الزمنية" }),
  ).toContainText("تركيا");
});

test("a reader is told which permission would let them change each card", async ({
  page,
}) => {
  await signIn(page, DESK_EMAIL);
  await page.goto(`/en/configuration?property=${propertyId}`);
  await expect(page.getByLabel("Property name")).toBeDisabled();

  const line = (permission: string) =>
    `You can see these settings. To change them, your role needs “${permission}”.`;
  for (const card of ["organization", "property", "time"]) {
    await expect(page.locator(`#${card}`)).toContainText(
      line("Change Property and Organization settings"),
    );
  }
  await expect(page.locator("#rates")).toContainText(line("Set nightly rates"));
  await expect(page.locator("#housekeeping")).toContainText(
    line("Configure rooms & beds"),
  );
});

test("the section list follows the page on a phone, and the page does not scroll sideways", async ({
  page,
}) => {
  await signIn(page);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`/en/configuration?property=${propertyId}`);

  const nav = page.getByRole("navigation", { name: "On this page" });
  await expect(nav).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  // Still under the page bar after the whole page has been scrolled.
  const box = await nav.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeLessThan(140);
  await page.screenshot({
    path: path.join(SCREENSHOTS, "section-list-375.png"),
  });

  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(fits).toBe(true);
});

test("the currency says it is chosen for good before it is chosen, and the modules are folded away", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/en/configuration?property=${propertyId}`);
  const currencyFixed = psql(
    `select exists (select 1 from public.folios where property_id = '${propertyId}')::text`,
  );
  await expect(
    page.getByText(
      currencyFixed === "true"
        ? /a different currency needs a Property of its own/
        : /Choose it before you trade/,
    ),
  ).toBeVisible();
  const modules = page.locator("#modules details");
  await expect(modules).not.toHaveAttribute("open", "");
  await page.screenshot({
    path: path.join(SCREENSHOTS, "configuration-desktop.png"),
    fullPage: true,
  });
});
