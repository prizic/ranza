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

/** Kept away from the demo Property, and named so nobody mistakes it for one. */
const TEST_PROPERTY = "E2E Test Property";

/**
 * A Property of the browser tests' own.
 *
 * Created once, in the Organization the seeded Staff Member belongs to, so the
 * rows every run leaves behind land somewhere a person is not looking. The demo
 * Property is what `pnpm dev` opens on, and arrivals nobody arranged
 * accumulating on it is a demonstration getting worse each week.
 *
 * Named so it sorts after the demo Properties, because the workspace opens on
 * the first by name and this one has no business being it.
 */
function testProperty(): string {
  const propertyId = psql(
    `with member as (
       select id from public.users where lower(email) = lower('${EMAIL}')
     ), home as (
       -- The Organization the seed granted, reached the way the workspace
       -- reaches it rather than by name.
       select property.organization_id as id
       from public.properties as property
       join public.property_assignments as assignment
         on assignment.property_id = property.id
        and assignment.user_id = (select id from member)
       order by property.name
       limit 1
     ), existing as (
       select id from public.properties
       where organization_id = (select id from home)
         and name = '${TEST_PROPERTY}'
     ), created as (
       insert into public.properties (organization_id, name)
       select (select id from home), '${TEST_PROPERTY}'
       where not exists (select 1 from existing)
         and exists (select 1 from home)
       returning id
     ), target as (
       select id from existing union all select id from created
     ), capability as (
       -- Today for the Property switcher, front_desk for the screen itself.
       -- An Entitlement is the Organization's and the seed already granted it.
       insert into public.property_capabilities
         (property_id, organization_id, capability_key, enabled)
       select target.id, (select id from home), wanted.key, true
       from target, (values ('today'), ('front_desk')) as wanted (key)
       where not exists (
         select 1 from public.property_capabilities as held
         where held.property_id = target.id
           and held.capability_key = wanted.key
       )
     ), assignment as (
       insert into public.property_assignments
         (property_id, organization_id, user_id)
       select target.id, (select id from home), (select id from member)
       from target
       where not exists (
         select 1 from public.property_assignments as held
         where held.property_id = target.id
           and held.user_id = (select id from member)
       )
     )
     select id from target`,
  );

  expect(
    propertyId,
    "no seeded Organization to put a test Property in — run pnpm db:seed:dev",
  ).not.toBe("");
  return propertyId;
}

/**
 * A Reservation of this run's own, on a Unit of its own.
 *
 * Checking somebody in is not a repeatable act: the second run would find the
 * first run's Guest already in house, and an exclusion constraint refuses a
 * second current Stay on their Unit. Nothing here can be cleaned up afterwards
 * either — a Stay is operational history and is never deleted — so each run
 * brings rows it does not have to take back, the way the integration suites do.
 */
function anArrivalToday(propertyId: string): string {
  const tag = randomUUID().slice(0, 8);
  const guestName = `Test Arrival ${tag}`;

  psql(
    `with target as (
       select id, organization_id, timezone
       from public.properties where id = '${propertyId}'
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
     from unit, target`,
  );

  return guestName;
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
  const propertyId = testProperty();
  const guestName = anArrivalToday(propertyId);

  await signIn(page);
  // The Property is named rather than defaulted to: the workspace opens on the
  // demo one, and this Property exists so it can stay that way.
  await page.goto(`/en/arrivals?property=${propertyId}`);

  // Narrowed to this run's Guest, because every earlier run left its arrival on
  // the list and the table pages at ten rows.
  await page.getByRole("searchbox").fill(guestName);
  const row = page.getByRole("row").filter({ hasText: guestName });

  await row.getByRole("button", { name: "Check in" }).click();

  // The row stays on the list for the rest of the Property's day and says so.
  await expect(row.getByText("Checked in")).toBeVisible();
});
