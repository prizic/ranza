/**
 * What taking a booking and checking somebody in promise, beyond the happy
 * path the front-office suite walks (decision sheet 2026-09-29).
 *
 * Each describe answers one approved row of
 * docs/features/reservations-and-guests/edge-cases.csv or
 * docs/features/check-in/edge-cases.csv, and each assertion was watched go red
 * with the thing it guards broken — the record is
 * docs/evidence/decision-sheet/front-desk.md.
 *
 * A fresh Organization per run. Audit records and a closed business day cannot
 * be removed, and a fixed id that the worker had closed yesterday for would
 * refuse the next run's fixtures on a date nothing here chose.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CheckInError,
  CheckInTooEarlyError,
  createReservationsModule,
  ReservationPeriodError,
  ReservationRefusedError,
  UnitHasOccupantError,
  UnitNotReadyError,
  UnitUnavailableError,
} from "../../packages/ranza/reservations/src";
import type { NewReservation } from "../../packages/ranza/reservations/src";
import { createPrismaClient } from "../../packages/db/src";

const ORG = randomUUID();
const OTHER_ORG = randomUUID();
const PROPERTY = randomUUID();
/** Organization A's, and nobody narrow is assigned to it. */
const UNASSIGNED = randomUUID();
/** A Property whose local time is about 02:00 now, before a 06:00 cutoff. */
const SMALL_HOURS = randomUUID();
const OTHER_PROPERTY = randomUUID();
const MANAGER = randomUUID();
/** The shipped front desk role, reaching PROPERTY and nothing else. */
const NARROW = randomUUID();
const OUTSIDER = randomUUID();
/** The shipped housekeeping role: reaches every Property, checks nobody in. */
const HOUSEKEEPER = randomUUID();
const USERS = [MANAGER, NARROW, OUTSIDER, HOUSEKEEPER];

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const reservations = createReservationsModule({ db: prisma });
// A second connection, so a race is two transactions and not two promises
// taking turns on one.
const rival = createPrismaClient(process.env.DATABASE_URL!);
const rivalReservations = createReservationsModule({ db: rival });
const owner = createPrismaClient(process.env.DIRECT_URL!);

/**
 * An `Etc/GMT` zone whose local time is about 02:00 right now.
 *
 * With a 06:00 cutoff that makes the Property's business date yesterday's
 * calendar date at whatever hour the suite runs, which a fixed zone cannot: a
 * test pinned to Istanbul passes at 01:00 and asserts nothing at noon. The
 * `Etc/GMT` names are inverted — `Etc/GMT-3` is UTC+3.
 */
function smallHoursZone(): string {
  let offset = 2 - new Date().getUTCHours();
  if (offset < -12) offset += 24;
  if (offset === 0) return "Etc/GMT";
  return offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
}

/** A date relative to a Property's own today, as `YYYY-MM-DD`. */
async function day(propertyId: string, days: number): Promise<string> {
  const [row] = await owner.$queryRawUnsafe<{ day: string }[]>(
    `select to_char(app.property_today($1::uuid) + $2::int, 'YYYY-MM-DD') as day`,
    propertyId,
    days,
  );
  return row!.day;
}

