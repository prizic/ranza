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
  CheckInError,
  CheckOutError,
  createReservationsModule,
  UnitUnavailableError,
} from "../../packages/ranza/reservations/src";
import type { Arrival } from "../../packages/ranza/reservations/src";
import { createPrismaClient } from "../../packages/db/src";
import { FRONT_DESK_CAPABILITY } from "../../packages/ranza/reservations/src";

const ORG = "d4000002-0000-4000-8000-000000000001";
const OTHER_ORG = "d4000002-0000-4000-8000-000000000002";
const PROPERTY = "d4000003-0000-4000-8000-000000000001";
const OTHER_PROPERTY = "d4000003-0000-4000-8000-000000000002";
const UNIT = "d4000004-0000-4000-8000-000000000001";
const CONTESTED = "d4000004-0000-4000-8000-000000000002";
const OTHER_UNIT = "d4000004-0000-4000-8000-000000000003";
const OTHER_IN_PROPERTY = "d4000004-0000-4000-8000-000000000004";
const DEPARTING_A = "d4000004-0000-4000-8000-000000000005";
const DEPARTING_B = "d4000004-0000-4000-8000-000000000006";
const OPEN_ENDED = "d4000004-0000-4000-8000-000000000007";
const RACED = "d4000004-0000-4000-8000-000000000008";
const OVERSTAYED = "d4000004-0000-4000-8000-000000000009";
const TAKEN = "d4000004-0000-4000-8000-00000000000a";
const ANNOUNCED = "d4000004-0000-4000-8000-00000000000b";
const DATED = "d4000004-0000-4000-8000-00000000000c";
const RECORDED = "d4000004-0000-4000-8000-00000000000d";
const DEPARTED = "d4000004-0000-4000-8000-00000000000e";
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
       ($3,$5,$7,'FD-201','suite',4),
       ($8,$4,$6,'FD-103','room',2),
       ($9,$4,$6,'FD-104','room',2),
       ($10,$4,$6,'FD-105','room',2),
       ($11,$4,$6,'FD-106','room',2),
       ($12,$4,$6,'FD-107','room',2),
       ($13,$4,$6,'FD-108','room',2),
       ($14,$4,$6,'FD-109','room',2),
       ($15,$4,$6,'FD-110','room',2),
       ($16,$4,$6,'FD-111','room',2),
       ($17,$4,$6,'FD-112','room',2),
       ($18,$4,$6,'FD-113','room',2)
     on conflict (id) do nothing`,
    UNIT,
    CONTESTED,
    OTHER_UNIT,
    PROPERTY,
    OTHER_PROPERTY,
    ORG,
    OTHER_ORG,
    OTHER_IN_PROPERTY,
    DEPARTING_A,
    DEPARTING_B,
    OPEN_ENDED,
    RACED,
    OVERSTAYED,
    TAKEN,
    ANNOUNCED,
    DATED,
    RECORDED,
    DEPARTED,
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
  stayType: "guest" | "resident" = "guest",
  /** Pass null for an open-ended Stay, which long-term residence normally is. */
  endsOn: number | null | undefined = undefined,
): Promise<void> {
  await owner.$executeRawUnsafe(
    `insert into public.reservations
       (id, organization_id, property_id, accommodation_unit_id,
        guest_name, stay_type, status, starts_on, ends_on)
     select $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $8, 'confirmed',
            (now() at time zone property.timezone)::date + $6::int,
            case when $7::int is null then null
                 else (now() at time zone property.timezone)::date + $7::int
            end
     from public.properties as property
     where property.id = $3::uuid
     on conflict (id) do nothing`,
    id,
    organizationId,
    propertyId,
    unitId,
    guestName,
    nights.from,
    endsOn === null ? null : nights.to,
    stayType,
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
    `delete from outbox.events where organization_id in ('${ORG}','${OTHER_ORG}')`,
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

/**
 * What the list stops showing, which is the half with no screen to notice it is
 * wrong. `starts_on <= today` on its own is every Reservation whose start date
 * has ever passed: the arrivals list grows by a day's check-ins every day and
 * never shrinks, and bookings that expired unused sit on it offering a button
 * check-in refuses.
 *
 * Every date is relative to the Property's own today and computed by the
 * database, for the same reason the fixtures above are: a day counted from the
 * runner's clock is the wrong day for several hours of every day.
 */
describe("arrivals that are no longer arriving", () => {
  const LONG_GONE = reservationId();
  const EXPIRED = reservationId();
  const LATE = reservationId();
  const TODAY_DONE = reservationId();
  const NO_NIGHT = reservationId();
  const OWN = [LONG_GONE, EXPIRED, LATE, TODAY_DONE, NO_NIGHT];

  /** This describe's own rows: the fixtures above are still on the list. */
  const mine = (arrivals: Arrival[]) =>
    arrivals.filter((arrival) => OWN.includes(arrival.reservationId));

  beforeAll(async () => {
    await reserve(LONG_GONE, PROPERTY, ORG, UNIT, "Long Gone", {
      from: -90,
      to: -87,
    });
    await reserve(EXPIRED, PROPERTY, ORG, CONTESTED, "Never Came", {
      from: -14,
      to: -7,
    });
    await reserve(LATE, PROPERTY, ORG, OTHER_IN_PROPERTY, "One Day Late", {
      from: -1,
      to: 2,
    });
    await reserve(TODAY_DONE, PROPERTY, ORG, DEPARTING_A, "Already Here");
    // Arriving today, leaving today: no night in it. On the list, because
    // today's bookings are the day's work and the front desk has to be able to
    // see what happened to it — but not checkable in, because the Stay would be
    // an empty daterange that overlaps nothing and the Unit would take a second
    // Guest tonight. The one row where the old flag still offered the button.
    await reserve(NO_NIGHT, PROPERTY, ORG, DEPARTING_B, "No Night", {
      from: 0,
      to: 0,
    });
    await owner.$executeRawUnsafe(
      `update public.reservations set status = 'checked_in'
        where id = any($1::uuid[])`,
      [LONG_GONE, TODAY_DONE],
    );
  });

  it("drops a Guest checked in months ago, and a booking that expired unused", async () => {
    const listed = mine(await reservations.listArrivals(MEMBER, PROPERTY));
    expect(listed.map((arrival) => arrival.guestName).sort()).toEqual([
      "Already Here",
      "No Night",
      "One Day Late",
    ]);
  });

  /**
   * `canCheckIn` against the three rows that survive. The last of them is the
   * one that matters: a booking arriving and leaving on the same day is on the
   * list and is not checkable, and the old flag — `status = 'confirmed'`, with
   * no date in it — offered the button anyway.
   */
  it("offers check-in only where check-in would succeed", async () => {
    const listed = mine(await reservations.listArrivals(MEMBER, PROPERTY));
    const offered = Object.fromEntries(
      listed.map((arrival) => [arrival.guestName, arrival.canCheckIn]),
    );
    expect(offered).toEqual({
      "One Day Late": true,
      "Already Here": false,
      "No Night": false,
    });
  });

  /**
   * And the flag agrees with the rule rather than restating it: the same two
   * rows it declines to offer are the two `checkIn` refuses. This is the pair
   * that drifted apart, so it is asserted as a pair.
   */
  it("agrees with check-in about the rows it will not offer", async () => {
    await expect(reservations.checkIn(MEMBER, NO_NIGHT)).rejects.toThrow(
      CheckInError,
    );
    await expect(reservations.checkIn(MEMBER, EXPIRED)).rejects.toThrow(
      CheckInError,
    );
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

  // The fact leaves the transaction with everything else it did. Published
  // after the commit instead, a crash in between would lose it with nothing
  // recording that anything was owed (ADR 0017).
  it("publishes one event carrying ids and no names", async () => {
    const PUBLISHED = reservationId();
    await reserve(PUBLISHED, PROPERTY, ORG, ANNOUNCED, "Zeynep Ahmet", {
      from: 0,
      to: 2,
    });

    const { stayId } = await reservations.checkIn(MEMBER, PUBLISHED);

    const events = await owner.$queryRawUnsafe<
      { eventType: string; payload: Record<string, unknown> }[]
    >(
      `select event_type as "eventType", payload from outbox.events
        where payload->>'reservationId' = $1`,
      PUBLISHED,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("stay.checked_in");
    expect(events[0]?.payload).toMatchObject({ stayId, propertyId: PROPERTY });
    // Ids and facts. The queue is read across Organizations by one process, so
    // a Guest's name has no business being in it.
    expect(JSON.stringify(events[0]?.payload)).not.toContain("Zeynep");
  });

  // Reproduced against main as ranza_app before the rule existed: a Reservation
  // three weeks out was checked in, producing an `in_house` Stay with future
  // dates, and a second Guest was then checked into the same Unit tonight —
  // stays_no_double_booking permits it, because the two ranges do not overlap.
  it("refuses a Reservation whose first night has not arrived", async () => {
    const EARLY = reservationId();
    await reserve(EARLY, PROPERTY, ORG, OTHER_IN_PROPERTY, "Too Early", {
      from: 21,
      to: 24,
    });

    await expect(reservations.checkIn(MEMBER, EARLY)).rejects.toBeInstanceOf(
      CheckInError,
    );

    const [reservation] = await owner.$queryRawUnsafe<{ status: string }[]>(
      `select status from public.reservations where id = $1::uuid`,
      EARLY,
    );
    expect(reservation?.status).toBe("confirmed");
    await expect(
      owner.$queryRawUnsafe(
        `select id from public.stays where reservation_id = $1::uuid`,
        EARLY,
      ),
    ).resolves.toEqual([]);
  });

  // The edge of the range, which `ends_on >= today` let through. The Stay would
  // be [today, today) — an empty daterange, which overlaps nothing, so
  // stays_no_double_booking has no opinion and the Unit takes a second in_house
  // Stay tonight. Exactly the bug the date rule exists to close, arriving
  // through the one date nobody tested.
  it("refuses a Reservation whose last night is tonight's predecessor", async () => {
    const ENDING = reservationId();
    await reserve(ENDING, PROPERTY, ORG, ANNOUNCED, "No Nights Left", {
      from: -2,
      to: 0,
    });

    await expect(reservations.checkIn(MEMBER, ENDING)).rejects.toBeInstanceOf(
      CheckInError,
    );

    await expect(
      owner.$queryRawUnsafe(
        `select id from public.stays where reservation_id = $1::uuid`,
        ENDING,
      ),
    ).resolves.toEqual([]);
  });

  it("refuses a Reservation whose last night has already passed", async () => {
    const STALE = reservationId();
    await reserve(STALE, PROPERTY, ORG, OTHER_IN_PROPERTY, "Too Late", {
      from: -9,
      to: -2,
    });

    await expect(reservations.checkIn(MEMBER, STALE)).rejects.toBeInstanceOf(
      CheckInError,
    );
  });

  // The Stay begins when the Guest did, not when they were expected. Recording
  // the planned date instead holds the Unit over nights nobody slept in, and
  // dates every charge that is ever posted per night to the wrong day.
  it("starts the Stay on the day the Guest actually arrived", async () => {
    const LATE = reservationId();
    await reserve(LATE, PROPERTY, ORG, OTHER_IN_PROPERTY, "Two Days Late", {
      from: -2,
      to: 3,
    });

    const { stayId } = await reservations.checkIn(MEMBER, LATE);

    const [stay] = await owner.$queryRawUnsafe<
      { startsOn: string; today: string; plannedOn: string }[]
    >(
      `select to_char(stay.starts_on, 'YYYY-MM-DD') as "startsOn",
              to_char((now() at time zone property.timezone)::date,
                      'YYYY-MM-DD') as "today",
              to_char(reservation.starts_on, 'YYYY-MM-DD') as "plannedOn"
       from public.stays as stay
       join public.properties as property on property.id = stay.property_id
       join public.reservations as reservation
         on reservation.id = stay.reservation_id
       where stay.id = $1::uuid`,
      stayId,
    );
    expect(stay?.startsOn).toBe(stay?.today);
    expect(stay?.startsOn).not.toBe(stay?.plannedOn);
  });
});

describe("a failed check-in leaves nothing half-done", () => {
  const FIRST = reservationId();
  const SECOND = reservationId();

  beforeAll(async () => {
    await reserve(FIRST, PROPERTY, ORG, TAKEN, "Mary Jackson", {
      from: -1,
      to: 4,
    });
    // Overlaps FIRST on the same Unit. Two Reservations may overlap — whether
    // that is allowed is an overbooking policy nobody has written — but two
    // current Stays may not.
    await reserve(SECOND, PROPERTY, ORG, TAKEN, "Dorothy Vaughan", {
      from: 0,
      to: 6,
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

    // The third and fourth writes are rolled back with the other two. An audit
    // trail recording an action that never happened is as wrong as one missing
    // an action that did — and an event announcing it is worse, because
    // something downstream acts on it.
    await expect(
      audit.historyOf(MEMBER, "reservation", SECOND),
    ).resolves.toEqual([]);

    await expect(
      owner.$queryRawUnsafe(
        `select id from outbox.events where payload->>'reservationId' = $1`,
        SECOND,
      ),
    ).resolves.toEqual([]);
  });
});

describe("two people pressing the button at once", () => {
  const LEFT = reservationId();
  const RIGHT = reservationId();

  beforeAll(async () => {
    // RACED rather than CONTESTED: a Stay is in house only from the day it
    // starts, so every check-in in this file now competes for the same few
    // nights and two describes sharing a Unit would block each other.
    await reserve(LEFT, PROPERTY, ORG, RACED, "Annie Easley", {
      from: -1,
      to: 4,
    });
    await reserve(RIGHT, PROPERTY, ORG, RACED, "Melba Roy", {
      from: 0,
      to: 5,
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
      RACED,
      LEFT,
      RIGHT,
    );
    expect(stays).toHaveLength(1);
  });
});

describe("checking out", () => {
  const ARRIVING = reservationId();
  const WAITING = reservationId();

  beforeAll(async () => {
    // The first is booked until tomorrow and leaves today; the second arrives
    // today. They genuinely overlap until that early departure is recorded,
    // which is what makes this test about check-out rather than about `[)`.
    await reserve(ARRIVING, PROPERTY, ORG, CONTESTED, "Sabiha Gökçen", {
      from: -2,
      to: 1,
    });
    await reserve(WAITING, PROPERTY, ORG, CONTESTED, "Cahit Arf", {
      from: 0,
      to: 3,
    });
  });

  it("frees the Unit by recording when they actually left", async () => {
    const { stayId } = await reservations.checkIn(MEMBER, ARRIVING);

    // Before the departure the Unit is held: the exclusion constraint refuses
    // the overlap rather than the application noticing it.
    await expect(reservations.checkIn(MEMBER, WAITING)).rejects.toBeInstanceOf(
      UnitUnavailableError,
    );

    await reservations.checkOut(MEMBER, stayId);

    const [departed] = await owner.$queryRawUnsafe<
      { status: string; endsOn: string; today: string }[]
    >(
      `select stay.status,
              to_char(stay.ends_on, 'YYYY-MM-DD') as "endsOn",
              to_char((now() at time zone property.timezone)::date,
                      'YYYY-MM-DD') as "today"
       from public.stays as stay
       join public.properties as property on property.id = stay.property_id
       where stay.id = $1::uuid`,
      stayId,
    );
    expect(departed?.status).toBe("departed");
    // They were booked until tomorrow and left today, and the record says so.
    // The status alone would have freed the Unit — the exclusion constraint is
    // partial on it — so without this assertion the date is untested.
    expect(departed?.endsOn).toBe(departed?.today);

    // The same Unit, the same nights, and now it works. Two things made that
    // true and both matter: the status left the exclusion constraint's partial
    // index, and `ends_on` moved to the day they actually left. Nothing was
    // deleted.
    await expect(reservations.checkIn(MEMBER, WAITING)).resolves.toMatchObject({
      reservationId: WAITING,
    });
  });

  // toISOString() on a Postgres `date` is the trap: the driver parses it as
  // local midnight, so anywhere east of UTC the UTC rendering is the day
  // before. Compared against the Property's own today, computed by the
  // database, because that is the only authority on what day it is there.
  it("publishes the departure dated by the Property, not by the process", async () => {
    const leaving = reservationId();
    await reserve(leaving, PROPERTY, ORG, DATED, "Dated Guest", {
      from: -1,
      to: 1,
    });
    const { stayId } = await reservations.checkIn(MEMBER, leaving);
    await reservations.checkOut(MEMBER, stayId);

    const [row] = await owner.$queryRawUnsafe<
      { departedOn: string; today: string }[]
    >(
      `select event.payload->>'departedOn' as "departedOn",
              to_char((now() at time zone property.timezone)::date, 'YYYY-MM-DD') as "today"
         from outbox.events as event
         join public.properties as property on property.id = $2::uuid
        where event.event_type = 'stay.checked_out'
          and event.payload->>'stayId' = $1`,
      stayId,
      PROPERTY,
    );
    expect(row?.departedOn).toBe(row?.today);
  });

  it("records who did it, in the same transaction", async () => {
    const reservation = reservationId();
    await reserve(reservation, PROPERTY, ORG, RECORDED, "Aziz Sancar", {
      // At least one night left, or the Stay would be [today, today) and the
      // check constraint refuses it — an empty range holds no Unit.
      from: -1,
      to: 1,
    });
    const { stayId } = await reservations.checkIn(MEMBER, reservation);

    await reservations.checkOut(MEMBER, stayId);

    const history = await audit.historyOf(MEMBER, "stay", stayId);
    expect(history).toHaveLength(1);
    expect(history[0]?.action).toBe("stay.checked_out");
    expect(history[0]?.actorId).toBe(MEMBER);
  });

  it("gives an open-ended Stay an end date, which it never had", async () => {
    // A long-term Resident's Stay has no agreed end, so nothing but the
    // check-out can say when it finished. It is also never in the departures
    // list, which is why it needs its own test.
    const reservation = reservationId();
    await reserve(
      reservation,
      PROPERTY,
      ORG,
      OPEN_ENDED,
      "Zaha Hadid",
      { from: -30, to: 0 },
      "resident",
      null,
    );
    const { stayId } = await reservations.checkIn(MEMBER, reservation);

    const [before] = await owner.$queryRawUnsafe<{ endsOn: string | null }[]>(
      `select to_char(ends_on, 'YYYY-MM-DD') as "endsOn" from public.stays where id = $1::uuid`,
      stayId,
    );
    expect(before?.endsOn).toBeNull();

    await reservations.checkOut(MEMBER, stayId);

    const [after] = await owner.$queryRawUnsafe<
      { endsOn: string; today: string }[]
    >(
      `select to_char(stay.ends_on, 'YYYY-MM-DD') as "endsOn",
              to_char((now() at time zone property.timezone)::date,
                      'YYYY-MM-DD') as "today"
       from public.stays as stay
       join public.properties as property on property.id = stay.property_id
       where stay.id = $1::uuid`,
      stayId,
    );
    expect(after?.endsOn).toBe(after?.today);
  });

  it("refuses a Stay that has already departed", async () => {
    const reservation = reservationId();
    await reserve(reservation, PROPERTY, ORG, DEPARTED, "Feza Gürsey", {
      from: -1,
      to: 1,
    });
    const { stayId } = await reservations.checkIn(MEMBER, reservation);
    await reservations.checkOut(MEMBER, stayId);

    await expect(reservations.checkOut(MEMBER, stayId)).rejects.toBeInstanceOf(
      CheckOutError,
    );
  });

  it("refuses a Stay belonging to another Organization", async () => {
    const reservation = reservationId();
    await reserve(
      reservation,
      OTHER_PROPERTY,
      OTHER_ORG,
      OTHER_UNIT,
      "Intruder",
    );
    const { stayId } = await rivalReservations.checkIn(OUTSIDER, reservation);

    await expect(reservations.checkOut(MEMBER, stayId)).rejects.toBeInstanceOf(
      CheckOutError,
    );

    const [stay] = await owner.$queryRawUnsafe<{ status: string }[]>(
      `select status from public.stays where id = $1::uuid`,
      stayId,
    );
    expect(stay?.status).toBe("in_house");
  });
});

describe("today's departures", () => {
  it("lists a Stay whose planned end has arrived, and flags an overdue one", async () => {
    // Both are inserted rather than checked in, and for one reason: a Stay due
    // to leave today began three days ago. Checking in today to a Reservation
    // that ends today would produce [today, today) — no nights at all — which
    // `stays_in_house_has_a_night` refuses, and rightly.
    const onTime = reservationId();
    await reserve(onTime, PROPERTY, ORG, DEPARTING_A, "Halide Edib", {
      from: -3,
      to: 0,
    });
    await owner.$executeRawUnsafe(
      `insert into public.stays
         (organization_id, property_id, accommodation_unit_id, reservation_id,
          stay_type, status, starts_on, ends_on)
       select $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'guest', 'in_house',
              (now() at time zone property.timezone)::date - 3,
              (now() at time zone property.timezone)::date
       from public.properties as property
       where property.id = $2::uuid`,
      ORG,
      PROPERTY,
      DEPARTING_A,
      onTime,
    );

    // The overdue one is inserted rather than checked in, and that is not a
    // shortcut. An overstay exists because somebody checked in while their
    // last night was still ahead of them and then did not leave; checking in
    // today to a Reservation that ended last week is refused, which is the
    // rule this file asserts a few tests below.
    await owner.$executeRawUnsafe(
      `insert into public.stays
         (organization_id, property_id, accommodation_unit_id,
          stay_type, status, starts_on, ends_on)
       select $1::uuid, $2::uuid, $3::uuid, 'guest', 'in_house',
              (now() at time zone property.timezone)::date - 9,
              (now() at time zone property.timezone)::date - 2
       from public.properties as property
       where property.id = $2::uuid`,
      ORG,
      PROPERTY,
      OVERSTAYED,
    );

    const departures = await reservations.listDepartures(MEMBER, PROPERTY);
    expect(departures.map((d) => d.guestName)).toContain("Halide Edib");
    expect(departures.find((d) => d.guestName === "Halide Edib")?.overdue).toBe(
      false,
    );

    // The overdue one is why this list exists: a departures screen showing only
    // today hides the Guest who should have left last week. It carries no name
    // because it has no Reservation, which is also what a walk-in looks like.
    const overstayed = departures.find((d) => d.unitId === OVERSTAYED);
    expect(overstayed?.overdue).toBe(true);
  });

  it("shows nothing from a Property in another Organization", async () => {
    await expect(
      reservations.listDepartures(MEMBER, OTHER_PROPERTY),
    ).resolves.toEqual([]);
  });
});
