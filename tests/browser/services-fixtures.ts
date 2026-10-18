import { randomUUID } from "node:crypto";

import { expect } from "@playwright/test";

import { EMAIL } from "./front-desk";
import { psql } from "./local-database";

/**
 * A Property of one run's own, with maintenance and the guest services on and
 * nothing at it, and a room to put things in.
 *
 * The shared test Property collects requests from every other test, so an
 * ordering or a filter is only ever read at one made for the purpose. The
 * caller archives it with `archiveProperties` once the file is done.
 */
export function aServicesProperty(label: string): {
  propertyId: string;
  roomName: string;
} {
  const name = `E2E ${label} ${randomUUID().slice(0, 8)}`;
  const propertyId = psql(
    `with member as (
       select id from public.users where lower(email) = lower('${EMAIL}')
     ), home as (
       select property.organization_id as id
       from public.properties as property
       join public.property_assignments as assignment
         on assignment.property_id = property.id
        and assignment.user_id = (select id from member)
       order by property.name
       limit 1
     ), created as (
       insert into public.properties (organization_id, name)
       select id, '${name}' from home
       returning id, organization_id
     ), capability as (
       insert into public.property_capabilities
         (property_id, organization_id, capability_key, enabled)
       select created.id, created.organization_id, wanted.key, true
       from created, (values ('today'), ('front_desk'), ('maintenance'),
                             ('guest_experience')) as wanted (key)
     ), assignment as (
       insert into public.property_assignments
         (property_id, organization_id, user_id)
       select id, organization_id, (select id from member) from created
     )
     select id from created`,
  );
  expect(propertyId, "no seeded Organization to put a Property in").not.toBe(
    "",
  );
  const roomName = `E2E-SV-${randomUUID().slice(0, 8)}`;
  psql(
    `insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity)
     select id, organization_id, '${roomName}', 'room', 2
       from public.properties where id = '${propertyId}'`,
  );
  return { propertyId, roomName };
}

/** Takes the Properties a run made out of the switcher. */
export function archiveProperties(propertyIds: readonly string[]): void {
  if (propertyIds.length === 0) return;
  psql(
    `update public.properties set status = 'archived', updated_at = now()
      where id in (${propertyIds.map((id) => `'${id}'`).join(",")})`,
  );
}