/** A Unit of this run's own. */
async function aUnit(propertyId = PROPERTY, org = ORG): Promise<string> {
  const id = randomUUID();
  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units
       (id, property_id, organization_id, name, unit_type, capacity)
     values ($1::uuid, $2::uuid, $3::uuid, $4, 'room', 2)`,
    id,
    propertyId,
    org,
    `BC-${id.slice(0, 8)}`,
  );
  return id;
}

/** A booking the module takes, unpriced: this suite sets no price list. */
function booking(
  unitId: string,
  startsOn: string,
  endsOn: string | null,
  overrides: Partial<NewReservation> = {},
): NewReservation {
  return {
    propertyId: PROPERTY,
    accommodationUnitId: unitId,
    guestName: "Booked Guest",
    guestEmail: null,
    guestPhone: null,
    stayType: "guest",
    startsOn,
    endsOn,
    quotedRateMinor: null,
    quotedCurrency: null,
    ...overrides,
  };
}

async function statusOf(reservationId: string): Promise<string | undefined> {
  const [row] = await owner.$queryRawUnsafe<{ status: string }[]>(
    "select status from public.reservations where id = $1::uuid",
    reservationId,
  );
  return row?.status;
}

async function staysFor(reservationId: string): Promise<number> {
  const [row] = await owner.$queryRawUnsafe<{ count: number }[]>(
    "select count(*)::int as count from public.stays where reservation_id = $1::uuid",
    reservationId,
  );
  return row!.count;
}

/** Wait until a statement matching `query` is blocked on a lock `count` times. */
async function untilWaiting(query: string, count: number): Promise<void> {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const [row] = await owner.$queryRawUnsafe<{ count: number }[]>(
      `select count(*)::int as count from pg_stat_activity
        where wait_event_type = 'Lock' and query ilike $1`,
      `%${query}%`,
    );
    if ((row?.count ?? 0) >= count) return;
    if (Date.now() > deadline) throw new Error(`${query} never waited`);
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

beforeAll(async () => {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1, $5), ($2, $6), ($3, $7), ($4, $8)`,
    MANAGER,
    NARROW,
    OUTSIDER,
    HOUSEKEEPER,
    `bc-manager-${MANAGER}@example.test`,
    `bc-narrow-${NARROW}@example.test`,
    `bc-outsider-${OUTSIDER}@example.test`,
    `bc-housekeeper-${HOUSEKEEPER}@example.test`,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status) values
       ($1, 'Booking Organization', 'active'),
       ($2, 'Booking Other Organization', 'active')`,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties
       (id, organization_id, name, timezone, business_date_cutoff) values
       ($1, $5, 'Booking Property', 'Europe/Istanbul', '04:00'),
       ($2, $5, 'Booking Unassigned', 'Europe/Istanbul', '04:00'),
       ($3, $5, 'Booking Small Hours', $7, '06:00'),
       ($4, $6, 'Booking Other Property', 'Europe/Istanbul', '04:00')`,
    PROPERTY,
    UNASSIGNED,
    SMALL_HOURS,
    OTHER_PROPERTY,
    ORG,
    OTHER_ORG,
    smallHoursZone(),
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status) values
       ($1, 'active'), ($2, 'active')`,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key) values
       ($1, 'front_office'), ($1, 'housekeeping'), ($2, 'front_office')`,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     select property.id, property.organization_id, wanted.key, true
       from public.properties as property
      cross join (values ('front_desk'), ('housekeeping')) as wanted (key)
      where property.id in ($1::uuid, $2::uuid, $3::uuid, $4::uuid)`,
    PROPERTY,
    UNASSIGNED,
    SMALL_HOURS,
    OTHER_PROPERTY,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope) values
       ($1, $3, 'manager', 'organization_wide'),
       ($1, $4, 'front_desk', 'assigned_properties'),
       ($2, $5, 'manager', 'organization_wide'),
       ($1, $6, 'housekeeping', 'organization_wide')`,
    ORG,
    OTHER_ORG,
    MANAGER,
    NARROW,
    OUTSIDER,
    HOUSEKEEPER,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_assignments (property_id, organization_id, user_id)
     values ($1, $2, $3)`,
    PROPERTY,
    ORG,
    NARROW,
  );

  // The fixture has to produce the condition the small-hours tests are about,
  // or they would pass while testing an ordinary afternoon.
  const [clock] = await owner.$queryRawUnsafe<{ before: boolean }[]>(
    `select app.property_today(id) < (now() at time zone timezone)::date as before
       from public.properties where id = $1::uuid`,
    SMALL_HOURS,
  );
  expect(clock?.before).toBe(true);
});

afterAll(async () => {
  // Children first: every foreign key here is ON DELETE RESTRICT. Audit
  // records stay, which is the point of them.
  const orgs = `('${ORG}','${OTHER_ORG}')`;
  for (const statement of [
    `delete from public.stays where organization_id in ${orgs}`,
    `delete from public.reservations where organization_id in ${orgs}`,
    `delete from public.housekeeping_unit_status where organization_id in ${orgs}`,
    `delete from public.property_assignments where organization_id in ${orgs}`,
    `delete from public.property_capabilities where organization_id in ${orgs}`,
    `delete from public.organization_memberships where organization_id in ${orgs}`,
    `delete from public.entitlements where organization_id in ${orgs}`,
    `delete from public.subscriptions where organization_id in ${orgs}`,
    `delete from outbox.events where organization_id in ${orgs}`,
    `delete from public.accommodation_units where organization_id in ${orgs}`,
    `delete from public.guests where organization_id in ${orgs}`,
    `delete from public.properties where organization_id in ${orgs}`,
    `delete from public.organizations where id in ${orgs}`,
    `delete from public.users where id in (${USERS.map((id) => `'${id}'`).join(",")})`,
  ]) {
    await owner.$executeRawUnsafe(statement);
  }
  await Promise.all([
    prisma.$disconnect(),
    rival.$disconnect(),
    owner.$disconnect(),
  ]);
});

describe("an open-ended booking is the Resident's (RG-S1-11)", () => {
  it("refuses a Guest booking with no departure, and writes nothing", async () => {
    const unit = await aUnit();
    await expect(
      reservations.createReservation(
        MANAGER,
        booking(unit, await day(PROPERTY, 5), null, {
          guestName: "Open Ended Guest",
        }),
      ),
    ).rejects.toThrow(
      new ReservationPeriodError("a Guest booking needs a departure date"),
    );

    const [written] = await owner.$queryRawUnsafe<{ count: number }[]>(
      `select count(*)::int as count from public.reservations
        where accommodation_unit_id = $1::uuid`,
      unit,
    );
    expect(written?.count).toBe(0);
  });

  it("books a Resident with no departure, holding the Unit from arrival on", async () => {
    const unit = await aUnit();
    await reservations.createReservation(
      MANAGER,
      booking(unit, await day(PROPERTY, 5), null, {
        guestName: "Open Ended Resident",
        stayType: "resident",
      }),
    );
    await expect(
      reservations.createReservation(
        MANAGER,
        booking(unit, await day(PROPERTY, 400), await day(PROPERTY, 402)),
      ),
    ).rejects.toBeInstanceOf(UnitUnavailableError);
  });
});

describe("the Property's business date, not its calendar date", () => {
  it("RG-S1-10: takes a booking in the small hours for the business date, yesterday's calendar date", async () => {
    const unit = await aUnit(SMALL_HOURS);
    const today = await day(SMALL_HOURS, 0);
    const created = await reservations.createReservation(
      MANAGER,
      booking(unit, today, await day(SMALL_HOURS, 1), {
        propertyId: SMALL_HOURS,
      }),
    );
    expect(created.reservationId).toBeTruthy();

    // And the day before the business date is still the past.
    await expect(
      reservations.createReservation(
        MANAGER,
        booking(unit, await day(SMALL_HOURS, -1), today, {
          propertyId: SMALL_HOURS,
        }),
      ),
    ).rejects.toThrow(
      new ReservationPeriodError("a Reservation cannot start before today"),
    );
  });

  it("CI-S1-06: checks in a booking for the business date in the small hours", async () => {
    const unit = await aUnit(SMALL_HOURS);
    const today = await day(SMALL_HOURS, 0);
    const { reservationId } = await reservations.createReservation(
      MANAGER,
      booking(unit, today, await day(SMALL_HOURS, 1), {
        propertyId: SMALL_HOURS,
      }),
    );

    const { stayId } = await reservations.checkIn(MANAGER, reservationId);
    const [stay] = await owner.$queryRawUnsafe<{ startsOn: string }[]>(
      `select to_char(starts_on, 'YYYY-MM-DD') as "startsOn"
         from public.stays where id = $1::uuid`,
      stayId,
    );
    expect(stay?.startsOn).toBe(today);
  });

  it("CI-S1-07: tells the desk a booking from the new calendar day starts on the next business date", async () => {
    const unit = await aUnit(SMALL_HOURS);
    const tomorrow = await day(SMALL_HOURS, 1);
    const { reservationId } = await reservations.createReservation(
      MANAGER,
      booking(unit, tomorrow, await day(SMALL_HOURS, 2), {
        propertyId: SMALL_HOURS,
      }),
    );

    const refused = await reservations
      .checkIn(MANAGER, reservationId)
      .catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(CheckInTooEarlyError);
    expect((refused as CheckInTooEarlyError).startsOn).toBe(tomorrow);
    expect(await statusOf(reservationId)).toBe("confirmed");
    expect(await staysFor(reservationId)).toBe(0);
  });

  it("CI-S1-07: says nothing about an early booking to somebody who could not check it in", async () => {
    const unit = await aUnit(SMALL_HOURS);
    const { reservationId } = await reservations.createReservation(
      MANAGER,
      booking(unit, await day(SMALL_HOURS, 1), await day(SMALL_HOURS, 2), {
        propertyId: SMALL_HOURS,
      }),
    );

    // Another Organization: the policies hide the row.
    const outsider = await reservations
      .checkIn(OUTSIDER, reservationId)
      .catch((error: unknown) => error);
    expect(outsider).toBeInstanceOf(CheckInError);
    expect(outsider).not.toBeInstanceOf(CheckInTooEarlyError);

    // Their own Organization, a Property they are not assigned to.
    const narrow = await reservations
      .checkIn(NARROW, reservationId)
      .catch((error: unknown) => error);
    expect(narrow).toBeInstanceOf(CheckInError);
    expect(narrow).not.toBeInstanceOf(CheckInTooEarlyError);

    // Readable, but checking in is not their job.
    const housekeeper = await reservations
      .checkIn(HOUSEKEEPER, reservationId)
      .catch((error: unknown) => error);
    expect(housekeeper).toBeInstanceOf(CheckInError);
    expect(housekeeper).not.toBeInstanceOf(CheckInTooEarlyError);

    // Readable, but the front desk is off there: the row is visible and could
    // not be checked in on its day either.
    await owner.$executeRawUnsafe(
      `update public.property_capabilities set enabled = false
        where property_id = $1::uuid and capability_key = 'front_desk'`,
      SMALL_HOURS,
    );
    try {
      const gated = await reservations
        .checkIn(MANAGER, reservationId)
        .catch((error: unknown) => error);
      expect(gated).toBeInstanceOf(CheckInError);
      expect(gated).not.toBeInstanceOf(CheckInTooEarlyError);
    } finally {
      await owner.$executeRawUnsafe(
        `update public.property_capabilities set enabled = true
          where property_id = $1::uuid and capability_key = 'front_desk'`,
        SMALL_HOURS,
      );
    }
  });
});

describe("a walk-in (CI-S1-08)", () => {
  it("is booked from today and checked in at once", async () => {
    const unit = await aUnit();
    const { reservationId } = await reservations.createReservation(
      MANAGER,
      booking(unit, await day(PROPERTY, 0), await day(PROPERTY, 1), {
        guestName: "Walk In",
      }),
    );
    const { stayId } = await reservations.checkIn(MANAGER, reservationId);
    expect(stayId).toBeTruthy();
    expect(await statusOf(reservationId)).toBe("checked_in");
  });
});

describe("an open-ended Resident checked in (CI-S1-09)", () => {
  it("holds the Unit from arrival onwards, so a later booking is refused", async () => {
    const unit = await aUnit();
    const { reservationId } = await reservations.createReservation(
      MANAGER,
      booking(unit, await day(PROPERTY, 0), null, {
        guestName: "Resident Arriving",
        stayType: "resident",
      }),
    );
    const { stayId } = await reservations.checkIn(MANAGER, reservationId);

    const [stay] = await owner.$queryRawUnsafe<{ endsOn: string | null }[]>(
      `select ends_on::text as "endsOn" from public.stays where id = $1::uuid`,
      stayId,
    );
    expect(stay?.endsOn).toBeNull();

    // The Reservation no longer holds anything once checked in; the Stay does,
    // for every night after it began (ADR 0033).
    await expect(
      reservations.createReservation(
        MANAGER,
        booking(unit, await day(PROPERTY, 300), await day(PROPERTY, 302)),
      ),
    ).rejects.toBeInstanceOf(UnitHasOccupantError);
  });
});

describe("dirty and occupied at once (CI-S1-19)", () => {
  it("is refused as occupied without asking about readiness, and writes nothing", async () => {
    const unit = await aUnit();
    // Somebody due out this morning and still here, in a room nobody cleaned.
    await owner.$executeRawUnsafe(
      `insert into public.stays
         (organization_id, property_id, accommodation_unit_id, stay_type,
          status, starts_on, ends_on)
       values ($1::uuid, $2::uuid, $3::uuid, 'guest', 'in_house',
               app.property_today($2::uuid) - 2, app.property_today($2::uuid))`,
      ORG,
      PROPERTY,
      unit,
    );
    await owner.$executeRawUnsafe(
      `insert into public.housekeeping_unit_status
         (accommodation_unit_id, property_id, organization_id, status)
       values ($1::uuid, $2::uuid, $3::uuid, 'dirty')`,
      unit,
      PROPERTY,
      ORG,
    );
    const { reservationId } = await reservations.createReservation(
      MANAGER,
      booking(unit, await day(PROPERTY, 0), await day(PROPERTY, 2), {
        guestName: "Tonight's Guest",
      }),
    );

    const refused = await reservations
      .checkIn(MANAGER, reservationId)
      .catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(UnitHasOccupantError);
    expect(refused).not.toBeInstanceOf(UnitNotReadyError);
    expect(await statusOf(reservationId)).toBe("confirmed");
    expect(await staysFor(reservationId)).toBe(0);
  });

  it("still asks about a room that is only not ready, and writes nothing until answered", async () => {
    const unit = await aUnit();
    await owner.$executeRawUnsafe(
      `insert into public.housekeeping_unit_status
         (accommodation_unit_id, property_id, organization_id, status)
       values ($1::uuid, $2::uuid, $3::uuid, 'dirty')`,
      unit,
      PROPERTY,
      ORG,
    );
    const { reservationId } = await reservations.createReservation(
      MANAGER,
      booking(unit, await day(PROPERTY, 0), await day(PROPERTY, 2), {
        guestName: "Patient Guest",
      }),
    );

    await expect(
      reservations.checkIn(MANAGER, reservationId),
    ).rejects.toBeInstanceOf(UnitNotReadyError);
    expect(await statusOf(reservationId)).toBe("confirmed");
    expect(await staysFor(reservationId)).toBe(0);
    const [events] = await owner.$queryRawUnsafe<{ count: number }[]>(
      `select count(*)::int as count from outbox.events
        where payload->>'reservationId' = $1 and event_type = 'stay.checked_in'`,
      reservationId,
    );
    expect(events?.count).toBe(0);

    await reservations.checkIn(MANAGER, reservationId, {
      readinessAcknowledged: true,
    });
    expect(await statusOf(reservationId)).toBe("checked_in");
  });
});

describe("who a booking names", () => {
  it("RG-S1-18: a shared name and telephone with no email, or another email, is a second Guest", async () => {
    const phone = "+90 212 000 00 00";
    const first = await reservations.createReservation(
      MANAGER,
      booking(await aUnit(), await day(PROPERTY, 20), await day(PROPERTY, 22), {
        guestName: "Ada Lovelace",
        guestEmail: `ada-${ORG}@example.test`,
        guestPhone: phone,
      }),
    );
    const noEmail = await reservations.createReservation(
      MANAGER,
      booking(await aUnit(), await day(PROPERTY, 20), await day(PROPERTY, 22), {
        guestName: "Ada Lovelace",
        guestPhone: phone,
      }),
    );
    const otherEmail = await reservations.createReservation(
      MANAGER,
      booking(await aUnit(), await day(PROPERTY, 20), await day(PROPERTY, 22), {
        guestName: "Ada Lovelace",
        guestEmail: `ada.l-${ORG}@example.test`,
        guestPhone: phone,
      }),
    );

    expect(
      new Set([first.guestId, noEmail.guestId, otherEmail.guestId]).size,
    ).toBe(3);
    expect([
      first.guestCreated,
      noEmail.guestCreated,
      otherEmail.guestCreated,
    ]).toEqual([true, true, true]);
  });

  it("RG-S1-19: one address in two Organizations is two Guests, each in the Unit's Organization", async () => {
    const email = `grace-${ORG}@example.test`;
    const theirs = await reservations.createReservation(
      OUTSIDER,
      booking(
        await aUnit(OTHER_PROPERTY, OTHER_ORG),
        await day(OTHER_PROPERTY, 20),
        await day(OTHER_PROPERTY, 22),
        {
          propertyId: OTHER_PROPERTY,
          guestName: "Grace Hopper",
          guestEmail: email,
        },
      ),
    );
    const ours = await reservations.createReservation(
      MANAGER,
      booking(await aUnit(), await day(PROPERTY, 20), await day(PROPERTY, 22), {
        guestName: "Grace Hopper",
        guestEmail: email,
      }),
    );

    expect(ours.guestId).not.toBe(theirs.guestId);
    expect(ours.guestCreated).toBe(true);
    const rows = await owner.$queryRawUnsafe<{ organizationId: string }[]>(
      `select organization_id as "organizationId" from public.guests
        where email = $1 order by organization_id`,
      email,
    );
    expect(rows.map((row) => row.organizationId).sort()).toEqual(
      [ORG, OTHER_ORG].sort(),
    );
  });

  it("RG-S1-20: one new address booked twice at once is one Guest and two Reservations", async () => {
    const email = `race-${ORG}@example.test`;
    const [a, b] = [await aUnit(), await aUnit()];
    const from = await day(PROPERTY, 30);
    const to = await day(PROPERTY, 32);

    // The owner holds an uncommitted Guest at the address, so both bookings
    // reach the Guest insert and wait on it together. Released by rolling back,
    // both then race for the same new row: exactly the window a select before
    // an insert would leave open.
    const held = gate();
    const release = gate();
    const holding = owner
      .$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(
            `insert into public.guests (organization_id, full_name, email)
             values ($1::uuid, 'Holder', $2)`,
            ORG,
            email,
          );
          held.open();
          await release.opened;
          throw new Error("rolled back on purpose");
        },
        { timeout: 30_000 },
      )
      .catch((error: unknown) => error);
    await held.opened;

    const racing = Promise.allSettled([
      reservations.createReservation(
        MANAGER,
        booking(a, from, to, { guestName: "Racing Guest", guestEmail: email }),
      ),
      rivalReservations.createReservation(
        MANAGER,
        booking(b, from, to, { guestName: "Racing Guest", guestEmail: email }),
      ),
    ]);
    await untilWaiting("insert into public.guests", 2);
    release.open();
    expect(await holding).toBeInstanceOf(Error);

    const outcomes = await racing;
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "fulfilled",
      "fulfilled",
    ]);
    const [guests] = await owner.$queryRawUnsafe<{ count: number }[]>(
      `select count(*)::int as count from public.guests
        where organization_id = $1::uuid and email = $2`,
      ORG,
      email,
    );
    expect(guests?.count).toBe(1);
    const [booked] = await owner.$queryRawUnsafe<{ count: number }[]>(
      `select count(*)::int as count from public.reservations as reservation
         join public.guests as guest on guest.id = reservation.guest_id
        where guest.email = $1`,
      email,
    );
    expect(booked?.count).toBe(2);
  });

  it("RG-S1-39: publishes reservation.created with ids and nothing else", async () => {
    const unit = await aUnit();
    const created = await reservations.createReservation(
      MANAGER,
      booking(unit, await day(PROPERTY, 40), await day(PROPERTY, 41), {
        guestName: "Private Person",
        guestEmail: `private-${ORG}@example.test`,
        guestPhone: "+90 555 111 22 33",
      }),
    );
    const events = await owner.$queryRawUnsafe<
      { payload: Record<string, unknown> }[]
    >(
      `select payload from outbox.events
        where event_type = 'reservation.created'
          and payload->>'reservationId' = $1`,
      created.reservationId,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({
      reservationId: created.reservationId,
      guestId: created.guestId,
      propertyId: PROPERTY,
      accommodationUnitId: unit,
    });
    const text = JSON.stringify(events[0]?.payload);
    for (const detail of ["Private", "private-", "555"]) {
      expect(text).not.toContain(detail);
    }
  });
});

describe("reach and the commercial gates", () => {
  it("RG-S1-28: refuses a booking at a Property of their Organization they are not assigned to", async () => {
    await expect(
      reservations.createReservation(
        NARROW,
        booking(
          await aUnit(UNASSIGNED),
          await day(UNASSIGNED, 10),
          await day(UNASSIGNED, 11),
          { propertyId: UNASSIGNED, guestName: "Out Of Reach" },
        ),
      ),
    ).rejects.toThrow(
      new ReservationRefusedError("that booking cannot be taken"),
    );

    // The same Staff Member books where they are assigned, so the refusal is
    // reach and not the role.
    const assigned = await reservations.createReservation(
      NARROW,
      booking(await aUnit(), await day(PROPERTY, 10), await day(PROPERTY, 11), {
        guestName: "In Reach",
      }),
    );
    expect(assigned.reservationId).toBeTruthy();
  });

  it("CI-S1-14: refuses a check-in at a Property of their Organization they are not assigned to", async () => {
    const { reservationId } = await reservations.createReservation(
      MANAGER,
      booking(
        await aUnit(UNASSIGNED),
        await day(UNASSIGNED, 0),
        await day(UNASSIGNED, 1),
        { propertyId: UNASSIGNED, guestName: "Unassigned Arrival" },
      ),
    );
    await expect(reservations.checkIn(NARROW, reservationId)).rejects.toThrow(
      new CheckInError("that Reservation cannot be checked in"),
    );
    expect(await statusOf(reservationId)).toBe("confirmed");
    expect(await staysFor(reservationId)).toBe(0);

    const control = await reservations.createReservation(
      MANAGER,
      booking(await aUnit(), await day(PROPERTY, 0), await day(PROPERTY, 1), {
        guestName: "Assigned Arrival",
      }),
    );
    await reservations.checkIn(NARROW, control.reservationId);
    expect(await statusOf(control.reservationId)).toBe("checked_in");
  });

  it.each([
    [
      "a suspended Subscription",
      `update public.subscriptions set status = 'suspended' where organization_id = '${ORG}'`,
      `update public.subscriptions set status = 'active' where organization_id = '${ORG}'`,
    ],
    [
      "a revoked Entitlement",
      `update public.entitlements set status = 'revoked' where organization_id = '${ORG}' and module_key = 'front_office'`,
      `update public.entitlements set status = 'active' where organization_id = '${ORG}' and module_key = 'front_office'`,
    ],
    [
      "the front desk switched off",
      `update public.property_capabilities set enabled = false where property_id = '${PROPERTY}' and capability_key = 'front_desk'`,
      `update public.property_capabilities set enabled = true where property_id = '${PROPERTY}' and capability_key = 'front_desk'`,
    ],
  ])(
    "CI-S1-15: refuses a check-in under %s by matching nothing",
    async (_gate, close, reopen) => {
      const { reservationId } = await reservations.createReservation(
        MANAGER,
        booking(await aUnit(), await day(PROPERTY, 0), await day(PROPERTY, 1), {
          guestName: "Gated Arrival",
        }),
      );
      await owner.$executeRawUnsafe(close);
      try {
        await expect(
          reservations.checkIn(MANAGER, reservationId),
        ).rejects.toThrow(
          new CheckInError("that Reservation cannot be checked in"),
        );
      } finally {
        await owner.$executeRawUnsafe(reopen);
      }
      expect(await statusOf(reservationId)).toBe("confirmed");
      expect(await staysFor(reservationId)).toBe(0);
    },
  );
});

describe("the Reservations list and its refusals", () => {
  it("RG-S3-02: keeps a cancelled booking and one departing today on the list", async () => {
    const cancelled = await reservations.createReservation(
      MANAGER,
      booking(await aUnit(), await day(PROPERTY, 3), await day(PROPERTY, 5), {
        guestName: "Changed Their Mind",
      }),
    );
    await reservations.cancelReservation(
      MANAGER,
      cancelled.reservationId,
      "the Guest telephoned to cancel",
    );
    // Due to leave today: its last night has passed, and it is still listed
    // because the list keeps `ends_on >= today`. Cancelled, so no Stay has to
    // stand beside it.
    const [leaving] = await owner.$queryRawUnsafe<{ id: string }[]>(
      `with guest as (
         insert into public.guests (organization_id, full_name)
         values ($1::uuid, 'Leaving Today') returning id
       )
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       select $1::uuid, $2::uuid, $3::uuid, guest.id, 'guest', 'cancelled',
              app.property_today($2::uuid) - 2, app.property_today($2::uuid)
         from guest
       returning id`,
      ORG,
      PROPERTY,
      await aUnit(),
    );

    const listed = await reservations.listReservations(MANAGER, PROPERTY);
    expect(
      listed.find((row) => row.reservationId === cancelled.reservationId),
    ).toMatchObject({ status: "cancelled", mayCancel: false });
    expect(
      listed.find((row) => row.reservationId === leaving!.id),
    ).toMatchObject({ status: "cancelled", endsOn: await day(PROPERTY, 0) });
  });

  it("RG-S3-07: two bookings over the same nights, and somebody in house, are two different refusals", async () => {
    const booked = await aUnit();
    await reservations.createReservation(
      MANAGER,
      booking(booked, await day(PROPERTY, 50), await day(PROPERTY, 53)),
    );
    await expect(
      reservations.createReservation(
        MANAGER,
        booking(booked, await day(PROPERTY, 52), await day(PROPERTY, 54)),
      ),
    ).rejects.toBeInstanceOf(UnitUnavailableError);

    const occupied = await aUnit();
    await owner.$executeRawUnsafe(
      `insert into public.stays
         (organization_id, property_id, accommodation_unit_id, stay_type,
          status, starts_on, ends_on)
       values ($1::uuid, $2::uuid, $3::uuid, 'guest', 'in_house',
               app.property_today($2::uuid) - 1, app.property_today($2::uuid) + 3)`,
      ORG,
      PROPERTY,
      occupied,
    );
    await expect(
      reservations.createReservation(
        MANAGER,
        booking(occupied, await day(PROPERTY, 1), await day(PROPERTY, 2)),
      ),
    ).rejects.toBeInstanceOf(UnitHasOccupantError);
  });
});
