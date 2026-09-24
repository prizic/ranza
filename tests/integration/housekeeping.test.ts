/**
 * Housekeeping against a real database (RANZ-28, ADR 0029).
 *
 * The pgTAP suite proves the function, the triggers and the grants one call at
 * a time. This proves the path they sit on: a real check-out through the
 * reservations module, a real dispatcher on `ranza_worker`, and the room the
 * Guest left turning dirty — or not, when somebody got there first.
 *
 * Breaks that were run, and what went red:
 *   the handler left out of subscriptions     HK-S1-01, HK-S1-02, HK-S1-04
 *   `select distinct` removed from the mark   HK-S2-03
 *   the all-or-nothing count check removed    HK-S2-07
 *   the check-in readiness guard removed      HK-S2-14, HK-S2-15, HK-S2-17
 * HK-S1-05 and HK-S1-09 say nothing happens, so they stay green without a
 * handler; the pgTAP suite breaks the guards they rely on.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../packages/db/src";
import { createOutboxDispatcher } from "../../packages/platform/outbox/src";
import {
  createReservationsModule,
  FRONT_DESK_CAPABILITY,
  UnitNotReadyError,
} from "../../packages/ranza/reservations/src";
import { createAccommodationModule } from "../../packages/ranza/accommodation/src";
import {
  createHousekeepingModule,
  HousekeepingInputError,
  HousekeepingRefusedError,
} from "../../packages/ranza/housekeeping/src";
import { subscriptions } from "../../apps/worker/src/outbox/subscriptions";

const ORG = "dc000002-0000-4000-8000-000000000001";
const PROPERTY = "dc000003-0000-4000-8000-000000000001";
const NO_HOUSEKEEPING = "dc000003-0000-4000-8000-000000000002";
const ROOM = "dc000004-0000-4000-8000-000000000001";
const RACED_ROOM = "dc000004-0000-4000-8000-000000000002";
const SHARED_ROOM = "dc000004-0000-4000-8000-000000000003";
const SHARED_BED = "dc000004-0000-4000-8000-000000000004";
const SHARED_BED_B = "dc000004-0000-4000-8000-000000000006";
const UNSOLD_ROOM = "dc000004-0000-4000-8000-000000000005";
const DIRTY_ARRIVAL = "dc000004-0000-4000-8000-000000000007";
const CLEAN_ARRIVAL = "dc000004-0000-4000-8000-000000000008";
const CLEANED_MEANWHILE = "dc000004-0000-4000-8000-000000000009";
const LONE_BED = "dc000004-0000-4000-8000-00000000000a";
const MEMBER = "dc000001-0000-4000-8000-000000000001";
const FINANCE = "dc000001-0000-4000-8000-000000000002";
const ASSIGNED = "dc000001-0000-4000-8000-000000000003";

// ranza_app for the front desk, exactly as the host composes it, and
// ranza_worker for the dispatcher, exactly as apps/worker does.
const prisma = createPrismaClient(process.env.DATABASE_URL!);
const reservations = createReservationsModule({ db: prisma });
const housekeeping = createHousekeepingModule({ db: prisma });
const accommodation = createAccommodationModule({ db: prisma });
const workerDb = createPrismaClient(process.env.WORKER_DATABASE_URL!);
const dispatcher = createOutboxDispatcher({ db: workerDb });
const owner = createPrismaClient(process.env.DIRECT_URL!);

// A dispatch pass is a real round trip per event, and the first drain delivers
// whatever other suites left queued; on a loaded machine that outlasts
// vitest's default hook budget.
const DATABASE_BUDGET_MS = 60_000;

/** Fixtures go in as the owner: ranza_app may not create Properties or Units. */
async function seed() {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1, 'housekeeping-member@example.test'),
       ($2, 'housekeeping-finance@example.test'),
       ($3, 'housekeeping-assigned@example.test')
     on conflict (id) do nothing`,
    MEMBER,
    FINANCE,
    ASSIGNED,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status)
     values ($1, 'Housekeeping Integration', 'active')
     on conflict (id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name, timezone) values
       ($1, $3, 'Housekeeping Property', 'Europe/Istanbul'),
       ($2, $3, 'Front Desk Only Property', 'Europe/Istanbul')
     on conflict (id) do nothing`,
    PROPERTY,
    NO_HOUSEKEEPING,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units
       (id, property_id, organization_id, name, unit_type, capacity) values
       ($1, $5, $6, 'HKI-101', 'room', 2),
       ($2, $5, $6, 'HKI-102', 'room', 2),
       ($3, $5, $6, 'HKI-103', 'room', 2),
       ($4, $7, $6, 'HKI-201', 'room', 2),
       ($8, $5, $6, 'HKI-104', 'room', 2),
       ($9, $5, $6, 'HKI-105', 'room', 2),
       ($10, $5, $6, 'HKI-106', 'room', 2),
       -- A bed with no room above it (ADR 0004), which holds its own status.
       ($11, $5, $6, 'HKI-D1', 'bed', 1)
     on conflict (id) do nothing`,
    ROOM,
    RACED_ROOM,
    SHARED_ROOM,
    UNSOLD_ROOM,
    PROPERTY,
    ORG,
    NO_HOUSEKEEPING,
    DIRTY_ARRIVAL,
    CLEAN_ARRIVAL,
    CLEANED_MEANWHILE,
    LONE_BED,
  );
  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units
       (id, property_id, organization_id, parent_id, parent_unit_type,
        name, unit_type, capacity)
     values ($1, $2, $3, $4, 'room', 'A', 'bed', 1),
            ($5, $2, $3, $4, 'room', 'B', 'bed', 1)
     on conflict (id) do nothing`,
    SHARED_BED,
    PROPERTY,
    ORG,
    SHARED_ROOM,
    SHARED_BED_B,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status)
     values ($1, 'active') on conflict (organization_id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key, status) values
       ($1, $2, 'active'), ($1, 'housekeeping', 'active')
     on conflict (organization_id, module_key) do nothing`,
    ORG,
    FRONT_DESK_CAPABILITY.moduleKey,
  );
  // The front desk everywhere; housekeeping at the first Property only.
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled) values
       ($1, $3, $4, true), ($2, $3, $4, true), ($1, $3, 'housekeeping', true)
     on conflict (property_id, capability_key) do nothing`,
    PROPERTY,
    NO_HOUSEKEEPING,
    ORG,
    FRONT_DESK_CAPABILITY.capabilityKey,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope)
     values ($1, $2, 'manager', 'organization_wide'),
            ($1, $3, 'finance', 'organization_wide'),
            ($1, $4, 'front_desk', 'assigned_properties')
     on conflict (organization_id, user_id) do nothing`,
    ORG,
    MEMBER,
    FINANCE,
    ASSIGNED,
  );
  // The front desk reaches the Property without housekeeping and not the one
  // with it, so its board there is empty by reach alone.
  await owner.$executeRawUnsafe(
    `insert into public.property_assignments (property_id, organization_id, user_id)
     values ($1, $2, $3) on conflict do nothing`,
    NO_HOUSEKEEPING,
    ORG,
    ASSIGNED,
  );
}

/**
 * When this run began, by the database's clock. The audit log is append-only
 * and is never cleaned, so every audit read below is limited to what this run
 * wrote; otherwise an earlier run's record would satisfy it.
 */
let runStarted: Date;

/** A confirmed Reservation arriving today and leaving tomorrow. */
async function arriving(
  unitId: string,
  propertyId = PROPERTY,
): Promise<string> {
  const reservationId = randomUUID();
  await owner.$executeRawUnsafe(
    `with guest as (
       insert into public.guests (organization_id, full_name)
       values ($2::uuid, 'Housekeeping Guest')
       returning id
     )
     insert into public.reservations
       (id, organization_id, property_id, accommodation_unit_id,
        guest_id, stay_type, status, starts_on, ends_on)
     select $1::uuid, $2::uuid, $3::uuid, $4::uuid, guest.id, 'guest', 'confirmed',
            (now() at time zone property.timezone)::date,
            (now() at time zone property.timezone)::date + 1
     from public.properties as property, guest
     where property.id = $3::uuid`,
    reservationId,
    ORG,
    propertyId,
    unitId,
  );
  return reservationId;
}

/** The same Reservation, checked in. */
async function inHouse(unitId: string, propertyId = PROPERTY): Promise<string> {
  const reservationId = await arriving(unitId, propertyId);
  const { stayId } = await reservations.checkIn(MEMBER, reservationId);
  return stayId;
}

/**
 * Every pending event, not only this file's: a dispatch pass claims a batch
 * across Organizations, and a leftover from another suite must not be the
 * thing that makes an assertion here pass.
 */
async function drain(): Promise<void> {
  for (;;) {
    const { claimed } = await dispatcher.dispatch(subscriptions);
    if (claimed === 0) return;
  }
}

interface StatusRow {
  status: string;
  changedBy: string | null;
  changedAt: Date;
}

async function statusOf(unitId: string): Promise<StatusRow | undefined> {
  const [row] = await owner.$queryRawUnsafe<StatusRow[]>(
    `select status, status_changed_by as "changedBy",
            status_changed_at as "changedAt"
       from public.housekeeping_unit_status
      where accommodation_unit_id = $1::uuid`,
    unitId,
  );
  return row;
}

beforeAll(async () => {
  const [clock] = await owner.$queryRawUnsafe<{ now: Date }[]>(
    "select now() as now",
  );
  runStarted = clock!.now;
  await seed();
  // A run that failed before its afterAll leaves statuses and settings
  // behind, and every test below starts from a room that has none.
  await owner.$executeRawUnsafe(
    `delete from public.housekeeping_unit_status where organization_id = $1::uuid`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `delete from public.housekeeping_settings where organization_id = $1::uuid`,
    ORG,
  );
  // Anything published before this file ran is delivered now, so each test
  // below starts with an empty queue of its own.
  await drain();
}, DATABASE_BUDGET_MS);

afterAll(async () => {
  for (const statement of [
    `delete from public.housekeeping_unit_status where organization_id = '${ORG}'`,
    `delete from public.housekeeping_settings where organization_id = '${ORG}'`,
    `delete from public.folios where organization_id = '${ORG}'`,
    `delete from public.stays where organization_id = '${ORG}'`,
    `delete from public.reservations where organization_id = '${ORG}'`,
    `delete from public.property_capabilities where organization_id = '${ORG}'`,
    `delete from public.property_assignments where organization_id = '${ORG}'`,
    `delete from public.organization_memberships where organization_id = '${ORG}'`,
    `delete from public.entitlements where organization_id = '${ORG}'`,
    `delete from public.subscriptions where organization_id = '${ORG}'`,
    `delete from outbox.deliveries where organization_id = '${ORG}'`,
    `delete from outbox.events where organization_id = '${ORG}'`,
    `delete from public.accommodation_units where organization_id = '${ORG}' and parent_id is not null`,
    `delete from public.accommodation_units where organization_id = '${ORG}'`,
    `delete from public.guests where organization_id = '${ORG}'`,
    `delete from public.properties where organization_id = '${ORG}'`,
    `delete from public.organizations where id = '${ORG}'`,
    `delete from public.users where id in ('${MEMBER}', '${FINANCE}', '${ASSIGNED}')`,
  ]) {
    await owner.$executeRawUnsafe(statement);
  }
  await owner.$disconnect();
  await workerDb.$disconnect();
  await prisma.$disconnect();
}, DATABASE_BUDGET_MS);

describe(
  "a departure makes the room dirty",
  { timeout: DATABASE_BUDGET_MS },
  () => {
    it("marks the room a Guest left, naming no Staff Member (HK-S1-01)", async () => {
      const stayId = await inHouse(ROOM);
      await reservations.checkOut(MEMBER, stayId);
      expect(await statusOf(ROOM)).toBeUndefined();

      await drain();

      const row = await statusOf(ROOM);
      expect(row?.status).toBe("dirty");
      expect(row?.changedBy).toBeNull();
    });

    it("changes nothing when the same departure is delivered again (HK-S1-04)", async () => {
      const before = await statusOf(ROOM);
      // Redelivery as the dispatcher would see it after a crash between the
      // handler and the commit of its bookkeeping: the delivery record gone and
      // the event claimable again.
      await owner.$executeRawUnsafe(
        `delete from outbox.deliveries
        where organization_id = $1::uuid
          and consumer = 'housekeeping.markRoomDirtyOnCheckOut'`,
        ORG,
      );
      await owner.$executeRawUnsafe(
        `update outbox.events
          set published_at = null, available_at = now(), claimed_until = null
        where organization_id = $1::uuid and event_type = 'stay.checked_out'`,
        ORG,
      );

      await drain();

      const after = await statusOf(ROOM);
      expect(after?.status).toBe("dirty");
      expect(after?.changedAt.getTime()).toBe(before?.changedAt.getTime());
    });

    it("keeps a status somebody changed after the Guest left (HK-S1-05)", async () => {
      const stayId = await inHouse(RACED_ROOM);
      await reservations.checkOut(MEMBER, stayId);
      // The desk is told the room is done before the worker gets to it.
      await owner.$executeRawUnsafe(
        `insert into public.housekeeping_unit_status
         (accommodation_unit_id, property_id, organization_id, status)
       values ($1::uuid, $2::uuid, $3::uuid, 'clean')`,
        RACED_ROOM,
        PROPERTY,
        ORG,
      );

      await drain();

      expect((await statusOf(RACED_ROOM))?.status).toBe("clean");
    });

    it("marks the room when a Guest leaves a bed in it (HK-S1-02)", async () => {
      const stayId = await inHouse(SHARED_BED);
      await reservations.checkOut(MEMBER, stayId);

      await drain();

      expect((await statusOf(SHARED_ROOM))?.status).toBe("dirty");
      expect(await statusOf(SHARED_BED)).toBeUndefined();
    });

    it("marks nothing where housekeeping is not available (HK-S1-09)", async () => {
      const stayId = await inHouse(UNSOLD_ROOM, NO_HOUSEKEEPING);
      await reservations.checkOut(MEMBER, stayId);

      await drain();

      expect(await statusOf(UNSOLD_ROOM)).toBeUndefined();
      const [delivered] = await owner.$queryRawUnsafe<{ published: boolean }[]>(
        `select event.published_at is not null as published
         from outbox.events as event
        where event.organization_id = $1::uuid
          and event.payload->>'stayId' = $2`,
        ORG,
        stayId,
      );
      // Delivered and done, rather than failing forever: an Organization that
      // never bought housekeeping is a normal state, not a broken event.
      expect(delivered?.published).toBe(true);
    });
  },
);

describe("marking rooms", { timeout: DATABASE_BUDGET_MS }, () => {
  async function auditOf(unitId: string) {
    return owner.$queryRawUnsafe<
      { actorId: string; context: { status: string; previousStatus: string } }[]
    >(
      `select actor_id as "actorId", context
         from audit.records
        where action = 'housekeeping.status_changed' and subject_id = $1::uuid
          and occurred_at >= $2
        order by occurred_at desc, id desc`,
      unitId,
      runStarted,
    );
  }

  it("marks one room and records what it replaced (HK-S2-01)", async () => {
    // ROOM is dirty from the departure above.
    await expect(
      housekeeping.markUnits(MEMBER, { unitIds: [ROOM], status: "clean" }),
    ).resolves.toEqual({ marked: 1 });

    const row = await statusOf(ROOM);
    expect(row?.status).toBe("clean");
    expect(row?.changedBy).toBe(MEMBER);
    const [latest] = await auditOf(ROOM);
    expect(latest?.actorId).toBe(MEMBER);
    expect(latest?.context).toMatchObject({
      status: "clean",
      previousStatus: "dirty",
    });
  });

  it("marks several rooms at once (HK-S2-02)", async () => {
    await expect(
      housekeeping.markUnits(MEMBER, {
        unitIds: [ROOM, RACED_ROOM, SHARED_ROOM],
        status: "inspected",
      }),
    ).resolves.toEqual({ marked: 3 });

    for (const unitId of [ROOM, RACED_ROOM, SHARED_ROOM]) {
      expect((await statusOf(unitId))?.status).toBe("inspected");
      const [latest] = await auditOf(unitId);
      expect(latest?.context.status).toBe("inspected");
    }
  });

  it("folds two beds of one room into one mark of the room (HK-S2-03)", async () => {
    await expect(
      housekeeping.markUnits(MEMBER, {
        unitIds: [SHARED_BED, SHARED_BED_B],
        status: "dirty",
      }),
    ).resolves.toEqual({ marked: 1 });

    expect((await statusOf(SHARED_ROOM))?.status).toBe("dirty");
    expect(await statusOf(SHARED_BED)).toBeUndefined();
  });

  it("undoes a mark by marking back, and repeats one harmlessly (HK-S2-05, HK-S2-06)", async () => {
    await housekeeping.markUnits(MEMBER, { unitIds: [ROOM], status: "dirty" });
    await housekeeping.markUnits(MEMBER, { unitIds: [ROOM], status: "dirty" });

    expect((await statusOf(ROOM))?.status).toBe("dirty");
    const [latest, before] = await auditOf(ROOM);
    expect(latest?.context.previousStatus).toBe("dirty");
    expect(before?.context.previousStatus).toBe("inspected");
  });

  it("refuses a Staff Member without the permission (HK-S2-04)", async () => {
    await expect(
      housekeeping.markUnits(FINANCE, { unitIds: [ROOM], status: "clean" }),
    ).rejects.toBeInstanceOf(HousekeepingRefusedError);
    expect((await statusOf(ROOM))?.status).toBe("dirty");
  });

  it("refuses the whole mark when one Unit cannot be seen (HK-S2-07)", async () => {
    await expect(
      housekeeping.markUnits(MEMBER, {
        unitIds: [ROOM, randomUUID()],
        status: "clean",
      }),
    ).rejects.toBeInstanceOf(HousekeepingRefusedError);
    expect((await statusOf(ROOM))?.status).toBe("dirty");
  });

  it("refuses a Property without housekeeping (HK-S2-08)", async () => {
    await expect(
      housekeeping.markUnits(MEMBER, {
        unitIds: [UNSOLD_ROOM],
        status: "clean",
      }),
    ).rejects.toBeInstanceOf(HousekeepingRefusedError);
  });

  it("refuses a malformed mark before touching the database (HK-S2-10)", async () => {
    await expect(
      housekeeping.markUnits(MEMBER, { unitIds: [], status: "clean" }),
    ).rejects.toBeInstanceOf(HousekeepingInputError);
    await expect(
      housekeeping.markUnits(MEMBER, {
        unitIds: Array.from({ length: 61 }, () => randomUUID()),
        status: "clean",
      }),
    ).rejects.toBeInstanceOf(HousekeepingInputError);
    await expect(
      housekeeping.markUnits(MEMBER, { unitIds: [ROOM], status: "sparkling" }),
    ).rejects.toBeInstanceOf(HousekeepingInputError);
    // Counted as sent, not after duplicates collapse.
    await expect(
      housekeeping.markUnits(MEMBER, {
        unitIds: Array.from({ length: 61 }, () => ROOM),
        status: "clean",
      }),
    ).rejects.toBeInstanceOf(HousekeepingInputError);
  });
});

describe("the board", { timeout: DATABASE_BUDGET_MS }, () => {
  it("lists every room once, with its status, readiness and counts (HK-S1-13)", async () => {
    const board = await housekeeping.board(MEMBER, PROPERTY);

    // Three rooms carry a status by now; the three the check-in tests use
    // below have none yet, and a room with no row reads clean and ready.
    expect(board.rooms.map((room) => room.name)).toEqual([
      "HKI-101",
      "HKI-102",
      "HKI-103",
      "HKI-104",
      "HKI-105",
      "HKI-106",
      "HKI-D1",
    ]);
    // The bed with no room is a row of its own; the beds under HKI-103 are not.
    expect(board.rooms.find((room) => room.unitId === LONE_BED)).toMatchObject({
      bedCount: 0,
      status: "clean",
      ready: true,
    });
    const shared = board.rooms.find((room) => room.unitId === SHARED_ROOM);
    expect(shared).toMatchObject({
      bedCount: 2,
      status: "dirty",
      ready: false,
    });
    const raced = board.rooms.find((room) => room.unitId === RACED_ROOM);
    expect(raced).toMatchObject({ status: "inspected", ready: true });
    expect(board.counts).toMatchObject({
      rooms: 7,
      dirty: 2,
      clean: 4,
      inspected: 1,
      ready: 5,
    });
    expect(board.mayMark).toBe(true);
  });

  it("says who may not mark, and still shows them the rooms (HK-S2-12)", async () => {
    const board = await housekeeping.board(FINANCE, PROPERTY);
    expect(board.rooms).toHaveLength(7);
    expect(board.mayMark).toBe(false);
  });

  it("is empty at a Property the reader does not reach (HK-S1-14)", async () => {
    const board = await housekeeping.board(ASSIGNED, PROPERTY);
    expect(board.rooms).toEqual([]);
  });

  it("is empty while the Subscription is lapsed (HK-S1-15)", async () => {
    await owner.$executeRawUnsafe(
      `update public.subscriptions set status = 'past_due' where organization_id = $1::uuid`,
      ORG,
    );
    try {
      const board = await housekeeping.board(MEMBER, PROPERTY);
      expect(board.rooms).toEqual([]);
    } finally {
      await owner.$executeRawUnsafe(
        `update public.subscriptions set status = 'active' where organization_id = $1::uuid`,
        ORG,
      );
    }
  });

  it("is empty where housekeeping is not available (HK-S1-15)", async () => {
    const board = await housekeeping.board(MEMBER, NO_HOUSEKEEPING);
    expect(board.rooms).toEqual([]);
    expect(board.counts.rooms).toBe(0);
  });
});

describe(
  "checking into a room that is not ready",
  { timeout: DATABASE_BUDGET_MS },
  () => {
    async function checkInRecord(reservationId: string) {
      const [row] = await owner.$queryRawUnsafe<
        { context: Record<string, unknown> }[]
      >(
        `select context from audit.records
        where action = 'reservation.checked_in' and subject_id = $1::uuid`,
        reservationId,
      );
      return row?.context;
    }

    async function reservationStatus(reservationId: string) {
      const [row] = await owner.$queryRawUnsafe<{ status: string }[]>(
        `select status from public.reservations where id = $1::uuid`,
        reservationId,
      );
      return row?.status;
    }

    it("asks first, and writes nothing until asked (HK-S2-14)", async () => {
      await housekeeping.markUnits(MEMBER, {
        unitIds: [DIRTY_ARRIVAL],
        status: "dirty",
      });
      const reservationId = await arriving(DIRTY_ARRIVAL);

      const arrival = (await reservations.listArrivals(MEMBER, PROPERTY)).find(
        (row) => row.reservationId === reservationId,
      );
      expect(arrival?.unitIsReady).toBe(false);

      await expect(
        reservations.checkIn(MEMBER, reservationId),
      ).rejects.toBeInstanceOf(UnitNotReadyError);
      expect(await reservationStatus(reservationId)).toBe("confirmed");
    });

    it("checks in anyway once told to, records it, and leaves the room dirty (HK-S2-15)", async () => {
      const [reservation] = await owner.$queryRawUnsafe<{ id: string }[]>(
        `select id from public.reservations
        where accommodation_unit_id = $1::uuid and status = 'confirmed'`,
        DIRTY_ARRIVAL,
      );

      await reservations.checkIn(MEMBER, reservation!.id, {
        readinessAcknowledged: true,
      });

      expect(await reservationStatus(reservation!.id)).toBe("checked_in");
      expect(await checkInRecord(reservation!.id)).toMatchObject({
        roomWasNotReady: true,
      });
      expect((await statusOf(DIRTY_ARRIVAL))?.status).toBe("dirty");
    });

    it("asks nothing about a ready room (HK-S2-16)", async () => {
      const reservationId = await arriving(CLEAN_ARRIVAL);

      await reservations.checkIn(MEMBER, reservationId);

      const context = await checkInRecord(reservationId);
      expect(context).toBeDefined();
      expect(context).not.toHaveProperty("roomWasNotReady");
    });

    it("does not claim a room was dirty when it was cleaned before the confirmation (HK-S2-17)", async () => {
      await housekeeping.markUnits(MEMBER, {
        unitIds: [CLEANED_MEANWHILE],
        status: "dirty",
      });
      const reservationId = await arriving(CLEANED_MEANWHILE);
      await expect(
        reservations.checkIn(MEMBER, reservationId),
      ).rejects.toBeInstanceOf(UnitNotReadyError);

      // Somebody marks it clean while the desk is reading the warning.
      await housekeeping.markUnits(MEMBER, {
        unitIds: [CLEANED_MEANWHILE],
        status: "clean",
      });
      await reservations.checkIn(MEMBER, reservationId, {
        readinessAcknowledged: true,
      });

      expect(await checkInRecord(reservationId)).not.toHaveProperty(
        "roomWasNotReady",
      );
    });
  },
);

describe("a blocked room", { timeout: DATABASE_BUDGET_MS }, () => {
  it("keeps its housekeeping status through a block and an unblock (HK-S1-18)", async () => {
    await housekeeping.markUnits(MEMBER, {
      unitIds: [RACED_ROOM],
      status: "dirty",
    });

    await accommodation.blockUnit(MEMBER, RACED_ROOM, "burst pipe");
    const blocked = (await housekeeping.board(MEMBER, PROPERTY)).rooms.find(
      (room) => room.unitId === RACED_ROOM,
    );
    expect(blocked).toMatchObject({ status: "dirty", outOfService: true });

    await accommodation.unblockUnit(MEMBER, RACED_ROOM);
    const unblocked = (await housekeeping.board(MEMBER, PROPERTY)).rooms.find(
      (room) => room.unitId === RACED_ROOM,
    );
    expect(unblocked).toMatchObject({ status: "dirty", outOfService: false });
  });
});

describe(
  "checking rooms after cleaning",
  { timeout: DATABASE_BUDGET_MS },
  () => {
    async function inspectionRecords() {
      return owner.$queryRawUnsafe<
        { subjectType: string; context: { from: string; to: string } }[]
      >(
        `select subject_type as "subjectType", context
         from audit.records
        where action = 'housekeeping.inspection_set'
          and organization_id = $1::uuid and occurred_at >= $2
        order by occurred_at desc, id desc`,
        ORG,
        runStarted,
      );
    }

    it("says what applies and who may change it (HK-S3-09)", async () => {
      expect(await housekeeping.inspectionSettings(MEMBER, PROPERTY)).toEqual({
        organizationDefault: false,
        propertyOverride: null,
        effective: false,
        mayConfigure: true,
        mayConfigureDefault: true,
      });
      expect(
        await housekeeping.inspectionSettings(FINANCE, PROPERTY),
      ).toMatchObject({ mayConfigure: false, mayConfigureDefault: false });
      expect(
        await housekeeping.inspectionSettings(MEMBER, NO_HOUSEKEEPING),
      ).toBeNull();
    });

    it("switching it on changes what ready means and no room's status (HK-S3-01, HK-S3-06, HK-S3-08)", async () => {
      await housekeeping.markUnits(MEMBER, {
        unitIds: [CLEAN_ARRIVAL],
        status: "clean",
      });
      const before = await statusOf(CLEAN_ARRIVAL);

      await housekeeping.setOrganizationInspection(MEMBER, PROPERTY, true);

      const room = (await housekeeping.board(MEMBER, PROPERTY)).rooms.find(
        (entry) => entry.unitId === CLEAN_ARRIVAL,
      );
      expect(room).toMatchObject({ status: "clean", ready: false });
      const after = await statusOf(CLEAN_ARRIVAL);
      expect(after?.changedAt.getTime()).toBe(before?.changedAt.getTime());

      const [latest] = await inspectionRecords();
      expect(latest).toMatchObject({
        subjectType: "organization",
        context: { from: "off", to: "on" },
      });

      // A room never marked is clean too, and waits the same way (HK-S3-11).
      const unmarked = (await housekeeping.board(MEMBER, PROPERTY)).rooms.find(
        (entry) => entry.unitId === LONE_BED,
      );
      expect(unmarked).toMatchObject({ status: "clean", ready: false });
    });

    it("changing an existing default records what it was (HK-S3-08)", async () => {
      await housekeeping.setOrganizationInspection(MEMBER, PROPERTY, false);
      const [latest] = await inspectionRecords();
      expect(latest).toMatchObject({ context: { from: "on", to: "off" } });
      await housekeeping.setOrganizationInspection(MEMBER, PROPERTY, true);
    });

    it("a Property's own answer wins, and resetting it follows the default again (HK-S3-02, HK-S3-10)", async () => {
      await housekeeping.setPropertyInspection(MEMBER, PROPERTY, false);
      expect(
        await housekeeping.inspectionSettings(MEMBER, PROPERTY),
      ).toMatchObject({ propertyOverride: false, effective: false });

      await housekeeping.setPropertyInspection(MEMBER, PROPERTY, null);
      expect(
        await housekeeping.inspectionSettings(MEMBER, PROPERTY),
      ).toMatchObject({ propertyOverride: null, effective: true });

      const [reset, override] = await inspectionRecords();
      expect(reset).toMatchObject({
        subjectType: "property",
        context: { from: "off", to: "default" },
      });
      expect(override).toMatchObject({
        context: { from: "default", to: "off" },
      });
    });

    it("refuses somebody without accommodation.configure (HK-S3-07)", async () => {
      await expect(
        housekeeping.setPropertyInspection(FINANCE, PROPERTY, false),
      ).rejects.toBeInstanceOf(HousekeepingRefusedError);
      await expect(
        housekeeping.setOrganizationInspection(FINANCE, PROPERTY, false),
      ).rejects.toBeInstanceOf(HousekeepingRefusedError);
    });
  },
);
