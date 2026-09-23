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
  EarlyDepartureError,
  ReservationEndError,
  ReservationPeriodError,
  ReservationReasonError,
  ReservationRefusedError,
  UnitNotInServiceError,
  UnitHasOccupantError,
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
const WITHDRAWN = "d4000004-0000-4000-8000-00000000000f";
// Units of their own. reservations_no_double_booking means two confirmed
// Reservations can no longer share one over the same nights (ADR 0024), so
// describes that used to borrow a neighbour's Unit now bring their own.
const CHECKING_IN = "d4000004-0000-4000-8000-000000000010";
const DEPARTING_C = "d4000004-0000-4000-8000-000000000011";
const LATE_AGAIN = "d4000004-0000-4000-8000-000000000012";
const OTHER_SECOND = "d4000004-0000-4000-8000-000000000013";
const OTHER_THIRD = "d4000004-0000-4000-8000-000000000014";
const BOOKED = "d4000004-0000-4000-8000-000000000015";
const BOOKED_AGAIN = "d4000004-0000-4000-8000-000000000016";
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
       ($18,$4,$6,'FD-113','room',2),
       ($19,$4,$6,'FD-114','room',2),
       ($20,$4,$6,'FD-115','room',2),
       ($21,$4,$6,'FD-116','room',2),
       ($22,$4,$6,'FD-117','room',2),
       ($23,$5,$7,'FD-202','suite',4),
       ($24,$5,$7,'FD-203','suite',4),
       ($25,$4,$6,'FD-118','room',2),
       ($26,$4,$6,'FD-119','room',2)
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
    WITHDRAWN,
    CHECKING_IN,
    DEPARTING_C,
    LATE_AGAIN,
    OTHER_SECOND,
    OTHER_THIRD,
    BOOKED,
    BOOKED_AGAIN,
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
 * A date relative to the Property's own today, as `YYYY-MM-DD`.
 *
 * Computed by the database in the Property's timezone, like every other date in
 * this file: a fixture built from the runner's clock passes in Istanbul and
 * fails in CI.
 */
async function propertyDay(days: number): Promise<string> {
  const [row] = await owner.$queryRawUnsafe<{ day: string }[]>(
    `select to_char(app.property_today(property.id) + $2::int,
                    'YYYY-MM-DD') as day
       from public.properties as property
      where property.id = $1::uuid`,
    PROPERTY,
    days,
  );
  return row!.day;
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
    `with guest as (
     -- The Guest is created with the Reservation, because a Reservation
     -- cannot exist without one. Its own row rather than a string, which is
     -- what ADR 0024 changed; the helpers' signatures are unchanged because a
     -- fixture still only cares about the name. (No backticks in this comment:
     -- the statement is a JS template literal.)
       insert into public.guests (organization_id, full_name)
       values ($2::uuid, $5)
       returning id
     )
     insert into public.reservations
       (id, organization_id, property_id, accommodation_unit_id,
        guest_id, stay_type, status, starts_on, ends_on)
     select $1::uuid, $2::uuid, $3::uuid, $4::uuid, guest.id, $8, 'confirmed',
            app.property_today(property.id) + $6::int,
            case when $7::int is null then null
                 else app.property_today(property.id) + $7::int
            end
     from public.properties as property, guest
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

/**
 * A check-out confirmed against a review showing no Folio — this Property does
 * no billing — with the early departure acknowledged, which is harmless when
 * the Guest is not early. The bill's own rules are tested in folios.test.ts,
 * where there is a bill.
 */
const ACKNOWLEDGED = {
  folioVersion: null,
  earlyDeparture: true,
  balanceReason: null,
} as const;

/**
 * A Unit of this run's own, at the front desk's Property.
 *
 * For describes that leave a Unit in a state the next run cannot start from —
 * blocked, or with somebody in house. Units are never deleted, so a fixed one
 * would arrive at the next run still occupied.
 */
async function aUnit(): Promise<string> {
  const id = randomUUID();
  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units
       (id, property_id, organization_id, name, unit_type, capacity)
     values ($1::uuid, $2::uuid, $3::uuid, $4, 'room', 2)`,
    id,
    PROPERTY,
    ORG,
    `FD-${id.slice(0, 6)}`,
  );
  return id;
}

/**
 * A Reservation whose Guest arrived some days ago: its Stay written as the
 * owner, and the Reservation moved to checked in in the same statement, so the
 * pair agrees at commit (CO-S1-29). For a Stay that began before today, which
 * check-in — dated by the business date — cannot produce.
 */
async function arrived(
  reservation: string,
  unitId: string,
  from: number,
  to: number,
): Promise<string> {
  const [row] = await owner.$queryRawUnsafe<{ id: string }[]>(
    `with moved as (
       update public.reservations set status = 'checked_in'
        where id = $1::uuid
       returning id
     )
     insert into public.stays
       (organization_id, property_id, accommodation_unit_id, reservation_id,
        stay_type, status, starts_on, ends_on)
     select $2::uuid, $3::uuid, $4::uuid, moved.id, 'guest', 'in_house',
            app.property_today($3::uuid) + $5::int,
            app.property_today($3::uuid) + $6::int
     from moved
     returning id`,
    reservation,
    ORG,
    PROPERTY,
    unitId,
    from,
    to,
  );
  return row!.id;
}

