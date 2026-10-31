/**
 * Cleaning of rooms somebody is staying in, against a real database (RANZ-83,
 * ADR 0063, HK-S4-*).
 *
 * The pgTAP suite (`housekeeping_stayover.test.sql`) proves the function, the
 * policies and the grants one statement at a time. This proves the module on
 * top of them, as the host composes it: `ranza_app`, the viewer's own context,
 * and the audit record each command leaves.
 *
 * Breaks that were run, and what went red:
 *   the mark's audit action renamed                  the "records who marked" test
 *   the schedule's audit action renamed              the "records what it was" test
 *   the board ignoring the Property's own schedule   the "follows the Property's own" test
 * The first run of the first break stayed green: the audit log is never
 * cleaned, so an earlier run's record satisfied the assertion. Records are now
 * read only from this run onward.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../packages/db/src";
import {
  createHousekeepingModule,
  HousekeepingInputError,
  HousekeepingRefusedError,
} from "../../packages/ranza/housekeeping/src";

const ORG = "5c000002-0000-4000-8000-000000000001";
const PROPERTY = "5c000003-0000-4000-8000-000000000001";
const DUE = "5c000004-0000-4000-8000-000000000001";
const NEW_ARRIVAL = "5c000004-0000-4000-8000-000000000002";
const MANAGER = "5c000001-0000-4000-8000-000000000001";
const FINANCE = "5c000001-0000-4000-8000-000000000002";
const OUTSIDER = "5c000001-0000-4000-8000-000000000003";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const housekeeping = createHousekeepingModule({ db: prisma });
const owner = createPrismaClient(process.env.DIRECT_URL!);

const DATABASE_BUDGET_MS = 60_000;
const DAILY = { kind: "every_n_days", everyDays: 1 } as const;

let runStarted: Date;

async function seed() {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1, 'stayover-manager@example.test'),
       ($2, 'stayover-finance@example.test'),
       ($3, 'stayover-outsider@example.test')
     on conflict (id) do nothing`,
    MANAGER,
    FINANCE,
    OUTSIDER,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status)
     values ($1, 'Stayover Integration', 'active') on conflict (id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name, timezone)
     values ($1, $2, 'Stayover Property', 'Europe/Istanbul')
     on conflict (id) do nothing`,
    PROPERTY,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units
       (id, property_id, organization_id, name, unit_type, capacity, building, floor)
     values ($1, $3, $4, 'SOI-101', 'room', 2, 'Blok A', 1),
            ($2, $3, $4, 'SOI-102', 'room', 2, 'Blok A', 1)
     on conflict (id) do nothing`,
    DUE,
    NEW_ARRIVAL,
    PROPERTY,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status)
     values ($1, 'active') on conflict (organization_id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key, status)
     values ($1, 'housekeeping', 'active')
     on conflict (organization_id, module_key) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     values ($1, $2, 'housekeeping', true)
     on conflict (property_id, capability_key) do nothing`,
    PROPERTY,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope)
     values ($1, $2, 'manager', 'organization_wide'),
            ($1, $3, 'finance', 'organization_wide')
     on conflict (organization_id, user_id) do nothing`,
    ORG,
    MANAGER,
    FINANCE,
  );
  // Somebody in each room: one a week ago, one today.
  await owner.$executeRawUnsafe(
    `insert into public.stays
       (organization_id, property_id, accommodation_unit_id, stay_type, status,
        starts_on, ends_on)
     select $3::uuid, $4::uuid, wanted.unit::uuid, 'guest', 'in_house',
            app.property_today($4::uuid) - wanted.ago,
            app.property_today($4::uuid) + 30
       from (values ($1, 10), ($2, 0)) as wanted (unit, ago)`,
    DUE,
    NEW_ARRIVAL,
    ORG,
    PROPERTY,
  );
}

/**
 * Where this run's records of one action about one subject were written. The
 * audit log is append-only and never cleaned, so only what this run wrote
 * counts; an earlier run's record would otherwise satisfy every assertion.
 */
