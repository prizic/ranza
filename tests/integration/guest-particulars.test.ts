/**
 * A student's particulars, through the modules (RANZ-110, RANZ-99, GP-S1-*).
 *
 * tests/database/guest_particulars.test.sql proves the checks, the policy and
 * the function one statement at a time. This proves what only the modules add:
 * the particulars a booking carries are recorded with it, read back for one
 * booking by whoever may read them and by nobody else, a value out of bounds
 * arrives as its own error naming the field, and a refused booking records
 * nothing about the student.
 *
 * A Property of each run's own; the Organization and its people are shared and
 * idempotent.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../packages/db/src";
import { GuestParticularsError } from "../../packages/ranza/guests/src";
import {
  ReservationPeriodError,
  createReservationsModule,
} from "../../packages/ranza/reservations/src";

const ORG = "d5400002-0000-4000-8000-000000000001";
const OWNER = "d5400001-0000-4000-8000-000000000001";
const HOUSEKEEPER = "d5400001-0000-4000-8000-000000000002";
const PROPERTY = randomUUID();

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const reservations = createReservationsModule({ db: prisma });
const owner = createPrismaClient(process.env.DIRECT_URL!);

let today: string;
/** One room per test: two open-ended registrations on one room overlap. */
const rooms: string[] = [];

beforeAll(async () => {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1, 'guest-particulars-owner@example.test'),
       ($2, 'guest-particulars-housekeeper@example.test')
     on conflict (id) do nothing`,
    OWNER,
    HOUSEKEEPER,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status)
     values ($1, 'Guest Particulars Organization', 'active')
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
     values ($1, $2, 'owner', 'organization_wide'),
            ($1, $3, 'housekeeping', 'organization_wide')
     on conflict (organization_id, user_id) do update
       set status = 'active', revoked_at = null`,
    ORG,
    OWNER,
    HOUSEKEEPER,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name, operating_model)
     values ($1, $2, $3, 'dormitory')`,
    PROPERTY,
    ORG,
    `Guest Particulars ${PROPERTY.slice(0, 8)}`,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     values ($1, $2, 'front_desk', true)`,
    PROPERTY,
    ORG,
  );
  const units = await owner.$queryRawUnsafe<{ id: string }[]>(
    `insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity)
     select $1::uuid, $2::uuid, 'P-10' || n, 'room', 2
       from generate_series(1, 4) as n
     returning id`,
    PROPERTY,
    ORG,
  );
  rooms.push(...units.map((unit) => unit.id));
  const [day] = await owner.$queryRawUnsafe<{ today: string }[]>(
    `select app.property_today($1::uuid)::text as today`,
    PROPERTY,
  );
  today = day!.today;
});

afterAll(async () => {
  await owner.$disconnect();
  await prisma.$disconnect();
});

const PARTICULARS = {
  dateOfBirth: "2008-03-14",
  institution: "ODTÜ",
  studyYear: 1,
  guardianName: "Ayten Öğrenci",
  guardianPhone: "+90 532 111 11 11",
  emergencyName: null,
  emergencyPhone: null,
};

const studentIn = (guestName: string, room: number) => ({
  propertyId: PROPERTY,
  accommodationUnitId: rooms[room]!,
  guestName,
  guestEmail: null,
  guestPhone: null,
  stayType: "resident" as const,
  startsOn: today,
  endsOn: null,
  quotedRateMinor: null,
  quotedCurrency: null,
});

describe("a student's particulars, with their registration", () => {
  it("are recorded with the booking and read back for it by whoever may read them", async () => {
    const created = await reservations.createReservation(OWNER, {
      ...studentIn("Zeynep Öğrenci", 0),
      particulars: PARTICULARS,
    });
    expect(
      await reservations.guestParticulars(OWNER, created.reservationId),
    ).toEqual(PARTICULARS);
  });

  it("are read by nobody without guests.read_particulars, though the booking is", async () => {
    const created = await reservations.createReservation(OWNER, {
      ...studentIn("Can Öğrenci", 1),
      particulars: { ...PARTICULARS, guardianName: "Murat Öğrenci" },
    });
    expect(
      await reservations.guestParticulars(HOUSEKEEPER, created.reservationId),
    ).toBeNull();
  });

  it("refuse a value out of bounds as their own error, naming the field", async () => {
    const refusal = await reservations
      .createReservation(OWNER, {
        ...studentIn("Ece Öğrenci", 2),
        particulars: { ...PARTICULARS, studyYear: 9 },
      })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(refusal).toBeInstanceOf(GuestParticularsError);
    expect((refusal as GuestParticularsError).field).toBe("studyYear");
  });

  it("are not recorded when the booking is refused", async () => {
    await expect(
      reservations.createReservation(OWNER, {
        ...studentIn("Deniz Geçmiş", 3),
        startsOn: "2000-01-01",
        particulars: { ...PARTICULARS, institution: "Bilkent" },
      }),
    ).rejects.toBeInstanceOf(ReservationPeriodError);
    const [left] = await owner.$queryRawUnsafe<{ count: bigint }[]>(
      `select count(*) as count from public.guest_particulars
        where organization_id = $1::uuid and institution = 'Bilkent'`,
      ORG,
    );
    expect(Number(left?.count)).toBe(0);
  });
});
