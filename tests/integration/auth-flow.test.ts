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
import {
  createAuthModule,
  InvitedUserLinkError,
} from "../../packages/auth/src";
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

const { auth, linkRanzaUser, linkInvitedUser, resolveRanzaUserId } =
  createAuthModule({
    db: authDb,
    secret:
      process.env.BETTER_AUTH_SECRET ?? "test-secret-not-used-in-production",
  });

let subject: string;
let ranzaUserId: string;
/** Emails the race test signed in with, removed afterwards. */
const raced: string[] = [];

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
  await owner.$executeRawUnsafe(
    `delete from public.auth_identities
      where user_id in (select id from public.users where email = any($1::text[]))`,
    raced,
  );
  await owner.$executeRawUnsafe(
    "delete from public.users where email = any($1::text[])",
    raced,
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

  // OA-S2-02. The re-check inside linkRanzaUser's transaction does not
  // serialize anything under READ COMMITTED: two first sign-ins both find no
  // identity and both insert. The unique indexes are what stop a second Ranza
  // user, and the loser's unique violation must come back as the winner's id
  // rather than as a failed request. A single pair can interleave harmlessly,
  // so several race at once, each on a subject nobody has signed in with.
  it("gives two concurrent first sign-ins of one subject one Ranza user", async () => {
    const runs = Array.from({ length: 8 }, (_, index) => ({
      subject: `race-${Date.now()}-${index}`,
      email: `race-${Date.now()}-${index}@example.test`,
    }));
    raced.push(...runs.map((run) => run.email));

    const outcomes = await Promise.all(
      runs.map((run) =>
        Promise.allSettled([linkRanzaUser(run), linkRanzaUser(run)]),
      ),
    );

    for (const [index, [first, second]] of outcomes.entries()) {
      expect(first.status, `run ${index}, first`).toBe("fulfilled");
      expect(second.status, `run ${index}, second`).toBe("fulfilled");
      if (first.status === "fulfilled" && second.status === "fulfilled") {
        expect(second.value).toBe(first.value);
      }
    }
    const users = await owner.$queryRawUnsafe<{ count: bigint }[]>(
      "select count(*)::bigint as count from public.users where email = any($1::text[])",
      runs.map((run) => run.email),
    );
    expect(Number(users[0]!.count)).toBe(runs.length);
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

/**
 * Giving a login to somebody an invitation already made a Ranza user for
 * (PEOPLE-01, ADR 0005).
 *
 * The danger is the shortcut: adopting the existing user by email, which would
 * hand the membership waiting for that address to whoever signed up with it
 * first. These hold the line the other way round — the sign-up alone gets
 * nothing, and the link only takes an account carrying the user's own address.
 */
describe("a login for an invited person", () => {
  const stamp = Date.now();
  const made: { users: string[]; accounts: string[] } = {
    users: [],
    accounts: [],
  };

  async function anInvitedUser(): Promise<{ id: string; email: string }> {
    const email = `invited-login-${stamp}-${made.users.length}@example.test`;
    const [row] = await owner.$queryRawUnsafe<{ id: string }[]>(
      "insert into public.users (email) values ($1) returning id",
      email,
    );
    made.users.push(row!.id);
    return { id: row!.id, email };
  }

  async function anAccount(email: string): Promise<string> {
    const result = await auth.api.signUpEmail({
      body: { email, password: PASSWORD, name: "Invited" },
    });
    made.accounts.push(email);
    return result.user.id;
  }

  afterAll(async () => {
    await owner.$executeRawUnsafe(
      "delete from public.auth_identities where user_id = any($1::uuid[])",
      made.users,
    );
    await owner.$executeRawUnsafe(
      "delete from public.users where id = any($1::uuid[])",
      made.users,
    );
    await owner.$executeRawUnsafe(
      "delete from public.auth_user where email = any($1::text[])",
      made.accounts,
    );
  });

  it("ties the new account to the user the invitation made", async () => {
    const invited = await anInvitedUser();
    const subject = await anAccount(invited.email);

    await linkInvitedUser({ subject, userId: invited.id });

    await expect(resolveRanzaUserId(subject)).resolves.toBe(invited.id);
  });

  it("does not hand the invited user to whoever merely signs up with the address", async () => {
    const invited = await anInvitedUser();
    const subject = await anAccount(invited.email);

    // The first request after signing up: it must not adopt the existing user.
    await expect(
      linkRanzaUser({ subject, email: invited.email }),
    ).rejects.toBeDefined();
    await expect(resolveRanzaUserId(subject)).resolves.toBeNull();
  });

  it("refuses an account that carries somebody else's address", async () => {
    const invited = await anInvitedUser();
    const stranger = await anAccount(
      `stranger-${stamp}-${made.users.length}@example.test`,
    );

    await expect(
      linkInvitedUser({ subject: stranger, userId: invited.id }),
    ).rejects.toMatchObject({ reason: "not_their_address" });
    await expect(resolveRanzaUserId(stranger)).resolves.toBeNull();
  });

  it("refuses a user who can already sign in", async () => {
    const invited = await anInvitedUser();
    const first = await anAccount(invited.email);
    await linkInvitedUser({ subject: first, userId: invited.id });

    // A second account for the same address cannot exist, so the second link
    // is a second subject presented for a user who already has one.
    const [other] = await owner.$queryRawUnsafe<{ id: string }[]>(
      `insert into public.auth_user (id, name, email, "emailVerified", "createdAt", "updatedAt")
       values ($1, 'Twin', $2, false, now(), now()) returning id`,
      `twin-${stamp}`,
      invited.email.toUpperCase(),
    );
    made.accounts.push(invited.email.toUpperCase());

    await expect(
      linkInvitedUser({ subject: other!.id, userId: invited.id }),
    ).rejects.toBeInstanceOf(InvitedUserLinkError);
    await expect(resolveRanzaUserId(other!.id)).resolves.toBeNull();
  });

  it("refuses an account that does not exist", async () => {
    const invited = await anInvitedUser();
    await expect(
      linkInvitedUser({ subject: "no-such-subject", userId: invited.id }),
    ).rejects.toMatchObject({ reason: "no_account" });
  });
});
