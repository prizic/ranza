// Creates a demo Organization, two Properties with Accommodation Units, a
// Staff Member you can sign in as, and a few Reservations arriving today, on
// the local database.
//
// It exists because the product has no self-service sign-up and never will:
// Prizic Control Plane creates Organizations and Subscriptions, and an
// Organization's owner invites staff (blueprint 4.4). Neither application is
// built yet, so without this there is no way into the workspace by hand.
//
// The account is created through the running application's own sign-up route,
// and the Ranza user is created by the application's first authenticated
// request. Doing either in SQL would duplicate the provider-subject mapping
// that ADR 0005 deliberately keeps in one place.
import { spawnSync } from "node:child_process";

import {
  requireLocalDatabase,
  withoutConnectionOverrides,
} from "./local-url.mjs";

// Local only, by construction: this writes a known password into a database.
const DATABASE = "postgresql://ranza:ranza@localhost:54322/ranza";
const APP = process.env.WORKSPACE_URL ?? "http://localhost:3000";

const EMAIL = "deniz@example.test";
const PASSWORD = "correct-horse-battery-staple";
const ORGANIZATION = "Deniz Otelleri";
const PROPERTIES = ["Deniz Otel Kadıköy", "Deniz Rezidans Beşiktaş"];

// Enough to make Front Office show something. Arrivals are dated in the
// Property's own timezone by the statement below rather than from this
// process's clock, because that is what the arrivals query compares against.
const ARRIVALS = [
  { guest: "Ada Lovelace", type: "guest", status: "confirmed", nights: 3 },
  { guest: "Mimar Sinan", type: "guest", status: "confirmed", nights: 2 },
  {
    guest: "Nezihe Muhiddin",
    type: "resident",
    status: "requested",
    nights: 0,
  },
];

requireLocalDatabase(DATABASE, {
  name: "db:seed:dev's database URL",
  because:
    "this writes demo Organizations, Properties and Reservations, which have\n" +
    "no business appearing in a real one.",
});

function psql(sql) {
  const result = spawnSync(
    "psql",
    [DATABASE, "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A", "-c", sql],
    { encoding: "utf8", env: withoutConnectionOverrides() },
  );
  if (result.status !== 0) {
    console.error(result.stderr.trim());
    process.exit(1);
  }
  return result.stdout.trim();
}

