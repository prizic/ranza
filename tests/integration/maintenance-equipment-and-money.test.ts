/**
 * Equipment, the service plan and money against a real database (RANZ-33
 * slices 3 to 5).
 *
 * The pgTAP suite proves the constraints, policies and triggers one statement
 * at a time. This proves the module around them: what the register says about
 * an item, what a done work order records, and a damage charge that goes on a
 * real Guest's Folio through the Folios module's own door, and comes back off
 * it through its reversal.
 *
 * Breaks that were run, and what went red:
 *   the fault branch removed from the condition        MT-S3-04
 *   the service not recorded on done                   MT-S4-04
 *   a fault recording a service too                    MT-S4-05
 *   the charge link left out of chargeGuest            MT-S5-03
 *   the service written under the register's policy    MT-S4-04, technician
 *   an untouched last-serviced date written anyway     MT-S3-05, open form
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../packages/db/src";
import { createFoliosModule } from "../../packages/ranza/folios/src";
import {
  createMaintenanceModule,
  MaintenanceInputError,
  MaintenanceRefusedError,
} from "../../packages/ranza/maintenance/src";
import { createReservationsModule } from "../../packages/ranza/reservations/src";

const ORG = "de000002-0000-4000-8000-000000000001";
const PROPERTY = "de000003-0000-4000-8000-000000000001";
const NO_BILLING = "de000003-0000-4000-8000-000000000002";
const MANAGER = "de000001-0000-4000-8000-000000000001";
const DESK = "de000001-0000-4000-8000-000000000002";
/** Works the board and does not keep the register: a role of the Organization's own. */
const TECHNICIAN = "de000001-0000-4000-8000-000000000003";

const unit = (n: number) =>
  `de000004-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const ROOM = unit(1);
const SHARED_ROOM = unit(2);
const SHARED_BED = unit(3);
const QUIET_ROOM = unit(4);
const NO_BILLING_ROOM = unit(5);
const STRAY_ROOM = unit(6);

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const maintenance = createMaintenanceModule({ db: prisma });
const reservations = createReservationsModule({ db: prisma });
const folios = createFoliosModule({ db: prisma });
const owner = createPrismaClient(process.env.DIRECT_URL!);

const DATABASE_BUDGET_MS = 60_000;

async function seed() {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1, 'mtem-manager@example.test'), ($2, 'mtem-desk@example.test'),
       ($3, 'mtem-technician@example.test')
     on conflict (id) do nothing`,
    MANAGER,
    DESK,
    TECHNICIAN,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status)
     values ($1, 'Maintenance Equipment Integration', 'active')
     on conflict (id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name, timezone) values
       ($1, $3, 'Equipment Property', 'Europe/Istanbul'),
       ($2, $3, 'Equipment No-Billing Property', 'Europe/Istanbul')
     on conflict (id) do nothing`,
    PROPERTY,
    NO_BILLING,
    ORG,
  );
  for (const [id, name, property] of [
    [ROOM, "MTE-101", PROPERTY],
    [SHARED_ROOM, "MTE-102", PROPERTY],
    [QUIET_ROOM, "MTE-103", PROPERTY],
    [STRAY_ROOM, "MTE-104", PROPERTY],
    [NO_BILLING_ROOM, "MTE-201", NO_BILLING],
  ]) {
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
     values ($1, $2, $3, $4, 'room', 'A', 'bed', 1) on conflict (id) do nothing`,
    SHARED_BED,
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
       ($1, 'billing_folios', 'active')
     on conflict (organization_id, module_key) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled) values
       ($1, $3, 'maintenance', true), ($1, $3, 'front_desk', true),
       ($1, $3, 'finance', true),
       ($2, $3, 'maintenance', true), ($2, $3, 'front_desk', true)
     on conflict (property_id, capability_key) do nothing`,
    PROPERTY,
    NO_BILLING,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.staff_roles
       (scope_id, key, organization_id, name, permissions)
     values ($1, 'technician', $1, 'Technician',
             array['maintenance.report', 'maintenance.manage'])
     on conflict (scope_id, key) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, role_scope_id, access_scope) values
       ($1, $2, 'manager', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
       ($1, $3, 'front_desk', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
       ($1, $4, 'technician', $1, 'organization_wide')
     on conflict (organization_id, user_id) do nothing`,
    ORG,
    MANAGER,
    DESK,
    TECHNICIAN,
  );
}

