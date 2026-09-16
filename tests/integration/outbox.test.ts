/**
 * The queue and the dispatcher, against a real database.
 *
 * The pgTAP suite proves who may touch which row. This proves the parts a
 * policy cannot express: that a fact and the record that it needs delivering
 * share a commit, that a redelivered event does nothing the second time, that a
 * failed handler leaves no writes and a scheduled retry, and that two workers
 * running together deliver an event once between them.
 *
 * Each assertion was checked by breaking what it asserts — moving the delivery
 * row out of the handler's transaction, removing the `on conflict do nothing`,
 * writing the failure bookkeeping inside the rolled-back transaction — and
 * watching it go red.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../packages/db/src";
import {
  createOutboxDispatcher,
  publishWithin,
  type OutboxSubscription,
  type OutboxWriteClient,
} from "../../packages/platform/outbox/src";
import { withOrganizationContext } from "../../packages/db/src";

const ORG = "d6000002-0000-4000-8000-000000000001";
const OTHER_ORG = "d6000002-0000-4000-8000-000000000002";
const MEMBER = "d6000001-0000-4000-8000-000000000001";

// The publisher is the ordinary runtime path: ranza_app, RLS-subject, inside a
// request context.
const prisma = createPrismaClient(process.env.DATABASE_URL!);
// The dispatcher is the worker's. Pointing this at ranza_app instead makes the
// queue look permanently empty rather than failing, which is why the worker's
// composition root checks the role at boot rather than trusting the URL.
const workerDb = createPrismaClient(process.env.WORKER_DATABASE_URL!);
const dispatcher = createOutboxDispatcher({ db: workerDb });
const owner = createPrismaClient(process.env.DIRECT_URL!);

/** A second dispatcher on its own connection, for the race. */
const rivalDb = createPrismaClient(process.env.WORKER_DATABASE_URL!);
const rival = createOutboxDispatcher({ db: rivalDb });

/**
 * A table the handler can write to, created and dropped by this suite.
 *
 * Deliberately not a real module's table. What is under test is the dispatcher's
 * transaction boundary, and borrowing a table with its own policies would mean a
 * failure here could be either.
 */
const SCRATCH = "outbox_test_effects";

async function publish(
  eventType: string,
  payload: Record<string, unknown>,
  organizationId = ORG,
): Promise<string> {
  return withOrganizationContext(prisma, { userId: MEMBER }, async (tx) => {
    const { eventId } = await publishWithin(
      tx as unknown as OutboxWriteClient,
      {
        organizationId,
        eventType,
        payload,
      },
    );
    return eventId;
  });
}

async function effects(eventId: string): Promise<number> {
  const rows = await owner.$queryRawUnsafe<{ count: bigint }[]>(
    `select count(*) as count from public.${SCRATCH} where event_id = $1::uuid`,
    eventId,
  );
  return Number(rows[0]?.count ?? 0);
}

async function eventRow(eventId: string) {
  const rows = await owner.$queryRawUnsafe<
    {
      attempts: number;
      lastError: string | null;
      publishedAt: Date | null;
      deadAt: Date | null;
      availableAt: Date;
      claimedUntil: Date | null;
    }[]
  >(
    `select attempts,
            last_error    as "lastError",
            published_at  as "publishedAt",
            dead_at       as "deadAt",
            available_at  as "availableAt",
            claimed_until as "claimedUntil"
       from outbox.events where id = $1::uuid`,
    eventId,
  );
  return rows[0];
}

function records(consumer: string, eventType: string): OutboxSubscription {
  return {
    consumer,
    eventType,
    handle: async (tx, event) => {
      await tx.$executeRawUnsafe(
        `insert into public.${SCRATCH} (event_id) values ($1::uuid)`,
        event.eventId,
      );
    },
  };
}

function alwaysFails(consumer: string, eventType: string): OutboxSubscription {
  return {
    consumer,
    eventType,
    handle: async (tx, event) => {
      await tx.$executeRawUnsafe(
        `insert into public.${SCRATCH} (event_id) values ($1::uuid)`,
        event.eventId,
      );
      throw new Error("the handler could not finish");
    },
  };
}

