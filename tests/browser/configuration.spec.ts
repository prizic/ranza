import { expect, test } from "@playwright/test";

import { psql } from "./local-database";
import { signIn, testProperty } from "./front-desk";

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
  await expect(time.getByText("After saving")).toHaveCount(0);

  await page.getByRole("combobox", { name: "Business day ends at" }).click();
  await page.getByRole("option", { name: "11:45" }).click();
  await expect(time.getByText("After saving")).toBeVisible();

  await time.getByRole("button", { name: "Discard" }).click();
  await expect(time.getByText("After saving")).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Business day ends at" }),
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
  // and People, or down, to its own sections.
  await expect(
    page.locator("main").getByRole("link", { name: /^(Back|All |Today)/ }),
  ).toHaveCount(0);
});
