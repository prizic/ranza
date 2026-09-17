import { expect, type Page } from "@playwright/test";

import { psql } from "./local-database";

/**
 * What every front-desk browser test needs before it can look at anything: the
 * seeded Staff Member, a Property of the tests' own to work in, and a signed-in
 * page.
 *
 * Shared rather than copied, because the Property is created once and reused by
 * every run — two copies of that statement would be two Properties the moment
 * one of them was edited.
 */

/** From `scripts/db-seed-dev.mjs`, which is the only thing that creates it. */
export const EMAIL = "deniz@example.test";
export const PASSWORD = "correct-horse-battery-staple";

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
export function testProperty(): string {
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
       -- Finance as well, so a check-in opens a Folio: the refusal that
       -- matters most on this screen is the one a charge causes, and without a
       -- Folio there is nowhere to put one.
       from target,
            -- And staff_administration, because the roster is the other screen
            -- a browser test signs in to look at.
            (values ('today'), ('front_desk'), ('finance'),
                    ('staff_administration')) as wanted (key)
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
  // One id, not two. The statement above can only produce a second row if two
  // of these ran at once and both created the Property, which is exactly the
  // race that made CI fail with `invalid input syntax for type uuid` on a
  // string holding two of them. It is prevented by `seed.setup.ts` creating it
  // before any spec runs; this is the assertion that says so out loud rather
  // than passing the pair into the next query.
  expect(
    propertyId.split("\n").length,
    `expected one test Property, found:\n${propertyId}`,
  ).toBe(1);
  return propertyId;
}

export async function signIn(page: Page): Promise<void> {
  await page.goto("/en/sign-in");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/today$/);
}
