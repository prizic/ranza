/**
 * The Rooms screen's module against a real database (RB-*, ADR 0032).
 *
 * The pgTAP suites prove the policies and triggers one statement at a time and
 * `accommodation-audit` proves what the room commands record. Nothing until now
 * read the map, added rooms through the module, or put a blocked Unit in front
 * of the booking form, so these are the rows that could be deleted without any
 * suite noticing.
 *
 * Every Property is this run's own and every date is relative to that
 * Property's own today, so a second run on the same database, and a run at any
 * hour, sees what the first did. The Organization and the people are shared and
 * idempotent.
 *
 * Breaks that were run, and what went red, are in
 * docs/evidence/decision-sheet/rooms.md.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPrismaClient,
  withOrganizationContext,
} from "../../packages/db/src";
import {
  createAccommodationModule,
  UnitNameTakenError,
  UnitOccupiedError,
  UnitRefusedError,
  type UnitEntry,
  type UnitMap,
} from "../../packages/ranza/accommodation/src";
import {
  createReservationsModule,
  ReservationRefusedError,
  UnitNotInServiceError,
} from "../../packages/ranza/reservations/src";
import { latestRecord } from "./audit-record";

// Ids of this suite's own. They once were housekeeping's and room-calendar's,
// and the Properties this suite leaves were then closed by the worker's closer
// on the next run, which blocked those suites' clean-up of the Organization.
const ORG = "dc00000a-0000-4000-8000-000000000001";
const OWNER = "dc00000b-0000-4000-8000-000000000001";
const FINANCE = "dc00000b-0000-4000-8000-000000000002";
const SHIPPED_ROLE_SCOPE = "00000000-0000-0000-0000-000000000000";

// The tenant path exactly as the host composes it: ranza_app, not an owner,
// no BYPASSRLS. Pointing this at DIRECT_URL would make every refusal below
// pass for the wrong reason.
const prisma = createPrismaClient(process.env.DATABASE_URL!);
const accommodation = createAccommodationModule({ db: prisma });
const reservations = createReservationsModule({ db: prisma });

// A second connection pool, so a race runs on two real connections instead of
// two promises queueing behind one.
const rival = createPrismaClient(process.env.DATABASE_URL!);
const rivalAccommodation = createAccommodationModule({ db: rival });
const rivalReservations = createReservationsModule({ db: rival });

const owner = createPrismaClient(process.env.DIRECT_URL!);

const BUDGET_MS = 60_000;

async function seedOrganization() {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1, 'rooms-map-owner@example.test'), ($2, 'rooms-map-finance@example.test')
     on conflict (id) do nothing`,
    OWNER,
    FINANCE,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status)
     values ($1, 'Rooms Integration', 'active') on conflict (id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status)
     values ($1, 'active')
     on conflict (organization_id) do update set status = 'active'`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key, status)
     values ($1, 'front_office', 'active')
     on conflict (organization_id, module_key) do update set status = 'active'`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, role_scope_id, access_scope) values
       ($1, $2, 'owner', $4, 'organization_wide'),
       ($1, $3, 'finance', $4, 'organization_wide')
     on conflict (organization_id, user_id) do update
       set status = 'active', revoked_at = null`,
    ORG,
    OWNER,
    FINANCE,
    SHIPPED_ROLE_SCOPE,
  );
}

/** A Property of this run's own, with the front desk switched on. */
async function newProperty(timezone = "Europe/Istanbul"): Promise<string> {
  const id = randomUUID();
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name, timezone)
     values ($1, $2, $3, $4)`,
    id,
    ORG,
    `Rooms ${id.slice(0, 8)}`,
    timezone,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     values ($1, $2, 'front_desk', true)`,
    id,
    ORG,
  );
  return id;
}

