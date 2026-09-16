/**
 * The front desk's first operation, against a real database.
 *
 * The pgTAP suite proves the policies and the exclusion constraint. This proves
 * the module in front of them: that check-in is one transaction rather than
 * three writes that happen to usually all land, and that two people pressing the
 * button at the same moment produce one Stay — by losing on a constraint rather
 * than on a comparison the application made and lost.
 *
 * Every assertion here was checked by breaking what it asserts. Dropping
 * stays_no_double_booking turns the concurrency test green-for-two, which is the
 * failure it exists to catch.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuditModule } from "../../packages/platform/audit/src";
import {
  createReservationsModule,
  UnitUnavailableError,
} from "../../packages/ranza/reservations/src";
import { createPrismaClient } from "../../packages/db/src";
import { FRONT_DESK_CAPABILITY } from "../../packages/ranza/reservations/src";

const ORG = "d4000002-0000-4000-8000-000000000001";
const OTHER_ORG = "d4000002-0000-4000-8000-000000000002";
const PROPERTY = "d4000003-0000-4000-8000-000000000001";
const OTHER_PROPERTY = "d4000003-0000-4000-8000-000000000002";
const UNIT = "d4000004-0000-4000-8000-000000000001";
const CONTESTED = "d4000004-0000-4000-8000-000000000002";
const OTHER_UNIT = "d4000004-0000-4000-8000-000000000003";
const MEMBER = "d4000001-0000-4000-8000-000000000001";
const OUTSIDER = "d4000001-0000-4000-8000-000000000002";

// The tenant query path exactly as the host composes it: ranza_app, which is
// not an owner and has no BYPASSRLS. Pointing this at DIRECT_URL would make
// every assertion below pass for the wrong reason.
const prisma = createPrismaClient(process.env.DATABASE_URL!);
const reservations = createReservationsModule({ db: prisma });
const audit = createAuditModule({ db: prisma });

// A second client, so the concurrency test runs on two real connections rather
// than two promises sharing one. On one connection the second transaction would
// simply queue behind the first and the race would never happen.
const rival = createPrismaClient(process.env.DATABASE_URL!);
const rivalReservations = createReservationsModule({ db: rival });

const owner = createPrismaClient(process.env.DIRECT_URL!);

/** Fixtures go in as the owner: ranza_app may not create Properties or Units. */
async function seed() {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1,'front-desk-member@example.test'),
       ($2,'front-desk-outsider@example.test')
     on conflict (id) do nothing`,
    MEMBER,
    OUTSIDER,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status) values
       ($1,'Front Desk Organization','active'),
       ($2,'Front Desk Other','active')
     on conflict (id) do nothing`,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name, timezone) values
       ($1,$3,'Front Desk Property','Europe/Istanbul'),
       ($2,$4,'Front Desk Other Property','Europe/Istanbul')
     on conflict (id) do nothing`,
    PROPERTY,
    OTHER_PROPERTY,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units
       (id, property_id, organization_id, name, unit_type, capacity) values
       ($1,$4,$6,'FD-101','room',2),
       ($2,$4,$6,'FD-102','room',2),
       ($3,$5,$7,'FD-201','suite',4)
     on conflict (id) do nothing`,
    UNIT,
    CONTESTED,
    OTHER_UNIT,
    PROPERTY,
    OTHER_PROPERTY,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status) values
       ($1,'active'), ($2,'active')
     on conflict (organization_id) do nothing`,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key, status) values
       ($1,$3,'active'), ($2,$3,'active')
     on conflict (organization_id, module_key) do nothing`,
    ORG,
    OTHER_ORG,
    FRONT_DESK_CAPABILITY.moduleKey,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled) values
       ($1,$3,$5,true), ($2,$4,$5,true)
     on conflict (property_id, capability_key) do nothing`,
    PROPERTY,
    OTHER_PROPERTY,
    ORG,
    OTHER_ORG,
    FRONT_DESK_CAPABILITY.capabilityKey,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope) values
       ($1,$2,'manager','organization_wide'),
       ($3,$4,'manager','organization_wide')
     on conflict (organization_id, user_id) do nothing`,
    ORG,
    MEMBER,
    OTHER_ORG,
    OUTSIDER,
  );
}

/**
 * A Reservation arriving today at its own Property.
 *
 * The date is computed by the database in the Property's timezone rather than in
 * this process, because that is what the arrivals query compares against. A
 * fixture built from the runner's clock would pass in Istanbul and fail in CI.
 */
