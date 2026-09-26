import { spawnSync } from "node:child_process";
import path from "node:path";

import { expect, test as setup } from "@playwright/test";

import { psql } from "./local-database";
import {
  aPropertyTheViewerDoesNotReach,
  DESK_EMAIL,
  OWNER_EMAIL,
  PASSWORD,
  propertyWithHousekeepingOff,
  testProperty,
} from "./front-desk";

/**
 * Somebody to sign in as.
 *
 * `db:seed:dev` is the only thing that creates an account — Ranza has no
 * self-service sign-up and never will — and it has to run against the
 * application rather than the database, because the provider-subject mapping
 * belongs to the sign-up route (ADR 0005). So it runs here, once the web server
 * this suite starts is answering, rather than as a step beside it.
 *
 * Only when there is nobody. Seeding inserts a fresh Organization every time it
 * runs, so doing it on every suite would leave a developer's database with a
 * dozen identical ones.
 */
const EMAIL = "deniz@example.test";

setup("a seeded Staff Member exists", () => {
  const assigned = psql(
    `select count(*)
     from public.property_assignments as assignment
     join public.users as member on member.id = assignment.user_id
     where lower(member.email) = lower('${EMAIL}')`,
  );
  if (assigned !== "0") return;

  const seeded = spawnSync("node", ["scripts/db-seed-dev.mjs"], {
    // The repository root, not wherever the command was typed: `db:seed:dev`
    // is reached by a relative path.
    cwd: path.resolve(__dirname, "../.."),
    encoding: "utf8",
  });
  expect(
    seeded.status,
    `pnpm db:seed:dev failed:\n${seeded.stdout}${seeded.stderr}`,
  ).toBe(0);
});

/**
 * The Property the browser tests work in, created once.
 *
 * It lives here rather than in the specs because this project runs alone and
 * before them, and the statement that creates it is not atomic: it looks for
 * the Property and inserts one when there is none. Two specs calling it at the
 * same moment both looked, both found nothing, and both inserted — which is
 * invisible until the next run reads two ids back and hands them to psql as one
 * uuid. That is what CI caught the moment a second spec file made the suite run
 * two workers.
 *
 * By the time any spec calls `testProperty()` it is only ever reading.
 */
setup("the browser tests have Properties of their own", () => {
  // Following its Organization, which sets nothing: inspection off. A run that
  // died halfway through the inspection spec leaves it switched on, and then
  // every arrival in the suite checks into a room that is not ready.
  psql(
    `update public.housekeeping_settings set inspect_after_cleaning = null
      where property_id = '${testProperty()}'`,
  );
  propertyWithHousekeepingOff();
  aPropertyTheViewerDoesNotReach();
});

/**
 * A Front desk colleague and an Owner, for the screens that differ by who is
 * looking (#80).
 *
 * Made the way `db:seed:dev` makes the Manager — through the application's own
 * sign-up route, because the provider-subject mapping belongs to it (ADR 0005)
 * — and then given a membership in the tests' Organization. Signing up an
 * address that already has an account fails, and signing in instead is equally
 * good; the memberships are written only when missing, so a second run changes
 * nothing.
 */
setup("a Front desk colleague and an Owner exist", async ({ request }) => {
  const propertyId = testProperty();
  const people = [
    { email: DESK_EMAIL, role: "front_desk", scope: "assigned_properties" },
    { email: OWNER_EMAIL, role: "owner", scope: "organization_wide" },
  ];

  for (const person of people) {
    const headers = { origin: "http://localhost:3000" };
    const signedUp = await request.post("/api/auth/sign-up/email", {
      headers,
      data: { email: person.email, password: PASSWORD, name: person.role },
    });
    if (!signedUp.ok()) {
      const signedIn = await request.post("/api/auth/sign-in/email", {
        headers,
        data: { email: person.email, password: PASSWORD },
      });
      expect(
        signedIn.ok(),
        `could not sign up or sign in ${person.email}: ${signedIn.status()}`,
      ).toBe(true);
    }
    // One authenticated request is what maps the provider subject onto a
    // Ranza user; until then there is nobody to give a membership to.
    await request.get("/en/today");

    psql(
      `with person as (
         select id from public.users where lower(email) = lower('${person.email}')
       ), home as (
         select organization_id as id from public.properties
          where id = '${propertyId}'
       ), membership as (
         insert into public.organization_memberships
           (organization_id, user_id, role, access_scope)
         select home.id, person.id, '${person.role}', '${person.scope}'
         from home, person
         on conflict (organization_id, user_id) do nothing
       )
       insert into public.property_assignments
         (property_id, organization_id, user_id)
       select '${propertyId}', home.id, person.id
       from home, person
       on conflict (property_id, user_id) do nothing`,
    );
    expect(
      psql(
        `select count(*) from public.users
          where lower(email) = lower('${person.email}')`,
      ),
      `the workspace did not create a Ranza user for ${person.email}`,
    ).toBe("1");
  }
});
