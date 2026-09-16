// Creates a demo Organization, two Properties and a Staff Member you can sign
// in as, on the local database.
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

// Local only, by construction: this writes a known password into a database.
const DATABASE = "postgresql://ranza:ranza@localhost:54322/ranza";
const APP = process.env.WORKSPACE_URL ?? "http://localhost:3000";

const EMAIL = "deniz@example.test";
const PASSWORD = "correct-horse-battery-staple";
const ORGANIZATION = "Deniz Otelleri";
const PROPERTIES = ["Deniz Otel Kadıköy", "Deniz Rezidans Beşiktaş"];

if (!/localhost|127\.0\.0\.1/.test(DATABASE)) {
  console.error("db:seed:dev only targets the local docker database.");
  process.exit(1);
}

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
    returning id, organization_id
  ), capability as (
    insert into public.property_capabilities
      (property_id, organization_id, capability_key, enabled)
    select id, organization_id, 'today', true from property
  ), membership as (
    insert into public.organization_memberships
      (organization_id, user_id, role, access_scope)
    select id, '${userId}', 'manager', 'assigned_properties' from organization
  )
  insert into public.property_assignments (property_id, organization_id, user_id)
  select id, organization_id, '${userId}' from property
`);

console.log(`Seeded ${ORGANIZATION} with ${PROPERTIES.length} Properties.`);
console.log(`Sign in at ${APP}/tr/today as ${EMAIL} / ${PASSWORD}`);