async function reserve(
  id: string,
  propertyId: string,
  organizationId: string,
  unitId: string,
  guestName: string,
  nights: { from: number; to: number } = { from: 0, to: 3 },
): Promise<void> {
  await owner.$executeRawUnsafe(
    `insert into public.reservations
       (id, organization_id, property_id, accommodation_unit_id,
        guest_name, stay_type, status, starts_on, ends_on)
     select $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, 'guest', 'confirmed',
            (now() at time zone property.timezone)::date + $6::int,
            (now() at time zone property.timezone)::date + $7::int
     from public.properties as property
     where property.id = $3::uuid
     on conflict (id) do nothing`,
    id,
    organizationId,
    propertyId,
    unitId,
    guestName,
    nights.from,
    nights.to,
  );
}

/**
 * A fresh Reservation id per run.
 *
 * Fixed ids would be tidier, and they were — until a re-run found the previous
 * run's audit record under the same subject. Audit records cannot be deleted,
 * which is the whole point of them, so the only way to assert "exactly one
 * record" and "no record at all" honestly is for each run to have a subject
 * nothing has ever acted on.
 */
const reservationId = () => randomUUID();

beforeAll(async () => {
  await seed();
});

afterAll(async () => {
  // Children first: every foreign key here is ON DELETE RESTRICT, because
  // operational history is never silently removed (AGENTS.md). The audit
  // records stay — that is the point of them — and dropping the memberships is
  // what puts them back out of reach.
  for (const statement of [
    `delete from public.stays where organization_id in ('${ORG}','${OTHER_ORG}')`,
    `delete from public.reservations where organization_id in ('${ORG}','${OTHER_ORG}')`,
    `delete from public.property_capabilities where organization_id in ('${ORG}','${OTHER_ORG}')`,
    `delete from public.organization_memberships where organization_id in ('${ORG}','${OTHER_ORG}')`,
    `delete from public.entitlements where organization_id in ('${ORG}','${OTHER_ORG}')`,
    `delete from public.subscriptions where organization_id in ('${ORG}','${OTHER_ORG}')`,
    `delete from public.accommodation_units where organization_id in ('${ORG}','${OTHER_ORG}')`,
    `delete from public.properties where organization_id in ('${ORG}','${OTHER_ORG}')`,
    `delete from public.organizations where id in ('${ORG}','${OTHER_ORG}')`,
    `delete from public.users where id in ('${MEMBER}','${OUTSIDER}')`,
  ]) {
    await owner.$executeRawUnsafe(statement);
  }

  await owner.$disconnect();
  await rival.$disconnect();
  await prisma.$disconnect();
});

describe("today's arrivals", () => {
  const ARRIVING = reservationId();
  const ELSEWHERE = reservationId();
  const TOMORROW = reservationId();

  beforeAll(async () => {
    await reserve(ARRIVING, PROPERTY, ORG, UNIT, "Ada Lovelace");
    await reserve(
      ELSEWHERE,
      OTHER_PROPERTY,
      OTHER_ORG,
      OTHER_UNIT,
      "Grace Hopper",
    );
    await reserve(TOMORROW, PROPERTY, ORG, CONTESTED, "Katherine Johnson", {
      from: 1,
      to: 4,
    });
  });

  it("shows the Reservations arriving today at a Property the viewer reaches", async () => {
    const arrivals = await reservations.listArrivals(MEMBER, PROPERTY);
    expect(arrivals.map((arrival) => arrival.guestName)).toEqual([
      "Ada Lovelace",
    ]);
    expect(arrivals[0]?.canCheckIn).toBe(true);
    expect(arrivals[0]?.unitName).toBe("FD-101");
  });

  it("shows nothing from a Property in another Organization", async () => {
    await expect(
      reservations.listArrivals(MEMBER, OTHER_PROPERTY),
    ).resolves.toEqual([]);
  });

  it("shows nothing to a Staff Member of another Organization", async () => {
    await expect(
      reservations.listArrivals(OUTSIDER, PROPERTY),
    ).resolves.toEqual([]);
  });
});

