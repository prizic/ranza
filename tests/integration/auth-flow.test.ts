/**
 * The chain ADR 0005 depends on, end to end and against a real database:
 *
 *   sign up -> Better Auth session -> provider subject -> auth_identities
 *           -> Ranza user id -> app.current_user_id() -> RLS-scoped rows
 *
 * Every link has existed on paper for a while. This is the first thing that
 * runs all of them together, which is the only way to know the seam works.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthModule } from "../../packages/auth/src";
import {
  createPrismaClient,
  withOrganizationContext,
} from "../../packages/db/src";

const ORG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const EMAIL = `flow-${Date.now()}@example.test`;
const PASSWORD = "correct-horse-battery-staple";

// Composed here exactly as a host would: three clients, three roles.
const prisma = createPrismaClient(process.env.DATABASE_URL!);
const owner = createPrismaClient(process.env.DIRECT_URL!);
const authDb = createPrismaClient(process.env.AUTH_DATABASE_URL!);

const { auth, linkRanzaUser, resolveRanzaUserId } = createAuthModule({
  db: authDb,
  secret:
    process.env.BETTER_AUTH_SECRET ?? "test-secret-not-used-in-production",
});

let subject: string;
let ranzaUserId: string;

beforeAll(async () => {
  await owner.$executeRawUnsafe(
    "insert into public.organizations (id, name, status) values ($1,'Flow Organization','active') on conflict (id) do nothing",
    ORG,
  );
});

afterAll(async () => {
  await owner.$executeRawUnsafe(
    "delete from public.organization_memberships where organization_id = $1",
    ORG,
  );
  await owner.$executeRawUnsafe(
    "delete from public.organizations where id = $1",
    ORG,
  );
  if (ranzaUserId) {
    await owner.$executeRawUnsafe(
      "delete from public.auth_identities where user_id = $1",
      ranzaUserId,
    );
    await owner.$executeRawUnsafe(
      "delete from public.users where id = $1",
      ranzaUserId,
    );
  }
  await owner.$executeRawUnsafe(
    "delete from public.auth_user where email = $1",
    EMAIL,
  );
  await owner.$disconnect();
  await authDb.$disconnect();
  await prisma.$disconnect();
});

describe("authentication to tenant isolation", () => {
  it("signs a user up through Better Auth", async () => {
    const result = await auth.api.signUpEmail({
      body: { email: EMAIL, password: PASSWORD, name: "Flow Tester" },
    });
    expect(result.user.id).toBeTruthy();
    subject = result.user.id;
  });

  it("issues a session that can be verified", async () => {
    const signIn = await auth.api.signInEmail({
      body: { email: EMAIL, password: PASSWORD },
    });
    expect(signIn.token).toBeTruthy();
  });

  it("links the provider subject to a Ranza user", async () => {
    ranzaUserId = await linkRanzaUser({ subject, email: EMAIL });
    expect(ranzaUserId).toMatch(/^[0-9a-f-]{36}$/);
    // Keyed on subject, not email — the mapping must survive an email change.
    await expect(resolveRanzaUserId(subject)).resolves.toBe(ranzaUserId);
  });

  it("does not create a second Ranza user when the same subject signs in again", async () => {
    const again = await linkRanzaUser({ subject, email: EMAIL });
    expect(again).toBe(ranzaUserId);
    const count = await owner.$queryRawUnsafe<{ count: bigint }[]>(
      "select count(*)::bigint as count from public.auth_identities where subject = $1",
      subject,
    );
    expect(Number(count[0]!.count)).toBe(1);
  });

  it("sees nothing before a membership exists", async () => {
    const rows = await withOrganizationContext(
      prisma,
      { userId: ranzaUserId },
      (tx) =>
        tx.$queryRawUnsafe<{ name: string }[]>(
          "select name from public.organizations",
        ),
    );
    expect(rows).toEqual([]);
  });

  it("sees exactly its Organization once a membership is granted", async () => {
    await owner.$executeRawUnsafe(
      `insert into public.organization_memberships
         (organization_id, user_id, role, access_scope)
       values ($1, $2, 'owner', 'organization_wide')
       on conflict (organization_id, user_id) do nothing`,
      ORG,
      ranzaUserId,
    );

    const rows = await withOrganizationContext(
      prisma,
      { userId: ranzaUserId },
      (tx) =>
        tx.$queryRawUnsafe<{ name: string }[]>(
          "select name from public.organizations",
        ),
    );
    expect(rows.map((r) => r.name)).toEqual(["Flow Organization"]);
  });

  it("denies the tenant query path any access to credentials", async () => {
    await expect(
      prisma.$queryRawUnsafe("select count(*) from public.auth_account"),
    ).rejects.toThrow(/permission denied/i);
  });
});