async function recordedAt(
  action: string,
  subjectId: string,
): Promise<{
  locations: (string | null)[];
  contexts: Record<string, unknown>[];
}> {
  const rows = await owner.$queryRawUnsafe<
    { locationId: string | null; context: Record<string, unknown> }[]
  >(
    `select location_id as "locationId", context
       from audit.records
      where action = $1 and subject_id = $2::uuid and occurred_at >= $3
      order by occurred_at, id`,
    action,
    subjectId,
    runStarted,
  );
  return {
    locations: rows.map((row) => row.locationId),
    contexts: rows.map((row) => row.context),
  };
}

async function reset() {
  for (const statement of [
    `delete from public.housekeeping_stayover_cleanings where organization_id = '${ORG}'`,
    `delete from public.housekeeping_stayover_settings where organization_id = '${ORG}'`,
  ]) {
    await owner.$executeRawUnsafe(statement);
  }
}

beforeAll(async () => {
  const [clock] = await owner.$queryRawUnsafe<{ now: Date }[]>(
    "select now() as now",
  );
  runStarted = clock!.now;
  await seed();
  await reset();
}, DATABASE_BUDGET_MS);

afterAll(async () => {
  await reset();
  for (const statement of [
    `delete from public.stays where organization_id = '${ORG}'`,
    `delete from public.property_capabilities where organization_id = '${ORG}'`,
    `delete from public.organization_memberships where organization_id = '${ORG}'`,
    `delete from public.entitlements where organization_id = '${ORG}'`,
    `delete from public.subscriptions where organization_id = '${ORG}'`,
    `delete from public.accommodation_units where organization_id = '${ORG}'`,
    `delete from public.properties where organization_id = '${ORG}'`,
    `delete from public.organizations where id = '${ORG}'`,
    `delete from public.users where id in ('${MANAGER}', '${FINANCE}', '${OUTSIDER}')`,
  ]) {
    await owner.$executeRawUnsafe(statement);
  }
  await prisma.$disconnect();
  await owner.$disconnect();
}, DATABASE_BUDGET_MS);

describe("the stayover board through the module", () => {
  it("lists only the room that is due on the schedule it is handed (HK-S4-05)", async () => {
    await reset();
    const board = await housekeeping.stayoverBoard(MANAGER, PROPERTY, DAILY);
    expect(board.cadence).toEqual(DAILY);
    expect(board.rooms.map((room) => room.name)).toEqual(["SOI-101"]);
    expect(board.counts).toEqual({ due: 1, done: 0 });
    expect(board.mayMark).toBe(true);
  });

  it("follows the Property's own schedule over the default, and none means no list (HK-S4-02, HK-S4-03)", async () => {
    await reset();
    await housekeeping.setStayoverCadence(MANAGER, PROPERTY, { kind: "none" });
    const none = await housekeeping.stayoverBoard(MANAGER, PROPERTY, DAILY);
    expect(none.cadence).toEqual({ kind: "none" });
    expect(none.rooms).toEqual([]);

    await housekeeping.setStayoverCadence(MANAGER, PROPERTY, {
      kind: "every_n_days",
      everyDays: 14,
    });
    const rare = await housekeeping.stayoverBoard(MANAGER, PROPERTY, DAILY);
    // Ten days in, so a fortnight has not yet passed.
    expect(rare.rooms).toEqual([]);

    await housekeeping.setStayoverCadence(MANAGER, PROPERTY, null);
    const back = await housekeeping.stayoverBoard(MANAGER, PROPERTY, DAILY);
    expect(back.cadence).toEqual(DAILY);
    expect(back.rooms).toHaveLength(1);
  });

  it("shows a reader without the permission the list and no right to mark (HK-S4-13)", async () => {
    await reset();
    const board = await housekeeping.stayoverBoard(FINANCE, PROPERTY, DAILY);
    expect(board.rooms).toHaveLength(1);
    expect(board.mayMark).toBe(false);
  });

  it("is empty for somebody who reaches nothing at the Property (HK-S4-15)", async () => {
    const board = await housekeeping.stayoverBoard(OUTSIDER, PROPERTY, DAILY);
    expect(board.rooms).toEqual([]);
    expect(board.counts).toEqual({ due: 0, done: 0 });
  });
});