/**
 * Empties the queue of everything that was already in it.
 *
 * `claim()` takes the oldest twenty unpublished events across every
 * Organization, because that is what a worker does. The suites that run before
 * this one leave their own events behind — a check-in publishes two — and once
 * twenty of those are older than the event a test has just written, the
 * dispatcher claims them instead and the test's own event is never delivered.
 *
 * That is not flakiness. It is deterministic in the depth of the backlog, which
 * is why it surfaces as a suite that passes alone, passes on a quiet database,
 * and fails in a full run once enough other suites exist to fill a batch. It
 * was found that way: twenty-five filler events make it fail every time.
 *
 * Drained through `dispatch([])` rather than SQL because an event nothing
 * subscribes to is published immediately — the queue is emptied by the path
 * production empties it by, not by a test reaching past the dispatcher.
 */
async function drain(): Promise<void> {
  // Bounded rather than `while (true)`: a queue that will not drain is a broken
  // dispatcher, and this should say so by failing rather than by hanging.
  for (let pass = 0; pass < 50; pass += 1) {
    const { claimed } = await dispatcher.dispatch([]);
    if (claimed === 0) return;
  }
  throw new Error("the outbox did not drain");
}

beforeAll(async () => {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values ($1,'outbox-member@example.test')
     on conflict (id) do nothing`,
    MEMBER,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status) values
       ($1,'Outbox Integration Organization','active'),
       ($2,'Outbox Integration Other','active')
     on conflict (id) do nothing`,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope) values ($1,$2,'owner','organization_wide')
     on conflict (organization_id, user_id) do nothing`,
    ORG,
    MEMBER,
  );

  await owner.$executeRawUnsafe(
    `create table if not exists public.${SCRATCH} (
       id uuid primary key default gen_random_uuid(),
       event_id uuid not null,
       written_at timestamptz not null default now()
     )`,
  );
  // No row-level security on it, and the worker is granted it directly: this
  // table stands in for whatever a real handler writes, and the point of the
  // suite is the transaction around the write rather than the write itself.
  await owner.$executeRawUnsafe(
    `grant select, insert on public.${SCRATCH} to ranza_worker`,
  );

  // Last, so every assertion below starts from a queue holding only what its
  // own test put there.
  await drain();
});

afterAll(async () => {
  await owner.$executeRawUnsafe(`drop table if exists public.${SCRATCH}`);
  await owner.$executeRawUnsafe(
    "delete from outbox.deliveries where organization_id in ($1,$2)",
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    "delete from outbox.events where organization_id in ($1,$2)",
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    "delete from public.organization_memberships where organization_id in ($1,$2)",
    ORG,
    OTHER_ORG,
  );
  await Promise.all([
    prisma.$disconnect(),
    workerDb.$disconnect(),
    rivalDb.$disconnect(),
    owner.$disconnect(),
  ]);
});

describe("publishing", () => {
  it("commits the event with the work, or with neither", async () => {
    const marker = randomUUID();

    await expect(
      withOrganizationContext(prisma, { userId: MEMBER }, async (tx) => {
        await publishWithin(tx as unknown as OutboxWriteClient, {
          organizationId: ORG,
          eventType: "test.rolled_back",
          payload: { marker },
        });
        // Whatever the caller was really doing, failing after the publish. This
        // is the case a publish-after-commit would get wrong in the other
        // direction: a message about something that did not happen.
        throw new Error("the transaction failed after publishing");
      }),
    ).rejects.toThrow();

    const rows = await owner.$queryRawUnsafe<{ id: string }[]>(
      `select id from outbox.events where payload->>'marker' = $1`,
      marker,
    );
    expect(rows).toEqual([]);
  });

  it("refuses an event type that is not one", async () => {
    await expect(publish("NotDotted", {})).rejects.toThrow();
  });

  it("refuses an Organization the publisher cannot reach", async () => {
    await expect(publish("test.happened", {}, OTHER_ORG)).rejects.toThrow();
  });
});

describe("dispatching", () => {
  it("delivers an event to its consumer and marks it published", async () => {
    const eventId = await publish("test.delivered", {});
    const report = await dispatcher.dispatch([
      records("test.onDelivered", "test.delivered"),
    ]);

    expect(report.published).toBeGreaterThanOrEqual(1);
    expect(await effects(eventId)).toBe(1);
    expect((await eventRow(eventId))?.publishedAt).not.toBeNull();
  });

  it("publishes an event nothing subscribes to rather than claiming it forever", async () => {
    const eventId = await publish("test.unwanted", {});
    await dispatcher.dispatch([]);
    expect((await eventRow(eventId))?.publishedAt).not.toBeNull();
  });

  it("does not run a handler twice when an event is delivered again", async () => {
    const eventId = await publish("test.repeated", {});
    const subscription = records("test.onRepeated", "test.repeated");

    await dispatcher.dispatch([subscription]);
    // Put it back in the queue exactly as a lost acknowledgement would: the
    // handler ran and committed, and the dispatcher is asked to do it again.
    await owner.$executeRawUnsafe(
      `update outbox.events set published_at = null, claimed_until = null where id = $1::uuid`,
      eventId,
    );
    await dispatcher.dispatch([subscription]);

    // Once, not twice. The delivery row and the handler's write share a
    // transaction, so the second pass finds the row and stops.
    expect(await effects(eventId)).toBe(1);
  });

  it("delivers to every consumer that wants the same event", async () => {
    const eventId = await publish("test.shared", {});
    await dispatcher.dispatch([
      records("test.onSharedFirst", "test.shared"),
      records("test.onSharedSecond", "test.shared"),
    ]);
    expect(await effects(eventId)).toBe(2);
  });
});

describe("a handler that fails", () => {
  it("leaves no writes, records why, and schedules a retry", async () => {
    const eventId = await publish("test.failing", {});
    const report = await dispatcher.dispatch([
      alwaysFails("test.onFailing", "test.failing"),
    ]);

    expect(report.failed).toBe(1);
    expect(report.published).toBe(0);
    // The handler wrote before it threw. Its transaction rolled back, and so
    // did the delivery row with it.
    expect(await effects(eventId)).toBe(0);

    const row = await eventRow(eventId);
    expect(row?.attempts).toBe(1);
    expect(row?.lastError).toContain("could not finish");
    expect(row?.publishedAt).toBeNull();
    expect(row?.deadAt).toBeNull();
    // Written by a statement outside the transaction that failed. Inside it,
    // this would have rolled back too and a permanently failing event would
    // look untouched forever.
    expect(row?.claimedUntil).toBeNull();
    expect(row?.availableAt.getTime()).toBeGreaterThan(Date.now() - 2_000);
  });

  it("gives up after the attempt cap and leaves the event dead, not deleted", async () => {
    const eventId = await publish("test.doomed", {});
    const subscription = alwaysFails("test.onDoomed", "test.doomed");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      // The backoff is real, so the retry is brought forward rather than waited
      // out. What is under test is the cap, not the clock.
      await owner.$executeRawUnsafe(
        `update outbox.events set available_at = now() where id = $1::uuid`,
        eventId,
      );
      await dispatcher.dispatch([subscription], { maxAttempts: 3 });
    }

    const row = await eventRow(eventId);
    expect(row?.attempts).toBe(3);
    expect(row?.deadAt).not.toBeNull();
    expect(row?.publishedAt).toBeNull();
  });
});

describe("two workers at once", () => {
  it("deliver an event once between them", async () => {
    const eventId = await publish("test.raced", {});
    const subscription = records("test.onRaced", "test.raced");

    // Two dispatchers on two connections, started together. `for update skip
    // locked` is what hands them disjoint batches; without it both would claim
    // the row and the second would block rather than skip.
    const [left, right] = await Promise.all([
      dispatcher.dispatch([subscription]),
      rival.dispatch([subscription]),
    ]);

    expect(await effects(eventId)).toBe(1);
    expect(left.claimed + right.claimed).toBeGreaterThanOrEqual(1);
    expect(left.failed + right.failed).toBe(0);
  });
});
