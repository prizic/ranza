/**
 * Whom a room admits, through the modules (RANZ-110, RB-S5-*).
 *
 * tests/database/room_gender.test.sql proves the triggers, the function and the
 * grants one statement at a time. This proves what only the modules add: a
 * refusal arriving as its own error rather than a database one, the gender a
 * booking needed landing on the Guest's file, and the audit record a change
 * leaves — or does not leave, when nothing changed.
 *
 * A Property of each run's own; the Organization and the Owner are shared and
 * idempotent.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  RoomStillHoldsSomeoneError,
  UnitRefusedError,
  createAccommodationModule,
} from "../../packages/ranza/accommodation/src";
import { createPrismaClient } from "../../packages/db/src";
import {
  GuestNotAdmittedError,
  createReservationsModule,
} from "../../packages/ranza/reservations/src";
import { latestRecord } from "./audit-record";

const ORG = "d5300002-0000-4000-8000-000000000001";
const OWNER = "d5300001-0000-4000-8000-000000000001";
const PROPERTY = randomUUID();

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const accommodation = createAccommodationModule({ db: prisma });
const reservations = createReservationsModule({ db: prisma });
const owner = createPrismaClient(process.env.DIRECT_URL!);

let today: string;
let womenOnly: string;
let anyone: string;
let bed: string;

beforeAll(async () => {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email)
     values ($1, 'room-gender-owner@example.test')
     on conflict (id) do nothing`,
    OWNER,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status)
     values ($1, 'Room Gender Organization', 'active')
     on conflict (id) do nothing`,
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
       (organization_id, user_id, role, access_scope)
     values ($1, $2, 'owner', 'organization_wide')
     on conflict (organization_id, user_id) do update
       set status = 'active', revoked_at = null`,
    ORG,
    OWNER,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name, operating_model)
     values ($1, $2, $3, 'dormitory')`,
    PROPERTY,
    ORG,
    `Room Gender ${PROPERTY.slice(0, 8)}`,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     values ($1, $2, 'front_desk', true)`,
    PROPERTY,
    ORG,
  );
  const [day] = await owner.$queryRawUnsafe<{ today: string }[]>(
    `select app.property_today($1::uuid)::text as today`,
    PROPERTY,
  );
  today = day!.today;

  const women = await accommodation.addUnits(OWNER, {
    propertyId: PROPERTY,
    building: null,
    floor: 1,
    unitType: "room",
    firstNumber: "101",
    count: 1,
    capacity: 2,
    letByTheBed: true,
    admits: "female",
  });
  womenOnly = women.unitIds[0]!;
  const open = await accommodation.addUnits(OWNER, {
    propertyId: PROPERTY,
    building: null,
    floor: 1,
    unitType: "room",
    firstNumber: "201",
    count: 1,
    capacity: 2,
    letByTheBed: false,
    admits: null,
  });
  anyone = open.unitIds[0]!;
  const [firstBed] = await owner.$queryRawUnsafe<{ id: string }[]>(
    `select id from public.accommodation_units
      where parent_id = $1::uuid order by name limit 1`,
    womenOnly,
  );
  bed = firstBed!.id;
});

afterAll(async () => {
  await owner.$disconnect();
  await prisma.$disconnect();
});

const residentIn = (unitId: string, guestName: string) => ({
  propertyId: PROPERTY,
  accommodationUnitId: unitId,
  guestName,
  guestEmail: null,
  guestPhone: null,
  stayType: "resident" as const,
  startsOn: today,
  endsOn: null,
  quotedRateMinor: null,
  quotedCurrency: null,
});

describe("a room added for women only (RB-S5-14)", () => {
  it("is listed and bookable as one, its beds answering as the room, and the addition says so", async () => {
    const map = await accommodation.listUnits(OWNER, PROPERTY);
    expect(map.units.find((unit) => unit.unitId === womenOnly)?.admits).toBe(
      "female",
    );
    const bookable = await reservations.listBookableUnits(OWNER, PROPERTY);
    expect(bookable.find((unit) => unit.unitId === bed)?.admits).toBe("female");
    expect(bookable.find((unit) => unit.unitId === anyone)?.admits).toBeNull();

    const additions = await owner.$queryRawUnsafe<
      { context: Record<string, unknown> }[]
    >(
      `select context from audit.records
        where action = 'unit.added' and location_id = $1::uuid
        order by context->'names'->>0`,
      PROPERTY,
    );
    expect(additions.map((record) => record.context.admits)).toEqual([
      "female",
      null,
    ]);
  });
});

describe("a booking into a gendered room (RB-S5-02, RB-S5-16)", () => {
  it("records the gender it was asked on the Guest's file", async () => {
    const created = await reservations.createReservation(OWNER, {
      ...residentIn(bed, "Zeynep Arslan"),
      guestGender: "female",
    });
    const [guest] = await owner.$queryRawUnsafe<{ gender: string | null }[]>(
      `select guest.gender
         from public.reservations as booking
         join public.guests as guest on guest.id = booking.guest_id
        where booking.id = $1::uuid`,
      created.reservationId,
    );
    expect(guest?.gender).toBe("female");
  });

  it("is refused as its own error for a gender the room does not admit, and for none", async () => {
    await expect(
      reservations.createReservation(OWNER, {
        ...residentIn(bed, "Burak Yıldız"),
        guestGender: "male",
      }),
    ).rejects.toBeInstanceOf(GuestNotAdmittedError);
    await expect(
      reservations.createReservation(OWNER, residentIn(bed, "Nobody Asked")),
    ).rejects.toBeInstanceOf(GuestNotAdmittedError);

    // Refused whole: neither Guest was left behind on a booking.
    const [left] = await owner.$queryRawUnsafe<{ count: bigint }[]>(
      `select count(*) as count
         from public.reservations as booking
         join public.guests as guest on guest.id = booking.guest_id
        where booking.property_id = $1::uuid
          and guest.full_name in ('Burak Yıldız', 'Nobody Asked')`,
      PROPERTY,
    );
    expect(Number(left?.count)).toBe(0);
  });
});

describe("changing whom a room admits (RB-S5-08, RB-S5-13)", () => {
  it("is refused as its own error while somebody booked would no longer be admitted", async () => {
    await expect(
      accommodation.setRoomAdmits(OWNER, womenOnly, "male"),
    ).rejects.toBeInstanceOf(RoomStillHoldsSomeoneError);
    const [room] = await owner.$queryRawUnsafe<{ admits: string | null }[]>(
      `select admits from public.accommodation_units where id = $1::uuid`,
      womenOnly,
    );
    expect(room?.admits).toBe("female");
  });

  it("records the room's name, what it admitted and what it admits now, at the Property", async () => {
    await accommodation.setRoomAdmits(OWNER, anyone, "male");
    const change = await latestRecord(owner, "unit.admits_changed", anyone);
    expect(change?.locationId).toBe(PROPERTY);
    expect(change?.context).toEqual({ name: "201", from: null, to: "male" });
  });

  it("records nothing, and touches nothing, when the room already admits that", async () => {
    const before = await owner.$queryRawUnsafe<{ count: bigint }[]>(
      `select count(*) as count from audit.records
        where action = 'unit.admits_changed' and subject_id = $1::uuid`,
      anyone,
    );
    const [stamp] = await owner.$queryRawUnsafe<{ updated_at: Date }[]>(
      `select updated_at from public.accommodation_units where id = $1::uuid`,
      anyone,
    );

    await accommodation.setRoomAdmits(OWNER, anyone, "male");

    const after = await owner.$queryRawUnsafe<{ count: bigint }[]>(
      `select count(*) as count from audit.records
        where action = 'unit.admits_changed' and subject_id = $1::uuid`,
      anyone,
    );
    const [restamp] = await owner.$queryRawUnsafe<{ updated_at: Date }[]>(
      `select updated_at from public.accommodation_units where id = $1::uuid`,
      anyone,
    );
    expect(Number(after[0]?.count)).toBe(Number(before[0]?.count));
    expect(restamp?.updated_at).toEqual(stamp?.updated_at);
  });

  it("is refused for a bed, which answers as its room", async () => {
    await expect(
      accommodation.setRoomAdmits(OWNER, bed, "female"),
    ).rejects.toBeInstanceOf(UnitRefusedError);
  });
});
