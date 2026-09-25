import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { psql } from "./local-database";
import {
  aPropertyTheViewerDoesNotReach,
  propertyWithHousekeepingOff,
  signIn,
  testProperty,
} from "./front-desk";

/**
 * Housekeeping through the screens a front desk actually uses (RANZ-28).
 *
 * The pgTAP suite proves the policies and the worker's function, and the
 * integration suite proves the module and the check-in rule. This proves the
 * part neither can see: that the board shows a dirty room as dirty, that the
 * row menu marks it, and that arrivals asks before checking a Guest into a
 * room that is not ready.
 *
 * Each run brings its own rooms, as the arrivals suite does, because a status
 * change and a check-in are history that is never deleted.
 */

// Readiness depends on the inspection setting, and a spec that dies halfway
// through changing it leaves it changed. Every spec here starts from the test
// Property following its Organization, which sets nothing: inspection off.
test.beforeEach(() => {
  psql(
    `update public.housekeeping_settings set inspect_after_cleaning = null
      where property_id = '${testProperty()}'`,
  );
});

/** A room of this run's own, with a Guest arriving today. Dirty unless told. */
function aRoomWithAnArrival(
  propertyId: string,
  status: "dirty" | "clean" = "dirty",
): {
  unitName: string;
  guestName: string;
} {
  const tag = randomUUID().slice(0, 8);
  const unitName = `E2E-HK-${tag}`;
  const guestName = `Test Housekeeping ${tag}`;

  psql(
    `with target as (
       select id, organization_id, timezone
       from public.properties where id = '${propertyId}'
     ), unit as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity)
       select id, organization_id, '${unitName}', 'room', 2 from target
       returning id, property_id, organization_id
     ), dirty as (
       insert into public.housekeeping_unit_status
         (accommodation_unit_id, property_id, organization_id, status)
       select id, property_id, organization_id, '${status}' from unit
     ), guest as (
       insert into public.guests (organization_id, full_name)
       select organization_id, '${guestName}' from target
       returning id
     )
     insert into public.reservations
       (organization_id, property_id, accommodation_unit_id,
        guest_id, stay_type, status, starts_on, ends_on)
     select unit.organization_id, unit.property_id, unit.id,
            guest.id, 'guest', 'confirmed',
            app.property_today(target.id),
            app.property_today(target.id) + 2
     from unit, target, guest`,
  );

  return { unitName, guestName };
}

test("a front desk marks a dirty room clean from the board", async ({
  page,
}) => {
  const propertyId = testProperty();
  const { unitName } = aRoomWithAnArrival(propertyId);

  await signIn(page);
  await page.goto(`/en/housekeeping?property=${propertyId}`);

  await page.getByRole("searchbox").fill(unitName);
  const row = page.getByRole("row").filter({ hasText: unitName });
  await expect(row).toContainText("Dirty");

  await row.getByRole("button", { name: `Actions for ${unitName}` }).click();
  await page.getByRole("menuitem", { name: "Mark clean" }).click();

  await expect(page.getByText("1 room updated")).toBeVisible();
  await expect(row).toContainText("Clean");
});

test("arrivals asks before checking a Guest into a room that is not ready", async ({
  page,
}) => {
  const propertyId = testProperty();
  const { guestName } = aRoomWithAnArrival(propertyId);

  const ready = aRoomWithAnArrival(propertyId, "clean");

  await signIn(page);
  await page.goto(`/en/arrivals?property=${propertyId}`);

  // A room marked clean reads ready, as a word (HK-S2-18).
  await page.getByRole("searchbox").fill(ready.guestName);
  await expect(
    page.getByRole("row").filter({ hasText: ready.guestName }),
  ).toContainText("Ready");

  await page.getByRole("searchbox").fill(guestName);
  const row = page.getByRole("row").filter({ hasText: guestName });
  await expect(row).toContainText("Not ready");

  await row.getByRole("button", { name: "Check in" }).click();
  await expect(row).toContainText("isn't ready yet");

  // The whole warning, inside its cell, at a desk's usual width: the reason
  // is the part that was once cut off, after "it hasn't been clean".
  await page.setViewportSize({ width: 1440, height: 900 });
  const warning = row.getByText("isn't ready yet");
  await expect(warning).toContainText("waiting for inspection");
  expect(
    await warning.evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    ),
  ).toBe(0);
  const table = page.getByRole("table");
  expect(
    await table.evaluate(
      (element) =>
        element.parentElement!.scrollWidth - element.parentElement!.clientWidth,
    ),
  ).toBe(0);

  await row.getByRole("button", { name: "Check in anyway" }).click();
  await expect(row).toContainText("Checked in");
});