async function newUnit(
  propertyId: string,
  name: string,
  options: {
    parentId?: string;
    status?: "available" | "out_of_service";
    capacity?: number;
  } = {},
): Promise<string> {
  const id = randomUUID();
  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units
       (id, organization_id, property_id, parent_id, parent_unit_type,
        name, unit_type, capacity, status)
     values ($1, $2, $3, $4::uuid, case when $4::uuid is null then null else 'room' end,
             $5, $6, $7, $8)`,
    id,
    ORG,
    propertyId,
    options.parentId ?? null,
    name,
    options.parentId ? "bed" : "room",
    options.capacity ?? (options.parentId ? 1 : 2),
    options.status ?? "available",
  );
  return id;
}

/** `days` from the Property's own today, as `YYYY-MM-DD`. */
async function propertyDay(propertyId: string, days = 0): Promise<string> {
  const [row] = await owner.$queryRawUnsafe<{ day: string }[]>(
    `select to_char(app.property_today($1::uuid) + $2::int, 'YYYY-MM-DD') as day`,
    propertyId,
    days,
  );
  return row!.day;
}

/**
 * A Guest booking on a Unit, measured from the Property's own today. Every
 * Guest booking carries a departure.
 */
async function reserve(
  propertyId: string,
  unitId: string,
  guestName: string,
  from: number,
  to: number,
  status: "confirmed" | "cancelled" = "confirmed",
): Promise<string> {
  const id = randomUUID();
  await owner.$executeRawUnsafe(
    `with guest as (
       insert into public.guests (organization_id, full_name)
       values ($2::uuid, $5) returning id
     )
     insert into public.reservations
       (id, organization_id, property_id, accommodation_unit_id, guest_id,
        stay_type, status, starts_on, ends_on)
     select $1::uuid, $2::uuid, $3::uuid, $4::uuid, guest.id, 'guest', $8,
            app.property_today($3::uuid) + $6::int,
            app.property_today($3::uuid) + $7::int
     from guest`,
    id,
    ORG,
    propertyId,
    unitId,
    guestName,
    from,
    to,
    status,
  );
  return id;
}

/** Finds a Unit's entry anywhere in the map, room or bed. */
function entryNamed(map: UnitMap, name: string, roomName?: string): UnitEntry {
  const rooms = roomName
    ? map.units.filter((unit) => unit.name === roomName)
    : map.units;
  const pool = roomName ? rooms.flatMap((room) => room.beds) : rooms;
  const found = pool.find((unit) => unit.name === name);
  if (!found) throw new Error(`no ${name} in the map`);
  return found;
}

function stateKind(map: UnitMap, name: string, roomName?: string): string {
  return entryNamed(map, name, roomName).state?.kind ?? "none";
}

/**
 * Everything a run wrote under the Organization, removed so the next run — and
 * the worker's closer in business-day-closer.test.ts, which closes days at any
 * Property it finds — meets none of it. One transaction with triggers off,
 * because closes and folio lines are append-only by trigger and every foreign
 * key here is ON DELETE RESTRICT. The Organization, its membership and its
 * Subscription stay for the seed to reuse; audit records stay, which is the
 * point of them.
 */
async function removeWhatARunLeft() {
  const tables = await owner.$queryRawUnsafe<{ name: string }[]>(
    `select format('%I.%I', c.table_schema, c.table_name) as name
       from information_schema.columns as c
       join information_schema.tables as t using (table_schema, table_name)
      where c.column_name = 'organization_id'
        and t.table_type = 'BASE TABLE'
        and c.table_schema in ('public', 'outbox')
        and c.table_name not in
          ('organization_memberships', 'subscriptions', 'entitlements')`,
  );
  await owner.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("set local session_replication_role = replica");
    for (const { name } of tables) {
      await tx.$executeRawUnsafe(
        `delete from ${name} where organization_id = $1::uuid`,
        ORG,
      );
    }
  });
}

beforeAll(async () => {
  await removeWhatARunLeft();
  await seedOrganization();
}, BUDGET_MS);

afterAll(async () => {
  await owner.$executeRawUnsafe(
    `update public.subscriptions set status = 'active' where organization_id = $1`,
    ORG,
  );
  await removeWhatARunLeft();
  await owner.$disconnect();
  await prisma.$disconnect();
  await rival.$disconnect();
});

describe("the map of a Property", { timeout: BUDGET_MS }, () => {
  let property: string;
  let today: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    property = await newProperty();
    today = await propertyDay(property);

    const rooms = [
      "101",
      "102",
      "102b",
      "103",
      "104",
      "105",
      "106",
      "107",
      "108",
    ];
    for (const name of rooms) ids[name] = await newUnit(property, name);

    // 101: empty tonight, two arrivals later — the earliest is the one shown.
    await reserve(property, ids["101"]!, "Later Second", 9, 11);
    await reserve(property, ids["101"]!, "Later First", 3, 5);
    // 102: an arrival tonight. 102b: one that was due yesterday and has not come.
    await reserve(property, ids["102"]!, "Tonight Arrival", 0, 2);
    await reserve(property, ids["102b"]!, "Overdue Arrival", -1, 2);
    // 103: cancelled over tonight. 105: confirmed, but its nights all passed.
    await reserve(property, ids["103"]!, "Cancelled", 0, 2, "cancelled");
    await reserve(property, ids["105"]!, "Never Came", -4, -1);
    // 104: a Guest checked in through the module, the way the desk does it.
    const arriving = await reserve(
      property,
      ids["104"]!,
      "In House Guest",
      0,
      2,
    );
    await reservations.checkIn(OWNER, arriving, {
      readinessAcknowledged: true,
    });
    // 106: a Resident's Stay with no Reservation behind it.
    await owner.$executeRawUnsafe(
      `insert into public.stays
         (organization_id, property_id, accommodation_unit_id, stay_type,
          status, starts_on)
       values ($1, $2, $3, 'resident', 'in_house',
               app.property_today($2::uuid) - 1)`,
      ORG,
      property,
      ids["106"],
    );
    // 107 blocked through the module; 108 out of order.
    await accommodation.blockUnit(OWNER, ids["107"]!, "Window will not close");
    await owner.$executeRawUnsafe(
      `update public.accommodation_units set status = 'out_of_service'
        where id = $1::uuid`,
      ids["108"],
    );

    // 201: let by the bed. A free, B blocked, C reserved tonight.
    ids["201"] = await newUnit(property, "201");
    ids["201A"] = await newUnit(property, "A", { parentId: ids["201"]! });
    ids["201B"] = await newUnit(property, "B", { parentId: ids["201"]! });
    ids["201C"] = await newUnit(property, "C", { parentId: ids["201"]! });
    await accommodation.blockUnit(
      OWNER,
      ids["201B"]!,
      "Mattress being replaced",
    );
    await reserve(property, ids["201C"]!, "Bed Arrival", 0, 1);
    // 202: let by the bed, and out of order as a whole.
    ids["202"] = await newUnit(property, "202", { status: "out_of_service" });
    ids["202X"] = await newUnit(property, "X", { parentId: ids["202"]! });
    ids["202Y"] = await newUnit(property, "Y", { parentId: ids["202"]! });
  }, BUDGET_MS);

  it("rooms lists every unit at the property with its beds (RB-S1-01)", async () => {
    const map = await accommodation.listUnits(OWNER, property);

    const topLevel = map.units.map((unit) => unit.name);
    expect(topLevel).toEqual(
      [
        "101",
        "102",
        "102b",
        "103",
        "104",
        "105",
        "106",
        "107",
        "108",
        "201",
        "202",
      ].sort(),
    );
    // Each Unit once: a bed is under its room and nowhere else.
    const everyId = map.units.flatMap((unit) => [
      unit.unitId,
      ...unit.beds.map((bed) => bed.unitId),
    ]);
    expect(new Set(everyId).size).toBe(everyId.length);
    expect(everyId).toHaveLength(11 + 5);
    expect(entryNamed(map, "201").beds.map((bed) => bed.name)).toEqual([
      "A",
      "B",
      "C",
    ]);
    expect(entryNamed(map, "202").beds.map((bed) => bed.name)).toEqual([
      "X",
      "Y",
    ]);
    expect(map.units.every((unit) => unit.name !== "A")).toBe(true);

    // What each row carries.
    const blocked = entryNamed(map, "107");
    expect(blocked).toMatchObject({
      unitId: ids["107"],
      unitType: "room",
      capacity: 2,
      status: "blocked",
      beds: [],
      state: { kind: "blocked", reason: "Window will not close" },
    });
    expect(entryNamed(map, "B", "201")).toMatchObject({
      unitType: "bed",
      capacity: 1,
      status: "blocked",
      state: { kind: "blocked", reason: "Mattress being replaced" },
    });
    expect(map.today).toBe(today);
  });

  it("an in house stay makes a unit occupied (RB-S1-04)", async () => {
    const map = await accommodation.listUnits(OWNER, property);
    const inHouse = entryNamed(map, "104");
    expect(inHouse.state).toEqual({
      kind: "in_house",
      guestName: "In House Guest",
      endsOn: await propertyDay(property, 2),
    });
    // Occupancy comes from the Stay: the status column was never touched.
    expect(inHouse.status).toBe("available");
    // The Reservation the Guest arrived on is checked in, so it is not "reserved".
    expect(stateKind(map, "104")).toBe("in_house");
  });

  it("a stay with no reservation shows in house with no name (RB-S1-04)", async () => {
    const map = await accommodation.listUnits(OWNER, property);
    expect(entryNamed(map, "106").state).toEqual({
      kind: "in_house",
      guestName: "",
      endsOn: null,
    });
  });

  it("nothing can write occupied to a unit (RB-S1-04)", async () => {
    await expect(
      withOrganizationContext(
        prisma,
        { userId: OWNER },
        (tx) =>
          tx.$executeRaw`update public.accommodation_units
                          set status = 'occupied'
                        where id = ${ids["101"]}::uuid`,
      ),
    ).rejects.toThrow(/row-level security|42501/);
    const [row] = await owner.$queryRawUnsafe<{ status: string }[]>(
      "select status from public.accommodation_units where id = $1::uuid",
      ids["101"],
    );
    expect(row?.status).toBe("available");
  });

  it("a unit is reserved tonight only by a confirmed reservation that covers tonight (RB-S1-05)", async () => {
    const map = await accommodation.listUnits(OWNER, property);

    // An arrival tonight, and one that was due and has not come.
    expect(entryNamed(map, "102").state).toEqual({
      kind: "reserved",
      arrivesOn: today,
    });
    expect(entryNamed(map, "102b").state).toEqual({
      kind: "reserved",
      arrivesOn: await propertyDay(property, -1),
    });
    expect(entryNamed(map, "C", "201").state).toEqual({
      kind: "reserved",
      arrivesOn: today,
    });

    // Arriving later leaves the Unit free, with the earliest arrival beside it.
    expect(entryNamed(map, "101").state).toEqual({
      kind: "free",
      nextArrivalOn: await propertyDay(property, 3),
    });

    // Cancelled, or with every night already gone, is neither.
    expect(entryNamed(map, "103").state).toEqual({
      kind: "free",
      nextArrivalOn: null,
    });
    expect(entryNamed(map, "105").state).toEqual({
      kind: "free",
      nextArrivalOn: null,
    });
  });

  it("a room with beds is counted by its beds (RB-S1-06)", async () => {
    const map = await accommodation.listUnits(OWNER, property);
    const dorm = entryNamed(map, "201");
    // Not sellable itself and carrying no state of its own.
    expect(dorm.state).toBeNull();
    expect(dorm.status).toBe("available");
    expect(dorm.beds.map((bed) => bed.state?.kind)).toEqual([
      "free",
      "blocked",
      "reserved",
    ]);
    // A room out of order covers every bed under it, whatever the bed says.
    const covered = entryNamed(map, "202");
    expect(covered.state).toBeNull();
    expect(covered.status).toBe("out_of_service");
    expect(covered.beds.map((bed) => bed.state?.kind)).toEqual([
      "out_of_service",
      "out_of_service",
    ]);
    // The counts count the beds, not the room: 201 and 202 add none of their own.
    const leaves = map.units.flatMap((unit) =>
      unit.beds.length > 0 ? unit.beds : [unit],
    );
    expect(map.counts.sellable).toBe(leaves.length);
    expect(map.counts.sellable).toBe(9 + 5);
    expect(map.counts.rooms).toBe(11);
  });

  it("the counts partition the sellable units (RB-S1-09)", async () => {
    const { counts, units } = await accommodation.listUnits(OWNER, property);
    expect(counts).toEqual({
      rooms: 11,
      sellable: 14,
      inHouse: 2,
      reserved: 3,
      free: 4,
      blocked: 2,
      outOfService: 3,
    });
    // In house, reserved, free and blocked partition what is in service; out of
    // service is counted apart; the five are every sellable Unit, once.
    expect(
      counts.inHouse + counts.reserved + counts.free + counts.blocked,
    ).toBe(counts.sellable - counts.outOfService);
    // And the counts are the states the entries carry, not a second opinion.
    const kinds = units
      .flatMap((unit) => (unit.beds.length > 0 ? unit.beds : [unit]))
      .map((leaf) => leaf.state?.kind);
    const counted = (kind: string) =>
      kinds.filter((candidate) => candidate === kind).length;
    expect(counted("in_house")).toBe(counts.inHouse);
    expect(counted("reserved")).toBe(counts.reserved);
    expect(counted("free")).toBe(counts.free);
    expect(counted("blocked")).toBe(counts.blocked);
    expect(counted("out_of_service")).toBe(counts.outOfService);
  });

  it("a blocked unit is drawn blocked and leaves the booking form (RB-S3-01)", async () => {
    const map = await accommodation.listUnits(OWNER, property);
    expect(stateKind(map, "107")).toBe("blocked");
    const bookable = (
      await reservations.listBookableUnits(OWNER, property)
    ).map((unit) => unit.unitId);
    expect(bookable).not.toContain(ids["107"]);
    expect(bookable).not.toContain(ids["201B"]);
    expect(bookable).toContain(ids["101"]);
    expect(bookable).toContain(ids["201A"]);
  });
});

describe(
  "the map is measured on the Property's own day",
  { timeout: BUDGET_MS },
  () => {
    it("occupancy is measured against the property day (RB-S1-07)", async () => {
      // Whichever of these two zones puts the Property's day on the other side of
      // the server's UTC date right now: one always does, at any hour, whatever
      // the business-day cutoff is.
      const [{ day: serverDay }] = (await owner.$queryRawUnsafe<
        { day: string }[]
      >(
        `select to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD') as day`,
      )) as [{ day: string }];
      let property = "";
      let propertyToday = "";
      for (const zone of ["Etc/GMT-14", "Etc/GMT+12"]) {
        property = await newProperty(zone);
        propertyToday = await propertyDay(property);
        if (propertyToday !== serverDay) break;
      }
      expect(propertyToday).not.toBe(serverDay);

      // One night, starting on the Property's own today: it covers that day and
      // no other, so reading the wrong day misses it whichever way the zone lies.
      const unit = await newUnit(property, "TZ-1");
      await reserve(property, unit, "Zone Arrival", 0, 1);
      const map = await accommodation.listUnits(OWNER, property);
      expect(map.today).toBe(propertyToday);
      expect(entryNamed(map, "TZ-1").state).toEqual({
        kind: "reserved",
        arrivesOn: propertyToday,
      });
    });
  },
);

