/**
 * Today and the room calendar agree about tonight (UX audit, RANZ-51/52/57),
 * against a real database.
 *
 * "Expected tonight" on Today and the first night of "Booked ahead" are two
 * reads of the same fact — which rooms somebody holds tonight — by different
 * code. An overdue Guest holds their room (ADR 0033), so a Property that has
 * one must not be told 33% in one place and 67% in the other.
 *
 * Breaks that were run, and what went red:
 *   an overdue departure counted as leaving tonight          tonight_is_one_number
 *   a booking in a blocked Unit counted as held              tonight_is_one_number
 *   a room with somebody in it counted as ready              ready_is_vacant
 *   the activity read without its floor                      activity_starts_from_yesterday
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The month report is read on a transaction this suite opens, so the
// application's composition is not needed, and cannot be imported here.
vi.mock("../../apps/operator-workspace/src/server/composition", () => ({
  getComposition: () => ({}),
}));
import { createPrismaClient } from "../../packages/db/src";
import { createCoreModule } from "../../packages/ranza/core/src";
import { createAccommodationModule } from "../../packages/ranza/accommodation/src";
import { createBusinessDayModule } from "../../packages/ranza/business-day/src";
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
import { buildMonthReport } from "../../apps/operator-workspace/src/server/analytics";
import { withOrganizationContext } from "../../packages/db/src";

const ORG = randomUUID();
const PROPERTY = randomUUID();
const MANAGER = randomUUID();
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
  businessDay: createBusinessDayModule({ db: prisma }),
};
const CAPABILITIES = {
  frontDesk: { moduleKey: "front_office", capabilityKey: "front_desk" },
  housekeeping: { moduleKey: "housekeeping", capabilityKey: "housekeeping" },
  billing: { moduleKey: "billing_folios", capabilityKey: "finance" },
  maintenance: MAINTENANCE_CAPABILITY,
};

const UNITS = ["UX-1", "UX-2", "UX-3", "UX-4", "UX-5", "UX-6"] as const;

const unitId = (name: string) =>
  owner
    .$queryRawUnsafe<{ id: string }[]>(
      `select id from public.accommodation_units
        where property_id = $1::uuid and name = $2`,
      PROPERTY,
      name,
    )
    .then((rows) => rows[0]!.id);

/** A Guest in house: day offsets from the Property's today. */
async function inHouse(room: string, from: number, to: number) {
  await owner.$executeRawUnsafe(
    `with unit as (
       select id from public.accommodation_units
        where property_id = $2::uuid and name = $3
     ), guest as (
       insert into public.guests (organization_id, full_name)
       values ($1::uuid, 'Guest ' || $3) returning id
     ), reservation as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       select $1::uuid, $2::uuid, unit.id, guest.id, 'guest', 'checked_in',
              app.property_today($2::uuid) + $4::int,
              app.property_today($2::uuid) + $5::int
         from unit, guest
       returning id, accommodation_unit_id
     )
     insert into public.stays
       (organization_id, property_id, accommodation_unit_id, reservation_id,
        stay_type, status, starts_on, ends_on)
     select $1::uuid, $2::uuid, accommodation_unit_id, id, 'guest', 'in_house',
            app.property_today($2::uuid) + $4::int,
            app.property_today($2::uuid) + $5::int
       from reservation`,
    ORG,
    PROPERTY,
    room,
    from,
    to,
  );
}

async function arriving(room: string) {
  await owner.$executeRawUnsafe(
    `with unit as (
       select id from public.accommodation_units
        where property_id = $2::uuid and name = $3
     ), guest as (
       insert into public.guests (organization_id, full_name)
       values ($1::uuid, 'Arrival ' || $3) returning id
     )
     insert into public.reservations
       (organization_id, property_id, accommodation_unit_id, guest_id,
        stay_type, status, starts_on, ends_on)
     select $1::uuid, $2::uuid, unit.id, guest.id, 'guest', 'confirmed',
            app.property_today($2::uuid), app.property_today($2::uuid) + 2
       from unit, guest`,
    ORG,
    PROPERTY,
    room,
  );
}

beforeAll(async () => {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values ($1, $2)`,
    MANAGER,
    `ux-tonight-${MANAGER.slice(0, 8)}@example.test`,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status)
     values ($1, 'Tonight Integration', 'active')`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status) values ($1, 'active')`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key, status)
     select $1::uuid, module_key, 'active'
       from unnest(array['platform_core', 'front_office', 'housekeeping',
                         'billing_folios', 'analytics']) as module_key`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name, timezone)
     values ($1, $2, 'Tonight Property', 'Europe/Istanbul')`,
    PROPERTY,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     select $1::uuid, $2::uuid, capability_key, true
       from unnest(array['today', 'front_desk', 'housekeeping', 'finance',
                         'analytics'])
         as capability_key`,
    PROPERTY,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity, floor)
     select $1::uuid, $2::uuid, name, 'room', 2, 1 from unnest($3::text[]) as name`,
    PROPERTY,
    ORG,
    [...UNITS],
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope)
     values ($1, $2, 'manager', 'organization_wide')`,
    ORG,
    MANAGER,
  );
  // UX-1 an overdue Guest, UX-2 a Guest who stays on, UX-3 a Guest who goes
  // today; UX-4 an arrival; UX-5 a booking in a blocked room; UX-6 out of order.
  await inHouse("UX-1", -12, -10);
  await inHouse("UX-2", -1, 3);
  await inHouse("UX-3", -2, 0);
  await arriving("UX-4");
  await arriving("UX-5");
  await owner.$executeRawUnsafe(
    `update public.accommodation_units set status = 'blocked', status_reason = 'Painting'
      where property_id = $1::uuid and name = 'UX-5'`,
    PROPERTY,
  );
  await owner.$executeRawUnsafe(
    `update public.accommodation_units set status = 'out_of_service'
      where property_id = $1::uuid and name = 'UX-6'`,
    PROPERTY,
  );
  // The overdue Guest's room, and the one who stays on, are both ready on the
  // board: occupied rooms are inspected, and ready for nobody.
  await owner.$executeRawUnsafe(
    `insert into public.housekeeping_unit_status
       (accommodation_unit_id, property_id, organization_id, status)
     select id, property_id, organization_id, 'inspected'
       from public.accommodation_units
      where property_id = $1::uuid and name in ('UX-1', 'UX-2', 'UX-4')`,
    PROPERTY,
  );
}, DATABASE_BUDGET_MS * 3);

