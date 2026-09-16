/**
 * Rate limiting, and the thing about it that is easy to get wrong.
 *
 * Blueprint 7.6 lists rate limiting in the security baseline. Better Auth
 * provides it and counts in process memory by default, which passes every test
 * you would naturally write — one process, one counter, limit enforced. It
 * fails only in the shape nobody tests: a second instance, with its own memory,
 * enforcing its own copy of the limit.
 *
 * So this runs two auth modules over two independent clients, the way two
 * server instances would, and asserts the limit is shared between them. Run it
 * against an in-memory counter and the second assertion goes green in the wrong
 * direction — which is exactly what makes it worth writing.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createAuthModule } from "../../packages/auth/src";
import { createPrismaClient } from "../../packages/db/src";

const SECRET =
  process.env.BETTER_AUTH_SECRET ?? "test-secret-not-used-in-production";

// Two clients, two modules: as unrelated as two lambdas that happen to share a
// database. Nothing passes between them except the table.
const dbA = createPrismaClient(process.env.AUTH_DATABASE_URL!);
const dbB = createPrismaClient(process.env.AUTH_DATABASE_URL!);
const owner = createPrismaClient(process.env.DIRECT_URL!);

const instanceA = createAuthModule({
  db: dbA,
  secret: SECRET,
  rateLimit: true,
});
const instanceB = createAuthModule({
  db: dbB,
  secret: SECRET,
  rateLimit: true,
});

/** A sign-in attempt that will fail on the password, so only the limit varies. */
const attempt = (instance: {
  auth: { handler: (request: Request) => Promise<Response> };
}) =>
  instance.auth
    .handler(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "rate-limit@example.test",
          password: "not-the-password",
        }),
      }),
    )
    .then((response) => response.status);

const clearCounters = () =>
  owner.$executeRawUnsafe("delete from public.auth_rate_limit");

beforeEach(clearCounters);

afterAll(async () => {
  await clearCounters();
  await owner.$disconnect();
  await dbA.$disconnect();
  await dbB.$disconnect();
});

describe("rate limiting", () => {
  it("refuses a burst of sign-in attempts", async () => {
    const seen: number[] = [];
    for (let i = 0; i < 8; i += 1) seen.push(await attempt(instanceA));

    // Better Auth's built-in rule for /sign-in is three in ten seconds.
    expect(seen).toContain(429);
    expect(seen.filter((status) => status !== 429).length).toBeLessThanOrEqual(
      4,
    );
  });

  it("counts a second instance's attempts against the same limit", async () => {
    // Spend the allowance on one instance...
    let spent = 0;
    for (let i = 0; i < 6; i += 1) {
      if ((await attempt(instanceA)) === 429) break;
      spent += 1;
    }
    expect(spent).toBeGreaterThan(0);

    // ...and the other instance, which shares nothing but the table, is already
    // out of allowance. With an in-process counter this would be a fresh 401.
    await expect(attempt(instanceB)).resolves.toBe(429);
  });

  it("writes the counter where every instance can read it", async () => {
    await attempt(instanceA);
    const rows = await owner.$queryRawUnsafe<{ key: string; count: number }[]>(
      "select key, count from public.auth_rate_limit",
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("is not reachable from the tenant query path", async () => {
    const tenant = createPrismaClient(process.env.DATABASE_URL!);
    try {
      // Being able to reset a counter is being able to switch the limit off.
      await expect(
        tenant.$executeRawUnsafe("delete from public.auth_rate_limit"),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await tenant.$disconnect();
    }
  });
});
