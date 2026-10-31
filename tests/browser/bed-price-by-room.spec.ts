import { expect, test } from "@playwright/test";

import { aFreshProperty } from "./fresh-property";
import {
  OWNER_EMAIL,
  pickDay,
  propertyDay,
  signIn,
  whenHydrated,
} from "./front-desk";
import { psql } from "./local-database";

/**
 * A bed's price follows its room, through the screen (RANZ-111, ADR 0038
 * amended).
 *
 * pgTAP proves the stamp, the integration suite proves the module and that the
 * quote is the stamp. This proves what only a browser sees: the Rates section
 * offers a price for each size of room the Property has, a price typed there
 * is what the booking dialog then quotes for a bed in that size, and a bed in
 * a room of another size is quoted another.
 *
 * A Property of the spec's own, so the sizes it lists are the ones it made.
 * The dialog is not submitted: the Property is fresh, but the screen is what
 * is on trial and the stamp already has its own suites.
 */

test("the Rates section prices each size of room, and the booking dialog quotes a bed by its room", async ({
  page,
}) => {
  const yurt = aFreshProperty("bed prices", {
    capabilities: ["configuration", "front_desk"],
  });
  psql(
    `with room as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity)
       select property.id, property.organization_id, wanted.name, 'room',
              wanted.beds
         from public.properties as property,
              (values ('S-101', 1), ('S-401', 4)) as wanted (name, beds)
        where property.id = '${yurt.propertyId}'
       returning id, property_id, organization_id, name, capacity)
     insert into public.accommodation_units
       (property_id, organization_id, parent_id, parent_unit_type, name,
        unit_type, capacity)
     select room.property_id, room.organization_id, room.id, 'room', bed.letter,
            'bed', 1
       from room
       cross join lateral unnest(
         (array['A', 'B', 'C', 'D'])[1:room.capacity]) as bed (letter)`,
  );

  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/configuration?property=${yurt.propertyId}`);

  const rates = page.locator("#rates");
  const general = rates.getByLabel("Price per night for Bed", { exact: true });
  const single = rates.getByLabel("Price per night for Bed in a single room");
  const quad = rates.getByLabel("Price per night for Bed in a 4-bed room");
  await whenHydrated(general);

  // One row for each size the Property has, and none for one it does not.
  await expect(single).toBeVisible();
  await expect(quad).toBeVisible();
  await expect(rates.getByLabel(/Bed in a 3-bed room/)).toHaveCount(0);

  await general.fill("300");
  await single.fill("900");
  await quad.fill("400");
  await rates.getByRole("button", { name: "Save changes" }).click();
  await expect(rates.getByText("Saved")).toBeVisible();
  await expect(single).toHaveValue("900");
  await expect(quad).toHaveValue("400");

  await page.goto(`/en/reservations?property=${yurt.propertyId}`);
  await page.getByRole("button", { name: "New reservation" }).click();
  const dialog = page.getByRole("dialog", { name: "New reservation" });
  await dialog.getByRole("button", { name: /^Arrival/ }).click();
  await pickDay(page, propertyDay(yurt.propertyId, 3));
  await pickDay(page, propertyDay(yurt.propertyId, 5));

  const search = dialog.getByRole("searchbox", {
    name: "Search by unit number or type",
  });
  await search.fill("S-101");
  await expect(
    dialog.getByRole("radio", { name: /S-101.*900\.00 a night/ }),
  ).toBeVisible();
  await search.fill("S-401");
  await expect(
    dialog.getByRole("radio", { name: /S-401.*400\.00 a night/ }).first(),
  ).toBeVisible();
});