/** Somebody in house on a Unit, written as the owner, dated from today. */
async function inHouse(
  unitId: string,
  nights: { from: number; to: number | null },
): Promise<string> {
  const [row] = await owner.$queryRawUnsafe<{ id: string }[]>(
    `insert into public.stays
       (organization_id, property_id, accommodation_unit_id, stay_type,
        status, starts_on, ends_on)
     select $2::uuid, $3::uuid, $1::uuid, 'guest', 'in_house',
            app.property_today($3::uuid) + $4::int,
            case when $5::int is null then null
                 else app.property_today($3::uuid) + $5::int end
     returning id`,
    unitId,
    ORG,
    PROPERTY,
    nights.from,
    nights.to,
  );
  return row!.id;
}

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
    // After the Reservations that name them: a Guest is reached by a composite
    // foreign key, so the Organization cannot go while one still stands.
    `delete from public.guests where organization_id in ('${ORG}','${OTHER_ORG}')`,
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
  const OWN = [LONG_GONE, EXPIRED, LATE, TODAY_DONE];

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
    const here = await aUnit();
    await reserve(TODAY_DONE, PROPERTY, ORG, here, "Already Here");
    // There used to be a fifth row here: a Reservation arriving and leaving on
    // the same day, which was on the list, was not checkable in, and was the
    // one row the old `canCheckIn` flag still offered the button for. It is
    // gone because it can no longer exist — reservations_period_check requires
    // a night (ADR 0024) — which is the stronger version of the same fix. The
    // `ends_on > today` clause in `canCheckIn` stays as the second line.
    //
    // Each arrived with a Stay behind it, because a Reservation checked in
    // with nobody in the room is a pair the database refuses (CO-S1-29). The
    // Guest from months ago has since left, which is what a Reservation from
    // months ago is.
    await arrived(TODAY_DONE, here, 0, 3);
    // Written departed from the start: an in-house Stay that ended months ago
    // would be overdue, and would hold the Unit tonight.
    await owner.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `update public.reservations set status = 'checked_in' where id = $1::uuid`,
        LONG_GONE,
      );
      await tx.$executeRawUnsafe(
        `update public.reservations set status = 'checked_out' where id = $1::uuid`,
        LONG_GONE,
      );
      await tx.$executeRawUnsafe(
        `insert into public.stays
           (organization_id, property_id, accommodation_unit_id, reservation_id,
            stay_type, status, starts_on, ends_on)
         values ($2::uuid, $3::uuid, $4::uuid, $1::uuid, 'guest', 'departed',
                 app.property_today($3::uuid) - 90,
                 app.property_today($3::uuid) - 87)`,
        LONG_GONE,
        ORG,
        PROPERTY,
        UNIT,
      );
    });
  });

  it("drops a Guest checked in months ago, and a booking that expired unused", async () => {
    const listed = mine(await reservations.listArrivals(MEMBER, PROPERTY));
    expect(listed.map((arrival) => arrival.guestName).sort()).toEqual([
      "Already Here",
      "One Day Late",
    ]);
  });

  /**
   * `canCheckIn` against the two rows that survive: a late arrival who can
   * still be taken, and somebody who arrived days ago and is already in.
   */
  it("offers check-in only where check-in would succeed", async () => {
    const listed = mine(await reservations.listArrivals(MEMBER, PROPERTY));
    const offered = Object.fromEntries(
      listed.map((arrival) => [arrival.guestName, arrival.canCheckIn]),
    );
    expect(offered).toEqual({
      "One Day Late": true,
      "Already Here": false,
    });
  });

  /**
   * And the flag agrees with the rule rather than restating it: the row it
   * declines to offer is the row `checkIn` refuses. This is the pair that
   * drifted apart, so it is asserted as a pair.
   */
  it("agrees with check-in about the rows it will not offer", async () => {
    await expect(reservations.checkIn(MEMBER, EXPIRED)).rejects.toThrow(
      CheckInError,
    );
  });
});

/**
 * What the list says about a room, pressed against what check-in does.
 *
 * Every kind of row the arrivals list can show that is not simply ready — a
 * request, a blocked Unit, a Unit out of service, somebody still in the room —
 * is listed with the reason, and pressing the button on it is refused with the
 * matching error. A row the list offers is checked in. If the two ever
 * disagree, a button raises when pressed, which is what this exists to stop.
 */