async function signUp() {
  const body = JSON.stringify({
    email: EMAIL,
    password: PASSWORD,
    name: "Deniz",
  });
  // Better Auth refuses a request with no Origin, which is its CSRF guard and
  // is why a browser works where a bare fetch does not.
  const headers = { "content-type": "application/json", origin: APP };

  let response;
  try {
    response = await fetch(`${APP}/api/auth/sign-up/email`, {
      method: "POST",
      headers,
      body,
    });
  } catch {
    console.error(
      `Could not reach ${APP}. Start the workspace first: pnpm dev`,
    );
    process.exit(1);
  }

  // Already signed up on a previous run: sign in instead, which is equally
  // good — either way we end up holding a session cookie.
  if (!response.ok) {
    response = await fetch(`${APP}/api/auth/sign-in/email`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
  }
  if (!response.ok) {
    console.error(
      `Sign-up failed: ${response.status} ${await response.text()}`,
    );
    process.exit(1);
  }

  const cookie = response.headers.getSetCookie().join("; ");
  if (!cookie) {
    console.error("Sign-up returned no session cookie.");
    process.exit(1);
  }
  return cookie;
}

const cookie = await signUp();

// One authenticated request is what maps the provider subject onto a Ranza
// user. Until that happens there is no row to grant a membership to.
await fetch(`${APP}/tr/today`, { headers: { cookie } });

const userId = psql(
  `select id from public.users where lower(email) = lower('${EMAIL}')`,
);
if (!userId) {
  console.error(
    "The workspace did not create a Ranza user. Is it pointed at this database?",
  );
  process.exit(1);
}

const values = PROPERTIES.map(
  (name) => `('${name.replaceAll("'", "''")}')`,
).join(",");

psql(`
  with organization as (
    insert into public.organizations (name, status)
    values ('${ORGANIZATION}', 'active')
    returning id
  ), subscription as (
    insert into public.subscriptions (organization_id, status)
    select id, 'active' from organization
  ), entitlement as (
    insert into public.entitlements (organization_id, module_key, status)
    select id, 'platform_core', 'active' from organization
  ), property as (
    insert into public.properties (organization_id, name)
    select organization.id, wanted.name
    from organization, (values ${values}) as wanted (name)
    returning id, organization_id, timezone
  ), capability as (
    insert into public.property_capabilities
      (property_id, organization_id, capability_key, enabled)
    select id, organization_id, 'today', true from property
  ), membership as (
    insert into public.organization_memberships
      (organization_id, user_id, role, access_scope)
    select id, '${userId}', 'manager', 'assigned_properties' from organization
  ), assignment as (
    insert into public.property_assignments (property_id, organization_id, user_id)
    select id, organization_id, '${userId}' from property
  ), front_office as (
    -- Every module the Workspace has a destination for. The screens behind most
    -- of them are stubs, but the gate is real: without these rows the rail
    -- shows two tiles and a developer opening the project sees none of the work
    -- that is waiting. See docs/handover/operator-workspace-screens.md.
    insert into public.entitlements (organization_id, module_key, status)
    select organization.id, wanted.module_key, 'active'
    from organization,
         (values ('front_office'), ('guest_services'), ('housekeeping'),
                 ('food_and_beverage'), ('inventory'), ('billing_folios'),
                 ('human_resources'), ('analytics'))
           as wanted (module_key)
  ), front_desk as (
    insert into public.property_capabilities
      (property_id, organization_id, capability_key, enabled)
    select property.id, property.organization_id, wanted.capability_key, true
    from property,
         (values ('front_desk'), ('guest_experience'), ('housekeeping'),
                 ('food_and_beverage'), ('inventory'), ('finance'),
                 ('people'), ('analytics'), ('configuration'))
           as wanted (capability_key)
  ), unit as (
    insert into public.accommodation_units
      (property_id, organization_id, name, unit_type, capacity)
    select property.id, property.organization_id, wanted.name, wanted.kind, 2
    from property,
         (values ('101', 'room'), ('102', 'room'), ('201', 'suite'),
                 ('301', 'room'), ('302', 'room'))
           as wanted (name, kind)
    returning id, property_id, organization_id, name
  ), departing_units as (
    -- Rooms 301 and 302, kept away from the arrivals so the two lists never
    -- contend for the same Unit and the exclusion constraint stays out of it.
    select unit.*, row_number() over (order by unit.name) as seat
    from unit
    join property on property.id = unit.property_id
    where property.id = (select id from property order by name limit 1)
      and unit.name in ('301', '302')
  ), departing_reservations as (
    insert into public.reservations
      (organization_id, property_id, accommodation_unit_id,
       guest_name, stay_type, status, starts_on, ends_on)
    select
      d.organization_id, d.property_id, d.id,
      wanted.guest, 'guest', 'checked_in',
      (now() at time zone property.timezone)::date - wanted.arrived,
      (now() at time zone property.timezone)::date - wanted.leaves
    from departing_units as d
    join property on property.id = d.property_id
    join (values (1, 'Cahit Arf', 4, 0), (2, 'Halide Edib', 9, 2))
      as wanted (seat, guest, arrived, leaves)
      on wanted.seat = d.seat
    returning id, organization_id, property_id, accommodation_unit_id,
              starts_on, ends_on
  ), departing_stays as (
    -- In house and due — one leaving today, one that should have left two days
    -- ago. The overdue row is the one a front desk most needs to see.
    insert into public.stays
      (organization_id, property_id, accommodation_unit_id, reservation_id,
       stay_type, status, starts_on, ends_on)
    select organization_id, property_id, accommodation_unit_id, id,
           'guest', 'in_house', starts_on, ends_on
    from departing_reservations
  ), arriving as (
    -- One Property only: a second front desk with identical arrivals would make
    -- the Property switcher look broken rather than demonstrate it.
    --
    -- Chosen by name, not by id. min(id::text) picked a random Property, while
    -- the Workspace opens on the first by name — so the seeded day landed on
    -- whichever one the screen was not showing. (No backticks in this comment:
    -- the statement is a JS template literal.)
    select unit.*, row_number() over (order by unit.name) as seat
    from unit
    join property on property.id = unit.property_id
    where property.id = (select id from property order by name limit 1)
      and unit.name in ('101', '102', '201')
  )
  insert into public.reservations
    (organization_id, property_id, accommodation_unit_id,
     guest_name, stay_type, status, starts_on, ends_on)
  select
    arriving.organization_id,
    arriving.property_id,
    arriving.id,
    wanted.guest,
    wanted.stay_type,
    wanted.status,
    (now() at time zone property.timezone)::date,
    case when wanted.nights = 0 then null
         else (now() at time zone property.timezone)::date + wanted.nights end
  from arriving
  join property on property.id = arriving.property_id
  join (values ${ARRIVALS.map(
    (arrival, index) =>
      `(${index + 1}, '${arrival.guest.replaceAll("'", "''")}', '${arrival.type}', '${arrival.status}', ${arrival.nights})`,
  ).join(",")}) as wanted (seat, guest, stay_type, status, nights)
    on wanted.seat = arriving.seat
`);

console.log(`Seeded ${ORGANIZATION} with ${PROPERTIES.length} Properties.`);
console.log(
  `${ARRIVALS.length} Reservations arrive today at the first one, and 2 Stays are due to leave.`,
);
console.log(`Sign in at ${APP}/tr/today as ${EMAIL} / ${PASSWORD}`);
