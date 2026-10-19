/**
 * Accepting an invitation, from the route down to the database (PEOPLE-01,
 * SP-S1-54, SP-S1-72).
 *
 * The one case the unit suite cannot settle is the one a fault creates: Better
 * Auth made the account and the step that ties it to the invited user did not
 * happen, so every retry meets "that address already has an account". The route
 * has to finish that attempt for the person whose password opens the account,
 * and for nobody else. Everything below the route is the real thing: the real
 * auth module, the staff module as `ranza_app`, and the database.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAuthModule } from "../../packages/auth/src";
import { createPrismaClient } from "../../packages/db/src";
import { createStaffModule } from "../../packages/ranza/staff/src";

vi.mock("../../apps/operator-workspace/node_modules/server-only", () => ({}));

const composition = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock("../../apps/operator-workspace/src/server/composition", () => ({
  getComposition: () => composition.value,
}));
vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  currentViewer: async () => null,
}));

const { acceptInvitation } =
  await import("../../apps/operator-workspace/src/server/invitation");

const ORG = "ee000002-0000-4000-8000-000000000001";
const PROPERTY = "ee000003-0000-4000-8000-000000000001";
const OWNER = "ee000001-0000-4000-8000-000000000001";
const ORIGIN = "http://localhost";
const PASSWORD = "the-password-they-chose";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const owner = createPrismaClient(process.env.DIRECT_URL!);
const authDb = createPrismaClient(process.env.AUTH_DATABASE_URL!);
const staff = createStaffModule({ db: prisma });
const { auth, linkInvitedUser, resolveRanzaUserId, linkRanzaUser } =
  createAuthModule({
    db: authDb,
    secret:
      process.env.BETTER_AUTH_SECRET ?? "test-secret-not-used-in-production",
    baseURL: ORIGIN,
  });

const addresses: string[] = [];
const subjects: string[] = [];

beforeAll(async () => {
  composition.value = { staff, auth, linkInvitedUser, linkRanzaUser };
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email)
     values ($1::uuid, 'invitation-accept-owner@example.test')
     on conflict (id) do nothing`,
    OWNER,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status)
     values ($1::uuid, 'Invitation Accept Integration', 'active')
     on conflict (id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name)
     values ($1::uuid, $2::uuid, 'Invitation Accept Property')
     on conflict (id) do nothing`,
    PROPERTY,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope)
     values ($1::uuid, $2::uuid, 'owner', 'organization_wide')
     on conflict (organization_id, user_id) do update
       set role = 'owner', status = 'active', revoked_at = null`,
    ORG,
    OWNER,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status)
     values ($1::uuid, 'active')
     on conflict (organization_id) do update set status = 'active'`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key, status)
     values ($1::uuid, 'platform_core', 'active') on conflict do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     values ($1::uuid, $2::uuid, 'staff_administration', true)
     on conflict do nothing`,
    PROPERTY,
    ORG,
  );
});

afterAll(async () => {
  await owner.$executeRawUnsafe(
    `delete from public.auth_identities
      where user_id in (select id from public.users where email = any($1::text[]))`,
    addresses,
  );
  for (const table of [
    "public.staff_invitations",
    "public.property_assignments",
    "public.organization_memberships",
    "public.property_capabilities",
  ]) {
    await owner.$executeRawUnsafe(
      `delete from ${table} where organization_id = $1::uuid`,
      ORG,
    );
  }
  await owner.$executeRawUnsafe(
    `delete from outbox.deliveries where organization_id = $1::uuid`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `delete from outbox.events where organization_id = $1::uuid`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `delete from public.properties where organization_id = $1::uuid`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `delete from public.auth_user where email = any($1::text[])`,
    addresses,
  );
  await prisma.$disconnect();
  await authDb.$disconnect();
  await owner.$disconnect();
});

async function invited(): Promise<{
  email: string;
  token: string;
  userId: string;
}> {
  const email = `accept-${randomUUID()}@example.test`;
  addresses.push(email);
  const issued = await staff.invite(
    { userId: OWNER },
    { organizationId: ORG, email, roleKey: "front_desk" },
  );
  const [row] = await owner.$queryRawUnsafe<{ id: string }[]>(
    "select id from public.users where email = $1",
    email,
  );
  return { email, token: issued.token, userId: row!.id };
}

function post(token: string, password: string): Request {
  return new Request(`${ORIGIN}/api/staff-invitation/accept`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ token, password, name: "Nadia" }),
  });
}

/** An account made by the sign-up route alone: what a failed link leaves. */
async function anUnlinkedAccount(
  email: string,
  password: string,
): Promise<string> {
  const made = await auth.api.signUpEmail({
    body: { email, password, name: "Orphan" },
  });
  subjects.push(made.user.id);
  return made.user.id;
}