describe("the list and check-in agree on every kind of room", () => {
  const cases = {
    ready: reservationId(),
    requested: reservationId(),
    blocked: reservationId(),
    outOfService: reservationId(),
    occupied: reservationId(),
    overstayed: reservationId(),
  };
  const units: Record<keyof typeof cases, string> = {} as never;

  beforeAll(async () => {
    for (const key of Object.keys(cases) as (keyof typeof cases)[]) {
      units[key] = await aUnit();
      await reserve(cases[key], PROPERTY, ORG, units[key], `Agree ${key}`, {
        from: 0,
        to: 2,
      });
    }
    // Not moved to requested, which the transition trigger refuses for every
    // role: written that way, as a booking engine will write one.
    await owner.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `set local session_replication_role = replica`,
      );
      await tx.$executeRawUnsafe(
        `update public.reservations set status = 'requested' where id = $1::uuid`,
        cases.requested,
      );
    });
    await owner.$executeRawUnsafe(
      `update public.accommodation_units
          set status = 'blocked', status_reason = 'paint drying'
        where id = $1::uuid`,
      units.blocked,
    );
    await owner.$executeRawUnsafe(
      `update public.accommodation_units set status = 'out_of_service' where id = $1::uuid`,
      units.outOfService,
    );
    // Somebody due out this morning, and somebody who should have left
    // yesterday; both booked before tonight's Guest, as time arranges it.
    for (const [key, to] of [
      ["occupied", 0],
      ["overstayed", -1],
    ] as const) {
      await owner.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `set local session_replication_role = replica`,
        );
        await tx.$executeRawUnsafe(
          `insert into public.stays
             (organization_id, property_id, accommodation_unit_id, stay_type,
              status, starts_on, ends_on)
           values ($2::uuid, $3::uuid, $1::uuid, 'guest', 'in_house',
                   app.property_today($3::uuid) - 3, app.property_today($3::uuid) + $4::int)`,
          units[key],
          ORG,
          PROPERTY,
          to,
        );
      });
    }
  });

  const listed = async (key: keyof typeof cases) =>
    (await reservations.listArrivals(MEMBER, PROPERTY)).find(
      (arrival) => arrival.reservationId === cases[key],
    );

  it("names what stands in the way, and nothing for a ready room", async () => {
    expect(await listed("ready")).toMatchObject({
      canCheckIn: true,
      checkInBlocker: null,
    });
    expect(await listed("requested")).toMatchObject({
      canCheckIn: false,
      checkInBlocker: "not_confirmed",
    });
    expect(await listed("blocked")).toMatchObject({
      canCheckIn: false,
      checkInBlocker: "unit_blocked",
    });
    expect(await listed("outOfService")).toMatchObject({
      canCheckIn: false,
      checkInBlocker: "unit_out_of_service",
    });
    expect(await listed("occupied")).toMatchObject({
      canCheckIn: false,
      checkInBlocker: "unit_occupied",
      occupantOverdue: false,
    });
    expect(await listed("overstayed")).toMatchObject({
      checkInBlocker: "unit_occupied",
      occupantOverdue: true,
    });
  });

  it("refuses each of them when the button is pressed anyway", async () => {
    await expect(
      reservations.checkIn(MEMBER, cases.requested),
    ).rejects.toBeInstanceOf(CheckInError);
    await expect(
      reservations.checkIn(MEMBER, cases.blocked),
    ).rejects.toBeInstanceOf(UnitNotInServiceError);
    await expect(
      reservations.checkIn(MEMBER, cases.outOfService),
    ).rejects.toBeInstanceOf(UnitNotInServiceError);
    await expect(
      reservations.checkIn(MEMBER, cases.occupied),
    ).rejects.toBeInstanceOf(UnitHasOccupantError);
    await expect(
      reservations.checkIn(MEMBER, cases.overstayed),
    ).rejects.toBeInstanceOf(UnitHasOccupantError);
  });

  it("checks in the one it offers", async () => {
    await expect(
      reservations.checkIn(MEMBER, cases.ready),
    ).resolves.toMatchObject({
      reservationId: cases.ready,
    });
  });

  it("carries the reference and what the viewer may do", async () => {
    const row = await listed("requested");
    expect(row?.reference).toMatch(/^R[0-9A-HJKMNP-TV-Z]{6}$/);
    expect(row).toMatchObject({ mayCheckIn: true, mayCancel: true });
  });
});

/**
 * A Guest who should have come yesterday, checked in today.
 *
 * The list is built from the Reservation's planned dates, and that is the
 * arrangement this row breaks: checking a late arrival in moves them to
 * `checked_in`, and every clause that kept them reachable requires them not to
 * be. They left the one screen that can take the check-in back the moment it
 * was made — a mistake made at 09:00 and noticed at 09:01 with nowhere to
 * undo it (ADR 0022).
 *
 * So the Stay is a second way onto the list, and it is the one that matches
 * what the screen is for: a Stay that began today is today's work whatever the
 * Reservation planned. `stayId` comes with it, because withdrawing a check-in
 * takes the Stay and the row would otherwise know only the Reservation.
 */
describe("a late arrival checked in today", () => {
  const LATE_TODAY = reservationId();
  let stay = "";

  beforeAll(async () => {
    await reserve(LATE_TODAY, PROPERTY, ORG, WITHDRAWN, "Came Late", {
      from: -1,
      to: 3,
    });
    ({ stayId: stay } = await reservations.checkIn(MEMBER, LATE_TODAY));
  });

  const row = async () =>
    (await reservations.listArrivals(MEMBER, PROPERTY)).find(
      (arrival) => arrival.reservationId === LATE_TODAY,
    );

  it("stays on the list, carrying the Stay it produced", async () => {
    const listed = await row();
    expect(listed?.status).toBe("checked_in");
    // Not offered: they are already here. The row is on the list to be undone,
    // not to be checked in again.
    expect(listed?.canCheckIn).toBe(false);
    expect(listed?.stayId).toBe(stay);
  });

  it("is still withdrawable from there, and comes back arrivable", async () => {
    await reservations.reverseCheckIn(
      MEMBER,
      stay,
      "checked in the wrong one of two Guests arriving together",
    );

    const listed = await row();
    expect(listed?.status).toBe("confirmed");
    expect(listed?.canCheckIn).toBe(true);
    // The withdrawn Stay is cancelled, so the row no longer names one — and the
    // screen cannot offer to withdraw a check-in that has already been taken
    // back.
    expect(listed?.stayId).toBeNull();
  });
});

