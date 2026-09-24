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
  // Today for the Property switcher, front_desk for the screen itself. Finance
  // as well, so a check-in opens a Folio: the refusal that matters most on this
  // screen is the one a charge causes, and without a Folio there is nowhere to
  // put one. And staff_administration, because the roster is the other screen
  // a browser test signs in to look at; housekeeping for the board.
  return aPropertyOfTheTests(TEST_PROPERTY, {
    today: true,
    front_desk: true,
    finance: true,
    staff_administration: true,
    housekeeping: true,
  });
}

/**
 * A second Property of the tests' own, where housekeeping is switched off
 * (HK-S1-24): the case in which a screen once showed another Property's rooms
 * under this one's name. Its front desk is on, so it is a Property the viewer
 * plainly reaches and the switcher lists.
 */
export function propertyWithHousekeepingOff(): string {
  return aPropertyOfTheTests(`${TEST_PROPERTY} (housekeeping off)`, {
    today: true,
    front_desk: true,
    housekeeping: false,
  });
}

/**
 * A Property in an Organization the seeded Staff Member does not belong to,
 * with housekeeping on: a real id the viewer cannot reach, which a stale link,
 * or somebody else's, puts in `?property=`.
 */
export function aPropertyTheViewerDoesNotReach(): string {
  const propertyId = psql(
    `with existing_organization as (
       select id from public.organizations where name = 'E2E Other Organization'
     ), created_organization as (
       insert into public.organizations (name, status)
       select 'E2E Other Organization', 'active'
       where not exists (select 1 from existing_organization)
       returning id
     ), organization as (
       select id from existing_organization
       union all select id from created_organization
     ), existing as (
       select id from public.properties
       where organization_id = (select id from organization)
         and name = 'E2E Unreached Property'
     ), created as (
       insert into public.properties (organization_id, name)
       select (select id from organization), 'E2E Unreached Property'
       where not exists (select 1 from existing)
       returning id
     ), target as (
       select id from existing union all select id from created
     ), capability as (
       insert into public.property_capabilities
         (property_id, organization_id, capability_key, enabled)
       select target.id, (select id from organization), wanted.key, true
       from target, (values ('today'), ('housekeeping')) as wanted (key)
       where not exists (
         select 1 from public.property_capabilities as held
         where held.property_id = target.id
           and held.capability_key = wanted.key
       )
     )
     select id from target`,
  );
  expect(propertyId.split("\n").length).toBe(1);
  return propertyId;
}

/**
 * Finds or creates one of the tests' Properties by name, with the capabilities
 * it starts with. A capability already recorded is left as it is.
 */
function aPropertyOfTheTests(
  name: string,
  capabilities: Record<string, boolean>,
): string {
  const wanted = Object.entries(capabilities)
    .map(([key, enabled]) => `('${key}', ${enabled})`)
    .join(", ");
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
         and name = '${name}'
     ), created as (
       insert into public.properties (organization_id, name)
       select (select id from home), '${name}'
       where not exists (select 1 from existing)
         and exists (select 1 from home)
       returning id
     ), target as (
       select id from existing union all select id from created
     ), capability as (
       -- An Entitlement is the Organization's and the seed already granted it.
       insert into public.property_capabilities
         (property_id, organization_id, capability_key, enabled)
       select target.id, (select id from home), wanted.key, wanted.enabled
       from target, (values ${wanted}) as wanted (key, enabled)
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