describe(
  "the map is gone when the front desk is not available",
  { timeout: BUDGET_MS },
  () => {
    /** A Property with one Unit, and what the map says while `lapse` is in force. */
    async function mapWhile(
      lapse: (propertyId: string) => Promise<void>,
      restore: (propertyId: string) => Promise<void>,
    ) {
      const property = await newProperty();
      await newUnit(property, "OFF-1");
      expect(
        (await accommodation.listUnits(OWNER, property)).units,
      ).toHaveLength(1);
      try {
        await lapse(property);
        return await accommodation.listUnits(OWNER, property);
      } finally {
        await restore(property);
      }
    }

    const setSubscription = (status: string) => async () => {
      await owner.$executeRawUnsafe(
        `update public.subscriptions set status = $2 where organization_id = $1`,
        ORG,
        status,
      );
    };

    const setEntitlement = (status: string) => async () => {
      await owner.$executeRawUnsafe(
        `update public.entitlements set status = $2
        where organization_id = $1 and module_key = 'front_office'`,
        ORG,
        status,
      );
    };

    const emptyMap = (map: UnitMap) => {
      expect(map.units).toEqual([]);
      expect(map.counts.sellable).toBe(0);
    };

    it("rooms are absent when the capability is off (RB-S1-03)", async () => {
      const setCapability =
        (enabled: boolean) => async (propertyId: string) => {
          await owner.$executeRawUnsafe(
            `update public.property_capabilities set enabled = $2
          where property_id = $1::uuid and capability_key = 'front_desk'`,
            propertyId,
            enabled,
          );
        };
      emptyMap(await mapWhile(setCapability(false), setCapability(true)));
    });

    it("rooms are absent when the subscription has lapsed (RB-S1-03)", async () => {
      // Suspended, not past due: a past due Organization is in a grace period
      // and still has its map.
      emptyMap(
        await mapWhile(setSubscription("suspended"), setSubscription("active")),
      );
    });

    it("rooms are absent when the entitlement is revoked (RB-S1-03)", async () => {
      emptyMap(
        await mapWhile(setEntitlement("revoked"), setEntitlement("active")),
      );
    });
  },
);

