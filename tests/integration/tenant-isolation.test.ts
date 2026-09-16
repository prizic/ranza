/**
 * Proves the ADR 0001 claim end to end: RLS applies to Prisma's pooled
 * connection, and withOrganizationContext() is what makes it work.
 *
 * The unit tests use a fake client. This one uses a real database, because the
 * risk being managed here is whether Postgres actually sees the context.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../packages/db/src";
import { withOrganizationContext } from "../../packages/db/src/context";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER_A = "11111111-1111-4111-8111-111111111111";
const OWNER_B = "33333333-3333-4333-8333-333333333333";

// The host composes its own clients; the package reads no environment.
const prisma = createPrismaClient(process.env.DATABASE_URL!);

// Seeding needs INSERT rights; ranza_app deliberately has only SELECT, so
// fixtures go in as the owner.
const owner = createPrismaClient(process.env.DIRECT_URL!);

beforeAll(async () => {
  await owner.$executeRawUnsafe(
    `
    insert into public.users (id, email) values
      ($1, 'owner-a@example.test'), ($2, 'owner-b@example.test')
    on conflict (id) do nothing`,
    OWNER_A,
    OWNER_B,
  );
  await owner.$executeRawUnsafe(
    `
    insert into public.organizations (id, name, status) values
      ($1, 'Organization A', 'active'), ($2, 'Organization B', 'active')
    on conflict (id) do nothing`,
    ORG_A,
    ORG_B,
  );
  await owner.$executeRawUnsafe(
    `
    insert into public.organization_memberships
      (organization_id, user_id, role, access_scope) values
      ($1, $2, 'owner', 'organization_wide'),
      ($3, $4, 'owner', 'organization_wide')
    on conflict (organization_id, user_id) do nothing`,
    ORG_A,
    OWNER_A,
    ORG_B,
    OWNER_B,
  );
});

afterAll(async () => {
  // Leave no residue: the pgTAP suites use the same fixture ids, and a shared
  // database makes one suite's leftovers another suite's failure.
  await owner.$executeRawUnsafe(
    "delete from public.organization_memberships where organization_id in ($1,$2)",
    ORG_A,
    ORG_B,
  );
  await owner.$executeRawUnsafe(
    "delete from public.organizations where id in ($1,$2)",
    ORG_A,
    ORG_B,
  );
  await owner.$executeRawUnsafe(
    "delete from public.users where id in ($1,$2)",
    OWNER_A,
    OWNER_B,
  );
  await owner.$disconnect();
  await prisma.$disconnect();
});

describe("tenant isolation under Prisma", () => {
  it("returns only the acting user's Organization", async () => {
    const rows = await withOrganizationContext(
      prisma,
      { userId: OWNER_A },
      (tx) =>
        tx.$queryRawUnsafe<{ name: string }[]>(
          "select name from public.organizations order by name",
        ),
    );
    expect(rows.map((r) => r.name)).toEqual(["Organization A"]);
  });

  it("isolates a second user on the same pooled client", async () => {
    const rows = await withOrganizationContext(
      prisma,
      { userId: OWNER_B },
      (tx) =>
        tx.$queryRawUnsafe<{ name: string }[]>(
          "select name from public.organizations",
        ),
    );
    expect(rows.map((r) => r.name)).toEqual(["Organization B"]);
  });

  it("denies when no context is set — the pooled connection must not leak", async () => {
    const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
      "select name from public.organizations",
    );
    expect(rows).toEqual([]);
  });

  it("does not leak context into a later contextless query", async () => {
    await withOrganizationContext(prisma, { userId: OWNER_A }, (tx) =>
      tx.$queryRawUnsafe("select 1"),
    );
    const after = await prisma.$queryRawUnsafe<{ name: string }[]>(
      "select name from public.organizations",
    );
    expect(after).toEqual([]);
  });
});