/** A Guest checked in today to `unitId`, with the Folio check-in opens. */
async function checkedIn(unitId: string, propertyId = PROPERTY) {
  const reservationId = randomUUID();
  await owner.$executeRawUnsafe(
    `with guest as (
       insert into public.guests (organization_id, full_name)
       values ($2::uuid, 'Equipment Guest') returning id
     )
     insert into public.reservations
       (id, organization_id, property_id, accommodation_unit_id,
        guest_id, stay_type, status, starts_on, ends_on)
     select $1::uuid, $2::uuid, $3::uuid, $4::uuid, guest.id, 'guest', 'confirmed',
            app.property_today($3::uuid), app.property_today($3::uuid) + 2
       from guest`,
    reservationId,
    ORG,
    propertyId,
    unitId,
  );
  return reservations.checkIn(MANAGER, reservationId, {
    readinessAcknowledged: true,
  });
}

async function folioOf(stayId: string): Promise<string | null> {
  const [row] = await owner.$queryRawUnsafe<{ id: string }[]>(
    "select id from public.folios where stay_id = $1::uuid",
    stayId,
  );
  return row?.id ?? null;
}

async function audited(action: string, subjectId: string) {
  return owner.$queryRawUnsafe<{ context: unknown }[]>(
    `select context from audit.records
      where action = $1 and subject_id = $2::uuid and occurred_at >= $3
      order by occurred_at desc, id desc`,
    action,
    subjectId,
    runStarted,
  );
}

let runStarted: Date;
let today: string;