describe("adding rooms", { timeout: BUDGET_MS }, () => {
  const rooms = (propertyId: string, overrides = {}) => ({
    propertyId,
    building: "Block A",
    floor: 3,
    unitType: "room" as const,
    firstNumber: "301",
    count: 4,
    capacity: 2,
    letByTheBed: false,
    ...overrides,
  });

  const unitsNamed = async (propertyId: string) =>
    owner.$queryRawUnsafe<{ name: string; building: string | null }[]>(
      `select name, building from public.accommodation_units
        where property_id = $1::uuid order by name`,
      propertyId,
    );

  it("adding rooms writes them all (RB-S2-01)", async () => {
    const property = await newProperty();
    const added = await accommodation.addUnits(OWNER, rooms(property));
    expect(added.names).toEqual(["301", "302", "303", "304"]);
    expect(added.bedCount).toBe(0);

    const written = await owner.$queryRawUnsafe<
      { name: string; building: string | null; floor: number | null }[]
    >(
      `select name, building, floor from public.accommodation_units
        where property_id = $1::uuid order by name`,
      property,
    );
    expect(written).toEqual(
      ["301", "302", "303", "304"].map((name) => ({
        name,
        building: "Block A",
        floor: 3,
      })),
    );
    const record = await latestRecord(owner, "unit.added", property);
    expect(record?.locationId).toBe(property);
    expect(record?.context).toMatchObject({
      unitIds: added.unitIds,
      names: ["301", "302", "303", "304"],
    });
  });

  it("a room name already at the property refuses the whole add (RB-S2-06)", async () => {
    const property = await newProperty();
    await newUnit(property, "302");
    const recordsBefore = await owner.$queryRawUnsafe<{ count: number }[]>(
      `select count(*)::int as count from audit.records
        where action = 'unit.added' and subject_id = $1::uuid`,
      property,
    );

    const outcome = await accommodation.addUnits(OWNER, rooms(property)).then(
      () => null,
      (error: unknown) => error,
    );
    expect(outcome).toBeInstanceOf(UnitNameTakenError);
    expect((outcome as UnitNameTakenError).unitName).toBe("302");
    expect((outcome as UnitNameTakenError).message).toContain("302");

    // All or none: only the one that was already there.
    expect((await unitsNamed(property)).map((unit) => unit.name)).toEqual([
      "302",
    ]);
    const recordsAfter = await owner.$queryRawUnsafe<{ count: number }[]>(
      `select count(*)::int as count from audit.records
        where action = 'unit.added' and subject_id = $1::uuid`,
      property,
    );
    expect(recordsAfter[0]?.count).toBe(recordsBefore[0]?.count);
  });

  it("two people adding the same numbers at once leave one add and one refusal (RB-S2-11)", async () => {
    const property = await newProperty();
    const outcomes = await Promise.allSettled([
      accommodation.addUnits(OWNER, rooms(property)),
      rivalAccommodation.addUnits(OWNER, rooms(property)),
    ]);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    const refused = outcomes.find((o) => o.status === "rejected");
    expect(refused?.status === "rejected" && refused.reason).toBeInstanceOf(
      UnitNameTakenError,
    );
    expect(await unitsNamed(property)).toHaveLength(4);
  });

  it("letting by the bed writes one bed per sleeping place (RB-S2-02)", async () => {
    const property = await newProperty();
    const added = await accommodation.addUnits(
      OWNER,
      rooms(property, {
        firstNumber: "401",
        count: 2,
        capacity: 3,
        letByTheBed: true,
      }),
    );
    expect(added.bedCount).toBe(6);

    const beds = await owner.$queryRawUnsafe<
      {
        room: string;
        bed: string;
        capacity: number;
        building: string | null;
        floor: number | null;
      }[]
    >(
      `select room.name as room, bed.name as bed, bed.capacity,
              bed.building, bed.floor
         from public.accommodation_units as bed
         join public.accommodation_units as room on room.id = bed.parent_id
        where bed.property_id = $1::uuid
        order by room.name, bed.name`,
      property,
    );
    expect(beds).toEqual(
      ["401", "402"].flatMap((room) =>
        ["A", "B", "C"].map((bed) => ({
          room,
          bed,
          capacity: 1,
          building: "Block A",
          floor: 3,
        })),
      ),
    );

    // The rooms are not sellable whole: the booking form offers beds only.
    const bookable = await reservations.listBookableUnits(OWNER, property);
    expect(bookable.map((unit) => unit.unitId).sort()).toEqual(
      (
        await owner.$queryRawUnsafe<{ id: string }[]>(
          `select id from public.accommodation_units
            where property_id = $1::uuid and parent_id is not null`,
          property,
        )
      )
        .map((row) => row.id)
        .sort(),
    );
    await expect(
      reservations.createReservation(OWNER, {
        propertyId: property,
        accommodationUnitId: added.unitIds[0]!,
        guestName: "Whole Room",
        guestEmail: null,
        guestPhone: null,
        stayType: "guest",
        quotedRateMinor: null,
        quotedCurrency: null,
        startsOn: await propertyDay(property, 1),
        endsOn: await propertyDay(property, 2),
      }),
    ).rejects.toBeInstanceOf(ReservationRefusedError);
  });

  it("only a room let by the bed is refused a block, whole (RB-S3-04)", async () => {
    const property = await newProperty();
    const added = await accommodation.addUnits(
      OWNER,
      rooms(property, { count: 1, capacity: 2, letByTheBed: true }),
    );
    await expect(
      accommodation.blockUnit(OWNER, added.unitIds[0]!, "The whole room"),
    ).rejects.toBeInstanceOf(UnitOccupiedError);
    await expect(
      accommodation.blockUnit(OWNER, added.unitIds[0]!, "The whole room"),
    ).rejects.toThrow(/let by the bed/);
  });
});