describe("marking and undoing", () => {
  it("records who marked, marks once for a double press, and takes it back (HK-S4-10, HK-S4-11, HK-S4-14)", async () => {
    await reset();
    const first = await housekeeping.markStayoverCleaned(MANAGER, DUE);
    expect(first.recorded).toBe(true);
    const second = await housekeeping.markStayoverCleaned(MANAGER, DUE);
    expect(second.recorded).toBe(false);

    const [live] = await owner.$queryRawUnsafe<
      { count: number; cleanedBy: string }[]
    >(
      `select count(*)::int as count, min(cleaned_by::text) as "cleanedBy"
         from public.housekeeping_stayover_cleanings
        where accommodation_unit_id = $1::uuid and undone_at is null`,
      DUE,
    );
    expect(live).toEqual({ count: 1, cleanedBy: MANAGER });

    const done = await housekeeping.stayoverBoard(MANAGER, PROPERTY, DAILY);
    expect(done.counts).toEqual({ due: 0, done: 1 });
    expect(done.rooms[0]?.doneToday).toBe(true);

    // Once, not twice: the double press recorded nothing.
    expect(
      (await recordedAt("housekeeping.stayover_cleaned", DUE)).locations,
    ).toEqual([PROPERTY]);

    await housekeeping.undoStayoverCleaned(MANAGER, DUE);
    const again = await housekeeping.stayoverBoard(MANAGER, PROPERTY, DAILY);
    expect(again.counts).toEqual({ due: 1, done: 0 });
    expect(
      (await recordedAt("housekeeping.stayover_undone", DUE)).locations,
    ).toEqual([PROPERTY]);
  });

  it("refuses a reader who may not mark, and a room out of reach, with the same refusal (HK-S4-13, HK-S4-15)", async () => {
    await reset();
    await expect(
      housekeeping.markStayoverCleaned(FINANCE, DUE),
    ).rejects.toBeInstanceOf(HousekeepingRefusedError);
    await expect(
      housekeeping.markStayoverCleaned(OUTSIDER, DUE),
    ).rejects.toBeInstanceOf(HousekeepingRefusedError);
    const [{ count }] = await owner.$queryRawUnsafe<{ count: number }[]>(
      `select count(*)::int as count
         from public.housekeeping_stayover_cleanings
        where organization_id = $1::uuid`,
      ORG,
    );
    expect(count).toBe(0);
  });

  it("refuses an undo with nothing to undo, as a mark's refusal reads (HK-S4-14)", async () => {
    await reset();
    await expect(
      housekeeping.undoStayoverCleaned(MANAGER, DUE),
    ).rejects.toBeInstanceOf(HousekeepingRefusedError);
  });
});

describe("setting the schedule", () => {
  it("records what it was and what it became, at the Property (HK-S4-16)", async () => {
    await reset();
    await housekeeping.setStayoverCadence(MANAGER, PROPERTY, {
      kind: "weekly",
      weekday: 3,
    });
    const written = await recordedAt("housekeeping.stayover_set", PROPERTY);
    expect(written.locations.at(-1)).toBe(PROPERTY);
    expect(written.contexts.at(-1)).toMatchObject({ to: "weekly_3" });
  });

  it("refuses a schedule the database would, before a statement runs (HK-S4-02)", async () => {
    await expect(
      housekeeping.setStayoverCadence(MANAGER, PROPERTY, {
        kind: "every_n_days",
        everyDays: 15,
      }),
    ).rejects.toBeInstanceOf(HousekeepingInputError);
  });

  it("refuses a reader who may not configure (HK-S4-04)", async () => {
    await expect(
      housekeeping.setStayoverCadence(FINANCE, PROPERTY, { kind: "none" }),
    ).rejects.toBeInstanceOf(HousekeepingRefusedError);
  });
});
