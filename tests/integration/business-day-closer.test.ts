/**
 * The worker closes a quiet day, against a real database (CD-S2).
 *
 * The two functions it reaches through are proved in
 * `tests/database/business_day_worker.test.sql`. This proves the closer that
 * calls them: that a pass works through every due Property as ranza_worker,
 * that one failing does not stop the rest, and that two workers, or a worker
 * and a desk, make one close.
 *
 * A pass asks which days are due across every Organization — that is what the
 * worker does — so it also closes any quiet Property another suite left behind.
 * Every assertion here is about this suite's own Properties, which are new on
 * every run: a close can never be deleted.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../packages/db/src";
import {
  createBusinessDayModule,
  createDayCloser,
  DayAlreadyClosedError,
} from "../../packages/ranza/business-day/src";

const worker = createPrismaClient(process.env.WORKER_DATABASE_URL!);
const rivalWorker = createPrismaClient(process.env.WORKER_DATABASE_URL!);
const app = createPrismaClient(process.env.DATABASE_URL!);
const owner = createPrismaClient(process.env.DIRECT_URL!);

const closer = createDayCloser({ db: worker });
const rivalCloser = createDayCloser({ db: rivalWorker });
const days = createBusinessDayModule({ db: app });

const ORG = randomUUID();
const DESK = randomUUID();

beforeAll(async () => {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values ($1::uuid, 'closer-desk-' || $1 || '@example.test')`,
    DESK,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status)
     values ($1::uuid, 'Worker Closer Organization', 'active')`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status) values ($1::uuid, 'active')`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key)
     values ($1::uuid, 'front_office')`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope)
     values ($1::uuid, $2::uuid, 'front_desk', 'organization_wide')`,
    ORG,
    DESK,
  );
});

afterAll(async () => {
  await Promise.all([
    worker.$disconnect(),
    rivalWorker.$disconnect(),
    app.$disconnect(),
    owner.$disconnect(),
  ]);
});

async function aProperty(): Promise<string> {
  const id = randomUUID();
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name)
     values ($1::uuid, $2::uuid, 'Worker Closer ' || $1::text)`,
    id,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     values ($1::uuid, $2::uuid, 'front_desk', true)`,
    id,
    ORG,
  );
  return id;
}

async function day(propertyId: string, offset: number): Promise<string> {
  const [row] = await owner.$queryRawUnsafe<{ day: string }[]>(
    `select to_char(app.property_today($1::uuid) + $2::int, 'YYYY-MM-DD') as day`,
    propertyId,
    offset,
  );
  return row!.day;
}

/** The days a Property has closed, oldest first, and who closed each. */
async function closes(propertyId: string) {
  return owner.$queryRawUnsafe<{ businessDate: string; job: string | null }[]>(
    `select to_char(business_date, 'YYYY-MM-DD') as "businessDate",
            closed_by_job as job
       from public.business_day_closes
      where property_id = $1::uuid
      order by business_date`,
    propertyId,
  );
}

/** A history the clock could only produce over days, in replica mode. */
async function history(propertyId: string, daysAgo: number[]): Promise<void> {
  await owner.$transaction([
    owner.$executeRawUnsafe(`set local session_replication_role = replica`),
    owner.$executeRawUnsafe(
      `insert into public.business_day_closes
         (organization_id, property_id, business_date, closed_by_job)
       select $1::uuid, $2::uuid, app.property_today($2::uuid) - ago, 'test.fixture'
       from unnest($3::int[]) as ago`,
      ORG,
      propertyId,
      daysAgo,
    ),
  ]);
}

describe("a pass", () => {
  it("closes a quiet day in the job's name", async () => {
    const property = await aProperty();

    const report = await closer.closeDueDays();

    expect(report.closed).toBeGreaterThanOrEqual(1);
    expect(await closes(property)).toEqual([
      { businessDate: await day(property, -1), job: "business_day.close" },
    ]);
  });

  it("closes a backlog of quiet days one day per pass, oldest first", async () => {
    const property = await aProperty();
    await history(property, [4]);

    for (const expected of [-3, -2, -1]) {
      await closer.closeDueDays();
      const closed = await closes(property);
      expect(closed.at(-1)?.businessDate).toBe(await day(property, expected));
    }
    await closer.closeDueDays();
    expect(await closes(property)).toHaveLength(4);
  });

  it("does not stop because one Property failed", async () => {
    const broken = await aProperty();
    const quiet = await aProperty();
    // A failure the close function does not catch, at one Property only.
    await owner.$executeRawUnsafe(
      `create function public.close_the_day_test_failure() returns trigger
       language plpgsql as $$
       begin
         if new.property_id = '${broken}'::uuid then
           raise exception 'a close that fails on purpose';
         end if;
         return new;
       end;
       $$`,
    );
    try {
      await owner.$executeRawUnsafe(
        `create trigger close_the_day_test_failure
           before insert on public.business_day_closes
           for each row execute function public.close_the_day_test_failure()`,
      );

      const report = await closer.closeDueDays();

      expect(report.failures.map((failure) => failure.propertyId)).toContain(
        broken,
      );
      expect(await closes(broken)).toEqual([]);
      expect(await closes(quiet)).toHaveLength(1);
    } finally {
      await owner.$executeRawUnsafe(
        `drop trigger if exists close_the_day_test_failure on public.business_day_closes`,
      );
      await owner.$executeRawUnsafe(
        `drop function if exists public.close_the_day_test_failure()`,
      );
    }
  });
});

describe("two at once", () => {
  it("two workers closing one day make one close", async () => {
    const property = await aProperty();

    const reports = await Promise.all([
      closer.closeDueDays(),
      rivalCloser.closeDueDays(),
    ]);

    expect(await closes(property)).toHaveLength(1);
    expect(
      reports.flatMap((report) =>
        report.failures.filter((failure) => failure.propertyId === property),
      ),
    ).toEqual([]);
  });

  it("a desk and the worker closing one day make one close", async () => {
    const property = await aProperty();
    const yesterday = await day(property, -1);

    const [desk, pass] = await Promise.allSettled([
      days.closeDay(DESK, property, yesterday, null),
      closer.closeDueDays(),
    ]);

    expect(await closes(property)).toHaveLength(1);
    if (desk.status === "rejected") {
      expect(desk.reason).toBeInstanceOf(DayAlreadyClosedError);
    }
    expect(pass.status).toBe("fulfilled");
  });
});