describe("blocking without the permission", { timeout: BUDGET_MS }, () => {
  it("blocking without the permission is answered as a unit that cannot be blocked (RB-S3-09)", async () => {
    const property = await newProperty();
    const unit = await newUnit(property, "NP-1");

    await expect(
      accommodation.blockUnit(FINANCE, unit, "Not mine to block"),
    ).rejects.toBeInstanceOf(UnitRefusedError);
    expect(
      (
        await owner.$queryRawUnsafe<{ status: string }[]>(
          "select status from public.accommodation_units where id = $1::uuid",
          unit,
        )
      )[0]?.status,
    ).toBe("available");

    // And the way back, for a Unit somebody with the permission blocked.
    await accommodation.blockUnit(OWNER, unit, "Leak in the ceiling");
    await expect(
      accommodation.unblockUnit(FINANCE, unit),
    ).rejects.toBeInstanceOf(UnitRefusedError);
    expect(
      (
        await owner.$queryRawUnsafe<{ status: string }[]>(
          "select status from public.accommodation_units where id = $1::uuid",
          unit,
        )
      )[0]?.status,
    ).toBe("blocked");
    // The same answer as a Unit that is out of reach, or is not there.
    await expect(
      accommodation.blockUnit(OWNER, randomUUID(), "Nothing here"),
    ).rejects.toThrow("that Accommodation Unit cannot be blocked");
  });
});

