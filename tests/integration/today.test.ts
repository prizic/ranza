/**
 * Today against a real database (docs/features/today-dashboard, slice 1).
 *
 * The derivation is unit-tested; this proves the path under it: the new core
 * read (`workingDay`) and the new departures count, run as `ranza_app` under
 * the policies, composed exactly as the workspace composes them. Who reaches a
 * Property, which permissions a role carries and whether a balance may leave
 * the server are the database's answers here, not a fixture's.
 *
 * Breaks that were run, and what went red:
 *   workingDay answering every permission          TD-S1-01, TD-S1-03, TD-S1-29
 *   permissions read from the viewer's other Organization         TD-S1-29
 *   workingDay's Today gate removed      TD-S1-05 (reached without Today)
 *   todayView's maintenance capability gate removed      TD-S4-05 (the
 *     direct todayView read after the capability is switched off)
 *   rooms out of order counted per hold, not per Unit      TD-S4-04
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../packages/db/src";
import { createCoreModule } from "../../packages/ranza/core/src";
import { createAccommodationModule } from "../../packages/ranza/accommodation/src";
import { createFoliosModule } from "../../packages/ranza/folios/src";
import { createHousekeepingModule } from "../../packages/ranza/housekeeping/src";
import {
  createMaintenanceModule,
  MAINTENANCE_CAPABILITY,
} from "../../packages/ranza/maintenance/src";
import { createReservationsModule } from "../../packages/ranza/reservations/src";
import {
  readTodaySummary,
  todayReads,
} from "../../apps/operator-workspace/src/server/today-summary";

// Properties and rooms are new every run, so a run is never disturbed by what
// the last one checked in: a check-in is not an act that repeats.
const ORG = "de000002-0000-4000-8000-000000000001";
const OTHER_ORG = "de000002-0000-4000-8000-000000000002";
const PROPERTY = randomUUID();
const BARE = randomUUID();
const OTHER_PROPERTY = randomUUID();
const ARRIVAL_ROOM = randomUUID();
const DUE_ROOM = randomUUID();
const BROKEN_ROOM = randomUUID();
const BARE_ROOM = randomUUID();
const OTHER_ROOM = randomUUID();
const CANCELLED_ROOM = randomUUID();
const NO_SHOW_ROOM = randomUUID();
const WITHDRAWN_ROOM = randomUUID();
const MANAGER = "de000001-0000-4000-8000-000000000001";
const DESK = "de000001-0000-4000-8000-000000000002";
const HOUSEKEEPER = "de000001-0000-4000-8000-000000000003";
const FINANCE = "de000001-0000-4000-8000-000000000004";
const OUTSIDER = "de000001-0000-4000-8000-000000000005";
const TWO_ORGS = "de000001-0000-4000-8000-000000000006";

const BALANCE = 184_000;
const DATABASE_BUDGET_MS = 60_000;

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const owner = createPrismaClient(process.env.DIRECT_URL!);
const modules = {
  core: createCoreModule({ db: prisma }),
  reservations: createReservationsModule({ db: prisma }),
  accommodation: createAccommodationModule({ db: prisma }),
  housekeeping: createHousekeepingModule({ db: prisma }),
  folios: createFoliosModule({ db: prisma }),
  maintenance: createMaintenanceModule({ db: prisma }),
};

const CAPABILITIES = {
  frontDesk: { moduleKey: "front_office", capabilityKey: "front_desk" },
  housekeeping: { moduleKey: "housekeeping", capabilityKey: "housekeeping" },
  billing: { moduleKey: "billing_folios", capabilityKey: "finance" },
  maintenance: MAINTENANCE_CAPABILITY,
};

const failures: unknown[] = [];

function todayFor(userId: string, propertyId: string) {
  return readTodaySummary(
    todayReads(modules, userId),
    propertyId,
    CAPABILITIES,
    (section, error) => failures.push({ section, error }),
  );
}

function arrivalsOf(summary: Awaited<ReturnType<typeof todayFor>>) {
  expect(summary?.arrivals?.status).toBe("ok");
  return summary?.arrivals?.status === "ok"
    ? summary.arrivals.data
    : { expected: -1, checkedIn: -1 };
}

async function seed() {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1, 'today-manager@example.test'), ($2, 'today-desk@example.test'),
       ($3, 'today-housekeeper@example.test'), ($4, 'today-finance@example.test'),
       ($5, 'today-outsider@example.test'), ($6, 'today-two@example.test')
     on conflict (id) do nothing`,
    MANAGER,
    DESK,
    HOUSEKEEPER,
    FINANCE,
    OUTSIDER,
    TWO_ORGS,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status) values
       ($1, 'Today Integration', 'active'), ($2, 'Today Elsewhere', 'active')
     on conflict (id) do nothing`,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name, timezone) values
       ($1::uuid, $4::uuid, 'Today Property ' || left($1::text, 8), 'Europe/Istanbul'),
       ($2::uuid, $4::uuid, 'Today Front Desk Only ' || left($2::text, 8), 'Europe/Istanbul'),
       ($3::uuid, $5::uuid, 'Today Elsewhere ' || left($3::text, 8), 'Europe/Istanbul')
     on conflict (id) do nothing`,
    PROPERTY,
    BARE,
    OTHER_PROPERTY,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units
       (id, property_id, organization_id, name, unit_type, capacity, floor) values
       ($1, $6, $8, 'TD-101', 'room', 2, 1),
       ($2, $6, $8, 'TD-102', 'room', 2, 1),
       ($3, $6, $8, 'TD-201', 'room', 2, 2),
       ($4, $7, $8, 'TD-B1', 'room', 2, 1),
       ($5, $9, $10, 'TD-X1', 'room', 2, 1),
       ($11, $6, $8, 'TD-103', 'room', 2, 1),
       ($12, $6, $8, 'TD-104', 'room', 2, 1),
       ($13, $7, $8, 'TD-B2', 'room', 2, 1)
     on conflict (id) do nothing`,
    ARRIVAL_ROOM,
    DUE_ROOM,
    BROKEN_ROOM,
    BARE_ROOM,
    OTHER_ROOM,
    PROPERTY,
    BARE,
    ORG,
    OTHER_PROPERTY,
    OTHER_ORG,
    CANCELLED_ROOM,
    NO_SHOW_ROOM,
    WITHDRAWN_ROOM,
  );
  await owner.$executeRawUnsafe(
    `update public.accommodation_units
        set status = 'out_of_service'
      where id = $1::uuid`,
    BROKEN_ROOM,
  );
  for (const org of [ORG, OTHER_ORG]) {
    await owner.$executeRawUnsafe(
      `insert into public.subscriptions (organization_id, status)
       values ($1, 'active') on conflict (organization_id) do nothing`,
      org,
    );
    await owner.$executeRawUnsafe(
      `insert into public.entitlements (organization_id, module_key, status)
       select $1::uuid, module_key, 'active'
         from unnest(array['platform_core', 'front_office', 'housekeeping',
                           'billing_folios']) as module_key
       on conflict (organization_id, module_key) do nothing`,
      org,
    );
  }
  // Everything at the first Property; only Today and the front desk at the
  // second, so its housekeeping and billing cards must be absent.
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     select property_id::uuid, organization_id::uuid, capability_key, true
       from (values
         ($1, $4, 'today'), ($1, $4, 'front_desk'), ($1, $4, 'housekeeping'),
         ($1, $4, 'finance'),
         ($2, $4, 'today'), ($2, $4, 'front_desk'),
         ($3, $5, 'today'), ($3, $5, 'front_desk'), ($3, $5, 'finance')
       ) as enabled(property_id, organization_id, capability_key)
     on conflict (property_id, capability_key) do nothing`,
    PROPERTY,
    BARE,
    OTHER_PROPERTY,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope) values
       ($1, $3, 'manager', 'organization_wide'),
       ($1, $4, 'front_desk', 'organization_wide'),
       ($1, $5, 'housekeeping', 'organization_wide'),
       ($1, $6, 'finance', 'organization_wide'),
       ($2, $7, 'manager', 'organization_wide'),
       ($1, $8, 'housekeeping', 'organization_wide'),
       ($2, $8, 'finance', 'organization_wide')
     on conflict (organization_id, user_id) do nothing`,
    ORG,
    OTHER_ORG,
    MANAGER,
    DESK,
    HOUSEKEEPER,
    FINANCE,
    OUTSIDER,
    TWO_ORGS,
  );
}

/** A Reservation for today and tomorrow — confirmed unless said otherwise. */
async function arriving(
  unitId: string,
  propertyId: string,
  status: "confirmed" | "cancelled" | "no_show" = "confirmed",
): Promise<string> {
  const reservationId = randomUUID();
  await owner.$executeRawUnsafe(
    `with guest as (
       insert into public.guests (organization_id, full_name)
       select organization_id, 'Today Guest' from public.properties
        where id = $3::uuid
       returning id, organization_id
     )
     insert into public.reservations
       (id, organization_id, property_id, accommodation_unit_id,
        guest_id, stay_type, status, starts_on, ends_on)
     select $1::uuid, guest.organization_id, $3::uuid, $2::uuid, guest.id,
            'guest', $4,
            app.property_today($3::uuid), app.property_today($3::uuid) + 1
       from guest`,
    reservationId,
    unitId,
    propertyId,
    status,
  );
  return reservationId;
}

