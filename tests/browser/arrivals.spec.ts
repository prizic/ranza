import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { psql } from "./local-database";

/**
 * Checking a Guest in, through the screen a front desk actually uses.
 *
 * The integration suites prove the module and the policies; this proves the
 * part neither of them can see — that the button is on the row, that pressing
 * it reaches the server action, and that the list afterwards says the Guest
 * arrived.
 *
 * Watched go red before it was believed: with the row's action named anything
 * other than "Check in", this fails at the click rather than passing on a
 * selector that matches nothing.
 */

/** From `scripts/db-seed-dev.mjs`, which is the only thing that creates it. */
const EMAIL = "deniz@example.test";
const PASSWORD = "correct-horse-battery-staple";

/**
 * A Reservation of this run's own, on a Unit of its own.
 *
 * Checking somebody in is not a repeatable act: the second run would find the
 * seeded Guest already in house, and an exclusion constraint refuses a second
 * current Stay on their Unit. Nothing here can be cleaned up afterwards either
 * — a Stay is operational history and is never deleted — so each run brings
 * rows it does not have to take back, the way the integration suites do.
 */
function anArrivalToday(): { guestName: string; propertyId: string } {
  const tag = randomUUID().slice(0, 8);
  const guestName = `Test Arrival ${tag}`;

  const propertyId = psql(
    `with member as (
       select id from public.users where lower(email) = lower('${EMAIL}')
     ), target as (
       select property.id, property.organization_id, property.timezone
       from public.properties as property
       join public.property_assignments as assignment
         on assignment.property_id = property.id
        and assignment.user_id = (select id from member)
       -- The Property the workspace opens on, by the ordering it uses.
       order by property.name
       limit 1
     ), unit as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity)
       select id, organization_id, 'E2E-${tag}', 'room', 2 from target
       returning id, property_id, organization_id
     )
     insert into public.reservations
       (organization_id, property_id, accommodation_unit_id,
        guest_name, stay_type, status, starts_on, ends_on)
     select unit.organization_id, unit.property_id, unit.id,
            '${guestName}', 'guest', 'confirmed',
            -- The Property's own day, which is what the arrivals list compares
            -- against. The runner's date is somebody else's.
            (now() at time zone target.timezone)::date,
            (now() at time zone target.timezone)::date + 2
     from unit, target
     returning property_id`,
  );

  expect(
    propertyId,
    "no seeded Property to arrive at — run pnpm db:seed:dev",
  ).not.toBe("");
  return { guestName, propertyId };
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/en/sign-in");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/today$/);
}

test("a confirmed arrival is checked in from the arrivals screen", async ({
  page,
}) => {
  const arrival = anArrivalToday();

  await signIn(page);
  // The Property is named rather than defaulted to: a database seeded twice has
  // two, and the screen would open on whichever sorted first.
  await page.goto(`/en/arrivals?property=${arrival.propertyId}`);

  // Narrowed to this run's Guest, because every earlier run left its arrival on
  // the list and the table pages at ten rows.
  await page.getByRole("searchbox").fill(arrival.guestName);
  const row = page.getByRole("row").filter({ hasText: arrival.guestName });

  await row.getByRole("button", { name: "Check in" }).click();

  // The row stays on the list for the rest of the Property's day and says so.
  await expect(row.getByText("Checked in")).toBeVisible();
});