describe("a blocked unit and the booking form", { timeout: BUDGET_MS }, () => {
  const booking = async (propertyId: string, unitId: string) => ({
    propertyId,
    accommodationUnitId: unitId,
    guestName: "Blocked Booking",
    guestEmail: null,
    guestPhone: null,
    stayType: "guest" as const,
    quotedRateMinor: null,
    quotedCurrency: null,
    startsOn: await propertyDay(propertyId, 1),
    endsOn: await propertyDay(propertyId, 2),
  });

  it("a blocked unit is not bookable (RB-S3-13)", async () => {
    const property = await newProperty();
    const room = await newUnit(property, "BK-1");
    const dorm = await newUnit(property, "BK-2");
    const bed = await newUnit(property, "A", { parentId: dorm });
    const open = await newUnit(property, "BK-3");
    await accommodation.blockUnit(OWNER, room, "Painting the walls");
    await accommodation.blockUnit(OWNER, bed, "Mattress being replaced");

    const offered = (await reservations.listBookableUnits(OWNER, property)).map(
      (unit) => unit.unitId,
    );
    expect(offered).toEqual([open]);

    await expect(
      reservations.createReservation(OWNER, await booking(property, room)),
    ).rejects.toBeInstanceOf(ReservationRefusedError);
    await expect(
      reservations.createReservation(OWNER, await booking(property, bed)),
    ).rejects.toBeInstanceOf(ReservationRefusedError);
    // The refusal is the one sentence every reason for "no" shares.
    await expect(
      reservations.createReservation(OWNER, await booking(property, room)),
    ).rejects.toThrow("that booking cannot be taken");

    // A free Unit next to them still books, so the refusals are about blocks.
    await expect(
      reservations.createReservation(OWNER, await booking(property, open)),
    ).resolves.toBeDefined();
  });

  it("a blocked room hides the beds under it (RB-S3-13)", async () => {
    const property = await newProperty();
    // A room is blocked while it has no beds — a room with beds refuses the
    // block — and beds are added under it afterwards.
    const room = await newUnit(property, "BR-1");
    await accommodation.blockUnit(OWNER, room, "Renovation of the floor");
    const bed = await newUnit(property, "A", { parentId: room });

    expect(
      (await reservations.listBookableUnits(OWNER, property)).map(
        (unit) => unit.unitId,
      ),
    ).not.toContain(bed);
    await expect(
      reservations.createReservation(OWNER, await booking(property, bed)),
    ).rejects.toBeInstanceOf(ReservationRefusedError);
  });

  it("an unblocked bed is back on the booking form, with no reason on it (RB-S3-08)", async () => {
    const property = await newProperty();
    const dorm = await newUnit(property, "UB-1");
    const bed = await newUnit(property, "A", { parentId: dorm });
    await accommodation.blockUnit(OWNER, bed, "Mattress being replaced");
    const offered = async () =>
      (await reservations.listBookableUnits(OWNER, property)).map(
        (unit) => unit.unitId,
      );
    // Seen gone first, so its return below is the unblock's doing.
    expect(await offered()).not.toContain(bed);

    await accommodation.unblockUnit(OWNER, bed);

    expect(await offered()).toEqual([bed]);
    expect(
      await owner.$queryRawUnsafe<{ status: string; reason: string | null }[]>(
        `select status, status_reason as reason
           from public.accommodation_units where id = $1::uuid`,
        bed,
      ),
    ).toEqual([{ status: "available", reason: null }]);
    await expect(
      reservations.createReservation(OWNER, await booking(property, bed)),
    ).resolves.toBeDefined();
  });
});