/**
 * A Guest who came two days ago and is due out today, with a charge on their
 * Folio. Seeded as the owner: an in-house Stay needs a night behind it, which
 * a check-in made today cannot have. The reads under test still run as
 * ranza_app.
 */
async function dueTodayOwing(): Promise<void> {
  await owner.$executeRawUnsafe(
    `with guest as (
       insert into public.guests (organization_id, full_name)
       values ($1::uuid, 'Today Leaver') returning id
     ), reservation as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       select $1::uuid, $2::uuid, $3::uuid, guest.id, 'guest', 'checked_in',
              app.property_today($2::uuid) - 2, app.property_today($2::uuid)
         from guest
       returning id
     ), stay as (
       insert into public.stays
         (organization_id, property_id, accommodation_unit_id, reservation_id,
          stay_type, status, starts_on, ends_on)
       select $1::uuid, $2::uuid, $3::uuid, reservation.id, 'guest', 'in_house',
              app.property_today($2::uuid) - 2, app.property_today($2::uuid)
         from reservation
       returning id
     ), folio as (
       insert into public.folios (organization_id, property_id, stay_id, currency)
       select $1::uuid, $2::uuid, stay.id, 'TRY' from stay
       returning id
     )
     insert into public.folio_lines
       (organization_id, property_id, folio_id, line_type, description, amount_minor)
     select $1::uuid, $2::uuid, folio.id, 'charge', 'Minibar', $4::bigint from folio`,
    ORG,
    PROPERTY,
    DUE_ROOM,
    BALANCE,
  );
}

