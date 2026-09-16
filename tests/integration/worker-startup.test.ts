/**
 * What the worker refuses to start on.
 *
 * A web application reveals a misconfigured connection within seconds, because
 * somebody is watching a page. A worker does not: it runs unattended, and a
 * connection that has quietly stopped being subject to row-level security keeps
 * working. That is the failure this repository has already had in production
 * once, and could not see.
 *
 * So the refusals are asserted here rather than trusted, and each was watched go
 * red by removing the check it covers.
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  assertUnprivileged,
  createComposition,
} from "../../apps/worker/src/composition";
import { createPrismaClient } from "../../packages/db/src";

const worker = process.env.WORKER_DATABASE_URL!;
const direct = process.env.DIRECT_URL!;
const runtime = process.env.DATABASE_URL!;

const owner = createPrismaClient(direct);
const unprivileged = createPrismaClient(worker);

/** Restores the environment whatever the assertion did. */
async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  run: () => Promise<T>,
): Promise<T> {
  const previous = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, overrides);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
  }
  try {
    return await run();
  } finally {
    Object.assign(process.env, previous);
  }
}

afterAll(async () => {
  await Promise.all([owner.$disconnect(), unprivileged.$disconnect()]);
});

describe("the role behind the connection", () => {
  it("accepts ranza_worker, which owns nothing and bypasses nothing", async () => {
    await expect(assertUnprivileged(unprivileged)).resolves.toBeUndefined();
  });

  // The important half. This role works perfectly — it reads every table and
  // writes every row — which is exactly why nothing else would notice.
  it("refuses the migration role, which owns the tables", async () => {
    await expect(assertUnprivileged(owner)).rejects.toThrow(/row-level/i);
  });
});

describe("the connection string", () => {
  it("refuses to start without one", async () => {
    await withEnv({ WORKER_DATABASE_URL: undefined }, async () => {
      await expect(createComposition()).rejects.toThrow(
        /WORKER_DATABASE_URL must be set/,
      );
    });
  });

  it("refuses the migration connection by name, before asking the database", async () => {
    await withEnv(
      { WORKER_DATABASE_URL: direct, DIRECT_URL: direct },
      async () => {
        await expect(createComposition()).rejects.toThrow(
          /must not be the migration connection/,
        );
      },
    );
  });

  // ranza_app would not be dangerous here — it would be useless. It has no
  // worker context, so every policy would deny and the queue would look
  // permanently empty. A failure that produces silence is worth its own message.
  it("refuses the runtime connection, which would reach nothing", async () => {
    await withEnv(
      { WORKER_DATABASE_URL: runtime, DATABASE_URL: runtime },
      async () => {
        await expect(createComposition()).rejects.toThrow(
          /must not be the runtime connection/,
        );
      },
    );
  });

  it("starts on the worker's own connection", async () => {
    const composition = await withEnv(
      { WORKER_DATABASE_URL: worker },
      createComposition,
    );
    expect(composition.outbox).toBeDefined();
    await composition.disconnect();
  });
});