afterAll(async () => {
  await prisma.$disconnect();
  await owner.$disconnect();
});

const failures: unknown[] = [];
const today = () =>
  readTodaySummary(
    todayReads(modules, MANAGER),
    PROPERTY,
    CAPABILITIES,
    (section, error) => failures.push({ section, error }),
  );

describe("tonight, on Today and on the room calendar", () => {
  it(
    "tonight_is_one_number: expected tonight is the calendar's first night, counted of the same rooms",
    async () => {
      const summary = await today();
      const calendar = await modules.reservations.listRoomCalendar(
        MANAGER,
        PROPERTY,
        { from: null, days: 7 },
      );
      const tonight = calendar.nights.find(
        (night) => night.day === calendar.today,
      )!;
      expect(summary?.occupancy?.status).toBe("ok");
      if (summary?.occupancy?.status !== "ok") return;
      const card = summary.occupancy.data;

      // Held tonight: the overdue Guest (UX-1), the one staying on (UX-2) and
      // the arrival (UX-4). Not UX-3, who goes; not the booking in the blocked
      // room (UX-5); and the out-of-order room is not a room to hold.
      expect(card.expectedTonight).toBe(3);
      expect(card.available).toBe(4);
      expect(tonight.booked).toBe(card.expectedTonight);
      expect(tonight.booked + tonight.free).toBe(card.available);

      // The booked-ahead card's first night says the same thing.
      expect(
        summary.booked?.status === "ok" && summary.booked.data.nights[0],
      ).toEqual({ day: calendar.today, booked: 3, inUse: 4 });
      expect(failures).toEqual([]);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "tonight_is_one_number_in_the_month_table_too: the table's open day is Today's occupancy",
    async () => {
      const summary = await today();
      expect(summary?.occupancy?.status).toBe("ok");
      if (summary?.occupancy?.status !== "ok") return;
      const card = summary.occupancy.data;
      const report = await withOrganizationContext(
        prisma,
        { userId: MANAGER },
        (tx) => buildMonthReport(tx, PROPERTY, null),
      );
      const row = report?.days.find((day) => day.date === report.today);
      // Six rooms, one blocked and one out of order with nobody in them: four
      // can be let, and one Guest is in house, as Today says.
      expect(card.available).toBe(4);
      expect(row).toMatchObject({
        state: "open",
        availableNights: card.available,
        occupiedNights: card.inHouse,
      });
      expect(row?.occupancyPercent).toBe(
        Math.round((card.inHouse / card.available) * 1000) / 10,
      );
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "ready_is_vacant: a room with a Guest in it is not a ready room",
    async () => {
      const summary = await today();
      expect(summary?.rooms?.status).toBe("ok");
      if (summary?.rooms?.status !== "ok") return;
      // UX-1, UX-2 and UX-4 are inspected; UX-1 and UX-2 have somebody in them.
      const board = await modules.housekeeping.board(MANAGER, PROPERTY);
      expect(
        board.rooms
          .filter((room) => room.ready)
          .map((room) => room.name)
          .sort(),
      ).toEqual(expect.arrayContaining(["UX-1", "UX-2", "UX-4"]));
      const ready = summary.rooms.data.ready;
      expect(ready).toBe(
        board.rooms.filter(
          (room) => room.ready && !room.inHouse && !room.outOfService,
        ).length,
      );
      expect(ready).toBeLessThan(
        board.rooms.filter((room) => room.ready).length,
      );
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "the_overdue_guest_is_ten_days_late_on_the_property_clock",
    async () => {
      const summary = await today();
      expect(summary?.departures).toMatchObject({
        status: "ok",
        data: { overdue: 1, longestOverdueDays: 10 },
      });
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "activity_starts_from_yesterday: a record from last week is not what happened today",
    async () => {
      const record = (daysAgo: number, action: string) =>
        owner.$executeRawUnsafe(
          `insert into audit.records
             (organization_id, location_id, actor_id, action, subject_type,
              subject_id, occurred_at)
           values ($1::uuid, $2::uuid, $3::uuid, $4, 'reservation',
                   gen_random_uuid(), now() - ($5 || ' days')::interval)`,
          ORG,
          PROPERTY,
          MANAGER,
          action,
          String(daysAgo),
        );
      await record(5, "reservation.cancelled");
      await record(0, "reservation.checked_in");

      const summary = await today();
      expect(summary?.activity?.status).toBe("ok");
      if (summary?.activity?.status !== "ok") return;
      const actions = summary.activity.data.rows.map((row) => row.action);
      expect(actions).toContain("reservation.checked_in");
      expect(actions).not.toContain("reservation.cancelled");
    },
    DATABASE_BUDGET_MS,
  );
});