beforeAll(async () => {
  await seed();
  await arriving(ARRIVAL_ROOM, PROPERTY);
  // Neither is an arrival: TD-S1-10 counts them in neither number.
  await arriving(CANCELLED_ROOM, PROPERTY, "cancelled");
  await arriving(NO_SHOW_ROOM, PROPERTY, "no_show");
  await dueTodayOwing();
  // One Guest checked in and out today at the second Property.
  const bare = await arriving(BARE_ROOM, BARE);
  const { stayId } = await modules.reservations.checkIn(DESK, bare);
  await modules.reservations.checkOut(DESK, stayId, {
    folioVersion: null,
    earlyDeparture: true,
    balanceReason: null,
  });
}, DATABASE_BUDGET_MS * 3);

afterAll(async () => {
  await prisma.$disconnect();
  await owner.$disconnect();
});

describe("Today, per shipped role", () => {
  it(
    "focus_follows_the_permissions_held_not_the_role_name",
    async () => {
      const focus = async (user: string) =>
        (await todayFor(user, PROPERTY))?.focus;
      expect(await focus(MANAGER)).toBe("manager");
      expect(await focus(DESK)).toBe("front_desk");
      expect(await focus(HOUSEKEEPER)).toBe("housekeeping");
      expect(await focus(FINANCE)).toBe("finance");
      expect(failures).toEqual([]);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "the_summary_carries_no_balance_without_finance_manage_folio",
    async () => {
      const housekeeping = JSON.stringify(
        await todayFor(HOUSEKEEPER, PROPERTY),
      );
      // The departures it reads for its queue carry the balance under the
      // policies; the answer sent on must not.
      expect(housekeeping).not.toContain(String(BALANCE));
      expect(housekeeping).not.toMatch(/"balance"|folioId/);

      const desk = await todayFor(DESK, PROPERTY);
      expect(JSON.stringify(desk)).toContain(String(BALANCE));

      const finance = await todayFor(FINANCE, PROPERTY);
      expect(finance?.money).toMatchObject({
        status: "ok",
        data: {
          leaving: {
            owing: 1,
            owed: [{ amountMinor: BALANCE, currency: "TRY" }],
          },
        },
      });
    },
    DATABASE_BUDGET_MS,
  );
});

describe("the figures, as the database answers them", () => {
  it(
    "arrivals_count_checked_in_of_expected: arrivals, occupancy and readiness come from the real reads",
    async () => {
      const summary = await todayFor(MANAGER, PROPERTY);
      expect(summary?.arrivals).toMatchObject({
        status: "ok",
        // One confirmed arrival; the cancelled and the no-show are in neither
        // number (TD-S1-10).
        data: { expected: 1, checkedIn: 0 },
      });
      expect(summary?.occupancy).toMatchObject({
        status: "ok",
        data: { inHouse: 1 },
      });
      expect(summary?.rooms).toMatchObject({
        status: "ok",
        data: { total: 5, outOfService: 1 },
      });
      expect(summary?.attention.items.map((item) => item.kind)).toEqual(
        expect.arrayContaining(["balance", "out_of_service"]),
      );
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "departures_count_out_of_due_and_overdue_apart: a check-out today is counted",
    async () => {
      const summary = await todayFor(DESK, BARE);
      expect(summary?.departures).toMatchObject({
        status: "ok",
        data: { departed: 1, due: 1, overdue: 0 },
      });
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "the_day_is_the_property_business_date",
    async () => {
      const [row] = await owner.$queryRawUnsafe<{ today: string }[]>(
        `select to_char(app.property_today($1::uuid), 'YYYY-MM-DD') as today`,
        PROPERTY,
      );
      const summary = await todayFor(MANAGER, PROPERTY);
      expect(row).toBeDefined();
      expect(summary?.day.businessDate).toBe(row?.today);
      expect(summary?.day.cutoff).toBe("04:00");
    },
    DATABASE_BUDGET_MS,
  );
});

describe("a withdrawn check-in", () => {
  it(
    "a_withdrawn_check_in_counts_as_an_arrival_again",
    async () => {
      const before = await todayFor(DESK, BARE);
      const reservationId = await arriving(WITHDRAWN_ROOM, BARE);
      const { stayId } = await modules.reservations.checkIn(
        DESK,
        reservationId,
      );

      const checkedIn = await todayFor(DESK, BARE);
      expect(checkedIn?.arrivals).toMatchObject({
        data: {
          expected: arrivalsOf(before).expected + 1,
          checkedIn: arrivalsOf(before).checkedIn + 1,
        },
      });

      // ADR 0022: withdrawn with a reason, the Reservation arrives again.
      await modules.reservations.reverseCheckIn(
        DESK,
        stayId,
        "Checked into the wrong room by mistake",
      );
      const withdrawn = await todayFor(DESK, BARE);
      expect(withdrawn?.arrivals).toMatchObject({
        data: {
          expected: arrivalsOf(before).expected + 1,
          checkedIn: arrivalsOf(before).checkedIn,
        },
      });
    },
    DATABASE_BUDGET_MS,
  );
});

describe("reach", () => {
  it(
    "a_card_whose_capability_the_property_lacks_is_absent",
    async () => {
      const summary = await todayFor(MANAGER, BARE);
      expect(summary).not.toBeNull();
      expect(summary && "rooms" in summary).toBe(false);
      expect(summary && "money" in summary).toBe(false);
      expect(summary?.arrivals?.status).toBe("ok");
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_property_out_of_reach_summarises_nothing",
    async () => {
      expect(await todayFor(MANAGER, OTHER_PROPERTY)).toBeNull();
      expect(await todayFor(OUTSIDER, PROPERTY)).toBeNull();
      // A Property that does not exist answers exactly the same.
      expect(await todayFor(MANAGER, randomUUID())).toBeNull();
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_summary_is_bounded_to_the_property_organization",
    async () => {
      // Housekeeping here, finance in the other Organization: the finance
      // permission must not follow them in.
      const summary = await todayFor(TWO_ORGS, PROPERTY);
      expect(summary?.focus).toBe("housekeeping");
      expect(JSON.stringify(summary)).not.toContain(String(BALANCE));
      const elsewhere = await todayFor(TWO_ORGS, OTHER_PROPERTY);
      expect(elsewhere?.focus).toBe("finance");
    },
    DATABASE_BUDGET_MS,
  );
});

/**
 * The cases the first fixtures could not reach: a Property the viewer reaches
 * but without Today, a member assigned elsewhere, the hours between midnight
 * and the cutoff, a Guest overdue, and one bed out of service in a let room.
 */
describe("the edges", () => {
  const NO_TODAY = randomUUID();
  const MIDNIGHT = randomUUID();
  const OVERDUE_ROOM = randomUUID();
  const SHARED_ROOM = randomUUID();
  const BROKEN_BED = randomUUID();
  const MIDNIGHT_ROOM = randomUUID();
  const ASSIGNED = "de000001-0000-4000-8000-000000000007";

  /**
   * A timezone whose clock reads one in the morning now (two, near the top of
   * the hour), so the Property is between midnight and its 04:00 cutoff
   * whenever this runs. Etc/GMT names count the other way: Etc/GMT-3 is UTC+3.
   */
  function justAfterMidnight(): string {
    const now = new Date();
    const target = now.getUTCMinutes() >= 50 ? 2 : 1;
    let offset = (((target - now.getUTCHours()) % 24) + 24) % 24;
    if (offset > 14) offset -= 24;
    if (offset === 0) return "Etc/GMT";
    return offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
  }

  beforeAll(async () => {
    await owner.$executeRawUnsafe(
      `insert into public.properties (id, organization_id, name, timezone) values
         ($1::uuid, $3::uuid, 'Today Without Today ' || left($1::text, 8), 'Europe/Istanbul'),
         ($2::uuid, $3::uuid, 'Today After Midnight ' || left($2::text, 8), $4)`,
      NO_TODAY,
      MIDNIGHT,
      ORG,
      justAfterMidnight(),
    );
    // The front desk at both, and Today only at the second.
    await owner.$executeRawUnsafe(
      `insert into public.property_capabilities
         (property_id, organization_id, capability_key, enabled)
       values ($1, $3, 'front_desk', true), ($2, $3, 'front_desk', true),
              ($2, $3, 'today', true)`,
      NO_TODAY,
      MIDNIGHT,
      ORG,
    );
    await owner.$executeRawUnsafe(
      `insert into public.accommodation_units
         (id, property_id, organization_id, name, unit_type, capacity, floor) values
         ($1, $4, $5, 'TD-B3', 'room', 2, 1),
         ($2, $6, $5, 'TD-M1', 'room', 2, 1),
         ($3, $6, $5, 'TD-M2', 'room', 2, 1)`,
      OVERDUE_ROOM,
      SHARED_ROOM,
      MIDNIGHT_ROOM,
      BARE,
      ORG,
      MIDNIGHT,
    );
    await owner.$executeRawUnsafe(
      `insert into public.accommodation_units
         (id, property_id, organization_id, parent_id, parent_unit_type,
          name, unit_type, capacity, status)
       values ($1, $2, $3, $4, 'room', 'B', 'bed', 1, 'out_of_service')`,
      BROKEN_BED,
      MIDNIGHT,
      ORG,
      SHARED_ROOM,
    );
    // Assigned to the second Property only, never to the first.
    await owner.$executeRawUnsafe(
      `insert into public.users (id, email)
       values ($1, 'today-assigned@example.test') on conflict (id) do nothing`,
      ASSIGNED,
    );
    await owner.$executeRawUnsafe(
      `insert into public.organization_memberships
         (organization_id, user_id, role, access_scope)
       values ($1, $2, 'front_desk', 'assigned_properties')
       on conflict (organization_id, user_id) do nothing`,
      ORG,
      ASSIGNED,
    );
    await owner.$executeRawUnsafe(
      `insert into public.property_assignments (property_id, organization_id, user_id)
       values ($1, $2, $3) on conflict do nothing`,
      BARE,
      ORG,
      ASSIGNED,
    );
    // A Guest due out yesterday and still here.
    await owner.$executeRawUnsafe(
      `with guest as (
         insert into public.guests (organization_id, full_name)
         values ($1::uuid, 'Today Overstayer') returning id
       ), reservation as (
         insert into public.reservations
           (organization_id, property_id, accommodation_unit_id, guest_id,
            stay_type, status, starts_on, ends_on)
         select $1::uuid, $2::uuid, $3::uuid, guest.id, 'guest', 'checked_in',
                app.property_today($2::uuid) - 3, app.property_today($2::uuid) - 1
           from guest
         returning id
       )
       insert into public.stays
         (organization_id, property_id, accommodation_unit_id, reservation_id,
          stay_type, status, starts_on, ends_on)
       select $1::uuid, $2::uuid, $3::uuid, reservation.id, 'guest', 'in_house',
              app.property_today($2::uuid) - 3, app.property_today($2::uuid) - 1
         from reservation`,
      ORG,
      BARE,
      OVERDUE_ROOM,
    );
  }, DATABASE_BUDGET_MS);

  it(
    "a_property_out_of_reach_summarises_nothing: reached without Today, or not assigned",
    async () => {
      // The viewer reaches it — the property policy lets it through — but it
      // does not have Today, which only workingDay's own gate refuses.
      expect(await todayFor(MANAGER, NO_TODAY)).toBeNull();
      // Assigned elsewhere in the same Organization.
      expect(await todayFor(ASSIGNED, PROPERTY)).toBeNull();
      expect((await todayFor(ASSIGNED, BARE))?.focus).toBe("front_desk");
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "the_day_is_the_property_business_date: between midnight and the cutoff",
    async () => {
      const before = await todayFor(DESK, MIDNIGHT);
      expect(before).not.toBeNull();
      const day = before!.day;
      // The clock has moved on; the working day has not.
      expect(day.calendarDate > day.businessDate).toBe(true);
      const nextDay = new Date(`${day.businessDate}T12:00:00Z`);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      expect(day.calendarDate).toBe(nextDay.toISOString().slice(0, 10));

      // A booking for the working day is today's arrival, and a check-out now,
      // at one in the morning, counts towards the working day.
      const reservationId = await arriving(MIDNIGHT_ROOM, MIDNIGHT);
      const arrived = await todayFor(DESK, MIDNIGHT);
      expect(arrived?.arrivals).toMatchObject({ data: { expected: 1 } });
      const { stayId } = await modules.reservations.checkIn(
        DESK,
        reservationId,
      );
      await modules.reservations.checkOut(DESK, stayId, {
        folioVersion: null,
        earlyDeparture: true,
        balanceReason: null,
      });
      const departed = await todayFor(DESK, MIDNIGHT);
      expect(departed?.departures).toMatchObject({ data: { departed: 1 } });
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "departures_count_out_of_due_and_overdue_apart: somebody still here from yesterday",
    async () => {
      const summary = await todayFor(DESK, BARE);
      expect(summary?.departures).toMatchObject({
        status: "ok",
        data: { overdue: 1 },
      });
      expect(
        summary?.attention.items.some((item) => item.kind === "overdue"),
      ).toBe(true);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "an_out_of_service_unit_needs_attention: one bed in a let room",
    async () => {
      const summary = await todayFor(DESK, MIDNIGHT);
      expect(summary?.attention.items).toContainEqual(
        expect.objectContaining({
          kind: "out_of_service",
          unit: { unitName: "B", roomName: "TD-M1" },
        }),
      );
    },
    DATABASE_BUDGET_MS,
  );
});

/**
 * Maintenance on Today (TD-S4-01 to TD-S4-06), seeded through the module's own
 * commands: the database stamps who reported and who took a room out, and
 * refuses a request with nobody acting.
 */
describe("maintenance", () => {
  const MAINT = randomUUID();
  const URGENT_ROOM = randomUUID();
  const HELD_ROOM = randomUUID();
  const LATE_ROOM = randomUUID();
  const DONE_ROOM = randomUUID();
  const DORM = randomUUID();
  const DORM_BED = randomUUID();
  const suffix = MAINT.slice(0, 8);
  const name = (room: string) => `${room}-${suffix}`;
  const units = {
    urgent: name("MU"),
    held: name("MH"),
    late: name("ML"),
    done: name("MD"),
    dorm: name("MR"),
  };

  const kinds = (summary: Awaited<ReturnType<typeof todayFor>>) =>
    (summary?.attention.items ?? []).map((item) => item.kind);
  const itemFor = (
    summary: Awaited<ReturnType<typeof todayFor>>,
    unitName: string,
  ) =>
    (summary?.attention.items ?? []).filter(
      (item) => item.unit?.unitName === unitName,
    );

  beforeAll(async () => {
    await owner.$executeRawUnsafe(
      `insert into public.entitlements (organization_id, module_key, status)
       values ($1, 'maintenance', 'active')
       on conflict (organization_id, module_key) do nothing`,
      ORG,
    );
    await owner.$executeRawUnsafe(
      `insert into public.properties (id, organization_id, name, timezone)
       values ($1::uuid, $2::uuid, 'Today Maintenance ' || left($1::text, 8),
               'Pacific/Pago_Pago')`,
      MAINT,
      ORG,
    );
    await owner.$executeRawUnsafe(
      `insert into public.property_capabilities
         (property_id, organization_id, capability_key, enabled)
       select $1::uuid, $2::uuid, capability_key, true
         from unnest(array['today', 'front_desk', 'housekeeping',
                           'maintenance']) as capability_key`,
      MAINT,
      ORG,
    );
    await owner.$executeRawUnsafe(
      `insert into public.accommodation_units
         (id, property_id, organization_id, name, unit_type, capacity, floor) values
         ($1, $6, $7, $8, 'room', 2, 1),
         ($2, $6, $7, $9, 'room', 2, 1),
         ($3, $6, $7, $10, 'room', 2, 1),
         ($4, $6, $7, $11, 'room', 2, 1),
         ($5, $6, $7, $12, 'room', 4, 1)`,
      URGENT_ROOM,
      HELD_ROOM,
      LATE_ROOM,
      DONE_ROOM,
      DORM,
      MAINT,
      ORG,
      units.urgent,
      units.held,
      units.late,
      units.done,
      units.dorm,
    );
    await owner.$executeRawUnsafe(
      `insert into public.accommodation_units
         (id, property_id, organization_id, parent_id, parent_unit_type,
          name, unit_type, capacity)
       values ($1, $2, $3, $4, 'room', 'A', 'bed', 1)`,
      DORM_BED,
      MAINT,
      ORG,
      DORM,
    );

    const [today] = await owner.$queryRawUnsafe<{ day: string }[]>(
      "select to_char(app.property_today($1::uuid), 'YYYY-MM-DD') as day",
      MAINT,
    );
    const report = (
      unitId: string,
      title: string,
      priority: "urgent" | "this_week",
      expectedBackOn?: string | null,
    ) =>
      modules.maintenance.report(MANAGER, {
        propertyId: MAINT,
        unitId,
        title,
        priority,
        outOfOrder:
          expectedBackOn === undefined
            ? null
            : { acknowledged: true, expectedBackOn },
      });

    // Urgent and open: one item. Urgent and cancelled, urgent and done: none.
    await report(URGENT_ROOM, "Water through the ceiling", "urgent");
    const twice = await report(URGENT_ROOM, "Water again", "urgent");
    await modules.maintenance.cancel(MANAGER, {
      requestId: twice.requestId,
      from: "new",
      reason: "Reported twice",
    });
    const fixed = await report(URGENT_ROOM, "Dripping tap", "urgent");
    await modules.maintenance.move(MANAGER, {
      requestId: fixed.requestId,
      from: "new",
      to: "done",
    });
    // Out of order with no date, out of order until today, one bed out.
    await report(HELD_ROOM, "Broken window", "this_week", null);
    // A second request holding the same room: counted once, named once.
    await report(HELD_ROOM, "Window frame rotten", "this_week", null);
    await report(LATE_ROOM, "New carpet", "this_week", today!.day);
    await report(DORM_BED, "Bed frame cracked", "this_week", null);
    // Done, and still holding its room: nobody returns it on done here.
    await modules.maintenance.setPropertySettings(MANAGER, MAINT, {
      assigneeRequired: null,
      returnOnDone: false,
      returnAs: null,
    });
    const painted = await report(DONE_ROOM, "Paint drying", "this_week", null);
    await modules.maintenance.move(MANAGER, {
      requestId: painted.requestId,
      from: "new",
      to: "done",
    });

    // The Property moves a day or two ahead, so today's return date passes:
    // Pago Pago to Kiritimati, as maintenance.test.ts does.
    await owner.$executeRawUnsafe(
      "update public.properties set timezone = 'Pacific/Kiritimati' where id = $1::uuid",
      MAINT,
    );
  }, DATABASE_BUDGET_MS * 2);

  it(
    "the_manager_sees_open_maintenance_at_a_glance",
    async () => {
      const summary = await todayFor(MANAGER, MAINT);
      expect(summary?.maintenance).toEqual({
        status: "ok",
        // The open urgent request, the window twice, the carpet and the bed;
        // the cancelled, the done and the painted room are not open.
        data: {
          open: 5,
          new: 5,
          inProgress: 0,
          waitingForParts: 0,
          // Window (held twice), carpet, bed and the painted room: distinct
          // Units held, not holds.
          outOfOrder: 4,
        },
      });
      expect(JSON.stringify(summary)).not.toMatch(/costMinor|vendor|charges/);
      expect(failures).toEqual([]);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "an_open_urgent_request_needs_attention",
    async () => {
      const summary = await todayFor(MANAGER, MAINT);
      expect(
        summary?.attention.items.filter(
          (item) => item.kind === "urgent_repair",
        ),
      ).toEqual([
        expect.objectContaining({
          unit: { unitName: units.urgent, roomName: null },
          request: expect.objectContaining({
            title: "Water through the ceiling",
          }),
        }),
      ]);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_hold_past_its_return_needs_attention_once",
    async () => {
      const summary = await todayFor(MANAGER, MAINT);
      const late = itemFor(summary, units.late);
      expect(late).toHaveLength(1);
      expect(late[0]).toMatchObject({
        kind: "overdue_return",
        request: { title: "New carpet" },
      });
      expect(late[0]?.dueOn! < summary!.day.businessDate).toBe(true);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "out_of_service_from_a_hold_opens_maintenance",
    async () => {
      for (const viewer of [MANAGER, HOUSEKEEPER]) {
        const summary = await todayFor(viewer, MAINT);
        for (const [unitName, title] of [
          [units.held, "Broken window"],
          ["A", "Bed frame cracked"],
          [units.done, "Paint drying"],
        ] as const) {
          expect(itemFor(summary, unitName)).toEqual([
            expect.objectContaining({
              kind: "out_of_service",
              request: expect.objectContaining({ title }),
            }),
          ]);
        }
        expect(
          kinds(summary).filter((kind) => kind === "urgent_repair"),
        ).toHaveLength(1);
        expect(kinds(summary)).toContain("overdue_return");
      }
      const housekeeper = await todayFor(HOUSEKEEPER, MAINT);
      expect(housekeeper && "maintenance" in housekeeper).toBe(false);

      // Finance reads no unit map: only maintenance's own items reach it.
      const finance = await todayFor(FINANCE, MAINT);
      expect(new Set(kinds(finance))).toEqual(
        new Set(["urgent_repair", "overdue_return"]),
      );
      expect(finance && "maintenance" in finance).toBe(false);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "no_maintenance_capability_shows_no_maintenance: a Property without it",
    async () => {
      const summary = await todayFor(MANAGER, PROPERTY);
      expect(summary && "maintenance" in summary).toBe(false);
      expect(kinds(summary)).not.toContain("urgent_repair");
      expect(kinds(summary)).not.toContain("overdue_return");
      for (const item of summary?.attention.items ?? []) {
        expect(item).not.toHaveProperty("request");
      }
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_failed_maintenance_read_leaves_the_rest",
    async () => {
      const report: unknown[] = [];
      const summary = await readTodaySummary(
        {
          ...todayReads(modules, MANAGER),
          maintenance: () => Promise.reject(new Error("down")),
        },
        MAINT,
        CAPABILITIES,
        (section) => report.push(section),
      );
      expect(report).toEqual(["maintenance"]);
      expect(summary?.maintenance).toEqual({ status: "unavailable" });
      expect(summary?.attention.complete).toBe(false);
      expect(summary?.arrivals?.status).toBe("ok");
      const held = itemFor(summary, units.held);
      expect(held).toEqual([
        expect.objectContaining({ kind: "out_of_service" }),
      ]);
      expect(held[0]).not.toHaveProperty("request");
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "no_maintenance_capability_shows_no_maintenance: switched off where it was on",
    async () => {
      await owner.$executeRawUnsafe(
        `update public.property_capabilities set enabled = false
          where property_id = $1::uuid and capability_key = 'maintenance'`,
        MAINT,
      );
      // The requests are still there and the policies still let the manager
      // reach them; only the read's own gate says maintenance is off.
      expect(await modules.maintenance.todayView(MANAGER, MAINT)).toEqual({
        open: { new: 0, in_progress: 0, waiting_for_parts: 0 },
        outOfOrder: 0,
        urgent: [],
        holds: [],
      });
      const summary = await todayFor(MANAGER, MAINT);
      expect(summary && "maintenance" in summary).toBe(false);
      expect(kinds(summary)).not.toContain("urgent_repair");
      expect(kinds(summary)).not.toContain("overdue_return");
      // The rooms are still out of service, and say so plainly.
      const held = itemFor(summary, units.held);
      expect(held).toEqual([
        expect.objectContaining({ kind: "out_of_service" }),
      ]);
      expect(held[0]).not.toHaveProperty("request");
    },
    DATABASE_BUDGET_MS,
  );
});
