import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { psql } from "./local-database";
import { signIn, testProperty } from "./front-desk";

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
