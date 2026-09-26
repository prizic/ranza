// Fixtures for the RANZ-28 housekeeping evidence run.
//
// Local and throwaway only: it refuses any database but the evidence container
// on port 54393. Accounts are created through the running application's own
// sign-up route, as scripts/db-seed-dev.mjs does, because ADR 0005 keeps the
// provider-subject mapping in one place; everything else is inserted as the
// table owner, because no screen exists for creating an Organization.
//
//   node docs/evidence/housekeeping/fixtures.mjs
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATABASE = "postgresql://ranza:ranza@localhost:54393/ranza";
const APP = "http://localhost:3113";
export const PASSWORD = "evidence-horse-battery-staple";

/** One account per shipped role, plus a manager who reaches one Property. */
export const ACCOUNTS = [
  {
    key: "owner",
    email: "owner@evidence.test",
    name: "Ozan Owner",
    role: "owner",
    scope: "organization_wide",
  },
  {
    key: "manager",
    email: "manager@evidence.test",
    name: "Mira Manager",
    role: "manager",
    scope: "organization_wide",
  },
  {
    key: "desk",
    email: "desk@evidence.test",
    name: "Deniz Desk",
    role: "front_desk",
    scope: "organization_wide",
  },
  {
    key: "finance",
    email: "finance@evidence.test",
    name: "Feride Finance",
    role: "finance",
    scope: "organization_wide",
  },
  {
    key: "housekeeper",
    email: "housekeeper@evidence.test",
    name: "Hatice Housekeeper",
    role: "housekeeping",
    scope: "organization_wide",
  },
  {
    key: "kadikoy",
    email: "kadikoy.manager@evidence.test",
    name: "Kaan Kadıköy",
    role: "manager",
    scope: "assigned_properties",
  },
];

function psql(sql) {
  const result = spawnSync(
    "psql",
    [DATABASE, "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A", "-c", sql],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    console.error(result.stderr.trim());
    process.exit(1);
  }
  return result.stdout.trim();
}

/**
 * Better Auth rate-limits sign-up and sign-in per client, and six accounts in a
 * row trips it: a 429 is waited out rather than read as a refusal.
 */