describe("a retry after the account was made and the link was not", () => {
  it("SP-S1-72: is finished by the password that opens the account: tied, accepted, signed in with the invited role", async () => {
    const person = await invited();
    const orphan = await anUnlinkedAccount(person.email, PASSWORD);
    await expect(resolveRanzaUserId(orphan)).resolves.toBeNull();

    const response = await acceptInvitation(post(person.token, PASSWORD));

    expect(response.status).toBe(200);
    await expect(resolveRanzaUserId(orphan)).resolves.toBe(person.userId);
    expect((await staff.invitationState(person.token))?.state).toBe("accepted");

    // The session handed over is the account's own, and it is the invited
    // person holding the invited role.
    const cookie = response.headers
      .getSetCookie()
      .map((entry) => entry.split(";")[0])
      .join("; ");
    const session = await auth.api.getSession({
      headers: new Headers({ cookie }),
    });
    expect(session?.user.id).toBe(orphan);
    const [membership] = await owner.$queryRawUnsafe<
      { role: string; status: string }[]
    >(
      `select role, status from public.organization_memberships
        where organization_id = $1::uuid and user_id = $2::uuid`,
      ORG,
      person.userId,
    );
    expect(membership).toEqual({ role: "front_desk", status: "active" });
  });

  it("SP-S1-72: with another password links nothing, accepts nothing and says an account exists", async () => {
    const person = await invited();
    const orphan = await anUnlinkedAccount(person.email, PASSWORD);

    const response = await acceptInvitation(
      post(person.token, "not-the-password-1"),
    );

    expect(await response.json()).toEqual({
      ok: false,
      reason: "account_exists",
    });
    expect(response.headers.getSetCookie()).toEqual([]);
    await expect(resolveRanzaUserId(orphan)).resolves.toBeNull();
    expect((await staff.invitationState(person.token))?.state).toBe("pending");
  });

  it("SP-S1-72: an account whose subject already has a Ranza user of its own is not tied to the invited one", async () => {
    const person = await invited();
    const orphan = await anUnlinkedAccount(person.email, PASSWORD);
    // The first request after a sign-up gave that subject a user, and not the
    // invited one: the address was taken by another user row.
    await owner.$executeRawUnsafe(
      `insert into public.users (id, email) values ($1::uuid, $2)`,
      "ee000009-0000-4000-8000-" + randomUUID().slice(-12),
      `squatter-${randomUUID()}@example.test`,
    );
    const [squatter] = await owner.$queryRawUnsafe<{ id: string }[]>(
      `select id from public.users where email like 'squatter-%' order by created_at desc limit 1`,
    );
    addresses.push(
      (
        await owner.$queryRawUnsafe<{ email: string }[]>(
          "select email from public.users where id = $1::uuid",
          squatter!.id,
        )
      )[0]!.email,
    );
    await owner.$executeRawUnsafe(
      `insert into public.auth_identities (user_id, issuer, subject)
       values ($1::uuid, 'better-auth', $2)`,
      squatter!.id,
      orphan,
    );

    const response = await acceptInvitation(post(person.token, PASSWORD));

    expect(await response.json()).toEqual({
      ok: false,
      reason: "account_exists",
    });
    await expect(resolveRanzaUserId(orphan)).resolves.toBe(squatter!.id);
    expect((await staff.invitationState(person.token))?.state).toBe("pending");
  });

  it("SP-S1-54: with no account yet it makes one and ties it", async () => {
    const person = await invited();
    const response = await acceptInvitation(post(person.token, PASSWORD));
    expect(response.status).toBe(200);
    const [account] = await owner.$queryRawUnsafe<{ id: string }[]>(
      "select id from public.auth_user where email = $1",
      person.email,
    );
    subjects.push(account!.id);
    await expect(resolveRanzaUserId(account!.id)).resolves.toBe(person.userId);
  });
});
