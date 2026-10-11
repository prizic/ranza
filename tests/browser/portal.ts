import { randomUUID } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";

import { expect, type APIRequestContext, type Page } from "@playwright/test";

import { testProperty, PASSWORD } from "./front-desk";
import { psql } from "./local-database";

/**
 * Where the Guest/Resident Portal is served while the browser tests run.
 *
 * A second application beside the Workspace, started by `playwright.config.ts`
 * against the same database. A Resident signs in here and never in the
 * Workspace, so a test that needs both holds two pages, and the session cookie
 * of one never reaches the other: they are separate browser contexts.
 */
export const PORTAL_URL = process.env.PORTAL_URL ?? "http://localhost:3001";

/** The Organization the browser tests' Property belongs to. */
export function theOrganization(): string {
  return psql(
    `select organization_id from public.properties where id = '${testProperty()}'`,
  );
}

/**
 * A Resident of this run's own, with a current Stay at the tests' Property.
 *
 * Made through the Portal's own sign-up route, for the reason `db:seed:dev`
 * does: the provider-subject mapping belongs to the application (ADR 0005).
 * The first authenticated request maps it onto a Ranza user; only then is there
 * somebody to give a Stay to. Each run brings a Resident and a Unit of its own
 * because a Stay is history that is never deleted.
 */
export async function aResident(
  request: APIRequestContext,
): Promise<{ email: string; stayId: string }> {
  const tag = randomUUID().slice(0, 8);
  const email = `e2e-resident-${tag}@example.test`;
  const headers = { origin: PORTAL_URL };

  const signedUp = await request.post(`${PORTAL_URL}/api/auth/sign-up/email`, {
    headers,
    data: { email, password: PASSWORD, name: "resident" },
  });
  expect(
    signedUp.ok(),
    `could not sign up ${email}: ${signedUp.status()}`,
  ).toBe(true);
  await request.get(`${PORTAL_URL}/en/stay`);

  const propertyId = testProperty();
  // The Portal shows a Stay only where the Organization is entitled to Front
  // Office and the Property has the capability switched on (blueprint 3.5).
  psql(
    `insert into public.entitlements (organization_id, module_key)
     select organization_id, 'front_office' from public.properties
      where id = '${propertyId}'
     on conflict (organization_id, module_key) do nothing`,
  );
  psql(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     select id, organization_id, 'portal_stay_overview', true
       from public.properties where id = '${propertyId}'
     on conflict (property_id, capability_key) do update set enabled = true`,
  );
  const stayId = psql(
    `with person as (
       select id from public.users where lower(email) = lower('${email}')
     ), target as (
       select id, organization_id from public.properties where id = '${propertyId}'
     ), unit as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity)
       select id, organization_id, 'E2E-RES-${tag}', 'room', 1 from target
       returning id
     ), stay as (
       insert into public.stays
         (organization_id, property_id, accommodation_unit_id, user_id,
          stay_type, status, starts_on, ends_on)
       select target.organization_id, target.id, unit.id, person.id,
              'resident', 'in_house', date '2026-09-01', null
       from target, unit, person
       returning id
     )
     select id from stay`,
  );
  expect(stayId, `${email} has no Ranza user to give a Stay to`).toMatch(
    /^[0-9a-f-]{36}$/,
  );
  return { email, stayId };
}

export async function signInToThePortal(
  page: Page,
  email: string,
  locale = "en",
): Promise<void> {
  await page.goto(`${PORTAL_URL}/${locale}/sign-in`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/stay$`));
}

/** The Organization with no colour and no logo, which is every Organization at the start. */
export function clearTheBrand(organizationId: string): void {
  psql(
    `update public.organization_brands set primary_color = null
      where organization_id = '${organizationId}'`,
  );
  psql(
    `update public.organization_brand_logos
        set content = null, content_type = null, content_hash = null,
            size_bytes = null, width = null, height = null
      where organization_id = '${organizationId}'`,
  );
}

/** Brands the Organization directly, as a previous visit to the screen would have. */
export function brandTheOrganization(
  organizationId: string,
  color: string,
  logo: Buffer,
): void {
  const owner = `(select id from public.users where lower(email) = lower('e2e-owner@example.test'))`;
  psql(
    `insert into public.organization_brands (organization_id, primary_color, updated_by)
     values ('${organizationId}', '${color}', ${owner})
     on conflict (organization_id) do update set primary_color = excluded.primary_color`,
  );
  psql(
    `with bytes as (select decode('${logo.toString("base64")}', 'base64') as content)
     insert into public.organization_brand_logos
       (organization_id, content, content_type, content_hash, size_bytes,
        width, height, updated_by)
     select '${organizationId}', content, 'image/png',
            encode(sha256(content), 'hex'), octet_length(content), 320, 160,
            ${owner}
       from bytes
     on conflict (organization_id) do update
       set content = excluded.content, content_type = excluded.content_type,
           content_hash = excluded.content_hash,
           size_bytes = excluded.size_bytes, width = excluded.width,
           height = excluded.height`,
  );
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

/**
 * A real PNG, 320 by 160: an orange disc on nothing. A fixture with a header
 * alone does not draw, and a screenshot of a broken image proves nothing.
 */
export function aLogo(): Buffer {
  const width = 320;
  const height = 160;
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 4);
    for (let x = 0; x < width; x += 1) {
      const inside = (x - width / 2) ** 2 + (y - height / 2) ** 2 < 70 ** 2;
      if (inside) row.set([224, 122, 31, 255], 1 + x * 4);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