function daysFrom(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthsBack(day: string, months: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().slice(0, 10);
}

function item(
  name: string,
  extra: Partial<Parameters<typeof maintenance.addEquipment>[2]> = {},
) {
  return maintenance.addEquipment(MANAGER, PROPERTY, {
    name,
    category: "Plant",
    unitId: null,
    location: "Roof",
    serviceIntervalMonths: null,
    lastServicedOn: null,
    ...extra,
  });
}

async function itemNamed(equipmentId: string) {
  const register = await maintenance.equipmentRegister(MANAGER, PROPERTY);
  return register.items.find((entry) => entry.equipmentId === equipmentId);
}

beforeAll(async () => {
  const [clock] = await owner.$queryRawUnsafe<{ now: Date; today: string }[]>(
    `select now() as now,
            to_char(app.property_today($1::uuid), 'YYYY-MM-DD') as today`,
    PROPERTY,
  );
  runStarted = clock!.now;
  await cleanUp();
  await seed();
  [{ today }] = await owner.$queryRawUnsafe<{ today: string }[]>(
    "select to_char(app.property_today($1::uuid), 'YYYY-MM-DD') as today",
    PROPERTY,
  );
}, DATABASE_BUDGET_MS);

/**
 * Everything this file writes, removed. The Folio lines are the hard part, and
 * deliberately: the append-only trigger fires for every role, so it is
 * switched off for the owner's cleanup and on again whatever happens — as the
 * Folios suite does. Run before the suite too, so a run that died before its
 * afterAll cannot leave bookings that collide with the next one's.
 */
async function cleanUp(): Promise<void> {
  await owner.$executeRawUnsafe(
    "alter table public.folio_lines disable trigger folio_lines_append_only",
  );
  try {
    for (const statement of [
      `delete from public.maintenance_request_charges where organization_id = '${ORG}'`,
      `delete from public.maintenance_unit_holds where organization_id = '${ORG}'`,
      `delete from public.maintenance_requests where organization_id = '${ORG}'`,
      `delete from public.maintenance_equipment where organization_id = '${ORG}'`,
      `delete from public.folio_lines where organization_id = '${ORG}'`,
      `delete from public.folios where organization_id = '${ORG}'`,
      `delete from public.stays where organization_id = '${ORG}'`,
      `delete from public.reservations where organization_id = '${ORG}'`,
      `delete from public.property_capabilities where organization_id = '${ORG}'`,
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
      `delete from public.users where id in ('${MANAGER}', '${DESK}', '${TECHNICIAN}')`,
    ]) {
      await owner.$executeRawUnsafe(statement);
    }
  } finally {
    await owner.$executeRawUnsafe(
      "alter table public.folio_lines enable trigger folio_lines_append_only",
    );
  }
}

afterAll(async () => {
  await cleanUp();
  await owner.$disconnect();
  await prisma.$disconnect();
}, DATABASE_BUDGET_MS);

describe("the register", { timeout: DATABASE_BUDGET_MS }, () => {
  it("adds an item and audits it; two may share a name (MT-S3-01, MT-S3-09)", async () => {
    const first = await item("Boiler");
    const second = await item("Boiler", { location: "Basement" });
    expect(first.equipmentId).not.toBe(second.equipmentId);
    expect(
      await audited("maintenance_equipment.added", first.equipmentId),
    ).toHaveLength(1);
  });

  it("refuses an item somewhere twice, nowhere, or serviced tomorrow (MT-S3-02, MT-S3-03)", async () => {
    await expect(item("Nowhere", { location: null })).rejects.toBeInstanceOf(
      MaintenanceInputError,
    );
    await expect(item("Twice", { unitId: ROOM })).rejects.toBeInstanceOf(
      MaintenanceInputError,
    );
    await expect(
      item("Tomorrow", { lastServicedOn: daysFrom(today, 1) }),
    ).rejects.toBeInstanceOf(MaintenanceInputError);
  });

  it("works out each item's condition from its dates and open faults (MT-S3-04)", async () => {
    const working = await item("Working", {
      serviceIntervalMonths: 6,
      lastServicedOn: today,
    });
    const due = await item("Due", {
      serviceIntervalMonths: 6,
      lastServicedOn: daysFrom(monthsBack(today, 6), 7),
    });
    const overdue = await item("Overdue", {
      serviceIntervalMonths: 1,
      lastServicedOn: monthsBack(today, 3),
    });
    const never = await item("Never serviced", { serviceIntervalMonths: 12 });
    const broken = await item("Broken", {
      serviceIntervalMonths: 6,
      lastServicedOn: today,
    });
    await maintenance.report(DESK, {
      propertyId: PROPERTY,
      equipmentId: broken.equipmentId,
      title: "It stopped",
      priority: "urgent",
    });

    expect((await itemNamed(working.equipmentId))?.condition).toBe("working");
    expect((await itemNamed(due.equipmentId))?.condition).toBe("due");
    expect((await itemNamed(overdue.equipmentId))?.condition).toBe("overdue");
    expect(await itemNamed(never.equipmentId)).toMatchObject({
      condition: "due",
      nextServiceOn: today,
    });
    expect((await itemNamed(broken.equipmentId))?.condition).toBe("fault");
  });

  it("changes an item and keeps what it was (MT-S3-05)", async () => {
    const { equipmentId } = await item("Lift");
    await maintenance.changeEquipment(MANAGER, equipmentId, {
      name: "Service lift",
      category: "Plant",
      unitId: null,
      location: "Back stairs",
      serviceIntervalMonths: 12,
      lastServicedOn: null,
      lastServicedOnWas: null,
    });
    const [record] = await audited(
      "maintenance_equipment.changed",
      equipmentId,
    );
    expect(record?.context).toMatchObject({
      from: { name: "Lift", location: "Roof" },
      to: { name: "Service lift", location: "Back stairs" },
    });
  });

  it("does not undo a service recorded while the form was open (MT-S3-05, MT-S4-04)", async () => {
    const opened = monthsBack(today, 7);
    const { equipmentId } = await item("Water heater", {
      serviceIntervalMonths: 6,
      lastServicedOn: opened,
    });
    const order = await maintenance.createWorkOrder(DESK, {
      equipmentId,
      title: "Service: Water heater",
    });
    await maintenance.move(MANAGER, {
      requestId: order.requestId,
      from: "new",
      to: "done",
    });

    // Renamed from a form opened before the service, its date untouched.
    const form = {
      name: "Hot water",
      category: "Plant",
      unitId: null,
      location: "Roof",
      serviceIntervalMonths: 6,
      lastServicedOn: opened,
      lastServicedOnWas: opened,
    };
    await maintenance.changeEquipment(MANAGER, equipmentId, form);
    expect(await itemNamed(equipmentId)).toMatchObject({
      name: "Hot water",
      lastServicedOn: today,
    });
    const [record] = await audited(
      "maintenance_equipment.changed",
      equipmentId,
    );
    expect(record?.context).toMatchObject({
      from: { lastServicedOn: today },
      to: { lastServicedOn: today },
    });

    // A date the person did change is theirs.
    const corrected = daysFrom(today, -3);
    await maintenance.changeEquipment(MANAGER, equipmentId, {
      ...form,
      lastServicedOn: corrected,
      lastServicedOnWas: today,
    });
    expect((await itemNamed(equipmentId))?.lastServicedOn).toBe(corrected);
  });

  it("retires an item out of the report form, and restores it (MT-S3-06)", async () => {
    const { equipmentId } = await item("Old fridge");
    await maintenance.retireEquipment(MANAGER, equipmentId);
    expect((await itemNamed(equipmentId))?.retired).toBe(true);
    const options = await maintenance.reportOptions(DESK, PROPERTY);
    expect(options.equipment.map((entry) => entry.equipmentId)).not.toContain(
      equipmentId,
    );
    // A form opened before it was retired is refused, not filed.
    await expect(
      maintenance.report(DESK, {
        propertyId: PROPERTY,
        equipmentId,
        title: "It hums",
        priority: "can_wait",
      }),
    ).rejects.toBeInstanceOf(MaintenanceRefusedError);
    await maintenance.restoreEquipment(MANAGER, equipmentId);
    expect((await itemNamed(equipmentId))?.retired).toBe(false);
  });

  it("refuses the register to somebody without the permission (MT-S3-08)", async () => {
    await expect(
      maintenance.addEquipment(DESK, PROPERTY, {
        name: "Desk's item",
        category: "Plant",
        unitId: null,
        location: "Roof",
        serviceIntervalMonths: null,
        lastServicedOn: null,
      }),
    ).rejects.toBeInstanceOf(MaintenanceRefusedError);
  });
});

describe("the service plan", { timeout: DATABASE_BUDGET_MS }, () => {
  it("raises an urgent work order for an overdue item, one at a time (MT-S4-02, MT-S4-03)", async () => {
    const { equipmentId } = await item("Chiller", {
      serviceIntervalMonths: 1,
      lastServicedOn: monthsBack(today, 2),
    });
    const { requestId } = await maintenance.createWorkOrder(DESK, {
      equipmentId,
      title: "Service: Chiller",
    });
    const card = (await maintenance.board(DESK, PROPERTY)).requests.find(
      (request) => request.requestId === requestId,
    );
    expect(card).toMatchObject({ kind: "service", priority: "urgent" });
    expect((await itemNamed(equipmentId))?.openWorkOrder?.requestId).toBe(
      requestId,
    );
    await expect(
      maintenance.createWorkOrder(DESK, { equipmentId, title: "Again" }),
    ).rejects.toBeInstanceOf(MaintenanceRefusedError);
  });

  it("raises a this-week work order for an item never serviced, which is due and not late (MT-S4-02)", async () => {
    const { equipmentId } = await item("New pump", {
      serviceIntervalMonths: 3,
    });
    expect((await itemNamed(equipmentId))?.condition).toBe("due");
    const { requestId } = await maintenance.createWorkOrder(DESK, {
      equipmentId,
      title: "Service: New pump",
    });
    const card = (await maintenance.board(DESK, PROPERTY)).requests.find(
      (request) => request.requestId === requestId,
    );
    expect(card?.priority).toBe("this_week");
  });

  it("lets somebody who works the board but not the register finish a work order (MT-S4-04)", async () => {
    const { equipmentId } = await item("Generator", {
      serviceIntervalMonths: 12,
      lastServicedOn: monthsBack(today, 13),
    });
    const order = await maintenance.createWorkOrder(TECHNICIAN, {
      equipmentId,
      title: "Service: Generator",
    });
    await expect(
      maintenance.changeEquipment(TECHNICIAN, equipmentId, {
        name: "Generator",
        category: "Plant",
        unitId: null,
        location: "Roof",
        serviceIntervalMonths: 12,
        lastServicedOn: today,
        lastServicedOnWas: null,
      }),
    ).rejects.toBeInstanceOf(MaintenanceRefusedError);

    await maintenance.move(TECHNICIAN, {
      requestId: order.requestId,
      from: "new",
      to: "done",
    });
    expect(await itemNamed(equipmentId)).toMatchObject({
      lastServicedOn: today,
      condition: "working",
    });
  });

  it("records the service when a work order is done, not when a fault is (MT-S4-04, MT-S4-05)", async () => {
    const { equipmentId } = await item("Pump", {
      serviceIntervalMonths: 6,
      lastServicedOn: monthsBack(today, 7),
    });
    const fault = await maintenance.report(DESK, {
      propertyId: PROPERTY,
      equipmentId,
      title: "It rattles",
      priority: "can_wait",
    });
    await maintenance.move(MANAGER, {
      requestId: fault.requestId,
      from: "new",
      to: "done",
    });
    expect((await itemNamed(equipmentId))?.lastServicedOn).toBe(
      monthsBack(today, 7),
    );

    const order = await maintenance.createWorkOrder(DESK, {
      equipmentId,
      title: "Service: Pump",
    });
    await maintenance.move(MANAGER, {
      requestId: order.requestId,
      from: "new",
      to: "done",
    });
    expect(await itemNamed(equipmentId)).toMatchObject({
      lastServicedOn: today,
      condition: "working",
    });
    expect(
      await audited("maintenance_equipment.serviced", equipmentId),
    ).toHaveLength(1);

    // MT-S4-06: reopening keeps the date the service wrote.
    await maintenance.move(MANAGER, {
      requestId: order.requestId,
      from: "done",
      to: "in_progress",
    });
    expect((await itemNamed(equipmentId))?.lastServicedOn).toBe(today);
  });
});

describe("money", { timeout: DATABASE_BUDGET_MS }, () => {
  it("records what a repair cost, and refuses a negative one (MT-S5-01, MT-S5-02)", async () => {
    const { requestId } = await maintenance.report(DESK, {
      propertyId: PROPERTY,
      unitId: QUIET_ROOM,
      title: "The tap drips",
      priority: "can_wait",
    });
    await expect(
      maintenance.recordCost(MANAGER, {
        requestId,
        costMinor: -1,
        vendor: null,
      }),
    ).rejects.toBeInstanceOf(MaintenanceInputError);
    await maintenance.recordCost(MANAGER, {
      requestId,
      costMinor: 45000,
      vendor: "Boğaz Teknik",
    });
    const card = (await maintenance.board(MANAGER, PROPERTY)).requests.find(
      (request) => request.requestId === requestId,
    );
    expect(card).toMatchObject({
      costMinor: 45000,
      currency: "TRY",
      vendor: "Boğaz Teknik",
    });
    const [record] = await audited("maintenance_request.costed", requestId);
    expect(record?.context).toMatchObject({
      from: { costMinor: null },
      to: { costMinor: 45000 },
    });
  });

  it("offers the Stays that used the room or its beds, and none for equipment (MT-S5-07)", async () => {
    const { stayId } = await checkedIn(SHARED_BED);
    const { requestId } = await maintenance.report(DESK, {
      propertyId: PROPERTY,
      unitId: SHARED_ROOM,
      title: "The lamp in 102",
      priority: "this_week",
    });
    const stays = await maintenance.chargeableStays(MANAGER, requestId);
    expect(stays).toContainEqual(
      expect.objectContaining({ stayId, unitName: "A", inHouse: true }),
    );

    const { equipmentId } = await item("Kettle");
    const onlyEquipment = await maintenance.report(DESK, {
      propertyId: PROPERTY,
      equipmentId,
      title: "The kettle",
      priority: "can_wait",
    });
    expect(
      await maintenance.chargeableStays(MANAGER, onlyEquipment.requestId),
    ).toEqual([]);
  });

  it("offers nobody where the Property does no billing (MT-S5-06)", async () => {
    await checkedIn(NO_BILLING_ROOM, NO_BILLING);
    const { requestId } = await maintenance.report(MANAGER, {
      propertyId: NO_BILLING,
      unitId: NO_BILLING_ROOM,
      title: "No billing here",
      priority: "can_wait",
    });
    expect(await maintenance.chargeableStays(MANAGER, requestId)).toEqual([]);
  });

  it("refuses a charge on a Folio the request's room was not used on, and posts nothing (MT-S5-07)", async () => {
    const { stayId } = await checkedIn(STRAY_ROOM);
    const folioId = (await folioOf(stayId))!;
    const { requestId } = await maintenance.report(DESK, {
      propertyId: PROPERTY,
      unitId: ROOM,
      title: "A chair in 101",
      priority: "can_wait",
    });
    await expect(
      maintenance.chargeGuest(MANAGER, {
        requestId,
        folioId,
        amountMinor: 5000,
      }),
    ).rejects.toBeInstanceOf(MaintenanceRefusedError);
    const lines = await owner.$queryRawUnsafe<{ id: string }[]>(
      "select id from public.folio_lines where folio_id = $1::uuid",
      folioId,
    );
    expect(lines).toEqual([]);
  });

  it("charges a Guest twice, and a reversal shows on the request (MT-S5-03, MT-S5-08, MT-S5-09)", async () => {
    const { stayId } = await checkedIn(ROOM);
    const folioId = (await folioOf(stayId))!;
    const { requestId, number } = await maintenance.report(DESK, {
      propertyId: PROPERTY,
      unitId: ROOM,
      title: "A broken mirror",
      priority: "this_week",
    });

    const first = await maintenance.chargeGuest(MANAGER, {
      requestId,
      folioId,
      amountMinor: 30000,
    });
    await maintenance.chargeGuest(MANAGER, {
      requestId,
      folioId,
      amountMinor: 5000,
    });

    const detail = await folios.folioDetail(MANAGER, folioId);
    expect(detail?.lines.map((line) => line.description)).toContain(
      `MT-${number} · A broken mirror`,
    );
    expect(
      await audited("maintenance_request.guest_charged", requestId),
    ).toHaveLength(2);

    await folios.reverseLine(MANAGER, first.lineId, "charged the wrong Guest");
    const card = (await maintenance.board(MANAGER, PROPERTY)).requests.find(
      (request) => request.requestId === requestId,
    );
    expect(card?.charges).toEqual([
      expect.objectContaining({ lineId: first.lineId, reversed: true }),
      expect.objectContaining({ amountMinor: 5000, reversed: false }),
    ]);
  });

  it("refuses a charge without finance.post_charge, or on a closed Folio (MT-S5-04, MT-S5-05)", async () => {
    const { stayId } = await checkedIn(QUIET_ROOM);
    const folioId = (await folioOf(stayId))!;
    const { requestId } = await maintenance.report(DESK, {
      propertyId: PROPERTY,
      unitId: QUIET_ROOM,
      title: "A chipped basin",
      priority: "can_wait",
    });
    await expect(
      maintenance.chargeGuest(DESK, { requestId, folioId, amountMinor: 1000 }),
    ).rejects.toBeInstanceOf(MaintenanceRefusedError);

    await owner.$executeRawUnsafe(
      "update public.folios set status = 'closed', closed_at = now() where id = $1::uuid",
      folioId,
    );
    await expect(
      maintenance.chargeGuest(MANAGER, {
        requestId,
        folioId,
        amountMinor: 1000,
      }),
    ).rejects.toBeInstanceOf(MaintenanceRefusedError);
  });
});