async function post(route, body) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(`${APP}/api/auth/${route}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: APP },
      body: JSON.stringify(body),
    });
    if (response.status !== 429 || attempt === 8) return response;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

async function account({ email, name }) {
  let response = await post("sign-up/email", {
    email,
    password: PASSWORD,
    name,
  });
  if (!response.ok) {
    response = await post("sign-in/email", { email, password: PASSWORD });
  }
  if (!response.ok) {
    console.error(`${email}: ${response.status} ${await response.text()}`);
    process.exit(1);
  }
  const cookie = response.headers.getSetCookie().join("; ");
  // One authenticated request maps the provider subject onto a Ranza user.
  await fetch(`${APP}/en/today`, { headers: { cookie } });
  const id = psql(
    `select id from public.users where lower(email) = lower('${email}')`,
  );
  if (!id) {
    console.error(`${email}: the workspace created no Ranza user`);
    process.exit(1);
  }
  return id;
}

const ids = {};
for (const entry of ACCOUNTS) ids[entry.key] = await account(entry);

// Properties: P1 and P2 with housekeeping, P3 with the front desk only, P4 with
// housekeeping and no rooms, P5 with sixty-five rooms for the mark's bound.
const organizationId = psql(`
  with organization as (
    insert into public.organizations (name, status)
    values ('Kanıt Otelleri', 'active') returning id
  ), subscription as (
    insert into public.subscriptions (organization_id, status)
    select id, 'active' from organization
  ), entitlement as (
    insert into public.entitlements (organization_id, module_key, status)
    select organization.id, wanted.key, 'active'
    from organization,
         (values ('platform_core'), ('front_office'), ('housekeeping'),
                 ('billing_folios')) as wanted (key)
  )
  select id from organization`);

const property = {};
for (const [key, name] of [
  ["p1", "Kadıköy Otel"],
  ["p2", "Beşiktaş Rezidans"],
  ["p3", "Moda Pansiyon"],
  ["p4", "Üsküdar Konak"],
  ["p5", "Büyük Otel"],
]) {
  property[key] = psql(
    `insert into public.properties (organization_id, name)
     values ('${organizationId}', '${name}') returning id`,
  );
}

function capabilities(propertyId, keys) {
  psql(`insert into public.property_capabilities
          (property_id, organization_id, capability_key, enabled)
        select '${propertyId}', '${organizationId}', key, true
        from unnest(array[${keys.map((k) => `'${k}'`).join(",")}]) as key`);
}
const everything = [
  "today",
  "front_desk",
  "finance",
  "audit",
  "staff_administration",
  "housekeeping",
];
capabilities(property.p1, everything);
capabilities(property.p2, everything);
capabilities(property.p3, ["today", "front_desk", "finance", "audit"]);
capabilities(property.p4, everything);
capabilities(property.p5, everything);

for (const entry of ACCOUNTS) {
  psql(`insert into public.organization_memberships
          (organization_id, user_id, role, access_scope)
        values ('${organizationId}', '${ids[entry.key]}', '${entry.role}', '${entry.scope}')`);
}
psql(`insert into public.property_assignments (property_id, organization_id, user_id)
      values ('${property.p1}', '${organizationId}', '${ids.kadikoy}')`);

const unit = {};
function room(
  key,
  propertyKey,
  name,
  unitType = "room",
  capacity = 2,
  parentKey = null,
) {
  const parent = parentKey ? `'${unit[parentKey]}', 'room'` : "null, null";
  unit[key] = psql(`insert into public.accommodation_units
      (property_id, organization_id, name, unit_type, capacity,
       building, floor, parent_id, parent_unit_type)
    values ('${property[propertyKey]}', '${organizationId}', '${name}',
            '${unitType}', ${capacity}, ${propertyKey === "p1" ? "'Ana Bina'" : "null"},
            ${propertyKey === "p1" ? Number(name.slice(0, 1)) || "null" : "null"},
            ${parent})
    returning id`);
}
for (const n of ["101", "102", "103", "104", "105", "106", "107", "108"])
  room(n, "p1", n);
room("201", "p1", "201");
room("201A", "p1", "A", "bed", 1, "201");
room("201B", "p1", "B", "bed", 1, "201");
room("D1", "p1", "D1", "bed", 1);
for (const n of ["301", "302", "303"]) room(n, "p2", n);
room("401", "p3", "401");
psql(`insert into public.accommodation_units
        (property_id, organization_id, name, unit_type, capacity)
      select '${property.p5}', '${organizationId}', (5000 + n)::text, 'room', 2
      from generate_series(1, 65) as n`);

// Guests in house and leaving today, and Guests arriving today. Dates are the
// Property's own today, never the runner's.
function inHouse(unitKey, propertyKey, guest) {
  psql(`with guest as (
          insert into public.guests (organization_id, full_name)
          values ('${organizationId}', '${guest}') returning id
        ), today as (
          select (now() at time zone timezone)::date as day
          from public.properties where id = '${property[propertyKey]}'
        ), reservation as (
          insert into public.reservations
            (organization_id, property_id, accommodation_unit_id, guest_id,
             stay_type, status, starts_on, ends_on)
          select '${organizationId}', '${property[propertyKey]}', '${unit[unitKey]}',
                 guest.id, 'guest', 'checked_in', today.day - 2, today.day
          from guest, today returning id, starts_on, ends_on
        )
        insert into public.stays
          (organization_id, property_id, accommodation_unit_id, reservation_id,
           stay_type, status, starts_on, ends_on)
        select '${organizationId}', '${property[propertyKey]}', '${unit[unitKey]}',
               id, 'guest', 'in_house', starts_on, ends_on
        from reservation`);
}
function arriving(unitKey, propertyKey, guest) {
  psql(`with guest as (
          insert into public.guests (organization_id, full_name)
          values ('${organizationId}', '${guest}') returning id
        ), today as (
          select (now() at time zone timezone)::date as day
          from public.properties where id = '${property[propertyKey]}'
        )
        insert into public.reservations
          (organization_id, property_id, accommodation_unit_id, guest_id,
           stay_type, status, starts_on, ends_on)
        select '${organizationId}', '${property[propertyKey]}', '${unit[unitKey]}',
               guest.id, 'guest', 'confirmed', today.day, today.day + 2
        from guest, today`);
}
inHouse("104", "p1", "Cahit Arf");
inHouse("105", "p1", "Halide Edib");
inHouse("106", "p1", "Nazım Hikmet");
inHouse("201A", "p1", "Sabahattin Ali");
inHouse("D1", "p1", "Orhan Veli");
inHouse("401", "p3", "Oktay Rifat");
arriving("101", "p1", "Aziz Sancar");
arriving("102", "p1", "Sabiha Gökçen");
arriving("103", "p1", "Cahide Sonku");
arriving("107", "p1", "Behice Boran");
// Added during the 2026-09-24 run for I-3r, the re-run of I-3.
arriving("108", "p1", "Nezihe Muhiddin");

const out = { organizationId, property, unit, users: ids };
writeFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), ".fixtures.json"),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify({ organizationId, property }, null, 2));