describe("blocking and checking in at once", { timeout: BUDGET_MS }, () => {
  /** Holds an owner transaction open until `release` is called. */
  function held(work: (tx: typeof owner) => Promise<void>) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const inside = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const done = owner.$transaction(
      async (tx) => {
        await work(tx as unknown as typeof owner);
        entered();
        await gate;
      },
      { timeout: 30_000 },
    );
    return { inside, release, done };
  }

  const settle = async <T>(promise: Promise<T>, ms: number) => {
    let timer!: NodeJS.Timeout;
    const outcome = await Promise.race([
      promise.then(
        () => "settled" as const,
        () => "settled" as const,
      ),
      new Promise<"waiting">((resolve) => {
        timer = setTimeout(() => resolve("waiting"), ms);
      }),
    ]);
    clearTimeout(timer);
    return outcome;
  };

  const statusAndStays = async (unitId: string) => {
    const [row] = await owner.$queryRawUnsafe<
      { status: string; inHouse: number }[]
    >(
      `select unit.status,
              (select count(*)::int from public.stays as stay
                where stay.accommodation_unit_id = unit.id
                  and stay.status = 'in_house') as "inHouse"
         from public.accommodation_units as unit
        where unit.id = $1::uuid`,
      unitId,
    );
    return row!;
  };

  it("a block waits for a check-in that has not committed and then refuses (RB-S3-07)", async () => {
    const property = await newProperty();
    const unit = await newUnit(property, "RACE-1");

    // The check-in has opened its Stay and not yet committed.
    const checkIn = held(async (tx) => {
      await tx.$executeRawUnsafe(
        `insert into public.stays
           (organization_id, property_id, accommodation_unit_id, stay_type,
            status, starts_on, ends_on)
         values ($1, $2, $3, 'guest', 'in_house',
                 app.property_today($2::uuid), app.property_today($2::uuid) + 1)`,
        ORG,
        property,
        unit,
      );
    });
    await checkIn.inside;

    const block = rivalAccommodation.blockUnit(OWNER, unit, "Race for the bed");
    // The share lock the check-in took makes the block wait for it.
    expect(await settle(block, 1500)).toBe("waiting");
    checkIn.release();
    await checkIn.done;

    await expect(block).rejects.toBeInstanceOf(UnitOccupiedError);
    expect(await statusAndStays(unit)).toEqual({
      status: "available",
      inHouse: 1,
    });
  });

  it("a check-in waits for a block that has not committed and then refuses (RB-S3-07)", async () => {
    const property = await newProperty();
    const unit = await newUnit(property, "RACE-2");
    const arriving = await reserve(property, unit, "Race Guest", 0, 2);

    // The block has updated the Unit and not yet committed.
    const block = held(async (tx) => {
      await tx.$executeRawUnsafe(
        `update public.accommodation_units
            set status = 'blocked', status_reason = 'Race for the bed'
          where id = $1::uuid`,
        unit,
      );
    });
    await block.inside;

    const checkIn = rivalReservations.checkIn(OWNER, arriving, {
      readinessAcknowledged: true,
    });
    expect(await settle(checkIn, 1500)).toBe("waiting");
    block.release();
    await block.done;

    await expect(checkIn).rejects.toBeInstanceOf(UnitNotInServiceError);
    expect(await statusAndStays(unit)).toEqual({
      status: "blocked",
      inHouse: 0,
    });
  });
});