test("a manager switches inspection on for one Property and sees what it means", async ({
  page,
}) => {
  const propertyId = testProperty();

  await signIn(page);
  await page.goto(`/en/housekeeping?property=${propertyId}`);

  const flow = page.getByTestId("flow");
  await page.getByRole("combobox", { name: "For this Property" }).click();
  await page.getByRole("option", { name: "On", exact: true }).click();

  await expect(page.getByText("Saved")).toBeVisible();
  await expect(flow).toContainText("Inspected");

  await page.getByRole("combobox", { name: "For this Property" }).click();
  await page
    .getByRole("option", { name: /Use the Organization's setting/ })
    .click();
  await expect(
    page.getByRole("combobox", { name: "For this Property" }),
  ).toContainText("Use the Organization's setting");
});

test("a Property with housekeeping switched off shows the empty state, not another Property's rooms", async ({
  page,
}) => {
  const switchedOff = propertyWithHousekeepingOff();

  await signIn(page);
  await page.goto(`/en/housekeeping?property=${switchedOff}`);

  // HK-S1-24: the board of the first Property with housekeeping, under this
  // one's name in the switcher, is what this once showed.
  await expect(page.getByText(/Which rooms need cleaning at/)).toHaveCount(0);
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(
    page.getByText("Housekeeping is not on at this Property"),
  ).toBeVisible();
  // Reached, and off there — not a Property the viewer cannot reach at all.
  await expect(page.getByRole("button", { name: "Properties" })).toContainText(
    "(housekeeping off)",
  );
});

/** A capability a test switched off on a Property it does not own, restored. */
let switchedOffForTheTest: string | undefined;

test.afterEach(() => {
  if (!switchedOffForTheTest) return;
  psql(
    `update public.property_capabilities set enabled = true
      where property_id = '${switchedOffForTheTest}'
        and capability_key = 'housekeeping'`,
  );
  switchedOffForTheTest = undefined;
});

test("from a page with no Property named, the rail opens Housekeeping at the one the switcher names", async ({
  page,
}) => {
  // Signing in lands on Today with no ?property=, and the switcher names its
  // first Property. Housekeeping is switched off there for this test.
  await signIn(page);
  const switcher = page.getByRole("button", { name: "Properties" });
  await switcher.click();
  const current = page.locator('[role="menuitem"][aria-current="true"]');
  const named = new URL(
    (await current.getAttribute("href"))!,
    page.url(),
  ).searchParams.get("property")!;
  const name = (await current.innerText()).trim();
  await page.keyboard.press("Escape");

  // Only what this test switched off is switched back on afterwards, and it
  // must have been on: restoring a Property that was already off would change
  // a developer's demo data rather than put it back.
  const changed = psql(
    `update public.property_capabilities set enabled = false
      where property_id = '${named}' and capability_key = 'housekeeping'
        and enabled
      returning property_id`,
  );
  expect(changed, "housekeeping was not on at the switcher's Property").toBe(
    named,
  );
  switchedOffForTheTest = named;
  await page.reload();

  await page
    .locator("aside")
    .getByRole("link", { name: "Housekeeping" })
    .click();
  // Arrived and rendered before anything is asserted absent: an absence
  // checked mid-navigation is true of the page being left.
  await expect(page).toHaveURL(/\/en\/housekeeping/);
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
  await expect(page.locator("main").getByRole("heading").first()).toBeVisible();

  // HK-S1-24 through the everyday path: the rail once linked to the screen
  // with no Property, and the screen then showed the board of the first
  // Property that has housekeeping while the switcher still named this one.
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(switcher).toContainText(name);
  await expect(page).toHaveURL(
    new RegExp(`/en/housekeeping\\?property=${named}$`),
  );

  // The empty state's copy is the server's, and a page reached by in-app
  // navigation is rendered in the default locale — the audit evidence run's
  // F-2, fixed on its own branch — so it is read after a full load.
  await page.reload();
  await expect(
    page.getByText("Housekeeping is not on at this Property"),
  ).toBeVisible();
});

test("a Property the viewer does not reach shows the empty state under a switcher naming none", async ({
  page,
}) => {
  const unreached = aPropertyTheViewerDoesNotReach();

  await signIn(page);
  await page.goto(`/en/housekeeping?property=${unreached}`);

  await expect(
    page.getByText("Housekeeping is not on at this Property"),
  ).toBeVisible();
  // Not the viewer's first Property, where housekeeping is on: that would
  // contradict the page beneath it.
  await expect(page.getByRole("button", { name: "Properties" })).toContainText(
    "Choose a Property",
  );

  // Today is the one page that shows a Property's day rather than an empty
  // state, so it goes back to the day the switcher names instead of showing
  // the first Property's under a switcher naming none.
  await page.goto(`/en/today?property=${unreached}`);
  await expect(page).toHaveURL(/\/en\/today$/);
  await expect(
    page.getByRole("button", { name: "Properties" }),
  ).not.toContainText("Choose a Property");
});
