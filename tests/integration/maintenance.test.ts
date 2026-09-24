/**
 * Maintenance against a real database (RANZ-33, ADR 0032).
 *
 * The pgTAP suite proves the policies, triggers and the worker function one
 * statement at a time. This proves the paths they sit on: the module's
 * commands on ranza_app, the Unit's status kept in step with the holds, the
 * booking and check-in doors that read it, and a real dispatcher on
 * ranza_worker bringing a returned room back as the setting says.
 *
 * Breaks that were run, and what went red:
 *   the Unit lock removed from releaseWithin      MT-S2-12
 *   the impact check skipped in takeOutOfOrder     MT-S2-09, MT-S2-10
 *   the done move never releasing                  MT-S2-14
 *   the release in cancel removed                  MT-S2-16
 *   the stale check removed from move              MT-S1-14
 *   the handler left out of subscriptions          MT-S2-17
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPrismaClient,
  withOrganizationContext,
} from "../../packages/db/src";
import { createOutboxDispatcher } from "../../packages/platform/outbox/src";
import { lockUnitWithin } from "../../packages/ranza/accommodation/src";
import { createHousekeepingModule } from "../../packages/ranza/housekeeping/src";
import {
  AssigneeOutOfReachError,
  AssigneeRequiredError,
  createMaintenanceModule,
  MaintenanceInputError,
  MaintenanceRefusedError,
  OutOfOrderImpactError,
  ReleaseNeedsPermissionError,
  RequestMovedError,
  UnitBlockedError,
} from "../../packages/ranza/maintenance/src";
import {
  createReservationsModule,
  ReservationRefusedError,
  UnitNotInServiceError,
} from "../../packages/ranza/reservations/src";
import { roomReturnedSubscription } from "../../apps/worker/src/outbox/room-returned";
import { subscriptions } from "../../apps/worker/src/outbox/subscriptions";

const ORG = "dd000002-0000-4000-8000-000000000001";
const PROPERTY = "dd000003-0000-4000-8000-000000000001";
const ELSEWHERE_PROPERTY = "dd000003-0000-4000-8000-000000000002";
const FAR_PROPERTY = "dd000003-0000-4000-8000-000000000003";

const MANAGER = "dd000001-0000-4000-8000-000000000001";
const DESK = "dd000001-0000-4000-8000-000000000002";
const FINANCE = "dd000001-0000-4000-8000-000000000003";
const ELSEWHERE = "dd000001-0000-4000-8000-000000000004";
const TECHNICIAN = "dd000001-0000-4000-8000-000000000005";

const unit = (n: number) =>
  `dd000004-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const ROOM = unit(1);
const SHARED_ROOM = unit(2);
const SHARED_BED_A = unit(3);
const SHARED_BED_B = unit(4);
const OCCUPIED_ROOM = unit(5);
const BLOCKED_ROOM = unit(6);
const CONTESTED_ROOM = unit(7);
const RETURNING_ROOM = unit(8);
const BOOKED_ROOM = unit(9);
const TWICE_HELD_ROOM = unit(10);
const CONFIRMED_ROOM = unit(11);
const FAR_ROOM = unit(12);
const ELSEWHERE_ROOM = unit(13);
const JUST_LEFT_ROOM = unit(14);

// ranza_app for Staff Members, exactly as the host composes it, and
// ranza_worker for the dispatcher, exactly as apps/worker does.
const prisma = createPrismaClient(process.env.DATABASE_URL!);
const maintenance = createMaintenanceModule({ db: prisma });
const reservations = createReservationsModule({ db: prisma });
const housekeeping = createHousekeepingModule({ db: prisma });
const workerDb = createPrismaClient(process.env.WORKER_DATABASE_URL!);
const dispatcher = createOutboxDispatcher({ db: workerDb });
const owner = createPrismaClient(process.env.DIRECT_URL!);

const DATABASE_BUDGET_MS = 60_000;

/** Fixtures go in as the owner: ranza_app may not create Properties or Units. */
async function seed() {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1, 'mti-manager@example.test'), ($2, 'mti-desk@example.test'),
       ($3, 'mti-finance@example.test'), ($4, 'mti-elsewhere@example.test'),
       ($5, 'mti-technician@example.test')
     on conflict (id) do nothing`,
    MANAGER,
    DESK,
    FINANCE,
    ELSEWHERE,
    TECHNICIAN,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status)
     values ($1, 'Maintenance Integration', 'active') on conflict (id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name, timezone) values
       ($1, $4, 'Maintenance Property', 'Europe/Istanbul'),
       ($2, $4, 'Maintenance Elsewhere Property', 'Europe/Istanbul'),
       ($3, $4, 'Maintenance Far Property', 'Pacific/Pago_Pago')
     on conflict (id) do nothing`,
    PROPERTY,
    ELSEWHERE_PROPERTY,
    FAR_PROPERTY,
    ORG,
  );
  const rooms: [string, string, string][] = [
    [ROOM, "MTI-101", PROPERTY],
    [SHARED_ROOM, "MTI-102", PROPERTY],
    [OCCUPIED_ROOM, "MTI-103", PROPERTY],
    [BLOCKED_ROOM, "MTI-104", PROPERTY],
    [CONTESTED_ROOM, "MTI-105", PROPERTY],
    [RETURNING_ROOM, "MTI-106", PROPERTY],
    [BOOKED_ROOM, "MTI-107", PROPERTY],
    [TWICE_HELD_ROOM, "MTI-108", PROPERTY],
    [CONFIRMED_ROOM, "MTI-109", PROPERTY],
    [JUST_LEFT_ROOM, "MTI-110", PROPERTY],
    [FAR_ROOM, "MTI-301", FAR_PROPERTY],
    [ELSEWHERE_ROOM, "MTI-201", ELSEWHERE_PROPERTY],
  ];
  for (const [id, name, property] of rooms) {
    await owner.$executeRawUnsafe(
      `insert into public.accommodation_units
         (id, property_id, organization_id, name, unit_type, capacity)
       values ($1, $2, $3, $4, 'room', 2) on conflict (id) do nothing`,
      id,
      property,
      ORG,
      name,
    );
  }
  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units
       (id, property_id, organization_id, parent_id, parent_unit_type, name, unit_type, capacity)
     values ($1, $3, $4, $5, 'room', 'A', 'bed', 1),
            ($2, $3, $4, $5, 'room', 'B', 'bed', 1)
     on conflict (id) do nothing`,
    SHARED_BED_A,
    SHARED_BED_B,
    PROPERTY,
    ORG,
    SHARED_ROOM,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status)
     values ($1, 'active') on conflict (organization_id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key, status) values
       ($1, 'maintenance', 'active'), ($1, 'front_office', 'active'),
       ($1, 'housekeeping', 'active')
     on conflict (organization_id, module_key) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled) values
       ($1, $4, 'maintenance', true), ($1, $4, 'front_desk', true),
       ($1, $4, 'housekeeping', true), ($2, $4, 'front_desk', true),
       ($3, $4, 'maintenance', true)
     on conflict (property_id, capability_key) do nothing`,
    PROPERTY,
    ELSEWHERE_PROPERTY,
    FAR_PROPERTY,
    ORG,
  );
  // A technician who works the board and may not return rooms.
  await owner.$executeRawUnsafe(
    `insert into public.staff_roles (scope_id, key, organization_id, name, permissions)
     values ($1, 'technician', $1, 'Technician',
             array['maintenance.report', 'maintenance.manage'])
     on conflict do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, role_scope_id, access_scope) values
       ($1, $2, 'manager', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
       ($1, $3, 'front_desk', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
       ($1, $4, 'finance', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
       ($1, $5, 'manager', '00000000-0000-0000-0000-000000000000', 'assigned_properties'),
       ($1, $6, 'technician', $1, 'organization_wide')
     on conflict (organization_id, user_id) do nothing`,
    ORG,
    MANAGER,
    DESK,
    FINANCE,
    ELSEWHERE,
    TECHNICIAN,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_assignments (property_id, organization_id, user_id)
     values ($1, $2, $3) on conflict do nothing`,
    ELSEWHERE_PROPERTY,
    ORG,
    ELSEWHERE,
  );
}

/** When this run began: the audit log is append-only and never cleaned. */
let runStarted: Date;

async function statusOf(unitId: string): Promise<string> {
  const [row] = await owner.$queryRawUnsafe<{ status: string }[]>(
    "select status from public.accommodation_units where id = $1::uuid",
    unitId,
  );
  return row!.status;
}

async function holding(requestId: string): Promise<boolean> {
  const [row] = await owner.$queryRawUnsafe<{ held: boolean }[]>(
    `select exists (select 1 from public.maintenance_unit_holds
                     where request_id = $1::uuid and returned_at is null) as held`,
    requestId,
  );
  return row!.held;
}

async function audited(action: string, subjectId: string) {
  return owner.$queryRawUnsafe<{ reason: string | null; context: unknown }[]>(
    `select reason, context from audit.records
      where action = $1 and subject_id = $2::uuid and occurred_at >= $3
      order by occurred_at desc, id desc`,
    action,
    subjectId,
    runStarted,
  );
}

async function drain(): Promise<void> {
  for (;;) {
    const { claimed } = await dispatcher.dispatch(subscriptions);
    if (claimed === 0) return;
  }
}

/**
 * Waits until another session is blocked on a lock matching `wait`, rather
 * than trusting a sleep: on a loaded machine a sleep is either too short or
 * wasted. `wait` is a predicate over pg_stat_activity.
 */
async function untilWaiting(wait: string, what: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const [waiting] = await owner.$queryRawUnsafe<{ count: number }[]>(
      `select count(*)::int as count from pg_stat_activity
        where wait_event_type = 'Lock' and ${wait}`,
    );
    if ((waiting?.count ?? 0) > 0) return;
    if (Date.now() > deadline) throw new Error(`${what} never waited`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** A promise and the function that settles it, to hold a transaction open. */
function gate(): { opened: Promise<void>; open: () => void } {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

async function settle(values: {
  assigneeRequired?: boolean | null;
  returnOnDone?: boolean | null;
  returnAs?: "dirty" | "clean" | "inspected" | null;
}) {
  await maintenance.setPropertySettings(MANAGER, PROPERTY, {
    assigneeRequired: values.assigneeRequired ?? null,
    returnOnDone: values.returnOnDone ?? null,
    returnAs: values.returnAs ?? null,
  });
}

/**
 * A check-out as a desk confirms it: no Folio to review here, and the Guest
 * leaving before the planned last night is acknowledged (ADR 0030).
 */
const REVIEWED = {
  folioVersion: null,
  earlyDeparture: true,
  balanceReason: null,
} as const;

/** A confirmed Reservation from today, for `nights` nights. */
async function booked(unitId: string, nights = 2): Promise<string> {
  const reservationId = randomUUID();
  await owner.$executeRawUnsafe(
    `with guest as (
       insert into public.guests (organization_id, full_name)
       values ($2::uuid, 'Maintenance Guest') returning id
     )
     insert into public.reservations
       (id, organization_id, property_id, accommodation_unit_id,
        guest_id, stay_type, status, starts_on, ends_on)
     select $1::uuid, $2::uuid, $3::uuid, $4::uuid, guest.id, 'guest', 'confirmed',
            app.property_today($3::uuid), app.property_today($3::uuid) + $5::int
       from guest`,
    reservationId,
    ORG,
    PROPERTY,
    unitId,
    nights,
  );
  return reservationId;
}

function report(
  userId: string,
  unitId: string,
  extra: Partial<Parameters<typeof maintenance.report>[1]> = {},
) {
  return maintenance.report(userId, {
    propertyId: PROPERTY,
    unitId,
    title: `A problem in ${unitId.slice(-4)}`,
    priority: "this_week",
    ...extra,
  });
}

beforeAll(async () => {
  const [clock] = await owner.$queryRawUnsafe<{ now: Date }[]>(
    "select now() as now",
  );
  runStarted = clock!.now;
  await seed();
  await drain();
}, DATABASE_BUDGET_MS);

afterAll(async () => {
  for (const statement of [
    `delete from public.maintenance_unit_holds where organization_id = '${ORG}'`,
    `delete from public.maintenance_requests where organization_id = '${ORG}'`,
    `delete from public.maintenance_settings where organization_id = '${ORG}'`,
    `delete from public.housekeeping_unit_status where organization_id = '${ORG}'`,
    `delete from public.folios where organization_id = '${ORG}'`,
    `delete from public.stays where organization_id = '${ORG}'`,
    `delete from public.reservations where organization_id = '${ORG}'`,
    `delete from public.property_capabilities where organization_id = '${ORG}'`,
    `delete from public.property_assignments where organization_id = '${ORG}'`,
    `delete from public.organization_memberships where organization_id = '${ORG}'`,
    `delete from public.staff_roles where organization_id = '${ORG}'`,
    `delete from public.entitlements where organization_id = '${ORG}'`,
    `delete from public.subscriptions where organization_id = '${ORG}'`,
    `delete from outbox.deliveries where organization_id = '${ORG}'`,
    `delete from outbox.events where organization_id = '${ORG}'`,
    `delete from public.accommodation_units where organization_id = '${ORG}' and parent_id is not null`,
    `delete from public.accommodation_units where organization_id = '${ORG}'`,
    `delete from public.guests where organization_id = '${ORG}'`,
    `delete from public.properties where organization_id = '${ORG}'`,
    `delete from public.organizations where id = '${ORG}'`,
    `delete from public.users where id in ('${MANAGER}', '${DESK}', '${FINANCE}', '${ELSEWHERE}', '${TECHNICIAN}')`,
  ]) {
    await owner.$executeRawUnsafe(statement);
  }
  await owner.$disconnect();
  await workerDb.$disconnect();
  await prisma.$disconnect();
}, DATABASE_BUDGET_MS);

describe("reporting and the board", { timeout: DATABASE_BUDGET_MS }, () => {
  it("reports a problem as new, numbered and audited (MT-S1-01)", async () => {
    const { requestId, number } = await report(DESK, ROOM, {
      title: "The tap drips",
    });
    expect(number).toBeGreaterThan(0);
    const board = await maintenance.board(DESK, PROPERTY);
    const card = board.requests.find(
      (request) => request.requestId === requestId,
    );
    expect(card).toMatchObject({
      status: "new",
      title: "The tap drips",
      number,
    });
    expect(card?.reporter.email).toBe("mti-desk@example.test");
    expect(
      await audited("maintenance_request.reported", requestId),
    ).toHaveLength(1);
  });

  it("numbers two reports made at the same moment one after the other (MT-S1-02)", async () => {
    const [first, second] = await Promise.all([
      report(DESK, ROOM, { title: "Simultaneous one" }),
      report(MANAGER, ROOM, { title: "Simultaneous two" }),
    ]);
    expect(Math.abs(first.number - second.number)).toBe(1);
  });

  it("refuses a title out of bounds before any statement runs (MT-S1-09)", async () => {
    await expect(report(DESK, ROOM, { title: " ab " })).rejects.toBeInstanceOf(
      MaintenanceInputError,
    );
  });

  it("shows nothing to a Staff Member without reach, and refuses their report (MT-S1-06)", async () => {
    const board = await maintenance.board(ELSEWHERE, PROPERTY);
    expect(board.requests).toHaveLength(0);
    expect(board.mayReport).toBe(false);
    await expect(report(ELSEWHERE, ROOM)).rejects.toBeInstanceOf(
      MaintenanceRefusedError,
    );
  });

  it("shows nothing where maintenance is not available (MT-S1-05)", async () => {
    const board = await maintenance.board(MANAGER, ELSEWHERE_PROPERTY);
    expect(board.requests).toHaveLength(0);
    expect(board.mayManage).toBe(false);
  });

  it("says what the reader may do, and counts by state (MT-S1-10)", async () => {
    const desk = await maintenance.board(DESK, PROPERTY);
    expect(desk).toMatchObject({
      mayReport: true,
      mayManage: false,
      mayTakeOutOfOrder: true,
    });
    const manager = await maintenance.board(MANAGER, PROPERTY);
    expect(manager.mayManage).toBe(true);
    expect(manager.counts.new).toBe(
      manager.requests.filter((request) => request.status === "new").length,
    );
  });
});

describe("working the board", { timeout: DATABASE_BUDGET_MS }, () => {
  it("moves a request and audits where it left (MT-S1-11)", async () => {
    const { requestId } = await report(DESK, ROOM);
    await maintenance.move(MANAGER, {
      requestId,
      from: "new",
      to: "waiting_for_parts",
    });
    const [record] = await audited("maintenance_request.moved", requestId);
    expect(record?.context).toMatchObject({
      from: "new",
      to: "waiting_for_parts",
    });
  });

  it("changes nothing when a request is moved to where it is (MT-S1-13)", async () => {
    const { requestId } = await report(DESK, ROOM);
    await maintenance.move(MANAGER, { requestId, from: "new", to: "new" });
    expect(await audited("maintenance_request.moved", requestId)).toHaveLength(
      0,
    );
  });

  it("refuses a move from a state the request has left, naming where it is (MT-S1-14)", async () => {
    const { requestId } = await report(DESK, ROOM);
    await maintenance.move(MANAGER, { requestId, from: "new", to: "done" });
    const stale = maintenance.move(MANAGER, {
      requestId,
      from: "new",
      to: "in_progress",
    });
    await expect(stale).rejects.toBeInstanceOf(RequestMovedError);
    await expect(stale).rejects.toMatchObject({ current: "done" });
  });

  it("refuses a move without maintenance.manage (MT-S1-12)", async () => {
    const { requestId } = await report(DESK, ROOM);
    await expect(
      maintenance.move(DESK, { requestId, from: "new", to: "in_progress" }),
    ).rejects.toBeInstanceOf(MaintenanceRefusedError);
  });

  it("cancels with a reason and reopens as new (MT-S1-15, MT-S1-17)", async () => {
    const { requestId } = await report(DESK, ROOM);
    await expect(
      maintenance.cancel(MANAGER, { requestId, from: "new", reason: "x" }),
    ).rejects.toBeInstanceOf(MaintenanceInputError);
    await maintenance.cancel(MANAGER, {
      requestId,
      from: "new",
      reason: "reported twice",
    });
    await maintenance.move(MANAGER, {
      requestId,
      from: "cancelled",
      to: "new",
    });
    const card = (await maintenance.board(MANAGER, PROPERTY)).requests.find(
      (request) => request.requestId === requestId,
    );
    expect(card).toMatchObject({ status: "new", cancelReason: null });
  });

  it("assigns somebody who reaches the Property, and no one else (MT-S1-18, MT-S1-19)", async () => {
    const { requestId } = await report(DESK, ROOM);
    await expect(
      maintenance.assign(MANAGER, { requestId, assigneeId: ELSEWHERE }),
    ).rejects.toBeInstanceOf(AssigneeOutOfReachError);
    await maintenance.assign(MANAGER, { requestId, assigneeId: DESK });
    const [record] = await audited("maintenance_request.assigned", requestId);
    expect(record?.context).toMatchObject({ from: null, to: DESK });
  });

  it("marks an assignee whose reach was taken away (MT-S1-20)", async () => {
    const { requestId } = await report(DESK, ROOM);
    await maintenance.assign(MANAGER, { requestId, assigneeId: FINANCE });
    await owner.$executeRawUnsafe(
      `update public.organization_memberships set access_scope = 'assigned_properties'
        where organization_id = $1::uuid and user_id = $2::uuid`,
      ORG,
      FINANCE,
    );
    try {
      const card = (await maintenance.board(MANAGER, PROPERTY)).requests.find(
        (request) => request.requestId === requestId,
      );
      expect(card?.assignee).toMatchObject({
        userId: FINANCE,
        reachesProperty: false,
      });
      const { assignees } = await maintenance.reportOptions(MANAGER, PROPERTY);
      expect(assignees.map((assignee) => assignee.userId)).not.toContain(
        FINANCE,
      );
    } finally {
      await owner.$executeRawUnsafe(
        `update public.organization_memberships set access_scope = 'organization_wide'
          where organization_id = $1::uuid and user_id = $2::uuid`,
        ORG,
        FINANCE,
      );
    }
  });

  it("changes a priority and audits it (MT-S1-21)", async () => {
    const { requestId } = await report(DESK, ROOM, { priority: "can_wait" });
    await maintenance.prioritise(MANAGER, { requestId, priority: "urgent" });
    const [record] = await audited(
      "maintenance_request.prioritised",
      requestId,
    );
    expect(record?.context).toMatchObject({ from: "can_wait", to: "urgent" });
  });
});

describe("out of order", { timeout: DATABASE_BUDGET_MS }, () => {
  it("takes a room out of order when reporting, in one transaction (MT-S2-01, MT-S2-05)", async () => {
    const { requestId } = await report(DESK, ROOM, {
      outOfOrder: { acknowledged: false },
    });
    expect(await statusOf(ROOM)).toBe("out_of_service");
    expect(await holding(requestId)).toBe(true);
    expect(await audited("unit.taken_out_of_order", ROOM)).not.toHaveLength(0);
    await maintenance.returnToService(DESK, { requestId });
    expect(await statusOf(ROOM)).toBe("available");
  });

  it("refuses the whole report when the reporter may not take it out of order (MT-S2-03)", async () => {
    const before = (await maintenance.board(MANAGER, PROPERTY)).requests.length;
    await expect(
      report(FINANCE, ROOM, { outOfOrder: { acknowledged: true } }),
    ).rejects.toBeInstanceOf(MaintenanceRefusedError);
    expect((await maintenance.board(MANAGER, PROPERTY)).requests).toHaveLength(
      before,
    );
    expect(await statusOf(ROOM)).toBe("available");
  });

  it("covers every bed of a room out of order, and only that room (MT-S2-06, MT-S2-07)", async () => {
    const { requestId } = await report(DESK, SHARED_ROOM, {
      outOfOrder: { acknowledged: true },
    });
    const bookable = (await reservations.listBookableUnits(DESK, PROPERTY)).map(
      (unitRow) => unitRow.unitId,
    );
    expect(bookable).not.toContain(SHARED_BED_A);
    expect(bookable).not.toContain(SHARED_BED_B);
    expect(bookable).toContain(ROOM);
    await maintenance.returnToService(DESK, { requestId });

    const bed = await report(DESK, SHARED_BED_A, {
      outOfOrder: { acknowledged: true },
    });
    const afterBed = (await reservations.listBookableUnits(DESK, PROPERTY)).map(
      (unitRow) => unitRow.unitId,
    );
    expect(afterBed).not.toContain(SHARED_BED_A);
    expect(afterBed).toContain(SHARED_BED_B);
    await maintenance.returnToService(DESK, { requestId: bed.requestId });
  });

  it("refuses to take a blocked room out of order, and reports it all the same (MT-S2-08)", async () => {
    await owner.$executeRawUnsafe(
      `update public.accommodation_units set status = 'blocked', status_reason = 'renovation'
        where id = $1::uuid`,
      BLOCKED_ROOM,
    );
    await expect(
      report(MANAGER, BLOCKED_ROOM, { outOfOrder: { acknowledged: true } }),
    ).rejects.toBeInstanceOf(UnitBlockedError);
    const { requestId } = await report(MANAGER, BLOCKED_ROOM);
    expect(await holding(requestId)).toBe(false);
  });

  it("asks before taking out a room somebody is in, and check-out still works (MT-S2-09)", async () => {
    const reservationId = await booked(OCCUPIED_ROOM, 2);
    const { stayId } = await reservations.checkIn(MANAGER, reservationId, {
      readinessAcknowledged: true,
    });
    const { requestId } = await report(DESK, OCCUPIED_ROOM);

    const asked = maintenance.takeOutOfOrder(DESK, {
      requestId,
      acknowledged: false,
    });
    await expect(asked).rejects.toBeInstanceOf(OutOfOrderImpactError);
    await expect(asked).rejects.toMatchObject({
      impact: {
        inHouse: [{ unitName: "MTI-103", guestName: "Maintenance Guest" }],
      },
    });
    expect(await holding(requestId)).toBe(false);

    await maintenance.takeOutOfOrder(DESK, { requestId, acknowledged: true });
    expect(await statusOf(OCCUPIED_ROOM)).toBe("out_of_service");
    await expect(
      reservations.checkOut(MANAGER, stayId, REVIEWED),
    ).resolves.toBeDefined();
    await maintenance.returnToService(DESK, { requestId });
  });

  it("lists the bookings on its nights, cancels none, and refuses their check-in (MT-S2-10, MT-S2-29)", async () => {
    const reservationId = await booked(BOOKED_ROOM, 3);
    const { requestId } = await report(DESK, BOOKED_ROOM);
    await expect(
      maintenance.takeOutOfOrder(DESK, { requestId, acknowledged: false }),
    ).rejects.toMatchObject({
      impact: { reservations: [{ unitName: "MTI-107" }] },
    });
    await maintenance.takeOutOfOrder(DESK, { requestId, acknowledged: true });

    const [row] = await owner.$queryRawUnsafe<{ status: string }[]>(
      "select status from public.reservations where id = $1::uuid",
      reservationId,
    );
    expect(row?.status).toBe("confirmed");
    await expect(
      reservations.checkIn(MANAGER, reservationId, {
        readinessAcknowledged: true,
      }),
    ).rejects.toBeInstanceOf(UnitNotInServiceError);
    await maintenance.returnToService(DESK, { requestId });
  });

  it("keeps a room out while any request holds it (MT-S2-11)", async () => {
    const first = await report(DESK, TWICE_HELD_ROOM, {
      outOfOrder: { acknowledged: true },
    });
    const second = await report(DESK, TWICE_HELD_ROOM, {
      outOfOrder: { acknowledged: true },
    });
    await expect(
      maintenance.returnToService(DESK, { requestId: first.requestId }),
    ).resolves.toEqual({ returned: false });
    expect(await statusOf(TWICE_HELD_ROOM)).toBe("out_of_service");
    await expect(
      maintenance.returnToService(DESK, { requestId: second.requestId }),
    ).resolves.toEqual({ returned: true });
    expect(await statusOf(TWICE_HELD_ROOM)).toBe("available");
  });

  it("says so when a done request lets go and another still holds the room (MT-S2-11)", async () => {
    const first = await report(DESK, TWICE_HELD_ROOM, {
      outOfOrder: { acknowledged: true },
    });
    const second = await report(DESK, TWICE_HELD_ROOM, {
      outOfOrder: { acknowledged: true },
    });
    await expect(
      maintenance.move(MANAGER, {
        requestId: first.requestId,
        from: "new",
        to: "done",
      }),
    ).resolves.toEqual({
      returned: false,
      stillOutOfOrder: false,
      heldElsewhere: true,
    });
    await maintenance.returnToService(DESK, { requestId: second.requestId });
  });

  it("agrees with its holds when a take and a return meet (MT-S2-12)", async () => {
    const held = await report(DESK, CONTESTED_ROOM, {
      outOfOrder: { acknowledged: true },
    });
    const other = await report(DESK, CONTESTED_ROOM);

    // A takes the room's lock and a second hold, and waits. B returns the
    // first hold meanwhile: it must wait for A, then count A's hold.
    const a = gate();
    const locked = gate();
    const taking = withOrganizationContext(
      prisma,
      { userId: DESK },
      async (tx) => {
        await lockUnitWithin(tx, CONTESTED_ROOM);
        await tx.$queryRaw`
        insert into public.maintenance_unit_holds (request_id, organization_id, property_id)
        values (${other.requestId}::uuid, ${ORG}::uuid, ${PROPERTY}::uuid)
        returning request_id`;
        locked.open();
        await a.opened;
      },
    );
    // B starts only once A holds the lock, so the order under test is the one
    // that happens, whatever the machine's load.
    await locked.opened;
    const returning = maintenance.returnToService(DESK, {
      requestId: held.requestId,
    });

    await untilWaiting("query ilike '%for update%'", "the return");
    a.open();
    await taking;
    await expect(returning).resolves.toEqual({ returned: false });
    expect(await statusOf(CONTESTED_ROOM)).toBe("out_of_service");
    expect(await holding(other.requestId)).toBe(true);
    await maintenance.returnToService(DESK, { requestId: other.requestId });
  });

  it("never leaves a cancelled request holding when a cancel and a take meet (MT-S2-16)", async () => {
    const { requestId } = await report(DESK, CONTESTED_ROOM);

    // A cancels and waits; B takes the room out meanwhile. B must wait for A
    // and then see the request cancelled, rather than holding behind it.
    const a = gate();
    const cancelled = gate();
    const cancelling = withOrganizationContext(
      prisma,
      { userId: MANAGER },
      async (tx) => {
        await tx.$queryRaw`
          update public.maintenance_requests
             set status = 'cancelled', cancel_reason = 'reported twice'
           where id = ${requestId}::uuid
          returning id`;
        cancelled.open();
        await a.opened;
      },
    );
    await cancelled.opened;
    const taking = maintenance.takeOutOfOrder(DESK, {
      requestId,
      acknowledged: true,
    });

    await untilWaiting("wait_event = 'advisory'", "the take");
    a.open();
    await cancelling;
    await expect(taking).rejects.toBeInstanceOf(MaintenanceRefusedError);
    expect(await holding(requestId)).toBe(false);
    expect(await statusOf(CONTESTED_ROOM)).toBe("available");
  });

  it("sees a Guest checked into a bed while its room was being taken out (MT-S2-09, MT-S2-06)", async () => {
    const { requestId } = await report(DESK, SHARED_ROOM);
    const stayId = randomUUID();

    // A checks somebody into a bed of the room and waits, holding the bed and
    // the room FOR SHARE. B takes the room out meanwhile: it must wait, and
    // then be told about the Guest rather than miss them.
    const a = gate();
    const inserted = gate();
    const checkingIn = owner.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `insert into public.stays
             (id, organization_id, property_id, accommodation_unit_id,
              stay_type, status, starts_on, ends_on)
           values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'guest', 'in_house',
                   app.property_today($3::uuid), app.property_today($3::uuid) + 1)`,
          stayId,
          ORG,
          PROPERTY,
          SHARED_BED_A,
        );
        inserted.open();
        await a.opened;
      },
      { timeout: 30_000 },
    );
    await inserted.opened;
    const taking = maintenance.takeOutOfOrder(DESK, {
      requestId,
      acknowledged: false,
    });

    try {
      await untilWaiting("query ilike '%for update%'", "the take");
      a.open();
      await checkingIn;
      await expect(taking).rejects.toMatchObject({
        impact: { inHouse: [{ unitName: "A" }] },
      });
      expect(await holding(requestId)).toBe(false);
    } finally {
      await owner.$executeRawUnsafe(
        "delete from public.stays where id = $1::uuid",
        stayId,
      );
    }
  });

  it("refuses a booking and a check-in on a bed whose room is out, and Arrivals says so (MT-S2-06, MT-S2-29)", async () => {
    const reservationId = await booked(SHARED_BED_B, 1);
    const { requestId } = await report(DESK, SHARED_ROOM, {
      outOfOrder: { acknowledged: true },
    });
    try {
      const [today] = await owner.$queryRawUnsafe<{ day: string }[]>(
        "select to_char(app.property_today($1::uuid), 'YYYY-MM-DD') as day",
        PROPERTY,
      );
      await expect(
        reservations.createReservation(MANAGER, {
          propertyId: PROPERTY,
          accommodationUnitId: SHARED_BED_A,
          guestName: "Maintenance Booker",
          guestEmail: null,
          guestPhone: null,
          stayType: "guest",
          startsOn: today!.day,
          endsOn: null,
        }),
      ).rejects.toBeInstanceOf(ReservationRefusedError);

      const arrival = (await reservations.listArrivals(MANAGER, PROPERTY)).find(
        (row) => row.reservationId === reservationId,
      );
      expect(arrival?.unitStatus).toBe("out_of_service");
      await expect(
        reservations.checkIn(MANAGER, reservationId, {
          readinessAcknowledged: true,
        }),
      ).rejects.toBeInstanceOf(UnitNotInServiceError);
    } finally {
      await maintenance.returnToService(DESK, { requestId });
    }
  });

  it("tells Rooms which Units are held and by which request (MT-S2-28)", async () => {
    const { requestId, number } = await report(DESK, ROOM, {
      outOfOrder: { acknowledged: true },
    });
    const rooms = await maintenance.roomsView(DESK, PROPERTY);
    expect(rooms.mayReport).toBe(true);
    expect(rooms.holds).toContainEqual({
      unitId: ROOM,
      requestId,
      number,
      expectedBackOn: null,
    });
    // Where maintenance is not available there is nothing to show or offer.
    await expect(
      maintenance.roomsView(DESK, ELSEWHERE_PROPERTY),
    ).resolves.toEqual({ holds: [], mayReport: false });
    await maintenance.returnToService(DESK, { requestId });
  });

  it("names the request in the audit record when a room is taken out later (MT-S2-02)", async () => {
    const { requestId, number } = await report(DESK, ROOM);
    await maintenance.takeOutOfOrder(DESK, { requestId, acknowledged: true });
    const [record] = await audited("unit.taken_out_of_order", ROOM);
    expect(record?.context).toMatchObject({ requestId, number });
    await maintenance.returnToService(DESK, { requestId });
  });

  it("refuses an expected-back date before today (MT-S2-13)", async () => {
    const { requestId } = await report(DESK, ROOM);
    await expect(
      maintenance.takeOutOfOrder(DESK, {
        requestId,
        acknowledged: true,
        expectedBackOn: "2000-01-01",
      }),
    ).rejects.toBeInstanceOf(MaintenanceInputError);
    expect(await holding(requestId)).toBe(false);
  });

  it("marks a passed expected-back date overdue and returns nothing (MT-S2-13)", async () => {
    const [today] = await owner.$queryRawUnsafe<{ day: string }[]>(
      "select to_char(app.property_today($1::uuid), 'YYYY-MM-DD') as day",
      FAR_PROPERTY,
    );
    const { requestId } = await maintenance.report(MANAGER, {
      propertyId: FAR_PROPERTY,
      unitId: FAR_ROOM,
      title: "Far away",
      priority: "urgent",
      outOfOrder: { acknowledged: true, expectedBackOn: today!.day },
    });
    // The Property moves a day or two ahead: Pago Pago to Kiritimati.
    await owner.$executeRawUnsafe(
      "update public.properties set timezone = 'Pacific/Kiritimati' where id = $1::uuid",
      FAR_PROPERTY,
    );
    try {
      const card = (
        await maintenance.board(MANAGER, FAR_PROPERTY)
      ).requests.find((request) => request.requestId === requestId);
      expect(card?.hold?.overdue).toBe(true);
      expect(await statusOf(FAR_ROOM)).toBe("out_of_service");
    } finally {
      await owner.$executeRawUnsafe(
        "update public.properties set timezone = 'Pacific/Pago_Pago' where id = $1::uuid",
        FAR_PROPERTY,
      );
      await maintenance.returnToService(MANAGER, { requestId });
    }
  });
});

describe("coming back", { timeout: DATABASE_BUDGET_MS }, () => {
  it("returns on done and comes back dirty with no setting at all (MT-S2-22)", async () => {
    await owner.$executeRawUnsafe(
      "delete from public.maintenance_settings where organization_id = $1::uuid",
      ORG,
    );
    const { requestId } = await report(DESK, RETURNING_ROOM, {
      outOfOrder: { acknowledged: true },
    });
    await expect(
      maintenance.move(MANAGER, { requestId, from: "new", to: "done" }),
    ).resolves.toEqual({
      returned: true,
      stillOutOfOrder: false,
      heldElsewhere: false,
    });
    const [hold] = await owner.$queryRawUnsafe<{ returnedAs: string }[]>(
      `select returned_as as "returnedAs" from public.maintenance_unit_holds
        where request_id = $1::uuid`,
      requestId,
    );
    expect(hold?.returnedAs).toBe("dirty");
    await drain();
  });

  it("brings a room back no better than it was (MT-S2-30)", async () => {
    await settle({ returnAs: "inspected" });
    await housekeeping.markUnits(MANAGER, {
      unitIds: [RETURNING_ROOM],
      status: "dirty",
    });
    const { requestId } = await report(DESK, RETURNING_ROOM, {
      outOfOrder: { acknowledged: true },
    });
    await maintenance.returnToService(DESK, { requestId });
    await drain();
    const [row] = await owner.$queryRawUnsafe<{ status: string }[]>(
      `select status from public.housekeeping_unit_status
        where accommodation_unit_id = $1::uuid`,
      RETURNING_ROOM,
    );
    expect(row?.status).toBe("dirty");
    await settle({});
  });

  it("brings a room a Guest has just left back dirty, before the worker has marked it (MT-S2-30)", async () => {
    await settle({ returnAs: "inspected" });
    await housekeeping.markUnits(MANAGER, {
      unitIds: [JUST_LEFT_ROOM],
      status: "inspected",
    });
    const reservationId = await booked(JUST_LEFT_ROOM, 2);
    const { stayId } = await reservations.checkIn(MANAGER, reservationId, {
      readinessAcknowledged: true,
    });
    await reservations.checkOut(MANAGER, stayId, REVIEWED);

    // The row still reads inspected: the departure's own event is waiting for
    // the worker. The room is dirty all the same, because a Guest left it.
    const { requestId } = await report(DESK, JUST_LEFT_ROOM, {
      outOfOrder: { acknowledged: true },
    });
    await maintenance.returnToService(DESK, { requestId });

    // Only the return is delivered, as when the worker is behind on
    // departures and reaches this one first.
    for (;;) {
      const { claimed } = await dispatcher.dispatch([roomReturnedSubscription]);
      if (claimed === 0) break;
    }
    const [row] = await owner.$queryRawUnsafe<{ status: string }[]>(
      `select status from public.housekeeping_unit_status
        where accommodation_unit_id = $1::uuid`,
      JUST_LEFT_ROOM,
    );
    expect(row?.status).toBe("dirty");

    await drain();
    await settle({});
  });

  it("returns the room on done, publishes it, and the worker makes it dirty (MT-S2-14, MT-S2-17)", async () => {
    await settle({ returnOnDone: true, returnAs: "dirty" });
    const { requestId } = await report(DESK, RETURNING_ROOM, {
      outOfOrder: { acknowledged: true },
    });
    await expect(
      maintenance.move(MANAGER, { requestId, from: "new", to: "done" }),
    ).resolves.toEqual({
      returned: true,
      stillOutOfOrder: false,
      heldElsewhere: false,
    });
    expect(await statusOf(RETURNING_ROOM)).toBe("available");

    await drain();
    const [row] = await owner.$queryRawUnsafe<{ status: string }[]>(
      `select status from public.housekeeping_unit_status
        where accommodation_unit_id = $1::uuid`,
      RETURNING_ROOM,
    );
    expect(row?.status).toBe("dirty");
  });

  it("keeps a room cleaned before the worker got there (MT-S2-17)", async () => {
    await settle({ returnOnDone: true, returnAs: "dirty" });
    const { requestId } = await report(DESK, RETURNING_ROOM, {
      outOfOrder: { acknowledged: true },
    });
    await maintenance.returnToService(DESK, { requestId });
    await housekeeping.markUnits(MANAGER, {
      unitIds: [RETURNING_ROOM],
      status: "inspected",
    });
    await drain();
    const [row] = await owner.$queryRawUnsafe<{ status: string }[]>(
      `select status from public.housekeeping_unit_status
        where accommodation_unit_id = $1::uuid`,
      RETURNING_ROOM,
    );
    expect(row?.status).toBe("inspected");
  });

  it("keeps the room on done until confirmed, when the setting says so (MT-S2-15, MT-S2-24)", async () => {
    await settle({ returnOnDone: false });
    const { requestId } = await report(DESK, CONFIRMED_ROOM, {
      outOfOrder: { acknowledged: true },
    });
    await expect(
      maintenance.move(MANAGER, { requestId, from: "new", to: "done" }),
    ).resolves.toEqual({
      returned: false,
      stillOutOfOrder: true,
      heldElsewhere: false,
    });
    expect(await statusOf(CONFIRMED_ROOM)).toBe("out_of_service");

    // Switching the setting now rewrites nothing already held.
    await settle({ returnOnDone: true });
    expect(await holding(requestId)).toBe(true);

    await maintenance.returnToService(DESK, {
      requestId,
      note: "checked by the manager",
    });
    expect(await statusOf(CONFIRMED_ROOM)).toBe("available");
    const [record] = await audited("unit.returned_to_service", CONFIRMED_ROOM);
    expect(record?.reason).toBe("checked by the manager");
  });

  it("leaves the room out when the mover may not return it (MT-S2-15)", async () => {
    await settle({ returnOnDone: true });
    const { requestId } = await report(DESK, CONFIRMED_ROOM, {
      outOfOrder: { acknowledged: true },
    });
    await expect(
      maintenance.move(TECHNICIAN, { requestId, from: "new", to: "done" }),
    ).resolves.toEqual({
      returned: false,
      stillOutOfOrder: true,
      heldElsewhere: false,
    });
    await expect(
      maintenance.returnToService(TECHNICIAN, { requestId }),
    ).rejects.toBeInstanceOf(ReleaseNeedsPermissionError);
    await maintenance.returnToService(DESK, { requestId });
  });

  it("keeps a done request that still holds its room on the board past thirty days (MT-S1-10, MT-S2-15)", async () => {
    await settle({ returnOnDone: false });
    const held = await report(DESK, CONFIRMED_ROOM, {
      outOfOrder: { acknowledged: true },
    });
    await maintenance.move(MANAGER, {
      requestId: held.requestId,
      from: "new",
      to: "done",
    });
    const finished = await report(DESK, ROOM);
    await maintenance.move(MANAGER, {
      requestId: finished.requestId,
      from: "new",
      to: "done",
    });
    await owner.$executeRawUnsafe(
      `update public.maintenance_requests
          set status_changed_at = now() - interval '31 days'
        where id in ($1::uuid, $2::uuid)`,
      held.requestId,
      finished.requestId,
    );

    // The one that holds its room is the only place Return to service is
    // offered; the one that does not has aged off.
    const board = await maintenance.board(MANAGER, PROPERTY);
    const shown = board.requests.map((request) => request.requestId);
    expect(shown).toContain(held.requestId);
    expect(shown).not.toContain(finished.requestId);

    await settle({ returnOnDone: true });
    await maintenance.returnToService(DESK, { requestId: held.requestId });
  });

  it("releases the room when its request is cancelled (MT-S2-16)", async () => {
    const { requestId } = await report(DESK, ROOM, {
      outOfOrder: { acknowledged: true },
    });
    await maintenance.cancel(MANAGER, {
      requestId,
      from: "new",
      reason: "not a fault",
    });
    expect(await holding(requestId)).toBe(false);
    expect(await statusOf(ROOM)).toBe("available");
  });

  it("takes a room out again after a mistaken return (MT-S2-20, MT-S2-21)", async () => {
    const { requestId } = await report(DESK, ROOM, {
      outOfOrder: { acknowledged: true },
    });
    await maintenance.returnToService(DESK, { requestId, note: "too early" });
    await maintenance.takeOutOfOrder(DESK, { requestId, acknowledged: true });
    expect(await statusOf(ROOM)).toBe("out_of_service");
    await maintenance.returnToService(DESK, { requestId });
  });

  it("asks for an assignee before work starts when the setting does (MT-S2-25)", async () => {
    await settle({ assigneeRequired: true });
    try {
      const { requestId } = await report(DESK, ROOM);
      await expect(
        maintenance.move(MANAGER, {
          requestId,
          from: "new",
          to: "in_progress",
        }),
      ).rejects.toBeInstanceOf(AssigneeRequiredError);
      await maintenance.assign(MANAGER, { requestId, assigneeId: DESK });
      await maintenance.move(MANAGER, {
        requestId,
        from: "new",
        to: "in_progress",
      });
    } finally {
      await settle({ assigneeRequired: null });
    }
  });

  it("reads what a Property inherits and audits every change (MT-S2-22, MT-S2-27)", async () => {
    await maintenance.setOrganizationSettings(MANAGER, PROPERTY, {
      assigneeRequired: false,
      returnOnDone: true,
      returnAs: "clean",
    });
    await settle({ returnAs: "inspected" });
    const settings = await maintenance.settings(MANAGER, PROPERTY);
    expect(settings).toMatchObject({
      organizationDefault: { returnAs: "clean" },
      propertyOverride: { returnAs: "inspected" },
      effective: { returnAs: "inspected", returnOnDone: true },
      mayConfigure: true,
      mayConfigureDefault: true,
    });
    expect(
      await audited("maintenance_setting.changed", PROPERTY),
    ).not.toHaveLength(0);
    expect(await audited("maintenance_setting.changed", ORG)).not.toHaveLength(
      0,
    );
  });
});

describe("where each record is filed", { timeout: DATABASE_BUDGET_MS }, () => {
  // ADR 0031: a record names the Property it happened at, or none when it is
  // about the whole Organization. audit.records is append-only, so a writer
  // that forgets misfiles every record it ever writes. The Property is read
  // from the subject's own row, not from what the writer was given.
  it("files every maintenance record at its subject's Property, and only the Organization's default at none", async () => {
    const records = await owner.$queryRawUnsafe<
      {
        action: string;
        subjectType: string;
        locationId: string | null;
        subjectProperty: string | null;
      }[]
    >(
      `select record.action,
            record.subject_type as "subjectType",
            record.location_id  as "locationId",
            case record.subject_type
              when 'maintenance_request' then
                (select property_id from public.maintenance_requests
                  where id = record.subject_id)
              when 'maintenance_equipment' then
                (select property_id from public.maintenance_equipment
                  where id = record.subject_id)
              when 'accommodation_unit' then
                (select property_id from public.accommodation_units
                  where id = record.subject_id)
              when 'folio' then
                (select property_id from public.folios
                  where id = record.subject_id)
              when 'property' then record.subject_id
            end                 as "subjectProperty"
       from audit.records as record
      where record.organization_id = $1::uuid
        and record.occurred_at >= $2
        and (record.action like 'maintenance%'
             or record.action in ('unit.taken_out_of_order',
                                  'unit.returned_to_service',
                                  'folio.charge_posted'))`,
      ORG,
      runStarted,
    );

    // Every writer this suite drives, so a record never written cannot pass
    // for one filed correctly.
    expect([...new Set(records.map((record) => record.action))]).toEqual(
      expect.arrayContaining([
        "maintenance_request.reported",
        "maintenance_request.moved",
        "maintenance_request.cancelled",
        "maintenance_request.assigned",
        "maintenance_request.prioritised",
        "maintenance_request.hold_released",
        "unit.taken_out_of_order",
        "unit.returned_to_service",
        "maintenance_setting.changed",
      ]),
    );
    const misfiled = records.filter((record) =>
      record.subjectType === "organization"
        ? record.locationId !== null
        : record.locationId === null ||
          record.locationId !== record.subjectProperty,
    );
    expect(misfiled).toEqual([]);
  });
});
