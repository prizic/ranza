import { randomUUID } from "node:crypto";

import { expect } from "@playwright/test";

import { psql } from "./local-database";
import { testProperty } from "./front-desk";

export interface FreshProperty {
  propertyId: string;
  name: string;
}

/**
 * A Property of this run's own, in the Organization the browser tests work in,
 * that nobody is assigned to yet.
 *
 * Specs that assert exact figures need a Property whose history they wrote
 * themselves: a closed day, a Stay in house or a Folio balance is never
 * deleted, so a Property reused from one run to the next would carry the
 * previous run's figures into this one. Named after the browser tests' main
 * Property so it sorts after the demo Properties and never becomes what the
 * workspace opens on, and given to nobody here, so the caller names the people
 * who should reach it and no other screen's Property list gains a row.
 *
 * `capabilities` are the ones switched on; any other is left unrecorded, which
 * the workspace reads as off.
 */
export function aFreshProperty(
  label: string,
  options: {
    timezone?: string;
    currency?: string;
    capabilities: readonly string[];
  },
): FreshProperty {
  const propertyId = randomUUID();
  const name = `E2E Test Property (${label} ${propertyId.slice(0, 8)})`;
  const wanted = options.capabilities.map((key) => `('${key}')`).join(", ");
  psql(
    `with home as (
       select organization_id as id from public.properties
        where id = '${testProperty()}'
     ), created as (
       insert into public.properties (id, organization_id, name, timezone, currency)
       select '${propertyId}', home.id, '${name}',
              '${options.timezone ?? "Europe/Istanbul"}',
              '${options.currency ?? "TRY"}'
       from home
       returning id, organization_id
     )
     insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     select created.id, created.organization_id, wanted.key, true
     from created
     cross join (values ${wanted === "" ? "(null)" : wanted}) as wanted (key)
     where wanted.key is not null`,
  );
  expect(
    psql(`select count(*) from public.properties where id = '${propertyId}'`),
    "no seeded Organization to put a fresh Property in",
  ).toBe("1");
  return { propertyId, name };
}