describe("checking in", () => {
  const TO_CHECK_IN = reservationId();

  beforeAll(async () => {
    await reserve(TO_CHECK_IN, PROPERTY, ORG, UNIT, "Hedy Lamarr");
  });

  it("creates the Stay, moves the Reservation, and records who did it", async () => {
    const { stayId } = await reservations.checkIn(MEMBER, TO_CHECK_IN);
    expect(stayId).toMatch(/^[0-9a-f-]{36}$/);

    const [stay] = await owner.$queryRawUnsafe<
      { status: string; reservationId: string; unitId: string }[]
    >(
      `select status,
              reservation_id as "reservationId",
              accommodation_unit_id as "unitId"
       from public.stays where id = $1::uuid`,
      stayId,
    );
    expect(stay?.status).toBe("in_house");
    expect(stay?.reservationId).toBe(TO_CHECK_IN);
    expect(stay?.unitId).toBe(UNIT);

    const [reservation] = await owner.$queryRawUnsafe<{ status: string }[]>(
      `select status from public.reservations where id = $1::uuid`,
      TO_CHECK_IN,
    );
    expect(reservation?.status).toBe("checked_in");

    const history = await audit.historyOf(MEMBER, "reservation", TO_CHECK_IN);
    expect(history).toHaveLength(1);
    expect(history[0]?.action).toBe("reservation.checked_in");
    expect(history[0]?.actorId).toBe(MEMBER);
    expect(history[0]?.context).toMatchObject({ stayId });
  });

  it("refuses a Reservation that has already arrived", async () => {
    await expect(reservations.checkIn(MEMBER, TO_CHECK_IN)).rejects.toThrow();
  });

  it("refuses a Reservation belonging to another Organization", async () => {
    const OTHERS = reservationId();
    await reserve(OTHERS, OTHER_PROPERTY, OTHER_ORG, OTHER_UNIT, "Intruder");

    await expect(reservations.checkIn(MEMBER, OTHERS)).rejects.toThrow();

    // The refusal must be a refusal, not a silent no-op that left the row moved.
    const [reservation] = await owner.$queryRawUnsafe<{ status: string }[]>(
      `select status from public.reservations where id = $1::uuid`,
      OTHERS,
    );
    expect(reservation?.status).toBe("confirmed");
  });
});

describe("a failed check-in leaves nothing half-done", () => {
  const FIRST = reservationId();
  const SECOND = reservationId();

  beforeAll(async () => {
    await reserve(FIRST, PROPERTY, ORG, CONTESTED, "Mary Jackson", {
      from: 10,
      to: 14,
    });
    // Overlaps FIRST on the same Unit. Two Reservations may overlap — whether
    // that is allowed is an overbooking policy nobody has written — but two
    // current Stays may not.
    await reserve(SECOND, PROPERTY, ORG, CONTESTED, "Dorothy Vaughan", {
      from: 12,
      to: 16,
    });
  });

  it("rolls back the Reservation and the audit record when the Unit is taken", async () => {
    await reservations.checkIn(MEMBER, FIRST);

    await expect(reservations.checkIn(MEMBER, SECOND)).rejects.toBeInstanceOf(
      UnitUnavailableError,
    );

    const [reservation] = await owner.$queryRawUnsafe<{ status: string }[]>(
      `select status from public.reservations where id = $1::uuid`,
      SECOND,
    );
    expect(reservation?.status).toBe("confirmed");

    const stays = await owner.$queryRawUnsafe<{ id: string }[]>(
      `select id from public.stays where reservation_id = $1::uuid`,
      SECOND,
    );
    expect(stays).toEqual([]);

    // The third write is rolled back with the other two. An audit trail
    // recording an action that never happened is as wrong as one missing an
    // action that did.
    await expect(
      audit.historyOf(MEMBER, "reservation", SECOND),
    ).resolves.toEqual([]);
  });
});

describe("two people pressing the button at once", () => {
  const LEFT = reservationId();
  const RIGHT = reservationId();

  beforeAll(async () => {
    await reserve(LEFT, PROPERTY, ORG, CONTESTED, "Annie Easley", {
      from: 30,
      to: 34,
    });
    await reserve(RIGHT, PROPERTY, ORG, CONTESTED, "Melba Roy", {
      from: 32,
      to: 36,
    });
  });

  it("produces exactly one Stay, and the loser fails on the constraint", async () => {
    // Two clients, so these are two connections racing rather than two promises
    // taking turns on one.
    const outcomes = await Promise.allSettled([
      reservations.checkIn(MEMBER, LEFT),
      rivalReservations.checkIn(MEMBER, RIGHT),
    ]);

    const won = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const lost = outcomes.filter((outcome) => outcome.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);

    // The distinction that matters: the loser was stopped by the database, not
    // by the application noticing first. An availability check before the
    // insert would have let both through.
    const reason = (lost[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(UnitUnavailableError);

    const stays = await owner.$queryRawUnsafe<{ id: string }[]>(
      `select id from public.stays
       where accommodation_unit_id = $1::uuid
         and reservation_id in ($2::uuid, $3::uuid)`,
      CONTESTED,
      LEFT,
      RIGHT,
    );
    expect(stays).toHaveLength(1);
  });
});