describe("checking in", () => {
  const TO_CHECK_IN = reservationId();

  beforeAll(async () => {
    await reserve(TO_CHECK_IN, PROPERTY, ORG, CHECKING_IN, "Hedy Lamarr");
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
    expect(stay?.unitId).toBe(CHECKING_IN);

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
    await reserve(OTHERS, OTHER_PROPERTY, OTHER_ORG, OTHER_SECOND, "Intruder");

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
    await reserve(LATE, PROPERTY, ORG, LATE_AGAIN, "Two Days Late", {
      from: -2,
      to: 3,
    });

    const { stayId } = await reservations.checkIn(MEMBER, LATE);

    const [stay] = await owner.$queryRawUnsafe<
      { startsOn: string; today: string; plannedOn: string }[]
    >(
      `select to_char(stay.starts_on, 'YYYY-MM-DD') as "startsOn",
              to_char(app.property_today(property.id),
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

  beforeAll(async () => {
    // Booked while the Unit was in service, and blocked afterwards: the one
    // way left for a check-in to fail after its Reservation has already moved.
    // The Reservation update succeeds and the Stay insert is refused by
    // stays_unit_is_in_service, so everything before it has to roll back.
    const unit = await aUnit();
    await reserve(FIRST, PROPERTY, ORG, unit, "Mary Jackson");
    await owner.$executeRawUnsafe(
      `update public.accommodation_units
          set status = 'blocked', status_reason = 'a leak in the ceiling'
        where id = $1::uuid`,
      unit,
    );
  });

  it("rolls back the Reservation and the audit record when the Unit is blocked", async () => {
    await expect(reservations.checkIn(MEMBER, FIRST)).rejects.toBeInstanceOf(
      UnitNotInServiceError,
    );

    const [reservation] = await owner.$queryRawUnsafe<{ status: string }[]>(
      `select status from public.reservations where id = $1::uuid`,
      FIRST,
    );
    expect(reservation?.status).toBe("confirmed");

    const stays = await owner.$queryRawUnsafe<{ id: string }[]>(
      `select id from public.stays where reservation_id = $1::uuid`,
      FIRST,
    );
    expect(stays).toEqual([]);

    // The third and fourth writes are rolled back with the other two. An audit
    // trail recording an action that never happened is as wrong as one missing
    // an action that did — and an event announcing it is worse, because
    // something downstream acts on it.
    await expect(
      audit.historyOf(MEMBER, "reservation", FIRST),
    ).resolves.toEqual([]);

    await expect(
      owner.$queryRawUnsafe(
        `select id from outbox.events where payload->>'reservationId' = $1`,
        FIRST,
      ),
    ).resolves.toEqual([]);
  });
});

describe("one guest in one Unit", () => {
  it("refuses a booking over nights somebody in house is staying for", async () => {
    const unit = await aUnit();
    await inHouse(unit, { from: -2, to: 3 });

    await expect(
      reservations.createReservation(MEMBER, {
        propertyId: PROPERTY,
        accommodationUnitId: unit,
        guestName: "Christine Darden",
        guestEmail: null,
        guestPhone: null,
        stayType: "guest",
        startsOn: await propertyDay(1),
        endsOn: await propertyDay(2),
      }),
    ).rejects.toBeInstanceOf(UnitHasOccupantError);
  });

  it("sells tonight in a room whose Guest is due out this morning, and holds the check-in until they leave", async () => {
    const unit = await aUnit();
    const leaving = await inHouse(unit, { from: -2, to: 0 });
    const tonight = reservationId();
    await reserve(tonight, PROPERTY, ORG, unit, "Katherine Coleman", {
      from: 0,
      to: 1,
    });

    await expect(reservations.checkIn(MEMBER, tonight)).rejects.toBeInstanceOf(
      UnitHasOccupantError,
    );

    await reservations.checkOut(MEMBER, leaving, ACKNOWLEDGED);
    await expect(reservations.checkIn(MEMBER, tonight)).resolves.toMatchObject({
      reservationId: tonight,
    });
  });

  it("refuses to check a second Guest in on top of one who overstayed", async () => {
    const unit = await aUnit();
    // Booked first, while the room was free; the overstay grew into it.
    const arriving = reservationId();
    await reserve(arriving, PROPERTY, ORG, unit, "Gladys West", {
      from: 0,
      to: 2,
    });
    // Written in replica mode, which skips triggers for one transaction only,
    // so an interrupted run cannot leave the rule switched off.
    await owner.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `set local session_replication_role = replica`,
      );
      await tx.$executeRawUnsafe(
        `insert into public.stays
           (organization_id, property_id, accommodation_unit_id, stay_type,
            status, starts_on, ends_on)
         values ($2::uuid, $3::uuid, $1::uuid, 'guest', 'in_house',
                 app.property_today($3::uuid) - 4,
                 app.property_today($3::uuid) - 1)`,
        unit,
        ORG,
        PROPERTY,
      );
    });

    await expect(reservations.checkIn(MEMBER, arriving)).rejects.toBeInstanceOf(
      UnitHasOccupantError,
    );

    const [reservation] = await owner.$queryRawUnsafe<{ status: string }[]>(
      `select status from public.reservations where id = $1::uuid`,
      arriving,
    );
    expect(reservation?.status).toBe("confirmed");
  });

  /**
   * The race the advisory lock exists for.
   *
   * A booking reads the Stays on the Unit and a check-in writes one. Without a
   * lock each reads the other's table before the other commits: the booking
   * finds no Stay, waits on the Reservation the check-in is moving, and commits
   * the moment that Reservation stops being confirmed — so the Unit ends up with
   * a Guest in it and a booking promising the same nights. Several rounds,
   * because a race that is lost only sometimes is still lost.
   */
  it("never lets a booking and a check-in on one Unit both win", async () => {
    for (let round = 0; round < 6; round += 1) {
      const unit = await aUnit();
      const arriving = reservationId();
      await reserve(arriving, PROPERTY, ORG, unit, `Race Arrival ${round}`, {
        from: -1,
        to: 3,
      });

      const outcomes = await Promise.allSettled([
        reservations.checkIn(MEMBER, arriving),
        rivalReservations.createReservation(MEMBER, {
          propertyId: PROPERTY,
          accommodationUnitId: unit,
          guestName: `Race Booking ${round}`,
          guestEmail: null,
          guestPhone: null,
          stayType: "guest",
          startsOn: await propertyDay(1),
          endsOn: await propertyDay(2),
        }),
      ]);

      // The check-in's Reservation already holds those nights, so the booking
      // must lose whichever order they arrive in — to the constraint if it gets
      // there first, to the Stay if it gets there second.
      expect(
        outcomes[0].status === "rejected"
          ? String(outcomes[0].reason)
          : "fulfilled",
      ).toBe("fulfilled");
      expect(outcomes[1].status).toBe("rejected");

      const [held] = await owner.$queryRawUnsafe<{ count: number }[]>(
        `select count(*)::int as count from public.reservations
          where accommodation_unit_id = $1::uuid and status = 'confirmed'`,
        unit,
      );
      expect(held?.count).toBe(0);
    }
  });

  /**
   * The deadlock ADR 0029 orders its locks against.
   *
   * Withdrawing a check-in holds the Stay's row while it returns the
   * Reservation to confirmed, which asks for the Unit's lock. A check-in on the
   * same Unit holds the Unit's lock and waits, inside the unique index, for the
   * withdrawal to finish with that row. Unless both take the Unit's lock first,
   * each waits on the other and Postgres kills one of them — a refusal nobody
   * at the desk could explain.
   */
  it("never deadlocks a withdrawal against a check-in on the same Unit", async () => {
    for (let round = 0; round < 6; round += 1) {
      // Same-day turnover: the Guest in the room is due out this morning and
      // tonight's Guest is at the desk. Somebody withdraws the first check-in —
      // it was the wrong person — at the moment somebody else checks the second
      // one in.
      const unit = await aUnit();
      const first = reservationId();
      const second = reservationId();
      await reserve(first, PROPERTY, ORG, unit, `Withdrawn ${round}`, {
        from: -2,
        to: 0,
      });
      const stayId = await arrived(first, unit, -2, 0);
      await reserve(second, PROPERTY, ORG, unit, `Arriving ${round}`, {
        from: 0,
        to: 1,
      });

      const outcomes = await Promise.allSettled([
        reservations.reverseCheckIn(MEMBER, stayId, "wrong Guest"),
        rivalReservations.checkIn(MEMBER, second),
      ]);

      for (const outcome of outcomes) {
        if (outcome.status === "rejected") {
          expect(String(outcome.reason)).not.toMatch(/40P01|deadlock/);
        }
      }
      // The withdrawal needs nobody else, so it always succeeds; the check-in
      // succeeds when it went second and is refused as occupied when it went
      // first — and either answer is one the desk can act on.
      // The reason travels with the failure, so a refusal under load reads as
      // what it was rather than as a bare "rejected".
      expect(
        outcomes[0].status === "rejected"
          ? String(outcomes[0].reason)
          : "fulfilled",
      ).toBe("fulfilled");
      if (outcomes[1].status === "rejected") {
        expect(outcomes[1].reason).toBeInstanceOf(UnitHasOccupantError);
      }
    }
  });
});

describe("taking a booking", () => {
  it("records the Guest and the Reservation, and shows them on the list", async () => {
    const created = await reservations.createReservation(MEMBER, {
      propertyId: PROPERTY,
      accommodationUnitId: BOOKED,
      guestName: "Nezihe Muhiddin",
      guestEmail: "Nezihe@Example.Test",
      guestPhone: "+90 212 000 00 00",
      stayType: "guest",
      startsOn: await propertyDay(30),
      endsOn: await propertyDay(33),
    });
    expect(created.guestCreated).toBe(true);

    const listed = await reservations.listReservations(MEMBER, PROPERTY);
    const booking = listed.find(
      (row) => row.reservationId === created.reservationId,
    );
    expect(booking).toMatchObject({
      guestName: "Nezihe Muhiddin",
      // Normalized on the way in, because the unique index is over the stored
      // value and two spellings of one address is the duplicate `guests` exists
      // to prevent.
      guestEmail: "nezihe@example.test",
      status: "confirmed",
      unitId: BOOKED,
    });

    // The audit record is in the same transaction as both writes, so an action
    // nobody recorded is not a state this can reach.
    const history = await audit.historyOf(
      MEMBER,
      "reservation",
      created.reservationId,
    );
    expect(history.map((entry) => entry.action)).toEqual([
      "reservation.created",
    ]);
    expect(history[0]?.context).toMatchObject({ guestId: created.guestId });
  });

  it("books the same person again rather than opening a second record", async () => {
    const again = await reservations.createReservation(MEMBER, {
      propertyId: PROPERTY,
      accommodationUnitId: BOOKED_AGAIN,
      // A different spelling of the name and the same address. Blueprint 18.7
      // forbids merging ambiguous people automatically; an exact address is not
      // ambiguous, and the profile is left exactly as it was.
      guestName: "N. Muhiddin",
      guestEmail: "nezihe@example.test",
      guestPhone: null,
      stayType: "resident",
      startsOn: await propertyDay(30),
      endsOn: null,
    });
    expect(again.guestCreated).toBe(false);

    const [guest] = await owner.$queryRawUnsafe<{ fullName: string }[]>(
      `select full_name as "fullName" from public.guests where id = $1::uuid`,
      again.guestId,
    );
    expect(guest?.fullName).toBe("Nezihe Muhiddin");

    const bookings = await owner.$queryRawUnsafe<{ id: string }[]>(
      `select id from public.reservations where guest_id = $1::uuid`,
      again.guestId,
    );
    expect(bookings).toHaveLength(2);
  });

  it("refuses a Unit in a Property the viewer cannot reach", async () => {
    await expect(
      reservations.createReservation(MEMBER, {
        propertyId: OTHER_PROPERTY,
        accommodationUnitId: OTHER_UNIT,
        guestName: "Refused Booking",
        guestEmail: null,
        guestPhone: null,
        stayType: "guest",
        startsOn: await propertyDay(40),
        endsOn: await propertyDay(42),
      }),
    ).rejects.toBeInstanceOf(ReservationRefusedError);

    // And nothing was written on the way to being refused: the Unit is read
    // before the Guest, so a refused booking leaves no profile behind.
    const guests = await owner.$queryRawUnsafe<{ id: string }[]>(
      `select id from public.guests where full_name = $1`,
      "Refused Booking",
    );
    expect(guests).toEqual([]);
  });

  it("refuses dates that are not a period a Reservation can have", async () => {
    const day = await propertyDay(0);
    const shape = {
      propertyId: PROPERTY,
      accommodationUnitId: BOOKED,
      guestName: "No Night",
      guestEmail: null,
      guestPhone: null,
      stayType: "guest" as const,
    };

    // No night in it. An empty daterange overlaps nothing, so this would hold
    // the Unit against nobody.
    await expect(
      reservations.createReservation(MEMBER, {
        ...shape,
        startsOn: day,
        endsOn: day,
      }),
    ).rejects.toBeInstanceOf(ReservationPeriodError);

    // Behind the Property's own day, not the runner's.
    await expect(
      reservations.createReservation(MEMBER, {
        ...shape,
        startsOn: await propertyDay(-1),
        endsOn: await propertyDay(2),
      }),
    ).rejects.toBeInstanceOf(ReservationPeriodError);

    // A day that does not exist. It matches the pattern and parses as the 3rd
    // of March, so a regular expression alone would book a different week.
    await expect(
      reservations.createReservation(MEMBER, {
        ...shape,
        startsOn: "2027-02-31",
        endsOn: "2027-03-04",
      }),
    ).rejects.toBeInstanceOf(ReservationPeriodError);
  });
});

describe("two people booking at once", () => {
  /**
   * The race moved with the constraint.
   *
   * It used to be two check-ins on one Unit, which `stays_no_double_booking`
   * decided. That is no longer reachable through this module: two confirmed
   * Reservations cannot overlap, and any two Reservations that can both be
   * checked in today both cover tonight — so the Reservation constraint fires
   * first and the Stay one never gets the question (ADR 0024). It is still
   * there, and the check-out test above is what still reaches it.
   *
   * So the concurrent question is asked where it now lives: two clerks taking
   * the same booking at the same moment.
   */
  it("produces exactly one Reservation, and the loser fails on the constraint", async () => {
    const booking = {
      propertyId: PROPERTY,
      accommodationUnitId: RACED,
      guestEmail: null,
      guestPhone: null,
      stayType: "guest" as const,
      startsOn: await propertyDay(14),
      endsOn: await propertyDay(18),
    };

    // Two clients, so these are two connections racing rather than two promises
    // taking turns on one.
    const outcomes = await Promise.allSettled([
      reservations.createReservation(MEMBER, {
        ...booking,
        guestName: "Annie Easley",
      }),
      rivalReservations.createReservation(MEMBER, {
        ...booking,
        guestName: "Melba Roy",
      }),
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

    const booked = await owner.$queryRawUnsafe<{ id: string }[]>(
      `select id from public.reservations
       where accommodation_unit_id = $1::uuid and status = 'confirmed'`,
      RACED,
    );
    expect(booked).toHaveLength(1);

    // And the Guest the loser described is not on file either: the whole
    // booking is one transaction, so a profile nobody asked for is not what a
    // refused booking leaves behind.
    const guests = await owner.$queryRawUnsafe<{ id: string }[]>(
      `select id from public.guests
       where organization_id = $1::uuid and full_name in ($2, $3)`,
      ORG,
      "Annie Easley",
      "Melba Roy",
    );
    expect(guests).toHaveLength(1);
  });
});

describe("checking out", () => {
  const ARRIVING = reservationId();
  const WAITING = reservationId();

  beforeAll(async () => {
    // The first is booked until tomorrow and leaves today; the second arrives
    // today. They genuinely overlap until that early departure is recorded,
    // which is what makes this test about check-out rather than about `[)`.
    //
    // The second is booked after the first has been checked in, because that is
    // the only order in which one Unit can be promised twice over one set of
    // nights now (ADR 0024) — and it is the order a front desk produces when
    // somebody is leaving early.
    await reserve(ARRIVING, PROPERTY, ORG, DEPARTING_C, "Sabiha Gökçen", {
      from: -2,
      to: 1,
    });
  });

  it("frees the Unit by recording when they actually left", async () => {
    const { stayId } = await reservations.checkIn(MEMBER, ARRIVING);

    // While they are in, the Unit is theirs: a booking over tonight is refused
    // at the booking, not at the desk on the day (ADR 0029).
    await expect(
      reserve(WAITING, PROPERTY, ORG, DEPARTING_C, "Cahit Arf", {
        from: 0,
        to: 3,
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining("55006") });

    await reservations.checkOut(MEMBER, stayId, ACKNOWLEDGED);

    const [departed] = await owner.$queryRawUnsafe<
      { status: string; endsOn: string; today: string }[]
    >(
      `select stay.status,
              to_char(stay.ends_on, 'YYYY-MM-DD') as "endsOn",
              to_char(app.property_today(property.id),
                      'YYYY-MM-DD') as "today"
       from public.stays as stay
       join public.properties as property on property.id = stay.property_id
       where stay.id = $1::uuid`,
      stayId,
    );
    expect(departed?.status).toBe("departed");

    // And the Reservation says so too, rather than reading as arrived forever
    // (CO-S1-01, CO-DIFF-02).
    const [ended] = await owner.$queryRawUnsafe<{ status: string }[]>(
      `select status from public.reservations where id = $1::uuid`,
      ARRIVING,
    );
    expect(ended?.status).toBe("checked_out");
    // They were booked until tomorrow and left today, and the record says so.
    // The status alone would have freed the Unit — the index and the exclusion
    // constraint are both partial on it — so without this assertion the date
    // is untested.
    expect(departed?.endsOn).toBe(departed?.today);

    // The same Unit, the same nights, and now it works: the Stay left the
    // current states and ends_on moved to the day they actually left. Nothing
    // was deleted.
    await reserve(WAITING, PROPERTY, ORG, DEPARTING_C, "Cahit Arf", {
      from: 0,
      to: 3,
    });
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
    await reservations.checkOut(MEMBER, stayId, ACKNOWLEDGED);

    const [row] = await owner.$queryRawUnsafe<
      { departedOn: string; today: string }[]
    >(
      `select event.payload->>'departedOn' as "departedOn",
              to_char(app.property_today(property.id), 'YYYY-MM-DD') as "today"
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

    await reservations.checkOut(MEMBER, stayId, ACKNOWLEDGED);

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

    await reservations.checkOut(MEMBER, stayId, ACKNOWLEDGED);

    const [after] = await owner.$queryRawUnsafe<
      { endsOn: string; today: string }[]
    >(
      `select to_char(stay.ends_on, 'YYYY-MM-DD') as "endsOn",
              to_char(app.property_today(property.id),
                      'YYYY-MM-DD') as "today"
       from public.stays as stay
       join public.properties as property on property.id = stay.property_id
       where stay.id = $1::uuid`,
      stayId,
    );
    expect(after?.endsOn).toBe(after?.today);
  });

  it("refuses an early departure nobody acknowledged, and changes nothing", async () => {
    const reservation = reservationId();
    const unit = await aUnit();
    await reserve(reservation, PROPERTY, ORG, unit, "Leaving Early", {
      from: 0,
      to: 3,
    });
    const { stayId } = await reservations.checkIn(MEMBER, reservation);

    await expect(
      reservations.checkOut(MEMBER, stayId, {
        ...ACKNOWLEDGED,
        earlyDeparture: false,
      }),
    ).rejects.toBeInstanceOf(EarlyDepartureError);

    const [stay] = await owner.$queryRawUnsafe<{ status: string }[]>(
      `select status from public.stays where id = $1::uuid`,
      stayId,
    );
    expect(stay?.status).toBe("in_house");

    await reservations.checkOut(MEMBER, stayId, ACKNOWLEDGED);
    const history = await audit.historyOf(MEMBER, "stay", stayId);
    expect(history[0]?.context).toMatchObject({ earlyDeparture: true });
  });

  it("dates an overdue check-out by today, not by the plan (CO-S1-02)", async () => {
    const reservation = reservationId();
    const unit = await aUnit();
    await reserve(reservation, PROPERTY, ORG, unit, "Stayed On", {
      from: -5,
      to: -2,
    });
    const stayId = await arrived(reservation, unit, -5, -2);

    await reservations.checkOut(MEMBER, stayId, {
      ...ACKNOWLEDGED,
      earlyDeparture: false,
    });

    const [row] = await owner.$queryRawUnsafe<
      { endsOn: string; today: string }[]
    >(
      `select to_char(stay.ends_on, 'YYYY-MM-DD') as "endsOn",
              to_char(app.property_today(stay.property_id), 'YYYY-MM-DD') as "today"
         from public.stays as stay where stay.id = $1::uuid`,
      stayId,
    );
    expect(row?.endsOn).toBe(row?.today);
  });

  it("refuses a Stay whose Reservation does not match, rather than repairing it (CO-S1-28)", async () => {
    // A pair broken before the rule existed: the Guest in house behind a
    // Reservation that never moved. Written in replica mode, which is the only
    // way to produce what the database now refuses.
    const reservation = reservationId();
    const unit = await aUnit();
    await reserve(reservation, PROPERTY, ORG, unit, "Broken Pair", {
      from: -1,
      to: 2,
    });
    const [stay] = await owner.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `set local session_replication_role = replica`,
      );
      return tx.$queryRawUnsafe<{ id: string }[]>(
        `insert into public.stays
           (organization_id, property_id, accommodation_unit_id, reservation_id,
            stay_type, status, starts_on, ends_on)
         values ($2::uuid, $3::uuid, $4::uuid, $1::uuid, 'guest', 'in_house',
                 app.property_today($3::uuid) - 1, app.property_today($3::uuid) + 2)
         returning id`,
        reservation,
        ORG,
        PROPERTY,
        unit,
      );
    });

    await expect(
      reservations.checkOut(MEMBER, stay!.id, ACKNOWLEDGED),
    ).rejects.toBeInstanceOf(CheckOutError);

    const [after] = await owner.$queryRawUnsafe<{ status: string }[]>(
      `select status from public.stays where id = $1::uuid`,
      stay!.id,
    );
    expect(after?.status).toBe("in_house");
  });

  it("checks out a Guest who is not early without asking", async () => {
    const reservation = reservationId();
    const unit = await aUnit();
    await reserve(reservation, PROPERTY, ORG, unit, "Leaving On Time");
    const stayId = await arrived(reservation, unit, -3, 0);

    await expect(
      reservations.checkOut(MEMBER, stayId, {
        ...ACKNOWLEDGED,
        earlyDeparture: false,
      }),
    ).resolves.toMatchObject({ stayId, folioClosed: false });
  });

  it("refuses a Stay that has already departed", async () => {
    const reservation = reservationId();
    await reserve(reservation, PROPERTY, ORG, DEPARTED, "Feza Gürsey", {
      from: -1,
      to: 1,
    });
    const { stayId } = await reservations.checkIn(MEMBER, reservation);
    await reservations.checkOut(MEMBER, stayId, ACKNOWLEDGED);

    await expect(
      reservations.checkOut(MEMBER, stayId, ACKNOWLEDGED),
    ).rejects.toBeInstanceOf(CheckOutError);
  });

  it("refuses a Stay belonging to another Organization", async () => {
    const reservation = reservationId();
    await reserve(
      reservation,
      OTHER_PROPERTY,
      OTHER_ORG,
      OTHER_THIRD,
      "Intruder",
    );
    const { stayId } = await rivalReservations.checkIn(OUTSIDER, reservation);

    await expect(
      reservations.checkOut(MEMBER, stayId, ACKNOWLEDGED),
    ).rejects.toBeInstanceOf(CheckOutError);

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
    await arrived(onTime, DEPARTING_A, -3, 0);

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
              app.property_today(property.id) - 9,
              app.property_today(property.id) - 2
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

describe("ending a booking that will not become a Stay", () => {
  it("cancels with a reason, records it, and frees the nights", async () => {
    const unit = await aUnit();
    const booking = reservationId();
    await reserve(booking, PROPERTY, ORG, unit, "Changed Plans", {
      from: 2,
      to: 4,
    });

    await expect(
      reservations.cancelReservation(MEMBER, booking, "  "),
    ).rejects.toBeInstanceOf(ReservationReasonError);

    await expect(
      reservations.cancelReservation(MEMBER, booking, "guest phoned to cancel"),
    ).resolves.toEqual({ reservationId: booking, status: "cancelled" });

    const [record] = await audit.historyOf(MEMBER, "reservation", booking);
    expect(record?.action).toBe("reservation.cancelled");
    expect(record?.reason).toBe("guest phoned to cancel");

    // The same nights can be sold again: a cancelled booking holds nothing.
    await expect(
      reservations.createReservation(MEMBER, {
        propertyId: PROPERTY,
        accommodationUnitId: unit,
        guestName: "Took The Room",
        guestEmail: null,
        guestPhone: null,
        stayType: "guest",
        startsOn: await propertyDay(2),
        endsOn: await propertyDay(4),
      }),
    ).resolves.toBeDefined();
  });

  it("refuses to cancel a booking whose Guest has arrived", async () => {
    const unit = await aUnit();
    const booking = reservationId();
    await reserve(booking, PROPERTY, ORG, unit, "Already Arrived");
    await reservations.checkIn(MEMBER, booking);

    await expect(
      reservations.cancelReservation(MEMBER, booking, "wrong booking"),
    ).rejects.toBeInstanceOf(ReservationEndError);
  });

  it("marks a no-show only once their first night has come", async () => {
    const unit = await aUnit();
    const future = reservationId();
    const tonight = reservationId();
    await reserve(future, PROPERTY, ORG, unit, "Not Yet Due", {
      from: 3,
      to: 4,
    });
    await reserve(tonight, PROPERTY, ORG, unit, "Never Came", {
      from: -1,
      to: 1,
    });

    await expect(
      reservations.markNoShow(MEMBER, future),
    ).rejects.toBeInstanceOf(ReservationEndError);

    await expect(reservations.markNoShow(MEMBER, tonight)).resolves.toEqual({
      reservationId: tonight,
      status: "no_show",
    });
    // And it leaves the arrivals list, because it is no longer arriving.
    const listed = await reservations.listArrivals(MEMBER, PROPERTY);
    expect(listed.map((arrival) => arrival.reservationId)).not.toContain(
      tonight,
    );
  });

  it("refuses another Organization's booking with the same answer", async () => {
    const booking = reservationId();
    await reserve(
      booking,
      OTHER_PROPERTY,
      OTHER_ORG,
      OTHER_SECOND,
      "Elsewhere",
      {
        from: 5,
        to: 6,
      },
    );

    await expect(
      reservations.cancelReservation(MEMBER, booking, "not mine to cancel"),
    ).rejects.toBeInstanceOf(ReservationEndError);
    await expect(
      reservations.markNoShow(MEMBER, booking),
    ).rejects.toBeInstanceOf(ReservationEndError);
  });
});
